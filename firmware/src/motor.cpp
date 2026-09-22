#include "motor.h"

#include <Arduino.h>
#include <FastAccelStepper.h>
#include <TMCStepper.h>

namespace {

// Wiring — docs/stacks/firmware-esp32-tmc2209.md "Verkabelung TMC2209 ↔
// ESP32".
constexpr uint8_t kStepPin = 25;
constexpr uint8_t kDirPin = 26;
constexpr uint8_t kEnablePin = 27;
constexpr uint8_t kUartRxPin = 17;
constexpr uint8_t kUartTxPin = 16;

// TMC2209 UART config — same section, "Treiber per UART konfigurieren".
constexpr uint8_t kDriverAddress = 0b00;
constexpr float kRSense = 0.11f;  // BTT TMC2209 V1.3: 0.11 Ohm sense resistors
constexpr uint16_t kRmsCurrentMa = 1700;  // 42BYGHM809 datasheet phase current
constexpr uint16_t kMicrosteps = 16;      // 400 full steps x 16 = 6400 steps/rev

// Motion tuning — same section, "Bewegungssteuerung".
constexpr int32_t kAcceleration = 8000;  // steps/s^2

// Jog speed mapping — design.md "Geschwindigkeits-Mapping (Prozent ->
// Steps/s)": 1-100% maps linearly to 200-4000 steps/s.
constexpr float kJogSpeedMinHz = 200.0f;
constexpr float kJogSpeedMaxHz = 4000.0f;

// Watchdog — design.md AC-6/EC-4: more than ~3 missed 300ms JOG heartbeats
// (1000ms) while running stops the motor on its own.
constexpr unsigned long kWatchdogTimeoutMs = 1000;

TMC2209Stepper driver(&Serial2, kRSense, kDriverAddress);
FastAccelStepperEngine engine = FastAccelStepperEngine();
FastAccelStepper* stepper = nullptr;

// Timestamp (millis()) of the last motorJog() call. Owned entirely by this
// module — motorWatchdogCheck() compares against it, callers (ble.cpp) never
// touch it directly.
unsigned long lastJogMillis = 0;

uint32_t speedPercentToStepsPerSecond(uint8_t speedPercent) {
  if (speedPercent < 1) {
    speedPercent = 1;
  } else if (speedPercent > 100) {
    speedPercent = 100;
  }
  const float speedHz = kJogSpeedMinHz +
      (static_cast<float>(speedPercent - 1) / 99.0f) *
          (kJogSpeedMaxHz - kJogSpeedMinHz);
  return static_cast<uint32_t>(speedHz + 0.5f);
}

}  // namespace

void motorSetup() {
  // EN pin high (driver off) is FastAccelStepper's default before any run
  // is started (setAutoEnable below) — a de-energized motor is the safe
  // default at boot, per the stack pack's "Sicherheit" section.

  Serial2.begin(115200, SERIAL_8N1, /*RX=*/kUartRxPin, /*TX=*/kUartTxPin);
  driver.begin();
  driver.toff(4);
  driver.rms_current(kRmsCurrentMa);
  driver.microsteps(kMicrosteps);
  driver.pwm_autoscale(true);
  driver.en_spreadCycle(false);

  engine.init();
  stepper = engine.stepperConnectToPin(kStepPin);
  if (stepper == nullptr) {
    Serial.println("Motor: stepperConnectToPin failed");
    return;
  }
  stepper->setDirectionPin(kDirPin);
  stepper->setEnablePin(kEnablePin, /*low_active_enables_stepper=*/true);
  stepper->setAutoEnable(true);
  stepper->setAcceleration(kAcceleration);
}

void motorJog(JogDirection direction, uint8_t speedPercent) {
  if (stepper == nullptr) {
    return;
  }

  // setSpeedInHz() only takes effect on the next move()/moveTo()/
  // runForward()/runBackward() call, so set it before (re-)issuing the run —
  // this is what lets an already-running jog pick up a new slider value on
  // its next 300ms heartbeat (design.md "Geschwindigkeitsregler während des
  // Fahrens").
  stepper->setSpeedInHz(speedPercentToStepsPerSecond(speedPercent));

  // runForward()/runBackward() are safe to call again while already running
  // in the same direction (just continues), and reverse cleanly if called
  // while running the other way.
  if (direction == JogDirection::kForward) {
    stepper->runForward();
  } else {
    stepper->runBackward();
  }

  lastJogMillis = millis();
}

void motorStop() {
  if (stepper == nullptr) {
    return;
  }
  // forceStop() halts within ~20ms without a deceleration ramp — the
  // immediate stop STOP/disconnect/watchdog need (design.md "sofortiges
  // Anhalten"), as opposed to stopMove()'s normal deceleration.
  stepper->forceStop();
}

void motorWatchdogCheck() {
  if (stepper == nullptr || !stepper->isRunning()) {
    return;
  }
  if (millis() - lastJogMillis > kWatchdogTimeoutMs) {
    motorStop();
  }
}
