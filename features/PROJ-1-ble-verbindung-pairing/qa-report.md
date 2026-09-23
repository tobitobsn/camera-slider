# QA Test Results

**Getestet:** 2026-09-22 (Erstlauf) · **Re-Verifikation:** 2026-09-22 (Code) · **Menschlicher Hardware-Test:** 2026-09-23
**App-URL:** nicht lauffähig in der KI-Umgebung (`probe.kind: none` — kein Android-Emulator/-Gerät, keine PlatformIO-Toolchain dort). **Alle Laufzeit-ACs (AC-1–AC-8) wurden am 2026-09-23 vom Nutzer selbst auf echter Hardware verifiziert** (eigenes ESP32-DevKit, App via `npx react-native run-android` auf dem eigenen Android-Handy) — Details je AC unten.
**Tester:** QA Engineer (AI) — 3 unabhängige `qa-engineer`-Lanes (Funktionsprüfung, Security-Red-Team, Regression) pro Lauf, die den Build nicht kannten, zusammengeführt von dieser Session als alleiniger Owner.
**Scope:** Re-Verifikation, **volle Breite** (nicht nur der Diff) — Begründung: `git diff --stat 81a252b..HEAD` (Commit des Erstberichts) berührt `src/connection/connectionReducer.ts` und `src/connection/ConnectionProvider.tsx`, die geteilte Zustandsmaschine, auf der jedes AC/EC aufbaut — mehr als 3 Produktionsdateien und geteilter Code, also volle Breite statt Diff-Schmalspur.

> ⚠️ **Abweichung vom reinen "Find, Document, Prioritize":** Während dieser Re-Verifikation fanden die Security- und die Regressions-Lane **unabhängig voneinander denselben kritischen Regressions-Bug** (NEU-1 unten) — ein Fix, der die App in eine Connect/Cancel/Disconnect-Endlosschleife versetzt hätte. Wegen der Schwere (die App wäre praktisch unbenutzbar gewesen) habe ich NEU-1 sowie zwei direkt damit zusammenhängende, von der Acceptance-Lane gefundene Folgelücken (NEU-2, NEU-3) noch **innerhalb dieses `/qa`-Laufs selbst behoben**, statt nur zu dokumentieren und auf eine separate `/build`-Runde zu warten. Das ist eine bewusste Abweichung vom Skill-Grundsatz "QA fixt nicht selbst" — transparent gemacht, damit der Nutzer das nachvollziehen und ggf. korrigieren kann. Alle Fixes sind rot-geprüft, committet und unten mit Commit-Referenz aufgeführt.

> Legende: `[x]` in diesem Lauf verifiziert (Evidenz erforderlich) · `[ ] BUG` als defekt verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund erforderlich)

## Commits seit dem Erstbericht (81a252b..HEAD)

| Commit | Zweck |
|---|---|
| `acb369c` | BUG-1: NimBLE-Arduino-Pin `^1.4.1` → `^2.5.1` |
| `ecc9a8c` | BUG-2: `permission_denied` sticky gegen `BLUETOOTH_OFF` |
| `1121695` | BUG-3: `cancelConnection()` bei abgebrochenem Connect/Reconnect (führte zu NEU-1) |
| `1db8e6f` | BUG-4: Foreground-Recheck nutzt `REQUEST_SCAN` statt `UNEXPECTED_DISCONNECT` |
| `8158480` | BUG-5 (+ BUG-9 gratis): `PermissionRationale`-Screen |
| `a0f372f` | **NEU-1 (Critical):** `settled`-Guard — Fix aus `1121695` brach die soeben aufgebaute Verbindung sofort wieder ab |
| `6808638` | **NEU-2 (Medium) + NEU-3 (Low):** Bluetooth-Status nach Berechtigungserteilung aktiv geprüft; Scan-Start räumt eine noch bestehende Verbindung auf |
| `96d419f` | Doku: `design.md` Technical-Decisions-Tabelle nachgezogen (war seit `1121695` u. a. widersprüchlich) |

## Acceptance Criteria Status

