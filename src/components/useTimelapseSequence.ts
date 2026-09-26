/**
 * Sequence-orchestration hook for PROJ-5's Zeitraffer-Modus — see design.md
 * → "App-seitige Sequenzsteuerung" for the pseudocode this mirrors, and its
 * "Technische Entscheidungen" table for why the wait strategy and the exact
 * last-step formula are what they are.
 *
 * This is the one place that drives a whole timelapse run: it reads the
 * frozen distance/direction, moves the carriage step by step via
 * TIMELAPSE_MOVE (src/ble/client.ts, PROJ-5 T2), takes a photo at each stop
 * via useCameraCapture() (T3), keeps the screen awake via useKeepAwake() (T3)
 * for the whole run, and sends the existing AUTO_DRIVE(Ende→Start) (PROJ-3)
 * to return to the start point once every shot has been taken.
 *
 * Deliberately does NOT own any UI — TimelapseControls (a later task, T7)
 * renders progress/inputs from the state this hook returns and calls
 * start()/stop() from button handlers.
 */
import { useCallback, useRef, useState } from 'react';
import type { Device } from 'react-native-ble-plx';

import {
  sendAutoDriveCommand,
  sendStopCommand,
  sendTimelapseMoveCommand,
  subscribeToStatus,
  type SliderStatus,
} from '../ble/client';
import { minAutoDriveDurationSeconds } from './AutoDriveControls';
import { useKeepAwake } from './useKeepAwake';
import { useSliderStatus } from './useSliderStatus';

/**
 * How long to wait for the firmware to confirm it actually accepted a
 * TIMELAPSE_MOVE command (a Status notify with timelapseMoving flipping to
 * true) before treating the step as failed. Short on purpose — a genuine
 * acceptance is near-instant (the firmware sets the flag the moment it
 * starts stepping the motor); anything slower almost certainly means the
 * command was silently rejected (design.md's "App-seitige
 * Sequenzsteuerung" — the same BUG-5-shaped gap this two-stage wait exists
 * to close for this new opcode).
 */
const TIMELAPSE_MOVE_START_TIMEOUT_MS = 2000;

/**
 * How long to wait for the firmware to report arrival (timelapseMoving back
 * to false) once a move has been confirmed started. Generous, because the
 * real travel time depends on the step's distance — design.md is explicit
 * that a single fixed upper bound is good enough for this hobby project's
 * rail lengths, no dynamic per-distance calculation needed.
 */
const TIMELAPSE_MOVE_ARRIVE_TIMEOUT_MS = 15000;

/**
 * Fixed settle pause after the firmware reports arrival and before the photo
 * is taken, so the carriage's residual vibration from stopping has a moment
 * to die down before the shot. 400ms is a common rule-of-thumb settle time
 * for a small stepper-driven rig — not measured against this specific
 * hardware, just a sensible default that costs little against a multi-
 * second shot interval.
 */
const SETTLE_PAUSE_MS = 400;

/**
 * Safety margin on top of the theoretical fastest-possible duration
 * (minAutoDriveDurationSeconds, AutoDriveControls.tsx) used for the return
 * drive. Sending exactly the theoretical minimum risks the firmware's speed
 * computation landing a hair over the 4000 steps/s cap from pure
 * floating-point rounding — the same concern AutoDriveControls' own
 * AUTO_DRIVE_SPEED_TOLERANCE_STEPS_PER_SEC works around on the read side. A
 * small buffer avoids that without noticeably slowing the return drive down.
 */
const RETURN_DRIVE_DURATION_SAFETY_MARGIN = 1.05;

/**
 * Floor for the computed return-drive duration — guards a degenerate
 * 0-distance sequence (shouldn't happen given the precondition that a real
 * start/end range exists before a sequence can be started, but a plain fixed
 * floor is cheaper than a special case).
 */
const MIN_RETURN_DRIVE_DURATION_SECONDS = 1;

