/**
 * Thin hook subscribing to the slider's Status characteristic (Notify) via
 * `subscribeToStatus()` (src/ble/client.ts) and exposing the decoded
 * SliderStatus as React state — see design.md → "Neuer Hook:
 * useSliderStatus(device)".
 *
 * A separate, focused hook rather than an extension of ConnectionProvider's
 * context — same pattern decision as PROJ-2's useJogState — so
 * ConnectionProvider stays scoped to the connection lifecycle alone.
 * `JogControls` and `AutoDriveControls` (built in later tasks) both
 * subscribe to this same hook.
 *
 * This file has no BLE calls of its own beyond subscribeToStatus() — the
 * actual GATT wiring (and parseStatusPayload's wire-format decoding) lives in
 * src/ble/client.ts (Level 1, already built and tested).
 */
import { useEffect, useState } from 'react';
import type { Device } from 'react-native-ble-plx';

import { subscribeToStatus, type SliderStatus } from '../ble/client';

const INITIAL_STATUS: SliderStatus = {
  hasStart: false,
  hasEnd: false,
  atStart: false,
  atEnd: false,
  driving: false,
  endIsAfterStart: null,
  distanceSteps: null,
  timelapseMoving: false,
  batteryMillivolts: null,
  batteryLocked: false,
  moving: false,
  lockReason: 'none',
  shutdownSeconds: null,
};

/**
 * @param device The live BLE Device to subscribe to, or null while not
 *   connected (ConnectionProvider's `device` field: null except while
 *   `state.status === 'connected'`).
 * @returns The latest known SliderStatus. Resets to the all-false/null
 *   initial shape whenever `device` is null — EC-3's app-side half: no stale
 *   status survives a disconnect (the connection state machine always passes
 *   through a null-device status, e.g. 'scanning'/'reconnecting', between
 *   any two connected devices, so this reset also correctly clears stale
 *   status ahead of a reconnect to a fresh Device instance — there is no
 *   direct old-device -> new-device transition that would need separate
 *   handling beyond the effect's own `[device]` dependency below, which
 *   already unsubscribes from the old device and subscribes to the new one).
 */
export function useSliderStatus(device: Device | null): SliderStatus {
  const [status, setStatus] = useState<SliderStatus>(INITIAL_STATUS);

  useEffect(() => {
    if (!device) {
      setStatus(INITIAL_STATUS);
      return;
    }

    const unsubscribe = subscribeToStatus(device, setStatus);
    return unsubscribe;
  }, [device]);

  return status;
}