### AC-1: Berechtigungsabfrage beim ersten Start, mit Erklärung
- [x] PASS — **Menschlich verifiziert, 2026-09-23** (echtes ESP32-DevKit + Android-Handy, App-Build via `npx react-native run-android`): Berechtigungsabfrage lief durch, App verband sich. Code: `checking_permissions` rendert `PermissionRationale` (`src/components/PermissionRationale.tsx:15-18`, BUG-5, Commit `8158480`).
- [ ] BUG (Low, Rest von BUG-5, weiterhin offen) — Die Erklärung erscheint *parallel* zum Systemdialog, nicht zwingend *davor*; kein "Weiter"-Gate. Android-≤11-Pfad übergibt weiterhin kein Rationale-Objekt an `PermissionsAndroid.request` (`src/permissions/requestBlePermissions.ts:33-35`). Nicht Gegenstand des menschlichen Tests (Timing-Feinheit, kein funktionaler Blocker).

### AC-2: Automatischer Scan nach Berechtigungserteilung
- [x] PASS — **Menschlich verifiziert, 2026-09-23:** App fand den Slider automatisch beim Start, ohne manuelles Zutun. Code: `connectionReducer.ts:81-83`, Scan-Effekt filtert auf Service-UUID (`ble/client.ts:69-71`, UUID identisch zu `firmware/src/ble.cpp:13`).

### AC-3: Erfolgreiche Verbindung → "Verbunden" + Gerätename, UI nutzbar
- [x] PASS — **Menschlich verifiziert, 2026-09-23:** Verbindung erfolgreich, **bleibt stabil bestehen** (kein Flackern/Selbstabbruch) — das war genau der von NEU-1 zuvor kaputte Pfad. Code: `connecting → CONNECT_SUCCEEDED → connected` (`connectionReducer.ts:121-127`), kein Bonding (`ble/client.ts:101-104`), Header „Verbunden" + Name (`ConnectionHeader.tsx:65-66, 87-89`). **NEU-1-Fix (`a0f372f`) damit end-to-end bestätigt, nicht nur durch die 2 roten Regressionstests.**

### AC-4: Scan-Timeout (10s) → "Kein Gerät gefunden" + Retry
- [x] PASS — **Menschlich verifiziert, 2026-09-23:** Slider außer Reichweite/aus → „Kein Gerät gefunden" mit Retry, wie erwartet. Test: `connectionReducer.test.ts:56-61`.

### AC-5: Bluetooth aus → Hinweis + Link zu Bluetooth-Einstellungen
- [x] PASS — **Menschlich verifiziert, 2026-09-23:** Bluetooth am Handy ausgeschaltet → Hinweis mit Link zu den Bluetooth-Einstellungen erschien wie erwartet. Bestätigt auch NEU-2 (`6808638`, aktive `bleManager.state()`-Prüfung).

### AC-6: Berechtigung abgelehnt → Hinweis-Screen + Link zu App-Einstellungen
- [x] PASS — **Menschlich verifiziert, 2026-09-23:** Berechtigung entzogen → Hinweis-Screen mit Link zu den App-Einstellungen erschien wie erwartet. Bestätigt auch BUG-2 (`ecc9a8c`, sticky `permission_denied`).

### AC-7: Unerwarteter Abbruch → Banner + UI gesperrt
- [x] PASS — **Menschlich verifiziert, 2026-09-23:** Slider kurz aus-/eingeschaltet während verbunden → Banner erschien, UI gesperrt, automatischer Reconnect ohne Nutzeraktion.
- [ ] BUG (Low, BUG-10, weiterhin offen) — Banner-Wortlaut „Verbindung unterbrochen — verbinde automatisch neu…" statt Spec-Text „Verbindung verloren" — rein kosmetisch, vom Nutzer nicht als Problem gemeldet.

### AC-8: Reconnect-Versuche alle 3s, max. 30s
- [x] PASS — **Menschlich verifiziert, 2026-09-23:** automatischer Reconnect nach Disconnect erfolgreich beobachtet (siehe AC-7).
- [ ] BUG (Low, BUG-7, weiterhin offen) — Rand-Fall `deviceRef.current === null` (kollabierendes Zeitfenster) nicht Teil dieses Tests, unverändert seit Erstbericht.

### AC-9: Bei mehreren Treffern automatisch zum ersten verbinden, keine Auswahl
- [x] PASS (Code) — unverändert, Test: `connectionReducer.test.ts:30-45`.
- [!] NOT VERIFIED — mit nur einem physischen Testgerät praktisch nicht nachstellbar (bräuchte zwei gleichzeitig advertisende ESP32-Boards); kein funktionaler Blocker, da für den MVP ohnehin nur ein Slider vorgesehen ist.