/**
 * Derives a short, sensible duration for the end-of-sequence return drive
 * (AC-2) from the frozen start/end distance — design.md leaves the exact
 * choice open ("wähle einen sinnvollen festen Wert oder leite ihn aus der
 * Distanz ab"); reusing AutoDriveControls' own speed-solving formula keeps
 * this in sync with the firmware's actual 200-4000 steps/s speed bounds
 * instead of guessing a value that might be too fast (rejected) or
 * needlessly slow for a short rail.
 */
function computeReturnDriveDurationSeconds(distanceSteps: number): number {
  if (distanceSteps <= 0) {
    return MIN_RETURN_DRIVE_DURATION_SECONDS;
  }
  return Math.max(
    MIN_RETURN_DRIVE_DURATION_SECONDS,
    minAutoDriveDurationSeconds(distanceSteps) * RETURN_DRIVE_DURATION_SAFETY_MARGIN,
  );
}

/** Turns any thrown value into a user-presentable German message. */
function describeError(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Unbekannter Fehler';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resolves once a Status notify matching `predicate` arrives, or rejects
 * with `timeoutMessage` if none arrives within `timeoutMs`. This is the
 * building block for the two-stage wait design.md calls for (first
 * `timelapseMoving === true`, then `=== false`) — see this file's header for
 * why a fixed-time guess or the bare write-response alone isn't enough here.
 *
 * Safe even if `subscribeToStatus`'s callback fires synchronously (before it
 * has returned its own unsubscribe function): `cleanup` only gets assigned
 * once we're back from that call, and is invoked immediately afterwards if
 * the predicate already matched during it.
 */
function waitForStatusCondition(
  device: Device,
  predicate: (status: SliderStatus) => boolean,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let cleanup: (() => void) | null = null;

    const timeoutHandle = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup?.();
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    const unsubscribe = subscribeToStatus(device, status => {
      if (settled || !predicate(status)) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      cleanup?.();
      resolve();
    });

    if (settled) {
      unsubscribe();
    } else {
      cleanup = unsubscribe;
    }
  });
}

/** Wraps capturePhoto() so a rejection carries a clear, prefixed message. */
async function capturePhotoOrThrow(capturePhoto: () => Promise<void>): Promise<void> {
  try {
    await capturePhoto();
  } catch (err) {
    throw new Error(`Foto konnte nicht aufgenommen werden: ${describeError(err)}`);
  }
}

/**
 * Sends one TIMELAPSE_MOVE and waits out the two-stage confirmation
 * (design.md → "App-seitige Sequenzsteuerung"). Throws with a clear message
 * on a send failure, a start-confirmation timeout (the command was likely
 * rejected — AC-6), or an arrival-confirmation timeout.
 */
async function moveToTimelapseTargetOrThrow(
  device: Device,
  endIsAfterStart: boolean,
  targetDistanceSteps: number,
): Promise<void> {
  try {
    await sendTimelapseMoveCommand(device, endIsAfterStart, targetDistanceSteps);
  } catch (err) {
    throw new Error(`Zeitraffer-Bewegung konnte nicht gesendet werden: ${describeError(err)}`);
  }

  await waitForStatusCondition(
    device,
    status => status.timelapseMoving === true,
    TIMELAPSE_MOVE_START_TIMEOUT_MS,
    'Zeitüberschreitung: Der Slider hat die Zeitraffer-Bewegung nicht bestätigt — der Befehl wurde vermutlich verworfen',
  );

  await waitForStatusCondition(
    device,
    status => status.timelapseMoving === false,
    TIMELAPSE_MOVE_ARRIVE_TIMEOUT_MS,
    'Zeitüberschreitung: Die Ankunft am Zielpunkt wurde nicht bestätigt',
  );
}

export type TimelapseSequenceApi = {
  isRunning: boolean;
  /** 0 while not running. */
  currentShot: number;
  /** 0 while not running. */
  totalShots: number;
  /** Rough estimate (remaining shots × interval); 0 while not running. */
  remainingSeconds: number;
  /** The last failure's message, or null if there wasn't one. */
  error: string | null;
  start: (shotCount: number, intervalSeconds: number) => void;
  stop: () => void;
};

