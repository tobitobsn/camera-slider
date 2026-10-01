import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// VisionCamera is native (Nitro Modules) — its hooks are replaced with
// controllable fakes, as in useCameraCapture.test.ts.
type FakeDeviceOptions = {
  id: string;
  type: string;
  resolutions?: { width: number; height: number }[];
  fps?: number[];
  stabilization?: boolean;
  focusMetering?: boolean;
};
function fakeDevice(o: FakeDeviceOptions) {
  return {
    id: o.id,
    type: o.type,
    position: 'back',
    supportsFocusMetering: o.focusMetering ?? true,
    getSupportedResolutions: () => o.resolutions ?? [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }],
    supportsFPS: (fps: number) => (o.fps ?? [30, 60]).includes(fps),
    supportsVideoStabilizationMode: () => o.stabilization ?? true,
  };
}

let mockDevices: ReturnType<typeof fakeDevice>[] = [];
let mockCameraStatus = 'authorized';
let mockMicStatus = 'authorized';
const mockVideoOutputOptions = jest.fn();
const mockStopRecording = jest.fn(() => Promise.resolve());
const mockStartRecording = jest.fn((_onFinished: (path: string) => void, _onError: (e: Error) => void) =>
  Promise.resolve(),
);
const mockCreateRecorder = jest.fn(() =>
  Promise.resolve({ startRecording: mockStartRecording, stopRecording: mockStopRecording }),
);
const mockVideoOutput = { createRecorder: mockCreateRecorder };

function mockPermission(status: string) {
  return {
    status,
    hasPermission: status === 'authorized',
    canRequestPermission: status === 'not-determined',
    requestPermission: jest.fn(() => Promise.resolve(true)),
  };
}

jest.mock('react-native-vision-camera', () => ({
  useCameraDevices: () => mockDevices,
  useCameraPermission: () => mockPermission(mockCameraStatus),
  useMicrophonePermission: () => mockPermission(mockMicStatus),
  useVideoOutput: (options: unknown) => {
    mockVideoOutputOptions(options);
    return mockVideoOutput;
  },
}));

import { DEFAULT_VIDEO_SETTINGS, type VideoSettings } from './useVideoSettings';
import { FOCUS_UNSUPPORTED_NOTICE, useVideoCamera, type VideoCameraApi } from './useVideoCamera';

function Probe({ settings, onApi }: { settings: VideoSettings; onApi: (api: VideoCameraApi) => void }) {
  onApi(useVideoCamera(settings));
  return null;
}

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

function setup(initial: Partial<VideoSettings> = {}) {
  let api: VideoCameraApi | undefined;
  let settings: VideoSettings = { ...DEFAULT_VIDEO_SETTINGS, videoEnabled: true, ...initial };
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const element = () => React.createElement(Probe, { settings, onApi: a => (api = a) });
  act(() => {
    renderer = ReactTestRenderer.create(element());
  });
  return {
    api: () => api as VideoCameraApi,
    async setSettings(changes: Partial<VideoSettings>) {
      settings = { ...settings, ...changes };
      await act(async () => {
        renderer?.update(element());
        await flush();
      });
    },
    unmount: () => act(() => renderer?.unmount()),
  };
}

function fakeCameraRef() {
  return {
    focusTo: jest.fn(() => Promise.resolve()),
    resetFocus: jest.fn(() => Promise.resolve()),
  };
}

beforeEach(() => {
  mockDevices = [
    fakeDevice({ id: 'wide', type: 'wide-angle' }),
    fakeDevice({ id: 'tele', type: 'telephoto', fps: [30], stabilization: false }),
  ];
  mockCameraStatus = 'authorized';
  mockMicStatus = 'authorized';
  mockVideoOutputOptions.mockClear();
  mockCreateRecorder.mockClear();
  mockStartRecording.mockClear();
  mockStopRecording.mockClear();
});

