#pragma once

#include <cstdint>

// Motor-control module for the camera slider (PROJ-2: manual jog; PROJ-3:
// start/end points and automatic drive).
//
// Owns the TMC2209/FastAccelStepper hardware setup, the continuous-run jog
// motion, the absolute-position auto-drive, and the jog watchdog
// (dead-man's-switch). No BLE/opcode parsing lives here — that is ble.cpp's
// job (see design.md "Grenze zur Firmware").

enum class JogDirection : uint8_t {
  kForward = 0,
  kBackward = 1,
};

// TMCStepper UART config + FastAccelStepper init. Call once from setup().
void motorSetup();

// Starts/continues a continuous run in the given direction at the given
// speed (1-100, mapped linearly to 200-8000 steps/s — see below). Resets
// the internal watchdog timestamp. Safe to call repeatedly while already
// running (e.g. every 300ms from the app's JOG heartbeat).
void motorJog(JogDirection direction, uint8_t speedPercent);

// Stops any ongoing motion immediately (jog or auto-drive) and clears this
// module's internal "auto-driving" state, so a subsequent motorAutoDrive()
// call is always treated as starting fresh and motorWatchdogCheck()'s
// jog-guard doesn't think an auto-drive is still active.
void motorStop();

// Call from loop(). If the motor is currently running a JOG (not an
// auto-drive) and more than 1000ms have passed since the last motorJog()
// call, stops it automatically (the dead-man's-switch — see spec.md
// AC-6/EC-4 and the stack pack's Watchdog section). No-op if the motor
// isn't running, or if an auto-drive (motorAutoDrive()) is currently in
// progress — auto-drive is a terminating, self-contained move and does not
// need a continuous heartbeat like jog does (spec.md EC-4).
void motorWatchdogCheck();

// --- PROJ-3: start/end points & automatic drive ---------------------------
//
// Direction mapping: this module reuses JogDirection for motorAutoDrive()'s
// direction, rather than adding a new enum — its two values already line up
// 1:1 with the BLE opcode's direction byte (design.md "Grenze zur
// Firmware": 0x00 = Start->Ende, 0x01 = Ende->Start), so ble.cpp (T4) can
// cast the raw payload byte straight to JogDirection with no translation
// table. For auto-drive specifically:
//   kForward  (0) = drive Start -> Ende (target = the position remembered
//                    by motorSetEnd(), current position must equal the one
//                    remembered by motorSetStart())
//   kBackward (1) = drive Ende -> Start (target/required-current swapped)
// This reuses the enum's *values*, not its jog meaning ("physical forward
// pin direction") — auto-drive picks whichever physical direction gets it
// from the required point to the target point; FastAccelStepper's moveTo()
// figures that out from the absolute target position itself.

// Remembers the stepper's current position (FastAccelStepper::
// getCurrentPosition()) as the start/end reference point. Only meaningful
// in standstill (see the getCurrentPosition() precision caveat in
// motor.cpp) — callers are expected to only call these right after a jog
// stop, per design.md. No-op while the stepper is running. Overwrites any
// previously set point (AC-1/AC-2).
void motorSetStart();
void motorSetEnd();

// PROJ-4: derives the end point from the already-set start point plus a
// distance, instead of reading the carriage's current physical position
// (unlike motorSetEnd() above) — for loading a saved preset, where the
// preset remembers a distance and the user only re-jogs to a fresh start
// point; the firmware computes where the end must be from there.
// endPosition = startPosition +/- distanceSteps, depending on
// endIsAfterStart. No-op (refuses, doesn't set hasEnd) if:
//   - the stepper isn't initialized, or is currently running
//   - autoDriving is true
//   - there is no start point yet (!hasStart)
void motorSetEndFromDistance(bool endIsAfterStart, uint32_t distanceSteps);

// Clears hasStart/hasEnd (and therefore makes atStart/atEnd/distanceSteps
// meaningless until re-set). Called by ble.cpp's onConnect per design.md
// (EC-3: no persistence across an app restart or a BLE reconnect).
void motorClearPoints();

// Starts an automatic move from the current point to the other one.
// durationDeciseconds is the requested duration in tenths of a second
// (matches the BLE AUTO_DRIVE payload's uint16 field). Computes
// speed = distance_steps / duration_seconds internally, using the distance
// between the start/end points this module already knows.
//
// Validates independently of the app (defense in depth, same philosophy as
// the jog speed clamping above) and is a silent no-op — does not start
// anything — if any of these fail:
//   - both points are not set (hasStart && hasEnd)
//   - the stepper is currently moving (jog or another auto-drive — also
//     covers EC-2, no overlapping auto-drive commands, since autoDriving
//     implies isRunning())
//   - the stepper isn't currently at the correct starting point for the
//     requested direction (exact getCurrentPosition() match)
//   - the distance between the two points is 0 (EC-1)
//   - durationDeciseconds is 0
//   - the computed speed is outside 200-8000 steps/s
void motorAutoDrive(JogDirection direction, uint16_t durationDeciseconds);

// Call from loop(). Detects arrival at the target during an active
// auto-drive (the stepper's isRunning() becomes false while this module's
// internal "auto-driving" flag is still set) and clears that internal flag
// when it happens — this is how the firmware notices its own automatic
// move finished, without needing a signal from the app. No-op if no
// auto-drive is in progress.
void motorAutoDriveCheck();

