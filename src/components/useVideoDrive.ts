/**
 * Orchestrates PROJ-3's auto-drive with video (design.md → "Ablauf einer
 * Fahrt mit Video — Zustandsmodell"):
 *
 *   ready → starting → preroll (2 s) → driving → postroll (2 s) → saving → ready
 *
 * The firmware knows nothing about the camera — pre- and post-roll are app
 * timers around the existing AUTO_DRIVE command, and arrival is read from the
 * slider status (`driving` drops while `atEnd`/`atStart` is set), so
 * "arrived" (→ post-roll) is told apart from "stopped on the way" (→ stop the
 * recording right away, EC-6).
 *
 * Called once, in RootScreen (like useTimelapseSequence): its busy state has
 * to lock jog, auto-drive and timelapse — also during pre-/post-roll, where
 * the firmware does not report `driving`.
 *
 * The camera is reached only through `VideoRecorderPort` (defined here,
 * provided by useVideoCamera), so this hook stays free of camera details.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Device } from 'react-native-ble-plx';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

import {
  sendAutoDriveCommand,
  sendStopCommand,
  type AutoDriveDirection,
  type SliderStatus,
} from '../ble/client';
import { useKeepAwake } from './useKeepAwake';

/** One running recording, as handed back by `VideoRecorderPort.startRecording`. */
export type VideoRecording = {
  /** Ends the recording; the file then arrives through `onFinished`. */
  stop: () => Promise<void>;
};

/** What useVideoDrive needs from the camera (implemented by useVideoCamera). */
export type VideoRecorderPort = {
  startRecording: (callbacks: {
    onFinished: (filePath: string) => void;
    onError: (error: Error) => void;
  }) => Promise<VideoRecording>;
};

export type VideoDrivePhase = 'ready' | 'starting' | 'preroll' | 'driving' | 'postroll' | 'saving';

export type VideoDriveApi = {
  phase: VideoDrivePhase;
  /** true in every phase except 'ready' — locks everything but Stopp (AC-28). */
  busy: boolean;
  /** Whole seconds recorded so far (AC-16); 0 while ready. */
  elapsedSeconds: number;
  /** The last failure's message (AC-18), or null. Cleared by the next start. */
  error: string | null;
  /** Counts videos saved to the gallery — a change means "Video gespeichert" (AC-15). */
  savedCount: number;
  start: (direction: AutoDriveDirection, durationSeconds: number) => void;
  stop: () => void;
};

export const PREROLL_MS = 2000;
export const POSTROLL_MS = 2000;
/** The firmware rejects an invalid AUTO_DRIVE silently — no `driving` within this time means it did. */
export const DRIVE_START_TIMEOUT_MS = 3000;
/** Upper bound for the recorder to hand over its file after stop(). */
export const FINALIZE_TIMEOUT_MS = 10000;

function describeError(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Unbekannter Fehler';
}

