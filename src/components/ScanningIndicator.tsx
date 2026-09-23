import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/colors';

/**
 * Informational indicator shown while the app looks for the slider over
 * Bluetooth. Reused for both the `scanning` and `connecting` states — the
 * text is generic on purpose; the caller (T10) decides when to render it.
 */
export function ScanningIndicator() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.body}>Suche nach deinem Slider…</Text>
    </View>
  );
}

export default ScanningIndicator;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'transparent',
  },
  body: {
    color: colors.mutedForeground,
    fontSize: typography.size.base,
    fontWeight: typography.weight.body,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
