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

// qa-report.md BUG-3 (residual after the numerically-stable-form fix):
// this file's float32 and src/components/AutoDriveControls.tsx's double
// can still land on opposite sides of kJogSpeedMinHz/kJogSpeedMaxHz for a
// duration whose *exact* value sits right on the boundary — literally
// different floating-point numbers for the same decimal input (e.g. 8.1f
// vs 8.1 as a double), independent of the cancellation the stable form
// already fixed. Re-verification found real cases a few hundredths of a
// step/s off. A small symmetric tolerance, mirrored exactly in
// AutoDriveControls.tsx, absorbs that; it doesn't move the actual
// commanded speed (motorAutoDrive() rounds to the nearest integer Hz
// before calling setSpeedInHz() — well inside a 0.5 Hz margin).
// qa-report.md BUG-7 re-verification round 3 (NEU-D): 0.01 still clears
// the actual float32 error (roughly 1e-5 to 4e-4 across the 200-4000
// range) by a wide margin, while barely nudging the duration range
// AutoDriveControls.tsx displays to the user away from what it actually
// accepts — a larger tolerance (0.1, the first value tried) widened that
// gap far more than the precision problem it was closing required.
constexpr float kAutoDriveSpeedToleranceHz = 0.01f;

// Watchdog — design.md AC-6/EC-4: more than ~3 missed 300ms JOG heartbeats
// (1000ms) while running stops the motor on its own.
constexpr unsigned long kWatchdogTimeoutMs = 1000;

// qa-report.md BUG-1 (PROJ-4): motorSetEndFromDistance() derives endPosition
// from startPosition + a distance the carriage was never physically driven
// to, unlike motorSetEnd() (which always reads a position the carriage
// actually stands at). Without a home reference this firmware cannot know
// whether the derived point is still physically on the rail (see
// docs/data-model.md — only relative distance is ever trusted, never an
// absolute position) — but it CAN reject a distance that is larger than the
// entire rail could ever be, which is always wrong regardless of where the
// current start position sits. This is therefore a plausibility check, not
// a real software endstop (docs/stacks/firmware-esp32-tmc2209.md's
// "Software-Endanschläge" describes the latter — a minSteps/maxSteps clamp
// on every moveTo(), from an actual home position; that is a larger,
// separate change this fix does not attempt). qa-report.md re-verification
// NEU-1 (PROJ-4): the first version of this constant used the stack pack's
// generic example formula literally ("200 full steps x 16") instead of this
// project's own, already-documented motor — the 42BYGHM809 is 0.9 deg/step,
// i.e. 400 full steps/rev (docs/PRD.md, and this file's own kMicrosteps
// comment above: "400 full steps x 16 = 6400 steps/rev"). Correct: 6400
// steps/rev / (20 teeth * 2mm GT2 pitch) = 160 steps/mm. (The stack pack's
// own formula at docs/stacks/firmware-esp32-tmc2209.md's "Kalibrierung /
// Steps-pro-mm" section still says 200 and contradicts that same file's
// motor spec a few lines above it — worth fixing there too, out of scope
// for this constant.) Measured 2026-09-24: 480mm usable travel -> 76800.
// Re-measured 2026-09-26 after the user rebuilt the rig to 1000mm usable
// travel, same GT2 20-tooth pulley (steps/mm unchanged): 1000 * 160 =
// 160000. A side effect: this also closes qa-report.md BUG-2 (the unchecked
// static_cast<int32_t> of a uint32_t distanceSteps that could exceed
// INT32_MAX) — any value large enough to overflow is already far past this
// bound and rejected first.
constexpr uint32_t kMaxPlausibleDistanceSteps = 160000;

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

// --- PROJ-5: Zeitraffer intermediate-step movement -------------------------
//
// True from a validated motorTimelapseMoveTo() call until
// motorTimelapseMoveCheck() notices the stepper has arrived (isRunning()
// becomes false), or until motorStop() cancels it early — same lifecycle as
// autoDriving above, kept as its own flag rather than reusing autoDriving
// because the two movement kinds are mutually exclusive but distinguishable
// on the Status-Characteristic (design.md: separate bit 5) and because
// motorAutoDrive()'s own exact-position guard must not apply here (design.md
// "Warum eine neue Bewegungsart in der Firmware nötig ist").
volatile bool timelapseMoving = false;

