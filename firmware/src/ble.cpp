#include "ble.h"

#include <Arduino.h>
#include <NimBLEDevice.h>

#include <cstring>

#include "motor.h"

namespace {

// Advertised device name the app scans for.
const char kDeviceName[] = "CameraSlider";

// Fixed contract UUIDs shared with the React Native app. Do not change
// without updating the app's BLE scan/connect code as well.
const char kServiceUUID[] = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const char kCommandCharUUID[] = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";  // WRITE, bonded/encrypted (PROJ-2)
const char kStatusCharUUID[] = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";   // NOTIFY (PROJ-3)

// Command opcodes (see docs/stacks/firmware-esp32-tmc2209.md "BLE-Kommandoschicht"
// and design.md "Grenze zur Firmware"). Byte 0 of every write is the opcode.
constexpr uint8_t kOpcodeJog = 0x01;        // <opcode> <direction> <speedPercent> — 3 bytes total
constexpr uint8_t kOpcodeSetStart = 0x02;   // <opcode> — 1 byte total
constexpr uint8_t kOpcodeSetEnd = 0x03;     // <opcode> — 1 byte total
constexpr uint8_t kOpcodeAutoDrive = 0x04;  // <opcode> <direction> <durationDeciseconds LE u16> — 4 bytes total
constexpr uint8_t kOpcodeStop = 0x05;       // <opcode> — 1 byte total

volatile bool gConnected = false;

// Status characteristic, promoted from bleSetup()'s local scope so
// bleNotifyStatusIfChanged() (called every loop() iteration from main.cpp)
// and the onSubscribe callback below can reach it. Same pattern as
// gConnected above — file-scope state in this anonymous namespace.
NimBLECharacteristic* gStatusChar = nullptr;

// Last 5-byte Status-Characteristic payload actually sent (see
// bleNotifyStatusIfChanged()), so repeated identical polls from loop()
// don't spam notify(). Zero-initialized; the very first differing status
// (including right after boot) will therefore always notify.
uint8_t gLastStatusPayload[5] = {0, 0, 0, 0, 0};
bool gHasSentStatus = false;

// Packs a MotorStatus snapshot into the 5-byte wire payload design.md
// specifies: byte 0 is the flags bitfield (bit0 hasStart, bit1 hasEnd,
// bit2 atStart, bit3 atEnd, bit4 driving), bytes 1-4 are distanceSteps as
// little-endian uint32 (matches src/ble/client.ts's parseStatusPayload()).
void packStatusPayload(const MotorStatus& status, uint8_t out[5]) {
  uint8_t flags = 0;
  if (status.hasStart) flags |= 0x01;
  if (status.hasEnd) flags |= 0x02;
  if (status.atStart) flags |= 0x04;
  if (status.atEnd) flags |= 0x08;
  if (status.driving) flags |= 0x10;

  out[0] = flags;
  out[1] = static_cast<uint8_t>(status.distanceSteps & 0xff);
  out[2] = static_cast<uint8_t>((status.distanceSteps >> 8) & 0xff);
  out[3] = static_cast<uint8_t>((status.distanceSteps >> 16) & 0xff);
  out[4] = static_cast<uint8_t>((status.distanceSteps >> 24) & 0xff);
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo) override {
    (void)connInfo;
    gConnected = true;
    Serial.println("BLE: client connected");
    // EC-3 (spec.md): every new connection — app restart or a bare
    // reconnect, the ESP32 itself doesn't reboot for either — must reset
    // the firmware's start/end points, since the app's own idea of them
    // resets too and nothing here is persisted (design.md's added
    // Technical Decision row on this exact gap).
    // qa-report.md BUG-6: only clear on the connect that starts a fresh
    // session (0 -> 1 connected centrals), not on every onConnect — up to
    // 3 centrals can be connected at once (see the BUG-4 note below), so
    // without this guard an unrelated second device connecting alongside
    // an already-connected app would silently wipe the app's own points
    // mid-session, including mid-drive.
    if (pServer->getConnectedCount() == 1) {
      motorClearPoints();
    }
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
    // AC-5/EC-3/AC-10: the firmware must stop the motor independently of
    // the app when the connection drops, not wait for a STOP that will
    // never come. qa-report.md BUG-5: this used to be gated on
    // getConnectedCount() == 0 — since the BUG-4 fix keeps advertising
    // running while a central is connected, up to 3 devices can be
    // connected at once, and an unrelated second device staying connected
    // silently suppressed the safety stop AC-10 promises whenever the
    // app's own connection dropped. A stop is always safe to issue even
    // when nothing is moving, so it now runs unconditionally on every
    // disconnect, regardless of who else is still connected.
    motorStop();
    if (pServer->getConnectedCount() == 0) {
      gConnected = false;
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
      case kOpcodeSetStart: {
        if (len != 1) {
          return;  // malformed SET_START write — ignore
        }
        motorSetStart();
        break;
      }
      case kOpcodeSetEnd: {
        if (len != 1) {
          return;  // malformed SET_END write — ignore
        }
        motorSetEnd();
        break;
      }
      case kOpcodeAutoDrive: {
        if (len != 4) {
          return;  // malformed AUTO_DRIVE write — ignore rather than read out of bounds
        }
        const uint8_t directionByte = value[1];
        const JogDirection direction =
            (directionByte == 0x00) ? JogDirection::kForward : JogDirection::kBackward;
        // Little-endian uint16, low byte first — matches
        // src/ble/client.ts's sendAutoDriveCommand() encoding
        // (durationDeciseconds & 0xff, then >> 8 & 0xff).
        const uint16_t durationDeciseconds =
            static_cast<uint16_t>(value[2]) | (static_cast<uint16_t>(value[3]) << 8);
        motorAutoDrive(direction, durationDeciseconds);
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
        // No other opcodes are defined (PROJ-3's three new ones above cover
        // the full protocol design.md specifies — no speculative future
        // opcodes).
        break;
    }
  }
};

// Notify-on-Subscribe (design.md "Status-Characteristic"): send the current
// status once, immediately, when a central subscribes — so the app has the
// right state right after connecting without waiting for the next loop()
// diff-check to happen to find a change (it might not, if nothing changed
// since boot). Verified against the vendored header: onSubscribe(...) is a
// real virtual override point on NimBLECharacteristicCallbacks
// (NimBLECharacteristic.h:299); the server passes
// `event->subscribe.cur_notify + (event->subscribe.cur_indicate << 1)` as
// subValue (NimBLEServer.cpp:537-539), so bit 0 set means "notify enabled"
// — the case both on subscribe (cur_notify=1) and unsubscribe
// (cur_notify=0), hence the explicit check below.
class StatusCharacteristicCallbacks : public NimBLECharacteristicCallbacks {
  void onSubscribe(NimBLECharacteristic* pCharacteristic, NimBLEConnInfo& connInfo,
                    uint16_t subValue) override {
    (void)connInfo;
    if ((subValue & 0x01) == 0) {
      return;  // unsubscribed, or an indicate-only subscribe — nothing to send
    }
    const MotorStatus status = motorGetStatus();
    uint8_t payload[5];
    packStatusPayload(status, payload);
    pCharacteristic->setValue(payload, sizeof(payload));
    pCharacteristic->notify();
    memcpy(gLastStatusPayload, payload, sizeof(payload));
    gHasSentStatus = true;
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

  // Status characteristic — notify-only, real payloads sent from
  // bleNotifyStatusIfChanged() (called every loop() from main.cpp) and once
  // immediately on subscribe (StatusCharacteristicCallbacks::onSubscribe
  // below).
  gStatusChar = pService->createCharacteristic(kStatusCharUUID, NIMBLE_PROPERTY::NOTIFY);
  gStatusChar->setCallbacks(new StatusCharacteristicCallbacks());

  pService->start();

  NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(kServiceUUID);
  pAdvertising->start();

  Serial.println("BLE: advertising started as \"CameraSlider\"");
}

bool bleIsConnected() {
  return gConnected;
}

void bleNotifyStatusIfChanged() {
  if (gStatusChar == nullptr) {
    return;  // called before bleSetup() finished — shouldn't happen, defensive only
  }

  const MotorStatus status = motorGetStatus();
  uint8_t payload[5];
  packStatusPayload(status, payload);

  if (gHasSentStatus && memcmp(payload, gLastStatusPayload, sizeof(payload)) == 0) {
    return;  // unchanged since the last notify — nothing to send
  }

  // setValue()/notify(): NimBLELocalValueAttribute::setValue(const uint8_t*,
  // size_t) — NimBLELocalValueAttribute.h:68; NimBLECharacteristic::notify()
  // (no-arg, sends the value already set via setValue()) —
  // NimBLECharacteristic.h:61. Both verified against the vendored header.
  gStatusChar->setValue(payload, sizeof(payload));
  gStatusChar->notify();
  memcpy(gLastStatusPayload, payload, sizeof(payload));
  gHasSentStatus = true;
}
