import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import type { Device } from 'react-native-ble-plx';

// The BLE client creates a native BleManager on import — only the two
// commands this hook sends are needed, so the module is replaced.
const mockSendAutoDrive = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockSendStop = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('../ble/client', () => ({
  sendAutoDriveCommand: (...args: unknown[]) => mockSendAutoDrive(...args),
  sendStopCommand: (...args: unknown[]) => mockSendStop(...args),
}));

const mockSave = jest.fn((..._args: unknown[]) => Promise.resolve('content://video'));
jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: { save: (...args: unknown[]) => mockSave(...args) },
}));

const mockActivate = jest.fn();
const mockDeactivate = jest.fn();
jest.mock('@sayem314/react-native-keep-awake', () => ({
  activateKeepAwake: () => mockActivate(),
  deactivateKeepAwake: () => mockDeactivate(),
}));

import type { SliderStatus } from '../ble/client';
import {
  DRIVE_START_TIMEOUT_MS,
  POSTROLL_MS,
  PREROLL_MS,
  useVideoDrive,
  type VideoDriveApi,
  type VideoRecorderPort,
} from './useVideoDrive';

const DEVICE = { id: 'slider' } as unknown as Device;

const IDLE_STATUS: SliderStatus = {
  hasStart: true,
  hasEnd: true,
  atStart: true,
  atEnd: false,
  driving: false,
  endIsAfterStart: true,
  distanceSteps: 10000,
  timelapseMoving: false,
  batteryMillivolts: 12000,
  batteryLocked: false,
  moving: false,
  lockReason: 'none',
  shutdownSeconds: null,
};

/** A recorder whose stop() hands back a file, like VisionCamera's. */
function fakeRecorder(options: { failStart?: boolean } = {}) {
  let callbacks: { onFinished: (path: string) => void; onError: (e: Error) => void } | null = null;
  const stopRecording = jest.fn(async () => {
    callbacks?.onFinished('/tmp/take.mp4');
  });
  const port: VideoRecorderPort = {
    startRecording: jest.fn(async cbs => {
      if (options.failStart) {
        throw new Error('camera busy');
      }
      callbacks = cbs;
      return { stop: stopRecording };
    }),
  };
  return {
    port,
    stopRecording,
    emitError: (message: string) => callbacks?.onError(new Error(message)),
  };
}

type Props = { device: Device | null; status: SliderStatus; recorder: VideoRecorderPort | null };

function Probe({ onApi, ...props }: Props & { onApi: (api: VideoDriveApi) => void }) {
  onApi(useVideoDrive(props.device, props.status, props.recorder));
  return null;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

let appStateHandler: ((state: string) => void) | null = null;

function setup(recorder: VideoRecorderPort) {
  let api: VideoDriveApi | undefined;
  let props: Props = { device: DEVICE, status: IDLE_STATUS, recorder };
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const element = () => React.createElement(Probe, { ...props, onApi: a => (api = a) });
  act(() => {
    renderer = ReactTestRenderer.create(element());
  });
  return {
    api: () => api as VideoDriveApi,
    async setProps(changes: Partial<Props>) {
      props = { ...props, ...changes };
      await act(async () => {
        renderer?.update(element());
        await flush();
      });
    },
    async advance(ms: number) {
      await act(async () => {
        jest.advanceTimersByTime(ms);
        await flush();
      });
    },
    async run(fn: () => void) {
      await act(async () => {
        fn();
        await flush();
      });
    },
    unmount: () => act(() => renderer?.unmount()),
  };
}

/** Runs a take up to "the carriage is driving". */
async function driveUntilMoving(t: ReturnType<typeof setup>, direction: 'startToEnd' | 'endToStart' = 'startToEnd') {
  await t.run(() => t.api().start(direction, 10));
  await t.advance(PREROLL_MS);
  await t.setProps({ status: { ...IDLE_STATUS, atStart: false, driving: true } });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSendAutoDrive.mockClear();
  mockSendStop.mockClear();
  mockSave.mockClear();
  mockSave.mockImplementation(() => Promise.resolve('content://video'));
  mockActivate.mockClear();
  mockDeactivate.mockClear();
  appStateHandler = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandler = handler as (state: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useVideoDrive — regular take (AC-14, AC-15, AC-27)', () => {
  it('records, waits the pre-roll, drives, waits the post-roll on arrival, stops and saves to the gallery', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);

    await t.run(() => t.api().start('startToEnd', 10));
    expect(t.api().phase).toBe('preroll');
    expect(t.api().busy).toBe(true);
    expect(mockActivate).toHaveBeenCalledTimes(1);

    await t.advance(PREROLL_MS - 1);
    expect(mockSendAutoDrive).not.toHaveBeenCalled();
    await t.advance(1);
    expect(mockSendAutoDrive).toHaveBeenCalledWith(DEVICE, 'startToEnd', 10);
    expect(t.api().phase).toBe('driving');

    await t.setProps({ status: { ...IDLE_STATUS, atStart: false, driving: true } });
    await t.setProps({ status: { ...IDLE_STATUS, atStart: false, atEnd: true, driving: false } });
    expect(t.api().phase).toBe('postroll');

    await t.advance(POSTROLL_MS - 1);
    expect(rec.stopRecording).not.toHaveBeenCalled();
    await t.advance(1);

    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith('file:///tmp/take.mp4', { type: 'video' });
    expect(t.api().phase).toBe('ready');
    expect(t.api().savedCount).toBe(1);
    expect(t.api().error).toBeNull();
    expect(mockDeactivate).toHaveBeenCalled();
    t.unmount();
  });

  it('treats "Ende → Start" as arrived when the carriage reports atStart', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await t.setProps({ status: { ...IDLE_STATUS, atStart: false, atEnd: true } });

    await driveUntilMoving(t, 'endToStart');
    expect(mockSendAutoDrive).toHaveBeenCalledWith(DEVICE, 'endToStart', 10);
    await t.setProps({ status: { ...IDLE_STATUS, atStart: true, driving: false } });

    expect(t.api().phase).toBe('postroll');
    t.unmount();
  });

  it('does not treat "Ende → Start" as arrived when the carriage stops at the end point instead', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await t.setProps({ status: { ...IDLE_STATUS, atStart: false, atEnd: true } });

    await driveUntilMoving(t, 'endToStart');
    await t.setProps({ status: { ...IDLE_STATUS, atStart: false, atEnd: true, driving: false } });

    expect(t.api().phase).toBe('ready');
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  it('counts the recorded seconds while recording (AC-16)', async () => {
    const t = setup(fakeRecorder().port);
    await t.run(() => t.api().start('startToEnd', 10));

    await t.advance(1000);
    expect(t.api().elapsedSeconds).toBe(1);
    await t.advance(1500);
    expect(t.api().elapsedSeconds).toBe(2);
    t.unmount();
  });
});

