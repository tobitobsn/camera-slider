# React Native (Android) — die konkreten Verfahren

> **Gilt, wenn `.ai-eng-kit` → `stack.framework` ist `react-native`.**
> Zielplattform: Android (iOS ist Non-Goal für diese Version). TypeScript. Kein Backend — lokale Speicherung.
> Kommuniziert per BLE mit der ESP32-Firmware — deren Verfahren stehen in `docs/stacks/firmware-esp32-tmc2209.md`.

---

## Projekt-Setup

```bash
npx @react-native-community/cli init CameraSliderApp --template react-native-template-typescript
```

Kein Expo — `react-native-ble-plx` braucht native Module (Bluetooth-Stack), die im Expo-Managed-Workflow nicht ohne einen Dev-Client verfügbar sind. Ein reines RN-CLI-Projekt spart diesen Umweg, weil hier ohnehin von Anfang an nativer Code (Android) gebaut wird.

## BLE: react-native-ble-plx

```bash
npm install react-native-ble-plx
```

```typescript
// src/ble/client.ts
import { BleManager, Device } from 'react-native-ble-plx'

export const bleManager = new BleManager()

export async function connectToSlider(deviceId: string): Promise<Device> {
  const device = await bleManager.connectToDevice(deviceId)
  await device.discoverAllServicesAndCharacteristics()
  return device
}
```

Ein `BleManager` pro App-Lebenszeit (Singleton) — mehrfaches Instanziieren öffnet mehrfach den nativen Bluetooth-Stack und führt zu Leaks.

## Android-Berechtigungen (kritisch, sonst scannt nichts)

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
```

Android 12+ (API 31+) trennt `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` von der Standort-Berechtigung — `neverForLocation` ist hier zulässig, weil die App den Scan nicht zur Positionsbestimmung nutzt. Auf Android ≤11 bleibt `ACCESS_FINE_LOCATION` zur Laufzeit erforderlich (System-Vorgabe für BLE-Scan, unabhängig vom eigenen Anwendungsfall). Zur Laufzeit abfragen, nicht nur im Manifest deklarieren:

```typescript
import { PermissionsAndroid, Platform } from 'react-native'

async function requestBlePermissions() {
  if (Platform.OS !== 'android') return true
  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ])
    return Object.values(result).every(v => v === PermissionsAndroid.RESULTS.GRANTED)
  }
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  )
  return result === PermissionsAndroid.RESULTS.GRANTED
}
```

## Lokale Speicherung (kein Backend)

`@react-native-async-storage/async-storage` reicht für Presets und die zuletzt verbundene Geräte-ID — kleine, unkomplizierte Datenmengen, kein Bedarf für SQLite/WatermelonDB in diesem Umfang:

```bash
npm install @react-native-async-storage/async-storage
```

```typescript
// src/storage/presets.ts
import AsyncStorage from '@react-native-async-storage/async-storage'

export type Preset = {
  id: string
  name: string
  startSteps: number
  endSteps: number
  durationMs: number
}

const KEY = 'presets'

export async function loadPresets(): Promise<Preset[]> {
  const raw = await AsyncStorage.getItem(KEY)
  return raw ? JSON.parse(raw) : []
}

export async function savePresets(presets: Preset[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(presets))
}
```

## Build & lokale Installation (kein Play Store)

```bash
# Debug, direkt aufs per USB verbundene Handy
npx react-native run-android

# Signierter Release-Build zum Verteilen als APK
cd android && ./gradlew assembleRelease
# Ergebnis: android/app/build/outputs/apk/release/app-release.apk
# Installation: adb install app-release.apk, oder Datei aufs Handy kopieren und dort installieren
```

Für den signierten Release-Build braucht `android/app/build.gradle` einen eigenen Signing-Key (`keytool -genkeypair`) statt des Debug-Keys — ohne den lässt sich `assembleRelease` zwar bauen, aber das Ergebnis ist nicht für die Weitergabe/Langzeitnutzung gedacht (Debug-Zertifikate sind nicht für Produktion vorgesehen).

## Tests

```bash
npm install --save-dev jest @testing-library/react-native
```

Jest kommt im RN-CLI-Template bereits vorkonfiguriert. `@testing-library/react-native` für Komponenten-Tests der Steuerungs-UI. Kein E2E-Runner (Detox) vorgesehen, solange die App intern bleibt — bei Bedarf später nachrüstbar.
