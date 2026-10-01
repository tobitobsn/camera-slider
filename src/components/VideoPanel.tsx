/**
 * The video part of the auto-drive section (PROJ-3 AC-13, AC-16, AC-20 to
 * AC-25, AC-28): permission hints, the camera preview with tap-to-lock, the
 * recording indicator and the video settings. Rendered by AutoDriveControls
 * only while "Video aufnehmen" is on — then the auto-drive section owns the
 * camera (EC-10).
 *
 * Stateless apart from layout: settings live in useVideoSettings, the camera
 * in useVideoCamera, the take in useVideoDrive — all called once in
 * RootScreen and passed down.
 */
import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type GestureResponderEvent } from 'react-native';
import { Camera } from 'react-native-vision-camera';

import { colors, minTouchTarget, radius, spacing, typography } from '../theme/colors';
import type { VideoCameraApi } from './useVideoCamera';
import type { VideoDrivePhase } from './useVideoDrive';
import type { VideoSettings } from './useVideoSettings';
import { LENS_LABELS, formatLabel, type VideoFormat } from './videoFormats';

const CAMERA_PREVIEW_HEIGHT = 220;
const LOCK_MARKER_SIZE = 44;

const PHASE_LABELS: Record<VideoDrivePhase, string> = {
  ready: '',
  starting: 'Startet',
  preroll: 'Vorlauf',
  driving: 'Fahrt',
  postroll: 'Nachlauf',
  saving: 'Speichert',
};

/** "mm:ss" */
export function formatRecordingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

type Props = {
  camera: VideoCameraApi;
  settings: VideoSettings;
  onChange: (changes: Partial<VideoSettings>) => void;
  phase: VideoDrivePhase;
  elapsedSeconds: number;
  /** A take is running — everything here is locked (AC-28). */
  busy: boolean;
};

