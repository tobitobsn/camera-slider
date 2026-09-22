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

/**
 * Fixed contract with the firmware — do not change without coordinating a
 * firmware update (see firmware/ in this repo).
 */
export const SLIDER_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

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
