/**
 * Thin wrapper around react-native-ble-plx for the camera slider's BLE link.
 *
 * This module is a pure BLE data-access layer: it owns the singleton BleManager,
 * scanning for the slider's GATT service, connecting to it, and exposing a
 * disconnect subscription. It deliberately does NOT:
 *  - request/check Android runtime permissions (BLUETOOTH_SCAN/CONNECT) — that is
 *    owned by a sibling task, and callers must ensure permissions are granted
 *    before calling scanForSlider/connectToSlider.
 *  - render any UI or hold any connection state machine — a later task builds
 *    that on top of the functions exported here.
 */
import { BleManager, type Device } from 'react-native-ble-plx';
import { fromByteArray, toByteArray } from 'base64-js';

/**
 * Fixed contract with the firmware — do not change without coordinating a
 * firmware update (see firmware/ in this repo).
 */
export const SLIDER_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

/** Command characteristic UUID — fixed contract with the firmware (firmware/src/ble.cpp). */
export const SLIDER_COMMAND_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

/** Status characteristic UUID (Notify) — fixed contract with the firmware (firmware/src/ble.cpp). */
export const SLIDER_STATUS_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

const JOG_OPCODE = 0x01;
const SET_START_OPCODE = 0x02;
const SET_END_OPCODE = 0x03;
const AUTO_DRIVE_OPCODE = 0x04;
const STOP_OPCODE = 0x05;
const SET_END_FROM_DISTANCE_OPCODE = 0x06;
const TIMELAPSE_MOVE_OPCODE = 0x07;

const JOG_DIRECTION_BYTE: Record<JogDirection, number> = {
  forward: 0x00,
  backward: 0x01,
};

const AUTO_DRIVE_DIRECTION_BYTE: Record<AutoDriveDirection, number> = {
  startToEnd: 0x00,
  endToStart: 0x01,
};

/**
 * true -> the end point lies at-or-after the start point (increasing step
 * count), encoded as 0x00; false -> before the start point (decreasing step
 * count), encoded as 0x01. Mirrors JOG_DIRECTION_BYTE/AUTO_DRIVE_DIRECTION_BYTE.
 */
const END_FROM_DISTANCE_DIRECTION_BYTE: Record<'atOrAfterStart' | 'beforeStart', number> = {
  atOrAfterStart: 0x00,
  beforeStart: 0x01,
};

export type JogDirection = 'forward' | 'backward';

/** Direction for an automatic drive between the set start/end points. */
export type AutoDriveDirection = 'startToEnd' | 'endToStart';

/**
 * Decoded status snapshot as sent by the firmware's Status characteristic
 * (Notify). See parseStatusPayload() for the wire format.
 */
export type SliderStatus = {
  hasStart: boolean;
  hasEnd: boolean;
  atStart: boolean;
  atEnd: boolean;
  driving: boolean;
  /** Distance in steps between start and end. Null unless both hasStart and hasEnd are true. */
  distanceSteps: number | null;
  /**
   * Whether the end point lies at-or-after the start point (increasing step
   * count) rather than before it (decreasing step count). Null unless both
   * hasStart and hasEnd are true.
   */
  endIsAfterStart: boolean | null;
  /**
   * Whether the firmware is currently executing a timelapse step move
   * (triggered by sendTimelapseMoveCommand). Always a valid value, unlike
   * distanceSteps/endIsAfterStart — it does not depend on hasStart/hasEnd.
   */
  timelapseMoving: boolean;
  /**
   * PROJ-6: pack voltage in millivolts, the firmware's standstill display
   * value. Null when the payload has no battery bytes (older firmware), the
   * firmware has no value yet (0) or the value is implausible (> MAX_PLAUSIBLE_BATTERY_MILLIVOLTS, 13 500).
   * Below 5000 mV means "no battery detected" — see battery.ts.
   */
  batteryMillivolts: number | null;
  /** PROJ-6: motion is locked after a low-battery protective stop (until the ESP32 reboots). */
  batteryLocked: boolean;
  /** PROJ-6: the motor is moving right now (any motion, jog included). */
  moving: boolean;
  /** PROJ-6 AC-13: why motion is locked; 'none' while not locked. */
  lockReason: LockReason;
  /** PROJ-6 AC-12: seconds until the slider switches itself off (1–60), null otherwise. */
  shutdownSeconds: number | null;
};