// millis() timestamp of the motorTimelapseMoveTo() call that set
// timelapseMoving=true. Same race and same fix as autoDriveStartMillis
// above (PROJ-3 bug hunt, see the comment there): timelapseMoving is set
// *before* stepper->moveTo() is called, but moveTo() likely only schedules
// the move rather than making isRunning() true synchronously — without a
// grace period, motorTimelapseMoveCheck() running on the loop() task could
// see isRunning()==false in that brief gap and misinterpret "hasn't started
// yet" as "already arrived", clearing timelapseMoving before the move ever
// gets going. kAutoDriveStartGraceMs already covers exactly this window;
// reused here rather than duplicated under a second constant, since the
// underlying race is identical.
volatile unsigned long timelapseMoveStartMillis = 0;

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
  //
  // qa-report.md BUG-4 (PROJ-5): the same class of bug for the newer
  // timelapseMoving flag — this guard originally checked only autoDriving,
  // so a JOG arriving while a TIMELAPSE_MOVE was in progress (e.g. during
  // the app's confirmation-timeout window, BUG-5/BUG-6) turned it into an
  // unbounded continuous run the same way, with the same silent-watchdog
  // consequence.
  if (stepper == nullptr || autoDriving || timelapseMoving) {
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
    //
    // qa-report.md BUG-16 (PROJ-2): runForward()/runBackward() return an
    // int8_t (MOVE_OK == 0, or a MOVE_ERR_* code, FastAccelStepper.h) that
    // was previously discarded — jogRunning was set to true unconditionally,
    // even on a failed start. Every following 300ms heartbeat then took the
    // "already running, same direction" branch above (applySpeedAcceleration()
    // on a stepper that was never actually running), so a single failed
    // start-of-run request left jog permanently unresponsive in that
    // direction until an unrelated STOP/motorStop() reset jogRunning — no
    // watchdog catch either, since isRunning() correctly reports false the
    // whole time. Reported live on hardware, specifically and repeatably
    // right after an AUTO_DRIVE: only setting jogRunning on a successful
    // start means a failed attempt is retried from scratch on the very next
    // heartbeat instead of getting stuck.
    const int8_t startResult = direction == JogDirection::kForward
                                    ? stepper->runForward()
                                    : stepper->runBackward();
    if (startResult == 0) {
      jogRunning = true;
      jogRunningDirection = direction;
    } else {
      // Kept as a permanent (not one-off) diagnostic — same pattern as the
      // stepperConnectToPin() failure log above in this file. Cheap (only
      // on the error path, never on the normal 300ms heartbeat) and the
      // only way to ever confirm this path fires again on real hardware.
      Serial.printf("Motor: jog start failed, MOVE_ERR=%d\n", startResult);
    }
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

  // design.md "STOP (0x05) hält zusätzlich ... jetzt auch eine laufende
  // Zeitraffer-Bewegung sofort an" — same reasoning as autoDriving above:
  // the next motorTimelapseMoveTo() call must be treated as starting fresh.
  timelapseMoving = false;
}

