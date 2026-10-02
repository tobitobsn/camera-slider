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
  /** The frame rate the session really delivers at a video width — defaults to the one asked for. */
  delivers?: (width: number, fps: number) => number;
};
function fakeDevice(o: FakeDeviceOptions) {
  return {
    id: o.id,
    type: o.type,
    position: 'back',
    supportsFocusMetering: o.focusMetering ?? true,
    getSupportedResolutions: () => o.resolutions ?? [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }],
    supportsFPS: (fps: number) => (o.fps ?? [30, 60]).includes(fps),
    // Like VisionCamera on Android: 'auto' is always "supported", only
    // 'standard' tells the truth.
    supportsVideoStabilizationMode: (mode: string) =>
      mode === 'auto' || mode === 'off' || (mode === 'standard' && (o.stabilization ?? true)),
    delivers: o.delivers ?? ((_width: number, fps: number) => fps),
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
  Promise.resolve({
    filePath: '/cache/VisionCamera_1.mp4',
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
  }),
);
const mockVideoOutput = { createRecorder: mockCreateRecorder };

const mockRequestCamera = jest.fn(() => Promise.resolve(true));
const mockRequestMicrophone = jest.fn(() => Promise.resolve(true));
function mockPermission(status: string, request: () => Promise<boolean>) {
  return {
    status,
    hasPermission: status === 'authorized',
    canRequestPermission: status === 'not-determined',
    requestPermission: request,
  };
}

// The imperative API the format probe uses: the session answers with the
// frame rate the fake device delivers at the probed video width.
type ProbeOutput = { kind: string; targetResolution?: { width: number; height: number } };
const mockResolveConstraints = jest.fn(
  async (
    device: ReturnType<typeof fakeDevice>,
    outputs: { output: ProbeOutput; mirrorMode: string }[],
    constraints: Record<string, unknown>[],
  ) => {
    const video = outputs.find(o => o.output.kind === 'video')?.output;
    const fps = constraints.find(c => 'fps' in c)?.fps as number;
    return { selectedFPS: device.delivers(video?.targetResolution?.width ?? 0, fps) };
  },
);