/**
 * @param device The live BLE Device, or null while not connected — same
 *   contract as useSliderStatus/ConnectionProvider's `device` field.
 * @param capturePhoto qa-report.md BUG-2: `useCameraCapture()` must be
 *   called exactly once in the tree, not once per hook — a second, separate
 *   call creates its own `usePhotoOutput()` instance that is never attached
 *   to the actual `<Camera>` component, so any photo captured through it
 *   fails. The one call now lives in RootScreen.tsx (alongside its existing
 *   single `useTimelapseSequence(device)` call, for the same "stateful hook,
 *   don't instantiate twice" reason) and `capturePhoto` is passed down here
 *   instead of this hook calling `useCameraCapture()` itself.
 */
export function useTimelapseSequence(
  device: Device | null,
  capturePhoto: () => Promise<void>,
): TimelapseSequenceApi {
  const [isRunning, setIsRunning] = useState(false);
  const [currentShot, setCurrentShot] = useState(0);
  const [totalShots, setTotalShots] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const status = useSliderStatus(device);
  const { activate, deactivate } = useKeepAwake();

  // "Latest value" refs, mirrored directly during render (a standard,
  // side-effect-free pattern for this — no useEffect needed since it's a
  // plain assignment, not a subscription). The long-running async sequence
  // below always reads through these instead of closing over device/status
  // directly, so it sees the current device (needed for AC-7 — a disconnect
  // mid-sequence surfaces as a null device at the next step's guard) without
  // start()/runSequence() having to be re-created every time a Status notify
  // updates `status` (which happens frequently while a sequence runs).
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const statusRef = useRef(status);
  statusRef.current = status;
  const capturePhotoRef = useRef(capturePhoto);
  capturePhotoRef.current = capturePhoto;

  // Bumped on every start()/stop() to invalidate any in-flight sequence loop
  // from a previous run: the loop checks this after every await and quietly
  // returns once it no longer matches, instead of continuing to act (or
  // report a result) for a sequence that has already been stopped or
  // superseded by a fresh start().
  const runIdRef = useRef(0);
  const isRunningRef = useRef(false);

  const finishRun = useCallback(
    (myRunId: number, finalError: string | null): void => {
      if (runIdRef.current !== myRunId) {
        return;
      }
      isRunningRef.current = false;
      setIsRunning(false);
      setCurrentShot(0);
      setTotalShots(0);
      setRemainingSeconds(0);
      setError(finalError);
      deactivate();
    },
    [deactivate],
  );

  const runSequence = useCallback(
    async (
      myRunId: number,
      shotCount: number,
      intervalSeconds: number,
      frozenDistanceSteps: number,
      frozenEndIsAfterStart: boolean,
    ): Promise<void> => {
      // Step 1 (design.md): the first shot is taken immediately at the
      // current (start) position — no TIMELAPSE_MOVE needed for it.
      try {
        await capturePhotoOrThrow(capturePhotoRef.current);
      } catch (err) {
        finishRun(myRunId, describeError(err));
        return;
      }

      for (let i = 2; i <= shotCount; i++) {
        if (runIdRef.current !== myRunId) {
          return;
        }

        // Marks the start of this step so the "rest of the interval" wait
        // below can subtract however long the move+confirm+settle+photo
        // actually took (design.md step 3g).
        const stepStartedAt = Date.now();

        try {
          const currentDevice = deviceRef.current;
          if (!currentDevice) {
            // AC-7: a disconnect mid-sequence surfaces here as a null
            // device — no separate disconnect handling needed, this is the
            // same failure path as any other failed step.
            throw new Error('Verbindung zum Slider verloren');
          }

          // Computed directly from the frozen total, not accumulated from
          // previous steps — guarantees the last step (i === shotCount)
          // lands on exactly frozenDistanceSteps, with no rounding drift
          // (design.md's "Technische Entscheidungen" — required for the
          // return AUTO_DRIVE to work, which needs an exact endPosition
          // match).
          const targetDistanceSteps = Math.round(
            (frozenDistanceSteps * (i - 1)) / (shotCount - 1),
          );

          await moveToTimelapseTargetOrThrow(
            currentDevice,
            frozenEndIsAfterStart,
            targetDistanceSteps,
          );

          if (runIdRef.current !== myRunId) {
            return;
          }

          await delay(SETTLE_PAUSE_MS);

          if (runIdRef.current !== myRunId) {
            return;
          }

          await capturePhotoOrThrow(capturePhotoRef.current);
        } catch (err) {
          if (runIdRef.current !== myRunId) {
            return;
          }
          finishRun(myRunId, describeError(err));
          return;
        }

        if (runIdRef.current !== myRunId) {
          return;
        }

        setCurrentShot(i);
        setRemainingSeconds(Math.max(0, intervalSeconds * (shotCount - i)));

        const elapsedMs = Date.now() - stepStartedAt;
        const restMs = Math.max(0, intervalSeconds * 1000 - elapsedMs);
        await delay(restMs);

        if (runIdRef.current !== myRunId) {
          return;
        }
      }

      // AC-2: return to the start point via the existing AUTO_DRIVE, reused
      // as-is (design.md — the carriage is exactly at the registered end
      // point after the last step). Best-effort: every shot has already
      // been taken successfully at this point, so a failure here (e.g. a
      // disconnect right at the end) doesn't retroactively fail the
      // sequence — the user can still drive back manually.
      const currentDevice = deviceRef.current;
      if (currentDevice) {
        try {
          const returnDurationSeconds = computeReturnDriveDurationSeconds(frozenDistanceSteps);
          await sendAutoDriveCommand(currentDevice, 'endToStart', returnDurationSeconds);
        } catch {
          // best-effort, see comment above
        }
      }

      if (runIdRef.current !== myRunId) {
        return;
      }
      finishRun(myRunId, null);
    },
    [finishRun],
  );

  const start = useCallback(
    (shotCount: number, intervalSeconds: number): void => {
      const myRunId = ++runIdRef.current;

      // Frozen once, here, per design.md — not re-read at every step, so a
      // status change mid-sequence for an unrelated reason can't shift the
      // target computation partway through.
      const frozenDistanceSteps = statusRef.current.distanceSteps;
      const frozenEndIsAfterStart = statusRef.current.endIsAfterStart;

      if (frozenDistanceSteps === null || frozenEndIsAfterStart === null) {
        // Defensive: the calling component (TimelapseControls, T7) only
        // enables the start control once a full start/end range is known,
        // so this shouldn't be reachable in practice — but failing clearly
        // here beats computing NaN target positions if it ever is.
        setError('Kein Start-/Endpunkt bekannt — Sequenz kann nicht gestartet werden');
        return;
      }

      isRunningRef.current = true;
      setIsRunning(true);
      setCurrentShot(1);
      setTotalShots(shotCount);
      setRemainingSeconds(Math.max(0, intervalSeconds * (shotCount - 1)));
      setError(null);
      activate();

      void runSequence(
        myRunId,
        shotCount,
        intervalSeconds,
        frozenDistanceSteps,
        frozenEndIsAfterStart,
      );
    },
    [activate, runSequence],
  );

  const stop = useCallback((): void => {
    // Invalidates any in-flight runSequence() loop regardless of whether one
    // is currently active — cheap and always safe.
    runIdRef.current += 1;
    if (!isRunningRef.current) {
      return;
    }
    isRunningRef.current = false;

    // AC-4: no return drive. Fire-and-forget, matching this project's
    // existing convention for STOP (AutoDriveControls.tsx's handleStop).
    const currentDevice = deviceRef.current;
    if (currentDevice) {
      sendStopCommand(currentDevice).catch(() => {});
    }

    setIsRunning(false);
    setCurrentShot(0);
    setTotalShots(0);
    setRemainingSeconds(0);
    deactivate();
  }, [deactivate]);

  return { isRunning, currentShot, totalShots, remainingSeconds, error, start, stop };
}
