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
  useCameraDevices,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
  type CameraDevice,
  type CameraRef,
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
  effectiveFormat,
  effectiveLens,
  formatLabel,
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
  formats: VideoFormat[];
  format: VideoFormat | undefined;
  stabilizationSupported: boolean;
  /** For `<Camera device outputs constraints ref onError>`. */
  cameraDevice: CameraDevice | undefined;
  videoOutput: CameraVideoOutput;
  constraints: Constraint[];
  cameraRef: React.RefObject<CameraRef | null>;
  onCameraError: (error: Error) => void;
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
  const formats = useMemo(() => (lens ? availableFormats(lens.device) : []), [lens]);
  const remembered: VideoFormat = { resolution: settings.resolution, fps: settings.fps };
  const format = effectiveFormat(formats, formatRejected ? DEFAULT_FORMAT : remembered);
  const stabilizationSupported = lens ? supportsStabilization(lens.device) : false;

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
      result.push({ videoStabilizationMode: settings.stabilizationEnabled ? 'auto' : 'off' });
    }
    return result;
  }, [format, stabilizationSupported, settings.stabilizationEnabled]);

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

  const lensDevice = lens?.device;
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

  const recorder = useMemo(
    (): VideoRecorderPort => ({
      async startRecording({ onFinished, onError }) {
        const nativeRecorder = await videoOutput.createRecorder({});
        await nativeRecorder.startRecording(filePath => onFinished(filePath), onError);
        return { stop: () => nativeRecorder.stopRecording() };
      },
    }),
    [videoOutput],
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
    notice,
    focusLock,
    lockAt,
    unlock,
    recorder,
  };
}