export type LockReason = 'none' | 'lowBattery' | 'measurementFault';

/**
 * PROJ-6: millivolt readings above this are treated as implausible (null).
 * A 3S pack tops out at 12 600 mV; 13 500 leaves room for tolerance
 * (qa-report.md BUG-7 — 20 000 let 12.6–20 V pass silently as 100 %).
 */
const MAX_PLAUSIBLE_BATTERY_MILLIVOLTS = 13500;

const DEFAULT_SCAN_TIMEOUT_MS = 10000;

/**
 * Singleton BleManager instance. Instantiating BleManager more than once leaks
 * the native Bluetooth stack, so every consumer of this module must import
 * this shared instance rather than creating their own.
 */
export const bleManager: BleManager = new BleManager();

/**
 * Scans for nearby slider devices, filtered by SLIDER_SERVICE_UUID, and
 * auto-connects to the first match found (no device picker — a deliberate
 * product decision since there's only ever one slider to pair with).
 *
 * @param onFound Called once with the first matching device. Scanning is
 *   stopped automatically before this fires.
 * @param onTimeout Called if no matching device is found within timeoutMs.
 *   Not called if a device was already found (or the scan was cancelled).
 * @param timeoutMs How long to scan before giving up. Defaults to 10000ms.
 * @returns A cancel function that stops the scan early (e.g. when a manual
 *   retry interrupts a previous, still-running attempt). Safe to call after
 *   the scan has already resolved (found/timed out) — it becomes a no-op.
 */
export function scanForSlider(
  onFound: (device: Device) => void,
  onTimeout: () => void,
  timeoutMs: number = DEFAULT_SCAN_TIMEOUT_MS,
): () => void {
  let settled = false;

  const stopScan = (): void => {
    bleManager.stopDeviceScan();
  };

  const finish = (fn: () => void): void => {
    if (settled) {
      return;
    }
    settled = true;
    stopScan();
    clearTimeout(timeoutHandle);
    fn();
  };

  const timeoutHandle = setTimeout(() => {
    finish(onTimeout);
  }, timeoutMs);

  bleManager.startDeviceScan(
    [SLIDER_SERVICE_UUID],
    null,
    (error, device) => {
      if (settled) {
        return;
      }
      if (error) {
        // Scanning failed; treat it like a timeout so callers have a single
        // "no device" path to handle. The error itself isn't surfaced here —
        // this module intentionally keeps its API small.
        finish(onTimeout);
        return;
      }
      if (device) {
        finish(() => onFound(device));
      }
    },
  );

  return () => {
    finish(() => {});
  };
}

/**
 * Connects to the given device and discovers all of its services and
 * characteristics so subsequent reads/writes/notifications can be set up by
 * callers. This call itself is a plain GATT connect — it does not initiate
 * bonding. Since PROJ-2's BUG-3 fix, writing the command characteristic
 * requires a bonded/encrypted link; the OS handles that pairing handshake
 * transparently the first time such a write actually happens (see
 * ConnectionProvider.tsx's post-connect sendStopCommand()).
 *
 * @returns The connected Device, with services/characteristics discovered.
 */
export async function connectToSlider(device: Device): Promise<Device> {
  const connectedDevice = await device.connect();
  return connectedDevice.discoverAllServicesAndCharacteristics();
}

/**
 * Subscribes to a device's unexpected-disconnect event.
 *
 * @returns An unsubscribe function.
 */
export function subscribeToDisconnect(
  device: Device,
  callback: () => void,
): () => void {
  const subscription = device.onDisconnected(() => {
    callback();
  });

  return () => {
    subscription.remove();
  };
}

