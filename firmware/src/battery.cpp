#include "battery.h"

#include <Arduino.h>

#include "motor.h"

namespace {

// --- Hardware / calibration (design.md "Datenmodell → Firmware-Konstanten")
constexpr uint8_t kBatteryPin = 34;  // ADC1 — ADC2 is unusable while BLE runs
// (82 kΩ + 22 kΩ + 22 kΩ) / 22 kΩ — pack voltage per pin voltage.
constexpr float kDividerRatio = 126.0f / 22.0f;
// Set once after comparing the serial output with a multimeter
// (tasks.md T10/T11): multimeter reading ÷ firmware reading.
constexpr float kCalibrationFactor = 1.000f;

// --- Timing
constexpr unsigned long kSampleIntervalMs = 200;
constexpr int kSamplesPerMeasurement = 16;
constexpr unsigned long kDisplayRefreshMs = 10000;
constexpr unsigned long kSerialLogIntervalMs = 2000;

// --- Thresholds (spec.md AC-7, AC-11)
constexpr uint32_t kBatteryPresentMillivolts = 5000;
constexpr uint32_t kProtectMillivolts = 9300;
constexpr unsigned long kProtectFilterMs = 5000;

constexpr uint16_t kDisplayRoundingMillivolts = 20;

unsigned long lastSampleMillis = 0;
unsigned long lastSerialLogMillis = 0;

// Protective filter: millis() when the pack first read low in the current
// unbroken low stretch; 0 = not low.
unsigned long lowSinceMillis = 0;

// Display value: rest-only measurements averaged between refreshes.
uint32_t restSumMillivolts = 0;
uint32_t restSampleCount = 0;
unsigned long lastDisplayRefreshMillis = 0;
bool hasDisplayValue = false;
// Written in loop() (batteryUpdate()), read in loop() and from the NimBLE
// host task (the status payload sent on subscribe) — volatile for
// cross-task visibility like motor.cpp's shared flags.
volatile uint16_t displayMillivolts = 0;

uint32_t measurePackMillivolts() {
  uint32_t pinSum = 0;
  for (int i = 0; i < kSamplesPerMeasurement; i++) {
    pinSum += analogReadMilliVolts(kBatteryPin);
  }
  const float pinMillivolts = static_cast<float>(pinSum) / kSamplesPerMeasurement;
  return static_cast<uint32_t>(pinMillivolts * kDividerRatio * kCalibrationFactor + 0.5f);
}

uint16_t roundForDisplay(uint32_t millivolts) {
  const uint32_t rounded =
      ((millivolts + kDisplayRoundingMillivolts / 2) / kDisplayRoundingMillivolts) *
      kDisplayRoundingMillivolts;
  return static_cast<uint16_t>(rounded > 0xFFFF ? 0xFFFF : rounded);
}

void updateProtection(uint32_t packMillivolts, unsigned long now) {
  const bool present = packMillivolts >= kBatteryPresentMillivolts;
  const bool low = present && packMillivolts < kProtectMillivolts;
  if (!low) {
    // Any reading at or above the threshold (or no battery at all) breaks
    // the stretch — short sags while accelerating never add up (EC-1).
    lowSinceMillis = 0;
    return;
  }
  if (lowSinceMillis == 0) {
    lowSinceMillis = now == 0 ? 1 : now;
    return;
  }
  if (!motorIsLocked() && now - lowSinceMillis >= kProtectFilterMs) {
    Serial.printf("battery: %lu mV below %lu mV for 5 s — protective stop, locked until reboot\n",
                  static_cast<unsigned long>(packMillivolts),
                  static_cast<unsigned long>(kProtectMillivolts));
    motorLockout();
  }
}

void updateDisplay(uint32_t packMillivolts, unsigned long now) {
  if (motorIsRunning()) {
    // Voltage sags under load — only standstill readings feed the display
    // (spec.md AC-3). The app dims the last value meanwhile.
    return;
  }
  restSumMillivolts += packMillivolts;
  restSampleCount++;
  if (hasDisplayValue && now - lastDisplayRefreshMillis < kDisplayRefreshMs) {
    return;
  }
  // First value right after boot (EC-5: the app shows "–" only until then),
  // afterwards at most every 10 s — well inside AC-2's 30 s.
  displayMillivolts = roundForDisplay(restSumMillivolts / restSampleCount);
  hasDisplayValue = true;
  lastDisplayRefreshMillis = now;
  restSumMillivolts = 0;
  restSampleCount = 0;
}

}  // namespace

void batterySetup() {
  analogSetPinAttenuation(kBatteryPin, ADC_11db);
}

void batteryUpdate() {
  // Race guard (design.md Technical Decisions): a motion request that passed
  // its lock check just before motorLockout() set the flag could start after
  // the stop — stop it again on every iteration while locked.
  if (motorIsLocked() && motorIsRunning()) {
    motorStop();
  }

  const unsigned long now = millis();
  if (now - lastSampleMillis < kSampleIntervalMs) {
    return;
  }
  lastSampleMillis = now;

  const uint32_t packMillivolts = measurePackMillivolts();
  updateProtection(packMillivolts, now);
  updateDisplay(packMillivolts, now);

  if (now - lastSerialLogMillis >= kSerialLogIntervalMs) {
    lastSerialLogMillis = now;
    // Calibration aid (tasks.md T10): compare with a multimeter.
    Serial.printf("battery: %lu mV (display %u mV%s)\n",
                  static_cast<unsigned long>(packMillivolts),
                  static_cast<unsigned>(displayMillivolts),
                  motorIsLocked() ? ", LOCKED" : "");
  }
}

uint16_t batteryDisplayMillivolts() {
  return displayMillivolts;
}

bool batteryIsLocked() {
  return motorIsLocked();
}
