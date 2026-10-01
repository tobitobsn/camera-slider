/**
 * Local persistence for PROJ-3's video settings (design.md → "Datenmodell:
 * Video-Einstellungen"): one record under `STORAGE_KEY`, holding the
 * "Video aufnehmen" switch, sound, resolution, fps, lens and stabilization
 * (AC-13, AC-21, AC-22, AC-23, AC-24) so they survive an app restart (AC-26).
 *
 * Deliberately NOT stored here: the focus/exposure lock (session only,
 * AC-26) and anything about the device — whether a remembered lens or format
 * is actually available is resolved by `videoFormats`, without overwriting
 * the remembered value.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_FPS,
  DEFAULT_LENS,
  DEFAULT_RESOLUTION,
  LENS_TYPES,
  VIDEO_FPS,
  VIDEO_RESOLUTIONS,
  type LensType,
  type VideoFps,
  type VideoResolution,
} from './videoFormats';

export const STORAGE_KEY = 'camera-slider.video-settings';
const SCHEMA_VERSION = 1;

export type VideoSettings = {
  videoEnabled: boolean;
  soundEnabled: boolean;
  resolution: VideoResolution;
  fps: VideoFps;
  lens: LensType;
  stabilizationEnabled: boolean;
};

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  videoEnabled: false,
  soundEnabled: true,
  resolution: DEFAULT_RESOLUTION,
  fps: DEFAULT_FPS,
  lens: DEFAULT_LENS,
  stabilizationEnabled: false,
};

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Turns whatever was stored into valid settings: a missing or unreadable
 * record, or an unknown value in one field, falls back to the default for
 * that field only — the other fields are kept.
 */
export function parseVideoSettings(raw: string | null): VideoSettings {
  let stored: Record<string, unknown> = {};
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        stored = parsed as Record<string, unknown>;
      }
    } catch {
      // unreadable → all defaults
    }
  }
  const d = DEFAULT_VIDEO_SETTINGS;
  return {
    videoEnabled: pickBoolean(stored.videoEnabled, d.videoEnabled),
    soundEnabled: pickBoolean(stored.soundEnabled, d.soundEnabled),
    resolution: pick(stored.resolution, VIDEO_RESOLUTIONS, d.resolution),
    fps: pick(stored.fps, VIDEO_FPS, d.fps),
    lens: pick(stored.lens, LENS_TYPES, d.lens),
    stabilizationEnabled: pickBoolean(stored.stabilizationEnabled, d.stabilizationEnabled),
  };
}

/**
 * @returns
 *  - `settings` — the current settings; the defaults until the stored record
 *    has been read on mount.
 *  - `update(changes)` — applies a user change immediately and writes the
 *    whole record. A failed write keeps the change for this session (the
 *    settings are a convenience, not data the user could lose).
 */
export function useVideoSettings(): {
  settings: VideoSettings;
  update: (changes: Partial<VideoSettings>) => void;
} {
  const [settings, setSettings] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS);
  const settingsRef = useRef(settings);
  // A change the user makes before the initial read resolves must not be
  // overwritten by that read.
  const changedBeforeLoadRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .catch(() => null)
      .then(raw => {
        if (!cancelled && !changedBeforeLoadRef.current) {
          const loaded = parseVideoSettings(raw);
          settingsRef.current = loaded;
          setSettings(loaded);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((changes: Partial<VideoSettings>): void => {
    changedBeforeLoadRef.current = true;
    const next = { ...settingsRef.current, ...changes };
    settingsRef.current = next;
    setSettings(next);
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...next }),
    ).catch(() => {
      // see the hook's doc comment — kept in memory for this session
    });
  }, []);

  return { settings, update };
}