export function useVideoDrive(
  device: Device | null,
  status: SliderStatus,
  recorder: VideoRecorderPort | null,
): VideoDriveApi {
  const [phase, setPhaseState] = useState<VideoDrivePhase>('ready');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const { activate, deactivate } = useKeepAwake();

  const phaseRef = useRef<VideoDrivePhase>('ready');
  const runIdRef = useRef(0);
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const recordingRef = useRef<VideoRecording | null>(null);
  const stopRequestedRef = useRef(false);
  const directionRef = useRef<AutoDriveDirection>('startToEnd');
  const sawDrivingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setPhase = useCallback((next: VideoDrivePhase): void => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearAllTimers = useCallback((): void => {
    clearTimer();
    if (finalizeTimerRef.current !== null) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, [clearTimer]);

  /** Back to ready — the single exit of every run. */
  const finish = useCallback(
    (myRunId: number): void => {
      if (runIdRef.current !== myRunId) {
        return;
      }
      runIdRef.current++;
      clearAllTimers();
      recordingRef.current = null;
      setElapsedSeconds(0);
      setPhase('ready');
      deactivate();
    },
    [clearAllTimers, deactivate, setPhase],
  );

  const endRecording = useCallback(
    (myRunId: number, recording: VideoRecording): void => {
      finalizeTimerRef.current = setTimeout(() => {
        setError(current => current ?? 'Video konnte nicht abgeschlossen werden');
        finish(myRunId);
      }, FINALIZE_TIMEOUT_MS);
      recording.stop().catch(() => {
        // A recording that already ended on its own (error) cannot be
        // stopped again; whatever file exists arrives via onFinished, or the
        // finalize timer ends the run.
      });
    },
    [finish],
  );

  /** Ends the recording now (no further post-roll); the file arrives via onFinished. */
  const stopRecording = useCallback(
    (myRunId: number): void => {
      if (runIdRef.current !== myRunId || phaseRef.current === 'saving') {
        return;
      }
      clearTimer();
      setPhase('saving');
      const recording = recordingRef.current;
      if (recording === null) {
        // Still starting — ended once startRecording() resolves.
        stopRequestedRef.current = true;
        return;
      }
      endRecording(myRunId, recording);
    },
    [clearTimer, endRecording, setPhase],
  );

  /** AC-18 / EC-7 / AC-19: stop the motor if it moves, report, save what exists. */
  const fail = useCallback(
    (myRunId: number, message: string | null): void => {
      if (runIdRef.current !== myRunId || phaseRef.current === 'ready') {
        return;
      }
      if (message !== null) {
        setError(message);
      }
      const currentDevice = deviceRef.current;
      if (phaseRef.current === 'driving' && currentDevice) {
        sendStopCommand(currentDevice).catch(() => {});
      }
      stopRecording(myRunId);
    },
    [stopRecording],
  );

  const handleFinished = useCallback(
    (myRunId: number, filePath: string): void => {
      if (runIdRef.current !== myRunId) {
        return;
      }
      CameraRoll.save(`file://${filePath}`, { type: 'video' })
        .then(() => setSavedCount(count => count + 1))
        .catch(err => setError(`Video konnte nicht gespeichert werden: ${describeError(err)}`))
        .finally(() => finish(myRunId));
    },
    [finish],
  );

  const beginDrive = useCallback(
    (myRunId: number, durationSeconds: number): void => {
      if (runIdRef.current !== myRunId) {
        return;
      }
      const currentDevice = deviceRef.current;
      if (!currentDevice) {
        fail(myRunId, null);
        return;
      }
      setPhase('driving');
      sawDrivingRef.current = false;
      timerRef.current = setTimeout(() => {
        if (!sawDrivingRef.current) {
          fail(myRunId, 'Fahrt konnte nicht starten');
        }
      }, DRIVE_START_TIMEOUT_MS);
      sendAutoDriveCommand(currentDevice, directionRef.current, durationSeconds).catch(err =>
        fail(myRunId, `Fahrt konnte nicht gestartet werden: ${describeError(err)}`),
      );
    },
    [fail, setPhase],
  );

  const start = useCallback(
    (direction: AutoDriveDirection, durationSeconds: number): void => {
      const port = recorderRef.current;
      // EC-5: a second trigger outside 'ready' is ignored.
      if (phaseRef.current !== 'ready' || !deviceRef.current || !port) {
        return;
      }
      const myRunId = ++runIdRef.current;
      directionRef.current = direction;
      stopRequestedRef.current = false;
      setError(null);
      setElapsedSeconds(0);
      setPhase('starting');
      activate();

      port
        .startRecording({
          onFinished: filePath => handleFinished(myRunId, filePath),
          onError: err => fail(myRunId, `Aufnahme abgebrochen: ${describeError(err)}`),
        })
        .then(recording => {
          if (runIdRef.current !== myRunId) {
            recording.stop().catch(() => {});
            return;
          }
          recordingRef.current = recording;
          if (stopRequestedRef.current) {
            // Stopp, a disconnect or an error arrived while starting.
            endRecording(myRunId, recording);
            return;
          }
          const startedAt = Date.now();
          tickRef.current = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
          }, 250);
          setPhase('preroll');
          timerRef.current = setTimeout(() => beginDrive(myRunId, durationSeconds), PREROLL_MS);
        })
        .catch(err => {
          setError(`Aufnahme konnte nicht starten: ${describeError(err)}`);
          finish(myRunId);
        });
    },
    [activate, beginDrive, endRecording, fail, finish, handleFinished, setPhase],
  );

  const stop = useCallback((): void => {
    const current = phaseRef.current;
    if (current === 'ready' || current === 'saving') {
      return;
    }
    const currentDevice = deviceRef.current;
    if (current === 'driving' && currentDevice) {
      sendStopCommand(currentDevice).catch(() => {});
    }
    stopRecording(runIdRef.current);
  }, [stopRecording]);

  // Arrival / stop on the way, from the slider status.
  useEffect(() => {
    if (phaseRef.current !== 'driving') {
      return;
    }
    const myRunId = runIdRef.current;
    if (status.driving) {
      if (!sawDrivingRef.current) {
        sawDrivingRef.current = true;
        clearTimer();
      }
      return;
    }
    if (!sawDrivingRef.current) {
      return;
    }
    const arrived = directionRef.current === 'startToEnd' ? status.atEnd : status.atStart;
    if (arrived) {
      setPhase('postroll');
      timerRef.current = setTimeout(() => stopRecording(myRunId), POSTROLL_MS);
    } else {
      // EC-6: the firmware stopped on the way (e.g. battery protective stop).
      stopRecording(myRunId);
    }
  }, [status.driving, status.atEnd, status.atStart, clearTimer, setPhase, stopRecording]);

  // AC-19: connection lost — the firmware stops the motor itself.
  useEffect(() => {
    if (device === null && phaseRef.current !== 'ready') {
      stopRecording(runIdRef.current);
    }
  }, [device, stopRecording]);

  // AC-18 / EC-7: the app going to the background ends the run, deterministically.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'background') {
        fail(runIdRef.current, 'App wurde in den Hintergrund verschoben — Aufnahme abgebrochen');
      }
    });
    return () => subscription.remove();
  }, [fail]);

  // Unmount: no timers or wakelock left behind.
  useEffect(
    () => () => {
      clearAllTimers();
      deactivate();
    },
    [clearAllTimers, deactivate],
  );

  return {
    phase,
    busy: phase !== 'ready',
    elapsedSeconds,
    error,
    savedCount,
    start,
    stop,
  };
}
