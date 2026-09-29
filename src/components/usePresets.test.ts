import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// The library's own documented Jest mock — a real in-memory implementation
// of getItem/setItem/etc. that persists across calls within one test, which
// is what's needed to prove AsyncStorage persistence (not just in-memory
// hook state). jest.mock calls are hoisted above these imports by
// babel-plugin-jest-hoist, matching useSliderStatus.test.ts's pattern for
// mocking a module this hook depends on.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
import AsyncStorage from '@react-native-async-storage/async-storage';

import { migrateDirection, usePresets, type Preset } from './usePresets';

type PresetsApi = {
  presets: Preset[];
  save: (
    name: string,
    distanceSteps: number,
    endIsAfterStart: boolean,
    durationSeconds: number,
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

// Plain function component using React.createElement (not JSX) since this
// file is .ts, not .tsx — matches useSliderStatus.test.ts's "render a probe
// component with react-test-renderer + act()" approach for exercising a
// hook that has React state and an effect.
function PresetsProbe({ onApi }: { onApi: (api: PresetsApi) => void }) {
  const api = usePresets();
  onApi(api);
  return null;
}

function renderProbe(onApi: (api: PresetsApi) => void): React.ReactElement {
  return React.createElement(PresetsProbe, { onApi });
}

// usePresets' initial load goes through a real (mocked) AsyncStorage.getItem
// promise chain, unlike useSliderStatus's synchronous subscribeToStatus
// mock — flushing the microtask queue via a macrotask tick lets that chain
// (and the setState it triggers) settle before assertions run.
function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

describe('usePresets', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts with an empty presets array before anything is saved', async () => {
    let lastApi: PresetsApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
      await flushPromises();
    });

    expect(lastApi?.presets).toEqual([]);

    act(() => renderer.unmount());
  });

  it('save() adds a preset that appears in presets with the fields it was called with', async () => {
    let lastApi: PresetsApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
      await flushPromises();
    });

    await act(async () => {
      await lastApi!.save('Sunset Pan', 1500, true, 12);
    });

    expect(lastApi!.presets).toHaveLength(1);
    expect(lastApi!.presets[0]).toMatchObject({
      name: 'Sunset Pan',
      distanceSteps: 1500,
      endIsAfterStart: true,
      durationSeconds: 12,
    });
    expect(typeof lastApi!.presets[0].id).toBe('string');
    expect(typeof lastApi!.presets[0].createdAt).toBe('number');

    act(() => renderer.unmount());
  });

  it('allows two presets with the same name to both appear (EC-1 — no duplicate-name rejection)', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

    let lastApi: PresetsApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
      await flushPromises();
    });

    await act(async () => {
      await lastApi!.save('Duplicate', 10, true, 5);
    });
    await act(async () => {
      await lastApi!.save('Duplicate', 20, false, 8);
    });

    expect(lastApi!.presets).toHaveLength(2);
    expect(lastApi!.presets.every(preset => preset.name === 'Duplicate')).toBe(true);

    act(() => renderer.unmount());
  });

  it('sorts presets newest-first when multiple are saved', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

    let lastApi: PresetsApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
      await flushPromises();
    });

    await act(async () => {
      await lastApi!.save('Older', 10, true, 5);
    });
    await act(async () => {
      await lastApi!.save('Newer', 20, true, 8);
    });

    expect(lastApi!.presets.map(preset => preset.name)).toEqual(['Newer', 'Older']);

    act(() => renderer.unmount());
  });

  it('remove() removes the correct preset by id and leaves the others', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_111).mockReturnValueOnce(2_222);

    let lastApi: PresetsApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
      await flushPromises();
    });

    await act(async () => {
      await lastApi!.save('Keep me', 10, true, 5);
    });
    await act(async () => {
      await lastApi!.save('Remove me', 20, false, 8);
    });

    expect(lastApi!.presets).toHaveLength(2);
    const toRemove = lastApi!.presets.find(preset => preset.name === 'Remove me')!;

    await act(async () => {
      await lastApi!.remove(toRemove.id);
    });

    expect(lastApi!.presets).toHaveLength(1);
    expect(lastApi!.presets[0].name).toBe('Keep me');

    act(() => renderer.unmount());
  });

  it('persists a saved preset across a hook remount (proves AsyncStorage wiring, not just in-memory state)', async () => {
    let apiA: PresetsApi | undefined;
    let rendererA: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      rendererA = ReactTestRenderer.create(renderProbe(api => (apiA = api)));
      await flushPromises();
    });

    await act(async () => {
      await apiA!.save('Persisted Preset', 500, false, 20);
    });

    expect(apiA!.presets).toHaveLength(1);

    act(() => rendererA.unmount());

    let apiB: PresetsApi | undefined;
    let rendererB: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      rendererB = ReactTestRenderer.create(renderProbe(api => (apiB = api)));
      await flushPromises();
    });

    expect(apiB!.presets).toHaveLength(1);
    expect(apiB!.presets[0].name).toBe('Persisted Preset');

    act(() => rendererB.unmount());
  });

  it('save() after a failed initial read does not overwrite presets already on disk (BUG-3 regression guard)', async () => {
    // A preset already exists in storage from a previous session.
    await AsyncStorage.setItem(
      'camera-slider.presets',
      JSON.stringify([
        {
          id: 'existing-1',
          name: 'Already saved',
          distanceSteps: 999,
          endIsAfterStart: true,
          durationSeconds: 7,
          createdAt: 500,
        },
      ]),
    );

    // The hook's initial mount read fails transiently — readStoredPresetsForMount()
    // swallows this to [], leaving `presets` state empty even though real data
    // is on disk. Only this first getItem() call is affected; later calls
    // (inside save()) go through to the real in-memory mock.
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('transient read failure'));

    let lastApi: PresetsApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
      await flushPromises();
    });

    expect(lastApi!.presets).toEqual([]);

    await act(async () => {
      await lastApi!.save('New preset', 10, true, 5);
    });

    // BUG-3: without the fix, this would be length 1 — the stale, empty
    // in-memory `presets` state would have been used as the base for the
    // write, silently discarding "Already saved".
    expect(lastApi!.presets).toHaveLength(2);
    expect(lastApi!.presets.map(preset => preset.name).sort()).toEqual([
      'Already saved',
      'New preset',
    ]);

    act(() => renderer.unmount());
  });

  it('a failed save() does not add the preset to presets, and the returned promise rejects (EC-4)', async () => {
    let lastApi: PresetsApi | undefined;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
      await flushPromises();
    });

    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

    await act(async () => {
      await expect(lastApi!.save('Doomed', 10, true, 5)).rejects.toThrow('storage full');
    });

    expect(lastApi!.presets).toEqual([]);

    act(() => renderer.unmount());
  });
});

