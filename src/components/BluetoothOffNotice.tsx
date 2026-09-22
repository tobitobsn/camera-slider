import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/colors';

/**
 * Informational notice shown when Bluetooth is switched off on the device.
 * Purely informational — no action button (lives in ConnectionHeader).
 */
export function BluetoothOffNotice() {
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Bluetooth ist ausgeschaltet</Text>
      <Text style={styles.body}>Schalte Bluetooth ein, damit die App deinen Slider finden kann.</Text>
    </View>
  );
}

export default BluetoothOffNotice;

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
