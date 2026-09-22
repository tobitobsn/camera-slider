import { Linking, PermissionsAndroid, Platform } from 'react-native';

/**
 * Requests whatever BLE-related runtime permission(s) this Android version needs.
 *
 * - Android 12+ (API 31+): BLUETOOTH_SCAN + BLUETOOTH_CONNECT.
 * - Android <=11: ACCESS_FINE_LOCATION (the platform's own requirement for BLE
 *   scanning on older Android, independent of whether this app uses location
 *   for anything).
 *
 * Returns true only if every required permission was granted. No-ops (returns
 * false) on non-Android platforms — iOS is out of scope for this project.
 */
export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  if (Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);

    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Opens this app's OS-level settings screen (for when a permission was
 * permanently denied with "don't ask again" and an in-app re-request would
 * silently be ignored by the system).
 */
export function openAppSettings(): void {
  Linking.openSettings();
}
