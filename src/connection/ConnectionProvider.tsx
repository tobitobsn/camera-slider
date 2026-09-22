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
    connectToSlider(device)
      .then(connectedDevice => {
        if (cancelled) return;
        deviceRef.current = connectedDevice;
        disconnectSubRef.current = subscribeToDisconnect(connectedDevice, () => {
          dispatch({ type: 'UNEXPECTED_DISCONNECT' });
        });
        dispatch({
          type: 'CONNECT_SUCCEEDED',
          deviceName: connectedDevice.name ?? 'CameraSlider',
        });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'CONNECT_FAILED' });
      });

    return () => {
      cancelled = true;
      // BUG-3 / QA finding U-2: setting the flag alone doesn't stop the
      // native connect — connectToSlider(device) can still succeed after
      // this effect tore down (e.g. EC-1 firing mid-attempt), leaving a
      // real GATT link the app no longer tracks. Actively tear it down too.
      device.cancelConnection().catch(() => {});
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
    const timer = setTimeout(() => {
      connectToSlider(device)
        .then(connectedDevice => {
          if (cancelled) return;
          deviceRef.current = connectedDevice;
          disconnectSubRef.current = subscribeToDisconnect(connectedDevice, () => {
            dispatch({ type: 'UNEXPECTED_DISCONNECT' });
          });
          dispatch({
            type: 'RECONNECT_SUCCEEDED',
            deviceName: connectedDevice.name ?? 'CameraSlider',
          });
        })
        .catch(() => {
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
    // behind this effect's back. Safe to call even if nothing was pending.
    return () => {
      cancelled = true;
      clearTimeout(timer);
      device.cancelConnection().catch(() => {});
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

  const value = useMemo(() => ({ state, requestScan }), [state, requestScan]);

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
