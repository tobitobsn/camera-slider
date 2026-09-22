import React from 'react';
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

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ConnectionProvider', () => {
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
    fakeDevice.cancelConnection.mockClear(); // clear the initial-connect-effect's own (unrelated) cleanup noise

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
});
