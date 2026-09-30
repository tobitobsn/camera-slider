#include "ble.h"

#include <Arduino.h>
#include <NimBLEDevice.h>

#include <cstring>

#include "battery.h"
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
constexpr uint8_t kOpcodeSetEndFromDistance = 0x06;  // <opcode> <direction> <distanceSteps LE u32> — 6 bytes total
constexpr uint8_t kOpcodeTimelapseMove = 0x07;  // <opcode> <direction> <distanceSteps LE u32> — 6 bytes total

volatile bool gConnected = false;

// Status characteristic, promoted from bleSetup()'s local scope so
// bleNotifyStatusIfChanged() (called every loop() iteration from main.cpp)
// and the onSubscribe callback below can reach it. Same pattern as
// gConnected above — file-scope state in this anonymous namespace.
NimBLECharacteristic* gStatusChar = nullptr;

// Last 10-byte Status-Characteristic payload actually sent (see
// bleNotifyStatusIfChanged()), so repeated identical polls from loop()
// don't spam notify(). Zero-initialized; the very first differing status
// (including right after boot) will therefore always notify.
uint8_t gLastStatusPayload[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
bool gHasSentStatus = false;

// Packs a MotorStatus snapshot into the 10-byte wire payload design.md
// specifies: byte 0 is the flags bitfield (bit0 hasStart, bit1 hasEnd,
// bit2 atStart, bit3 atEnd, bit4 driving, bit5 timelapseMoving, PROJ-6:
// bit6 locked, bit7 moving), bytes 1-4
// are distanceSteps as little-endian uint32, byte 5 is 0x00 when the end
// point is at-or-after the start point (increasing step-count direction)
// and 0x01 when it's before (decreasing direction) — only meaningful when
// hasStart && hasEnd are both true (matches src/ble/client.ts's
// parseStatusPayload()).
void packStatusPayload(const MotorStatus& status, uint16_t batteryMillivolts,
                       uint8_t shutdownSeconds, uint8_t out[10]) {
  uint8_t flags = 0;
  if (status.hasStart) flags |= 0x01;
  if (status.hasEnd) flags |= 0x02;
  if (status.atStart) flags |= 0x04;
  if (status.atEnd) flags |= 0x08;
  if (status.driving) flags |= 0x10;
  if (status.timelapseMoving) flags |= 0x20;
  if (status.locked) flags |= 0x40;
  if (status.moving) flags |= 0x80;

  out[0] = flags;
  out[1] = static_cast<uint8_t>(status.distanceSteps & 0xff);
  out[2] = static_cast<uint8_t>((status.distanceSteps >> 8) & 0xff);
  out[3] = static_cast<uint8_t>((status.distanceSteps >> 16) & 0xff);
  out[4] = static_cast<uint8_t>((status.distanceSteps >> 24) & 0xff);
  out[5] = status.endIsAfterStart ? 0x00 : 0x01;
  // PROJ-6 (design.md "Grenze zur Firmware"): battery display value in
  // millivolts, uint16 little-endian, 0 = no value yet.
  out[6] = static_cast<uint8_t>(batteryMillivolts & 0xff);
  out[7] = static_cast<uint8_t>((batteryMillivolts >> 8) & 0xff);
  // PROJ-6 refine (AC-12, AC-13): lock reason (0 none, 1 low battery,
  // 2 measurement fault) and seconds until the slider switches itself off.
  out[8] = status.locked ? status.lockReason : 0;
  out[9] = shutdownSeconds;
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
    (void)reason;
    Serial.println("BLE: client disconnected, restarting advertising");
    // AC-5/EC-3/AC-10: the firmware must stop the motor independently of
    // the app when the connection drops, not wait for a STOP that will
    // never come. qa-report.md BUG-5, first fix attempt: gating this on
    // getConnectedCount() == 0 let an unrelated second device staying
    // connected suppress the stop. That fix's own replacement — stopping
    // unconditionally on every disconnect — went too far the other way
    // (qa-report.md re-verification, independently found by two lanes): it
    // let *any* nearby device interrupt a running jog or drive with a bare,
    // unauthenticated connect+disconnect, no pairing required — a regression
    // of PROJ-2's own N-1 fix. The command characteristic requires WRITE_ENC
    // (BUG-3 fix, PROJ-2), so only a peer that actually completed the
    // Just-Works encryption handshake could ever have been the one driving
    // the motor — checking that this specific disconnecting connection was
    // encrypted (not the aggregate connected count) covers the real AC-10
    // case (the controlling peer drops, regardless of who else is still
    // connected) without reacting to an unauthenticated stranger's
    // connect/disconnect.
    if (connInfo.isEncrypted()) {
      motorStop();
    }
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
      case kOpcodeSetEndFromDistance: {
        if (len != 6) {
          return;  // malformed SET_END_FROM_DISTANCE write — ignore rather than read out of bounds
        }
        const uint8_t directionByte = value[1];
        const bool endIsAfterStart = (directionByte == 0x00);
        // Little-endian uint32, low byte first — matches
        // src/ble/client.ts's sendSetEndFromDistanceCommand() encoding
        // (distanceSteps & 0xff, then >>> 8/16/24 & 0xff).
        const uint32_t distanceSteps = static_cast<uint32_t>(value[2]) |
                                        (static_cast<uint32_t>(value[3]) << 8) |
                                        (static_cast<uint32_t>(value[4]) << 16) |
                                        (static_cast<uint32_t>(value[5]) << 24);
        motorSetEndFromDistance(endIsAfterStart, distanceSteps);
        break;
      }
      case kOpcodeTimelapseMove: {
        if (len != 6) {
          return;  // malformed TIMELAPSE_MOVE write — ignore rather than read out of bounds
        }
        const uint8_t directionByte = value[1];
        const bool endIsAfterStart = (directionByte == 0x00);
        // Little-endian uint32, low byte first — same encoding as
        // SET_END_FROM_DISTANCE above (matches src/ble/client.ts's
        // sendTimelapseMoveCommand() encoding).
        const uint32_t distanceSteps = static_cast<uint32_t>(value[2]) |
                                        (static_cast<uint32_t>(value[3]) << 8) |
                                        (static_cast<uint32_t>(value[4]) << 16) |
                                        (static_cast<uint32_t>(value[5]) << 24);
        motorTimelapseMoveTo(endIsAfterStart, distanceSteps);
        break;
      }
      default:
        // No other opcodes are defined (PROJ-3's three opcodes plus PROJ-4's
        // SET_END_FROM_DISTANCE and PROJ-5's TIMELAPSE_MOVE (0x07) above
        // cover the full protocol design.md specifies — no speculative
        // future opcodes).
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
    uint8_t payload[10];
    packStatusPayload(status, batteryDisplayMillivolts(), batteryShutdownSeconds(), payload);
    pCharacteristic->setValue(payload, sizeof(payload));
    pCharacteristic->notify();
    memcpy(gLastStatusPayload, payload, sizeof(payload));
    gHasSentStatus = true;
  }
};

