import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Device } from 'react-native-ble-plx';
import { Camera, type CameraDevice, type usePhotoOutput } from 'react-native-vision-camera';

import { colors, minTouchTarget, radius, spacing, typography } from '../theme/colors';
import { confirmIfBatteryCritical } from './battery';
import { useSliderStatus } from './useSliderStatus';
import type { TimelapseSequenceApi } from './useTimelapseSequence';

const DEFAULT_SHOT_COUNT_TEXT = '10';
const DEFAULT_INTERVAL_TEXT = '5';

const MIN_SHOT_COUNT = 2;
const MAX_SHOT_COUNT = 999;
const MIN_INTERVAL_SECONDS = 1;
const MAX_INTERVAL_SECONDS = 3600;

const CAMERA_PREVIEW_HEIGHT = 200;

/**
 * Parses the shot-count text field (spec.md AC-1/EC-2: 2-999 shots). Only
 * whole numbers are accepted — a shot count is a count, not a measurement,
 * so unlike AutoDriveControls' duration field there is no decimal-separator
 * handling here. Returns null for empty, non-integer, or out-of-range text
 * so callers can tell "nothing usable entered yet" apart from "a specific
 * out-of-range number" (same distinction AutoDriveControls' parseDurationSeconds
 * makes for its own field).
 */
export function parseShotCountText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= MIN_SHOT_COUNT && value <= MAX_SHOT_COUNT ? value : null;
}

/**
 * Parses the interval text field (spec.md AC-1/EC-2: 1-3600 seconds). Whole
 * seconds only, same rationale as parseShotCountText above.
 */
export function parseIntervalSecondsText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= MIN_INTERVAL_SECONDS && value <= MAX_INTERVAL_SECONDS ? value : null;
}

/**
 * The resulting sequence duration for a given shot count + interval: the
 * first shot fires immediately, so only (shotCount - 1) intervals actually
 * elapse (matches useTimelapseSequence's own remainingSeconds computation
 * and spec.md's Decision Log — duration is derived/displayed, never
 * entered directly).
 */
export function computeTotalDurationSeconds(shotCount: number, intervalSeconds: number): number {
  return (shotCount - 1) * intervalSeconds;
}

/**
 * Formats a duration in seconds for display (both the computed total
 * duration line and the running sequence's remaining-time line reuse this).
 * Whole minutes-and-seconds for anything a minute or longer ("4 Min 10 s"),
 * plain seconds otherwise ("45 s") — chosen for readability over a fixed
 * "N s" for every value, since sequences can run for hours (spec.md allows
 * up to 999 shots * 3600 s).
 */
export function formatDurationSeconds(totalSeconds: number): string {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  if (minutes === 0) {
    return `${seconds} s`;
  }
  return `${minutes} Min ${seconds} s`;
}

/**
 * PROJ-3 EC-10: only one camera session can be active. While "Video
 * aufnehmen" is on, the camera belongs to the auto-drive section — this
 * section then shows a hint instead of its preview and cannot start.
 */
export function timelapseCameraState(
  hasPermission: boolean,
  cameraInUseByVideo: boolean,
): { view: 'videoHint' | 'preview' | 'permissionHint'; cameraUsable: boolean } {
  if (cameraInUseByVideo) {
    return { view: 'videoHint', cameraUsable: false };
  }
  return hasPermission
    ? { view: 'preview', cameraUsable: true }
    : { view: 'permissionHint', cameraUsable: false };
}

export const CAMERA_IN_USE_BY_VIDEO_TEXT =
  'Kamera wird für Video genutzt — „Video aufnehmen" ausschalten, um den Zeitraffer zu nutzen.';

export type TimelapseControlsProps = TimelapseSequenceApi & {
  device: Device | null;
  // qa-report.md BUG-2: these come from RootScreen's single useCameraCapture()
  // call now, not from a second, separate call inside this component — see
  // useTimelapseSequence.ts's `capturePhoto` param doc comment for why a
  // second call breaks photo capture entirely.
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
  cameraDevice: CameraDevice | undefined;
  photoOutput: ReturnType<typeof usePhotoOutput>;
  /** PROJ-3 EC-10: "Video aufnehmen" is on — the auto-drive section owns the camera. */
  cameraInUseByVideo?: boolean;
};

