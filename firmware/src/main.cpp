#include <Arduino.h>

#include "ble.h"
#include "motor.h"

void setup() {
  Serial.begin(115200);
  bleSetup();
  motorSetup();
}

void loop() {
  motorWatchdogCheck();
}
