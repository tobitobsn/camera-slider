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
void bleSetup();

// Returns true if a central (the paired app) is currently connected.
bool bleIsConnected();

// Call from loop() (PROJ-3). Reads motorGetStatus(), packs it into the
// Status-Characteristic's 5-byte notify payload (design.md "Grenze zur
// Firmware"), and sends a notify() only if the payload differs from the
// last one actually sent — cheap to call every loop() iteration, and this
// diff-check is how a SET_START/SET_END/motor-stop/auto-drive-arrival is
// "noticed" without motor.cpp needing to call back into ble.cpp directly
// for each one. A central that just subscribed gets one notify immediately
// (Notify-on-Subscribe, see ble.cpp's onSubscribe) independent of this
// diff-check, so it doesn't have to wait for the next state change.
void bleNotifyStatusIfChanged();
