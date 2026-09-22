# QA Test Results

**Getestet:** 2026-09-22 (Erstlauf) · **Re-Verifikation:** 2026-09-22
**App-URL:** nicht lauffähig hier (`probe.kind: none`, App-Ebene und Layer `firmware` — kein Android-Emulator/-Gerät, kein PlatformIO-Toolchain). Jedes Laufzeit-AC ist `[!] NOT VERIFIED`, bis ein Mensch es testet (siehe unten).
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
- [x] PASS (Code), Rest-Low offen — `checking_permissions` rendert jetzt `PermissionRationale` ("Bluetooth-Zugriff nötig… um sich mit deinem Slider zu verbinden", `src/components/PermissionRationale.tsx:15-18`) statt des vorherigen `ScanningIndicator` (`src/screens/RootScreen.tsx:35-38`, BUG-5, Commit `8158480`).
- [ ] BUG (Low, Rest von BUG-5) — Die Erklärung erscheint *parallel* zum Systemdialog (derselbe Render-Zyklus wie der Mount-Effekt, `ConnectionProvider.tsx:58-67`), nicht zwingend *davor*; kein "Weiter"-Gate. Zusätzlich übergibt der Android-≤11-Pfad weiterhin kein Rationale-Objekt an `PermissionsAndroid.request` (`src/permissions/requestBlePermissions.ts:33-35`), obwohl RN das unterstützt. `[!] NOT VERIFIED` — Sichtbarkeit/Timing auf echtem Gerät, kein Renderer hier.

### AC-2: Automatischer Scan nach Berechtigungserteilung
- [x] PASS (Code) — unverändert seit Erstbericht; `connectionReducer.ts:81-83`, Scan-Effekt filtert auf Service-UUID (`ble/client.ts:69-71`, UUID identisch zu `firmware/src/ble.cpp:13`). Test: `ConnectionProvider.test.tsx:67-88`, Suite-Lauf grün.
- [!] NOT VERIFIED — realer Scan/Verbindungsaufbau, kein Emulator/Gerät

### AC-3: Erfolgreiche Verbindung → "Verbunden" + Gerätename, UI nutzbar
- [x] PASS (Code) — `connecting → CONNECT_SUCCEEDED → connected` inkl. `deviceName` (`connectionReducer.ts:121-127`); kein Bonding (`ble/client.ts:101-104`); Header „Verbunden" + Name (`ConnectionHeader.tsx:65-66, 87-89`); Content nicht gesperrt (`RootScreen.tsx:48-49`). **NEU-1 behoben:** die Verbindung bleibt jetzt tatsächlich bestehen, statt sich durch den eigenen Cleanup sofort wieder zu trennen (Commit `a0f372f`) — 2 rot-geprüfte Regressionstests (`ConnectionProvider.test.tsx`: „does not cancel a reconnect attempt that succeeds" und die `not.toHaveBeenCalled()`-Assertion in „cancels the native connection when the reconnect-loop effect is torn down").
- [!] NOT VERIFIED — reale Verbindung zur Laufzeit; „nutzbar" nur als „nicht gesperrt" prüfbar, echte Steuerungs-UI kommt erst mit PROJ-2/3

### AC-4: Scan-Timeout (10s) → "Kein Gerät gefunden" + Retry
- [x] PASS — unverändert seit Erstbericht, vom Diff nicht berührt. Test: `connectionReducer.test.ts:56-61`.

