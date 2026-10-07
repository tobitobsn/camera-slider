import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, minTouchTarget, spacing, typography } from '../theme/colors';

export const HOLD_SWITCH_LABEL = 'Motor hält im Stillstand';
export const HOLD_SEND_ERROR = 'Einstellung konnte nicht übertragen werden';

type HoldSwitchRowProps = {
  value: boolean;
  /** EC-7: not operable while the slider is locked after a protective stop (PROJ-6). */
  disabled: boolean;
  onValueChange: (value: boolean) => void;
  /** Shows HOLD_SEND_ERROR below the switch after a failed send. */
  sendFailed: boolean;
};

/**
 * PROJ-2 AC-10: the "hold at standstill" switch below the speed slider.
 * Purely presentational — what it shows and what a toggle does is decided
 * by useHoldSetting (design.md "Was der Schalter zeigt"). Same switch styling
 * as AutoDriveControls' "Video aufnehmen".
 */
export function HoldSwitchRow({ value, disabled, onValueChange, sendFailed }: HoldSwitchRowProps) {
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Text style={styles.label}>{HOLD_SWITCH_LABEL}</Text>
        <Switch
          accessibilityLabel={HOLD_SWITCH_LABEL}
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          trackColor={{ false: colors.border, true: colors.primaryActive }}
          thumbColor={value ? colors.primary : colors.mutedForeground}
        />
      </View>
      {sendFailed && <Text style={styles.errorText}>{HOLD_SEND_ERROR}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.xl,
  },
  row: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.destructive,
  },
});
