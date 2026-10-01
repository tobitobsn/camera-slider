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
import { deleteCacheFile, deleteLeftoverVideos } from './cacheFiles';
import { useKeepAwake } from './useKeepAwake';

/** One running recording, as handed back by `VideoRecorderPort.startRecording`. */
export type VideoRecording = {
  /** Ends the recording; the file then arrives through `onFinished`. */
  stop: () => Promise<void>;
};

/** What useVideoDrive needs from the camera (implemented by useVideoCamera). */
export type VideoRecorderPort = {
  /**
   * AC-20: null when a take can start; otherwise the hint to show instead —
   * a missing permission is requested where Android still allows asking.
   */
  prepare: () => string | null;
  startRecording: (callbacks: {
    onFinished: (filePath: string) => void;
    /** `filePath`: what was recorded until the error — saved as far as possible (AC-18). */
    onError: (error: Error, filePath: string | null) => void;
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
/** Upper bound for the recording to start — the camera may never answer (BUG-43). */
export const START_TIMEOUT_MS = 5000;

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
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (startTimerRef.current !== null) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
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
      // A take that is already being saved is not interrupted any more (BUG-53).
      if (runIdRef.current !== myRunId || phaseRef.current === 'ready' || phaseRef.current === 'saving') {
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

  /** Copies the take into the gallery (AC-15), then removes the cache copy (BUG-48). */
  const saveTake = useCallback(
    (myRunId: number, filePath: string): void => {
      CameraRoll.save(`file://${filePath}`, { type: 'video' })
        .then(() => setSavedCount(count => count + 1))
        .catch(err => setError(current => current ?? `Video konnte nicht gespeichert werden: ${describeError(err)}`))
        .finally(() => {
          deleteCacheFile(filePath);
          finish(myRunId);
        });
    },
    [finish],
  );

  /**
   * AC-18: the recording ended on its own (error, or a stop nobody asked
   * for) — halt the carriage, report it, keep what was recorded.
   */
  const endUnexpectedly = useCallback(
    (myRunId: number, message: string, filePath: string | null): void => {
      const currentDevice = deviceRef.current;
      if (phaseRef.current === 'driving' && currentDevice) {
        sendStopCommand(currentDevice).catch(() => {});
      }
      setError(current => current ?? message);
      clearAllTimers();
      recordingRef.current = null;
      setPhase('saving');
      if (filePath !== null) {
        saveTake(myRunId, filePath);
      } else {
        finish(myRunId);
      }
    },
    [clearAllTimers, finish, saveTake, setPhase],
  );

  const handleFinished = useCallback(
    (myRunId: number, filePath: string): void => {
      if (runIdRef.current !== myRunId) {
        // A run that already ended (start or finalize timeout) — nobody saves this file.
        deleteCacheFile(filePath);
        return;
      }
      if (phaseRef.current !== 'saving') {
        // BUG-45: the recorder stopped without being asked (camera taken
        // away, session reconfigured) — not a regular end of the take.
        endUnexpectedly(myRunId, 'Aufnahme wurde unerwartet beendet', filePath);
        return;
      }
      clearAllTimers();
      saveTake(myRunId, filePath);
    },
    [clearAllTimers, endUnexpectedly, saveTake],
  );

  const handleRecordingError = useCallback(
    (myRunId: number, err: Error, filePath: string | null): void => {
      if (runIdRef.current !== myRunId) {
        if (filePath !== null) {
          deleteCacheFile(filePath);
        }
        return;
      }
      // BUG-44: the recorder never hands this file over through onFinished.
      endUnexpectedly(myRunId, `Aufnahme abgebrochen: ${describeError(err)}`, filePath);
    },
    [endUnexpectedly],
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
      // AC-20 / BUG-42: no take without camera (and, with sound, microphone).
      const blocked = port.prepare();
      if (blocked !== null) {
        setError(blocked);
        return;
      }
      const myRunId = ++runIdRef.current;
      directionRef.current = direction;
      stopRequestedRef.current = false;
      setError(null);
      setElapsedSeconds(0);
      setPhase('starting');
      activate();
      // BUG-43: without this, a camera that never answers keeps the run (and
      // the screen wakelock) in 'starting' — or after Stopp in 'saving' — forever.
      startTimerRef.current = setTimeout(() => {
        startTimerRef.current = null;
        if (runIdRef.current === myRunId && recordingRef.current === null) {
          setError(current => current ?? 'Aufnahme konnte nicht starten — die Kamera reagiert nicht');
          finish(myRunId);
        }
      }, START_TIMEOUT_MS);

      port
        .startRecording({
          onFinished: filePath => handleFinished(myRunId, filePath),
          onError: (err, filePath) => handleRecordingError(myRunId, err, filePath),
        })
        .then(recording => {
          if (startTimerRef.current !== null) {
            clearTimeout(startTimerRef.current);
            startTimerRef.current = null;
          }
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
          if (runIdRef.current !== myRunId) {
            return;
          }
          setError(`Aufnahme konnte nicht starten: ${describeError(err)}`);
          finish(myRunId);
        });
    },
    [activate, beginDrive, endRecording, finish, handleFinished, handleRecordingError, setPhase],
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

  // App start: nothing records yet — remove what an earlier run left in the cache (BUG-48).
  useEffect(() => {
    deleteLeftoverVideos();
  }, []);

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
