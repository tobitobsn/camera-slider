import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/colors';

/**
 * Informational notice shown when a scan finished without finding a slider.
 * Purely informational — no retry button (lives in ConnectionHeader).
 */
export function NotFoundNotice() {
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Kein Gerät gefunden</Text>
      <Text style={styles.body}>
        Stell sicher, dass dein Slider eingeschaltet ist und sich in Reichweite befindet.
      </Text>
    </View>
  );
}

export default NotFoundNotice;

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