jest.mock('react-native-vision-camera', () => ({
  VisionCamera: {
    createPreviewOutput: () => ({ kind: 'preview' }),
    createVideoOutput: (options: { targetResolution: { width: number; height: number } }) => ({
      kind: 'video',
      targetResolution: options.targetResolution,
    }),
    resolveConstraints: (...args: Parameters<typeof mockResolveConstraints>) => mockResolveConstraints(...args),
  },
  useCameraDevices: () => mockDevices,
  useCameraPermission: () => mockPermission(mockCameraStatus, mockRequestCamera),
  useMicrophonePermission: () => mockPermission(mockMicStatus, mockRequestMicrophone),
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
    /** Lets the format probe answer. */
    async settle() {
      await act(async () => {
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
  mockResolveConstraints.mockClear();
  mockRequestCamera.mockClear();
  mockRequestMicrophone.mockClear();
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
    // BUG-46: 'standard' — 'auto' does not switch anything on, on Android.
    expect(t.api().constraints).toEqual([{ fps: 60 }, { videoStabilizationMode: 'standard' }]);
    t.unmount();
  });

  it('hides the stabilization switch on a lens that only "supports" auto (BUG-46)', () => {
    mockDevices = [fakeDevice({ id: 'wide', type: 'wide-angle', stabilization: false })];
    const t = setup({ stabilizationEnabled: true });

    expect(t.api().stabilizationSupported).toBe(false);
    expect(t.api().constraints).toEqual([{ fps: 30 }]);
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

  it('offers only the combinations the camera really records at their frame rate (BUG-47)', async () => {
    // 4K goes up to 30 fps only — the session would silently drop 60 to 30.
    mockDevices = [
      fakeDevice({ id: 'wide', type: 'wide-angle', delivers: (width, fps) => (width === 3840 ? Math.min(fps, 30) : fps) }),
    ];
    const t = setup({ resolution: '2160p', fps: 60, stabilizationEnabled: true });
    expect(t.api().formats).toEqual([]); // still asking

    await t.settle();

    expect(t.api().formats).toEqual([
      { resolution: '1080p', fps: 30 },
      { resolution: '1080p', fps: 60 },
      { resolution: '2160p', fps: 30 },
    ]);
    // The remembered 4K/60 is not offered → the default (AC-26).
    expect(t.api().format).toEqual({ resolution: '1080p', fps: 30 });
    // Probed with the outputs and stabilization the real session uses.
    expect(mockResolveConstraints).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wide' }),
      [
        { output: { kind: 'preview' }, mirrorMode: 'auto' },
        { output: { kind: 'video', targetResolution: { width: 3840, height: 2160 } }, mirrorMode: 'auto' },
      ],
      [{ fps: 60 }, { videoStabilizationMode: 'standard' }],
    );
    t.unmount();
  });

  it('drops a combination whose probe fails', async () => {
    mockResolveConstraints.mockImplementationOnce(async () => {
      throw new Error('unsupported');
    });
    mockDevices = [fakeDevice({ id: 'wide', type: 'wide-angle', resolutions: [{ width: 1920, height: 1080 }] })];
    const t = setup();
    await t.settle();

    expect(t.api().formats).toEqual([{ resolution: '1080p', fps: 60 }]);
    t.unmount();
  });

  it('says so when the session still lands on another frame rate', async () => {
    const t = setup({ resolution: '1080p', fps: 60 });

    await act(async () => {
      t.api().onSessionConfigSelected({ selectedFPS: 30 } as never);
      await flush();
    });
    expect(t.api().notice).toBe('60 fps nicht verfügbar — es wird mit 30 fps aufgenommen');
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

  // What CameraX hands over through VisionCamera when a newer focus request
  // replaces one still converging (seen on a OnePlus Nord CE, BUG-68).
  const CANCELLED = new Error(
    'androidx.camera.core.CameraControl$OperationCanceledException: Cancelled by another startFocusAndMetering()\n' +
      '  at androidx.camera.camera2.impl.FocusMeteringControl.setCancelException(FocusMeteringControl.kt:545)\n' +
      '  at androidx.camera.camera2.impl.FocusMeteringControl.startFocusAndMetering(FocusMeteringControl.kt:141)',
  );

  it('a focus request replaced by a newer one is no error (BUG-68)', async () => {
    const t = setup();
    const ref = fakeCameraRef();
    ref.focusTo.mockImplementationOnce(() => Promise.reject(CANCELLED));
    t.api().cameraRef.current = ref as never;

    await act(async () => {
      t.api().lockAt({ x: 1, y: 2 });
      t.api().lockAt({ x: 3, y: 4 });
      await flush();
    });

    expect(t.api().notice).toBeNull();
    expect(t.api().focusLock).toEqual({ x: 3, y: 4 });
    t.unmount();
  });

  it('a real focus failure shows one line without the native stack trace (BUG-68)', async () => {
    const t = setup();
    const ref = fakeCameraRef();
    ref.focusTo.mockImplementationOnce(() =>
      Promise.reject(new Error('Camera is not ready\n  at com.margelo.nitro.camera.HybridCameraController.focusTo')),
    );
    t.api().cameraRef.current = ref as never;

    await act(async () => {
      t.api().lockAt({ x: 1, y: 2 });
      await flush();
    });

    expect(t.api().notice).toBe('Fokus konnte nicht gesperrt werden: Camera is not ready');
    expect(t.api().focusLock).toBeNull();
    t.unmount();
  });

  it('a later successful lock clears an earlier focus failure notice (BUG-68)', async () => {
    const t = setup();
    const ref = fakeCameraRef();
    ref.focusTo.mockImplementationOnce(() => Promise.reject(new Error('Camera is not ready')));
    t.api().cameraRef.current = ref as never;
    await act(async () => {
      t.api().lockAt({ x: 1, y: 2 });
      await flush();
    });
    expect(t.api().notice).not.toBeNull();

    await act(async () => {
      t.api().lockAt({ x: 5, y: 6 });
      await flush();
    });

    expect(t.api().notice).toBeNull();
    expect(t.api().focusLock).toEqual({ x: 5, y: 6 });
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
    // BUG-44: the file written so far comes with the error.
    expect(onError).toHaveBeenCalledWith(new Error('boom'), '/cache/VisionCamera_1.mp4');

    await recording.stop();
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    t.unmount();
  });
});

describe('prepare — may a take start? (AC-20, BUG-42)', () => {
  it('lets a take start with camera and microphone granted', () => {
    const t = setup({ soundEnabled: true });
    expect(t.api().recorder.prepare()).toBeNull();
    t.unmount();
  });

  it('asks for the camera where Android still allows it, and blocks the take', () => {
    mockCameraStatus = 'not-determined';
    const t = setup();

    expect(t.api().recorder.prepare()).toBe(
      'Für die Videoaufnahme wird Kamera-Zugriff benötigt — bitte erlauben und erneut starten.',
    );
    expect(mockRequestCamera).toHaveBeenCalledTimes(1);
    t.unmount();
  });

  it('points to the system settings once the camera was denied', () => {
    mockCameraStatus = 'denied';
    const t = setup();

    expect(t.api().recorder.prepare()).toBe(
      'Kamera-Zugriff wurde abgelehnt — in den Einstellungen erlauben, dann erneut starten.',
    );
    expect(mockRequestCamera).not.toHaveBeenCalled();
    t.unmount();
  });

  it('blocks a take with sound but no microphone, naming "Ton ausschalten" as the way out', () => {
    mockMicStatus = 'not-determined';
    const asking = setup({ soundEnabled: true });
    expect(asking.api().recorder.prepare()).toContain('oder Ton ausschalten');
    expect(mockRequestMicrophone).toHaveBeenCalledTimes(1);
    asking.unmount();

    mockMicStatus = 'denied';
    const denied = setup({ soundEnabled: true });
    expect(denied.api().recorder.prepare()).toBe(
      'Mikrofon-Zugriff wurde abgelehnt — in den Einstellungen erlauben oder Ton ausschalten.',
    );
    denied.unmount();
  });

  it('needs no microphone with sound off', () => {
    mockMicStatus = 'denied';
    const t = setup({ soundEnabled: false });
    expect(t.api().recorder.prepare()).toBeNull();
    t.unmount();
  });

  it('blocks a take while no back camera is known', () => {
    mockDevices = [];
    const t = setup();
    expect(t.api().recorder.prepare()).toBe('Keine Rückkamera verfügbar');
    t.unmount();
  });
});
