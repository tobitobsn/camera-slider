#include "battery.h"

#include <Arduino.h>
#include <esp_sleep.h>

#include "motor.h"

namespace {

// --- Hardware / calibration (design.md "Datenmodell → Firmware-Konstanten")
constexpr uint8_t kBatteryPin = 34;  // ADC1 — ADC2 is unusable while BLE runs
// (82 kΩ + 22 kΩ + 22 kΩ) / 22 kΩ — pack voltage per pin voltage.
constexpr float kDividerRatio = 126.0f / 22.0f;
// Multimeter reading ÷ firmware reading (tasks.md T10/T11), measured
// 2026-09-30 on battery: 12 200 mV (multimeter) ÷ 12 280 mV (firmware, read
// over BLE) = 0.993. The pin itself read 2.12 V → actual divider 5.755 vs
// nominal 5.727; the rest is the ADC reading about 1 % high.
constexpr float kCalibrationFactor = 0.993f;

// --- Timing
constexpr unsigned long kSampleIntervalMs = 200;
constexpr int kSamplesPerMeasurement = 16;
constexpr unsigned long kDisplayRefreshMs = 10000;
constexpr unsigned long kSerialLogIntervalMs = 2000;

// --- Thresholds (spec.md AC-7, AC-11)
constexpr uint32_t kBatteryPresentMillivolts = 5000;
constexpr uint32_t kProtectMillivolts = 9300;
constexpr unsigned long kProtectFilterMs = 5000;
// BUG-13 / NEU-A: "battery seen" needs this many readings >= 5000 mV since
// boot (5 × 200 ms = 1 s worth), so a single spike on a floating pin can't
// arm the measurement-fault check during a USB start. Counted, not "in a
// row": a contact that is already loose at power-on still adds up.
constexpr uint8_t kBatterySeenReadings = 5;

constexpr uint16_t kDisplayRoundingMillivolts = 20;

// spec.md AC-12: time between the lock and deep sleep, so the app can show why.
constexpr unsigned long kShutdownDelayMs = 60000;

unsigned long lastSampleMillis = 0;
unsigned long lastSerialLogMillis = 0;

// Protective filter (BUG-8): millis() when the current unbroken stretch of
// unsafe readings began — low (AC-7) or, after a battery was seen, below
// "present" (AC-13); 0 = not in such a stretch. One shared counter, so a
// loose divider contact flipping between the two can't keep resetting it.
unsigned long unsafeSinceMillis = 0;
// Whether the current stretch contained a reading below "present" — then
// the wiring is the more likely cause and the lock reports a fault.
bool stretchHadFault = false;
uint8_t presentReadings = 0;

// spec.md AC-13 / EC-7: set after kBatterySeenReadings readings >= 5000 mV,
// never cleared.
// USB and battery can't be connected at the same time, so a drop below
// 5000 mV without a reboot can only be a measurement fault.
bool batterySeenSinceBoot = false;

// millis() when the lock was first noticed here (valid once lockNoticed).
bool lockNoticed = false;
unsigned long lockedAtMillis = 0;
volatile uint8_t shutdownSeconds = 0;

// BUG-3: which side of 5000 mV the running rest average belongs to.
bool restAverageIsPresent = false;

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
  uint32_t rounded =
      ((millivolts + kDisplayRoundingMillivolts / 2) / kDisplayRoundingMillivolts) *
      kDisplayRoundingMillivolts;
  // BUG-6: never round across the "battery present" boundary — the app must
  // see the same side of 5000 mV the firmware decided on.
  if (millivolts < kBatteryPresentMillivolts && rounded >= kBatteryPresentMillivolts) {
    rounded = kBatteryPresentMillivolts - kDisplayRoundingMillivolts;
  }
  return static_cast<uint16_t>(rounded > 0xFFFF ? 0xFFFF : rounded);
}

