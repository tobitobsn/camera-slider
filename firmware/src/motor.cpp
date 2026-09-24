#include "motor.h"

#include <Arduino.h>
#include <FastAccelStepper.h>
#include <TMCStepper.h>

#include <math.h>

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
//
// PROJ-3 bug hunt: this and every other flag/value below is written from the
// NimBLE host task's onWrite()/onConnect() callbacks (ble.cpp) and read from
// the main loop() task (motorWatchdogCheck(), motorAutoDriveCheck(),
// bleNotifyStatusIfChanged() -> motorGetStatus()) — two different FreeRTOS
// tasks. Without `volatile`, the compiler is free to cache a value read
// earlier in one task instead of re-reading it after the other task wrote a
// new one, and nothing guarantees the write is even visible across cores
// promptly. This was flagged as a low-risk theoretical concern for this
// exact variable during PROJ-2's QA (BUG-6) and dismissed as unlikely to
// matter — PROJ-3's own hardware test then hit the *same* class of bug for
// real on startPosition/endPosition/hasStart/hasEnd (a stale distance value
// sent right after motorSetEnd(), see qa-report.md), so this fixes it here
// too rather than carrying the same risk forward silently a second time.
volatile unsigned long lastJogMillis = 0;

// Tracks whether motorJog() currently has a continuous run started, and in
// which direction — FastAccelStepper's isRunning() only reports *whether*
// something is moving, not *which way* (verified against the vendored
// header, see design.md BUG-2 entry). Reset by motorStop() so the next
// motorJog() call after a stop is always treated as "starting fresh".
volatile bool jogRunning = false;
volatile JogDirection jogRunningDirection = JogDirection::kForward;

// --- PROJ-3: start/end points & automatic drive ---------------------------

// Start-/end reference points, in the stepper's absolute step coordinate
// (FastAccelStepper::getCurrentPosition()). Only meaningful while the
// matching hasStart/hasEnd flag is true — see motorClearPoints() (EC-3).
volatile bool hasStart = false;
volatile bool hasEnd = false;
volatile int32_t startPosition = 0;
volatile int32_t endPosition = 0;

// True from a validated motorAutoDrive() call until motorAutoDriveCheck()
// notices the stepper has arrived (isRunning() becomes false), or until
// motorStop() cancels it early. motorWatchdogCheck() must not trigger while
// this is true (EC-4 — auto-drive doesn't need a continuous heartbeat like
// jog does).
volatile bool autoDriving = false;

// millis() timestamp of the motorAutoDrive() call that set autoDriving=true.
// PROJ-3 bug hunt: `autoDriving = true` is set *before* `moveTo()` is
// called, and moveTo() likely only schedules the move (ramp generator/ISR)
// rather than making isRunning() true synchronously within the same
// function call — on the loop() task, motorAutoDriveCheck() could
// theoretically run in that brief gap, see isRunning()==false, and
// misinterpret "hasn't started yet" as "already arrived", clearing
// autoDriving early. Once that happens, motorWatchdogCheck() then sees a
// genuinely running stepper with autoDriving now (wrongly) false and a
// stale lastJogMillis, and stops it — the motor is heard only briefly
// before an unrelated watchdog stop cuts it off. kAutoDriveStartGraceMs
// below closes this window.
volatile unsigned long autoDriveStartMillis = 0;
constexpr unsigned long kAutoDriveStartGraceMs = 100;

// The shared 200-4000 steps/s range (spec.md Technical Requirements: "muss
// innerhalb 200-4000 Steps/s liegen (derselbe Bereich wie PROJ-2s Jog)") is
// already captured by kJogSpeedMinHz/kJogSpeedMaxHz above — reused here
// as-is rather than duplicated under a second name.

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
  // qa-report.md BUG-1: a JOG arriving while an auto-drive is in progress
  // used to turn moveTo()'s targeted move into an unbounded continuous run
  // (runForward()/runBackward() supersede a moveTo(), FastAccelStepper.h),
  // and since autoDriving stayed true, both motorAutoDriveCheck()'s arrival
  // detection (isRunning() never goes false again) and
  // motorWatchdogCheck()'s 1s timeout (returns early while autoDriving) went
  // silent — the motor then only stopped on an explicit STOP or a full
  // disconnect. Same defense-in-depth the firmware already applies to
  // motorSetStart()/motorSetEnd() via their isRunning() guard.
  if (stepper == nullptr || autoDriving) {
    return;
  }

  // setSpeedInHz() only takes effect once one of move()/moveTo()/
  // runForward()/runBackward()/applySpeedAcceleration()/moveByAcceleration()
  // is called afterwards (FastAccelStepper.h, "## Speed" doc comment) — set
  // it before (re-)issuing whichever of those this call needs.
  stepper->setSpeedInHz(speedPercentToStepsPerSecond(speedPercent));

  const bool alreadyRunningSameDirection =
      jogRunning && jogRunningDirection == direction;

  if (alreadyRunningSameDirection) {
    // Repeated 300ms JOG heartbeat while the button stays held and the run
    // is already going the same way: only the speed may have changed.
    // applySpeedAcceleration() is FastAccelStepper's documented mechanism
    // for pushing a new speed/acceleration value into an already-running
    // continuous move (FastAccelStepper.h: "This is convenient especially,
    // if the stepper is set to continuous running.") — design.md BUG-2.
    stepper->applySpeedAcceleration();
  } else {
    // First call for this direction (motor idle, or running the other way):
    // (re-)start the continuous run so it picks up the speed just set.
    // runForward()/runBackward() reverse cleanly if the motor is currently
    // running the other way (FastAccelStepper.h, runForward()/runBackward()
    // doc comment).
    if (direction == JogDirection::kForward) {
      stepper->runForward();
    } else {
      stepper->runBackward();
    }
    jogRunning = true;
    jogRunningDirection = direction;
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

  // The next motorJog() call, whatever direction, must be treated as
  // starting fresh (calls runForward()/runBackward()), not as "already
  // running" — otherwise it would try applySpeedAcceleration() on a motor
  // that isn't moving.
  jogRunning = false;

  // Whichever mode was running (jog or auto-drive), it just got stopped —
  // the next motorAutoDrive() call must always be treated as starting
  // fresh, and motorWatchdogCheck()'s jog-guard must not keep thinking an
  // auto-drive is still active (design.md motorStop() entry).
  autoDriving = false;
}

