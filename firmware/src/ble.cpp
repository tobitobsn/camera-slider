#include "ble.h"

#include <Arduino.h>
#include <NimBLEDevice.h>

namespace {

// Advertised device name the app scans for.
const char kDeviceName[] = "CameraSlider";

// Fixed contract UUIDs shared with the React Native app. Do not change
// without updating the app's BLE scan/connect code as well.
const char kServiceUUID[] = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const char kCommandCharUUID[] = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";  // WRITE, future use
const char kStatusCharUUID[] = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";   // NOTIFY, future use

volatile bool gConnected = false;

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo) override {
    (void)pServer;
    (void)connInfo;
    gConnected = true;
    Serial.println("BLE: client connected");
  }

  void onDisconnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo, int reason) override {
    (void)pServer;
    (void)connInfo;
    (void)reason;
    gConnected = false;
    Serial.println("BLE: client disconnected, restarting advertising");
    // The app auto-reconnects by scanning again, so we must be discoverable
    // again as soon as the link drops.
    NimBLEDevice::startAdvertising();
  }
};

}  // namespace

void bleSetup() {
  NimBLEDevice::init(kDeviceName);

  NimBLEServer* pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  NimBLEService* pService = pServer->createService(kServiceUUID);

  // Command characteristic (write-only for now, PROJ-2/PROJ-3 will add a
  // write callback to actually act on incoming commands).
  pService->createCharacteristic(kCommandCharUUID, NIMBLE_PROPERTY::WRITE);

  // Status characteristic (notify-only for now, no values are sent yet).
  pService->createCharacteristic(kStatusCharUUID, NIMBLE_PROPERTY::NOTIFY);

  pService->start();

  NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(kServiceUUID);
  pAdvertising->start();

  Serial.println("BLE: advertising started as \"CameraSlider\"");
}

bool bleIsConnected() {
  return gConnected;
}
