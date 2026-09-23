import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/colors';

/**
 * Informational notice shown when the app's Bluetooth permission has been
 * denied. Purely informational — the settings action itself lives in
 * ConnectionHeader, not here.
 */
export function PermissionDeniedNotice() {
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Bluetooth-Berechtigung fehlt</Text>
      <Text style={styles.body}>
        Die App braucht die Bluetooth-Berechtigung, um sich mit deinem Slider zu verbinden. Öffne die
        App-Einstellungen und erlaube den Zugriff.
      </Text>
    </View>
  );
}

export default PermissionDeniedNotice;

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