/**
 * Timelapse controls (AC-1..AC-10, EC-1..EC-4) — camera preview/permission
 * hint, shot-count/interval inputs with validation, the computed total
 * duration, the start/stop buttons, and the running sequence's progress
 * display. All sequence orchestration lives in useTimelapseSequence (T5,
 * already built) — this component only renders its state and calls
 * start()/stop() from the props it receives (from RootScreen via T6).
 *
 * Own useSliderStatus(device) subscription, same pattern as AutoDriveControls:
 * no local optimistic state for hasStart/hasEnd/atStart/distanceSteps, all of
 * it comes straight from that hook. The camera permission/device/output come
 * as props instead (qa-report.md BUG-2) — RootScreen owns the single
 * useCameraCapture() call and passes its result down here and into
 * useTimelapseSequence.
 */
export function TimelapseControls(props: TimelapseControlsProps): React.JSX.Element | null {
  const {
    device,
    isRunning,
    currentShot,
    totalShots,
    remainingSeconds,
    error,
    start,
    stop,
    hasPermission,
    requestPermission,
    cameraDevice,
    photoOutput,
    cameraInUseByVideo = false,
  } = props;
  const cameraState = timelapseCameraState(hasPermission, cameraInUseByVideo);

  const status = useSliderStatus(device);

  const [shotCountText, setShotCountText] = useState(DEFAULT_SHOT_COUNT_TEXT);
  const [intervalText, setIntervalText] = useState(DEFAULT_INTERVAL_TEXT);

  const shotCount = parseShotCountText(shotCountText);
  const intervalSeconds = parseIntervalSecondsText(intervalText);

  // EC-2: only complain once the user has actually typed something — an
  // empty field isn't "an invalid value", it's "nothing to validate yet"
  // (same distinction AutoDriveControls' showDurationError makes).
  const showShotCountError = shotCountText.trim() !== '' && shotCount === null;
  const showIntervalError = intervalText.trim() !== '' && intervalSeconds === null;

  const totalDurationSeconds =
    shotCount !== null && intervalSeconds !== null
      ? computeTotalDurationSeconds(shotCount, intervalSeconds)
      : null;

  // AC-1/EC-1: a full, non-degenerate start/end range must be registered.
  const rangeReady =
    status.hasStart && status.hasEnd && status.distanceSteps !== null && status.distanceSteps > 0;

  // AC-1/AC-9/EC-1/EC-2: every precondition for starting a sequence.
  const startEnabled =
    rangeReady &&
    status.atStart &&
    !status.driving &&
    // PROJ-6 AC-9: no new sequence after a low-battery protective stop.
    !status.batteryLocked &&
    cameraState.cameraUsable &&
    shotCount !== null &&
    intervalSeconds !== null &&
    !isRunning;

  if (!device) {
    return null;
  }

  const handleRequestPermission = (): void => {
    void requestPermission();
  };

  const handleStart = (): void => {
    if (shotCount === null || intervalSeconds === null) {
      return;
    }
    // PROJ-6 AC-6: ask first when the battery is below 10 %.
    confirmIfBatteryCritical(status.batteryMillivolts, () => start(shotCount, intervalSeconds));
  };

  const handleStop = (): void => {
    stop();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Zeitraffer</Text>

      {cameraState.view === 'videoHint' ? (
        <View style={styles.permissionHint}>
          <Text style={styles.permissionText}>{CAMERA_IN_USE_BY_VIDEO_TEXT}</Text>
        </View>
      ) : cameraState.view === 'preview' && cameraDevice ? (
        // The preview is scaled to fill (cover) and, on Android, its content
        // draws past the native view's bounds — the `overflow: 'hidden'` on
        // the Camera's own style does not clip it (measured on device: view
        // bounds 600px tall, drawn 1178px). Clipping has to happen on a plain
        // parent View, which is a real ViewGroup with clipChildren.
        <View style={styles.cameraPreview}>
          <Camera
            device={cameraDevice}
            style={StyleSheet.absoluteFill}
            isActive={hasPermission}
            outputs={[photoOutput]}
          />
        </View>
      ) : (
        cameraState.view === 'permissionHint' && (
          <View style={styles.permissionHint}>
            <Text style={styles.permissionText}>
              Für den Zeitraffer-Modus wird Kamera-Zugriff benötigt.
            </Text>
            <Pressable
              onPress={handleRequestPermission}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonLabel}>Kamera-Zugriff erlauben</Text>
            </Pressable>
          </View>
        )
      )}

      <View style={styles.inputRow}>
        <Text style={styles.inputLabel}>Aufnahmen</Text>
        <TextInput
          style={[styles.input, showShotCountError && styles.inputError]}
          keyboardType="number-pad"
          value={shotCountText}
          onChangeText={setShotCountText}
          editable={!isRunning}
          placeholder={DEFAULT_SHOT_COUNT_TEXT}
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      {showShotCountError && (
        <Text style={styles.errorText}>
          Ungültige Anzahl — erlaubt: {MIN_SHOT_COUNT}–{MAX_SHOT_COUNT}
        </Text>
      )}

      <View style={styles.inputRow}>
        <Text style={styles.inputLabel}>Intervall (s)</Text>
        <TextInput
          style={[styles.input, showIntervalError && styles.inputError]}
          keyboardType="number-pad"
          value={intervalText}
          onChangeText={setIntervalText}
          editable={!isRunning}
          placeholder={DEFAULT_INTERVAL_TEXT}
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      {showIntervalError && (
        <Text style={styles.errorText}>
          Ungültiges Intervall — erlaubt: {MIN_INTERVAL_SECONDS}–{MAX_INTERVAL_SECONDS} s
        </Text>
      )}

      {totalDurationSeconds !== null && (
        <Text style={styles.durationLine}>
          Gesamtdauer: {formatDurationSeconds(totalDurationSeconds)}
        </Text>
      )}

      {!isRunning && (
        <Pressable
          onPress={handleStart}
          disabled={!startEnabled}
          style={({ pressed }) => [
            styles.button,
            styles.startButton,
            pressed && startEnabled && styles.buttonPressed,
            !startEnabled && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonLabel}>Zeitraffer starten</Text>
        </Pressable>
      )}

      {isRunning && (
        <View style={styles.progressBlock}>
          <Text style={styles.progressText}>
            Aufnahme {currentShot} von {totalShots}
          </Text>
          <Text style={styles.progressText}>
            Verbleibend: {formatDurationSeconds(remainingSeconds)}
          </Text>
          <Pressable
            onPress={handleStop}
            style={({ pressed }) => [styles.stopButton, pressed && styles.stopButtonPressed]}
          >
            <Text style={styles.stopButtonLabel}>Stopp</Text>
          </Pressable>
        </View>
      )}

      {!isRunning && error !== null && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

export default TimelapseControls;

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  cameraPreview: {
    height: CAMERA_PREVIEW_HEIGHT,
    marginBottom: spacing.lg,
    borderRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  permissionHint: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  permissionText: {
    marginBottom: spacing.md,
    fontSize: typography.size.base,
    color: colors.foreground,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  inputLabel: {
    width: 96,
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  input: {
    flex: 1,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.foreground,
    fontSize: typography.size.base,
  },
  inputError: {
    borderColor: colors.destructive,
  },
  errorText: {
    marginBottom: spacing.lg,
    fontSize: typography.size.sm,
    color: colors.destructive,
  },
  durationLine: {
    marginBottom: spacing.lg,
    fontSize: typography.size.sm,
    color: colors.mutedForeground,
  },
  button: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.primarySubtleBg,
    borderColor: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
    textAlign: 'center',
  },
  startButton: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  progressBlock: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  progressText: {
    marginBottom: spacing.sm,
    fontSize: typography.size.base,
    color: colors.foreground,
  },
  stopButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.base,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonPressed: {
    opacity: 0.8,
  },
  stopButtonLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
});
