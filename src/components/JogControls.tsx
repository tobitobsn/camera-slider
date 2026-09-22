import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';

import { sendJogCommand, sendStopCommand, type JogDirection } from '../ble/client';
import { useConnection } from '../connection/ConnectionProvider';
import { colors, minTouchTarget, radius, spacing, typography } from '../theme/colors';
import { useJogState, type JogStatus } from './useJogState';

const JOG_REPEAT_INTERVAL_MS = 300;
const MIN_SPEED_PERCENT = 1;
const MAX_SPEED_PERCENT = 100;
const DEFAULT_SPEED_PERCENT = 50;

function statusLabelFor(status: JogStatus): string {
  switch (status) {
    case 'jogging_forward':
      return 'Fährt vorwärts…';
    case 'jogging_backward':
      return 'Fährt rückwärts…';
    case 'idle':
    default:
      return 'Bereit';
  }
}

function directionFor(status: JogStatus): JogDirection | null {
  switch (status) {
    case 'jogging_forward':
      return 'forward';
    case 'jogging_backward':
      return 'backward';
    default:
      return null;
  }
}

/**
 * Manual jog controls (AC-1..AC-4, AC-7, EC-1) — speed slider + hold-to-jog
 * direction buttons + a plain-text status line. Rendered only while
 * connected: this component itself also renders null without a `device` as
 * a defensive belt-and-suspenders (the actual mount/unmount decision is
 * RootScreen's, a later task).
 *
 * The 300ms JOG-repeat interval is this component's side of the firmware's
 * watchdog dead-man's-switch (design.md → BLE-Kommandoprotokoll):
 * `sendJogCommand` fires immediately on entering a jogging status and then
 * every 300ms for as long as it lasts, always reading the current speed
 * value fresh (via a ref, so slider changes take effect on the very next
 * tick — AC-3 — without restarting the send cadence). Leaving a jogging
 * status (release, AC-4's stop-on-conflict, or unmount) clears the interval
 * and sends a single STOP, from the effect's cleanup — which runs exactly
 * once per "was jogging, now isn't" transition, and never on mount since the
 * initial status is always 'idle'.
 */
export function JogControls() {
  const { device } = useConnection();
  const { status, pressForward, releaseForward, pressBackward, releaseBackward } =
    useJogState();

  const [speedPercent, setSpeedPercent] = useState(DEFAULT_SPEED_PERCENT);
  const speedRef = useRef(speedPercent);
  useEffect(() => {
    speedRef.current = speedPercent;
  }, [speedPercent]);

  useEffect(() => {
    const direction = directionFor(status);
    if (!device || !direction) {
      return undefined;
    }

    const send = () => {
      sendJogCommand(device, direction, speedRef.current).catch(() => {});
    };

    send();
    const intervalId = setInterval(send, JOG_REPEAT_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      sendStopCommand(device).catch(() => {});
    };
  }, [status, device]);

  if (!device) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.sliderRow}>
        <Text style={styles.speedLabel}>{speedPercent}%</Text>
        <Slider
          style={styles.slider}
          minimumValue={MIN_SPEED_PERCENT}
          maximumValue={MAX_SPEED_PERCENT}
          step={1}
          value={speedPercent}
          onValueChange={setSpeedPercent}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
        />
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          onPressIn={pressBackward}
          onPressOut={releaseBackward}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>▼ Rückwärts</Text>
        </Pressable>
        <Pressable
          onPressIn={pressForward}
          onPressOut={releaseForward}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>▲ Vorwärts</Text>
        </Pressable>
      </View>

      <Text style={styles.statusLine}>{statusLabelFor(status)}</Text>
    </View>
  );
}

export default JogControls;

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  speedLabel: {
    width: 48,
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  slider: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  buttonLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  statusLine: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontSize: typography.size.sm,
    color: colors.mutedForeground,
  },
});
