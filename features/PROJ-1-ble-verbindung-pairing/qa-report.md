# QA Test Results

**Getestet:** 2026-09-22
**App-URL:** nicht lauffähig hier (`probe.kind: none`, sowohl App-Ebene als auch Layer `firmware` — kein Android-Emulator/-Gerät, kein PlatformIO-Toolchain in dieser Umgebung). Jedes Laufzeit-AC unten ist daher `[!] NOT VERIFIED`, bis ein Mensch es testet (siehe unten).
**Tester:** QA Engineer (AI) — 3 unabhängige `qa-engineer`-Lanes (Funktionsprüfung, Security-Red-Team, Regression), die den Build nicht kannten, zusammengeführt von dieser Session als alleiniger Owner. Ein vierter Fund (F-1) wurde von der Owner-Session selbst per Web-Recherche gegen die offizielle NimBLE-Arduino-Migrationsdokumentation bestätigt.
**Scope:** `full` (erster `/qa`-Lauf für PROJ-1, kein vorheriger `qa-report.md`)

> Legende: `[x]` in diesem Lauf verifiziert (Evidenz erforderlich) · `[ ] BUG` als defekt verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund erforderlich)

## Acceptance Criteria Status

### AC-1: Berechtigungsabfrage beim ersten Start, mit Erklärung
- [ ] BUG (Medium) — Die App fragt die Berechtigungen ab (`src/connection/ConnectionProvider.tsx:58-67`), aber **ohne jede Erklärung**. `PermissionsAndroid.requestMultiple(...)` (`src/permissions/requestBlePermissions.ts:20-23`) nimmt kein Rationale-Objekt entgegen; der Legacy-Pfad nutzt `PermissionsAndroid.request(...)` ohne das von RN unterstützte Rationale-Argument (`:33-35`). Auch kein vorgeschalteter Erklär-Screen: `checking_permissions` rendert nur den generischen `ScanningIndicator` (`src/screens/RootScreen.tsx:34-35`). Spec verlangt explizit "mit einer kurzen Erklärung".

### AC-2: Automatischer Scan nach Berechtigungserteilung
- [x] PASS (Code) — `checking_permissions` → `PERMISSIONS_GRANTED` → `scanning` (`src/connection/connectionReducer.ts:72-75`); Scan-Effekt startet automatisch, gefiltert auf Service-UUID (`ConnectionProvider.tsx:84-99` → `src/ble/client.ts:69-71`). Test: `ConnectionProvider.test.tsx:55-76`, grün im Owner-Lauf.
- [!] NOT VERIFIED — realer Scan/Verbindungsaufbau zur Laufzeit, kein Emulator/Gerät

### AC-3: Erfolgreiche Verbindung → "Verbunden" + Gerätename, UI nutzbar
- [x] PASS (Code) — `connecting` → `CONNECT_SUCCEEDED` → `connected` inkl. `deviceName` (`connectionReducer.ts:105-112`); kein Bonding (`ble/client.ts:101-104`); Header zeigt "Verbunden" + Name (`src/components/ConnectionHeader.tsx:65-66, 87-89`); Content-Area ist im `connected`-Zustand nicht gesperrt (`RootScreen.tsx:45-46, 64-72`). Test: `connectionReducer.test.ts:30-45`.
- [!] NOT VERIFIED — reale Verbindung zur Laufzeit; "nutzbar" nur als "nicht gesperrt" prüfbar, da die echte Steuerungs-UI erst mit PROJ-2/3 kommt

### AC-4: Scan-Timeout (10s) → "Kein Gerät gefunden" + Retry
- [x] PASS — Timeout exakt 10000ms (`ble/client.ts:21`, unverändert übernommen in `ConnectionProvider.tsx:90-96`) → `SCAN_TIMEOUT` → `not_found` (`connectionReducer.ts:100-102`); UI: `NotFoundNotice.tsx:11` + aktiver Button (`ConnectionHeader.tsx:73-77`). Test: `connectionReducer.test.ts:56-61`.