void motorWatchdogCheck() {
  if (stepper == nullptr) {
    return;
  }
  if (autoDriving || timelapseMoving) {
    // EC-4: an auto-drive (or, PROJ-5, a timelapse intermediate-step move)
    // is a terminating, self-contained move — it doesn't send a continuous
    // heartbeat like jog does, so the jog watchdog must stay quiet while
    // either is in progress. Checked before isRunning() (PROJ-3 bug hunt)
    // so this guard depends on a single variable's visibility, not on
    // isRunning() and autoDriving/timelapseMoving agreeing.
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

void motorSetEndFromDistance(bool endIsAfterStart, uint32_t distanceSteps) {
  if (stepper == nullptr || stepper->isRunning() || autoDriving || !hasStart ||
      distanceSteps > kMaxPlausibleDistanceSteps) {
    return;
  }
  endPosition = startPosition +
      (endIsAfterStart ? static_cast<int32_t>(distanceSteps)
                        : -static_cast<int32_t>(distanceSteps));
  hasEnd = true;
}

void motorClearPoints() {
  hasStart = false;
  hasEnd = false;
}

void motorAutoDrive(JogDirection direction, uint16_t durationDeciseconds) {
  if (stepper == nullptr || autoDriving || timelapseMoving || !hasStart ||
      !hasEnd || stepper->isRunning() || durationDeciseconds == 0) {
    // autoDriving true covers EC-2 (no overlapping auto-drive requests).
    // timelapseMoving true is the PROJ-5 mutual exclusion (design.md
    // "Umgekehrter Schutz") — both movement kinds share the same motor.
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
  if (speedHz < kJogSpeedMinHz - kAutoDriveSpeedToleranceHz ||
      speedHz > kJogSpeedMaxHz + kAutoDriveSpeedToleranceHz) {
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

// --- PROJ-5: Zeitraffer intermediate-step movement -------------------------

void motorTimelapseMoveTo(bool endIsAfterStart, uint32_t distanceSteps) {
  if (stepper == nullptr || stepper->isRunning() || autoDriving ||
      timelapseMoving || !hasStart ||
      distanceSteps > kMaxPlausibleDistanceSteps) {
    // autoDriving true is the PROJ-5 mutual exclusion (design.md
    // "Umgekehrter Schutz") — both movement kinds share the same motor.
    // Deliberately does NOT check the carriage's current position against
    // startPosition (unlike motorAutoDrive()'s exact-position guard) — a
    // timelapse sequence calls this repeatedly from wherever the previous
    // step left off, not always from startPosition itself.
    return;
  }

  // Same sign convention as motorSetEndFromDistance() (motor.h doc comment,
  // and that function a few lines above) — deliberately does not touch
  // startPosition, endPosition or hasEnd (design.md "Warum eine neue
  // Bewegungsart in der Firmware nötig ist": those stay reserved for the
  // user's own registered points, untouched by intermediate timelapse
  // steps).
  const int32_t targetPosition = startPosition +
      (endIsAfterStart ? static_cast<int32_t>(distanceSteps)
                        : -static_cast<int32_t>(distanceSteps));

  // Fixed technical speed, not a user-facing setting (design.md: "kein
  // neues Tuning, keine neue Nutzer-Einstellung") — same constant
  // motorJog()'s fastest jog speed uses.
  stepper->setSpeedInHz(static_cast<uint32_t>(kJogSpeedMaxHz + 0.5f));

  // Write order matters across the loop()/BLE-host task boundary — same
  // reasoning as motorAutoDrive()'s autoDriveStartMillis/autoDriving pair
  // above (PROJ-3 bug hunt): timelapseMoveStartMillis is written *before*
  // timelapseMoving is published, so any task that observes
  // timelapseMoving==true is guaranteed to see a fresh
  // timelapseMoveStartMillis too, never a previous move's stale timestamp —
  // which would let motorTimelapseMoveCheck()'s grace-period check read a
  // huge elapsed time and wrongly clear timelapseMoving before moveTo()
  // below ever starts the move. timelapseMoving is still published before
  // moveTo() so motorWatchdogCheck()'s guard is already active once the
  // stepper can possibly start running.
  timelapseMoveStartMillis = millis();
  timelapseMoving = true;
  stepper->moveTo(targetPosition, /*blocking=*/false);
}

void motorTimelapseMoveCheck() {
  if (stepper == nullptr || !timelapseMoving) {
    return;
  }
  // Grace period (see timelapseMoveStartMillis above): don't trust
  // isRunning()==false as "arrived" until the move has genuinely had a
  // chance to start. Same constant motorAutoDriveCheck() uses — identical
  // race, no reason for a second value.
  if (millis() - timelapseMoveStartMillis < kAutoDriveStartGraceMs) {
    return;
  }
  if (!stepper->isRunning()) {
    // Arrived at the target on its own — no signal from the app needed.
    timelapseMoving = false;
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
  const bool snapTimelapseMoving = timelapseMoving;
  const int32_t snapStartPosition = startPosition;
  const int32_t snapEndPosition = endPosition;

  MotorStatus status{};
  status.hasStart = snapHasStart;
  status.hasEnd = snapHasEnd;
  status.driving = snapAutoDriving;
  status.timelapseMoving = snapTimelapseMoving;

  if (snapHasStart && snapHasEnd) {
    const int32_t signedDistance = snapEndPosition - snapStartPosition;
    status.distanceSteps = static_cast<uint32_t>(
        signedDistance < 0 ? -signedDistance : signedDistance);
    status.endIsAfterStart = snapEndPosition >= snapStartPosition;
  } else {
    status.distanceSteps = 0;
    status.endIsAfterStart = false;
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
