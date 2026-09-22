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
const char kCommandCharUUID[] = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";  // WRITE, bonded/encrypted (PROJ-2)
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
    // BUG-4 fix (qa-report.md): NimBLE only restarts advertising after a
    // disconnect or a *failed* connection attempt, never after a successful
    // one (confirmed in the vendored NimBLEServer.cpp — the connect event's
    // startAdvertising() call lives only in the failure branch). Left as-is,
    // the first central to connect — rogue or legitimate — makes the slider
    // permanently undiscoverable to everyone else for as long as it holds
    // the link, since the app can only find devices that are advertising.
    // Max simultaneous connections defaults to 3
    // (.pio/libdeps/esp32dev/NimBLE-Arduino/src/nimconfig.h:225), so this
    // doesn't cost the connected peer its slot — it just keeps the slider
    // discoverable so the legitimate, now-bonded app (see BUG-3 fix below)
    // can always find and connect too.
    NimBLEDevice::startAdvertising();
  }

  void onDisconnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo, int reason) override {
    (void)connInfo;
    (void)reason;
    Serial.println("BLE: client disconnected, restarting advertising");
    // QA finding N-1 (qa-report.md): since the BUG-4 fix keeps advertising
    // running while a central is connected, up to 3 devices can now be
    // connected at once (NimBLE's default CONFIG_BT_NIMBLE_MAX_CONNECTIONS).
    // Before that fix this callback firing at all meant "the one peer is
    // gone" — now it can just as easily mean "some unrelated device that
    // briefly connected is gone, while the app is still here." Only treat
    // it as a real loss of control once NO central remains connected;
    // getConnectedCount() already reflects this disconnect (the peer is
    // removed from the server's list before onDisconnect fires — confirmed
    // in the vendored NimBLEServer.cpp's BLE_GAP_EVENT_DISCONNECT handler).
    // Erring toward stopping when in doubt about the app's own connection
    // is still the safe default, just no longer triggered by an unrelated
    // stranger's connect/disconnect.
    if (pServer->getConnectedCount() == 0) {
      gConnected = false;
      // AC-5/EC-3: the firmware must stop the motor independently of the
      // app when the connection drops, not wait for a STOP that will never
      // come.
      motorStop();
    }
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

  // BUG-3 fix (qa-report.md): the command characteristic now actually drives
  // the motor, and this slider has no physical end stops (spec.md → Out of
  // Scope) — an unauthenticated write from any BLE device in range could
  // drive the carriage off the rail. Require bonded, encrypted writes.
  // "Just Works" — bonding yes, MITM/passkey no, Secure Connections yes:
  // this board has no display and no keyboard, so a passkey or numeric-
  // comparison flow is not an option; Just Works needs no user interaction
  // on either side while still requiring a pairing handshake and an
  // encrypted link. Verified against the vendored header/impl:
  //   NimBLEDevice::setSecurityAuth(bool bonding, bool mitm, bool sc)
  //   — .pio/libdeps/esp32dev/NimBLE-Arduino/src/NimBLEDevice.h:148,
  //     impl at NimBLEDevice.cpp:1189-1194 (sets ble_hs_cfg.sm_bonding /
  //     sm_mitm / sm_sc directly).
  NimBLEDevice::setSecurityAuth(/*bonding=*/true, /*mitm=*/false, /*sc=*/true);
  // Explicit for documentation, not strictly required: with mitm=false no
  // passkey/confirm flow can run regardless of I/O capability, and this
  // already matches the library's compiled-in default
  // (esp_nimble_cfg.h:913 sets MYNEWT_VAL_BLE_SM_IO_CAP to the same value).
  // Stated here anyway so "no screen, no buttons" is a deliberate decision
  // in code, not an implicit default that could quietly change.
  // Verified: NimBLEDevice::setSecurityIOCap(uint8_t) — NimBLEDevice.h:150;
  // BLE_HS_IO_NO_INPUT_OUTPUT — nimble/nimble/host/include/host/ble_hs.h:228,
  // used the same way in the vendored library's own
  // examples/NimBLE_Secure_Server/NimBLE_Secure_Server.ino.
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);
  // No onPassKeyEntry/onConfirmPassKey/onPassKeyDisplay override needed:
  // those callbacks only fire for MITM-protected pairing (numeric
  // comparison / passkey entry), which mitm=false above never triggers, and
  // NimBLEServerCallbacks already ships safe, no-op-ish defaults
  // (NimBLEServer.cpp:1144-1165) for the case they somehow did. Just Works
  // bonding completes with the base ServerCallbacks unchanged.

  NimBLEServer* pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  NimBLEService* pService = pServer->createService(kServiceUUID);

  // Command characteristic: JOG (0x01) is written without response (fired
  // every ~300ms while a direction button is held), STOP (0x05) is written
  // with response — both flags are needed on the same characteristic.
  // WRITE_ENC (BUG-3 fix) requires the link to be encrypted — i.e. the
  // central must have completed the Just Works bonding above — before
  // either write variant is accepted. Verified this applies uniformly to
  // WRITE and WRITE_NR, not just WRITE, in the vendored NimBLE host source:
  // ble_gatts.c's ble_gatts_att_flags_from_chr_flags() maps WRITE_ENC to the
  // same BLE_ATT_F_WRITE_ENC permission bit regardless of which write
  // property was combined with it (ble_gatts.c:264-295), and
  // ble_att_svr_check_perms() (ble_att_svr.c:288-326) enforces that bit for
  // every write, response or not. A JOG write-without-response from an
  // unbonded/unencrypted link is therefore silently dropped by the stack
  // before it ever reaches onWrite() — confirmed via
  // ble_att_svr_rx_write_no_rsp() (ble_att_svr.c:2358-2393), which returns
  // the permission-check error with no response frame, matching the
  // "Command" semantics WRITE_NR already has. That preserves JOG's
  // fire-and-forget/loss-tolerant property; only now loss also covers "not
  // bonded yet", which is the desired outcome. STOP keeps plain WRITE, so an
  // unbonded STOP write gets a normal ATT "insufficient encryption" error
  // response instead of silence — acceptable since STOP is rare and already
  // designed to expect a response.
  NimBLECharacteristic* pCommandChar = pService->createCharacteristic(
      kCommandCharUUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR |
                             NIMBLE_PROPERTY::WRITE_ENC);
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
