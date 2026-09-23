#pragma once

// BLE peripheral setup for the camera slider (PROJ-1: connection & pairing
// only — no motor/stepper logic lives here).
//
// Advertises as "CameraSlider" with a fixed GATT service so the paired
// React Native app can discover and connect. Command/status characteristics
// are declared now for later features (PROJ-2/PROJ-3) but are not yet wired
// to any behavior.

// Initializes the NimBLE stack, creates the GATT service/characteristics,
// and starts advertising. Call once from setup().
void bleSetup();

// Returns true if a central (the paired app) is currently connected.
bool bleIsConnected();
