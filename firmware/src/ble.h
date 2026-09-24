#pragma once

// BLE peripheral setup for the camera slider (PROJ-1: connection & pairing;
// PROJ-2: jog/stop; PROJ-3: start/end points, auto-drive, status notify —
// opcode parsing lives in ble.cpp, motor logic stays in motor.h/motor.cpp).
//
// Advertises as "CameraSlider" with a fixed GATT service so the paired
// React Native app can discover and connect. The Command characteristic
// (write) drives the motor via opcodes; the Status characteristic (notify)
// reports MotorStatus back to the app.

// Initializes the NimBLE stack, creates the GATT service/characteristics,
// and starts advertising. Call once from setup().
//
// resetBonds: qa-report.md BUG-7's fix (DeviceCallbacks::onStoreStatus in
// ble.cpp) rejects a new pairing once the single stored-bond slot
// (CONFIG_BT_NIMBLE_MAX_BONDS=1, platformio.ini) is occupied, rather than
// evicting whatever is already there — deliberately, so a stranger's
// pairing can't displace the app's bond anymore. The unavoidable trade-off
// (re-verification found): if the slot is ever occupied by the wrong
// device (a stray pairing before the owner's phone ever bonds, a phone
// swap, or a leftover bond from firmware built before this fix with a
// higher MAX_BONDS), there is otherwise no way back short of erasing the
// whole flash. Pass true to wipe all stored bonds before anything can
// connect — main.cpp wires this to the BOOT button pressed within a short
// window right after power-on (never *during* power-on itself: GPIO0 is
// also a strapping pin the ROM bootloader reads at that exact instant, so
// holding it then would boot into UART download mode instead of running
// this firmware at all — see main.cpp's kBootButtonWindowMs).
void bleSetup(bool resetBonds);

// Returns true if a central (the paired app) is currently connected.
bool bleIsConnected();

// Call from loop() (PROJ-3, payload grown to 6 bytes by PROJ-4). Reads
// motorGetStatus(), packs it into the Status-Characteristic's notify
// payload (design.md "Grenze zur Firmware"), and sends a notify() only if
// the payload differs from the last one actually sent — cheap to call
// every loop() iteration, and this
// diff-check is how a SET_START/SET_END/motor-stop/auto-drive-arrival is
// "noticed" without motor.cpp needing to call back into ble.cpp directly
// for each one. A central that just subscribed gets one notify immediately
// (Notify-on-Subscribe, see ble.cpp's onSubscribe) independent of this
// diff-check, so it doesn't have to wait for the next state change.
void bleNotifyStatusIfChanged();
