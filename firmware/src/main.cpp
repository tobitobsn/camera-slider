#include <Arduino.h>

#include "ble.h"
#include "motor.h"

// The standard ESP32 dev-board BOOT button — GPIO0, pulled up on-board,
// pulled to ground while held. Not otherwise used by this project
// (motor.cpp's pins are 16/17/25/26/27). qa-report.md BUG-7 re-verification
// (NEU-1): the sole escape hatch for a bond slot stuck on the wrong device
// now that ble.cpp no longer evicts it automatically — see bleSetup()'s
// resetBonds parameter.
constexpr uint8_t kBootButtonPin = 0;

// qa-report.md BUG-7 re-verification round 2 (NEU-A): GPIO0 is also a
// strapping pin the ESP32's ROM bootloader samples at the reset/power-on
// instant itself — held low exactly then, the chip enters UART download
// mode and never runs this code at all, so "hold BOOT while powering on"
// (the first version of this fix) could never actually trigger. Once the
// app is running, GPIO0's strapping role is over and it is a perfectly
// ordinary GPIO (the same reasoning countless Arduino sketches rely on to
// reuse this button) — polling it for a short window *after* setup() has
// already started sidesteps the ROM's sampling instant entirely, so the
// gesture is now "power on normally, then press BOOT within two seconds".
constexpr unsigned long kBootButtonWindowMs = 2000;

bool waitForBootButtonHeld() {
  const unsigned long windowStart = millis();
  while (millis() - windowStart < kBootButtonWindowMs) {
    if (digitalRead(kBootButtonPin) == LOW) {
      return true;
    }
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  pinMode(kBootButtonPin, INPUT_PULLUP);
  Serial.println("Press BOOT within 2s to reset all stored BLE bonds...");
  const bool resetBonds = waitForBootButtonHeld();
  bleSetup(resetBonds);
  motorSetup();
}

void loop() {
  motorWatchdogCheck();
  motorAutoDriveCheck();
  // qa-report.md BUG-1 (PROJ-5): this call was missing entirely — no task
  // in tasks.md ever added it (T1 built motorTimelapseMoveCheck() but was
  // explicitly told not to touch this file; T4 wired the BLE opcode, not
  // loop()). Without it, timelapseMoving never clears after a
  // TIMELAPSE_MOVE, which silently disables the jog watchdog
  // (motorWatchdogCheck()'s early-return guard) and rejects every
  // subsequent motorAutoDrive() call until the next STOP.
  motorTimelapseMoveCheck();
  bleNotifyStatusIfChanged();
}