### AC-5: Bluetooth aus → Hinweis + Link zu Bluetooth-Einstellungen
- [x] PASS (Code) — Adapter-Listener mit `emitCurrentState=true` (`ConnectionProvider.tsx:70-81`); `BLUETOOTH_OFF` aus jedem Zustand (`connectionReducer.ts:67-69`); Button → `Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')` (`ConnectionHeader.tsx:54-57`, `requestBlePermissions.ts:54-56`). Test: `connectionReducer.test.ts:64-75`.
- [!] NOT VERIFIED — echtes Ein-/Ausschalten von Bluetooth, echter Sprung in die Systemeinstellungen

### AC-6: Berechtigung abgelehnt → Hinweis-Screen + Link zu App-Einstellungen
- [x] PASS (Code) — `PERMISSIONS_DENIED` → `permission_denied` (`connectionReducer.ts:76-78`); Hinweis-Screen (`PermissionDeniedNotice.tsx:12-16`) + Button → `Linking.openSettings()` (`ConnectionHeader.tsx:49-52`). Tests: `ConnectionProvider.test.tsx:34-52`, `connectionReducer.test.ts:22-27`.
- [ ] BUG (Medium, undokumentierter Fall U-1) — Ist Bluetooth beim Start aus, feuert der Adapter-Listener sofort `BLUETOOTH_OFF`, bevor das Berechtigungsergebnis eintrifft. Das nachfolgende `PERMISSIONS_DENIED` wird im Zustand `bluetooth_off` ignoriert (`connectionReducer.ts:89-94` kennt dort nur `BLUETOOTH_ON`). Schaltet der Nutzer Bluetooth danach ein, geht es direkt nach `scanning` — **ohne Berechtigung**. Der native Scan-Fehler wird wie ein Timeout behandelt (`ble/client.ts:75-81`) → Nutzer sieht "Kein Gerät gefunden" statt des Berechtigungs-Hinweises, ohne Weg zu den Einstellungen. Repro (statisch): `checking_permissions --BLUETOOTH_OFF--> bluetooth_off --PERMISSIONS_DENIED--> (no-op) --BLUETOOTH_ON--> scanning`.

### AC-7: Unerwarteter Abbruch → Banner + UI gesperrt
- [x] PASS (Code), Low-Abweichung — Disconnect → `UNEXPECTED_DISCONNECT` → `reconnecting` sofort (`connectionReducer.ts:118-125`); UI gesperrt via `pointerEvents="none"` + Opacity (`RootScreen.tsx:47-55, 86-90`). **Wording-Abweichung (Low):** Banner sagt "Verbindung unterbrochen — verbinde automatisch neu…" (`ReconnectingBanner.tsx:15`), Header sagt "Verbindung verloren — verbinde neu…" (`ConnectionHeader.tsx:69`) — Spec nennt "Verbindung verloren". Inhaltlich erfüllt, nur kosmetisch uneinheitlich.

### AC-8: Reconnect-Versuche alle 3s, max. 30s
- [x] PASS — `MAX_RECONNECT_ATTEMPTS = 10` (`connectionReducer.ts:22`), `RECONNECT_INTERVAL_MS = 3000` (`ConnectionProvider.tsx:26`) = 30s-Fenster; bei 0 verbleibenden Versuchen → `not_found` (`connectionReducer.ts:136-141`). Test: `connectionReducer.test.ts:94-104`, in dieser Lane einzeln nachgeprüft (grün).
- [ ] BUG (Low, U-4) — Ist `deviceRef.current` im Zustand `reconnecting` `null`, wird `RECONNECT_ATTEMPT_FAILED` synchron **ohne** die 3-Sekunden-Wartezeit dispatcht (`ConnectionProvider.tsx:137-141`) — die 10 Versuche verbrennen dann sofort, das 30s-Fenster kollabiert auf ~0s.

### AC-9: Bei mehreren Treffern automatisch zum ersten verbinden, keine Auswahl
- [x] PASS — `scanForSlider` verbindet mit dem ersten Treffer, `settled`-Flag schützt gegen weitere Callbacks (`ble/client.ts:49, 55-63, 83-85`); keine Auswahl-UI im gesamten `src/`. Test: `connectionReducer.test.ts:30-37`.

