/**
 * Camera side of PROJ-3's video recording (design.md → "Was die Bibliothek
 * auf Android hergibt", "Angebotene Formate und Objektive", "Fokus-,
 * Belichtungs- und Weißabgleich-Sperre"): camera and microphone permission,
 * the lens and format actually used, the video output and session
 * constraints for `<Camera>`, the tap-to-lock, and the `VideoRecorderPort`
 * that useVideoDrive records through.
 *
 * Called once, in RootScreen — a second call would create a second video
 * output that is never attached to the rendered `<Camera>` (same trap as
 * PROJ-5's BUG-2 with the photo output).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import {
  VisionCamera,
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
  type CameraDevice,
  type CameraRef,
  type CameraSessionConfig,
  type CameraVideoOutput,
  type Constraint,
} from 'react-native-vision-camera';

import type { VideoRecorderPort } from './useVideoDrive';
import type { VideoSettings } from './useVideoSettings';
import {
  DEFAULT_FPS,
  DEFAULT_RESOLUTION,
  RESOLUTION_SIZES,
  availableFormats,
  availableLenses,
  STABILIZATION_MODE,
  effectiveFormat,
  effectiveLens,
  formatLabel,
  probeFormats,
  supportsStabilization,
  type Lens,
  type VideoFormat,
} from './videoFormats';

export type PermissionInfo = {
  granted: boolean;
  /** false once the user has denied it — then only the system settings help (AC-20). */
  canRequest: boolean;
  request: () => Promise<boolean>;
};

export type FocusLock = { x: number; y: number };

export type VideoCameraApi = {
  camera: PermissionInfo;
  microphone: PermissionInfo;
  openSettings: () => void;
  lenses: Lens[];
  lens: Lens | undefined;
  /** Offered formats (AC-22) — empty while the camera is still being asked which it delivers. */
  formats: VideoFormat[];
  format: VideoFormat | undefined;
  stabilizationSupported: boolean;
  /** For `<Camera device outputs constraints ref onError>`. */
  cameraDevice: CameraDevice | undefined;
  videoOutput: CameraVideoOutput;
  constraints: Constraint[];
  cameraRef: React.RefObject<CameraRef | null>;
  onCameraError: (error: Error) => void;
  /** For `<Camera onSessionConfigSelected>` — reports a frame rate the camera did not honour. */
  onSessionConfigSelected: (config: CameraSessionConfig) => void;
  /** A one-line hint (format fallback, focus lock unsupported), or null. */
  notice: string | null;
  /** Where the lock was set, in preview coordinates — null while on "Auto" (AC-25). */
  focusLock: FocusLock | null;
  lockAt: (point: FocusLock) => void;
  unlock: () => void;
  recorder: VideoRecorderPort;
};

const DEFAULT_FORMAT: VideoFormat = { resolution: DEFAULT_RESOLUTION, fps: DEFAULT_FPS };

export const FOCUS_UNSUPPORTED_NOTICE = 'Fokus-Sperre wird von diesem Objektiv nicht unterstützt';

function describeError(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Unbekannter Fehler';
}

function stabilizationConstraint(enabled: boolean): Constraint {
  return { videoStabilizationMode: enabled ? STABILIZATION_MODE : 'off' };
}