/**
 * Sends a JOG command: direction + speed (1-100%). Meant to be called
 * repeatedly (~every 300ms) while a direction button is held — the
 * firmware's watchdog auto-stops if these stop arriving.
 *
 * qa-report.md BUG-16 (PROJ-2): used to write WITHOUT response, on the
 * (wrong) assumption that a single lost packet is harmless since this
 * repeats. Reported live on hardware: after an AUTO_DRIVE (Start→Ende or
 * Ende→Start), jog stopped moving the carriage — while the app's own status
 * view (`driving`) still read false the whole time, so nothing here could
 * tell the difference between "not jogging because idle" and "not jogging
 * because the write isn't taking effect". Write-without-response gives no
 * delivery confirmation at all, which made this impossible to diagnose from
 * the app side. Switched to WithResponse, matching every other command's
 * already-proven pattern — this alone did not close the gap on hardware
 * (see qa-report.md's Nachtrag for the full diagnosis, including a firmware
 * hypothesis this fix does not itself address); still the correct change on
 * its own merits (delivery confirmation, consistency with the rest of the
 * protocol), kept regardless of whatever else BUG-16 turns out to need. The
 * small extra GATT round-trip per 300ms tick is not perceptible against
 * JOG_REPEAT_INTERVAL_MS.
 */
export async function sendJogCommand(
  device: Device,
  direction: JogDirection,
  speedPercent: number,
): Promise<void> {
  const payload = new Uint8Array([
    JOG_OPCODE,
    JOG_DIRECTION_BYTE[direction],
    speedPercent,
  ]);

  await device.writeCharacteristicWithResponseForService(
    SLIDER_SERVICE_UUID,
    SLIDER_COMMAND_CHAR_UUID,
    fromByteArray(payload),
  );
}

/**
 * Sends a STOP command (no payload). Write WITH response — this is the
 * safety-critical path (button release, direction conflict), worth the
 * extra round-trip for delivery confirmation.
 */
export async function sendStopCommand(device: Device): Promise<void> {
  const payload = new Uint8Array([STOP_OPCODE]);

  await device.writeCharacteristicWithResponseForService(
    SLIDER_SERVICE_UUID,
    SLIDER_COMMAND_CHAR_UUID,
    fromByteArray(payload),
  );
}

/**
 * Sends a SET_START command (no payload): the firmware records its current
 * position as the start point. Write WITH response — safety-relevant,
 * one-shot command, not a repeated heartbeat like JOG.
 */
export async function sendSetStartCommand(device: Device): Promise<void> {
  const payload = new Uint8Array([SET_START_OPCODE]);

  await device.writeCharacteristicWithResponseForService(
    SLIDER_SERVICE_UUID,
    SLIDER_COMMAND_CHAR_UUID,
    fromByteArray(payload),
  );
}

/**
 * Sends a SET_END command (no payload): the firmware records its current
 * position as the end point. Write WITH response — same rationale as
 * sendSetStartCommand.
 */
export async function sendSetEndCommand(device: Device): Promise<void> {
  const payload = new Uint8Array([SET_END_OPCODE]);

  await device.writeCharacteristicWithResponseForService(
    SLIDER_SERVICE_UUID,
    SLIDER_COMMAND_CHAR_UUID,
    fromByteArray(payload),
  );
}

/**
 * Sends an AUTO_DRIVE command: direction + duration. The firmware computes
 * the required speed itself from its own start/end distance, so only the
 * direction and the target duration are sent. Write WITH response — same
 * safety rationale as sendSetStartCommand/sendSetEndCommand.
 *
 * @param durationSeconds Target duration in seconds. Rounded to the nearest
 *   tenth of a second and encoded as a uint16 in tenths of a second (e.g.
 *   10.5s -> 105), clamped defensively to the uint16 range.
 */
export async function sendAutoDriveCommand(
  device: Device,
  direction: AutoDriveDirection,
  durationSeconds: number,
): Promise<void> {
  const durationDeciseconds = Math.min(
    65535,
    Math.max(0, Math.round(durationSeconds * 10)),
  );

  const payload = new Uint8Array([
    AUTO_DRIVE_OPCODE,
    AUTO_DRIVE_DIRECTION_BYTE[direction],
    durationDeciseconds & 0xff,
    (durationDeciseconds >> 8) & 0xff,
  ]);

  await device.writeCharacteristicWithResponseForService(
    SLIDER_SERVICE_UUID,
    SLIDER_COMMAND_CHAR_UUID,
    fromByteArray(payload),
  );
}