## Edge Cases Status

### EC-1: Manueller Retry bricht laufenden Reconnect ab
- [x] PASS (Code) — `reconnecting` + `REQUEST_SCAN` → `scanning` (`connectionReducer.ts:144-147`); Reconnect-Effekt-Cleanup löscht Timer (`ConnectionProvider.tsx:165-168`); Button aktiv in `reconnecting` (`ConnectionHeader.tsx:68-72`, entspricht der korrigierten `design.md`-Fassung). Test: `connectionReducer.test.ts:117-121`, einzeln nachgeprüft.
- [ ] BUG (Medium, Folgefund U-2) — Beim Abbruch wird nur ein `cancelled`-Flag gesetzt (`ConnectionProvider.tsx:111/128-130` und `143/165-168`); das zugrundeliegende `connectToSlider`-Promise kann trotzdem erfolgreich auflösen, ohne dass `device.cancelConnection()` je aufgerufen wird (`grep cancelConnection src/` → 0 Treffer) — der native GATT-Link bleibt bestehen. Die Firmware startet ihr Advertising erst bei echtem `onDisconnect` neu (`firmware/src/ble.cpp:32-35`); der neue Scan findet dann 10s lang nichts, obwohl das Gerät faktisch verbunden ist → "Kein Gerät gefunden", obwohl es das nicht sein sollte.

### EC-2: Firmware stoppt Motor eigenständig bei Verbindungsabbruch während einer Fahrt
- [!] NOT VERIFIED — verschoben auf das Motor-Feature (PROJ-2/3): `firmware/src/main.cpp` hat noch keine Motorsteuerung, es gibt aktuell keine Fahrt, die gestoppt werden müsste. Kein PROJ-1-Bug, aber als offener Punkt mitzuführen, damit er zwischen den Features nicht verloren geht.

### EC-3: Foreground-Re-Check
- [ ] BUG (Medium) — Spec/Design verlangen: beim Vordergrund-Wechsel Status neu prüfen, bei Bedarf automatisch neu scannen. Implementiert (`ConnectionProvider.tsx:172-197`) ist aber nur: (a) im Zustand `connected` wird geprüft; bei verlorener Verbindung wird `UNEXPECTED_DISCONNECT` dispatcht → 30s-Reconnect-Schleife auf die alte, potenziell tote Device-Referenz → erst danach `not_found` (manueller Tap nötig) statt eines direkten Re-Scans; (b) war die App beim Backgrounding in `scanning`/`not_found`/`connecting`, passiert beim Foreground **gar nichts** — der Code behandelt dort nur `connected` und `permission_denied`. Workaround vorhanden ("Erneut suchen" bleibt sichtbar) → Medium statt High.

### EC-4: Permanent abgelehnte Berechtigung → App-Einstellungen-Link
- [x] PASS — Hinweis-Screen bietet ausschließlich den Weg über `Linking.openSettings()` (`ConnectionHeader.tsx:49-52`), keine erneute In-App-Abfrage im UI-Pfad; der Foreground-Re-Check dient nur der Erkennung einer nachträglich in den Einstellungen erteilten Berechtigung, kein Widerspruch.

### EC-5: Kein doppelter Verbindungsversuch
- [x] PASS — Doppelt abgesichert: Reducer behandelt `REQUEST_SCAN` in `scanning`/`connecting`/`connected`/`checking_permissions` als No-op (`connectionReducer.ts:96-126, 150-158`, 4 parametrisierte Tests grün); UI zeigt in `scanning`/`connecting` einen Spinner statt des Buttons (`ConnectionHeader.tsx:39, 92-101`); zusätzlich schützt `settled` in `scanForSlider` (`ble/client.ts:49, 55-63`).

## Weitere Befunde (undokumentierte Edge Cases / Layer-Grenze)