describe('useVideoDrive — Stopp (AC-17)', () => {
  it('during the drive: sends STOP, ends the recording at once without post-roll and saves it', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);

    await t.run(() => t.api().stop());

    expect(mockSendStop).toHaveBeenCalledWith(DEVICE);
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(t.api().phase).toBe('ready');
    t.unmount();
  });

  it('during the pre-roll: ends the recording and never starts the drive', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await t.run(() => t.api().start('startToEnd', 10));

    await t.run(() => t.api().stop());
    await t.advance(PREROLL_MS * 2);

    expect(mockSendAutoDrive).not.toHaveBeenCalled();
    expect(mockSendStop).not.toHaveBeenCalled();
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    t.unmount();
  });
});

describe('useVideoDrive — failures (AC-18, AC-19, EC-6, EC-7)', () => {
  it('a recording that cannot start: error, no drive, back to ready', async () => {
    const t = setup(fakeRecorder({ failStart: true }).port);

    await t.run(() => t.api().start('startToEnd', 10));
    await t.advance(PREROLL_MS * 2);

    expect(t.api().error).toContain('Aufnahme konnte nicht starten');
    expect(t.api().phase).toBe('ready');
    expect(mockSendAutoDrive).not.toHaveBeenCalled();
    expect(mockDeactivate).toHaveBeenCalled();
    t.unmount();
  });

  it('a recording error during the drive stops the motor, reports it and saves the part recorded', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);

    await t.run(() => rec.emitError('storage full'));

    expect(mockSendStop).toHaveBeenCalledWith(DEVICE);
    expect(t.api().error).toContain('storage full');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(t.api().phase).toBe('ready');
    t.unmount();
  });

  it('the app going to the background during the pre-roll: the carriage never starts (EC-7)', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await t.run(() => t.api().start('startToEnd', 10));

    await t.run(() => appStateHandler?.('background'));
    await t.advance(PREROLL_MS * 2);

    expect(mockSendAutoDrive).not.toHaveBeenCalled();
    expect(t.api().error).toContain('Hintergrund');
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  it('a lost connection ends and saves the recording without sending STOP (AC-19)', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);

    await t.setProps({ device: null });

    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(mockSendStop).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  it('a stop on the way (not at the target) ends the recording at once, without post-roll (EC-6)', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);

    await t.setProps({ status: { ...IDLE_STATUS, atStart: false, atEnd: false, driving: false, batteryLocked: true } });

    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(t.api().phase).toBe('ready');
    t.unmount();
  });

  it('no "driving" from the firmware within the timeout: reports it and ends the recording', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await t.run(() => t.api().start('startToEnd', 10));
    await t.advance(PREROLL_MS);

    await t.advance(DRIVE_START_TIMEOUT_MS);

    expect(t.api().error).toBe('Fahrt konnte nicht starten');
    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  it('a failed gallery save is reported', async () => {
    mockSave.mockImplementation(() => Promise.reject(new Error('no space')));
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);

    await t.run(() => t.api().stop());

    expect(t.api().error).toContain('Video konnte nicht gespeichert werden');
    expect(t.api().savedCount).toBe(0);
    t.unmount();
  });
});

describe('useVideoDrive — double trigger (EC-5)', () => {
  it('ignores a second start while a take is running', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);

    await t.run(() => {
      t.api().start('startToEnd', 10);
      t.api().start('startToEnd', 10);
    });
    await t.run(() => t.api().start('startToEnd', 10));

    expect(rec.port.startRecording).toHaveBeenCalledTimes(1);
    t.unmount();
  });
});