### AC-5: Bluetooth aus → Hinweis + Link zu Bluetooth-Einstellungen
- [x] PASS (Code) — Grundverhalten unverändert (`connectionReducer.ts:67-69`, `ConnectionHeader.tsx:54-57`). **NEU-2 behoben:** nach einer Berechtigungserteilung wird jetzt aktiv `bleManager.state()` geprüft, statt sich auf ein möglicherweise verpasstes `onStateChange`-Event zu verlassen — landet korrekt in `bluetooth_off`, wenn Bluetooth trotz erteilter Berechtigung noch aus ist (Commit `6808638`, Test „moves permission_denied -> bluetooth_off (not scanning) when Bluetooth is still off after granting", rot-geprüft).
- [!] NOT VERIFIED — echtes Ein-/Ausschalten von Bluetooth, echter Intent-Sprung

### AC-6: Berechtigung abgelehnt → Hinweis-Screen + Link zu App-Einstellungen
- [x] PASS — `PERMISSIONS_DENIED → permission_denied` (`connectionReducer.ts:84-86`); Hinweis-Screen + Button (`PermissionDeniedNotice.tsx`, `ConnectionHeader.tsx:49-52`). **BUG-2 behoben:** `permission_denied` ist jetzt sticky gegen `BLUETOOTH_OFF`, und ein `PERMISSIONS_DENIED`, das während `bluetooth_off` eintrifft, geht nicht mehr verloren (Commit `ecc9a8c`, Tests `connectionReducer.test.ts:79-84, 96-106`, rot-geprüft).

### AC-7: Unerwarteter Abbruch → Banner + UI gesperrt
- [x] PASS (Code), Low-Abweichung weiterhin offen — Disconnect → `reconnecting` sofort, UI gesperrt (`RootScreen.tsx:50-58, 89-93`). **BUG-10 weiterhin offen:** Banner sagt „Verbindung unterbrochen — verbinde automatisch neu…" (`ReconnectingBanner.tsx:15`), Spec verlangt „Verbindung verloren"; Header sagt „Verbindung verloren — verbinde neu…" (`ConnectionHeader.tsx:69`) — Inkonsistenz besteht fort, vom Diff nicht berührt.

### AC-8: Reconnect-Versuche alle 3s, max. 30s
- [x] PASS — unverändert. Test: `connectionReducer.test.ts:118-128`.
- [ ] BUG (Low, BUG-7, weiterhin offen) — bei `deviceRef.current === null` wird `RECONNECT_ATTEMPT_FAILED` synchron ohne 3s-Wartezeit dispatcht (`ConnectionProvider.tsx:155-158`, Zeilen durch die Fixes verschoben, Verhalten identisch zum Erstbericht) — vom Diff nicht behoben.

### AC-9: Bei mehreren Treffern automatisch zum ersten verbinden, keine Auswahl
- [x] PASS — unverändert. Test: `connectionReducer.test.ts:30-45`.

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

## Weitere Befunde dieser Re-Verifikation

### NEU-1: Selbst-Abbruch der gerade aufgebauten Verbindung — BEHOBEN
- Ursprünglich **Critical** — unabhängig von Security- und Regressions-Lane gefunden (siehe Commits oben). Der BUG-3-Fix rief in beiden Effekt-Cleanups (`ConnectionProvider.tsx`) `device.cancelConnection()` **bedingungslos** auf; da Cleanup auch beim *Erfolg* läuft (`CONNECT_SUCCEEDED`/`RECONNECT_SUCCEEDED` ändern `state.status`, was denselben Effekt abreißen lässt), kappte die App jede gerade aufgebaute Verbindung sofort wieder → Connect→Cancel→Disconnect→Reconnect-Endlosschleife, `reconnectAttemptsRemaining` wird bei jedem Erfolg zurückgesetzt, die Schleife hätte nie geendet. **Behoben in `a0f372f`** durch ein `settled`-Flag pro Effekt.

### NEU-2: Bluetooth-Status nach Berechtigungserteilung nicht neu geprüft — BEHOBEN
- Ursprünglich **Medium** — direkte Nebenwirkung von BUG-2s Fix (permission_denied sticky). **Behoben in `6808638`**, siehe AC-5.

### NEU-3: `REQUEST_SCAN` aus `connected` räumt keine bestehende Verbindung auf — BEHOBEN
- Ursprünglich **Low** (heute nicht real auslösbar, da der einzige Aufrufer die Verbindung schon als tot bestätigt hat) — **behoben in `6808638`** als Absicherung gegen einen künftigen Aufrufer, siehe EC-5.

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

- [!] Jede Laufzeit-Beobachtung zu AC-1…AC-9 und EC-1…EC-5 auf echtem Android-Gerät/Emulator — `probe.kind: none`, App-Ebene (Firmware-Kompilierung inzwischen menschlich verifiziert, siehe Security Audit oben)
- [!] Layer `firmware`: kein Testkommando hinterlegt (`.ai-eng-kit` → `layers[0].commands.test: null`) — weiterhin eine Frage an `/init`
- [!] EC-2 (Firmware-Sicherheits-Timeout) — verschoben auf PROJ-2/3, es gibt noch keine Fahrt
- [!] Layout, Touch-Targets, Statusfarben, Sichtbarkeit von `PermissionRationale` gegenüber dem Systemdialog — kein Renderer/Viewport hier
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
- **Acceptance Criteria:** 9/9 PASS auf Code-Ebene (0 offene Critical/High/Medium-Bugs auf AC-Ebene — der verbleibende AC-1-Rest ist Low); alle 9 zusätzlich `[!] NOT VERIFIED` zur Laufzeit
- **Edge Cases:** 4/5 PASS (EC-1, EC-4, EC-5 vollständig; EC-3 teilweise — Teil (b) bleibt Medium-Bug), 1/5 NOT VERIFIED/verschoben (EC-2)
- **Bugs in diesem Zyklus behoben:** 9 (1 Critical, 1 High, 3 Medium, 1 Medium-Teil, 2 Low, 1 Low-Nebeneffekt)
- **Bugs weiterhin offen:** 7, alle Low bis auf einen Medium-Rest (BUG-4 Teil b) — **keine Critical/High mehr offen**
- **Security:** 7/14 Checks in diesem Lauf verifiziert (davon 1 menschlich, s. o.), 8 NOT VERIFIED (nicht anwendbar oder fehlende Toolchain/Werkzeug) — 1 Low-Fund (BUG-6, unverändert offen), keine Critical-/High-Sicherheitsfunde
- **Menschliche Verifikation — Fortschritt:** ✅ Firmware-Kompilierung + Upload auf echtem ESP32 (`pio run -e esp32dev -t upload`, 2026-09-22, schließt BUG-1). Noch offen: App-Build auf dem Android-Handy und die 9-Punkte-AC-Checkliste (AC-1…AC-9).
- **Production Ready: NOT READY — not verified.** Kein Critical/High-Bug mehr offen, der Firmware-Build ist jetzt real bestätigt — aber `probe.kind: none` (Rest) bedeutet: **noch kein Acceptance Criterion auf der App-/BLE-Seite wurde auf echter Hardware beobachtet.** "Nichts gefunden, weil nichts laufen konnte" ist kein PASS.
- **Empfehlung:** Die verbleibenden 7 offenen Bugs sind alle Low bzw. ein eingegrenzter Medium-Teilaspekt (BUG-4b) — keiner davon blockiert für sich einen Deploy. Nächster Schritt zu **READY**: App bauen (`npx react-native run-android`) und die restlichen 8 Checklisten-Punkte (AC-1–AC-9, Firmware-Teil bereits erledigt) am echten Slider durchgehen, insbesondere AC-3/AC-7/AC-8 (NEU-1 betraf genau diese — die Verbindung muss tatsächlich *bestehen bleiben*).

> "Production Ready: NOT READY — not verified" heißt hier ausdrücklich **nicht** "es gibt Bugs" — alle Critical/High-Funde dieser Runde sind behoben. Es bedeutet: ohne den restlichen echten Testlauf (App + Gerät) ist "READY" noch nicht ehrlich zu vergeben. Der Firmware-Teil ist bereits real verifiziert.