### F-1: NimBLE-Arduino Versionskonflikt — Firmware kompiliert vermutlich nicht
- [ ] BUG (**High**) — `firmware/platformio.ini:12` pinnt `h2zero/NimBLE-Arduino @ ^1.4.1` (PlatformIO-Caret = `>=1.4.1 <2.0.0`). `firmware/src/ble.cpp:19-37` nutzt aber die **NimBLE-2.x-Callback-Signaturen**: `onConnect(NimBLEServer*, NimBLEConnInfo&)` und `onDisconnect(NimBLEServer*, NimBLEConnInfo&, int reason)`, beide mit `override`. Von der Acceptance-Lane als starker Verdacht gemeldet, vom QA-Owner gegen die offizielle NimBLE-Arduino-Migrationsdokumentation bestätigt: `NimBLEConnInfo` und diese Signaturen existieren erst **ab Version 2.0** — 1.x verwendet `ble_gap_conn_desc*` und `onDisconnect` ohne `reason`-Parameter (Quelle: [h2zero/NimBLE-Arduino 1.x-to-2.x Migration Guide](https://github.com/h2zero/NimBLE-Arduino/blob/master/docs/1.x_to2.x_migration_guide.md)). Mit der gepinnten 1.4.x-Version ist ein Compile-Fehler sehr wahrscheinlich (`override` auf eine nicht existierende Basissignatur) — dann advertised der ESP32 nie, und AC-2/AC-3/AC-9 sind end-to-end nicht erreichbar, unabhängig von der App-Seite.
  **Compile selbst NOT VERIFIED** — keine PlatformIO-Toolchain in dieser Umgebung; der Fund stützt sich auf den Versions-Constraint plus die offizielle API-Dokumentation, nicht auf einen beobachteten Build-Fehler.
  Fix-Richtung (für `/build`, nicht hier umgesetzt): entweder `platformio.ini` auf `@ ^2.5.1` (aktuell letzte stabile Version) anheben und `docs/stacks/firmware-esp32-tmc2209.md` entsprechend nachziehen, oder die Callbacks auf die 1.x-Signaturen zurückbauen.

### U-3: Disconnect-Subscription wird nicht abbestellt vor Neuanlage
- [ ] BUG (Low) — `ConnectionProvider.tsx:116` und `:149` überschreiben `disconnectSubRef.current`, ohne die vorherige Subscription abzubestellen (`clearDisconnectSubscription()` läuft nur im Scan-Effekt und beim Unmount). Listener-Leak, funktional harmlos, da ein doppelter `UNEXPECTED_DISCONNECT`-Dispatch im Zustand `reconnecting` ein No-op ist.

### U-5: Falscher Content-Text im Zustand `checking_permissions`
- [ ] BUG (Low) — `RootScreen.tsx:34-35` rendert im Zustand `checking_permissions` den `ScanningIndicator` ("Suche nach deinem Slider…"), während der Header korrekt "Berechtigungen werden geprüft…" zeigt (`ConnectionHeader.tsx:47`) — zu diesem Zeitpunkt läuft noch gar kein Scan. Widersprüchlich, aber rein kosmetisch.

## Security Audit Results

_Dieses Feature hat keinen HTTP-Server, keine Routen, kein Auth, keine Datenbank, kein Web-Bundle — die meisten Standard-Web-Punkte sind deshalb nicht anwendbar, nicht stillschweigend übersprungen._

- [!] NOT VERIFIED — Authentication Bypass: nicht anwendbar, kein HTTP-/Auth-Surface
- [!] NOT VERIFIED — Authorization/RLS: nicht anwendbar, keine Datenbank, keine Accounts
- [!] NOT VERIFIED — Rate Limiting: nicht anwendbar, kein HTTP-Endpoint
- [!] NOT VERIFIED — Brute Force auf Credentials: nicht anwendbar, kein Login/Signup/Passwort-Reset, kein PIN/Bonding (Produktentscheidung)
- [!] NOT VERIFIED — Account-Enumeration: nicht anwendbar, keine Accounts
- [!] NOT VERIFIED — Bulk-Signup: nicht anwendbar
- [!] NOT VERIFIED — Credentials in der URL: nicht anwendbar, keine Formulare/URLs; einzige `Linking`-Aufrufe sind parameterlose System-Intents (`requestBlePermissions.ts:46,55`)
- [x] PASS — Keine hartcodierten Secrets/Keys/Tokens: `grep -rniE "api[_-]?key|secret|token|password|credential|bearer|...”` über `src`, `firmware/src`, `App.tsx`, `android/app/src/main` → nur zwei False Positives ("design tokens"-Kommentare); `git grep` nach Cloud-Provider-Key-Mustern → 0 Treffer; keine `.env`/`.pem`/`google-services.json` getrackt
- [ ] BUG (Low) — Release-Build ist mit dem öffentlichen RN-Debug-Keystore signiert: `android/app/build.gradle:88-94,103` nutzt `signingConfigs.debug` (`storePassword 'android'`) auch für `buildTypes.release`. Unveränderter Template-Default. Severity Low, solange `stack.deploy: local` bleibt (privates Gerät) — wird Medium/High, sobald das APK an Dritte weitergegeben wird.
- [x] PASS — BLE-Sicherheitslage konsistent mit der dokumentierten Entscheidung: kein Bonding/Encryption weder in Firmware (`ble.cpp:51,54` reine `WRITE`/`NOTIFY`-Properties, kein `setSecurityAuth`) noch App (`ble/client.ts:102` reines `device.connect()`); über den Link geht nachweislich nichts außer Verbindungsstatus (`grep Serial.print|console.log` → nur 3 statuslose Log-Zeilen in der Firmware, 0 in der App); keine MAC/Geräte-ID wird angezeigt oder geloggt
- [x] PASS — Android-Permission-Scope korrekt begrenzt: nur `INTERNET` (RN-Template-Default), `BLUETOOTH_SCAN` (mit `neverForLocation`), `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION` (maxSdk 30) — kein Scope Creep, `allowBackup="false"`, `usesCleartextTraffic` in Release vom Gradle-Plugin auf `false` gesetzt
- [x] PASS — Keine verarbeitete BLE-Eingabe (Injection-Fläche): Command-Characteristic hat noch keinen `onWrite`-Callback (`grep setCallbacks|onWrite firmware/src` → nur der Server-Level-Callback), Werte werden weder gelesen noch verarbeitet
- [x] PASS — Keine lokale Persistenz: `grep AsyncStorage|localStorage|MMKV|SecureStore` über `src`, `firmware/src`, `package.json` → 0 Treffer, entspricht der Spec-Entscheidung
- [x] PASS — Abhängigkeiten: `npm audit` (mit und ohne devDependencies) → **0 vulnerabilities**; installierte `react-native-ble-plx`-Version 3.5.1 entspricht `^3.5.1`
- [!] NOT VERIFIED — Vulnerability-Scan der PlatformIO-Firmware-Bibliotheken (NimBLE-Arduino, TMCStepper, FastAccelStepper): kein Audit-Werkzeug/keine Toolchain in dieser Umgebung

## E2E Tests
_Optionale Ebene — wird von `/e2e-tests` für kritische Kernabläufe geschrieben._

- Status: **nicht ausgeführt** (führe `/e2e-tests` für kritische Abläufe aus)

## Not Verified In This Run

- [!] Jede Laufzeit-Beobachtung zu AC-1…AC-9 und EC-1…EC-5 — `probe.kind: none`, kein Emulator/Gerät, kein PlatformIO-Toolchain
- [!] Firmware-Kompilierung selbst (F-1 ist ein statischer Fund, kein beobachteter Build-Fehler) — keine PlatformIO-Toolchain hier
- [!] Layer `firmware`: kein Testkommando hinterlegt (`.ai-eng-kit` → `layers[0].commands.test: null`) — Frage an `/init`, keine automatisierte Abdeckung für `firmware/src/*.cpp`
- [!] EC-2 (Firmware-Sicherheits-Timeout bei Verbindungsabbruch während einer Fahrt) — verschoben auf das Motor-Feature (PROJ-2/3), es gibt noch keine Fahrt
- [!] Cross-Browser-/Emulator-Rendering, Layout, Touch-Targets, Statusfarben — kein Renderer/Viewport hier, gehört zu `/e2e-tests` oder einem menschlichen Test
- [!] Vulnerability-Scan der PlatformIO-Bibliotheken (NimBLE-Arduino, TMCStepper, FastAccelStepper) — kein Werkzeug/Toolchain hier

## Bugs Found

### BUG-1: Firmware kompiliert vermutlich nicht — NimBLE-Arduino-Versionskonflikt (F-1)
- **Severity:** High
- **Steps to Reproduce:**
  1. `firmware/platformio.ini:12` lesen → `h2zero/NimBLE-Arduino @ ^1.4.1`
  2. `firmware/src/ble.cpp:19-37` lesen → `onConnect(NimBLEServer*, NimBLEConnInfo&)`, `onDisconnect(NimBLEServer*, NimBLEConnInfo&, int reason)`, beide `override`
  3. Erwartet: Diese Signaturen kompilieren gegen die gepinnte Version. Tatsächlich: `NimBLEConnInfo` existiert laut [offizieller Migrationsdoku](https://github.com/h2zero/NimBLE-Arduino/blob/master/docs/1.x_to2.x_migration_guide.md) erst ab NimBLE-Arduino 2.0; `^1.4.1` löst nie auf 2.x auf
- **Priority:** Fix before deployment

### BUG-2: `bluetooth_off` verschluckt eine zuvor abgelehnte Berechtigung (U-1)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. App mit ausgeschaltetem Bluetooth starten
  2. Berechtigungsdialog ablehnen
  3. Erwartet: Hinweis-Screen "Keine Bluetooth-Berechtigung" mit Link zu den Einstellungen
  4. Tatsächlich: App bleibt/geht in `bluetooth_off`, das `PERMISSIONS_DENIED`-Ergebnis wird verworfen; schaltet man Bluetooth später ein, scannt die App ohne Berechtigung und zeigt "Kein Gerät gefunden" statt des Berechtigungs-Hinweises
- **Priority:** Fix before deployment

### BUG-3: Abgebrochener Connect/Reconnect hinterlässt verwaisten GATT-Link (U-2)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Während eines laufenden Reconnect-Versuchs auf "Erneut suchen" tippen (EC-1)
  2. Erwartet: Verbindung wird sauber abgebrochen, neuer Scan findet das Gerät
  3. Tatsächlich: Nur ein internes Flag wird gesetzt, `device.cancelConnection()` wird nie aufgerufen; der native Link kann bestehen bleiben, die Firmware advertised erst nach echtem Disconnect neu → neuer Scan läuft 10s ins Leere
- **Priority:** Fix before deployment

### BUG-4: Kein automatischer Re-Scan beim Rückkehren in den Vordergrund (EC-3)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. App in den Hintergrund schicken, während sie in `scanning`/`not_found`/`connecting` ist (oder während im Hintergrund ein Reconnect abläuft und ausläuft)
  2. App wieder in den Vordergrund holen
  3. Erwartet: Status wird neu geprüft, bei Bedarf automatischer Re-Scan (so in `design.md:38` beschrieben)
  4. Tatsächlich: Der Foreground-Handler behandelt nur `connected` und `permission_denied`; in jedem anderen Zustand passiert nichts automatisch — Workaround: manueller "Erneut suchen"-Tap bleibt möglich
- **Priority:** Fix before deployment

### BUG-5: Keine Erklärung vor der Berechtigungsabfrage (AC-1)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. App zum ersten Mal starten
  2. Erwartet: kurze Erklärung, warum die Bluetooth-Berechtigung gebraucht wird, dann der Systemdialog
  3. Tatsächlich: Systemdialog ohne jeden Kontext; `checking_permissions` zeigt nur einen generischen Ladehinweis
- **Priority:** Fix before deployment

### BUG-6: Release-Build mit öffentlichem Debug-Keystore signiert
- **Severity:** Low
- **Steps to Reproduce:**
  1. `android/app/build.gradle:88-104` lesen
  2. `buildTypes.release` referenziert `signingConfigs.debug` mit dem im Repo getrackten `debug.keystore`
  3. Solange nur lokal genutzt (`stack.deploy: local`) harmlos; bei Weitergabe des APKs an Dritte wird das relevant
- **Priority:** Nice to have

### BUG-7: Reconnect-Fenster kollabiert bei fehlender Geräte-Referenz (U-4)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Zustand `reconnecting` erreichen, während `deviceRef.current` aus irgendeinem Grund `null` ist
  2. Erwartet: 10 Versuche über 30 Sekunden verteilt
  3. Tatsächlich: `RECONNECT_ATTEMPT_FAILED` wird synchron ohne Wartezeit dispatcht, alle Versuche verbrennen sofort
- **Priority:** Nice to have

### BUG-8: Disconnect-Subscription wird nicht abbestellt vor Neuanlage
- **Severity:** Low
- **Steps to Reproduce:** siehe U-3 oben — Listener-Leak, funktional harmlos (Reducer ignoriert den doppelten Dispatch)
- **Priority:** Nice to have

### BUG-9: Falscher Content-Text während `checking_permissions`
- **Severity:** Low
- **Steps to Reproduce:** siehe U-5 oben — kosmetischer Widerspruch zwischen Header- und Content-Text
- **Priority:** Nice to have

### BUG-10: Banner-Wortlaut weicht vom Spec-Text ab (AC-7)
- **Severity:** Low
- **Steps to Reproduce:** siehe AC-7 oben — "Verbindung unterbrochen" statt "Verbindung verloren" im Banner
- **Priority:** Nice to have

### BUG-11: `features/INDEX.md` — Platzhalter-Zeile im Deployments-Abschnitt
- **Severity:** Low
- **Steps to Reproduce:**
  1. `features/INDEX.md:42` lesen: `- _v1.0.0 · 2026-01-31 · https://app.example.com · PROJ-1, PROJ-2_`
  2. Behauptet ein nie stattgefundenes Release; `/security-check` und `/audit` lesen diese Zeile als Eingabe
- **Priority:** Nice to have

## Summary
- **Acceptance Criteria:** 7/9 vollständig PASS (Code-Ebene), 2/9 mit BUG (AC-1, AC-6-Interaktion U-1); alle 9 zusätzlich `[!] NOT VERIFIED` zur Laufzeit
- **Edge Cases:** 3/5 PASS (EC-1 mit Folgefund, EC-4, EC-5), 1/5 BUG (EC-3), 1/5 NOT VERIFIED/verschoben (EC-2)
- **Bugs Found:** 11 total (0 critical, 1 high, 4 medium, 6 low)
- **Security:** 6/17 Checks verifiziert (davon 1 mit Low-Bug), 9 NOT VERIFIED (nicht anwendbar, kein Web-Surface), 2 NOT VERIFIED (fehlende Firmware-Toolchain hier) — keine Critical-/High-Sicherheitsfunde
- **Production Ready:** NO
- **Recommendation:** Vor `/deploy` beheben — insbesondere BUG-1 (High, Firmware kompiliert vermutlich nicht) und die drei Medium-Bugs, die reale Nutzungspfade betreffen (BUG-2, BUG-3, BUG-4). BUG-5 (fehlende Erklärung) ist eine direkte Spec-Abweichung. Danach `/build` erneut, dann `/qa` als Re-Verifikation mit Diff-Scope.

> "Production Ready: NO" — es gibt einen High- und vier Medium-Bugs, die vor dem Deploy behoben werden müssen. Zusätzlich wurde **kein** Laufzeit-Acceptance-Criterion tatsächlich beobachtet (`probe.kind: none`) — selbst nach den Bugfixes bräuchte "READY" entweder eine funktionierende Probe-Umgebung oder einen protokollierten menschlichen Test aller AC-1…AC-9.