describe('migrateDirection (PROJ-3 BUG-15)', () => {
  const legacy: Preset = {
    id: '1',
    name: 'alt',
    distanceSteps: 1000,
    endIsAfterStart: true,
    durationSeconds: 5,
    createdAt: 1,
  };

  it('flips a preset without dirVersion exactly once and stamps it', () => {
    const first = migrateDirection([legacy]);
    expect(first.changed).toBe(true);
    expect(first.presets[0].endIsAfterStart).toBe(false);
    expect(first.presets[0].dirVersion).toBe(2);

    const second = migrateDirection(first.presets);
    expect(second.changed).toBe(false);
    expect(second.presets[0].endIsAfterStart).toBe(false);
  });

  it('leaves presets that already carry dirVersion untouched', () => {
    const current: Preset = { ...legacy, endIsAfterStart: true, dirVersion: 2 };
    const result = migrateDirection([current]);
    expect(result.changed).toBe(false);
    expect(result.presets[0].endIsAfterStart).toBe(true);
  });

  it('persists the migration on load and new saves are not flipped again', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('camera-slider.presets', JSON.stringify([legacy]));

    let lastApi: PresetsApi | undefined;
    await act(async () => {
      ReactTestRenderer.create(renderProbe(api => (lastApi = api)));
      await flushPromises();
    });
    expect(lastApi!.presets[0].endIsAfterStart).toBe(false);

    await act(async () => {
      await lastApi!.save('neu', 2000, true, 3);
    });
    const stored = JSON.parse((await AsyncStorage.getItem('camera-slider.presets')) as string);
    expect(stored.find((p: Preset) => p.name === 'alt').endIsAfterStart).toBe(false);
    expect(stored.find((p: Preset) => p.name === 'neu').endIsAfterStart).toBe(true);
  });
});
