import { useCallback, useEffect, useState } from 'react';
import type { Device } from 'react-native-ble-plx';

import { sendSetHoldCommand } from '../ble/client';

/**
 * After a successful send, the pending value is dropped at the latest after
 * this long even if no matching status arrived — e.g. the slider ignored the
 * command because it locked itself in the same moment (EC-7). Normally the
 * matching status arrives within a few milliseconds and ends it earlier.
 */
export const HOLD_PENDING_TIMEOUT_MS = 1500;

export type HoldSettingApi = {
  /** What the switch shows: the pending choice while one is in flight, otherwise the reported value. */
  value: boolean | null;
  /** True after a failed send, until the next successful one. */
  sendFailed: boolean;
  toggle: (enabled: boolean) => void;
};

/**
 * PROJ-2 AC-10 / EC-9 (design.md "Was der Schalter zeigt"): the switch
 * follows what the slider reports (`reported`, from the Status notify). While
 * a toggle is in flight it shows the requested value so it doesn't snap back;
 * a failed send reverts to the reported value and raises `sendFailed`.
 * Nothing survives a reconnect — JogControls is remounted, so only the
 * reported value counts afterwards (EC-9).
 */
export function useHoldSetting(device: Device | null, reported: boolean | null): HoldSettingApi {
  const [pending, setPending] = useState<boolean | null>(null);
  const [sent, setSent] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  // The slider confirmed the requested value.
  useEffect(() => {
    if (pending !== null && reported === pending) {
      setPending(null);
      setSent(false);
    }
  }, [pending, reported]);

  // Fallback: sent successfully, but no matching status arrived.
  useEffect(() => {
    if (pending === null || !sent) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setPending(null);
      setSent(false);
    }, HOLD_PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending, sent]);

  const toggle = useCallback(
    (enabled: boolean) => {
      if (!device) {
        return;
      }
      setPending(enabled);
      setSent(false);
      sendSetHoldCommand(device, enabled).then(
        () => {
          setSendFailed(false);
          setSent(true);
        },
        () => {
          setPending(null);
          setSendFailed(true);
        },
      );
    },
    [device],
  );

  return { value: pending ?? reported, sendFailed, toggle };
}