describe('lens, format, stabilization (AC-22, AC-23, AC-24, AC-26)', () => {
  it('uses the remembered lens and format and passes fps + stabilization to the session', () => {
    const t = setup({ lens: 'wide', resolution: '2160p', fps: 60, stabilizationEnabled: true });

    expect(t.api().lenses.map(l => l.type)).toEqual(['wide', 'tele']);
    expect(t.api().cameraDevice?.id).toBe('wide');
    expect(t.api().format).toEqual({ resolution: '2160p', fps: 60 });
    expect(mockVideoOutputOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetResolution: { width: 3840, height: 2160 } }),
    );
    expect(t.api().constraints).toEqual([{ fps: 60 }, { videoStabilizationMode: 'auto' }]);
    t.unmount();
  });

  it('turns stabilization off in the session when the switch is off', () => {
    const t = setup({ stabilizationEnabled: false });
    expect(t.api().constraints).toContainEqual({ videoStabilizationMode: 'off' });
    t.unmount();
  });

  it('omits stabilization and falls back to an offered format on a lens without them', () => {
    const t = setup({ lens: 'tele', resolution: '1080p', fps: 60 });

    expect(t.api().stabilizationSupported).toBe(false);
    expect(t.api().format).toEqual({ resolution: '1080p', fps: 30 });
    expect(t.api().constraints).toEqual([{ fps: 30 }]);
    t.unmount();
  });

  it('falls back to the wide lens when the remembered lens does not exist on this phone', () => {
    const t = setup({ lens: 'ultraWide' });
    expect(t.api().lens?.type).toBe('wide');
    t.unmount();
  });

  it('falls back to 1080p/30 with a notice when the camera rejects the chosen format', async () => {
    const t = setup({ resolution: '2160p', fps: 60 });

    await act(async () => {
      t.api().onCameraError(new Error('unsupported'));
      await flush();
    });

    expect(t.api().format).toEqual({ resolution: '1080p', fps: 30 });
    expect(t.api().notice).toBe('Format nicht verfügbar — auf 1080p · 30 fps zurückgesetzt');
    t.unmount();
  });
});

describe('sound and permissions (AC-20, AC-21)', () => {
  it('records audio only when sound is on and the microphone is granted', async () => {
    const t = setup({ soundEnabled: true });
    expect(mockVideoOutputOptions).toHaveBeenLastCalledWith(expect.objectContaining({ enableAudio: true }));

    await t.setSettings({ soundEnabled: false });
    expect(mockVideoOutputOptions).toHaveBeenLastCalledWith(expect.objectContaining({ enableAudio: false }));
    t.unmount();

    mockMicStatus = 'denied';
    const denied = setup({ soundEnabled: true });
    expect(mockVideoOutputOptions).toHaveBeenLastCalledWith(expect.objectContaining({ enableAudio: false }));
    denied.unmount();
  });

  it('reports whether a permission is granted and whether it can still be requested', () => {
    mockCameraStatus = 'not-determined';
    mockMicStatus = 'denied';
    const t = setup();

    expect(t.api().camera).toEqual(expect.objectContaining({ granted: false, canRequest: true }));
    expect(t.api().microphone).toEqual(expect.objectContaining({ granted: false, canRequest: false }));
    t.unmount();
  });
});

describe('focus/exposure/white-balance lock (AC-25)', () => {
  it('locks metering at the tapped point without auto-reset, and "Auto" releases it', async () => {
    const t = setup();
    const ref = fakeCameraRef();
    t.api().cameraRef.current = ref as never;

    await act(async () => {
      t.api().lockAt({ x: 120, y: 80 });
      await flush();
    });

    expect(ref.focusTo).toHaveBeenCalledWith(
      { x: 120, y: 80 },
      { responsiveness: 'snappy', adaptiveness: 'locked', autoResetAfter: null },
    );
    expect(t.api().focusLock).toEqual({ x: 120, y: 80 });

    await act(async () => {
      t.api().unlock();
      await flush();
    });
    expect(ref.resetFocus).toHaveBeenCalled();
    expect(t.api().focusLock).toBeNull();
    t.unmount();
  });

  it('drops the lock when the session is reconfigured (other format)', async () => {
    const t = setup();
    t.api().cameraRef.current = fakeCameraRef() as never;
    await act(async () => {
      t.api().lockAt({ x: 1, y: 2 });
      await flush();
    });

    await t.setSettings({ fps: 60 });

    expect(t.api().focusLock).toBeNull();
    t.unmount();
  });

  it('shows a notice instead of locking on a lens without point metering', async () => {
    mockDevices = [fakeDevice({ id: 'wide', type: 'wide-angle', focusMetering: false })];
    const t = setup();
    const ref = fakeCameraRef();
    t.api().cameraRef.current = ref as never;

    await act(async () => {
      t.api().lockAt({ x: 1, y: 2 });
      await flush();
    });

    expect(ref.focusTo).not.toHaveBeenCalled();
    expect(t.api().notice).toBe(FOCUS_UNSUPPORTED_NOTICE);
    t.unmount();
  });
});

describe('recorder port', () => {
  it('starts a native recording and stops it, handing the file path to onFinished', async () => {
    const t = setup();
    const onFinished = jest.fn();
    const onError = jest.fn();

    const recording = await t.api().recorder.startRecording({ onFinished, onError });
    expect(mockCreateRecorder).toHaveBeenCalledTimes(1);
    expect(mockStartRecording).toHaveBeenCalledTimes(1);

    const [finishedCallback, errorCallback] = mockStartRecording.mock.calls[0];
    finishedCallback('/tmp/take.mp4');
    errorCallback(new Error('boom'));
    expect(onFinished).toHaveBeenCalledWith('/tmp/take.mp4');
    expect(onError).toHaveBeenCalledWith(new Error('boom'));

    await recording.stop();
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    t.unmount();
  });
});
