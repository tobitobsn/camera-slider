#include "ble.h"

#include <Arduino.h>
#include <NimBLEDevice.h>

#include "motor.h"

namespace {

// Advertised device name the app scans for.
const char kDeviceName[] = "CameraSlider";

// Fixed contract UUIDs shared with the React Native app. Do not change
// without updating the app's BLE scan/connect code as well.
const char kServiceUUID[] = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const char kCommandCharUUID[] = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";  // WRITE, future use
const char kStatusCharUUID[] = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";   // NOTIFY, future use

// Command opcodes (see docs/stacks/firmware-esp32-tmc2209.md "BLE-Kommandoschicht").
// Byte 0 of every write is the opcode.
constexpr uint8_t kOpcodeJog = 0x01;   // <opcode> <direction> <speedPercent> — 3 bytes total
constexpr uint8_t kOpcodeStop = 0x05;  // <opcode> — 1 byte total

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
    // AC-5/EC-3: the firmware must stop the motor independently of the app
    // when the connection drops, not wait for a STOP that will never come.
    motorStop();
    // The app auto-reconnects by scanning again, so we must be discoverable
    // again as soon as the link drops.
    NimBLEDevice::startAdvertising();
  }
};

class CommandCharacteristicCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pCharacteristic, NimBLEConnInfo& connInfo) override {
    (void)connInfo;

    NimBLEAttValue value = pCharacteristic->getValue();
    const size_t len = value.length();
    if (len == 0) {
      return;
    }

    const uint8_t opcode = value[0];
    switch (opcode) {
      case kOpcodeJog: {
        if (len != 3) {
          return;  // malformed JOG write — ignore rather than read out of bounds
        }
        const uint8_t directionByte = value[1];
        const uint8_t speedByte = value[2];
        const JogDirection direction =
            (directionByte == 0x00) ? JogDirection::kForward : JogDirection::kBackward;
        motorJog(direction, speedByte);
        break;
      }
      case kOpcodeStop: {
        if (len != 1) {
          return;  // malformed STOP write — ignore
        }
        motorStop();
        break;
      }
      default:
        // No other opcodes are defined yet (PROJ-3 will add more later).
        break;
    }
  }
};

}  // namespace

void bleSetup() {
  NimBLEDevice::init(kDeviceName);

  NimBLEServer* pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  NimBLEService* pService = pServer->createService(kServiceUUID);

  // Command characteristic: JOG (0x01) is written without response (fired
  // every ~300ms while a direction button is held), STOP (0x05) is written
  // with response — both flags are needed on the same characteristic.
  NimBLECharacteristic* pCommandChar = pService->createCharacteristic(
      kCommandCharUUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  pCommandChar->setCallbacks(new CommandCharacteristicCallbacks());

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