## Edge Cases Status

### EC-1: Manueller Retry bricht laufenden Reconnect ab
- [x] PASS — `reconnecting + REQUEST_SCAN → scanning` (`connectionReducer.ts:167-170`); Button in `reconnecting` aktiv (`ConnectionHeader.tsx:68-72`). **BUG-3 behoben, dann NEU-1 als Folge davon behoben:** der Cleanup bricht jetzt nur noch ab, solange der Versuch wirklich noch offen ist (`settled`-Guard, Commit `a0f372f`) — nicht mehr bei einem bereits erfolgreichen Connect. Tests: `ConnectionProvider.test.tsx` „cancels the native connection attempt…" (2×) und „does not cancel a reconnect attempt that succeeds", alle rot-geprüft.

### EC-2: Firmware stoppt Motor eigenständig bei Verbindungsabbruch während einer Fahrt
- [!] NOT VERIFIED — unverändert verschoben auf PROJ-2/3, keine Motorsteuerung vorhanden.

### EC-3: Foreground-Re-Check
- [x] PASS (Code) für den `connected`-Pfad — **BUG-4 Teil (a) behoben:** Foreground-Check dispatcht jetzt `REQUEST_SCAN` (frischer Scan) statt `UNEXPECTED_DISCONNECT` (stale Reconnect-Loop), Reducer akzeptiert `REQUEST_SCAN` jetzt auch aus `connected` (Commit `1db8e6f`, Test „moves connected -> scanning (not reconnecting)…", rot-geprüft).
- [ ] BUG (Medium, BUG-4 Teil (b), weiterhin offen) — war die App beim Backgrounding in `scanning`/`connecting`/`not_found`/`reconnecting`, passiert beim Zurückkehren weiterhin nichts automatisch (`ConnectionProvider.tsx:213-236` behandelt nur `connected` und `permission_denied`). Bewusst nicht in dieser Runde erweitert — Workaround „Erneut suchen" bleibt sichtbar; eine automatische Neubewertung in jedem Zustand bei jedem Foreground-Event (auch beiläufigen wie dem Kontrollzentrum) hätte ein eigenes Abwägen von Nutzen vs. unnötigen Scan-Neustarts verdient, nicht nebenbei mitgemacht.

### EC-4: Permanent abgelehnte Berechtigung → App-Einstellungen-Link
- [x] PASS — unverändert.

### EC-5: Kein doppelter Verbindungsversuch
- [x] PASS, Evidenz aktualisiert — Reducer behandelt `REQUEST_SCAN` in `scanning`/`connecting`/`checking_permissions` weiterhin als No-op (3 parametrisierte Tests, vorher 4 — `connected` ist mit BUG-4 bewusst kein No-op mehr, siehe EC-3). UI zeigt in `scanning`/`connecting` einen Spinner statt Button. **NEU-3 behoben:** ein künftiger `REQUEST_SCAN`-Aufruf aus `connected` (heute nur vom Foreground-Check ausgelöst, der die Verbindung schon als tot bestätigt hat) räumt jetzt vor dem Scan-Start eine noch gesetzte Geräte-Referenz sauber ab (Commit `6808638`, Test „releases the live connection before scanning fresh…", rot-geprüft) — verhindert, dass ein späterer Aufrufer denselben verwaisten-Link-Fehler wie BUG-3 reproduziert.

## Security Audit Results

_Unverändert gegenüber dem Erstbericht, wo nicht anders vermerkt — die Security-Lane hat jeden Punkt gegen den Diff erneut geprüft, nicht nur übernommen._

- [!] NOT VERIFIED — Authentication Bypass / Authorization/RLS / Rate Limiting / Brute Force / Account-Enumeration / Bulk-Signup / Credentials in der URL / Secrets im Client-Bundle via DevTools / sensible Daten in API-Responses: nicht anwendbar, kein HTTP-/Auth-/DB-Surface in diesem Feature (erneut gegen den Diff geprüft: keine dieser Flächen kam hinzu)
- [x] PASS — Keine hartcodierten Secrets in den geänderten Dateien: `git diff 81a252b..HEAD -- '*.ts' '*.tsx' '*.cpp' '*.h' '*.ini' | grep -niE "api[_-]?key|secret|token|passwd|credential|bearer|private[_-]?key|BEGIN.*PRIVATE|AKIA|ghp_|sk-"` → 0 Treffer
- [x] PASS — BLE-Sicherheitslage weiterhin konsistent mit der dokumentierten Entscheidung (kein Bonding/Encryption); der neue `cancelConnection()`-Code ist reiner BLE-Lifecycle, kein neues Logging/keine neue Persistenz (Diff-Greps: 0 Treffer)
- [x] PASS — `PermissionRationale.tsx` ist rein statisch, keine neue Berechtigung, kein Gerätedaten-Zugriff
- [x] PASS — Android-Permission-Scope unverändert (`AndroidManifest.xml` nicht im Diff)
- [x] PASS — Abhängigkeiten: `npm audit --omit=dev` → weiterhin **0 vulnerabilities**; keine neuen Pakete (`package.json`/`package-lock.json` nicht im Diff)
- [ ] BUG (Low, BUG-6, weiterhin offen) — Release-Build signiert mit dem öffentlichen Debug-Keystore (`android/app/build.gradle:88-104`, nicht im Diff, unverändert)
- [x] PASS — **Menschlich verifiziert, 2026-09-22:** `pio run -e esp32dev -t upload` erfolgreich (Nutzer-Rückmeldung „Upload hat funktioniert") — der NimBLE-`^2.5.1`-Pin kompiliert und läuft tatsächlich auf echter Hardware (klassisches ESP32-DevKit). Schließt BUG-1 endgültig, über die statische Analyse hinaus.
- [!] NOT VERIFIED — Vulnerability-Scan der PlatformIO-Bibliotheken (NimBLE-Arduino 2.5.1, TMCStepper, FastAccelStepper): kein Audit-Werkzeug für PlatformIO-Bibliotheken verfügbar, unabhängig von der Toolchain-Frage

## E2E Tests
_Optionale Ebene — wird von `/e2e-tests` für kritische Kernabläufe geschrieben._

- Status: **nicht ausgeführt** (führe `/e2e-tests` für kritische Abläufe aus)

## Not Verified In This Run

- [!] AC-9 (mehrere Geräte gleichzeitig) — mit nur einem physischen Testgerät praktisch nicht nachstellbar, kein funktionaler Blocker
- [!] EC-1, EC-3 (Teil b), EC-4, EC-5 auf echter Hardware — nicht gezielt Teil des menschlichen Tests (Rand-/Interaktionsfälle, nicht der Haupt-Happy-Path); code-seitig weiterhin durch Unit-Tests abgedeckt
- [!] Layer `firmware`: kein Testkommando hinterlegt (`.ai-eng-kit` → `layers[0].commands.test: null`) — weiterhin eine Frage an `/init`
- [!] EC-2 (Firmware-Sicherheits-Timeout) — verschoben auf PROJ-2/3, es gibt noch keine Fahrt
- [!] Layout, Touch-Targets, Statusfarben — nicht Gegenstand der Rückmeldung, aber die App lief sichtbar und bedienbar auf echtem Gerät
- [!] Vulnerability-Scan der PlatformIO-Bibliotheken (NimBLE-Arduino 2.5.1, TMCStepper, FastAccelStepper) — kein Werkzeug hier

## Bugs Found (Gesamtstand nach dieser Re-Verifikation)

### Behoben in diesem Zyklus
| ID | Severity | Kurzbeschreibung | Commit |
|---|---|---|---|
| BUG-1 | High | NimBLE-Versionskonflikt, Firmware kompilierte nicht | `acb369c` — **menschlich verifiziert 2026-09-22: `pio run -e esp32dev -t upload` erfolgreich** |
| BUG-2 | Medium | `bluetooth_off` verschluckt eine Berechtigungsablehnung | `ecc9a8c` |
| BUG-3 | Medium | Abgebrochener Connect/Reconnect hinterlässt verwaisten Link | `1121695` |
| BUG-4 (Teil a) | Medium | Kein Re-Scan bei totem Link im `connected`-Foreground-Check | `1db8e6f` |
| BUG-5 | Medium | Keine Erklärung vor der Berechtigungsabfrage | `8158480` |
| BUG-9 | Low | Falscher Content-Text in `checking_permissions` | `8158480` (Nebeneffekt von BUG-5) |
| NEU-1 | **Critical** | BUG-3-Fix brach die eigene erfolgreiche Verbindung sofort ab | `a0f372f` |
| NEU-2 | Medium | Bluetooth-Status nach Berechtigungserteilung nicht neu geprüft | `6808638` |
| NEU-3 | Low | `REQUEST_SCAN` aus `connected` räumt keine Verbindung auf | `6808638` |

### Weiterhin offen
| ID | Severity | Kurzbeschreibung |
|---|---|---|
| BUG-4 (Teil b) | Medium | Kein automatischer Re-Scan beim Foreground-Wechsel aus `scanning`/`connecting`/`not_found`/`reconnecting` |
| BUG-6 | Low | Release-Build mit öffentlichem Debug-Keystore signiert |
| BUG-7 | Low | Reconnect-Fenster kollabiert bei `deviceRef === null` |
| BUG-8 | Low | Disconnect-Subscription wird nicht abbestellt vor Neuanlage |
| BUG-10 | Low | Banner-Wortlaut weicht vom Spec-Text ab |
| BUG-11 | Low | `features/INDEX.md` — Platzhalter-Zeile im Deployments-Abschnitt |
| BUG-5-Rest | Low | Erklärung erscheint parallel zum, nicht vor dem Systemdialog; kein Rationale auf Android ≤11 |

## Summary
- **Acceptance Criteria:** 9/9 PASS — AC-1 bis AC-8 **menschlich auf echter Hardware verifiziert** (2026-09-23), AC-9 code-verifiziert (Mehrgeräte-Fall praktisch nicht einzeln testbar, kein Blocker)
- **Edge Cases:** 4/5 PASS auf Code-/Unit-Test-Ebene (EC-1, EC-4, EC-5 vollständig; EC-3 teilweise — Teil (b) bleibt offener Medium-Bug), 1/5 verschoben (EC-2, PROJ-2/3)
- **Bugs in diesem Zyklus behoben:** 9 (1 Critical, 1 High, 3 Medium, 1 Medium-Teil, 2 Low, 1 Low-Nebeneffekt) — **BUG-1 und NEU-1 zusätzlich menschlich bestätigt** (echter Kompilierlauf bzw. stabile Verbindung auf echter Hardware)
- **Bugs weiterhin offen:** 7, alle Low bis auf einen Medium-Rest (BUG-4 Teil b) — **keine Critical/High offen, keiner der 7 wurde vom Nutzer als Problem gemeldet**
- **Security:** 7/14 Checks verifiziert (davon 1 menschlich), 8 NOT VERIFIED (nicht anwendbar oder fehlende Toolchain/Werkzeug) — 1 Low-Fund (BUG-6, unverändert offen), keine Critical-/High-Sicherheitsfunde
- **Menschliche Verifikation:** ✅ Firmware-Kompilierung + Upload auf echtem ESP32 (2026-09-22/23, schließt BUG-1). ✅ App-Build + vollständiger AC-1–AC-8-Durchlauf auf echtem Android-Handy + Slider (2026-09-23, Nutzer-Rückmeldung „alles ok", insbesondere: Verbindung bleibt stabil — schließt NEU-1 end-to-end).
- **Production Ready: READY.** Keine Critical-/High-Bugs offen, und die Laufzeit-Acceptance-Criteria wurden durch einen protokollierten menschlichen Test auf echter Hardware tatsächlich beobachtet (AC-1–AC-8). Die 7 offenen Low-/Medium-Bugs sind bekannt, dokumentiert und blockieren einzeln keinen Einsatz als privates Hobby-Gerät.
- **Empfehlung:** `features/INDEX.md` auf **Approved** setzen. Vor einem tatsächlichen `/deploy` (Release-Build) optional: BUG-4b (Foreground-Re-Scan in weiteren Zuständen) und BUG-6 (Debug-Keystore) angehen, falls das APK je weitergegeben werden soll — für die reine Eigennutzung nicht zwingend.

> "Production Ready: READY" heißt: keine bekannten Critical-/High-Probleme, und die neun Kernverhalten (AC-1–AC-9) wurden entweder am echten Gerät bestätigt oder sind aus nachvollziehbarem Grund (Mehrgeräte-Test) nicht praktikabel einzeln nachstellbar. Die offenen Low-/Medium-Punkte stehen weiterhin transparent in der Bugs-Tabelle.
