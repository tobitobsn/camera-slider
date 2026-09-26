import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';

import {
  sendAutoDriveCommand,
  sendSetEndCommand,
  sendSetEndFromDistanceCommand,
  sendSetStartCommand,
  sendStopCommand,
  type AutoDriveDirection,
  type SliderStatus,
} from '../ble/client';
import { useConnection } from '../connection/ConnectionProvider';
import { colors, minTouchTarget, radius, spacing, typography } from '../theme/colors';
import { useSliderStatus } from './useSliderStatus';
import { usePresets, type Preset } from './usePresets';

/**
 * Same 200-4000 steps/s range as PROJ-2's jog — verified against
 * firmware/src/motor.cpp's kJogSpeedMinHz (200.0f) / kJogSpeedMaxHz (4000.0f),
 * which spec.md's Technical Requirements explicitly call out as shared.
 */
const MIN_SPEED_STEPS_PER_SEC = 200;
const MAX_SPEED_STEPS_PER_SEC = 4000;

/**
 * Mirrors firmware/src/motor.cpp's kAcceleration (steps/s^2) — needed here
 * (qa-report.md BUG-2) so the app's notion of "what duration is achievable"
 * matches what the firmware will actually do, not just distance/speed.
 */
const ACCELERATION_STEPS_PER_SEC2 = 8000;

/**
 * Mirrors firmware/src/motor.cpp's kAutoDriveSpeedToleranceHz — qa-report.md
 * BUG-3 residual: this function's double and the firmware's float32 can
 * land on opposite sides of the 200/4000 boundary for a duration whose
 * exact value sits right on it, independent of the numerically-stable form
 * below. Keeping both sides' tolerance identical is what makes them agree.
 */
const AUTO_DRIVE_SPEED_TOLERANCE_STEPS_PER_SEC = 0.01;

const DEFAULT_DURATION_TEXT = '10';

/**
 * Mirrors firmware/src/motor.cpp's motorAutoDrive() speed-solving exactly
 * (qa-report.md BUG-2): distance/duration ignores that the real move
 * accelerates and decelerates, so it silently arrives later than the
 * entered duration (spec.md's Decision Log rules that out). Solving
 * `duration = distance/speed + speed/acceleration` for speed instead makes
 * the actual trapezoidal move land on the entered duration exactly. Returns
 * null when durationSeconds is below the physical minimum for this distance
 * at this acceleration (2*sqrt(distance/acceleration), the pure-triangular
 * case) — impossible at any speed, not just out of the 200-4000 range.
 */
export function solveAutoDriveSpeedStepsPerSec(
  distanceSteps: number,
  durationSeconds: number,
): number | null {
  const accelTimesDuration = ACCELERATION_STEPS_PER_SEC2 * durationSeconds;
  const discriminant =
    accelTimesDuration * accelTimesDuration - 4 * ACCELERATION_STEPS_PER_SEC2 * distanceSteps;
  if (discriminant < 0) {
    return null;
  }
  // qa-report.md BUG-3 (residual after the first fix): (aT - sqrt(disc))/2
  // subtracts two nearly-equal large values whenever the ramp time is small
  // relative to durationSeconds (long, slow drives near the 200 steps/s
  // floor) — the exact regime the boundary-mismatch repros landed in,
  // since the firmware's float32 and this function's double lose precision
  // differently on that subtraction. Mirrors motor.cpp's fix: the
  // product-of-roots identity (v_small * v_large = acceleration*distance,
  // Vieta's formulas) avoids the subtraction — the sum
  // accelTimesDuration + sqrt(discriminant) never cancels.
  return (
    (2 * ACCELERATION_STEPS_PER_SEC2 * distanceSteps) / (accelTimesDuration + Math.sqrt(discriminant))
  );
}

/**
 * The fastest a move of this distance can ever complete, given the 4000
 * steps/s cap and the shared acceleration — used as the lower bound of the
 * displayed valid-duration range. Below the cap-relevant distance
 * (MAX_SPEED_STEPS_PER_SEC^2 / ACCELERATION_STEPS_PER_SEC2 = 2000 steps),
 * the move never reaches the speed cap at all (a pure triangular profile),
 * so the achievable minimum is the physical floor
 * `2*sqrt(distance/acceleration)`, not distance/maxSpeed + maxSpeed/accel.
 */
export function minAutoDriveDurationSeconds(distanceSteps: number): number {
  const peakSpeedIfUncapped = Math.sqrt(ACCELERATION_STEPS_PER_SEC2 * distanceSteps);
  if (peakSpeedIfUncapped <= MAX_SPEED_STEPS_PER_SEC) {
    return 2 * Math.sqrt(distanceSteps / ACCELERATION_STEPS_PER_SEC2);
  }
  return (
    distanceSteps / MAX_SPEED_STEPS_PER_SEC + MAX_SPEED_STEPS_PER_SEC / ACCELERATION_STEPS_PER_SEC2
  );
}

