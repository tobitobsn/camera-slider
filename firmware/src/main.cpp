#include <Arduino.h>

#include "ble.h"
#include "motor.h"

// The standard ESP32 dev-board BOOT button — GPIO0, pulled up on-board,
// pulled to ground while held. Only consumed by the ROM bootloader before
// Arduino's setup() runs, so reading it here is safe and doesn't collide
// with its usual "hold to enter flashing mode" role. Not otherwise used by
// this project (motor.cpp's pins are 16/17/25/26/27). qa-report.md BUG-7
// re-verification (NEU-1): the sole escape hatch for a bond slot stuck on
// the wrong device now that ble.cpp no longer evicts it automatically —
// see bleSetup()'s resetBonds parameter.
constexpr uint8_t kBootButtonPin = 0;

void setup() {
  Serial.begin(115200);
  pinMode(kBootButtonPin, INPUT_PULLUP);
  const bool resetBonds = digitalRead(kBootButtonPin) == LOW;
  bleSetup(resetBonds);
  motorSetup();
}

void loop() {
  motorWatchdogCheck();
  motorAutoDriveCheck();
  bleNotifyStatusIfChanged();
}
