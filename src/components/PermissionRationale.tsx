import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/colors';

/**
 * Explains why the app is about to ask for Bluetooth permissions, shown
 * while the OS permission dialog is requested (AC-1 / BUG-5 — the request
 * must come "mit einer kurzen Erklärung", not a bare system dialog with no
 * context). Purely informational, no button — the request itself fires
 * automatically from ConnectionProvider's mount effect, same as before;
 * this only replaces what the content area shows while that's in flight.
 */
export function PermissionRationale() {
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Bluetooth-Zugriff nötig</Text>
      <Text style={styles.body}>
        Die App braucht die Bluetooth-Berechtigung, um sich mit deinem Slider zu verbinden.
      </Text>
    </View>
  );
}

export default PermissionRationale;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'transparent',
  },
  headline: {
    color: colors.foreground,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.heading,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    color: colors.mutedForeground,
    fontSize: typography.size.base,
    fontWeight: typography.weight.body,
    textAlign: 'center',
  },
});
