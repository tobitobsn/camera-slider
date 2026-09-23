import React from 'react';
import { AppState } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

import { bleManager } from '../ble/client';
import { requestBlePermissions } from '../permissions/requestBlePermissions';
import { ConnectionProvider, useConnection } from './ConnectionProvider';

// jest.mock calls are hoisted above these imports by babel-plugin-jest-hoist,
// so this works despite appearing after the import it mocks.
jest.mock('../permissions/requestBlePermissions', () => ({
  requestBlePermissions: jest.fn(),
  openAppSettings: jest.fn(),
}));

function StatusProbe({ onStatus }: { onStatus: (status: string) => void }) {
  const { state } = useConnection();
  onStatus(state.status);
  return null;
}

function RequestScanProbe({ onReady }: { onReady: (requestScan: () => void) => void }) {
  const { requestScan } = useConnection();
  onReady(requestScan);
  return null;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ConnectionProvider', () => {
  beforeEach(() => {
    // startDeviceScan needs a per-test mockReset (not just clearAllMocks,
    // which only wipes call history, not a mock's implementation): several
    // tests give it a full mockImplementation, and that would otherwise
    // leak into the next test once its own mockImplementationOnce is
    // consumed. bleManager.onStateChange / AppState.addEventListener keep
    // the baked-in defaults from their mock modules (they return a real
    // `{ remove }`), so they aren't reset here.
    (bleManager.startDeviceScan as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // AC-6: permission refused -> permission_denied, no crash
  it('moves to permission_denied when permissions are refused', async () => {
    (requestBlePermissions as jest.Mock).mockResolvedValue(false);
    let lastStatus = '';
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ConnectionProvider>
          <StatusProbe onStatus={s => (lastStatus = s)} />
        </ConnectionProvider>,
      );
    });
    await flushMicrotasks();

    expect(lastStatus).toBe('permission_denied');
    // No scan was ever started from this state, so nothing to clean up —
    // but unmount anyway for symmetry with the other tests.
    await act(async () => renderer.unmount());
  });

  // AC-1 + AC-2: permission granted -> scan starts automatically
  it('starts scanning once permissions are granted', async () => {
    (requestBlePermissions as jest.Mock).mockResolvedValue(true);
    let lastStatus = '';
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ConnectionProvider>
          <StatusProbe onStatus={s => (lastStatus = s)} />
        </ConnectionProvider>,
      );
    });
    await flushMicrotasks();

    expect(lastStatus).toBe('scanning');
    expect(bleManager.startDeviceScan).toHaveBeenCalled();

    // Unmounting runs the scanning effect's cleanup (the cancel function
    // scanForSlider returned), which clears its real 10s scan-timeout timer
    // — otherwise it fires after this test has already finished.
    await act(async () => renderer.unmount());
  });

  // BUG-3 / QA finding U-2: an interrupted connect must not leave a real
  // GATT link the app no longer tracks.
  it('cancels the native connection attempt when the connecting effect is torn down mid-attempt', async () => {
    (requestBlePermissions as jest.Mock).mockResolvedValue(true);

    const fakeDevice = {
      name: 'CameraSlider',
      // Never resolves during this test — simulates "still connecting"
      // at the moment the effect is torn down.
      connect: jest.fn(() => new Promise(() => {})),
      cancelConnection: jest.fn().mockResolvedValue(undefined),
    };

    (bleManager.startDeviceScan as jest.Mock).mockImplementation(
      (_uuids: string[], _options: unknown, listener: (error: unknown, device: unknown) => void) => {
        listener(null, fakeDevice);
      },
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ConnectionProvider>
          <StatusProbe onStatus={() => {}} />
        </ConnectionProvider>,
      );
    });
    await flushMicrotasks();

    // scanForSlider found fakeDevice synchronously -> DEVICE_FOUND ->
    // 'connecting' -> the connecting effect calls fakeDevice.connect(),
    // which is now pending forever.
    expect(fakeDevice.connect).toHaveBeenCalled();
    expect(fakeDevice.cancelConnection).not.toHaveBeenCalled();

    // Tearing the tree down while still "connecting" must actively cancel
    // the native attempt, not just flip an internal flag.
    await act(async () => renderer.unmount());

    expect(fakeDevice.cancelConnection).toHaveBeenCalledTimes(1);
  });

  // BUG-3 / QA finding U-2: same guarantee for the reconnect-loop effect —
  // tearing it down (e.g. unmount, or a manual REQUEST_SCAN per EC-1) must
  // also cancel whatever native attempt it may have in flight.
  it('cancels the native connection when the reconnect-loop effect is torn down', async () => {
    (requestBlePermissions as jest.Mock).mockResolvedValue(true);

    let capturedDisconnectListener: (() => void) | undefined;
    const fakeDevice: Record<string, jest.Mock> = {
      connect: jest.fn(),
      discoverAllServicesAndCharacteristics: jest.fn(),
      onDisconnected: jest.fn((listener: () => void) => {
        capturedDisconnectListener = listener;
        return { remove: jest.fn() };
      }),
      cancelConnection: jest.fn().mockResolvedValue(undefined),
    };
    fakeDevice.connect.mockResolvedValue(fakeDevice);
    fakeDevice.discoverAllServicesAndCharacteristics.mockResolvedValue(fakeDevice);

    (bleManager.startDeviceScan as jest.Mock).mockImplementation(
      (_uuids: string[], _options: unknown, listener: (error: unknown, device: unknown) => void) => {
        listener(null, fakeDevice);
      },
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ConnectionProvider>
          <StatusProbe onStatus={() => {}} />
        </ConnectionProvider>,
      );
    });
    await flushMicrotasks(); // scanning -> connecting -> connected (connect() resolves immediately)

    expect(capturedDisconnectListener).toBeDefined();
    // Regression check for the self-cancellation bug the security re-audit
    // found: connecting -> connected is itself a status change, which tears
    // the connecting effect down — its cleanup must NOT cancel the
    // connection it just successfully established.
    expect(fakeDevice.cancelConnection).not.toHaveBeenCalled();

    // Simulate an unexpected disconnect -> 'reconnecting', which schedules a
    // 3s-delayed retry but hasn't called connect() again yet.
    await act(async () => {
      capturedDisconnectListener?.();
    });
    await flushMicrotasks();

    // Tear the reconnect-loop effect down before its 3s timer ever fires.
    await act(async () => renderer.unmount());

    expect(fakeDevice.cancelConnection).toHaveBeenCalled();
  });

  // Regression check for the same self-cancellation bug (see the test
  // above), specifically for the reconnect-loop effect's own `settled`
  // guard: a *successful* reconnect must not cancel itself either.
  it('does not cancel a reconnect attempt that succeeds', async () => {
    jest.useFakeTimers();
    try {
      (requestBlePermissions as jest.Mock).mockResolvedValue(true);

      let capturedDisconnectListener: (() => void) | undefined;
      const fakeDevice: Record<string, jest.Mock> = {
        connect: jest.fn(),
        discoverAllServicesAndCharacteristics: jest.fn(),
        onDisconnected: jest.fn((listener: () => void) => {
          capturedDisconnectListener = listener;
          return { remove: jest.fn() };
        }),
        cancelConnection: jest.fn().mockResolvedValue(undefined),
      };
      fakeDevice.connect.mockResolvedValue(fakeDevice);
      fakeDevice.discoverAllServicesAndCharacteristics.mockResolvedValue(fakeDevice);

      (bleManager.startDeviceScan as jest.Mock).mockImplementation(
        (_uuids: string[], _options: unknown, listener: (error: unknown, device: unknown) => void) => {
          listener(null, fakeDevice);
        },
      );

      let lastStatus = '';
      await act(async () => {
        ReactTestRenderer.create(
          <ConnectionProvider>
            <StatusProbe onStatus={s => (lastStatus = s)} />
          </ConnectionProvider>,
        );
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      }); // scanning -> connecting -> connected
      expect(lastStatus).toBe('connected');

      await act(async () => {
        capturedDisconnectListener?.();
      }); // connected -> reconnecting, schedules the 3s retry
      await act(async () => {
        await Promise.resolve();
      });
      fakeDevice.cancelConnection.mockClear(); // discard the (now correctly absent) initial-connect noise

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      }); // the retry fires, connect() resolves -> RECONNECT_SUCCEEDED -> 'connected'
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(lastStatus).toBe('connected');
      expect(fakeDevice.cancelConnection).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // BUG-4 / QA finding EC-3: returning to the foreground with a dead link
  // must trigger a fresh scan, not a 30s retry against the old device.
  it('moves connected -> scanning (not reconnecting) when the foreground check finds the link dead', async () => {
    (requestBlePermissions as jest.Mock).mockResolvedValue(true);

    let appStateListener: ((state: string) => void) | undefined;
    (AppState.addEventListener as jest.Mock).mockImplementation(
      (_event: string, listener: (state: string) => void) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      },
    );

    const fakeDevice: Record<string, jest.Mock> = {
      connect: jest.fn(),
      discoverAllServicesAndCharacteristics: jest.fn(),
      onDisconnected: jest.fn(() => ({ remove: jest.fn() })),
      cancelConnection: jest.fn().mockResolvedValue(undefined),
      // The foreground check's liveness probe — the link is actually gone.
      isConnected: jest.fn().mockResolvedValue(false),
    };
    fakeDevice.connect.mockResolvedValue(fakeDevice);
    fakeDevice.discoverAllServicesAndCharacteristics.mockResolvedValue(fakeDevice);

    // Only the *first* scan finds a device — a re-scan triggered by the
    // foreground check should be observable as 'scanning' rather than
    // racing straight back to 'connected' within the same flush.
    (bleManager.startDeviceScan as jest.Mock).mockImplementationOnce(
      (_uuids: string[], _options: unknown, listener: (error: unknown, device: unknown) => void) => {
        listener(null, fakeDevice);
      },
    );

    let lastStatus = '';
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ConnectionProvider>
          <StatusProbe onStatus={s => (lastStatus = s)} />
        </ConnectionProvider>,
      );
    });
    await flushMicrotasks(); // scanning -> connecting -> connected
    expect(lastStatus).toBe('connected');
    expect(appStateListener).toBeDefined();

    // App returns to the foreground; isConnected() says the link is gone.
    await act(async () => {
      await appStateListener?.('active');
    });
    await flushMicrotasks();

    expect(fakeDevice.isConnected).toHaveBeenCalled();
    expect(lastStatus).toBe('scanning');
    // The re-scan really did start a new native scan (2nd call overall) —
    // not just move a status label.
    expect(bleManager.startDeviceScan).toHaveBeenCalledTimes(2);

    await act(async () => renderer.unmount());
  });

  // QA finding NEU-2 (re-verification): granting the permission must not
  // be mistaken for "Bluetooth is on" — a BLUETOOTH_OFF event that arrived
  // while permission_denied was active (now sticky, per BUG-2) is never
  // re-delivered by onStateChange, since that only fires on a *change*.
  it('moves permission_denied -> bluetooth_off (not scanning) when Bluetooth is still off after granting', async () => {
    (requestBlePermissions as jest.Mock).mockResolvedValueOnce(false); // initial mount -> permission_denied

    let appStateListener: ((state: string) => void) | undefined;
    (AppState.addEventListener as jest.Mock).mockImplementation(
      (_event: string, listener: (state: string) => void) => {
        appStateListener = listener;
        return { remove: jest.fn() };
      },
    );

    let lastStatus = '';
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ConnectionProvider>
          <StatusProbe onStatus={s => (lastStatus = s)} />
        </ConnectionProvider>,
      );
    });
    await flushMicrotasks();
    expect(lastStatus).toBe('permission_denied');
    expect(appStateListener).toBeDefined();

    // User granted the permission in OS settings, but Bluetooth is still off.
    (requestBlePermissions as jest.Mock).mockResolvedValueOnce(true);
    (bleManager.state as jest.Mock).mockResolvedValueOnce('PoweredOff');

    await act(async () => {
      await appStateListener?.('active');
    });
    await flushMicrotasks();

    expect(lastStatus).toBe('bluetooth_off');

    await act(async () => renderer.unmount());
  });

  // QA finding NEU-3 (re-verification): REQUEST_SCAN is valid from
  // 'connected' too (BUG-4's fix uses it) — a future caller of requestScan()
  // while still connected must not orphan the live GATT link the way BUG-3
  // originally did for connect/reconnect.
  it('releases the live connection before scanning fresh when requestScan() is called while connected', async () => {
    (requestBlePermissions as jest.Mock).mockResolvedValue(true);

    const fakeDevice: Record<string, jest.Mock> = {
      connect: jest.fn(),
      discoverAllServicesAndCharacteristics: jest.fn(),
      onDisconnected: jest.fn(() => ({ remove: jest.fn() })),
      cancelConnection: jest.fn().mockResolvedValue(undefined),
    };
    fakeDevice.connect.mockResolvedValue(fakeDevice);
    fakeDevice.discoverAllServicesAndCharacteristics.mockResolvedValue(fakeDevice);

    (bleManager.startDeviceScan as jest.Mock).mockImplementationOnce(
      (_uuids: string[], _options: unknown, listener: (error: unknown, device: unknown) => void) => {
        listener(null, fakeDevice);
      },
    );

    let lastStatus = '';
    let requestScan: (() => void) | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <ConnectionProvider>
          <StatusProbe onStatus={s => (lastStatus = s)} />
          <RequestScanProbe onReady={fn => (requestScan = fn)} />
        </ConnectionProvider>,
      );
    });
    await flushMicrotasks(); // scanning -> connecting -> connected
    expect(lastStatus).toBe('connected');
    expect(fakeDevice.cancelConnection).not.toHaveBeenCalled(); // the BUG-3-regression check, once more

    await act(async () => {
      requestScan?.();
    });
    await flushMicrotasks();

    expect(lastStatus).toBe('scanning');
    expect(fakeDevice.cancelConnection).toHaveBeenCalledTimes(1);

    await act(async () => renderer.unmount());
  });
});
