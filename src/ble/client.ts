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
import { fromByteArray } from 'base64-js';

/**
 * Fixed contract with the firmware — do not change without coordinating a
 * firmware update (see firmware/ in this repo).
 */
export const SLIDER_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

/** Command characteristic UUID — fixed contract with the firmware (firmware/src/ble.cpp). */
export const SLIDER_COMMAND_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

const JOG_OPCODE = 0x01;
const STOP_OPCODE = 0x05;

const JOG_DIRECTION_BYTE: Record<JogDirection, number> = {
  forward: 0x00,
  backward: 0x01,
};

export type JogDirection = 'forward' | 'backward';

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
 * Connects to the given device (plain GATT connect, no bonding/pairing) and
 * discovers all of its services and characteristics so subsequent reads/
 * writes/notifications can be set up by callers.
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
 * firmware's watchdog auto-stops if these stop arriving. Write WITHOUT
 * response: a single lost packet is harmless since this repeats.
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

  await device.writeCharacteristicWithoutResponseForService(
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