void motorWatchdogCheck() {
  if (stepper == nullptr) {
    return;
  }
  if (autoDriving) {
    // EC-4: an auto-drive is a terminating, self-contained move — it
    // doesn't send a continuous heartbeat like jog does, so the jog
    // watchdog must stay quiet while it's in progress. Checked before
    // isRunning() (PROJ-3 bug hunt) so this guard depends on a single
    // variable's visibility, not on isRunning() and autoDriving agreeing.
    return;
  }
  if (!stepper->isRunning()) {
    return;
  }
  if (millis() - lastJogMillis > kWatchdogTimeoutMs) {
    motorStop();
  }
}

// --- PROJ-3: start/end points & automatic drive ---------------------------

void motorSetStart() {
  // getCurrentPosition() is only precise in standstill on ESP32 (see the
  // doc comment on the vendored FastAccelStepper header) — refuse to read
  // it while something is moving rather than remember a wrong position.
  if (stepper == nullptr || stepper->isRunning()) {
    return;
  }
  startPosition = stepper->getCurrentPosition();
  hasStart = true;
}

void motorSetEnd() {
  if (stepper == nullptr || stepper->isRunning()) {
    return;
  }
  endPosition = stepper->getCurrentPosition();
  hasEnd = true;
}

void motorClearPoints() {
  hasStart = false;
  hasEnd = false;
}

