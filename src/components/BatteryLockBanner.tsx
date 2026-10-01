import { StyleSheet, Text, View } from 'react-native';
import type { LockReason } from '../ble/client';
import { colors, radius, spacing, typography } from '../theme/colors';

type BatteryLockBannerProps = {
  reason: LockReason;
  /** Seconds until the slider switches itself off (1–60), null when not counting down. */
  shutdownSeconds: number | null;
};

/**
 * PROJ-6 AC-9 / AC-12 / AC-13 / EC-8: shown for as long as the firmware keeps
 * motion locked after a protective stop. Not dismissible — the lock cannot
 * be lifted from the app. During the 60 s before the slider switches itself
 * off, the remaining seconds count down (reported by the slider, so a late
 * connection sees the right number); afterwards the connection drops and
 * the usual lost-connection state takes over.
 */
export function BatteryLockBanner({ reason, shutdownSeconds }: BatteryLockBannerProps) {
  const title =
    reason === 'measurementFault'
      ? 'Akkumessung gestört – bitte Verkabelung prüfen'
      : 'Akku leer – bitte laden';
  // BUG-11: a measurement fault is a wiring problem, not an empty pack.
  const hint =
    reason === 'measurementFault'
      ? 'Alle Bewegungen sind gestoppt, weil die Akkuspannung nicht mehr sicher gemessen wird. Bitte schalte den Slider aus und prüfe die Verkabelung des Spannungsteilers.'
      : 'Alle Bewegungen sind gestoppt, um die Zellen zu schützen. Bitte schalte den Slider aus und lade den Akku — auch abgeschaltet verbraucht die Elektronik noch etwas Strom.';

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      {shutdownSeconds !== null ? (
        <Text style={styles.countdown}>Slider schaltet sich in {shutdownSeconds} s ab</Text>
      ) : null}
      <Text style={styles.text}>{hint}</Text>
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
  countdown: {
    color: colors.foreground,
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    marginTop: spacing.sm,
  },
  text: {
    color: colors.foreground,
    fontSize: typography.size.sm,
    marginTop: spacing.xs,
  },
});
