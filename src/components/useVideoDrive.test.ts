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

const mockDeleteCacheFile = jest.fn();
const mockDeleteLeftoverVideos = jest.fn();
jest.mock('./cacheFiles', () => ({
  deleteCacheFile: (path: string) => mockDeleteCacheFile(path),
  deleteLeftoverVideos: () => mockDeleteLeftoverVideos(),
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
  FINALIZE_TIMEOUT_MS,
  POSTROLL_MS,
  PREROLL_MS,
  START_TIMEOUT_MS,
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

type Callbacks = Parameters<VideoRecorderPort['startRecording']>[0];

/**
 * A recorder that behaves like VisionCamera's: stop() hands back the file via
 * onFinished; after an error the recording is over — onFinished never comes
 * and stop() rejects ("Not currently recording!").
 */
function fakeRecorder(options: { failStart?: boolean; neverStarts?: boolean; blocked?: string } = {}) {
  let callbacks: Callbacks | null = null;
  let recording = false;
  let resolveStart: ((value: { stop: () => Promise<void> }) => void) | null = null;
  const stopRecording = jest.fn(async () => {
    if (!recording) {
      throw new Error('Not currently recording!');
    }
    recording = false;
    callbacks?.onFinished('/tmp/take.mp4');
  });
  const port: VideoRecorderPort = {
    prepare: jest.fn(() => options.blocked ?? null),
    startRecording: jest.fn(cbs => {
      if (options.failStart) {
        return Promise.reject(new Error('camera busy'));
      }
      callbacks = cbs;
      if (options.neverStarts) {
        return new Promise(resolve => {
          resolveStart = resolve;
        });
      }
      recording = true;
      return Promise.resolve({ stop: stopRecording });
    }),
  };
  return {
    port,
    stopRecording,
    emitError: (message: string, filePath: string | null = '/tmp/take.mp4') => {
      recording = false;
      callbacks?.onError(new Error(message), filePath);
    },
    /** The recorder finishing on its own, without stop() (e.g. the camera was taken away). */
    emitFinished: (filePath = '/tmp/take.mp4') => {
      recording = false;
      callbacks?.onFinished(filePath);
    },
    /** A start that arrives late (after the start timeout). */
    resolveLateStart: () => {
      recording = true;
      resolveStart?.({ stop: stopRecording });
    },
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
  mockDeleteCacheFile.mockClear();
  mockDeleteLeftoverVideos.mockClear();
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

  it('a recording error during the drive stops the motor, reports it and saves the part recorded (BUG-44)', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);

    await t.run(() => rec.emitError('storage full', '/tmp/partial.mp4'));

    // Saved right away — the recorder never hands the file over itself.
    expect(mockSendStop).toHaveBeenCalledWith(DEVICE);
    expect(mockSave).toHaveBeenCalledWith('file:///tmp/partial.mp4', { type: 'video' });
    expect(t.api().error).toBe('Aufnahme abgebrochen: storage full');
    expect(t.api().phase).toBe('ready');
    expect(t.api().savedCount).toBe(1);
    expect(mockDeleteCacheFile).toHaveBeenCalledWith('/tmp/partial.mp4');
    expect(mockDeactivate).toHaveBeenCalled();
    t.unmount();
  });

  it('a recording error without a file: reports it and is back to ready without waiting (BUG-44)', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);

    await t.run(() => rec.emitError('encoder failed', null));

    expect(mockSendStop).toHaveBeenCalledWith(DEVICE);
    expect(mockSave).not.toHaveBeenCalled();
    expect(t.api().error).toBe('Aufnahme abgebrochen: encoder failed');
    expect(t.api().phase).toBe('ready');
    t.unmount();
  });

  it('a recording that ends on its own during the drive is no success: STOP, error, saved (BUG-45)', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);

    await t.run(() => rec.emitFinished('/tmp/cut.mp4'));

    expect(mockSendStop).toHaveBeenCalledWith(DEVICE);
    expect(t.api().error).toBe('Aufnahme wurde unerwartet beendet');
    expect(mockSave).toHaveBeenCalledWith('file:///tmp/cut.mp4', { type: 'video' });
    expect(t.api().phase).toBe('ready');
    t.unmount();
  });

  it('a recording that ends on its own during the pre-roll: the carriage never starts (BUG-45, EC-7)', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await t.run(() => t.api().start('startToEnd', 10));

    await t.run(() => rec.emitFinished());
    await t.advance(PREROLL_MS * 2);

    expect(mockSendAutoDrive).not.toHaveBeenCalled();
    expect(mockSendStop).not.toHaveBeenCalled();
    expect(t.api().error).toBe('Aufnahme wurde unerwartet beendet');
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

  it('the app going to the background while the take is being saved is no error (BUG-53)', async () => {
    let resolveSave: (value: string) => void = () => {};
    mockSave.mockImplementation(() => new Promise(resolve => (resolveSave = resolve)));
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);
    await t.run(() => t.api().stop());
    expect(t.api().phase).toBe('saving');

    await t.run(() => appStateHandler?.('background'));
    await t.run(() => resolveSave('content://video'));

    expect(t.api().error).toBeNull();
    expect(t.api().savedCount).toBe(1);
    t.unmount();
  });
});

