/**
 * Render-level tests for VideoPanel (PROJ-3 AC-13, AC-16, AC-20 to AC-25,
 * AC-28) against a fake useVideoCamera result.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Switch, Text } from 'react-native';

jest.mock('react-native-vision-camera', () => {
  const R = require('react');
  return { Camera: (props: object) => R.createElement('Camera', props) };
});

import { VideoPanel, formatRecordingTime } from './VideoPanel';
import type { VideoCameraApi } from './useVideoCamera';
import type { VideoDrivePhase } from './useVideoDrive';
import { DEFAULT_VIDEO_SETTINGS, type VideoSettings } from './useVideoSettings';

function fakeCamera(overrides: Partial<VideoCameraApi> = {}): VideoCameraApi {
  const device = { id: 'wide' } as never;
  return {
    camera: { granted: true, canRequest: false, request: jest.fn(() => Promise.resolve(true)) },
    microphone: { granted: true, canRequest: false, request: jest.fn(() => Promise.resolve(true)) },
    openSettings: jest.fn(),
    lenses: [
      { type: 'wide', device },
      { type: 'tele', device },
    ],
    lens: { type: 'wide', device },
    formats: [
      { resolution: '1080p', fps: 30 },
      { resolution: '2160p', fps: 25 },
    ],
    format: { resolution: '1080p', fps: 30 },
    stabilizationSupported: true,
    cameraDevice: device,
    videoOutput: {} as never,
    constraints: [],
    cameraRef: { current: null },
    onCameraError: jest.fn(),
    onSessionConfigSelected: jest.fn(),
    notice: null,
    focusLock: null,
    lockAt: jest.fn(),
    unlock: jest.fn(),
    recorder: { prepare: jest.fn(() => null), startRecording: jest.fn() },
    ...overrides,
  };
}

function render(
  camera: VideoCameraApi,
  options: { settings?: Partial<VideoSettings>; phase?: VideoDrivePhase; elapsedSeconds?: number; busy?: boolean } = {},
) {
  const onChange = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = ReactTestRenderer.create(
      React.createElement(VideoPanel, {
        camera,
        settings: { ...DEFAULT_VIDEO_SETTINGS, videoEnabled: true, ...options.settings },
        onChange,
        phase: options.phase ?? 'ready',
        elapsedSeconds: options.elapsedSeconds ?? 0,
        busy: options.busy ?? false,
      }),
    );
  });
  const root = (renderer as ReactTestRenderer.ReactTestRenderer).root;
  const texts = () => root.findAllByType(Text).map(t => [].concat(t.props.children).join(''));
  // The innermost Pressable holding that label — the preview is a Pressable
  // too and contains every label drawn on top of it.
  // Found by onPress, like AutoDriveControls.render.test.ts — the rendered
  // Pressable's type is not the imported one under the Jest preset.
  const pressableWithText = (label: string) =>
    root
      .findAll(
        n =>
          typeof n.props.onPress === 'function' &&
          typeof n.type !== 'string' &&
          n.findAllByType(Text).some(t => [].concat(t.props.children).join('') === label),
      )
      .pop();
  const switchFor = (label: string) => root.findAllByType(Switch).find(s => s.props.accessibilityLabel === label);
  return { root, texts, pressableWithText, switchFor, onChange, unmount: () => act(() => renderer?.unmount()) };
}

describe('VideoPanel — preview and lock (AC-13, AC-25)', () => {
  it('shows the camera preview when the camera is granted', () => {
    const v = render(fakeCamera());
    expect(v.root.findAllByType('Camera' as never)).toHaveLength(1);
    v.unmount();
  });

  it('tapping the preview locks at the tapped point', () => {
    const camera = fakeCamera();
    const v = render(camera);

    act(() => {
      v.root.findByProps({ testID: 'video-preview' }).props.onPress({ nativeEvent: { locationX: 50, locationY: 70 } });
    });

    expect(camera.lockAt).toHaveBeenCalledWith({ x: 50, y: 70 });
    v.unmount();
  });

  it('shows the lock marker and an "Auto" button that releases the lock', () => {
    const camera = fakeCamera({ focusLock: { x: 50, y: 70 } });
    const v = render(camera);

    expect(v.root.findAllByProps({ testID: 'focus-lock-marker' }).length).toBeGreaterThan(0);
    act(() => v.pressableWithText('Auto')?.props.onPress());
    expect(camera.unlock).toHaveBeenCalled();
    v.unmount();
  });
});

describe('VideoPanel — permissions (AC-20)', () => {
  it('asks for camera access when it can still be requested, without a preview', () => {
    const camera = fakeCamera({ camera: { granted: false, canRequest: true, request: jest.fn(() => Promise.resolve(true)) } });
    const v = render(camera);

    expect(v.root.findAllByType('Camera' as never)).toHaveLength(0);
    act(() => v.pressableWithText('Kamera-Zugriff erlauben')?.props.onPress());
    expect(camera.camera.request).toHaveBeenCalled();
    v.unmount();
  });

  it('points to the system settings once the camera was denied', () => {
    const camera = fakeCamera({ camera: { granted: false, canRequest: false, request: jest.fn() } });
    const v = render(camera);

    act(() => v.pressableWithText('Einstellungen öffnen')?.props.onPress());
    expect(camera.openSettings).toHaveBeenCalled();
    v.unmount();
  });

  it('with sound on and no microphone: explains, and names switching sound off as the way out', () => {
    const camera = fakeCamera({ microphone: { granted: false, canRequest: true, request: jest.fn(() => Promise.resolve(true)) } });
    const v = render(camera, { settings: { soundEnabled: true } });

    expect(v.texts().some(t => t.includes('Mikrofon-Zugriff') && t.includes('Ton ausschalten'))).toBe(true);
    v.unmount();

    const silent = render(camera, { settings: { soundEnabled: false } });
    expect(silent.texts().some(t => t.includes('Mikrofon-Zugriff'))).toBe(false);
    silent.unmount();
  });
});

describe('VideoPanel — settings (AC-21 to AC-24)', () => {
  it('changes sound, format, lens and stabilization through onChange', () => {
    const v = render(fakeCamera());

    act(() => v.switchFor('Ton')?.props.onValueChange(false));
    act(() => v.pressableWithText('4K · 25 fps')?.props.onPress());
    act(() => v.pressableWithText('Tele')?.props.onPress());
    act(() => v.switchFor('Stabilisierung')?.props.onValueChange(true));

    expect(v.onChange.mock.calls).toEqual([
      [{ soundEnabled: false }],
      [{ resolution: '2160p', fps: 25 }],
      [{ lens: 'tele' }],
      [{ stabilizationEnabled: true }],
    ]);
    v.unmount();
  });

  it('hides the lens choice with a single lens and the stabilization switch when unsupported', () => {
    const device = { id: 'wide' } as never;
    const v = render(fakeCamera({ lenses: [{ type: 'wide', device }], stabilizationSupported: false }));

    expect(v.pressableWithText('Weitwinkel')).toBeUndefined();
    expect(v.switchFor('Stabilisierung')).toBeUndefined();
    v.unmount();
  });
});

describe('VideoPanel — while recording (AC-16, AC-28)', () => {
  it('shows REC with the recorded time and the phase', () => {
    const v = render(fakeCamera(), { phase: 'preroll', elapsedSeconds: 75, busy: true });
    expect(v.texts()).toContain('● REC 01:15 · Vorlauf');
    v.unmount();
  });

  it('locks every control while busy', () => {
    const v = render(fakeCamera({ focusLock: { x: 1, y: 1 } }), { phase: 'driving', busy: true });

    expect(v.switchFor('Ton')?.props.disabled).toBe(true);
    expect(v.switchFor('Stabilisierung')?.props.disabled).toBe(true);
    expect(v.pressableWithText('4K · 25 fps')?.props.disabled).toBe(true);
    expect(v.pressableWithText('Tele')?.props.disabled).toBe(true);
    expect(v.pressableWithText('Auto')?.props.disabled).toBe(true);
    expect(v.root.findByProps({ testID: 'video-preview' }).props.disabled).toBe(true);
    v.unmount();
  });

  it('formatRecordingTime pads minutes and seconds', () => {
    expect(formatRecordingTime(0)).toBe('00:00');
    expect(formatRecordingTime(605)).toBe('10:05');
  });
});
