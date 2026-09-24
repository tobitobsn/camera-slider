/**
 * Local persistence for PROJ-4's saved auto-drive configurations ("Presets").
 *
 * This module owns reading and writing the single AsyncStorage key that
 * holds the whole preset list (see `STORAGE_KEY`) — a plain read-modify-write
 * on every `save`/`remove`, since the expected list is small (spec.md
 * explicitly leaves sorting/filtering/search and a count limit out of scope
 * for PROJ-4). It deliberately does NOT:
 *  - reject or dedupe presets with a name that already exists (EC-1) — no
 *    duplicate-name check exists anywhere in this file, by design;
 *  - offer a rename/overwrite of an existing preset — out of scope for
 *    PROJ-4, see spec.md's "Out of Scope";
 *  - render any UI or show error feedback itself — `save`/`remove` re-throw
 *    on a failed AsyncStorage write (EC-4) so the caller (AutoDriveControls,
 *    a later task) can surface that to the user, e.g. via ToastAndroid.
 *
 * Satisfies spec.md's AC-1 (save a new preset), AC-3 (list of saved
 * presets), AC-6 (delete a preset) and AC-9 (presets survive an app
 * restart) — the surrounding UI (save dialog, list rendering, delete
 * confirmation) is a later task on top of this hook.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'camera-slider.presets';

/** A single saved auto-drive configuration (spec.md's Preset entity). */
export type Preset = {
  id: string;
  name: string;
  distanceSteps: number;
  endIsAfterStart: boolean;
  durationSeconds: number;
  createdAt: number;
};

function sortByCreatedAtDescending(presets: Preset[]): Preset[] {
  return [...presets].sort((a, b) => b.createdAt - a.createdAt);
}

async function readStoredPresets(): Promise<Preset[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    return JSON.parse(raw) as Preset[];
  } catch {
    // No presets saved yet (fresh install) and a corrupt/unreadable read are
    // both treated the same on initial load: start from an empty list
    // rather than crashing or surfacing an error for what is, on a fresh
    // install, simply the normal first-run state.
    return [];
  }
}

/**
 * @returns `{ presets, save, remove }`:
 *  - `presets` — the saved preset list, sorted newest-first by `createdAt`.
 *    Starts as `[]` until the initial AsyncStorage read (on mount) resolves,
 *    and stays `[]` if nothing has been saved yet.
 *  - `save(name, distanceSteps, endIsAfterStart, durationSeconds)` —
 *    creates a new Preset (`id`/`createdAt` from `Date.now()`), persists the
 *    full updated list to AsyncStorage, and only then updates `presets` in
 *    memory. On a failed write, `presets` is left unchanged and the error is
 *    re-thrown (EC-4: a failed save must never appear to have succeeded).
 *  - `remove(id)` — same persist-then-update-in-memory, re-throw-on-failure
 *    contract as `save`, for deleting one preset by id.
 */
export function usePresets(): {
  presets: Preset[];
  save: (
    name: string,
    distanceSteps: number,
    endIsAfterStart: boolean,
    durationSeconds: number,
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    let cancelled = false;

    readStoredPresets().then(loaded => {
      if (!cancelled) {
        setPresets(sortByCreatedAtDescending(loaded));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function persist(nextPresets: Preset[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextPresets));
    setPresets(sortByCreatedAtDescending(nextPresets));
  }

  async function save(
    name: string,
    distanceSteps: number,
    endIsAfterStart: boolean,
    durationSeconds: number,
  ): Promise<void> {
    const now = Date.now();
    const newPreset: Preset = {
      id: now.toString(),
      name,
      distanceSteps,
      endIsAfterStart,
      durationSeconds,
      createdAt: now,
    };

    await persist([...presets, newPreset]);
  }

  async function remove(id: string): Promise<void> {
    await persist(presets.filter(preset => preset.id !== id));
  }

  return { presets, save, remove };
}