export function useVideoCamera(settings: VideoSettings): VideoCameraApi {
  const cameraPermission = useCameraPermission();
  const microphonePermission = useMicrophonePermission();
  const devices = useCameraDevices();

  const [notice, setNotice] = useState<string | null>(null);
  const [focusLock, setFocusLock] = useState<FocusLock | null>(null);
  // Set when the camera rejected the chosen format — the default is used
  // instead until the user picks something else (design.md).
  const [formatRejected, setFormatRejected] = useState(false);

  const lenses = useMemo(() => availableLenses(devices), [devices]);
  const lens = effectiveLens(lenses, settings.lens);
  const lensDevice = lens?.device;
  const candidates = useMemo(() => (lensDevice ? availableFormats(lensDevice) : []), [lensDevice]);
  const stabilizationSupported = lensDevice ? supportsStabilization(lensDevice) : false;
  const stabilizationOn = stabilizationSupported && settings.stabilizationEnabled;

  // AC-22 / BUG-47: ask the camera which candidates it really records at
  // their frame rate — with the same outputs and stabilization the real
  // session uses. Until it has answered, the candidates stand in.
  const probeKey = lensDevice ? `${lensDevice.id}|${stabilizationSupported ? stabilizationOn : '-'}` : '';
  const [probed, setProbed] = useState<{ key: string; formats: VideoFormat[] } | null>(null);
  useEffect(() => {
    if (!lensDevice) {
      return;
    }
    let current = true;
    const preview = VisionCamera.createPreviewOutput();
    const sessionConstraints: Constraint[] = stabilizationSupported ? [stabilizationConstraint(stabilizationOn)] : [];
    probeFormats(candidates, async probe => {
      const output = VisionCamera.createVideoOutput({
        targetResolution: RESOLUTION_SIZES[probe.resolution],
        enableAudio: false,
      });
      const config = await VisionCamera.resolveConstraints(
        lensDevice,
        [
          { output: preview, mirrorMode: 'auto' },
          { output, mirrorMode: 'auto' },
        ],
        [{ fps: probe.fps }, ...sessionConstraints],
      );
      return config.selectedFPS;
    }).then(result => {
      if (current) {
        setProbed({ key: probeKey, formats: result });
      }
    });
    return () => {
      current = false;
    };
  }, [lensDevice, candidates, stabilizationSupported, stabilizationOn, probeKey]);
  const probedFormats = probed?.key === probeKey ? probed.formats : null;
  const formats = probedFormats ?? [];

  const remembered: VideoFormat = { resolution: settings.resolution, fps: settings.fps };
  const format = effectiveFormat(probedFormats ?? candidates, formatRejected ? DEFAULT_FORMAT : remembered);

  useEffect(() => {
    setFormatRejected(false);
  }, [settings.lens, settings.resolution, settings.fps]);

  const videoOutput = useVideoOutput({
    targetResolution: RESOLUTION_SIZES[format?.resolution ?? DEFAULT_RESOLUTION],
    enableAudio: settings.soundEnabled && microphonePermission.hasPermission,
  });

  const constraints = useMemo((): Constraint[] => {
    const result: Constraint[] = [];
    if (format) {
      result.push({ fps: format.fps });
    }
    if (stabilizationSupported) {
      result.push(stabilizationConstraint(stabilizationOn));
    }
    return result;
  }, [format, stabilizationSupported, stabilizationOn]);

  // Any reconfiguration of the session drops an existing lock (design.md).
  const lensType = lens?.type;
  const formatKey = format ? formatLabel(format) : '';
  useEffect(() => {
    setFocusLock(null);
  }, [lensType, formatKey, settings.stabilizationEnabled, settings.soundEnabled]);

  const cameraRef = useRef<CameraRef | null>(null);

  const onCameraError = useCallback(
    (error: Error): void => {
      if (!formatRejected) {
        setFormatRejected(true);
        setNotice(`Format nicht verfügbar — auf ${formatLabel(DEFAULT_FORMAT)} zurückgesetzt`);
      } else {
        setNotice(`Kamera-Fehler: ${describeError(error)}`);
      }
    },
    [formatRejected],
  );

  // Safety net for AC-22: the probe and the session should agree — if the
  // session still lands on another frame rate, say so instead of recording
  // silently at it.
  const chosenFps = format?.fps;
  const onSessionConfigSelected = useCallback(
    (config: CameraSessionConfig): void => {
      const selected = config.selectedFPS;
      if (chosenFps !== undefined && selected !== undefined && selected !== chosenFps) {
        setNotice(`${chosenFps} fps nicht verfügbar — es wird mit ${selected} fps aufgenommen`);
      }
    },
    [chosenFps],
  );

  const lockAt = useCallback(
    (point: FocusLock): void => {
      const camera = cameraRef.current;
      if (!lensDevice || !camera) {
        return;
      }
      if (!lensDevice.supportsFocusMetering) {
        setNotice(FOCUS_UNSUPPORTED_NOTICE);
        return;
      }
      // Locked AF/AE/AWB metering at the tapped point, never auto-reset —
      // on Android the only lock VisionCamera offers (design.md); all
      // metering modes the lens supports, white balance included.
      camera
        .focusTo(point, { responsiveness: 'snappy', adaptiveness: 'locked', autoResetAfter: null })
        .then(() => setFocusLock(point))
        .catch(err => setNotice(`Fokus konnte nicht gesperrt werden: ${describeError(err)}`));
    },
    [lensDevice],
  );

  const unlock = useCallback((): void => {
    setFocusLock(null);
    cameraRef.current?.resetFocus().catch(() => {});
  }, []);

  const {
    hasPermission: cameraGranted,
    canRequestPermission: cameraCanRequest,
    requestPermission: requestCamera,
  } = cameraPermission;
  const {
    hasPermission: microphoneGranted,
    canRequestPermission: microphoneCanRequest,
    requestPermission: requestMicrophone,
  } = microphonePermission;
  const soundEnabled = settings.soundEnabled;

  const recorder = useMemo(
    (): VideoRecorderPort => ({
      // AC-20 / BUG-42: checked on every trigger; asks Android where it still may.
      prepare() {
        if (!cameraGranted) {
          if (cameraCanRequest) {
            requestCamera().catch(() => {});
            return 'Für die Videoaufnahme wird Kamera-Zugriff benötigt — bitte erlauben und erneut starten.';
          }
          return 'Kamera-Zugriff wurde abgelehnt — in den Einstellungen erlauben, dann erneut starten.';
        }
        if (soundEnabled && !microphoneGranted) {
          if (microphoneCanRequest) {
            requestMicrophone().catch(() => {});
            return 'Für Ton wird Mikrofon-Zugriff benötigt — bitte erlauben oder Ton ausschalten, dann erneut starten.';
          }
          return 'Mikrofon-Zugriff wurde abgelehnt — in den Einstellungen erlauben oder Ton ausschalten.';
        }
        if (!lensDevice) {
          return 'Keine Rückkamera verfügbar';
        }
        return null;
      },
      async startRecording({ onFinished, onError }) {
        const nativeRecorder = await videoOutput.createRecorder({});
        // BUG-44: after an error the recorder never calls onFinished — hand
        // over the file it has written so far.
        await nativeRecorder.startRecording(
          filePath => onFinished(filePath),
          error => onError(error, nativeRecorder.filePath ?? null),
        );
        return { stop: () => nativeRecorder.stopRecording() };
      },
    }),
    [
      videoOutput,
      cameraGranted,
      cameraCanRequest,
      requestCamera,
      soundEnabled,
      microphoneGranted,
      microphoneCanRequest,
      requestMicrophone,
      lensDevice,
    ],
  );

  const openSettings = useCallback((): void => {
    Linking.openSettings().catch(() => {});
  }, []);

  return {
    camera: {
      granted: cameraPermission.hasPermission,
      canRequest: cameraPermission.canRequestPermission,
      request: cameraPermission.requestPermission,
    },
    microphone: {
      granted: microphonePermission.hasPermission,
      canRequest: microphonePermission.canRequestPermission,
      request: microphonePermission.requestPermission,
    },
    openSettings,
    lenses,
    lens,
    formats,
    format,
    stabilizationSupported,
    cameraDevice: lensDevice,
    videoOutput,
    constraints,
    cameraRef,
    onCameraError,
    onSessionConfigSelected,
    notice,
    focusLock,
    lockAt,
    unlock,
    recorder,
  };
}