/**
 * Sends a SET_END_FROM_DISTANCE command: direction (relative to the start
 * point) + a distance in steps. Unlike sendSetEndCommand, this does not
 * require the carriage to have physically visited the end point — it lets
 * PROJ-4 load a saved preset's end point directly from its stored
 * distance/direction, computed relative to whatever the current start point
 * is. Write WITH response — same safety rationale as
 * sendSetStartCommand/sendSetEndCommand/sendAutoDriveCommand.
 *
 * @param endIsAfterStart true if the end point lies at-or-after the start
 *   point (increasing step count), false if it lies before it (decreasing
 *   step count).
 * @param distanceSteps Distance in steps between start and end, encoded as
 *   an unsigned 32-bit little-endian integer.
 */
export async function sendSetEndFromDistanceCommand(
  device: Device,
  endIsAfterStart: boolean,
  distanceSteps: number,
): Promise<void> {
  const directionByte = endIsAfterStart
    ? END_FROM_DISTANCE_DIRECTION_BYTE.atOrAfterStart
    : END_FROM_DISTANCE_DIRECTION_BYTE.beforeStart;

  const payload = new Uint8Array([
    SET_END_FROM_DISTANCE_OPCODE,
    directionByte,
    distanceSteps & 0xff,
    (distanceSteps >>> 8) & 0xff,
    (distanceSteps >>> 16) & 0xff,
    (distanceSteps >>> 24) & 0xff,
  ]);

  await device.writeCharacteristicWithResponseForService(
    SLIDER_SERVICE_UUID,
    SLIDER_COMMAND_CHAR_UUID,
    fromByteArray(payload),
  );
}

/**
 * Sends a TIMELAPSE_MOVE command: direction (relative to the start point) +
 * a distance in steps. Used by the timelapse mode to advance the carriage by
 * one step-interval at a time between shots — unlike
 * sendSetEndFromDistanceCommand, this does not touch the firmware's
 * startPosition/endPosition at all, it just moves the carriage. Byte layout
 * is identical to sendSetEndFromDistanceCommand (same opcode-then-direction-
 * then-distance shape). Write WITH response — same safety rationale as
 * sendSetStartCommand/sendSetEndCommand/sendAutoDriveCommand/
 * sendSetEndFromDistanceCommand.
 *
 * @param endIsAfterStart true if the target point lies at-or-after the start
 *   point (increasing step count), false if it lies before it (decreasing
 *   step count).
 * @param distanceStepsFromStart Distance in steps from the start point,
 *   encoded as an unsigned 32-bit little-endian integer.
 */
export async function sendTimelapseMoveCommand(
  device: Device,
  endIsAfterStart: boolean,
  distanceStepsFromStart: number,
): Promise<void> {
  const directionByte = endIsAfterStart
    ? END_FROM_DISTANCE_DIRECTION_BYTE.atOrAfterStart
    : END_FROM_DISTANCE_DIRECTION_BYTE.beforeStart;

  const payload = new Uint8Array([
    TIMELAPSE_MOVE_OPCODE,
    directionByte,
    distanceStepsFromStart & 0xff,
    (distanceStepsFromStart >>> 8) & 0xff,
    (distanceStepsFromStart >>> 16) & 0xff,
    (distanceStepsFromStart >>> 24) & 0xff,
  ]);

  await device.writeCharacteristicWithResponseForService(
    SLIDER_SERVICE_UUID,
    SLIDER_COMMAND_CHAR_UUID,
    fromByteArray(payload),
  );
}