void motorAutoDrive(JogDirection direction, uint16_t durationDeciseconds) {
  if (stepper == nullptr || autoDriving || !hasStart || !hasEnd ||
      stepper->isRunning() || durationDeciseconds == 0) {
    // autoDriving true covers EC-2 (no overlapping auto-drive requests).
    // stepper->isRunning() true also rejects a request that arrives while
    // a jog is still going — reading getCurrentPosition() while running
    // isn't precise enough to validate "stands exactly at the point".
    return;
  }

  const bool startToEnd = direction == JogDirection::kForward;
  const int32_t requiredCurrentPosition =
      startToEnd ? startPosition : endPosition;
  const int32_t targetPosition = startToEnd ? endPosition : startPosition;
  const int32_t actualCurrentPosition = stepper->getCurrentPosition();

  if (actualCurrentPosition != requiredCurrentPosition) {
    // Not standing exactly at the starting point for this direction
    // (AC-8/design.md "Auto-Fahrt nur auslösbar ... exakt am Startpunkt").
    return;
  }

  const int32_t signedDistance = targetPosition - requiredCurrentPosition;
  const uint32_t distanceSteps = static_cast<uint32_t>(
      signedDistance < 0 ? -signedDistance : signedDistance);
  if (distanceSteps == 0) {
    // EC-1: start and end are identical.
    return;
  }

  const float durationSeconds =
      static_cast<float>(durationDeciseconds) / 10.0f;

  // qa-report.md BUG-2: speed = distance/duration ignores the acceleration
  // ramp, so the real trapezoidal move (accelerate, cruise, decelerate)
  // takes longer than the requested duration by roughly speed/kAcceleration
  // on each end — spec.md's Decision Log explicitly rules out a silent
  // deviation from the entered duration. Solve for the cruise speed that
  // makes the *actual* trapezoidal time equal durationSeconds instead:
  //   durationSeconds = distance/speed + speed/a
  //   speed^2 - (a*durationSeconds)*speed + a*distance = 0
  // The smaller root is the physically valid one (keeps speed^2/a <=
  // distance, i.e. a genuine trapezoidal profile with a flat cruise
  // portion rather than a triangular one); it converges to the old
  // distance/duration formula as the ramp time becomes negligible. A
  // negative discriminant means durationSeconds is below the absolute
  // minimum time reachable at this acceleration for this distance
  // (2*sqrt(distance/a), the pure-triangular case) — impossible at any
  // speed, not just outside the 200-4000 steps/s range.
  const float aTimesDuration = static_cast<float>(kAcceleration) * durationSeconds;
  const float discriminant = aTimesDuration * aTimesDuration -
      4.0f * static_cast<float>(kAcceleration) * static_cast<float>(distanceSteps);
  if (discriminant < 0.0f) {
    // AC-6: duration too short to reach even at the fastest possible speed.
    return;
  }
  // qa-report.md BUG-3 (residual after the first fix): (aT - sqrt(disc))/2
  // subtracts two nearly-equal large values whenever the ramp time is small
  // relative to durationSeconds (the common case — long, slow drives near
  // the 200 steps/s floor), losing precision to catastrophic cancellation.
  // The app (src/components/AutoDriveControls.tsx) validates the identical
  // duration against the identical formula, so any extra imprecision here
  // is exactly what makes a value the app accepted get silently rejected.
  // Using the product-of-roots identity (v_small * v_large = a*distance,
  // Vieta's formulas) instead avoids the subtraction entirely — the sum
  // aTimesDuration + sqrt(discriminant) never cancels.
  const float speedHz = (2.0f * static_cast<float>(kAcceleration) * static_cast<float>(distanceSteps)) /
      (aTimesDuration + sqrtf(discriminant));
  if (speedHz < kJogSpeedMinHz || speedHz > kJogSpeedMaxHz) {
    // AC-6: requested duration would need a speed outside 200-4000 steps/s.
    return;
  }

  // setSpeedInHz() only takes effect once move()/moveTo()/... is called
  // afterwards (see motorJog() above and FastAccelStepper.h) — set it
  // before moveTo().
  stepper->setSpeedInHz(static_cast<uint32_t>(speedHz + 0.5f));
  // Write order matters across the loop()/BLE-host task boundary (PROJ-3
  // bug hunt, second race found on hardware): autoDriveStartMillis is
  // written *before* autoDriving is published, so any task that observes
  // autoDriving==true is guaranteed to see a fresh autoDriveStartMillis too
  // — never the previous drive's stale timestamp, which would let
  // motorAutoDriveCheck()'s grace-period check read a huge elapsed time and
  // wrongly clear autoDriving before moveTo() below ever starts the move
  // (observed on hardware: the watchdog then stops the motor within one
  // loop() iteration — heard as a brief twitch). autoDriving is still
  // published before moveTo() so motorWatchdogCheck()'s guard is already
  // active once the stepper can possibly start running.
  autoDriveStartMillis = millis();
  autoDriving = true;
  stepper->moveTo(targetPosition, /*blocking=*/false);
}

void motorAutoDriveCheck() {
  if (stepper == nullptr || !autoDriving) {
    return;
  }
  // Grace period (see autoDriveStartMillis above): don't trust
  // isRunning()==false as "arrived" until the move has genuinely had a
  // chance to start.
  if (millis() - autoDriveStartMillis < kAutoDriveStartGraceMs) {
    return;
  }
  if (!stepper->isRunning()) {
    // Arrived at the target on its own — no signal from the app needed.
    autoDriving = false;
  }
}

MotorStatus motorGetStatus() {
  // Snapshot every shared flag/value into plain locals with a single read
  // each, right at the top — belt-and-suspenders on top of `volatile` above.
  // `volatile` fixes the cross-task staleness that actually caused the
  // observed bug (a whole stale value surviving across loop() iterations);
  // this snapshot additionally closes the much narrower window where a
  // write from the BLE host task could land *between* two separate reads
  // within this one function (e.g. endPosition read once for the distance
  // calculation, then read again for the atEnd comparison, with a write
  // landing in between) — every calculation below now reads each shared
  // variable exactly once and reuses the same local value throughout.
  const bool snapHasStart = hasStart;
  const bool snapHasEnd = hasEnd;
  const bool snapAutoDriving = autoDriving;
  const int32_t snapStartPosition = startPosition;
  const int32_t snapEndPosition = endPosition;

  MotorStatus status{};
  status.hasStart = snapHasStart;
  status.hasEnd = snapHasEnd;
  status.driving = snapAutoDriving;

  if (snapHasStart && snapHasEnd) {
    const int32_t signedDistance = snapEndPosition - snapStartPosition;
    status.distanceSteps = static_cast<uint32_t>(
        signedDistance < 0 ? -signedDistance : signedDistance);
  } else {
    status.distanceSteps = 0;
  }

  // Only read/compare the live position in standstill — same precision
  // caveat as motorSetStart()/motorSetEnd(). While running, the stepper
  // can't meaningfully be "at" either point anyway.
  const bool canReadPosition = stepper != nullptr && !stepper->isRunning();
  if (canReadPosition) {
    const int32_t currentPosition = stepper->getCurrentPosition();
    status.atStart = snapHasStart && currentPosition == snapStartPosition;
    status.atEnd = snapHasEnd && currentPosition == snapEndPosition;
  } else {
    status.atStart = false;
    status.atEnd = false;
  }

  return status;
}