/**
 * The slowest a move of this distance can go at the 200 steps/s floor —
 * used as the upper bound of the displayed valid-duration range. Always the
 * plain trapezoidal formula: for any real slider distance, 200 steps/s is
 * far below the unconstrained-optimum speed, so the move always actually
 * cruises at 200 steps/s rather than falling short of it (the triangular
 * case from the minimum side doesn't have an analogous case up here).
 */
export function maxAutoDriveDurationSeconds(distanceSteps: number): number {
  return (
    distanceSteps / MIN_SPEED_STEPS_PER_SEC + MIN_SPEED_STEPS_PER_SEC / ACCELERATION_STEPS_PER_SEC2
  );
}

/**
 * Rounds to the same precision sendAutoDriveCommand() (src/ble/client.ts)
 * actually transmits (tenths of a second) — qa-report.md BUG-3: validating
 * the raw, unrounded input let values right at the boundary look valid in
 * the UI while the firmware, which only ever sees the rounded value,
 * silently rejected them with no feedback. Validating this rounded value
 * instead keeps the UI's verdict and the firmware's verdict in sync.
 */
function roundToDeciseconds(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

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

type AutoDriveControlsProps = {
  /**
   * PROJ-5 T6: true while a timelapse sequence is running (RootScreen's
   * useTimelapseSequence(device).isRunning) — a sequence drives the
   * carriage itself via TIMELAPSE_MOVE, so every interactive element here
   * must stay locked for the same reason `status.driving` already locks
   * them for a manual auto-drive. Combined with the existing
   * `status.driving` checks everywhere, not a replacement for them.
   */
  disabled?: boolean;
};

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
export function AutoDriveControls({ disabled = false }: AutoDriveControlsProps = {}) {
  const { device } = useConnection();
  const status = useSliderStatus(device);
  const { presets, save: savePresetToStorage, remove: removePresetFromStorage } = usePresets();

  const [durationText, setDurationText] = useState(DEFAULT_DURATION_TEXT);
  const durationSeconds = parseDurationSeconds(durationText);

  // AC-4/AC-5: the distance + direction of a tapped preset row, remembered
  // so "Als Start setzen" can derive the end point from it. Discarded again
  // per design.md's Technische Entscheidungen: a manual "Als Ende setzen"
  // (EC-3), loading a different preset (just overwritten below, no special
  // code needed), or a disconnect (EC-5). Unlike useSliderStatus's own
  // reset-on-null-device effect, no explicit disconnect-reset is needed
  // here: RootScreen.tsx's switch only renders AutoDriveControls for the
  // `connected` case, so leaving it unmounts this component entirely — a
  // fresh mount already starts with loadedPreset === null.
  const [loadedPreset, setLoadedPreset] = useState<{
    distanceSteps: number;
    endIsAfterStart: boolean;
  } | null>(null);

  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [presetNameText, setPresetNameText] = useState('');

  const rangeAvailable =
    status.hasStart &&
    status.hasEnd &&
    status.distanceSteps !== null &&
    status.distanceSteps > 0;

  const minDurationSeconds = rangeAvailable
    ? minAutoDriveDurationSeconds(status.distanceSteps as number)
    : null;
  const maxDurationSeconds = rangeAvailable
    ? maxAutoDriveDurationSeconds(status.distanceSteps as number)
    : null;

  // BUG-2/BUG-3 fix: validate the same rounded value the firmware will
  // actually see, via the same speed-solving formula the firmware uses —
  // not a naive min/max-range comparison against the unrounded input.
  const requestedSpeedStepsPerSec =
    rangeAvailable && durationSeconds !== null
      ? solveAutoDriveSpeedStepsPerSec(
          status.distanceSteps as number,
          roundToDeciseconds(durationSeconds),
        )
      : null;

  const durationValid =
    rangeAvailable &&
    requestedSpeedStepsPerSec !== null &&
    requestedSpeedStepsPerSec >= MIN_SPEED_STEPS_PER_SEC - AUTO_DRIVE_SPEED_TOLERANCE_STEPS_PER_SEC &&
    requestedSpeedStepsPerSec <= MAX_SPEED_STEPS_PER_SEC + AUTO_DRIVE_SPEED_TOLERANCE_STEPS_PER_SEC;

  // AC-6: only complain once the range is actually known and the user has
  // typed something — an empty field or missing points aren't "an invalid
  // duration", they're "nothing to validate yet".
  const showDurationError = rangeAvailable && durationText.trim() !== '' && !durationValid;

  // EC-1: start and end must differ. Shown separately from the duration
  // range error since a 0-step distance has no meaningful min/max to report.
  const pointsIdentical = status.hasStart && status.hasEnd && status.distanceSteps === 0;

  const autoDriveBaseEnabled =
    !status.driving &&
    !disabled &&
    status.hasStart &&
    status.hasEnd &&
    status.distanceSteps !== null &&
    status.distanceSteps > 0 &&
    durationValid;

  const startToEndEnabled = autoDriveBaseEnabled && status.atStart;
  const endToStartEnabled = autoDriveBaseEnabled && status.atEnd;

  // AC-1: unlike autoDriveBaseEnabled, saving a preset doesn't need the
  // carriage to currently be at either endpoint (atStart/atEnd) — only that
  // a complete, valid drive configuration exists to snapshot. Still locked
  // while driving (via status.driving below), consistent with every other
  // control in this component (AC-8's spirit).
  const presetPreconditionMet =
    status.hasStart &&
    status.hasEnd &&
    status.distanceSteps !== null &&
    status.distanceSteps > 0 &&
    durationValid;

  // PROJ-5 T6: single OR'd flag for every element that only ever checked
  // status.driving before — kept as one constant rather than repeating
  // `status.driving || disabled` at each call site.
  const lockedByOtherMode = status.driving || disabled;

  if (!device) {
    return null;
  }

  // AC-5: when a preset is loaded, deriving the end point from it must wait
  // for SET_START's own response before firing SET_END_FROM_DISTANCE — the
  // firmware only knows the new start position once it has applied and
  // acknowledged the first write (design.md's Technische Entscheidungen).
  // Both writes share a single fire-and-forget error boundary, same as
  // every other handler here: a failed SET_START must not also attempt to
  // derive an end point from a start position that was never actually set.
  //
  // qa-report.md BUG-5, still open: the SET_START write's own response only
  // confirms the BLE stack accepted it, not that motorSetStart() actually
  // applied it (a silent firmware-side guard rejection — e.g. the stepper
  // still finishing a jog — leaves the write "succeeding" from here with no
  // way to tell). A first attempt at a fix (waiting for the Status
  // characteristic to report hasStart) was reverted after re-verification:
  // the firmware only notifies on a *changed* payload
  // (bleNotifyStatusIfChanged(), firmware/src/ble.cpp), so re-setting a
  // start point the carriage was already standing at produces no
  // notification at all — that would time out and show a false error on a
  // command that actually succeeded. A correct fix needs a real per-command
  // acknowledgement from the firmware (a protocol change), not a
  // status-diff guess from here — left as a known residual risk pending
  // that decision rather than shipping something that fails more often
  // than the bug it was meant to close.
  const handleSetStart = async (): Promise<void> => {
    try {
      await sendSetStartCommand(device);
      if (loadedPreset !== null) {
        await sendSetEndFromDistanceCommand(
          device,
          loadedPreset.endIsAfterStart,
          loadedPreset.distanceSteps,
        );
      }
    } catch {
      // fire-and-forget, matching this file's existing .catch(() => {})
      // convention on every other handler
    }
  };

  const handleSetEnd = () => {
    // EC-3: a deliberate manual end-set always wins over a stale
    // preset-derived one, regardless of whether the write itself succeeds.
    setLoadedPreset(null);
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

  // AC-4: loading a preset always replaces whatever was loaded before —
  // just overwriting loadedPreset covers that, no special-case code needed.
  const handleLoadPreset = (preset: Preset) => {
    setLoadedPreset({
      distanceSteps: preset.distanceSteps,
      endIsAfterStart: preset.endIsAfterStart,
    });
    setDurationText(formatSeconds(preset.durationSeconds));
  };

  const handleDeletePreset = (preset: Preset) => {
    // AC-6: only confirming "Löschen" actually removes it.
    Alert.alert('Preset löschen', `„${preset.name}“ wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          removePresetFromStorage(preset.id).catch(() => {
            ToastAndroid.show('Preset konnte nicht gelöscht werden', ToastAndroid.SHORT);
          });
        },
      },
    ]);
  };

  const handleOpenSaveDialog = () => {
    setSaveDialogVisible(true);
  };

  const handleCancelSavePreset = () => {
    setSaveDialogVisible(false);
    setPresetNameText('');
  };

  // AC-1/AC-2: only reachable once presetPreconditionMet is true (the
  // button that calls this is only rendered then) and the trimmed name is
  // non-empty (the dialog's Save button is disabled otherwise) — still
  // guarded here defensively since status/durationSeconds are read fresh.
  const handleConfirmSavePreset = () => {
    const trimmedName = presetNameText.trim();
    if (
      trimmedName === '' ||
      status.distanceSteps === null ||
      status.endIsAfterStart === null ||
      durationSeconds === null
    ) {
      return;
    }

    // Same rounding sendAutoDriveCommand() actually transmits (tenths of a
    // second) — keeps a saved preset's duration consistent with what a
    // drive triggered right now would actually use.
    savePresetToStorage(
      trimmedName,
      status.distanceSteps,
      status.endIsAfterStart,
      roundToDeciseconds(durationSeconds),
    )
      .then(() => {
        setSaveDialogVisible(false);
        setPresetNameText('');
        ToastAndroid.show('Preset gespeichert', ToastAndroid.SHORT);
      })
      .catch(() => {
        // EC-4: keep the dialog open with the typed name still in it.
        ToastAndroid.show('Preset konnte nicht gespeichert werden', ToastAndroid.SHORT);
      });
  };

  return (
    <View style={styles.container}>
      <View style={styles.buttonRow}>
        <Pressable
          onPress={handleSetStart}
          disabled={lockedByOtherMode}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            lockedByOtherMode && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonLabel}>Als Start setzen</Text>
        </Pressable>
        <Pressable
          onPress={handleSetEnd}
          disabled={lockedByOtherMode}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            lockedByOtherMode && styles.buttonDisabled,
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
          editable={!lockedByOtherMode}
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
          disabled={disabled}
          style={({ pressed }) => [
            styles.stopButton,
            pressed && !disabled && styles.stopButtonPressed,
            disabled && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.stopButtonLabel}>Stopp</Text>
        </Pressable>
      )}

      <Text style={styles.statusLine}>{statusLabelFor(status)}</Text>

      {presetPreconditionMet && (
        <Pressable
          onPress={handleOpenSaveDialog}
          disabled={lockedByOtherMode}
          style={({ pressed }) => [
            styles.button,
            styles.savePresetButton,
            pressed && !lockedByOtherMode && styles.buttonPressed,
            lockedByOtherMode && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonLabel}>Als Preset speichern</Text>
        </Pressable>
      )}

      <View style={styles.presetSection}>
        <Text style={styles.sectionTitle}>Presets</Text>
        {presets.length === 0 ? (
          <Text style={styles.emptyText}>Noch keine Presets gespeichert</Text>
        ) : (
          presets.map(preset => (
            <View key={preset.id} style={styles.presetRow}>
              <Pressable
                onPress={() => handleLoadPreset(preset)}
                disabled={lockedByOtherMode}
                style={({ pressed }) => [
                  styles.presetInfo,
                  pressed && !lockedByOtherMode && styles.presetInfoPressed,
                  lockedByOtherMode && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.presetName}>{preset.name}</Text>
                <Text style={styles.presetDuration}>
                  {formatSeconds(preset.durationSeconds)} s
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleDeletePreset(preset)}
                disabled={lockedByOtherMode}
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && !lockedByOtherMode && styles.deleteButtonPressed,
                  lockedByOtherMode && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.deleteButtonLabel}>Löschen</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <Modal
        visible={saveDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelSavePreset}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Preset speichern</Text>
            <TextInput
              style={styles.modalInput}
              value={presetNameText}
              onChangeText={setPresetNameText}
              placeholder="Name"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
            <View style={styles.modalButtonRow}>
              <Pressable
                onPress={handleCancelSavePreset}
                style={({ pressed }) => [styles.modalButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonLabel}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmSavePreset}
                disabled={presetNameText.trim() === ''}
                style={({ pressed }) => [
                  styles.modalButton,
                  pressed && presetNameText.trim() !== '' && styles.buttonPressed,
                  presetNameText.trim() === '' && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.buttonLabel}>Speichern</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  savePresetButton: {
    marginTop: spacing.lg,
    marginHorizontal: 0,
  },
  presetSection: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  emptyText: {
    fontSize: typography.size.sm,
    color: colors.mutedForeground,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing.sm,
  },
  presetInfo: {
    flex: 1,
    minHeight: minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetInfoPressed: {
    backgroundColor: colors.primarySubtleBg,
    borderColor: colors.primary,
  },
  presetName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  presetDuration: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.mutedForeground,
  },
  deleteButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    marginLeft: spacing.sm,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonPressed: {
    backgroundColor: colors.destructive,
  },
  deleteButtonLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.heading,
    color: colors.destructive,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  modalTitle: {
    marginBottom: spacing.md,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  modalInput: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.base,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.foreground,
    fontSize: typography.size.base,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
  },
  modalButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