/**
 * Pure decoder for the Status characteristic's Notify payload — no BLE calls,
 * just bytes in, SliderStatus out. Exported separately so it's directly
 * unit-testable without mocking BLE.
 *
 * Wire format (firmware/src/ble.cpp):
 *  - byte 0: flags bitfield — bit 0 hasStart, bit 1 hasEnd, bit 2 atStart,
 *    bit 3 atEnd, bit 4 driving, bit 5 timelapseMoving
 *  - bytes 1-4: distance in steps between start and end (uint32,
 *    little-endian) — only meaningful when hasStart && hasEnd are both true
 *  - byte 5: 0x00 when the end point is at-or-after the start point
 *    (increasing step-count direction), 0x01 when it's before (decreasing
 *    direction) — only meaningful when hasStart && hasEnd are both true
 *  - PROJ-6: flags bit 6 batteryLocked, bit 7 moving; bytes 6-7 battery
 *    voltage in millivolts (uint16, little-endian), 0 = no value yet;
 *    byte 8 lock reason (0 none, 1 low battery, 2 measurement fault);
 *    byte 9 seconds until shutdown (0 = none).
 *    A 6-byte payload (older firmware) reads as no battery value, not
 *    locked, not moving; an 8-byte payload (PROJ-6 before the refine)
 *    reads a set bit 6 as reason 'lowBattery', no countdown.
 */
export function parseStatusPayload(base64Value: string): SliderStatus {
  const bytes = toByteArray(base64Value);
  const flags = bytes[0] ?? 0;

  const hasStart = (flags & 0x01) !== 0;
  const hasEnd = (flags & 0x02) !== 0;
  const atStart = (flags & 0x04) !== 0;
  const atEnd = (flags & 0x08) !== 0;
  const driving = (flags & 0x10) !== 0;
  // Valid regardless of hasStart/hasEnd — unlike distanceSteps/endIsAfterStart
  // below, which only make sense once both a start and an end point exist.
  const timelapseMoving = (flags & 0x20) !== 0;
  const batteryLocked = (flags & 0x40) !== 0;
  const moving = (flags & 0x80) !== 0;

  let batteryMillivolts: number | null = null;
  if (bytes.length >= 8) {
    const raw = (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8);
    batteryMillivolts = raw === 0 || raw > MAX_PLAUSIBLE_BATTERY_MILLIVOLTS ? null : raw;
  }

  let lockReason: LockReason = 'none';
  if (batteryLocked) {
    lockReason = bytes.length >= 9 && bytes[8] === 2 ? 'measurementFault' : 'lowBattery';
  }
  const rawSeconds = bytes.length >= 10 ? bytes[9] ?? 0 : 0;
  const shutdownSeconds = batteryLocked && rawSeconds > 0 && rawSeconds <= 60 ? rawSeconds : null;

  let distanceSteps: number | null = null;
  let endIsAfterStart: boolean | null = null;
  if (hasStart && hasEnd) {
    // Combine as an unsigned 32-bit little-endian value.
    distanceSteps =
      ((bytes[1] ?? 0) |
        ((bytes[2] ?? 0) << 8) |
        ((bytes[3] ?? 0) << 16) |
        ((bytes[4] ?? 0) << 24)) >>>
      0;
    endIsAfterStart = (bytes[5] ?? 0) === 0x00;
  }

  return {
    hasStart,
    hasEnd,
    atStart,
    atEnd,
    driving,
    distanceSteps,
    endIsAfterStart,
    timelapseMoving,
    batteryMillivolts,
    batteryLocked,
    moving,
    lockReason,
    shutdownSeconds,
  };
}

/**
 * Subscribes to the Status characteristic's notifications, decoding each
 * incoming payload with parseStatusPayload() and forwarding it to callback.
 *
 * @returns An unsubscribe function, matching subscribeToDisconnect()'s shape.
 */
export function subscribeToStatus(
  device: Device,
  callback: (status: SliderStatus) => void,
): () => void {
  const subscription = device.monitorCharacteristicForService(
    SLIDER_SERVICE_UUID,
    SLIDER_STATUS_CHAR_UUID,
    (error, characteristic) => {
      if (error || !characteristic || characteristic.value === null) {
        return;
      }
      callback(parseStatusPayload(characteristic.value));
    },
  );

  return () => {
    subscription.remove();
  };
}
