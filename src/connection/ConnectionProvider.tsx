import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Device } from 'react-native-ble-plx';

import {
  bleManager,
  connectToSlider,
  scanForSlider,
  sendStopCommand,
  subscribeToDisconnect,
} from '../ble/client';
import { requestBlePermissions } from '../permissions/requestBlePermissions';
import {
  connectionReducer,
  initialConnectionState,
  type ConnectionState,
} from './connectionReducer';

const RECONNECT_INTERVAL_MS = 3000;

type ConnectionContextValue = {
  state: ConnectionState;
  /** Dispatches the manual "Erneut suchen" action (valid from not_found/reconnecting). */
  requestScan: () => void;
  /** The live BLE Device while connected, null otherwise (PROJ-2: jog commands need it). */
  device: Device | null;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

/**
 * Orchestrates PROJ-1's connection state machine: requests permissions,
 * scans/connects, watches for disconnects, runs the bounded reconnect loop,
 * and reacts to the Bluetooth adapter and app-foreground events. The pure
 * transition logic lives in connectionReducer.ts — this component only
 * performs the side effects (BLE calls, timers) that drive it.
 */
export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(connectionReducer, initialConnectionState);

  // The actual BLE Device object isn't part of the (serializable, pure)
  // reducer state — it's tracked here, alongside the live disconnect
  // subscription for whichever device is currently relevant.
  const deviceRef = useRef<Device | null>(null);
  const disconnectSubRef = useRef<(() => void) | null>(null);

  const clearDisconnectSubscription = useCallback(() => {
    disconnectSubRef.current?.();
    disconnectSubRef.current = null;
  }, []);

  // --- Permissions (AC-1) -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    requestBlePermissions().then(granted => {
      if (cancelled) return;
      dispatch({ type: granted ? 'PERMISSIONS_GRANTED' : 'PERMISSIONS_DENIED' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Bluetooth adapter state (AC-5, auto-resume) ------------------------
  useEffect(() => {
    const subscription = bleManager.onStateChange(btState => {
      if (btState === 'PoweredOff') {
        dispatch({ type: 'BLUETOOTH_OFF' });
      } else if (btState === 'PoweredOn') {
        // No-op unless we were actually sitting in bluetooth_off — the
        // reducer ignores BLUETOOTH_ON from every other state.
        dispatch({ type: 'BLUETOOTH_ON' });
      }
    }, true);
    return () => subscription.remove();
  }, []);

  // --- Scanning (AC-2, AC-4, AC-9) -----------------------------------------
  useEffect(() => {
    if (state.status !== 'scanning') return;

    clearDisconnectSubscription();
    // QA finding NEU-3: REQUEST_SCAN is valid from 'connected' too (BUG-4's
    // foreground liveness check uses it) — release whatever device was
    // live before starting fresh, the same way BUG-3's fix does for an
    // interrupted connect/reconnect. Today's only caller already confirmed
    // the link is dead first, so this is normally a no-op; it's here so a
    // future caller of requestScan() from 'connected' can't reintroduce
    // BUG-3's orphaned-link problem through this door instead.
    deviceRef.current?.cancelConnection().catch(() => {});
    deviceRef.current = null;

    const cancel = scanForSlider(
      device => {
        deviceRef.current = device;
        dispatch({ type: 'DEVICE_FOUND', deviceName: device.name ?? 'CameraSlider' });
      },
      () => dispatch({ type: 'SCAN_TIMEOUT' }),
    );

    return cancel;
  }, [state.status, clearDisconnectSubscription]);

  // --- Connecting (AC-3) ---------------------------------------------------
  useEffect(() => {
    if (state.status !== 'connecting') return;

    const device = deviceRef.current;
    if (!device) {
      dispatch({ type: 'CONNECT_FAILED' });
      return;
    }

    let cancelled = false;
    // Tracks whether connectToSlider(device) has already settled (resolved
    // OR rejected) by the time this effect tears down. Cleanup runs not
    // only on a genuine interrupt (EC-1) but also on the ordinary SUCCESS
    // path: CONNECT_SUCCEEDED moves state.status to 'connected', and since
    // this effect depends on [state.status], React tears it down right
    // after. Without this guard the cleanup would call cancelConnection()
    // on the device it had JUST successfully connected — instantly undoing
    // every connection and looping connect → cancel → disconnect →
    // reconnect forever. Only cancel while the attempt is still pending.
    let settled = false;
    connectToSlider(device)
      .then(connectedDevice => {
        settled = true;
        if (cancelled) return;
        deviceRef.current = connectedDevice;
        disconnectSubRef.current = subscribeToDisconnect(connectedDevice, () => {
          dispatch({ type: 'UNEXPECTED_DISCONNECT' });
        });
        // PROJ-2 QA finding I-1: the command characteristic now requires a
        // bonded, encrypted link (firmware/src/ble.cpp, BUG-3 fix). JOG is
        // written without response, so an unbonded first write is silently
        // dropped by the BLE stack with no error — Android only starts
        // on-demand bonding off an ATT error, which only a write WITH
        // response produces. Left alone, the very first jog press after a
        // fresh pairing would silently do nothing. Fire a harmless STOP
        // (the motor is already idle right after connecting) in the
        // background to force that handshake to start immediately, well
        // before the user can realistically reach a jog button — fire-and
        // -forget on purpose, not awaited: this file's connect timing has
        // its own hard-won cancellation/settled guards (see BUG-3/NEU-1 in
        // PROJ-1's qa-report.md), and blocking CONNECT_SUCCEEDED on a BLE
        // round-trip would widen that logic's race window for a benefit
        // this fire-and-forget call already gets in practice.
        sendStopCommand(connectedDevice).catch(() => {});
        dispatch({
          type: 'CONNECT_SUCCEEDED',
          deviceName: connectedDevice.name ?? 'CameraSlider',
        });
      })
      .catch(() => {
        settled = true;
        if (!cancelled) dispatch({ type: 'CONNECT_FAILED' });
      });

    return () => {
      cancelled = true;
      // BUG-3 / QA finding U-2: setting the flag alone doesn't stop the
      // native connect — connectToSlider(device) can still succeed after
      // this effect tore down (e.g. EC-1 firing mid-attempt), leaving a
      // real GATT link the app no longer tracks. Actively tear it down —
      // but only while still pending; see the `settled` comment above.
      if (!settled) {
        device.cancelConnection().catch(() => {});
      }
    };
  }, [state.status]);

  // --- Reconnect loop (AC-7, AC-8; cancelled by EC-1 via cleanup) ---------
  useEffect(() => {
    if (state.status !== 'reconnecting') return;

    const device = deviceRef.current;
    if (!device) {
      dispatch({ type: 'RECONNECT_ATTEMPT_FAILED' });
      return;
    }

    let cancelled = false;
    // Same guard as the connecting effect above, and for the same reason:
    // RECONNECT_SUCCEEDED moves status to 'connected', which tears this
    // effect down too — without this flag its cleanup would cancel the
    // connection it had just re-established.
    let settled = false;
    const timer = setTimeout(() => {
      connectToSlider(device)
        .then(connectedDevice => {
          settled = true;
          if (cancelled) return;
          deviceRef.current = connectedDevice;
          disconnectSubRef.current = subscribeToDisconnect(connectedDevice, () => {
            dispatch({ type: 'UNEXPECTED_DISCONNECT' });
          });
          // Same reasoning as the connecting effect above (PROJ-2 QA finding
          // I-1) — bonds persist across reconnects, so this is normally an
          // instant no-op, but it's cheap insurance if the phone or the
          // ESP32 ever forgot the bond independently of each other.
          sendStopCommand(connectedDevice).catch(() => {});
          dispatch({
            type: 'RECONNECT_SUCCEEDED',
            deviceName: connectedDevice.name ?? 'CameraSlider',
          });
        })
        .catch(() => {
          settled = true;
          if (!cancelled) dispatch({ type: 'RECONNECT_ATTEMPT_FAILED' });
        });
    }, RECONNECT_INTERVAL_MS);

    // Leaving `reconnecting` for any reason (success, exhausted, or a manual
    // REQUEST_SCAN per EC-1) tears this effect down and cancels the pending
    // attempt — that's what makes the manual retry an actual interrupt.
    // BUG-3 / QA finding U-2: also actively cancel the native connection
    // attempt, not just the setTimeout — clearTimeout alone doesn't help
    // once the timeout has already fired and connectToSlider is in flight;
    // cancelConnection() is what actually stops a real GATT link forming
    // behind this effect's back. Only while still pending — see `settled`.
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (!settled) {
        device.cancelConnection().catch(() => {});
      }
    };
  }, [state.status, state.reconnectAttemptsRemaining]);

  // --- App-foreground re-check (EC-3, and permission re-check for EC-4) ---
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      async (nextAppState: AppStateStatus) => {
        if (nextAppState !== 'active') return;

        if (state.status === 'connected' && deviceRef.current) {
          const stillConnected = await deviceRef.current
            .isConnected()
            .catch(() => false);
          if (!stillConnected) {
            // BUG-4 / QA finding EC-3: dispatch REQUEST_SCAN, not
            // UNEXPECTED_DISCONNECT — after an unknown amount of background
            // time, retrying the old Device reference through the 30s
            // reconnect loop is less reliable than just scanning fresh, and
            // the spec/design call for a re-scan here, not a reconnect.
            dispatch({ type: 'REQUEST_SCAN' });
          }
          return;
        }

        if (state.status === 'permission_denied') {
          const granted = await requestBlePermissions();
          if (granted) {
            dispatch({ type: 'PERMISSIONS_GRANTED' });
            // BUG-2's fix made permission_denied sticky against
            // BLUETOOTH_OFF, on purpose — but that means a BLUETOOTH_OFF
            // event that arrived while parked here was never recorded
            // (QA finding NEU-2). onStateChange only fires on a *change*,
            // so it can't be trusted to have caught that. Ask the adapter
            // directly instead of assuming "granted" also means "usable".
            const adapterState = await bleManager.state().catch(() => null);
            if (adapterState && adapterState !== 'PoweredOn') {
              dispatch({ type: 'BLUETOOTH_OFF' });
            }
          }
        }
      },
    );
    return () => subscription.remove();
  }, [state.status]);

  // --- Cleanup on unmount ---------------------------------------------------
  useEffect(() => {
    return () => {
      clearDisconnectSubscription();
    };
  }, [clearDisconnectSubscription]);

  const requestScan = useCallback(() => {
    dispatch({ type: 'REQUEST_SCAN' });
  }, []);

  // deviceRef.current is set synchronously before the dispatch that moves
  // state.status to 'connected' (see the connecting/reconnecting effects
  // above), so it already holds the right value by the time this memo
  // recomputes for that state change.
  const value = useMemo(
    () => ({
      state,
      requestScan,
      device: state.status === 'connected' ? deviceRef.current : null,
    }),
    [state, requestScan],
  );

  return (
    <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}
