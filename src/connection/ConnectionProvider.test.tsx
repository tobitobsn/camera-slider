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
});