// Status snapshot for the BLE layer to build its Status-Characteristic
// notify payload from (ble.cpp owns the actual Characteristic and byte
// layout; this function only hands it the data — see design.md's
// Status-Characteristic byte table).
//
//   hasStart / hasEnd    — whether motorSetStart()/motorSetEnd() have been
//                          called since the last motorClearPoints()
//   atStart / atEnd      — the stepper is currently standing exactly at the
//                          remembered start/end point (always false while
//                          the stepper is running — position can't be read
//                          precisely then, see the getCurrentPosition()
//                          caveat in motor.cpp, and "at a point" isn't
//                          meaningful mid-move anyway)
//   driving              — an auto-drive is currently in progress
//   distanceSteps        — |endPosition - startPosition|; only meaningful
//                          when both hasStart and hasEnd are true
//   endIsAfterStart      — true when endPosition >= startPosition; only
//                          meaningful when both hasStart and hasEnd are true
//   timelapseMoving      — a motorTimelapseMoveTo() move is currently in
//                          progress (design.md "Status-Characteristic", NEU
//                          Bit 5) — independent of `driving`, since the two
//                          movement kinds are mutually exclusive but each
//                          gets its own status bit
struct MotorStatus {
  bool hasStart;
  bool hasEnd;
  bool atStart;
  bool atEnd;
  bool driving;
  uint32_t distanceSteps;
  bool endIsAfterStart;
  bool timelapseMoving;
  // PROJ-6: movement is locked out after a low-battery protective stop
  // (motorLockout()) — only a reboot clears it.
  bool locked;
  // PROJ-6: the stepper is currently moving (any kind of motion, jog
  // included) — lets the app dim the battery reading, which is only
  // refreshed in standstill.
  bool moving;
};

MotorStatus motorGetStatus();

// --- PROJ-5: Zeitraffer intermediate-step movement -------------------------
//
// design.md "Warum eine neue Bewegungsart in der Firmware nötig ist":
// motorAutoDrive() only ever moves between the two *registered* points
// (startPosition/endPosition) and requires the carriage to stand exactly at
// one of them. A timelapse sequence with N shots needs N-1 moves to N-1
// distinct intermediate points between start and end, and reusing
// motorSetEndFromDistance() (PROJ-4) to walk endPosition forward at each
// step would overwrite the user's real, registered end point — losing it
// for the final return-to-start move (spec.md AC-2). This movement kind is
// therefore purely additive: it never touches startPosition, endPosition or
// hasEnd, only reads startPosition as its reference.

// Starts a direct move from the current position to
// startPosition +/- distanceSteps (same sign convention as
// motorSetEndFromDistance(): endIsAfterStart true = +distanceSteps).
// Deliberately does not require the carriage to currently stand at
// startPosition (unlike motorAutoDrive()'s exact-position guard) — a
// timelapse sequence calls this repeatedly from wherever the previous step
// left off.
//
// Silent no-op (does not start anything) if any of these hold:
//   - the stepper isn't initialized, or is currently running
//   - autoDriving is true (mutual exclusion — both movement kinds share the
//     same motor, design.md "Umgekehrter Schutz")
//   - a timelapse move is already in progress (timelapseMoving)
//   - there is no start point yet (!hasStart) — no reference to move from
//   - distanceSteps exceeds kMaxPlausibleDistanceSteps (the same
//     plausibility bound as motorSetEndFromDistance(), PROJ-4's BUG-1 fix —
//     reused as-is, not duplicated under a second constant)
//
// Speed is the fixed kJogSpeedMaxHz (8000 steps/s) — a technical constant,
// not a user-facing setting (design.md: "kein neues Tuning, keine neue
// Nutzer-Einstellung").
void motorTimelapseMoveTo(bool endIsAfterStart, uint32_t distanceSteps);

// Call from loop() (main.cpp — qa-report.md BUG-1: this call was missing
// entirely until the QA fix; no task in tasks.md had wired it up).
// Analogous to motorAutoDriveCheck(): detects arrival (isRunning() becomes
// false while timelapseMoving is still true) and clears timelapseMoving
// when it happens, after the same start grace period motorAutoDriveCheck()
// uses (see motorTimelapseMoveTo()'s doc comment on
// timelapseMoveStartMillis in motor.cpp for why the grace period exists).
// No-op if no timelapse move is in progress.
void motorTimelapseMoveCheck();

// --- PROJ-6: low-battery protective lockout ----------------------------------
//
// design.md "Schutz-Stopp-Logik": sets a RAM-only lock flag first, then
// stops any motion (motorStop()). While locked, motorJog(), motorAutoDrive()
// and motorTimelapseMoveTo() reject every request. Only a reboot of the
// ESP32 clears the lock (spec.md AC-8, EC-3) — there is deliberately no
// unlock function.
void motorLockout();

// True once motorLockout() has been called since boot.
bool motorIsLocked();

// True while the stepper is moving (queue running, ramp active or commands
// still queued). battery.cpp uses it to decide whether the display reading
// may be refreshed and to re-stop a stepper that is running despite the
// lock (race guard, design.md Technical Decisions).
bool motorIsRunning();
