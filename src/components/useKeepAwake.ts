/**
 * Device-capability hook for PROJ-5's Zeitraffer-Modus: manual screen
 * wakelock control (spec.md AC-8 — the screen must not lock while a
 * timelapse sequence, which can run for a long time, is in progress).
 *
 * Deliberately NOT effect-based (no automatic activate-on-mount): the later
 * sequence-orchestration hook `useTimelapseSequence` (T5) calls
 * `activate()`/`deactivate()` explicitly at the start/end of a sequence, not
 * for as long as some component stays mounted (design.md and tasks.md T3
 * are explicit about this — `TimelapseControls`, which mounts for the whole
 * time the connected screen is visible, is not the right scope for the
 * wakelock; only an actually-running sequence is).
 *
 * Library: `@sayem314/react-native-keep-awake`, per design.md's candidate.
 * Verified before installing (tasks.md T3 explicitly calls for this check):
 * its package.json (v2.0.0, fetched from GitHub) declares
 * `peerDependencies: { "react-native": ">=0.82.0" }` and a `codegenConfig`
 * block (TurboModule spec `ReactNativeKCKeepAwakeSpec`) — i.e. this version
 * is New-Architecture-only, no legacy-bridge fallback. This project is on
 * react-native 0.87.1 with `newArchEnabled=true` (android/gradle.properties),
 * so it's a match; no need to fall back to an alternative library.
 * `activateKeepAwake()`/`deactivateKeepAwake()` both take no parameters
 * (its index.d.ts) — a plain on/off, not a tag-based reference count.
 */
import { useCallback } from 'react';
import { activateKeepAwake, deactivateKeepAwake } from '@sayem314/react-native-keep-awake';

/**
 * @returns `{ activate, deactivate }` — explicit, imperative wakelock
 *   control. No automatic activation on mount/unmount; the caller owns the
 *   lifecycle (see file header).
 */
export function useKeepAwake(): { activate: () => void; deactivate: () => void } {
  const activate = useCallback((): void => {
    activateKeepAwake();
  }, []);

  const deactivate = useCallback((): void => {
    deactivateKeepAwake();
  }, []);

  return { activate, deactivate };
}
