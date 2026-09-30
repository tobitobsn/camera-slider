import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { useConnection } from '../connection/ConnectionProvider';
import { colors, typography } from '../theme/colors';
import { batteryLevel, batteryPercent, type BatteryLevel } from './battery';
import { useSliderStatus } from './useSliderStatus';

function colorFor(level: BatteryLevel): string {
  switch (level) {
    case 'critical':
      return colors.destructive; // AC-5: red below 10 %
    case 'low':
      return colors.primary; // AC-4: orange (the amber accent) below 20 %
    default:
      return colors.foreground;
  }
}

/**
 * PROJ-6 battery reading in the connection header (AC-1..AC-5, AC-11,
 * EC-4, EC-5): "🔋 78 %" or "🔋 –" when there is no battery / no value yet.
 * Dimmed while the motor moves — the firmware only refreshes the value in
 * standstill, so what is shown then is the last resting value (AC-3).
 */
export function BatteryIndicator() {
  const { device } = useConnection();
  const status = useSliderStatus(device);

  const percent = batteryPercent(status.batteryMillivolts);
  const level = batteryLevel(percent);
  const label = percent === null ? '🔋 –' : `🔋 ${percent} %`;

  return (
    <Text
      style={[styles.label, { color: colorFor(level) }, status.moving && styles.dimmed]}
      accessibilityLabel={percent === null ? 'Akkustand unbekannt' : `Akkustand ${percent} Prozent`}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
  },
  dimmed: {
    opacity: 0.45,
  },
});
