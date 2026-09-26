import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { Device } from 'react-native-ble-plx';

import {
  sendAutoDriveCommand,
  sendStopCommand,
  sendTimelapseMoveCommand,
  subscribeToStatus,
  type SliderStatus,
} from '../ble/client';
import { useTimelapseSequence, type TimelapseSequenceApi } from './useTimelapseSequence';

// jest.mock calls are hoisted above these imports by babel-plugin-jest-hoist
// — matches useSliderStatus.test.ts's pattern for mocking this module.
jest.mock('../ble/client', () => ({
  sendTimelapseMoveCommand: jest.fn(),
  sendAutoDriveCommand: jest.fn(),
  sendStopCommand: jest.fn(),
  subscribeToStatus: jest.fn(),
}));

// qa-report.md BUG-2: useTimelapseSequence no longer calls useCameraCapture()
// itself (that created a second, unattached photo output — see the hook's
// `capturePhoto` param doc comment) — it receives capturePhoto as a plain
// argument instead, so a bare jest.fn() is enough here, no module mock.
const mockCapturePhoto = jest.fn();

const mockActivate = jest.fn();
const mockDeactivate = jest.fn();
jest.mock('./useKeepAwake', () => ({
  useKeepAwake: () => ({ activate: mockActivate, deactivate: mockDeactivate }),
}));

function fakeDevice(id: string): Device {
  return { id } as unknown as Device;
}

function fullStatus(overrides: Partial<SliderStatus> = {}): SliderStatus {
  return {
    hasStart: true,
    hasEnd: true,
    atStart: true,
    atEnd: false,
    driving: false,
    distanceSteps: 1000,
    endIsAfterStart: true,
    timelapseMoving: false,
    ...overrides,
  };
}

// Models the real BLE Status characteristic: every subscribeToStatus() call
// (there can be several concurrent ones — useSliderStatus's own persistent
// subscription plus a fresh one per waitForStatusCondition() wait) is a
// listener on the very same underlying notify stream, so one broadcast call
// reaches all of them at once, exactly like a single real Notify event
// would.
let statusListeners: Array<(status: SliderStatus) => void> = [];

function broadcastStatus(status: SliderStatus): void {
  statusListeners.forEach(cb => cb(status));
}

// Plain function component using React.createElement (not JSX) since this
// file is .ts, not .tsx — matches useSliderStatus.test.ts's "render a probe
// component with react-test-renderer + act()" approach.
function SequenceProbe({
  device,
  onApi,
}: {
  device: Device | null;
  onApi: (api: TimelapseSequenceApi) => void;
}) {
  const api = useTimelapseSequence(device, mockCapturePhoto);
  onApi(api);
  return null;
}

function renderProbe(
  device: Device | null,
  onApi: (api: TimelapseSequenceApi) => void,
): React.ReactElement {
  return React.createElement(SequenceProbe, { device, onApi });
}

