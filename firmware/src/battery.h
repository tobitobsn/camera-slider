#pragma once

#include <cstdint>

// PROJ-6 Akkuanzeige — battery voltage measurement and low-battery
// protective stop (design.md "Firmware-Komponentenstruktur").
//
// Hardware: 3S Li-ion pack (9.0–12.6 V) → 82 kΩ + 22 kΩ (top) / 22 kΩ
// (bottom) divider → GPIO 34 (ADC1), 100 nF across the bottom resistor.

// Configures the ADC pin. Call once from setup().
void batterySetup();

// Call on every loop() iteration. Takes a measurement every 200 ms,
// refreshes the display value in standstill (at most every 10 s), runs the
// 5-second protective-stop filter and, once locked, re-stops a stepper that
// is running despite the lock.
void batteryUpdate();

// Last display value in millivolts, rounded to 20 mV. 0 = no value yet.
// Only refreshed while the motor stands still (spec.md AC-2, AC-3).
uint16_t batteryDisplayMillivolts();

// True once the protective stop has fired since boot (same as
// motorIsLocked(), exposed here for callers that only know the battery).
bool batteryIsLocked();
