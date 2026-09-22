# PROJ-1 — Technisches Design

> Dies ist das technische Design (das WIE) für das Feature. Der Vertrag (WAS) steht in `spec.md`, die Aufgabenliste in `tasks.md`.
> Plattform: **mobile** (Android, React Native) — kein HTTP-Routing, keine Responsive-Breakpoints; es geht um Screens, Geräte-Zustand und Transport-Sicherheit über BLE.
> Das Feature spannt zwei Layer: die **App** (primärer Stack, React Native) und die **Firmware** (Layer `firmware`, ESP32/PlatformIO — `docs/stacks/firmware-esp32-tmc2209.md`). Die Grenze zwischen beiden ist die BLE-Service-UUID (siehe unten).

## Komponentenstruktur (App)

```
App
+-- ConnectionProvider (React Context + useReducer, hält den Verbindungs-Zustand app-weit)
    +-- RootScreen
        +-- ConnectionHeader (Status-Badge, Gerätename, "Erneut suchen"-Button)
        +-- ContentArea
            +-- PermissionDeniedNotice      (Zustand: permission_denied)
            +-- BluetoothOffNotice          (Zustand: bluetooth_off)
            +-- ScanningIndicator           (Zustand: scanning / connecting)
            +-- NotFoundNotice              (Zustand: not_found)
            +-- ReconnectingBanner          (Zustand: reconnecting, überlagert die restliche Content-Area)
            +-- [Platzhalter für Steuerungs-UI aus PROJ-2/PROJ-3 — hier nur aktiviert/deaktiviert geschaltet]
```

## Verbindungs-Zustandsmaschine

Der Verbindungsstatus ist ein einziges Enum, nie mehrere unabhängige Booleans — das verhindert unmögliche Kombinationen (z. B. "verbunden" + "scanning" gleichzeitig).

**Zustände:** `checking_permissions` · `permission_denied` · `bluetooth_off` · `scanning` · `connecting` · `connected` · `reconnecting` · `not_found`

**Übergänge:**
- `checking_permissions` → (Berechtigung erteilt) `scanning` — (abgelehnt) `permission_denied`
- `scanning` → (Gerät mit passender Service-UUID gefunden) `connecting` — (10 s ohne Treffer) `not_found`
- `connecting` → (GATT-Verbindung + Service-Discovery erfolgreich) `connected` — (Verbindungsaufbau schlägt fehl) `not_found`
- `connected` → (Verbindung bricht unerwartet ab, erkannt über den nativen BLE-Disconnect-Callback) `reconnecting`
- `reconnecting` → (Reconnect erfolgreich, innerhalb 30 s) `connected` — (30 s ohne Erfolg) `not_found`
- `not_found` → (Nutzer tippt "Erneut suchen") `scanning`
- **Jeder Zustand** → (Bluetooth-Adapter wird ausgeschaltet) `bluetooth_off`
- `bluetooth_off` → (Bluetooth-Adapter wird wieder eingeschaltet) `scanning` (automatisch, kein Tap nötig)
- Beim Zurückkehren aus dem Hintergrund (App-Foreground-Event): Verbindungsstatus wird neu geprüft; ist die native Verbindung weg, wird in `scanning` gewechselt (EC-3)

**Verbindungsfehler und Scan-Timeout landen bewusst im selben `not_found`-Zustand** — beide lösen sich gleich (erneut suchen), eine granularere Fehlerunterscheidung bringt für ein Ein-Nutzer-Hobbygerät keinen Mehrwert.

**"Erneut suchen"-Button** ist in `not_found`, `permission_denied` (führt dort zu den App-Einstellungen), `bluetooth_off` (führt zu den Bluetooth-Einstellungen) **und `reconnecting`** aktiv. Nur in `scanning`/`connecting` ist er deaktiviert — dort läuft bereits ein echter Scan-/Connect-Aufruf (T4), den EC-5 nicht doppelt auslösen soll. In `reconnecting` ist ein Tap dagegen ein gültiger Abbruch: er beendet die laufende Reconnect-Schleife und startet sofort einen neuen Scan (EC-1). Korrektur gegenüber der ersten Fassung dieses Designs — die ursprüngliche "auch in reconnecting deaktiviert"-Regel widersprach EC-1 aus `spec.md`, das genau diesen Abbruch verlangt. Gefunden und korrigiert bei der Umsetzung von T6, 2026-09-22.

## Datenmodell (App)

Dieses Feature persistiert nichts (Entscheidung aus dem Spec-Interview — kein "zuletzt verbundenes Gerät" mehr in `docs/data-model.md`). Der Verbindungsstatus ist reiner In-Memory-App-State für die Dauer der Session:

```
ConnectionState (nur im Speicher, nicht persistiert):
- status: einer von checking_permissions | permission_denied | bluetooth_off |
          scanning | connecting | connected | reconnecting | not_found
- deviceName: Text oder leer (BLE-Advertised-Name, gesetzt sobald verbunden)
- reconnectAttemptsRemaining: Zahl (intern, für die 30-Sekunden-Begrenzung)

Gehört zu: der App-Session, nicht persistiert, verschwindet beim Schließen der App.
```

## Grenze zur Firmware