// True once `sinceMillis` (0 = not running) has been running for the
// protective filter time; starts it on the first qualifying reading.
bool stretchReached(bool condition, unsigned long& sinceMillis, unsigned long now) {
  if (!condition) {
    // Any reading outside the range breaks the stretch — short sags while
    // accelerating never add up (EC-1).
    sinceMillis = 0;
    return false;
  }
  if (sinceMillis == 0) {
    sinceMillis = now == 0 ? 1 : now;
    return false;
  }
  return now - sinceMillis >= kProtectFilterMs;
}

void updateProtection(uint32_t packMillivolts, unsigned long now) {
  const bool present = packMillivolts >= kBatteryPresentMillivolts;
  if (present && !batterySeenSinceBoot && ++presentReadings >= kBatterySeenReadings) {
    batterySeenSinceBoot = true;
  }
  const bool low = present && packMillivolts < kProtectMillivolts;
  // EC-7: a USB start that never saw a battery never counts as a fault.
  const bool fault = !present && batterySeenSinceBoot;
  const bool unsafe = low || fault;

  // Every reading of the stretch is below 9.3 V either way (AC-7) — a
  // contact flipping between "low" and "fault" still adds up (BUG-8).
  if (!unsafe) {
    stretchHadFault = false;
  } else if (fault) {
    stretchHadFault = true;
  }
  const bool reached = stretchReached(unsafe, unsafeSinceMillis, now);
  if (!reached || motorIsLocked()) {
    return;
  }
  if (stretchHadFault) {
    Serial.printf("battery: reading %lu mV after a battery was seen — measurement fault, locked\n",
                  static_cast<unsigned long>(packMillivolts));
    motorLockout(LockReason::kMeasurementFault);
  } else {
    Serial.printf("battery: %lu mV below %lu mV for 5 s — protective stop, locked until reboot\n",
                  static_cast<unsigned long>(packMillivolts),
                  static_cast<unsigned long>(kProtectMillivolts));
    motorLockout(LockReason::kLowBattery);
  }
}

// spec.md AC-12: 60 s after the lock, deep sleep with no wake-up source —
// only a reset or a power cycle (battery swap) brings the ESP32 back.
void updateShutdown(unsigned long now) {
  if (!motorIsLocked()) {
    shutdownSeconds = 0;
    return;
  }
  if (!lockNoticed) {
    // BUG-10: a flag, not a 0 sentinel — a lock at millis() == 0 still gets
    // the full 60 s.
    lockNoticed = true;
    lockedAtMillis = now;
  }
  const unsigned long elapsed = now - lockedAtMillis;
  if (elapsed < kShutdownDelayMs) {
    // Round up so the countdown shows 60 … 1, never 0 while still awake.
    shutdownSeconds = static_cast<uint8_t>((kShutdownDelayMs - elapsed + 999) / 1000);
    return;
  }
  Serial.println("battery: shutting down (deep sleep) — reset or swap the battery to restart");
  Serial.flush();
  motorPrepareDeepSleep();
  esp_deep_sleep_start();
}

void updateDisplay(uint32_t packMillivolts, unsigned long now) {
  if (motorIsRunning()) {
    // Voltage sags under load — only standstill readings feed the display
    // (spec.md AC-3). The app dims the last value meanwhile.
    return;
  }
  const bool present = packMillivolts >= kBatteryPresentMillivolts;
  bool refreshNow = !hasDisplayValue;
  if (restSampleCount > 0 && present != restAverageIsPresent) {
    // BUG-3: a reading on the other side of 5000 mV (USB ↔ battery, or a
    // fault) must not be averaged with the old ones — start over and show
    // the new state straight away.
    restSumMillivolts = 0;
    restSampleCount = 0;
    refreshNow = true;
  }
  restAverageIsPresent = present;
  restSumMillivolts += packMillivolts;
  restSampleCount++;
  if (!refreshNow && now - lastDisplayRefreshMillis < kDisplayRefreshMs) {
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
  updateShutdown(now);

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

uint8_t batteryShutdownSeconds() {
  return shutdownSeconds;
}
