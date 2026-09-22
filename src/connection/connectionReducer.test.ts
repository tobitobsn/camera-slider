import {
  connectionReducer,
  initialConnectionState,
  MAX_RECONNECT_ATTEMPTS,
  type ConnectionState,
} from './connectionReducer';

const state = (overrides: Partial<ConnectionState>): ConnectionState => ({
  ...initialConnectionState,
  ...overrides,
});

describe('connectionReducer', () => {
  // AC-1/AC-2: permission + scan bring-up
  it('moves from checking_permissions to scanning once permissions are granted', () => {
    const next = connectionReducer(initialConnectionState, {
      type: 'PERMISSIONS_GRANTED',
    });
    expect(next.status).toBe('scanning');
  });

  it('moves from checking_permissions to permission_denied when permissions are refused', () => {
    const next = connectionReducer(initialConnectionState, {
      type: 'PERMISSIONS_DENIED',
    });
    expect(next.status).toBe('permission_denied');
  });

  // AC-3: successful connect
  it('moves scanning -> connecting -> connected, storing the device name', () => {
    const connecting = connectionReducer(state({ status: 'scanning' }), {
      type: 'DEVICE_FOUND',
      deviceName: 'CameraSlider',
    });
    expect(connecting.status).toBe('connecting');
    expect(connecting.deviceName).toBe('CameraSlider');

    const connected = connectionReducer(connecting, {
      type: 'CONNECT_SUCCEEDED',
      deviceName: 'CameraSlider',
    });
    expect(connected.status).toBe('connected');
    expect(connected.deviceName).toBe('CameraSlider');
    expect(connected.reconnectAttemptsRemaining).toBe(MAX_RECONNECT_ATTEMPTS);
  });

  it('moves connecting -> not_found when the connection attempt itself fails', () => {
    const next = connectionReducer(state({ status: 'connecting' }), {
      type: 'CONNECT_FAILED',
    });
    expect(next.status).toBe('not_found');
    expect(next.deviceName).toBeNull();
  });

  // AC-4: scan timeout
  it('moves scanning -> not_found after a scan timeout', () => {
    const next = connectionReducer(state({ status: 'scanning' }), {
      type: 'SCAN_TIMEOUT',
    });
    expect(next.status).toBe('not_found');
  });

  // AC-5: bluetooth off from (almost) any state, auto-resume on bluetooth on
  it.each<ConnectionState['status']>([
    'checking_permissions',
    'scanning',
    'connecting',
    'connected',
    'reconnecting',
    'not_found',
  ])('moves %s -> bluetooth_off on BLUETOOTH_OFF from any state', status => {
    const next = connectionReducer(state({ status }), { type: 'BLUETOOTH_OFF' });
    expect(next.status).toBe('bluetooth_off');
  });

  // BUG-2 / QA finding U-1: permission_denied is the more fundamental
  // blocker and must not be clobbered by a BLUETOOTH_OFF that happens to
  // land at the same time.
  it('does NOT move permission_denied -> bluetooth_off (permission is the more fundamental blocker)', () => {
    const next = connectionReducer(state({ status: 'permission_denied' }), {
      type: 'BLUETOOTH_OFF',
    });
    expect(next.status).toBe('permission_denied');
  });

  it('auto-resumes scanning when bluetooth is turned back on, without a manual tap', () => {
    const next = connectionReducer(state({ status: 'bluetooth_off' }), {
      type: 'BLUETOOTH_ON',
    });
    expect(next.status).toBe('scanning');
  });

  // BUG-2 / QA finding U-1: a PERMISSIONS_DENIED that arrives while
  // Bluetooth is off must not be silently dropped — otherwise a later
  // BLUETOOTH_ON would resume scanning with no permission at all.
  it('surfaces a permission denial that arrives while bluetooth_off, instead of losing it', () => {
    const denied = connectionReducer(state({ status: 'bluetooth_off' }), {
      type: 'PERMISSIONS_DENIED',
    });
    expect(denied.status).toBe('permission_denied');

    // And bluetooth turning back on afterwards must not paper over the
    // still-missing permission.
    const afterBluetoothOn = connectionReducer(denied, { type: 'BLUETOOTH_ON' });
    expect(afterBluetoothOn.status).toBe('permission_denied');
  });

  // AC-7 + AC-8: unexpected disconnect and the reconnect loop
  it('moves connected -> reconnecting on an unexpected disconnect, resetting attempts', () => {
    const next = connectionReducer(
      state({ status: 'connected', deviceName: 'CameraSlider', reconnectAttemptsRemaining: 3 }),
      { type: 'UNEXPECTED_DISCONNECT' },
    );
    expect(next.status).toBe('reconnecting');
    expect(next.reconnectAttemptsRemaining).toBe(MAX_RECONNECT_ATTEMPTS);
  });

  it('falls back to not_found only after all reconnect attempts (10 × 3s = 30s) are exhausted', () => {
    let current = state({ status: 'reconnecting', reconnectAttemptsRemaining: MAX_RECONNECT_ATTEMPTS });

    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS - 1; i++) {
      current = connectionReducer(current, { type: 'RECONNECT_ATTEMPT_FAILED' });
      expect(current.status).toBe('reconnecting');
    }

    current = connectionReducer(current, { type: 'RECONNECT_ATTEMPT_FAILED' });
    expect(current.status).toBe('not_found');
  });

  it('returns to connected if a reconnect attempt succeeds mid-loop', () => {
    const mid = state({ status: 'reconnecting', reconnectAttemptsRemaining: 4 });
    const next = connectionReducer(mid, {
      type: 'RECONNECT_SUCCEEDED',
      deviceName: 'CameraSlider',
    });
    expect(next.status).toBe('connected');
    expect(next.reconnectAttemptsRemaining).toBe(MAX_RECONNECT_ATTEMPTS);
  });

  // EC-1: manual retry interrupts a running reconnect loop
  it('cancels an in-progress reconnect loop and starts scanning again on REQUEST_SCAN', () => {
    const reconnecting = state({ status: 'reconnecting', reconnectAttemptsRemaining: 6 });
    const next = connectionReducer(reconnecting, { type: 'REQUEST_SCAN' });
    expect(next.status).toBe('scanning');
  });

  it('moves not_found -> scanning on REQUEST_SCAN (the ordinary manual retry)', () => {
    const next = connectionReducer(state({ status: 'not_found' }), {
      type: 'REQUEST_SCAN',
    });
    expect(next.status).toBe('scanning');
  });

  // EC-5: REQUEST_SCAN must never start a second, parallel attempt
  it.each<ConnectionState['status']>(['scanning', 'connecting', 'connected', 'checking_permissions'])(
    'ignores REQUEST_SCAN while %s (no duplicate scan/connect attempt)',
    status => {
      const before = state({ status });
      const after = connectionReducer(before, { type: 'REQUEST_SCAN' });
      expect(after.status).toBe(status);
    },
  );

  // permission_denied / bluetooth_off never self-resolve without the matching event
  it('stays in permission_denied for any action other than PERMISSIONS_GRANTED', () => {
    const next = connectionReducer(state({ status: 'permission_denied' }), {
      type: 'REQUEST_SCAN',
    });
    expect(next.status).toBe('permission_denied');
  });
});
