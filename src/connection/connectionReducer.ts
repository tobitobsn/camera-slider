/**
 * Pure state machine for the BLE connection to the slider (PROJ-1).
 *
 * Deliberately a single enum (`status`) rather than independent booleans —
 * see design.md → "Verbindungs-Zustandsmaschine". This file has no side
 * effects (no BLE calls, no timers): ConnectionProvider (a later task)
 * drives it by dispatching actions in response to real BLE/OS events and
 * performs the actual scan/connect/timer work.
 */

export type ConnectionStatus =
  | 'checking_permissions'
  | 'permission_denied'
  | 'bluetooth_off'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'not_found';

/** 10 attempts × 3s interval = 30s total reconnect window (AC-8). */
export const MAX_RECONNECT_ATTEMPTS = 10;

export type ConnectionState = {
  status: ConnectionStatus;
  deviceName: string | null;
  reconnectAttemptsRemaining: number;
};

export const initialConnectionState: ConnectionState = {
  status: 'checking_permissions',
  deviceName: null,
  reconnectAttemptsRemaining: MAX_RECONNECT_ATTEMPTS,
};

export type ConnectionAction =
  | { type: 'PERMISSIONS_GRANTED' }
  | { type: 'PERMISSIONS_DENIED' }
  | { type: 'BLUETOOTH_OFF' }
  | { type: 'BLUETOOTH_ON' }
  | { type: 'DEVICE_FOUND'; deviceName: string }
  | { type: 'SCAN_TIMEOUT' }
  | { type: 'CONNECT_SUCCEEDED'; deviceName: string }
  | { type: 'CONNECT_FAILED' }
  | { type: 'UNEXPECTED_DISCONNECT' }
  | { type: 'RECONNECT_SUCCEEDED'; deviceName: string }
  | { type: 'RECONNECT_ATTEMPT_FAILED' }
  /** User tap on "Erneut suchen", or the app-foreground re-check (EC-3). */
  | { type: 'REQUEST_SCAN' };

/**
 * `BLUETOOTH_OFF` can arrive from any state (the OS can disable the adapter
 * at any time) — handled first, before the per-status switch below.
 * **Except `permission_denied`**: that is the more fundamental blocker (BUG-2
 * / QA finding U-1) — nothing works without the permission regardless of the
 * adapter, and losing track of a denial because a `BLUETOOTH_OFF` event
 * happened to land at the same moment meant the app could later resume
 * scanning with no permission at all. `permission_denied` only ever clears
 * via `PERMISSIONS_GRANTED`.
 *
 * `REQUEST_SCAN` is only meaningful from `not_found` and `reconnecting`
 * (EC-1: interrupts a running reconnect loop and restarts scanning). From
 * `permission_denied`/`bluetooth_off` the "Erneut suchen" button is a pure
 * UI side effect (opens OS settings) and never reaches this reducer; from
 * every other state it is a no-op — this is the reducer's own defense
 * against EC-5 (a duplicate scan/connect attempt), independent of whatever
 * the UI's button-disabled state happens to do.
 */
export function connectionReducer(
  state: ConnectionState,
  action: ConnectionAction,
): ConnectionState {
  if (action.type === 'BLUETOOTH_OFF' && state.status !== 'permission_denied') {
    return { ...state, status: 'bluetooth_off', deviceName: null };
  }

  switch (state.status) {
    case 'checking_permissions':
      if (action.type === 'PERMISSIONS_GRANTED') {
        return { ...state, status: 'scanning' };
      }
      if (action.type === 'PERMISSIONS_DENIED') {
        return { ...state, status: 'permission_denied' };
      }
      return state;

    case 'permission_denied':
      // Re-entering via foreground re-check after the user grants the
      // permission in OS settings and returns to the app.
      if (action.type === 'PERMISSIONS_GRANTED') {
        return { ...state, status: 'scanning' };
      }
      return state;

    case 'bluetooth_off':
      if (action.type === 'BLUETOOTH_ON') {
        // Auto-resume — no tap required (see design.md's technical decision).
        return { ...state, status: 'scanning' };
      }
      if (action.type === 'PERMISSIONS_DENIED') {
        // BUG-2: the permission result can arrive while Bluetooth happens to
        // be off. Surface the denial now rather than silently dropping it —
        // otherwise BLUETOOTH_ON later would resume scanning with no
        // permission at all.
        return { ...state, status: 'permission_denied' };
      }
      return state;

    case 'scanning':
      if (action.type === 'DEVICE_FOUND') {
        return { ...state, status: 'connecting', deviceName: action.deviceName };
      }
      if (action.type === 'SCAN_TIMEOUT') {
        return { ...state, status: 'not_found', deviceName: null };
      }
      return state;

    case 'connecting':
      if (action.type === 'CONNECT_SUCCEEDED') {
        return {
          status: 'connected',
          deviceName: action.deviceName,
          reconnectAttemptsRemaining: MAX_RECONNECT_ATTEMPTS,
        };
      }
      if (action.type === 'CONNECT_FAILED') {
        return { ...state, status: 'not_found', deviceName: null };
      }
      return state;

    case 'connected':
      if (action.type === 'UNEXPECTED_DISCONNECT') {
        return {
          ...state,
          status: 'reconnecting',
          reconnectAttemptsRemaining: MAX_RECONNECT_ATTEMPTS,
        };
      }
      return state;

    case 'reconnecting':
      if (action.type === 'RECONNECT_SUCCEEDED') {
        return {
          status: 'connected',
          deviceName: action.deviceName,
          reconnectAttemptsRemaining: MAX_RECONNECT_ATTEMPTS,
        };
      }
      if (action.type === 'RECONNECT_ATTEMPT_FAILED') {
        const attemptsRemaining = state.reconnectAttemptsRemaining - 1;
        if (attemptsRemaining <= 0) {
          // AC-8: 30s (10 × 3s) without success → fall back to the manual state.
          return { ...state, status: 'not_found', deviceName: null };
        }
        return { ...state, reconnectAttemptsRemaining: attemptsRemaining };
      }
      if (action.type === 'REQUEST_SCAN') {
        // EC-1: manual retry cancels the running reconnect loop.
        return { ...state, status: 'scanning', deviceName: null };
      }
      return state;

    case 'not_found':
      if (action.type === 'REQUEST_SCAN') {
        return { ...state, status: 'scanning' };
      }
      return state;

    default:
      return state;
  }
}
