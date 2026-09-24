import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  sendAutoDriveCommand,
  sendSetEndCommand,
  sendSetStartCommand,
  sendStopCommand,
  type AutoDriveDirection,
  type SliderStatus,
} from '../ble/client';
import { useConnection } from '../connection/ConnectionProvider';
import { colors, minTouchTarget, radius, spacing, typography } from '../theme/colors';
import { useSliderStatus } from './useSliderStatus';

/**
 * Same 200-4000 steps/s range as PROJ-2's jog — verified against
 * firmware/src/motor.cpp's kJogSpeedMinHz (200.0f) / kJogSpeedMaxHz (4000.0f),
 * which spec.md's Technical Requirements explicitly call out as shared.
 */
const MIN_SPEED_STEPS_PER_SEC = 200;
const MAX_SPEED_STEPS_PER_SEC = 4000;

const DEFAULT_DURATION_TEXT = '10';

/**
 * Parses the duration text field into seconds. Accepts both '.' and ',' as
 * the decimal separator (German keyboards default to ',') and returns null
 * for an empty, non-numeric, or non-positive value — so callers can tell
 * "nothing usable entered yet" apart from "a specific out-of-range number".
 */
export function parseDurationSeconds(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatSeconds(value: number): string {
  return value.toFixed(1);
}

export function statusLabelFor(status: SliderStatus): string {
  if (status.driving) {
    // SliderStatus only exposes a `driving` boolean, not which direction is
    // currently active, so a generic label is used here rather than
    // inventing a new firmware/status field to disambiguate (out of scope
    // for this task).
    return 'Fährt…';
  }
  if (!status.hasStart || !status.hasEnd) {
    return 'Kein Start-/Endpunkt gesetzt';
  }
  return 'Bereit';
}

/**
 * Auto-drive controls (AC-1..AC-9, EC-1) — set start/end points from the
 * current jogged-to position, enter a target duration, trigger a drive in
 * either direction, and stop it early. Rendered only while connected: this
 * component itself also renders null without a `device` as a defensive
 * belt-and-suspenders (the actual mount/unmount decision is RootScreen's,
 * a later task — T7), matching JogControls' own pattern.
 *
 * No local optimistic state for hasStart/hasEnd/atStart/atEnd/distanceSteps:
 * all of it comes straight from useSliderStatus(device), which the firmware
 * updates via Notify after every SET_START/SET_END/stop/arrival (design.md).
 */
export function AutoDriveControls() {
  const { device } = useConnection();
  const status = useSliderStatus(device);

  const [durationText, setDurationText] = useState(DEFAULT_DURATION_TEXT);
  const durationSeconds = parseDurationSeconds(durationText);

  const rangeAvailable =
    status.hasStart &&
    status.hasEnd &&
    status.distanceSteps !== null &&
    status.distanceSteps > 0;

  const minDurationSeconds = rangeAvailable
    ? (status.distanceSteps as number) / MAX_SPEED_STEPS_PER_SEC
    : null;
  const maxDurationSeconds = rangeAvailable
    ? (status.distanceSteps as number) / MIN_SPEED_STEPS_PER_SEC
    : null;

  const durationValid =
    rangeAvailable &&
    durationSeconds !== null &&
    minDurationSeconds !== null &&
    maxDurationSeconds !== null &&
    durationSeconds >= minDurationSeconds &&
    durationSeconds <= maxDurationSeconds;

  // AC-6: only complain once the range is actually known and the user has
  // typed something — an empty field or missing points aren't "an invalid
  // duration", they're "nothing to validate yet".
  const showDurationError = rangeAvailable && durationText.trim() !== '' && !durationValid;

  // EC-1: start and end must differ. Shown separately from the duration
  // range error since a 0-step distance has no meaningful min/max to report.
  const pointsIdentical = status.hasStart && status.hasEnd && status.distanceSteps === 0;

  const autoDriveBaseEnabled =
    !status.driving &&
    status.hasStart &&
    status.hasEnd &&
    status.distanceSteps !== null &&
    status.distanceSteps > 0 &&
    durationValid;

  const startToEndEnabled = autoDriveBaseEnabled && status.atStart;
  const endToStartEnabled = autoDriveBaseEnabled && status.atEnd;

  if (!device) {
    return null;
  }

  const handleSetStart = () => {
    sendSetStartCommand(device).catch(() => {});
  };

  const handleSetEnd = () => {
    sendSetEndCommand(device).catch(() => {});
  };

  const handleDrive = (direction: AutoDriveDirection) => {
    if (durationSeconds === null) {
      return;
    }
    sendAutoDriveCommand(device, direction, durationSeconds).catch(() => {});
  };

  const handleStop = () => {
    sendStopCommand(device).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <View style={styles.buttonRow}>
        <Pressable
          onPress={handleSetStart}
          disabled={status.driving}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            status.driving && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonLabel}>Als Start setzen</Text>
        </Pressable>
        <Pressable
          onPress={handleSetEnd}
          disabled={status.driving}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            status.driving && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonLabel}>Als Ende setzen</Text>
        </Pressable>
      </View>

      <View style={styles.durationRow}>
        <Text style={styles.durationLabel}>Dauer (s)</Text>
        <TextInput
          style={[styles.durationInput, showDurationError && styles.durationInputError]}
          keyboardType="decimal-pad"
          value={durationText}
          onChangeText={setDurationText}
          editable={!status.driving}
          placeholder={DEFAULT_DURATION_TEXT}
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      {showDurationError && minDurationSeconds !== null && maxDurationSeconds !== null && (
        <Text style={styles.errorText}>
          Ungültige Dauer — erlaubt: {formatSeconds(minDurationSeconds)}–
          {formatSeconds(maxDurationSeconds)} s
        </Text>
      )}
      {pointsIdentical && (
        <Text style={styles.errorText}>Start und Ende müssen sich unterscheiden</Text>
      )}

      <View style={styles.buttonRow}>
        <Pressable
          onPress={() => handleDrive('startToEnd')}
          disabled={!startToEndEnabled}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            !startToEndEnabled && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonLabel}>Start → Ende</Text>
        </Pressable>
        <Pressable
          onPress={() => handleDrive('endToStart')}
          disabled={!endToStartEnabled}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            !endToStartEnabled && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonLabel}>Ende → Start</Text>
        </Pressable>
      </View>

      {status.driving && (
        <Pressable
          onPress={handleStop}
          style={({ pressed }) => [styles.stopButton, pressed && styles.stopButtonPressed]}
        >
          <Text style={styles.stopButtonLabel}>Stopp</Text>
        </Pressable>
      )}

      <Text style={styles.statusLine}>{statusLabelFor(status)}</Text>
    </View>
  );
}

export default AutoDriveControls;

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  button: {
    flex: 1,
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    marginHorizontal: spacing.sm,
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
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  durationLabel: {
    width: 72,
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  durationInput: {
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
  durationInputError: {
    borderColor: colors.destructive,
  },
  errorText: {
    marginBottom: spacing.lg,
    fontSize: typography.size.sm,
    color: colors.destructive,
  },
  stopButton: {
    minHeight: minTouchTarget,
    marginBottom: spacing.lg,
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
  statusLine: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: typography.size.sm,
    color: colors.mutedForeground,
  },
});
