#pragma once

#include <cstdint>

// Motor-control module for the camera slider (PROJ-2: manual jog).
//
// Owns the TMC2209/FastAccelStepper hardware setup, the continuous-run jog
// motion, and the jog watchdog (dead-man's-switch). No BLE/opcode parsing
// lives here — that is ble.cpp's job (see design.md "Grenze zur Firmware").

enum class JogDirection : uint8_t {
  kForward = 0,
  kBackward = 1,
};

// TMCStepper UART config + FastAccelStepper init. Call once from setup().
void motorSetup();

// Starts/continues a continuous run in the given direction at the given
// speed (1-100, mapped linearly to 200-4000 steps/s — see below). Resets
// the internal watchdog timestamp. Safe to call repeatedly while already
// running (e.g. every 300ms from the app's JOG heartbeat).
void motorJog(JogDirection direction, uint8_t speedPercent);

// Stops any ongoing motion immediately.
void motorStop();

// Call from loop(). If the motor is currently running and more than 1000ms
// have passed since the last motorJog() call, stops it automatically (the
// dead-man's-switch — see spec.md AC-6/EC-4 and the stack pack's Watchdog
// section). No-op if the motor isn't running.
void motorWatchdogCheck();