- **Service-UUID:** die in `docs/stacks/firmware-esp32-tmc2209.md` definierte `SERVICE_UUID` — App und Firmware müssen exakt denselben Wert verwenden. Der Scan-Filter der App sucht ausschließlich nach dieser UUID.
- **Geräte-Name:** vom ESP32 als BLE-Advertised-Name gesetzt (z. B. "CameraSlider") — die App zeigt genau diesen Namen im Header an, keine eigene Umbenennung.
- **Keine Pairing/Bonding-Sicherheit:** die Firmware bietet den GATT-Service ohne Verschlüsselung/Bonding an (siehe Technische Entscheidungen unten) — entspricht der im Spec getroffenen Produktentscheidung.
- **Verbindungsabbruch-Erkennung:** kein eigenes Heartbeat-Protokoll — beide Seiten verlassen sich auf das native BLE-Disconnect-Ereignis (App: `onDisconnected`-Callback von react-native-ble-plx; Firmware: NimBLE-`onDisconnect`). Der Motor-Stopp bei Verbindungsverlust während einer Fahrt (EC-2) ist Firmware-Verantwortung, nicht Teil dieses Features.
- Über die reine "verbunden/nicht verbunden"-Erkennung hinaus tauscht PROJ-1 keine Nutzdaten aus — Befehls- und Status-Characteristics kommen erst mit PROJ-2/PROJ-3.

## Abhängigkeiten

- `react-native-ble-plx` — BLE-Scan, -Verbindung und Service-Discovery
- `react-native-permissions` oder das eingebaute `PermissionsAndroid` (Core-API von React Native) — Laufzeit-Berechtigungsabfrage für `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` (Android 12+) bzw. `ACCESS_FINE_LOCATION` (Android ≤11)

Kein zusätzliches State-Management-Paket (Zustand, Redux) — siehe Technische Entscheidungen.

## Settings the user makes

_Keine — kein Backend, kein Auth-Provider, kein Dashboard-Setting nötig._

## Technische Entscheidungen

| Entscheidung | Begründung | Alternative erwogen | Trade-off | Datum |
|---|---|---|---|---|
| `react-native-ble-plx` als BLE-Bibliothek | Ausgereift, aktiv gepflegt, Promise-basierte API, vollständige TypeScript-Typen | `react-native-ble-manager` | ble-plx hat größere Bundle-Size, dafür deutlich bessere Typisierung und einfacheres Verbindungs-Handling | 2026-09-22 |
| Verbindungsstatus als explizites Enum + React Context/useReducer, kein State-Management-Paket | Ein einziger app-weiter Zustand, keine Notwendigkeit für eine externe Library bei diesem Umfang | Zustand/Redux | Muss ggf. später eingeführt werden, wenn PROJ-3/4 mehr geteilten State brauchen — bewusst aufgeschoben | 2026-09-22 |
| Verbindungsfehler (fehlgeschlagener Connect) und Scan-Timeout teilen sich den `not_found`-Zustand | Weniger UI-Zustände, beide Fälle lösen sich identisch (erneut suchen) | Eigener `connection_failed`-Fehlerzustand | Weniger granulare Fehlermeldung — für ein Ein-Nutzer-Gerät ohne Support-Team ausreichend | 2026-09-22 |
| Reconnect-Schleife: feste 3-Sekunden-Intervalle, max. 30 Sekunden, abbrechbar | Entspricht AC-8 exakt; EC-1 verlangt Abbruch bei manuellem "Erneut suchen" | Exponentielles Backoff | Backoff wäre bei einem Gerät in Reichweite unnötig komplex — feste Intervalle reichen für diese Distanz | 2026-09-22 |
| Bluetooth-Adapter-Status wird beobachtet (BleManager State-Listener); bei Wiedereinschalten automatischer Re-Scan ohne Nutzeraktion | Konsistent mit der `/init`-Entscheidung "kein zusätzlicher Tap nötig im Normalfall" — geht über die Spec-ACs hinaus, aber im gleichen Geist | Nutzer muss nach Bluetooth-Einschalten manuell "Erneut suchen" tippen | Etwas mehr Implementierungsaufwand für spürbar weniger Reibung im Alltag | 2026-09-22 |
| "Erneut suchen"-Button während `scanning`/`connecting`/`reconnecting` deaktiviert statt einer Mutex/Lock-Logik | Einfachster Weg, EC-5 (doppelter Verbindungsversuch) zu verhindern | Eine explizite Sperre/Request-ID im BLE-Client | UI-State-Gating ist für diesen Fall ausreichend robust und deutlich einfacher | 2026-09-22 |
| Keine BLE-Verschlüsselung/Bonding — GATT-Verbindung im Klartext | Übernommen aus der Produktentscheidung in `spec.md`: privates Hobby-Gerät, kein Schutzbedarf gegen Fremdzugriff | BLE-Bonding mit Verschlüsselung | Befehle könnten von einem Angreifer in physischer BLE-Reichweite während der Nutzung theoretisch mitgelesen werden — akzeptiertes Risiko, da nur Motorsteuerung ohne sensible Daten betroffen ist | 2026-09-22 |
| Kein eigenes Heartbeat-Protokoll App↔Firmware | Natives BLE-Disconnect-Ereignis reicht auf beiden Seiten; Firmware stoppt den Motor bereits eigenständig bei Verbindungsverlust | Periodisches Heartbeat-Signal mit Timeout | Spart Bandbreite/Komplexität; einziger Nachteil wäre eine verzögerte Erkennung bei einem "hängenden" statt sauber getrennten Link — für dieses Produkt vernachlässigbar | 2026-09-22 |

## Offene Fragen

_Keine._