describe('useVideoDrive — permissions (AC-20, BUG-42)', () => {
  it('starts nothing while the camera says a take cannot start, and shows its hint', async () => {
    const rec = fakeRecorder({ blocked: 'Für Ton wird Mikrofon-Zugriff benötigt' });
    const t = setup(rec.port);

    await t.run(() => t.api().start('startToEnd', 10));
    await t.advance(PREROLL_MS * 2);

    expect(rec.port.startRecording).not.toHaveBeenCalled();
    expect(mockSendAutoDrive).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
    expect(t.api().phase).toBe('ready');
    expect(t.api().busy).toBe(false);
    expect(t.api().error).toBe('Für Ton wird Mikrofon-Zugriff benötigt');
    t.unmount();
  });
});

describe('useVideoDrive — a camera that never answers (AC-27, BUG-43)', () => {
  it('ends the run after the start timeout: error, ready, screen lock released', async () => {
    const rec = fakeRecorder({ neverStarts: true });
    const t = setup(rec.port);
    await t.run(() => t.api().start('startToEnd', 10));
    expect(t.api().phase).toBe('starting');

    await t.advance(START_TIMEOUT_MS - 1);
    expect(t.api().phase).toBe('starting');
    await t.advance(1);

    expect(t.api().phase).toBe('ready');
    expect(t.api().error).toContain('Aufnahme konnte nicht starten');
    expect(mockDeactivate).toHaveBeenCalled();
    expect(mockSendAutoDrive).not.toHaveBeenCalled();
    t.unmount();
  });

  it('Stopp while starting does not hang in "saving"', async () => {
    const rec = fakeRecorder({ neverStarts: true });
    const t = setup(rec.port);
    await t.run(() => t.api().start('startToEnd', 10));

    await t.run(() => t.api().stop());
    expect(t.api().phase).toBe('saving');
    await t.advance(START_TIMEOUT_MS);

    expect(t.api().phase).toBe('ready');
    expect(t.api().busy).toBe(false);
    expect(mockDeactivate).toHaveBeenCalled();
    t.unmount();
  });

  it('a start that arrives after the timeout is stopped at once and its file removed', async () => {
    const rec = fakeRecorder({ neverStarts: true });
    const t = setup(rec.port);
    await t.run(() => t.api().start('startToEnd', 10));
    await t.advance(START_TIMEOUT_MS);

    await t.run(() => rec.resolveLateStart());

    expect(rec.stopRecording).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockDeleteCacheFile).toHaveBeenCalledWith('/tmp/take.mp4');
    expect(mockSendAutoDrive).not.toHaveBeenCalled();
    t.unmount();
  });

  it('a late start of an aborted run leaves the next run its own timeout (BUG-58)', async () => {
    // Every start stays pending on its own, so the first one can arrive
    // while the second is still waiting.
    const pending: ((value: { stop: () => Promise<void> }) => void)[] = [];
    const lateStop = jest.fn(async () => {});
    const port: VideoRecorderPort = {
      prepare: jest.fn(() => null),
      startRecording: jest.fn(
        () =>
          new Promise(resolve => {
            pending.push(resolve);
          }),
      ),
    };
    const t = setup(port);
    await t.run(() => t.api().start('startToEnd', 10));
    await t.advance(START_TIMEOUT_MS);
    expect(t.api().phase).toBe('ready');

    await t.run(() => t.api().start('startToEnd', 10));
    expect(t.api().phase).toBe('starting');
    await t.advance(1000);
    await t.run(() => pending[0]({ stop: lateStop }));
    expect(lateStop).toHaveBeenCalledTimes(1);

    await t.advance(START_TIMEOUT_MS);

    expect(t.api().phase).toBe('ready');
    expect(t.api().busy).toBe(false);
    expect(t.api().error).toContain('Aufnahme konnte nicht starten');
    expect(mockDeactivate).toHaveBeenCalledTimes(2);
    expect(mockSendAutoDrive).not.toHaveBeenCalled();
    t.unmount();
  });
});

describe('useVideoDrive — cache copies (BUG-48)', () => {
  it('removes the cache copy once the take is in the gallery', async () => {
    const rec = fakeRecorder();
    const t = setup(rec.port);
    await driveUntilMoving(t);

    await t.run(() => t.api().stop());

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockDeleteCacheFile).toHaveBeenCalledWith('/tmp/take.mp4');
    t.unmount();
  });

  it('removes a file that arrives after the finalize timeout', async () => {
    const rec = fakeRecorder();
    rec.stopRecording.mockImplementation(async () => {});
    const t = setup(rec.port);
    await driveUntilMoving(t);
    await t.run(() => t.api().stop());

    await t.advance(FINALIZE_TIMEOUT_MS);
    expect(t.api().phase).toBe('ready');
    await t.run(() => rec.emitFinished('/tmp/late.mp4'));

    expect(mockSave).not.toHaveBeenCalled();
    expect(mockDeleteCacheFile).toHaveBeenCalledWith('/tmp/late.mp4');
    t.unmount();
  });

  it('clears recordings left by an earlier run once, at start-up', () => {
    const t = setup(fakeRecorder().port);
    expect(mockDeleteLeftoverVideos).toHaveBeenCalledTimes(1);
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
