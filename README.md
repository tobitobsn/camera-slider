# Camera Slider

Selbstgebauter, motorisierter Kamera-Slider mit Android-App. Die App steuert den Slider per Bluetooth Low Energy (BLE) über ein ESP32. Es gibt kein Backend und keine Cloud, alle Daten bleiben lokal auf dem Handy.

**Funktionen:** BLE-Verbindung, manuelle Steuerung (Jog), Start-/Endpunkt mit Auto-Fahrt (optional mit Videoaufnahme), Presets, Zeitraffer-Modus und Akkuanzeige. Den aktuellen Stand jedes Features zeigt [`features/INDEX.md`](features/INDEX.md).

## Hardware

| Teil | Details |
|------|---------|
| Controller | ESP32 (`esp32dev`) |
| Treiber | BIGTREETECH TMC2209 V1.3 (Step/Dir + UART) |
| Motor | 42BYGHM809 (0,9°/Schritt, 1,7 A/Phase) |
| Akku | 3S Li-Ion (3× 18650, 9,0–12,6 V) |

**Pinbelegung (ESP32):**

| Signal | GPIO |
|--------|------|
| STEP | 25 |
| DIR | 26 |
| EN | 27 |
| TMC2209 UART RX / TX | 17 / 16 |
| Akkuspannung (Teiler 104 kΩ / 22 kΩ, 100 nF) | 34 (ADC1) |
| BOOT-Taste (Bond-Reset) | 0 |

## Repo-Struktur

```
App.tsx, src/        React-Native-App (TypeScript)
  ble/               BLE-Client (react-native-ble-plx)
  connection/        Verbindungszustand (Provider + Reducer)
  components/        UI-Bausteine und Hooks (Jog, Auto-Fahrt, Video, Presets, Zeitraffer, Akku)
  screens/           RootScreen
firmware/            ESP32-Firmware (PlatformIO, Arduino-Framework)
  src/               main, ble, motor, battery
features/            Feature-Specs (spec, design, tasks, qa-report)
docs/                PRD, Datenmodell, Design-System, Stack-Guides
```

## App

Voraussetzung ist eine eingerichtete [React-Native-Android-Umgebung](https://reactnative.dev/docs/set-up-your-environment). Als Package-Manager dient npm.

```sh
npm install
npm start                    # Metro starten
npx react-native run-android # in zweitem Terminal: auf Gerät/Emulator installieren
```

Für BLE und die Kamera braucht es ein echtes Gerät, der Emulator reicht nicht.

**Tests und Lint:**

```sh
npm test
npm run lint
```

**Release-APK bauen:**

```sh
cd android && ./gradlew assembleRelease
```

Die APK liegt danach unter `android/app/build/outputs/apk/release/app-release.apk` und wird direkt aufs Handy installiert. Einen Play-Store-Eintrag gibt es nicht.

iOS ist derzeit kein Ziel (siehe [`docs/PRD.md`](docs/PRD.md)). Der Ordner `ios/` stammt nur aus dem Template.

## Firmware

Voraussetzung ist [PlatformIO](https://platformio.org/). Die Bibliotheken TMCStepper, FastAccelStepper und NimBLE-Arduino installiert PlatformIO automatisch.

```sh
cd firmware
pio run -e esp32dev -t upload   # bauen und flashen
pio device monitor              # serielle Ausgabe (115200 Baud)
```

Das Gerät meldet sich als **`CameraSlider`**. Die App findet es beim Start über die Service-UUID und verbindet sich automatisch.

**BLE-Kopplung zurücksetzen:** Die Firmware speichert genau eine Kopplung. Um ein anderes Handy zu koppeln, das ESP32 normal einschalten und **innerhalb von 2 Sekunden** die BOOT-Taste drücken. Danach sind alle gespeicherten Kopplungen gelöscht. Wichtig: Die Taste nicht schon *beim* Einschalten gedrückt halten, sonst startet das ESP32 in den Download-Modus.

> App und Firmware teilen sich ein BLE-Protokoll. Bei Änderungen am Protokoll müssen beide gemeinsam ausgeliefert werden (siehe Deployments in [`features/INDEX.md`](features/INDEX.md)).

## Dokumentation und Workflow

Das Projekt nutzt das AI Engineering Kit, einen Spec-getriebenen Workflow (`/write-spec → /architecture → /tasks → /build → /qa → /deploy`). Einstiegspunkte sind:

- [`docs/PRD.md`](docs/PRD.md): Vision, Constraints, Non-Goals
- [`features/INDEX.md`](features/INDEX.md): alle Features, Status, Releases
- [`docs/data-model.md`](docs/data-model.md): lokal gespeicherte Daten
- [`docs/stacks/framework-react-native.md`](docs/stacks/framework-react-native.md) und [`docs/stacks/firmware-esp32-tmc2209.md`](docs/stacks/firmware-esp32-tmc2209.md): technische Leitfäden
- [`CLAUDE.md`](CLAUDE.md): Projektkonventionen