export function VideoPanel({ camera, settings, onChange, phase, elapsedSeconds, busy }: Props) {
  const needsMicrophone = settings.soundEnabled && !camera.microphone.granted;

  const handlePreviewPress = (event: GestureResponderEvent): void => {
    camera.lockAt({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY });
  };

  const handleFormat = (format: VideoFormat): void => {
    onChange({ resolution: format.resolution, fps: format.fps });
  };

  return (
    <View style={styles.container}>
      {!camera.camera.granted ? (
        <PermissionHint
          text="Für die Videoaufnahme wird Kamera-Zugriff benötigt."
          canRequest={camera.camera.canRequest}
          requestLabel="Kamera-Zugriff erlauben"
          onRequest={() => void camera.camera.request()}
          onOpenSettings={camera.openSettings}
        />
      ) : (
        camera.cameraDevice && (
          <Pressable
            testID="video-preview"
            style={styles.preview}
            onPress={handlePreviewPress}
            disabled={busy}
            accessibilityLabel="Kamera-Vorschau — tippen, um Fokus und Belichtung zu sperren"
          >
            {/* The native preview draws past its bounds on Android; the
                parent clips it (see TimelapseControls). */}
            <Camera
              ref={camera.cameraRef}
              device={camera.cameraDevice}
              outputs={[camera.videoOutput]}
              constraints={camera.constraints}
              isActive
              onError={camera.onCameraError}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {camera.focusLock && (
              <View
                testID="focus-lock-marker"
                pointerEvents="none"
                style={[
                  styles.lockMarker,
                  {
                    left: camera.focusLock.x - LOCK_MARKER_SIZE / 2,
                    top: camera.focusLock.y - LOCK_MARKER_SIZE / 2,
                  },
                ]}
              >
                <Text style={styles.lockMarkerText}>🔒</Text>
              </View>
            )}
            {phase !== 'ready' && (
              <View style={styles.recIndicator} accessibilityRole="text">
                <Text style={styles.recText}>
                  ● REC {formatRecordingTime(elapsedSeconds)} · {PHASE_LABELS[phase]}
                </Text>
              </View>
            )}
            {camera.focusLock && (
              <Pressable
                onPress={camera.unlock}
                disabled={busy}
                style={({ pressed }) => [styles.autoButton, pressed && styles.chipPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.autoButtonText}>Auto</Text>
              </Pressable>
            )}
          </Pressable>
        )
      )}

      {camera.camera.granted && !camera.focusLock && (
        <Text style={styles.hintText}>Tippe in die Vorschau, um Fokus und Belichtung zu sperren.</Text>
      )}

      {needsMicrophone && (
        <PermissionHint
          text="Für Ton wird Mikrofon-Zugriff benötigt — oder Ton ausschalten, dann wird ohne Mikrofon aufgenommen."
          canRequest={camera.microphone.canRequest}
          requestLabel="Mikrofon-Zugriff erlauben"
          onRequest={() => void camera.microphone.request()}
          onOpenSettings={camera.openSettings}
        />
      )}

      {camera.notice && <Text style={styles.noticeText}>{camera.notice}</Text>}

      <SwitchRow
        label="Ton"
        value={settings.soundEnabled}
        disabled={busy}
        onValueChange={value => onChange({ soundEnabled: value })}
      />

      {camera.formats.length > 0 && (
        <ChipRow label="Format">
          {camera.formats.map(format => {
            const label = formatLabel(format);
            const selected =
              camera.format?.resolution === format.resolution && camera.format?.fps === format.fps;
            return (
              <Chip key={label} label={label} selected={selected} disabled={busy} onPress={() => handleFormat(format)} />
            );
          })}
        </ChipRow>
      )}

      {camera.lenses.length > 1 && (
        <ChipRow label="Objektiv">
          {camera.lenses.map(lens => (
            <Chip
              key={lens.type}
              label={LENS_LABELS[lens.type]}
              selected={camera.lens?.type === lens.type}
              disabled={busy}
              onPress={() => onChange({ lens: lens.type })}
            />
          ))}
        </ChipRow>
      )}

      {camera.stabilizationSupported && (
        <SwitchRow
          label="Stabilisierung"
          value={settings.stabilizationEnabled}
          disabled={busy}
          onValueChange={value => onChange({ stabilizationEnabled: value })}
        />
      )}
    </View>
  );
}

function PermissionHint({
  text,
  canRequest,
  requestLabel,
  onRequest,
  onOpenSettings,
}: {
  text: string;
  canRequest: boolean;
  requestLabel: string;
  onRequest: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <View style={styles.permissionHint}>
      <Text style={styles.permissionText}>{text}</Text>
      <Pressable
        onPress={canRequest ? onRequest : onOpenSettings}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.buttonLabel}>{canRequest ? requestLabel : 'Einstellungen öffnen'}</Text>
      </Pressable>
    </View>
  );
}

function SwitchRow({
  label,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primaryActive }}
        thumbColor={value ? colors.primary : colors.mutedForeground}
      />
    </View>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.chipBlock}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

function Chip({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
        disabled && styles.chipDisabled,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  preview: {
    height: CAMERA_PREVIEW_HEIGHT,
    marginBottom: spacing.sm,
    borderRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  lockMarker: {
    position: 'absolute',
    width: LOCK_MARKER_SIZE,
    height: LOCK_MARKER_SIZE,
    borderRadius: LOCK_MARKER_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockMarkerText: {
    fontSize: typography.size.sm,
  },
  recIndicator: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.base,
    backgroundColor: colors.background,
  },
  recText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.heading,
    color: colors.destructive,
  },
  autoButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    minHeight: 40,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.base,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoButtonText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.heading,
    color: colors.primary,
  },
  hintText: {
    marginBottom: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.mutedForeground,
  },
  noticeText: {
    marginBottom: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  permissionHint: {
    marginBottom: spacing.md,
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
  button: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.base,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.primaryActive,
  },
  buttonLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.background,
  },
  row: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  chipBlock: {
    marginVertical: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  chip: {
    minHeight: 44,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtleBg,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: typography.size.sm,
    color: colors.foreground,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: typography.weight.heading,
  },
});
