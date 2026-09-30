import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

/**
 * PROJ-6 AC-9: shown for as long as the firmware keeps motion locked after a
 * low-battery protective stop (until the ESP32 reboots). Not dismissible —
 * the lock itself cannot be lifted from the app. Same shape as
 * ReconnectingBanner, but a full red border since this is a hard stop.
 */
export function BatteryLockBanner() {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>Akku leer – bitte laden</Text>
      <Text style={styles.text}>
        Der Slider hat alle Bewegungen gestoppt, um die Zellen zu schützen. Nach dem Laden bzw.
        Akkuwechsel startet er neu und ist wieder bedienbar.
      </Text>
    </View>
  );
}

export default BatteryLockBanner;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.base,
    borderWidth: 2,
    borderColor: colors.destructive,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.destructive,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.heading,
  },
  text: {
    color: colors.foreground,
    fontSize: typography.size.sm,
    marginTop: spacing.xs,
  },
});
