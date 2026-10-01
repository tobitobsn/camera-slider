import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// Same in-memory AsyncStorage mock as usePresets.test.ts.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_VIDEO_SETTINGS,
  STORAGE_KEY,
  parseVideoSettings,
  useVideoSettings,
  type VideoSettings,
} from './useVideoSettings';

type Api = ReturnType<typeof useVideoSettings>;

function Probe({ onApi }: { onApi: (api: Api) => void }) {
  onApi(useVideoSettings());
  return null;
}

function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

async function mount(): Promise<{ api: () => Api; renderer: ReactTestRenderer.ReactTestRenderer }> {
  let lastApi: Api | undefined;
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = ReactTestRenderer.create(React.createElement(Probe, { onApi: a => (lastApi = a) }));
    await flushPromises();
  });
  return { api: () => lastApi as Api, renderer: renderer as ReactTestRenderer.ReactTestRenderer };
}

describe('parseVideoSettings', () => {
  it('uses the defaults when nothing is stored (video off, sound on, 1080p/30, wide, stabilization off)', () => {
    expect(parseVideoSettings(null)).toEqual({
      videoEnabled: false,
      soundEnabled: true,
      resolution: '1080p',
      fps: 30,
      lens: 'wide',
      stabilizationEnabled: false,
    });
  });

  it('uses the defaults for an unreadable record', () => {
    expect(parseVideoSettings('{not json')).toEqual(DEFAULT_VIDEO_SETTINGS);
  });

  it('replaces only the fields with unknown values, keeping the others', () => {
    const raw = JSON.stringify({
      videoEnabled: true,
      soundEnabled: 'yes',
      resolution: '8K',
      fps: 25,
      lens: 'fisheye',
      stabilizationEnabled: true,
    });

    expect(parseVideoSettings(raw)).toEqual({
      videoEnabled: true,
      soundEnabled: true,
      resolution: '1080p',
      fps: 25,
      lens: 'wide',
      stabilizationEnabled: true,
    });
  });
});

describe('useVideoSettings (AC-26)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('loads the stored record on mount', async () => {
    const stored: VideoSettings = { ...DEFAULT_VIDEO_SETTINGS, videoEnabled: true, lens: 'tele', fps: 60 };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, ...stored }));

    const { api, renderer } = await mount();

    expect(api().settings).toEqual(stored);
    act(() => renderer.unmount());
  });

  it('update() applies the change and persists the whole record, which a new mount reads back', async () => {
    const first = await mount();

    await act(async () => {
      first.api().update({ videoEnabled: true, soundEnabled: false });
      await flushPromises();
    });

    expect(first.api().settings.videoEnabled).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string)).toEqual({
      schemaVersion: 1,
      ...DEFAULT_VIDEO_SETTINGS,
      videoEnabled: true,
      soundEnabled: false,
    });
    act(() => first.renderer.unmount());

    const second = await mount();
    expect(second.api().settings).toEqual({
      ...DEFAULT_VIDEO_SETTINGS,
      videoEnabled: true,
      soundEnabled: false,
    });
    act(() => second.renderer.unmount());
  });

  it('keeps the change in memory when the write fails', async () => {
    const { api, renderer } = await mount();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await act(async () => {
      api().update({ stabilizationEnabled: true });
      await flushPromises();
    });

    expect(api().settings.stabilizationEnabled).toBe(true);
    act(() => renderer.unmount());
    jest.restoreAllMocks();
  });
});
