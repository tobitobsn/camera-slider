import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/colors';

/**
 * Compact banner shown while the app automatically reconnects after an
 * unexpected disconnect. Overlays while the rest of the UI stays visible —
 * unlike the other notices, this is not a full-screen centered state.
 * The destructive left border reads as a warning without being alarmist,
 * since auto-reconnect is expected behavior, not a failure.
 */
export function ReconnectingBanner() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.text}>Verbindung unterbrochen — verbinde automatisch neu…</Text>
    </View>
  );
}

export default ReconnectingBanner;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.base,
    borderLeftWidth: 4,
    borderLeftColor: colors.destructive,
    padding: spacing.lg,
  },
  text: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.size.base,
    fontWeight: typography.weight.body,
    marginLeft: spacing.md,
  },
});
