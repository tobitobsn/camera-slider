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
  /**
   * qa-report.md (PROJ-3) BUG-15: the firmware's DIR polarity was inverted on
   * 2026-09-29, which flipped the physical meaning of `endIsAfterStart`
   * ("direction of increasing steps"). A preset without this field predates
   * the flip; it is corrected once on read (see migrateDirection()) and
   * stored with `dirVersion: 2` from then on.
   */
  dirVersion?: number;
};

const CURRENT_DIR_VERSION = 2;

/**
 * Flips `endIsAfterStart` once for every preset saved before the DIR
 * polarity inversion, so it keeps driving the same PHYSICAL way. Presets
 * that already carry `dirVersion` are returned untouched, so this is
 * idempotent.
 */
export function migrateDirection(presets: Preset[]): { presets: Preset[]; changed: boolean } {
  let changed = false;
  const migrated = presets.map(preset => {
    if (preset.dirVersion !== undefined) {
      return preset;
    }
    changed = true;
    return {
      ...preset,
      endIsAfterStart: !preset.endIsAfterStart,
      dirVersion: CURRENT_DIR_VERSION,
    };
  });
  return { presets: migrated, changed };
}

function sortByCreatedAtDescending(presets: Preset[]): Preset[] {
  return [...presets].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Raw read + parse, no error handling — propagates on a genuine storage or
 * parse failure. Used by save()/remove() (see readStoredPresetsForMount()
 * below for why the mount path swallows errors but this one must not).
 */
async function readStoredPresetsFromStorage(): Promise<Preset[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return [];
  }
  const { presets, changed } = migrateDirection(JSON.parse(raw) as Preset[]);
  if (changed) {
    // Best effort: if this write fails, the stored list is still unmigrated
    // and the next read migrates it again identically (idempotent).
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch {
      // ignore, see above
    }
  }
  return presets;
}

async function readStoredPresetsForMount(): Promise<Preset[]> {
  try {
    return await readStoredPresetsFromStorage();
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

    readStoredPresetsForMount().then(loaded => {
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
      dirVersion: CURRENT_DIR_VERSION,
    };

    // qa-report.md BUG-3: building the next list from the in-memory
    // `presets` state (rather than a fresh read) meant a failed initial
    // mount-read — silently treated as "no presets" by
    // readStoredPresetsForMount() above — left `presets` at [] even though
    // real presets were still on disk. The next save() would then persist
    // just the one new preset, discarding everything else. Reading fresh
    // here means a genuine storage failure now surfaces as this call's
    // rejection (EC-4) instead of silently overwriting real data.
    const currentPresets = await readStoredPresetsFromStorage();
    await persist([...currentPresets, newPreset]);
  }

  async function remove(id: string): Promise<void> {
    // Same BUG-3 fix as save() above.
    const currentPresets = await readStoredPresetsFromStorage();
    await persist(currentPresets.filter(preset => preset.id !== id));
  }

  return { presets, save, remove };
}