// qa-report.md BUG-7: NimBLEDeviceCallbacks' default onStoreStatus()
// (NimBLEDevice.cpp:1393-1395) delegates to ble_store_util_status_rr(),
// which on a BLE_STORE_EVENT_OVERFLOW for a security record evicts the
// *oldest* stored bond to make room (ble_store_util.c) and disconnects it
// (ble_gap_unpair() -> ble_gap_terminate_with_conn(), vendored ble_gap.c) —
// with CONFIG_BT_NIMBLE_MAX_BONDS=1 (platformio.ini) that oldest bond is
// always the app's own, so a single unrelated Just-Works pairing attempt
// would silently evict and disconnect it. This is a single-owner device
// (docs/PRD.md) with exactly one intended bond: once that one slot is
// taken, a later pairing attempt should be refused, not swap it out.
// Returning a non-zero status from the overflow event makes
// ble_store_write() fail the *new* peer's write instead of trying again
// after the application "made room" (verified against the vendored
// ble_store.c: ble_store_write()'s BLE_HS_ESTORE_CAP branch only retries
// when ble_store_overflow_event()'s return value is 0).
class DeviceCallbacks : public NimBLEDeviceCallbacks {
  int onStoreStatus(struct ble_store_status_event* event, void* arg) override {
    if (event->event_code == BLE_STORE_EVENT_OVERFLOW) {
      return BLE_HS_ESTORE_CAP;  // reject the new bond instead of evicting the old one
    }
    return NimBLEDeviceCallbacks::onStoreStatus(event, arg);
  }
};

}  // namespace

void bleSetup(bool resetBonds) {
  NimBLEDevice::init(kDeviceName);

  if (resetBonds) {
    // qa-report.md BUG-7 re-verification (NEU-1): with only one bond slot
    // and overflow now rejected rather than evicted (below), a slot
    // occupied by the wrong device had no way back except erasing flash.
    // Called before anything can connect, so it can't race a real pairing.
    // qa-report.md BUG-7 re-verification round 3 (NEU-B): check the result
    // instead of always claiming success — deleteAllBonds() can fail on an
    // underlying NVS error.
    const bool deleted = NimBLEDevice::deleteAllBonds();
    Serial.println(deleted ? "BLE: BOOT button pressed - all stored bonds deleted"
                            : "BLE: BOOT button pressed - deleting stored bonds FAILED");
  }

  // qa-report.md BUG-7: reject a bond-storage overflow instead of the
  // library's default (evict the oldest bond) — see DeviceCallbacks above.
  // Registered right after init(), before anything can connect.
  NimBLEDevice::setDeviceCallbacks(new DeviceCallbacks());

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

  // Command characteristic offers both WRITE and WRITE_NR (write-without-
  // response). STOP (0x05) has always used WRITE. JOG (0x01) used WRITE_NR
  // until qa-report.md's PROJ-2 BUG-16 (fired every ~300ms while a direction
  // button is held) — the app now uses WRITE for JOG too (src/ble/client.ts).
  // WRITE_NR itself is left enabled here rather than removed: any bonded
  // client could still choose it, and removing an accepted write type is a
  // characteristic-shape change worth its own deliberate decision, not a
  // side effect of an app-side bugfix.
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
  uint8_t payload[10];
  packStatusPayload(status, batteryDisplayMillivolts(), batteryShutdownSeconds(), payload);

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
