import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useConnection } from '../connection/ConnectionProvider';
import type { ConnectionState } from '../connection/connectionReducer';
import {
  openAppSettings,
  openBluetoothSettings,
} from '../permissions/requestBlePermissions';
import { colors, minTouchTarget, radius, spacing, typography } from '../theme/colors';

type ConnectionStatus = ConnectionState['status'];

/** Status dot color, per the mapping in the design tokens' 3-color status system. */
function dotColorFor(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return colors.primary;
    case 'not_found':
    case 'permission_denied':
    case 'bluetooth_off':
      return colors.destructive;
    default:
      // checking_permissions, scanning, connecting, reconnecting
      return colors.mutedForeground;
  }
}

/**
 * Always-visible header showing connection status, device name, and the
 * single retry/settings action for the whole app (AC-5, EC-1). Reads
 * everything from useConnection() — no props.
 */
export function ConnectionHeader() {
  const { state, requestScan } = useConnection();
  const { status, deviceName } = state;

  const dotColor = dotColorFor(status);
  const showSpinner = status === 'scanning' || status === 'connecting';

  let label: string;
  let buttonLabel: string | null = null;
  let onPressButton: (() => void) | null = null;

  switch (status) {
    case 'checking_permissions':
      label = 'Berechtigungen werden geprüft…';
      break;
    case 'permission_denied':
      label = 'Keine Bluetooth-Berechtigung';
      buttonLabel = 'Einstellungen öffnen';
      onPressButton = openAppSettings;
      break;
    case 'bluetooth_off':
      label = 'Bluetooth ist aus';
      buttonLabel = 'Bluetooth-Einstellungen öffnen';
      onPressButton = openBluetoothSettings;
      break;
    case 'scanning':
      label = 'Suche nach Slider…';
      break;
    case 'connecting':
      label = 'Verbinde…';
      break;
    case 'connected':
      label = 'Verbunden';
      break;
    case 'reconnecting':
      label = 'Verbindung verloren — verbinde neu…';
      buttonLabel = 'Erneut suchen';
      onPressButton = requestScan;
      break;
    case 'not_found':
      label = 'Kein Gerät gefunden';
      buttonLabel = 'Erneut suchen';
      onPressButton = requestScan;
      break;
  }

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={styles.label}>{label}</Text>
        </View>
        {status === 'connected' && deviceName ? (
          <Text style={styles.deviceName}>{deviceName}</Text>
        ) : null}
      </View>

      {showSpinner ? (
        <ActivityIndicator color={colors.primary} />
      ) : buttonLabel && onPressButton ? (
        <Pressable
          onPress={onPressButton}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>{buttonLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginRight: spacing.sm,
  },
  label: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.foreground,
    flexShrink: 1,
  },
  deviceName: {
    fontSize: typography.size.sm,
    color: colors.mutedForeground,
    marginTop: spacing.xs,
    marginLeft: 10 + spacing.sm, // align under the label text, past the status dot
  },
  button: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.base,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.primaryActive,
  },
  buttonLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.heading,
    color: colors.background,
  },
});