describe('useTimelapseSequence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (sendTimelapseMoveCommand as jest.Mock).mockReset().mockResolvedValue(undefined);
    (sendAutoDriveCommand as jest.Mock).mockReset().mockResolvedValue(undefined);
    (sendStopCommand as jest.Mock).mockReset().mockResolvedValue(undefined);
    mockCapturePhoto.mockReset().mockResolvedValue(undefined);
    mockActivate.mockReset();
    mockDeactivate.mockReset();

    statusListeners = [];
    (subscribeToStatus as jest.Mock).mockReset().mockImplementation((_device, callback) => {
      statusListeners.push(callback);
      return () => {
        statusListeners = statusListeners.filter(cb => cb !== callback);
      };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it(
    'runs a full multi-shot sequence: progress + photo calls are correct, the final step lands ' +
      'exactly on the full distance (no rounding drift), and the return drive is sent at the end',
    async () => {
      const device = fakeDevice('device-1');
      let api: TimelapseSequenceApi | undefined;

      await act(async () => {
        ReactTestRenderer.create(renderProbe(device, a => (api = a)));
        await jest.advanceTimersByTimeAsync(0);
      });

      // Seed the frozen status: 1000 steps, end after start.
      await act(async () => {
        broadcastStatus(fullStatus());
        await jest.advanceTimersByTimeAsync(0);
      });

      // 3 shots, 1s interval: step targets are round(1000*1/2)=500, then
      // round(1000*2/2)=1000 (the full distance, exactly).
      await act(async () => {
        api!.start(3, 1);
        await jest.advanceTimersByTimeAsync(0);
      });

      expect(api!.isRunning).toBe(true);
      expect(api!.currentShot).toBe(1);
      expect(api!.totalShots).toBe(3);
      expect(api!.error).toBeNull();
      expect(mockActivate).toHaveBeenCalledTimes(1);
      expect(mockCapturePhoto).toHaveBeenCalledTimes(1); // shot 1, immediate
      expect(sendTimelapseMoveCommand).toHaveBeenNthCalledWith(1, device, true, 500);

      // Confirm step 2's move started, then arrived.
      await act(async () => {
        broadcastStatus(fullStatus({ timelapseMoving: true }));
        await jest.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        broadcastStatus(fullStatus({ timelapseMoving: false }));
        // Covers the 400ms settle pause + whatever remains of the 1s
        // interval after that.
        await jest.advanceTimersByTimeAsync(1500);
      });

      expect(mockCapturePhoto).toHaveBeenCalledTimes(2);
      expect(api!.currentShot).toBe(2);
      expect(sendTimelapseMoveCommand).toHaveBeenNthCalledWith(2, device, true, 1000);

      // Confirm the final (i=3) step's move started, then arrived.
      await act(async () => {
        broadcastStatus(fullStatus({ timelapseMoving: true }));
        await jest.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        broadcastStatus(fullStatus({ timelapseMoving: false }));
        await jest.advanceTimersByTimeAsync(1500);
      });

      expect(mockCapturePhoto).toHaveBeenCalledTimes(3);
      expect(sendTimelapseMoveCommand).toHaveBeenCalledTimes(2);
      expect(sendAutoDriveCommand).toHaveBeenCalledWith(device, 'endToStart', expect.any(Number));
      expect(api!.isRunning).toBe(false);
      expect(api!.currentShot).toBe(0);
      expect(api!.totalShots).toBe(0);
      expect(api!.error).toBeNull();
      expect(mockDeactivate).toHaveBeenCalledTimes(1);
    },
  );

  it('a start-confirmation notify arriving before the write resolves is still caught (qa-report.md BUG-6)', async () => {
    const device = fakeDevice('device-1');
    let api: TimelapseSequenceApi | undefined;

    // Simulates the notify winning the race against the write's own ATT
    // response — sendTimelapseMoveCommand's mock "arrives" (broadcasts the
    // status change) before its own promise resolves, standing in for the
    // real BLE case this reproduced on hardware. With the subscription set
    // up only after awaiting the write (the pre-fix ordering), this
    // broadcast would already be missed by the time anyone is listening.
    (sendTimelapseMoveCommand as jest.Mock).mockImplementationOnce(async () => {
      broadcastStatus(fullStatus({ timelapseMoving: true }));
    });

    await act(async () => {
      ReactTestRenderer.create(renderProbe(device, a => (api = a)));
      await jest.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      broadcastStatus(fullStatus());
      await jest.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      api!.start(3, 5);
      await jest.advanceTimersByTimeAsync(0);
    });

    // Arrival still needs its own notify — only the start confirmation was
    // pre-empted above.
    await act(async () => {
      broadcastStatus(fullStatus({ timelapseMoving: false }));
      await jest.advanceTimersByTimeAsync(4500);
    });

    expect(api!.error).toBeNull();
    expect(api!.isRunning).toBe(true);
    expect(mockCapturePhoto).toHaveBeenCalledTimes(2);
  });

  it('a start-confirmation timeout (step c) fails the sequence, takes no further shot, and sends no return drive', async () => {
    const device = fakeDevice('device-1');
    let api: TimelapseSequenceApi | undefined;

    await act(async () => {
      ReactTestRenderer.create(renderProbe(device, a => (api = a)));
      await jest.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      broadcastStatus(fullStatus());
      await jest.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      api!.start(3, 5);
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(api!.isRunning).toBe(true);
    expect(sendTimelapseMoveCommand).toHaveBeenCalledTimes(1);

    // Never broadcast timelapseMoving: true — the firmware silently
    // rejected the command. Advance past the 2000ms start-confirm timeout.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2100);
    });

    expect(api!.isRunning).toBe(false);
    expect(api!.error).toMatch(/Zeitüberschreitung/);
    expect(mockCapturePhoto).toHaveBeenCalledTimes(1); // only shot 1, no second
    expect(sendAutoDriveCommand).not.toHaveBeenCalled();
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    // qa-report.md BUG-7: a failed step must stop the carriage (AC-6) — also
    // what clears a hung timelapseMoving flag on the firmware side.
    expect(sendStopCommand).toHaveBeenCalledWith(device);
  });

  it('a photo failure fails the sequence immediately with an error, without sending any move command', async () => {
    const device = fakeDevice('device-1');
    let api: TimelapseSequenceApi | undefined;

    mockCapturePhoto.mockRejectedValueOnce(new Error('Kameraberechtigung fehlt'));

    await act(async () => {
      ReactTestRenderer.create(renderProbe(device, a => (api = a)));
      await jest.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      broadcastStatus(fullStatus());
      await jest.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      api!.start(3, 5);
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(api!.isRunning).toBe(false);
    expect(api!.currentShot).toBe(0);
    expect(api!.error).toMatch(/Foto/);
    expect(sendTimelapseMoveCommand).not.toHaveBeenCalled();
    expect(sendAutoDriveCommand).not.toHaveBeenCalled();
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    // qa-report.md BUG-7: sent unconditionally on any failed run, even one
    // that failed before the carriage ever moved — harmless (motorStop() is
    // always safe) and keeps the rule simple (one path, not "only if a move
    // was in flight").
    expect(sendStopCommand).toHaveBeenCalledWith(device);
  });

  it('stop() aborts immediately without a return drive, and a stray status notify afterwards changes nothing', async () => {
    const device = fakeDevice('device-1');
    let api: TimelapseSequenceApi | undefined;

    await act(async () => {
      ReactTestRenderer.create(renderProbe(device, a => (api = a)));
      await jest.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      broadcastStatus(fullStatus());
      await jest.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      api!.start(3, 5);
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(api!.isRunning).toBe(true);

    act(() => {
      api!.stop();
    });

    expect(api!.isRunning).toBe(false);
    expect(api!.currentShot).toBe(0);
    expect(api!.totalShots).toBe(0);
    expect(sendStopCommand).toHaveBeenCalledWith(device);
    expect(sendAutoDriveCommand).not.toHaveBeenCalled();
    expect(mockDeactivate).toHaveBeenCalledTimes(1);

    // A late notify that would have completed step 2, had the sequence
    // still been running, must not resurrect it.
    await act(async () => {
      broadcastStatus(fullStatus({ timelapseMoving: true }));
      await jest.advanceTimersByTimeAsync(20000);
    });

    expect(mockCapturePhoto).toHaveBeenCalledTimes(1); // still just shot 1
    expect(api!.isRunning).toBe(false);
    expect(sendAutoDriveCommand).not.toHaveBeenCalled();
  });

  it('a disconnect mid-sequence (device becomes null) fails the sequence via the same error path (AC-7)', async () => {
    const device = fakeDevice('device-1');
    let api: TimelapseSequenceApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(renderProbe(device, a => (api = a)));
      await jest.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      broadcastStatus(fullStatus());
      await jest.advanceTimersByTimeAsync(0);
    });

    // start() and the disconnecting re-render are each forced through their
    // own synchronous act() so the null-device render is guaranteed to
    // commit (and this hook's deviceRef along with it) before the async
    // runSequence() continuation below ever gets a chance to run — mixing
    // both into one async act() left the ordering to React's own scheduler,
    // which does not guarantee the render commits before a same-tick
    // microtask resolves under React 19.
    act(() => {
      api!.start(3, 5);
    });
    act(() => {
      // Disconnect right after the (device-independent) first shot, before
      // step 2 gets a chance to read the device.
      renderer.update(renderProbe(null, a => (api = a)));
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(api!.isRunning).toBe(false);
    expect(api!.error).toMatch(/Verbindung/);
    expect(sendTimelapseMoveCommand).not.toHaveBeenCalled();
    expect(sendAutoDriveCommand).not.toHaveBeenCalled();
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
  });
});
