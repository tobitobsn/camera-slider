# QA Test Results

**Tested:** 2026-09-26
**App URL:** nicht ausführbar hier (`probe.kind: none`, App-Ebene und Layer `firmware`) — jedes Laufzeit-AC ist unten `[!] NOT VERIFIED`, bis ein Mensch es am echten Slider testet
**Tester:** QA Engineer (AI) — drei unabhängige `qa-engineer`-Lanes (Akzeptanz, Security, Regression), zusammengeführt vom Owner
**Scope:** `full` (erster `/qa`-Lauf für PROJ-5, HEAD `7f89606` auf `feat/PROJ-5-zeitraffer-modus`)

> Legende: `[x]` in diesem Lauf verifiziert (Beleg nötig) · `[ ] BUG` als kaputt verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund nötig)

## Vorbemerkung zur Methode

`probe.kind: none` gilt sowohl auf App-Ebene als auch im Layer `firmware` — es gab nichts zu starten und nichts live abzufragen. Alle Befunde stammen aus Quellcode-Inspektion (App: `src/components/useTimelapseSequence.ts`, `TimelapseControls.tsx`, `useCameraCapture.ts`, `useKeepAwake.ts`, `RootScreen.tsx`, `AutoDriveControls.tsx`, `JogControls.tsx`, `src/ble/client.ts`; Firmware: `firmware/src/{motor,ble,main}.{h,cpp}`; `android/app/src/main/AndroidManifest.xml`) und aus dem einmaligen Testsuite-Lauf des Owners vor dem Fan-out. Die drei Lanes selbst haben keine Suite erneut ausgeführt, nur einzelne Dateien gelesen — zwei der drei Critical-Bugs (BUG-1, BUG-2) wurden von mehreren Lanes unabhängig gefunden, ein drittes (BUG-3) wurde vom Owner selbst gegengeprüft (Android-Manifest gelesen).

## Automatisierte Tests (Step 5)

- **App-Suite** (`npm test`) — PASS — **12 Suites, 182 Tests, 0 fehlgeschlagen**, Lauf gegen HEAD `7f89606`.
- **`tsc --noEmit`** — PASS, exit 0.
- **Firmware-Layer** — `[!] NOT VERIFIED — no test command recorded for layer firmware` (`commands.test: null`). Ersatzweise: `pio run -e esp32dev` → `[SUCCESS]` (RAM 12,4 %, Flash 49,0 %) — belegt nur, dass die Firmware baut, nicht ihr Verhalten. **Wichtig:** ein erfolgreicher Build erkennt BUG-1 (fehlender `loop()`-Aufruf) nicht — der Code kompiliert korrekt, er wird nur nie ausgeführt.
- **E2E-Suite** — nicht vorhanden, übersprungen.

## Acceptance Criteria Status

#### AC-1: Zeitraffer-Sequenz läuft (erste Aufnahme sofort, dann N−1 Schritte)
- [ ] **FAIL** — mehrere Critical-Bugs verhindern, dass eine Sequenz mit ≥2 Aufnahmen jemals fertig läuft. Siehe BUG-1, BUG-2, BUG-3, BUG-5, BUG-6 unten.
- Code-Kette für die reine Zielpositions-Berechnung ist korrekt: `Math.round(totalDistanceSteps * (i-1)/(shotCount-1))` (`useTimelapseSequence.ts:311-313`) landet beim letzten Schritt exakt auf der vollen Distanz — von zwei Lanes unabhängig nachgerechnet.

#### AC-2: Automatische Rückfahrt zum Start nach der letzten Aufnahme
- [ ] **FAIL** — durch BUG-1 verweigert `motorAutoDrive()` die Rückfahrt dauerhaft (`motor.cpp:353`, `timelapseMoving` bleibt hängen), die App meldet aber trotzdem Erfolg (BUG-10: keine Bestätigung der Rückfahrt abgewartet).

#### AC-3: Fortschrittsanzeige ("Aufnahme X von Y" + Restzeit)
- [x] Code-verifiziert: `TimelapseControls.tsx:239-246` (Anzeige) + `useTimelapseSequence.ts:344-345` (Zustandsführung).
- [!] NOT VERIFIED (Laufzeit-Rendering) — no way to run and probe this project was recorded.
- Low-Fund: Restzeit wird nur pro Aufnahme aktualisiert, kein laufender Countdown — kosmetisch, keine AC-Verletzung.

#### AC-4: Manueller Stopp — sofort, keine Rückfahrt
- [x] Code-verifiziert: `stop()` erhöht eine `runId`-Ref und sendet STOP ohne Rückfahrt (`useTimelapseSequence.ts:418-438`); jeder `await` in der laufenden Schleife prüft die `runId` danach erneut, bevor er fortfährt (Zeilen 287/321/327/333/340/351) — ein `stop()` mitten in einem Schritt kann die Rückfahrt am Ende nicht mehr erreichen. Firmware setzt `autoDriving`/`timelapseMoving` in `motorStop()` zurück (`motor.cpp:286,291`). Test: `useTimelapseSequence.test.ts:250`.
- [!] NOT VERIFIED (Laufzeit) — no way to run and probe this project was recorded.

#### AC-5: Kamera-Berechtigung fehlt → Hinweis, Start blockiert
- [ ] **FAIL (Critical)** — siehe BUG-3: `android.permission.CAMERA` fehlt komplett im Manifest, die Laufzeit-Anfrage wird von Android ohne Dialog sofort abgelehnt. Der Start bleibt dadurch dauerhaft (nicht nur bis zur Erlaubnis) gesperrt — die App kann die Berechtigung nie bekommen. Zusätzlich BUG-9 (Medium): kein Verweis auf die Systemeinstellungen bei dauerhaft abgelehnter Berechtigung.
- Code für die Sperre selbst korrekt: `TimelapseControls.tsx:131`.

#### AC-6: Aufnahmefehler stoppt Sequenz sofort mit Fehlermeldung
- [ ] **FAIL (teilweise, Medium)** — Stopp der Sequenz und Fehleranzeige sind vorhanden (`useTimelapseSequence.ts:282,336`, `TimelapseControls.tsx:256`), aber es wird **kein STOP-Kommando an die Firmware gesendet** (BUG-7) — der Schlitten kann bei einem Fehler mitten in der Bewegung weiterfahren, statt „an der aktuellen Position anzuhalten", wie AC-6 verlangt.

#### AC-7: Verbindungsabbruch stoppt die Sequenz
- [ ] **FAIL (Medium)** — die Firmware stoppt bei Verbindungsabbruch sofort (`ble.cpp:125-127`, unverändert seit PROJ-3), aber die App erkennt den Abbruch erst beim Start des NÄCHSTEN Schritts (BUG-8) — bis zu ein volles Intervall (max. 3600s) lang bleibt `isRunning` true und der Wakelock aktiv, obwohl die Firmware längst gestoppt hat.

#### AC-8: Bildschirm bleibt während der Sequenz wach
- [x] Code-verifiziert: `activate()` bei Sequenzstart (`useTimelapseSequence.ts:405`), `deactivate()` in `finishRun()` — deckt Erfolg UND jeden Fehlerpfad ab (Zeile 264) — sowie in `stop()` (Zeile 438).
- [!] NOT VERIFIED (tatsächliches Wachbleiben des Bildschirms) — no way to run and probe this project was recorded.
- Einschränkung durch BUG-8: bei verzögerter Abbruch-Erkennung bleibt der Wakelock länger aktiv als nötig.

#### AC-9: Gegenseitige Sperre Zeitraffer ↔ Auto-Fahrt (beide Richtungen)
- [x] Code-verifiziert, App-Ebene: `RootScreen.tsx:90-91` (Jog/AutoDrive gesperrt bei `timelapse.isRunning`), `AutoDriveControls.tsx:256,281` (`lockedByOtherMode`/`autoDriveBaseEnabled`), `TimelapseControls.tsx:130` (`!status.driving`).
- [x] Code-verifiziert, Firmware-Ebene (Verteidigung in der Tiefe): `motorAutoDrive()` verweigert bei `timelapseMoving` (`motor.cpp:353`), `motorTimelapseMoveTo()` verweigert bei `autoDriving` (`motor.cpp:467-468`).
- [!] NOT VERIFIED (Laufzeit) — no way to run and probe this project was recorded.
- **BUG-4 (High)** — siehe unten: `motorJog()` prüft `timelapseMoving` NICHT (nur `autoDriving`, `motor.cpp:228`) — eine Lücke in genau derselben Verteidigungslinie, die für Auto-Fahrt bereits besteht.

#### AC-10: Aufnahmen landen in der normalen Foto-Galerie
- [ ] **FAIL (Critical)** — blockiert durch BUG-2 und BUG-3; der Speicher-Code selbst ist korrekt (`useCameraCapture.ts:65`, `CameraRoll.save()`), wird aber wegen der vorgelagerten Bugs nie erfolgreich erreicht.

## Edge Cases

#### EC-1: Start=Ende blockiert Sequenzstart
- [x] Code-verifiziert: `TimelapseControls.tsx:123-124`. Low: kein eigener Hinweistext wie bei `AutoDriveControls`, Button ist einfach deaktiviert (spec.md verlangt nur die Blockade, keine bestimmte UI).

#### EC-2: Grenzwerte 2–999 Aufnahmen / 1–3600s Intervall
- [x] Code-verifiziert und getestet: `TimelapseControls.tsx:30-50,114-115,194-216`, Grenzwert-Tests `TimelapseControls.test.ts:32-121`.

#### EC-3: Aufnahmefehler durch manuelle Bildschirmsperre → gleicher Fehlerpfad wie jeder andere Aufnahmefehler
- [!] **NOT VERIFIED** — der Fehlerpfad selbst existiert (`useTimelapseSequence.ts:161-167`), aber `capturePhoto()` hat keinen eigenen Timeout (BUG-11, Low) — hängt die native Aufnahme (z. B. weil die App durch die Sperre pausiert wurde), hängt die ganze Sequenz unbegrenzt statt in den Fehlerpfad zu laufen. Nicht auf Hardware geprüft.

#### EC-4: Kein automatisches Fortsetzen nach Verbindungsabbruch
- [x] Code-verifiziert (indirekt): ein `TIMELAPSE_MOVE` nach einem Reconnect wird von der Firmware ohnehin verworfen, da `motorClearPoints()` beim Reconnect `hasStart` zurücksetzt (`ble.cpp:87-88`) und `motorTimelapseMoveTo()` `hasStart` verlangt (`motor.cpp:468`).
- Einschränkung durch BUG-8: die App selbst könnte durch die verzögerte Abbruch-Erkennung noch versuchen, einen Befehl zu senden, bevor sie den Abbruch bemerkt — der geht dann einfach ins Leere, kein Datenverlust, aber unsauber.

## Zusätzliche Befunde (nicht in spec.md, während der Verifikation gefunden)

### BUG-1 — `motorTimelapseMoveCheck()` wird nie aufgerufen (Critical)
**Wo:** `firmware/src/main.cpp:45-49` (`loop()`) ruft nur `motorWatchdogCheck()`, `motorAutoDriveCheck()`, `bleNotifyStatusIfChanged()` auf. `firmware/src/motor.h:185` sagt es selbst: „Call from loop() (main.cpp — not wired up by this change, see T4)".
**Befund:** Das ist eine Lücke in der Aufgabenplanung des Owners, keiner der Build-Sub-Agenten: T1s Auftrag (Firmware-Bewegungslogik) schloss `main.cpp` explizit aus („das ist NICHT dein Task"), und T4s Auftrag (BLE-Verdrahtung) deckte nur `ble.cpp` ab — kein Task hat je `main.cpp`s `loop()` um den Aufruf ergänzt, den `motorAutoDriveCheck()` als direktes Vorbild längst hat.
**Auswirkung:** `timelapseMoving` wird nach dem ersten `TIMELAPSE_MOVE` nie wieder auf `false` gesetzt, bis ein STOP kommt. Kaskadierend: (a) die App wartet 15s auf `timelapseMoving=false`, bekommt es nie, jede Sequenz mit ≥2 Aufnahmen bricht spätestens bei Schritt 2 ab (AC-1); (b) `motorAutoDrive()` verweigert danach jede normale Auto-Fahrt, auch die Rückfahrt aus AC-2, bis zum nächsten STOP; (c) `motorWatchdogCheck()` steigt dauerhaft vorzeitig aus (`motor.cpp:298`) — der Jog-Totmannschalter aus PROJ-2 ist damit faktisch abgeschaltet, bis irgendein STOP kommt.
**Empfehlung:** `motorTimelapseMoveCheck();` in `firmware/src/main.cpp`s `loop()` ergänzen, direkt neben `motorAutoDriveCheck();` — eine Zeile, gleiches Muster.

### BUG-2 — Zwei unabhängige `useCameraCapture()`-Aufrufe, zwei getrennte Foto-Ausgaben (Critical)
**Wo:** `src/components/useTimelapseSequence.ts:227` und `src/components/TimelapseControls.tsx:103` rufen `useCameraCapture()` je für sich auf.
**Befund:** `usePhotoOutput()` (react-native-vision-camera) erzeugt bei jedem Aufruf eine neue, eigene Instanz. Nur die Instanz aus `TimelapseControls` wird tatsächlich an `<Camera outputs={[photoOutput]} />` angehängt (`TimelapseControls.tsx:164`). Die Sequenzsteuerung (`useTimelapseSequence`) besitzt eine komplett andere, nie angehängte Instanz und löst über diese aus.
**Auswirkung:** Die erste Aufnahme scheitert voraussichtlich bereits mit einem Fehler der nativen Bibliothek („Photo Output is not yet attached to the CameraSession"). Die bestehenden Tests mocken `useCameraCapture` komplett und sehen diesen Fehler nicht — eine reine Integrationslücke zwischen zwei parallel gebauten Tasks (T5/T7), die keine der beiden Unit-Test-Suiten für sich allein hätte finden können.
**Empfehlung:** `useCameraCapture()` darf nur EINMAL aufgerufen werden. Sauberster Fix: wie bei `useTimelapseSequence(device)` selbst (siehe `RootScreen.tsx`s Kommentar zum Zustands-Lifting) — `RootScreen` ruft `useCameraCapture()` einmal auf und reicht das Ergebnis sowohl an `TimelapseControls` (für die Vorschau) als auch implizit an `useTimelapseSequence` durch (z. B. als Parameter statt eines internen Hook-Aufrufs).

### BUG-3 — Kamera-Berechtigung `android.permission.CAMERA` fehlt im Manifest (Critical)
**Wo:** `android/app/src/main/AndroidManifest.xml:3-6` deklariert nur `INTERNET`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION` — keine `CAMERA`-Berechtigung, auch in keinem Library-Manifest gefunden.
**Befund:** Ohne die Manifest-Deklaration lehnt Android die Laufzeit-Berechtigungsanfrage sofort und ohne Dialog ab. `hasPermission` bleibt dauerhaft `false`, der Start-Button aus AC-5 bleibt für immer gesperrt — nicht nur „bis der Nutzer zustimmt", sondern strukturell unerreichbar.
**Auswirkung:** Das gesamte Feature ist ohne diesen Fix nicht benutzbar, unabhängig von allen anderen Fixes.
**Empfehlung:** `<uses-permission android:name="android.permission.CAMERA" />` in `AndroidManifest.xml` ergänzen. Zusätzlich (Low, siehe „Auch bemerkt"): je nach `minSdkVersion` eventuell `WRITE_EXTERNAL_STORAGE` für sehr alte Android-Versionen prüfen.

### BUG-4 — `motorJog()` prüft `timelapseMoving` nicht (High)
**Wo:** `firmware/src/motor.cpp:228` — Guard lautet `if (stepper == nullptr || autoDriving)`, ohne `timelapseMoving`.
**Befund:** Die für Auto-Fahrt bereits bestehende Verteidigungslinie (kein Jog während einer anderen Bewegungsart) wurde für die neue Zeitraffer-Bewegungsart nicht nachgezogen. Kombiniert mit BUG-1 (hängendes `timelapseMoving`): nach einer abgebrochenen Sequenz ist Jog in der UI zwar noch bis zum nächsten Statuswechsel gesperrt, aber sobald es wieder freigegeben wird, läuft der erste Jog ohne Watchdog-Schutz — bei einer Schiene ohne Endanschläge ein Sicherheitsrisiko.
**Empfehlung:** `motorJog()`s Guard um `|| timelapseMoving` ergänzen, analog zu `motorAutoDrive()`s bestehender Erweiterung.

### BUG-5 — Fester Ankunfts-Timeout (15000ms) zu kurz für lange Bewegungen (High)
**Wo:** `src/components/useTimelapseSequence.ts:52` (`TIMELAPSE_MOVE_ARRIVE_TIMEOUT_MS = 15000`).
**Befund:** Bei der maximal plausiblen Distanz (76800 Steps) und maximaler Geschwindigkeit (4000 Steps/s) dauert eine einzelne Bewegung ca. 19,7s (76800/4000 + Beschleunigungszeit) — über dem festen Timeout. Unabhängig von BUG-1: selbst wenn BUG-1 behoben ist, scheitern lange Einzelschritte (grob über ~58000 Steps, ≈362mm bei diesem Projekt) weiterhin am Timeout.
**Empfehlung:** Timeout entweder deutlich großzügiger fassen (z. B. 25-30s als fester Wert) oder aus der tatsächlichen Schrittdistanz ableiten (ähnlich wie `AutoDriveControls`s Geschwindigkeitsformel).

### BUG-6 — Möglicher Notify-Verlust zwischen Write-Antwort und Subscription (High, Verdacht — nicht auf Hardware verifiziert)
**Wo:** `src/components/useTimelapseSequence.ts` — `waitForStatusCondition` (Warten auf `timelapseMoving: true`) wird erst NACH der Rückkehr von `sendTimelapseMoveCommand()` abonniert (Zeile ~186, nach Zeile ~181).
**Befund:** Analog zu PROJ-4s BUG-5-Erfahrung: kommt die firmwareseitige Notify für `timelapseMoving: true` bereits an, bevor die App-seitige Subscription registriert ist, geht sie verloren, und die App wartet fälschlich in den 2000ms-Timeout. Die bestehenden Tests decken diese Race nicht ab (sie senden das Ereignis erst nachträglich).
**Empfehlung:** Vor `/deploy` am echten Gerät gezielt testen (schnelle, kurze Bewegungen, bei denen die Notify besonders knapp vor der Subscription ankommen könnte). Falls reproduzierbar: Subscription VOR dem Write aufbauen, nicht danach.

### BUG-7 — Kein STOP-Kommando in den Fehlerpfaden (Medium)
**Wo:** `src/components/useTimelapseSequence.ts:282,336` (Timeout- und Aufnahme-Fehlerpfade in `finishRun()`).
**Befund:** Bricht ein Schritt mit einem Fehler ab, wird kein `sendStopCommand()` gesendet — verschärft auch BUG-1/BUG-4s Auswirkungen, da ein hängendes `timelapseMoving` so nie zurückgesetzt wird.
**Empfehlung:** Jeder Fehlerpfad sendet vor dem Beenden ein STOP, wie `stop()` es bei manuellem Abbruch bereits tut.

### BUG-8 — Verbindungsabbruch wird erst beim nächsten Schritt erkannt (Medium)
**Wo:** `src/components/useTimelapseSequence.ts:297-303`.
**Befund:** Bricht die BLE-Verbindung während der Warte-/Settle-/Intervall-Phase eines Schritts ab (nicht während eines aktiven Sendevorgangs), bemerkt die App das erst beim nächsten Schrittversuch — bis zu ein volles Intervall (max. 3600s) später. Wakelock bleibt in dieser Zeit aktiv, `isRunning` bleibt `true`.
**Empfehlung:** Eine eigene Device-Null-Prüfung (z. B. per Effect auf den `device`-Parameter) statt nur beim nächsten Schrittversuch.

### BUG-9 — Kein Verweis auf Systemeinstellungen bei dauerhaft abgelehnter Kamera-Berechtigung (Medium)
**Wo:** `src/components/TimelapseControls.tsx:168-178`.
**Befund:** `requestPermission()` wird erneut aufgerufen, unabhängig davon, ob die Berechtigung einmalig oder dauerhaft („Nicht mehr fragen") abgelehnt wurde. Im zweiten Fall öffnet Android gar keinen Dialog mehr — der Button tut dann sichtbar nichts.
**Empfehlung:** Bei wiederholtem Fehlschlag auf `Linking.openSettings()` verweisen.

### BUG-10 — Rückfahrt-Erfolg wird nicht bestätigt, Mindestdauer kann Firmware-Geschwindigkeitsgrenze unterschreiten (Low)
**Wo:** `src/components/useTimelapseSequence.ts:362-375` (Rückfahrt-Aufruf), Zeile ~81 (`MIN_RETURN_DRIVE_DURATION_SECONDS = 1`).
**Befund:** Die Sequenz gilt als erfolgreich abgeschlossen, sobald `sendAutoDriveCommand()` (Rückfahrt) gesendet wurde — ohne auf `driving`/Ankunft zu warten. Bei sehr kurzen Distanzen könnte die berechnete 1-Sekunden-Mindestdauer eine Geschwindigkeit unter der Firmware-Grenze (200 Steps/s) ergeben, was die Firmware still verwirft.
**Empfehlung:** Niedrige Priorität (kosmetischer Rand- und Erfolgsmeldungsfall, keine Datengefahr) — bei Bedarf die Rückfahrt-Bestätigung analog zu den Zeitraffer-Schritten selbst zweistufig abwarten.

### BUG-11 — `capturePhoto()` hat keinen eigenen Timeout (Low, nicht auf Hardware verifiziert)
**Wo:** `src/components/useCameraCapture.ts:58-66`.
**Befund:** Hängt die native Aufnahme (z. B. durch eine manuelle Bildschirmsperre trotz Wakelock, EC-3), hängt die gesamte Sequenz unbegrenzt, statt in den vorgesehenen Fehlerpfad zu laufen.
**Empfehlung:** Niedrige Priorität für ein Hobby-Tool; bei Bedarf ein `Promise.race()` mit einem Timeout ergänzen.

## Security Audit (Red Team)

- **Opcode `0x07` / WRITE_ENC** — [x] Code-verifiziert: läuft über dieselbe Command-Characteristic wie alle bestehenden Opcodes (`ble.cpp:372-375`, `WRITE|WRITE_NR|WRITE_ENC`), kein neuer ungesicherter Pfad, ein ungebondetes Gerät kann ihn nicht senden.
- **Längenprüfung (`len != 6`)** — [x] Code-verifiziert: `ble.cpp:213-224`, vor jedem Zugriff auf `value[1..5]` — kein Out-of-Bounds-Read möglich.
- **Plausibilitätsgrenze / Integer-Overflow** — [x] Code-verifiziert: `distanceSteps > kMaxPlausibleDistanceSteps` (dieselbe Konstante wie PROJ-4, 76800, nicht dupliziert) wird vor dem `static_cast<int32_t>` und vor `moveTo()` geprüft (`motor.cpp:469,485-507`) — kein Undefined Behaviour, keine Umgehung über andere Opcodes gefunden. Restrisiko (Low, bereits seit PROJ-4 bekannt und akzeptiert): die Grenze ist relativ zum Startpunkt, kein echter Endanschlag.
- **Race zwischen `autoDriving`/`timelapseMoving`** — [x] Code-verifiziert: beide Flags werden ausschließlich im NimBLE-Host-Task gesetzt, dessen `onWrite()`-Aufrufe seriell laufen — beide Bewegungsarten gleichzeitig aktiv zu bekommen ist nicht möglich.
- **Exponierte Geheimnisse** — [x] `grep -rn "SECRET\|API_KEY\|PASSWORD\|TOKEN" src/ firmware/src/` — keine Treffer.
- **Netzwerk-Zugriffe in den neuen Kamera-/Galerie-Bibliotheken** — [x] Code-verifiziert: `useCameraCapture.ts` ruft ausschließlich `capturePhotoToFile`/`CameraRoll.save` auf, `grep` nach `fetch|XMLHttpRequest|WebSocket|axios` in `src/` findet nichts.
- **Rate Limiting / Brute Force** — entfällt: keine Login-/Credential-Prüfung in diesem Feature, keine `[user]`-Tasks in `tasks.md`.
- **BUG-4** (Jog-Watchdog-Lücke) ist primär ein Safety-, kein klassischer Security-Befund, aber sicherheitsrelevant genug, um hier erwähnt zu werden — volle Beschreibung oben unter „Zusätzliche Befunde".

## Regressionstest (Step 4)

Geprüfte, als „Deployed"/„Approved" markierte Features: PROJ-1 (BLE-Verbindung & Pairing), PROJ-2 (Manuelle Steuerung/Jog), PROJ-3 (Start-/Endpunkt & Auto-Fahrt), PROJ-4 (Presets verwalten).

- **PROJ-1/PROJ-2** — [x] Code-verifiziert unverändert (Opcodes `0x01`/`0x05`, `motorJog()` textuell unverändert bis auf die in BUG-4 beschriebene fehlende Erweiterung; `JogControls.tsx` hat keinen Diff). **Aber:** durch BUG-1 ist der Jog-Watchdog (PROJ-2 AC-6/EC-4) nach einer abgebrochenen Zeitraffer-Sequenz bis zum nächsten STOP faktisch wirkungslos — eine echte Regression, verursacht durch PROJ-5, nicht durch eine Änderung an PROJ-2s eigenem Code.
- **PROJ-3** — [x] Code-verifiziert: `motorSetStart`/`motorSetEnd`/`motorAutoDriveCheck` textuell unverändert; `motorAutoDrive`/`motorWatchdogCheck` nur um je eine zusätzliche Bedingung erweitert. `AutoDriveControls.tsx`s neue `disabled`-Prop verhält sich bei `disabled=false` (Default) identisch zum vorherigen Verhalten. **Aber:** durch BUG-1 wird eine normale Auto-Fahrt nach einer abgebrochenen Zeitraffer-Sequenz von der Firmware still verworfen (`motor.cpp:353`), ohne dass die UI das anzeigt (`AutoDriveControls` wertet Bit 5 nicht aus) — dieselbe Ursache wie oben.
- **PROJ-4** — [x] Code-verifiziert: `usePresets.ts` nicht angefasst.
- **`client.ts` bestehende Exporte** — [x] Code-verifiziert: alle sieben bestehenden Exporte textuell unverändert, nur additive Erweiterungen (`sendTimelapseMoveCommand`, `timelapseMoving`-Feld/Bit).
- **Test-Suite-Integrität** — [x] Code-verifiziert: `client.test.ts` hat im Diff ausschließlich Ergänzungen (+90/−0 Zeilen), keine bestehenden Testfälle wurden ersetzt (kein REG-2-artiger Vorfall wie bei PROJ-4). Neue Jest-Mocks (`__mocks__/react-native-vision-camera.js` u. a.) treffen exakte Paketpfade, keine Kollision mit bestehenden Mocks — belegt durch 8/8 bereits vor PROJ-5 existierende Suiten weiterhin grün.

## Nachtrag: Re-Verification der Critical-Fixes (2026-09-26, Diff `62f0c4c..99eb9af`)

Auf Nutzerwunsch wurden nur BUG-1, BUG-2 und BUG-3 gefixt (Commit `99eb9af`) und anschließend per vollem Drei-Lanes-Fan-out re-verifiziert (6 Produktionsdateien im Diff → volle Breite laut Skill). Ergebnis:

- **BUG-1 — bestätigt behoben**, von zwei Lanes unabhängig geprüft: `motorTimelapseMoveCheck();` steht jetzt in `firmware/src/main.cpp`s `loop()` (Zeile 55, direkt nach `motorAutoDriveCheck()`), der veraltete „not wired up"-Kommentar in `motor.h` ist korrigiert. Der volle Zustandsübergang (`timelapseMoving` true → Ankunft → false, inkl. Grace-Period) wurde von der Security-Lane nachvollzogen — sicher, kein eigener Firmware-Timeout nötig, solange nichts die Bewegung ersetzt (siehe BUG-4 unten).
- **BUG-2 — bestätigt behoben**, von zwei Lanes unabhängig geprüft: `useCameraCapture()` wird jetzt nur noch einmal aufgerufen (`RootScreen.tsx:46`), das Ergebnis korrekt an `useTimelapseSequence` (als `capturePhoto`-Parameter) und `TimelapseControls` (als vier neue Props, Namen/Typen stimmen exakt) durchgereicht. `<Camera outputs={[photoOutput]}>` nutzt jetzt dieselbe Instanz, über die auch `capturePhoto` ausgelöst wird.
- **BUG-3 — bestätigt behoben**: `<uses-permission android:name="android.permission.CAMERA" />` steht im Manifest. Die zusätzlich ergänzte `WRITE_EXTERNAL_STORAGE` ist korrekt auf `maxSdkVersion="28"` begrenzt.
- **AC-1 — jetzt PASS (Code), weiterhin NOT VERIFIED zur Laufzeit.** Der komplette Ablauf ist im Code lückenlos nachvollziehbar. Zwei bereits bekannte, nicht im Fix-Scope enthaltene High-Bugs (BUG-5 Timeout zu kurz, BUG-6 möglicher Notify-Verlust) schränken das weiterhin ein.

**BUG-4 (High) — präzisiert, bleibt offen und real erreichbar.** Die Security-Lane hat das Zeitfenster genauer eingegrenzt: der Fall „Jog irgendwann nach einer bereits abgebrochenen Sequenz" ist durch den BUG-1-Fix weg. Übrig bleibt ein enger, aber über die normale UI erreichbarer Pfad: (1) ein Schritt läuft in den 15s-Ankunfts-Timeout (BUG-5), (2) der Fehlerpfad sendet kein STOP (BUG-7), (3) `timelapse.isRunning` wird `false` und gibt `JogControls` wieder frei, (4) die Firmware fährt aber unter `timelapseMoving=true` noch — ein Jog in genau diesem Moment läuft ungeschützt (`motorJog()` prüft weiterhin nur `autoDriving`, nicht `timelapseMoving`, `motor.cpp:228`), exakt das Muster von PROJ-3 BUG-1. Weiterhin High, nicht Teil des jetzigen Fixes.

**Zwei neue Low-Funde** (beide von der Akzeptanz-Lane, nicht Teil des Fix-Auftrags):
- **NEU-1** — kein Test schützt davor, dass BUG-2 wiederkehrt (z. B. bei einer künftigen Änderung, die versehentlich erneut zwei `useCameraCapture()`-Aufrufe einführt) — nur `tsc` prüft die Typen, nicht die „nur ein Aufruf"-Invariante.
- **NEU-2** — `WRITE_EXTERNAL_STORAGE` ist deklariert, wird aber auf API 24–28 nirgends zur Laufzeit angefragt (kein `PermissionsAndroid.request(...)` dafür im Code) — `CameraRoll.save()` würde auf sehr alten Android-Versionen (7–9) trotzdem scheitern. Auf API 29+ (Scoped Storage) ohne Auswirkung.

**Suite nach Fix:** 12 Suites, 182 Tests, alle grün. `tsc --noEmit` sauber. Firmware-Build SUCCESS.

## Nachtrag 2: Re-Verification von BUG-4/BUG-7 (2026-09-26, Diff `f480075..f5fce0e`)

Auf Nutzerwunsch wurden BUG-4 und BUG-7 gefixt (Commit `f5fce0e`, 2 Produktionsdateien → eine Lane mit allen drei Scopes laut Skill). Ergebnis:

- **BUG-4 — bestätigt behoben:** `motorJog()`s Guard in `firmware/src/motor.cpp:235` prüft jetzt zusätzlich `timelapseMoving`, dasselbe Muster wie `motorAutoDrive()`/`motorTimelapseMoveTo()`. Keine neue, unerwünschte Sperre für normalen Jog (das Flag ist nur während einer laufenden Zeitraffer-Bewegung `true`).
- **BUG-7 — bestätigt behoben:** `finishRun()` sendet STOP bei jedem Fehlerpfad (`finalError !== null`), nicht beim erfolgreichen Abschluss (dort liefe sonst die Rückfahrt ins Leere). Beide Fehler-Aufrufer (erste Aufnahme fehlgeschlagen, Schritt-Fehler in der Schleife) decken das ab.
- **Der verbleibende Zeitspalt aus der letzten Re-Verification ist geschlossen:** die Lane hat den genauen Ablauf nachvollzogen — `finishRun` setzt `isRunning=false` und sendet STOP im selben synchronen Aufruf, ein Jog kann also frühestens danach entstehen. Bis STOP bei der Firmware tatsächlich ankommt (BLE-Laufzeit, grob einige zehn ms), schützt jetzt genau der neue `motorJog()`-Guard — vorher gab es in genau diesem Fenster keinen Schutz. Verteidigung in der Tiefe funktioniert wie vorgesehen.
- **Zwei neue Low-Testlücken** (nicht Teil des Fix-Auftrags): kein Test prüft explizit, dass STOP beim Erfolgspfad NICHT gesendet wird; der 15s-Ankunfts-Timeout-Pfad (BUG-5) hat keinen eigenen Test, läuft aber über denselben Code wie der bereits getestete 2s-Start-Timeout.
- **Auch bemerkt:** durch BUG-7 bricht ein BUG-5-Timeout jetzt aktiv per STOP mitten in der Fahrt ab, statt den Schlitten das Ziel erreichen zu lassen — sicherer, macht BUG-5 für den Nutzer aber sichtbarer (Sequenz bricht an einer Zwischenposition ab, statt am Ziel).
- Keine Regression: Diff berührt `motor.h`/`ble.cpp`/`client.ts`/`usePresets.ts`/`AutoDriveControls.tsx`/`JogControls.tsx` nicht.

**Suite nach Fix:** 12 Suites, 182 Tests, alle grün. `tsc --noEmit` sauber. Firmware-Build SUCCESS.

## Production-Ready Entscheidung

**Empfehlung: NEIN, weiterhin — aber der sicherheitsrelevante Pfad ist jetzt geschlossen.** Alle drei Critical-Bugs und der einzige real erreichbare High-Bug mit Sicherheitsbezug (BUG-4, zusammen mit BUG-7) sind bestätigt behoben. Es bleiben **2 High-Bugs offen**, beide schränken den Kern-Anwendungsfall (AC-1) ein, sind aber keine Sicherheitsfunde mehr: BUG-5 (Ankunfts-Timeout zu kurz für lange Bewegungen — bricht jetzt durch den BUG-7-Fix aktiv und sichtbar ab, statt den Schlitten einfach ankommen zu lassen) und BUG-6 (unbestätigter Verdacht auf eine Notify-Race).

**Was von hier aus nicht geprüft werden konnte:** jedes Laufzeit-AC (BLE-Timing, tatsächliches Kameraverhalten, ob der Bildschirm wirklich wach bleibt, ob der Berechtigungsdialog erscheint, die tatsächliche Reihenfolge STOP→Firmware-Reaktion→Jog-Sperre, die vermutete Notify-Race in BUG-6), da `probe.kind: none`. Ein Hardwaretest bleibt vor „Approved" in jedem Fall zwingend nötig.

**Bug-Übersicht nach Schweregrad (Stand nach beiden Re-Verifications):**
- Critical: 0 offen — BUG-1, BUG-2, BUG-3 bestätigt behoben
- High: 2 offen — BUG-5 (Ankunfts-Timeout zu kurz für lange Bewegungen), BUG-6 (möglicher Notify-Verlust, Verdacht)
- Behoben und re-verifiziert (sicherheitsrelevant): BUG-4 (Jog-Watchdog ignorierte `timelapseMoving`)
- Medium: 2 offen — BUG-8 (verzögerte Verbindungsabbruch-Erkennung), BUG-9 (kein Verweis auf Systemeinstellungen)
- Behoben und re-verifiziert: BUG-7 (kein STOP in Fehlerpfaden)
- Low: 6 — BUG-10 (Rückfahrt-Erfolg unbestätigt), BUG-11 (kein Aufnahme-Timeout), NEU-1 (keine Testabdeckung gegen ein Wiederauftreten von BUG-2), NEU-2 (`WRITE_EXTERNAL_STORAGE` nie zur Laufzeit angefragt, nur API 24–28 betroffen), NEU-3 (kein Test prüft „STOP nicht beim Erfolgspfad"), NEU-4 (BUG-5s 15s-Timeout-Pfad ungetestet, aber codeseitig identisch zum getesteten 2s-Pfad)
- Notiert, nicht bewertet: `CameraRoll.save()` ist laut eigener Dokumentation deprecated (funktioniert, aber nicht zukunftssicher)

**Welche Bugs sollen als Nächstes behoben werden?** Meine Empfehlung: BUG-5 (Timeout-Wert/-Berechnung) als Nächstes, da er den Kern-Anwendungsfall bei realistischen Schienenlängen (>~362mm bei diesem Projekt) direkt einschränkt — danach BUG-6 am echten Gerät gezielt testen, da er sich rein aus dem Code nicht abschließend bestätigen oder entkräften lässt.

## Nachtrag 3: BUG-6-Fix + Hardwaretest (2026-09-26)

Während des Hardwaretests trat BUG-6 tatsächlich live auf: die exakte Fehlermeldung „Der Slider hat die Zeitraffer-Bewegung nicht bestätigt — der Befehl wurde vermutlich verworfen" erschien beim ersten echten Sequenzlauf, obwohl die Firmware den Befehl angenommen hatte. Damit ist der Verdacht aus der vorherigen Verifikation bestätigt: die Notify für `timelapseMoving: true` kam vor dem Abonnieren an und ging verloren.

**BUG-6 — gefixt:** `moveToTimelapseTargetOrThrow()` (`src/components/useTimelapseSequence.ts`) baut die Status-Subscription jetzt VOR dem Senden von `sendTimelapseMoveCommand` auf, nicht danach — schließt die Race exakt. Neuer Test simuliert die Notify, die vor der Auflösung des Schreibvorgangs eintrifft, rot-geprüft (an der alten Reihenfolge bestätigt fehlgeschlagen). Zusätzlich wurde bei diesem Hardwaretest sichtbar, dass die drei gestapelten Bereiche (Jog, Auto-Fahrt, Zeitraffer) nicht mehr auf einen Bildschirm passen — der Kamera-Berechtigungs-Button war unerreichbar. Gefixt: `RootScreen.tsx`s verbundener Zustand ist jetzt in einem `ScrollView`.

**Außerdem, unabhängig vom eigentlichen Feature:** die physische Schiene wurde vom Nutzer auf 1000mm umgebaut (vorher 480mm) — `kMaxPlausibleDistanceSteps` (PROJ-4s BUG-1-Fix, von PROJ-5 wiederverwendet) war noch auf die alte Länge kalibriert und wurde auf 160000 Steps (1000mm × 160 steps/mm, gleiches Riemenrad) korrigiert und neu geflasht.

**Hardwaretest — Ergebnis (manuell, durch den Nutzer, nach dem BUG-6-Fix):**
- [x] AC-1 (Kernablauf: erste Aufnahme sofort, Zwischenschritte, weitere Aufnahmen) — **verifiziert durch den Nutzer, 2026-09-26**: „alles funkt", kurze Sequenz komplett durchgelaufen
- [x] AC-2 (automatische Rückfahrt zum Start) — **verifiziert durch den Nutzer**, Teil desselben Laufs
- [x] AC-3 (Fortschrittsanzeige) — **verifiziert durch den Nutzer**, Teil desselben Laufs
- [x] AC-5 (Kamera-Berechtigung erteilbar) — **verifiziert durch den Nutzer** (Sequenz lief nur, weil die Berechtigung erteilt wurde; der ScrollView-Fix hat den zuvor unerreichbaren Button erreichbar gemacht)
- [!] AC-10 (Foto landet in der Galerie) — NOT VERIFIED: nicht explizit vom Nutzer bestätigt, nur dass die Sequenz insgesamt durchlief
- [!] AC-4 (Stopp-Button) — NOT VERIFIED: nicht getestet
- [!] AC-9 (gegenseitige Sperre live, insbesondere Jog während laufender Sequenz) — NOT VERIFIED: nicht getestet
- [ ] **BUG-5 — Zusatztest ergab keine neue Erkenntnis, Risikofall weiterhin nicht getestet.** Der Nutzer hat danach zusätzlich eine 45cm-Gesamtstrecke getestet, mit 10 oder mehr Aufnahmen eingestellt — lief ebenfalls durch. **Das testet BUG-5s Risikofall aber nicht:** das 15s-Zeitlimit gilt pro einzelnem Fahrschritt, nicht für die Gesamtstrecke. Bei 10+ Aufnahmen über 45cm ist jeder einzelne Schritt nur rund 5cm (45cm/9 ≈ 8000 Steps) — bei 4000 Steps/s Höchstgeschwindigkeit weit unter der 15s-Grenze. Der Risikofall (wenige Aufnahmen, dadurch mindestens ein einzelner, langer Schritt — im Extremfall 2 Aufnahmen über einen Großteil der jetzt 1000mm-Schiene) wurde nicht geprüft. Der Code ist unverändert seit dem letzten Fund und besteht mit hoher Wahrscheinlichkeit weiterhin für diesen speziellen Fall (wenige Aufnahmen über eine lange Strecke).

### Zusätzlicher Hardwarebefund: Verbindungsabbruch während langer Strecke setzt Start/Ende zurück

Bei einem weiteren Testversuch mit wenigen Aufnahmen über eine lange Strecke trat ein kurzer BLE-Verbindungsabbruch auf (vom Nutzer nicht bewusst bemerkt — kein sichtbares „Verbinde erneut"-Banner, aber durch die Symptome eindeutig belegt). Symptome: Start-/Endpunkt schienen „verloren", Vor-/Zurück-Bedienung reagierte nicht mehr, ein App-Neustart half nicht, erneutes Setzen von Start UND Ende behob es vollständig.

**Ursache (bestehendes Verhalten seit PROJ-1/PROJ-3, kein neuer PROJ-5-Bug):** `ble.cpp`s `onConnect()` ruft bei einer frischen Verbindung (`getConnectedCount() == 1`) `motorClearPoints()` auf, das `hasStart`/`hasEnd` zurücksetzt — genau das in `spec.md`s Decision Log dokumentierte, gewollte Verhalten für „App-Neustart oder bloßer Reconnect". Ein kurzer, unbemerkter Verbindungsabbruch mitten in einer Zeitraffer-Sequenz löst also denselben Reset aus wie ein bewusster Neustart.

**Neue Erkenntnis für PROJ-5 speziell:** eine lange Fahrstrecke (mehrere zehn Sekunden Motorlaufzeit am Stück, viele aufeinanderfolgende BLE-Writes) scheint das Risiko eines BLE-Verbindungsabbruchs zu erhöhen — vermutlich Android-BLE-Stack- oder Reichweiten-bedingt, nicht in diesem Projekt behebbar, aber ein reales Risiko gerade für den Kernanwendungsfall dieses Features (eine unbeaufsichtigte, länger laufende Sequenz). **Nicht als eigener Bug gezählt** (kein PROJ-5-Code-Fehler, reine Beobachtung), aber notiert, da es die Praxistauglichkeit für lange, unbeaufsichtigte Sequenzen einschränkt — AC-7 (Verbindungsabbruch stoppt die Sequenz sicher) hat hier live funktioniert: keine Rückfahrt ins Leere, kein hängender Zustand, nur der erwartete Punkte-Reset.

**Bug-Übersicht (aktueller Stand):**
- Critical: 0 — alle behoben
- High: 1 offen — BUG-5 (Ankunfts-Timeout zu kurz für lange Bewegungen, ungetestet in diesem Lauf, Code unverändert)
- Behoben und live bestätigt: BUG-6 (Notify-Race)
- Behoben und re-verifiziert: BUG-4, BUG-7
- Medium: 2 offen — BUG-8, BUG-9
- Low: 6 (unverändert, siehe oben) plus die neue ScrollView-Erkenntnis (kein eigener Bug-Eintrag, da sofort gefixt)

## Production-Ready Entscheidung (aktualisiert)

**Empfehlung: NEIN, aber nah dran — ein einziger offener High-Bug (BUG-5), der Rest ist entweder behoben oder Medium/Low.** Der Kern-Anwendungsfall (AC-1/AC-2/AC-3/AC-5) ist jetzt durch einen echten Hardwaretest bestätigt, nicht nur durch Code-Inspektion. BUG-5 schränkt weiterhin lange Fahrstrecken ein (>~362mm bei der alten 480mm-Kalibrierung — die genaue neue Schwelle bei 1000mm Schienenlänge wurde nicht neu berechnet, da sich am Timeout-Wert selbst nichts geändert hat: 15s reichen bei maximaler Geschwindigkeit weiterhin nur für recht kurze Strecken).

**Status bleibt „In Review"** — kein „Approved" trotz erfolgreichen Hardwaretests, da BUG-5 ein offener High-Bug ist und AC-4/AC-9/AC-10 nicht am Gerät getestet wurden.

## Nachtrag 4: Re-Verification von BUG-5 (2026-09-27, Diff `6c0da01..248cf19`, Folge-Fixes `42f1c52`)

BUG-5 wurde behoben (Commit `248cf19`, 1 Produktionsdatei → eine Lane mit allen drei Scopes laut Skill): der feste 15000ms-Ankunfts-Timeout ist durch `computeArriveTimeoutMs(stepDistanceSteps)` ersetzt, berechnet aus der tatsächlichen Distanz des jeweiligen Schritts (nicht der kumulierten Zieldistanz vom Start) über dieselbe Trapezformel `minAutoDriveDurationSeconds` (`AutoDriveControls.tsx`, bisher nur für AUTO_DRIVE bei variabler Geschwindigkeit genutzt) — hier gültig als exakte Fahrzeit, da TIMELAPSE_MOVE immer mit Höchstgeschwindigkeit fährt.

- **BUG-5 — bestätigt behoben (Code und Test), weiterhin NOT VERIFIED zur Laufzeit** (`probe.kind: none`, mobile Hardware-App). Die Lane hat die Formel gegen die Firmware-Konstanten gegengeprüft (App: `MAX_SPEED_STEPS_PER_SEC=4000`/`ACCELERATION_STEPS_PER_SEC2=8000`, `AutoDriveControls.tsx:33,40`; Firmware: `kJogSpeedMaxHz=4000.0f`/`kAcceleration=8000`, `motor.cpp:26,31`, `setSpeedInHz(kJogSpeedMaxHz)` fest in `motorTimelapseMoveTo()`, `motor.cpp:500`) — die Werte stimmen exakt überein. Bei der jetzigen Plausibilitätsgrenze (`kMaxPlausibleDistanceSteps=160000`) beträgt der maximale Timeout jetzt ≈45,5s statt vorher fest 15s (die alten 15s reichten nur bis ≈58000 Steps). Ein eigener Gegenprobe-Test der Lane (3 Szenarien: Timeout feuert weiterhin bei echtem Hänger, Timeout skaliert mit dem Schritt-Delta statt dem kumulierten Ziel, Verhalten an der 160000-Steps-Obergrenze) bestätigte die Formel unabhängig vom Repo-Test.
- **AC-1 — jetzt uneingeschränkt PASS (Code), weiterhin NOT VERIFIED zur Laufzeit für den spezifischen Risikofall** (wenige Aufnahmen über einen Großteil der 1000mm-Schiene) — der Hardwaretest aus Nachtrag 3 hat diesen Fall nicht abgedeckt (45cm/10+ Aufnahmen ⇒ kurze Einzelschritte). Ein gezielter Test (z. B. 2 Aufnahmen über ≥60cm) steht noch aus.
- **Drei neue Low-Funde der Lane, alle noch in derselben Runde behoben (Commit `42f1c52`), nicht mehr offen:**
  - **L-1** — Kommentar in `useTimelapseSequence.ts` behauptete fälschlich eine Hardware-Reproduktion des Risikofalls; korrigiert auf „aus dem Hardwaretest-Befund abgeleitet, nicht selbst reproduziert".
  - **L-2** — `MIN_ARRIVE_TIMEOUT_MS` (3000ms-Untergrenze) griff nie, da schon der kleinste mögliche Schritt (1 Step) rechnerisch über der Marge liegt (≈5022ms); entfernt.
  - **L-3** (löst NEU-4 aus Nachtrag 2/„Bug-Übersicht" ab) — der 15s/jetzt-dynamische Ankunfts-Timeout-Pfad hatte keinen eigenen Test. Neuer Test ergänzt und rot-geprüft (zuerst gegen eine absichtlich auf die kumulierte Zieldistanz zurückgesetzte Berechnung bestätigt fehlgeschlagen, dann gegen den korrekten Delta-basierten Fix bestätigt grün) — belegt jetzt sowohl, dass der Timeout weiterhin auslöst, als auch, dass er korrekt aus dem Schritt-Delta und nicht der kumulierten Zieldistanz berechnet wird.
- **Security:** nichts zu prüfen und das auch geprüft, nicht nur angenommen — keine neue BLE-Nachricht, kein neuer Eingabepfad (`stepDistanceSteps` ist rein intern aus bereits validierten Werten berechnet), keine neue Berechtigung. Einzige sicherheitsnahe Auswirkung: ein wirklich hängender Schritt wird jetzt erst nach bis zu 45,5s statt 15s per STOP abgebrochen — kein Fund, da Jog währenddessen firmwareseitig weiterhin durch den BUG-4-Fix gesperrt ist.
- **Regression:** Suite nach Fix (inkl. L-1/L-2/L-3): **12 Suites, 185 Tests, alle grün.** `tsc --noEmit` sauber. Die 7 bereits bestehenden Tests in `useTimelapseSequence.test.ts` unverändert grün, keiner ruft die geänderte interne Signatur (`moveToTimelapseTargetOrThrow`) direkt auf. Keine Auswirkung auf PROJ-1–PROJ-4 (`AutoDriveControls.tsx` selbst nicht verändert, nur `minAutoDriveDurationSeconds` importiert).
- **Außerdem aufgefallen, außerhalb des Scopes, nicht bewertet:** eine durch `stop()` abgelöste Status-Subscription bleibt jetzt bis zu 45,5s statt 15s registriert, bevor sie über den Timeout-Handler aufräumt — funktional harmlos (jede Fortsetzung prüft vorher `runId`), aber eine längere Lebensdauer als vorher.

**Bug-Übersicht (aktueller Stand):**
- Critical: 0 — alle behoben
- High: 0 offen — BUG-5 bestätigt behoben (Code/Test), Laufzeit-Bestätigung am Gerät steht noch aus
- Behoben und live bestätigt: BUG-6 (Notify-Race)
- Behoben und re-verifiziert: BUG-4, BUG-7, BUG-5
- Medium: 2 offen — BUG-8 (verzögerte Verbindungsabbruch-Erkennung), BUG-9 (kein Verweis auf Systemeinstellungen)
- Low: 5 offen — BUG-10 (Rückfahrt-Erfolg unbestätigt), BUG-11 (kein Aufnahme-Timeout), NEU-1 (keine Testabdeckung gegen ein Wiederauftreten von BUG-2), NEU-2 (`WRITE_EXTERNAL_STORAGE` nie zur Laufzeit angefragt, nur API 24–28 betroffen), NEU-3 (kein Test prüft „STOP nicht beim Erfolgspfad")
- Low, behoben in dieser Runde: NEU-4 (Ankunfts-Timeout-Pfad jetzt getestet, siehe L-3), L-1, L-2, L-3
- Notiert, nicht bewertet: `CameraRoll.save()` ist laut eigener Dokumentation deprecated (funktioniert, aber nicht zukunftssicher)

## Production-Ready Entscheidung (aktualisiert)

**Empfehlung: Näher an „Approved", aber weiterhin NEIN** — alle Critical- und High-Bugs sind jetzt code-/testseitig behoben; was fehlt, ist ausschließlich Laufzeit-Bestätigung (`probe.kind: none` erlaubt keine automatisierte Prüfung) und die noch offenen Medium-Bugs (BUG-8, BUG-9).

**Vor „Approved" noch nötig:**
1. Hardwaretest von BUG-5s eigentlichem Risikofall: wenige Aufnahmen (z. B. 2) über einen möglichst großen Teil der jetzt 1000mm-Schiene — bestätigt, dass die Sequenz nicht mehr vorzeitig abbricht.
2. AC-4 (Stopp-Button), AC-9 (gegenseitige Sperre live, insbesondere Jog während laufender Sequenz) und AC-10 (Foto landet in der Galerie) sind bisher nicht explizit am Gerät bestätigt.
3. Entscheidung des Nutzers, ob BUG-8/BUG-9 (Medium) vor oder nach `/deploy` behoben werden — beide sind kein Blocker für „Approved" laut Skill (kein Critical/High mehr offen), aber offene Medium-Bugs sollten bewusst entschieden, nicht übersehen werden.

**Status bleibt „In Review"** — kein „Approved", bis mindestens Punkt 1 und 2 am echten Gerät bestätigt sind.

## Nachtrag: Kameravorschau überlagerte andere Bereiche (2026-09-30)

- **Fund (Nutzer, am Gerät):** Kamerabild und Preset-Liste überlagerten sich. Gemessen per `uiautomator dump`: Kamera-View 600 px hoch (`[96,974][984,1574]`), gezeichnet aber 1178 px hoch, zentriert — die formatfüllend skalierte Vorschau überschreitet die Grenzen des nativen Views, das `overflow: 'hidden'` auf dem Kamera-Style schneidet sie nicht ab.
- **Fix:** `0cd291b` — die Kamera liegt in einem Eltern-`View` mit `overflow: 'hidden'` und `borderRadius`, `implementationMode="compatible"` (TextureView). Screenshot nach dem Fix: Vorschau sitzt zwischen „Zeitraffer" und „Aufnahmen", mit runden Ecken. Nutzer: „alles ok" (2026-09-30).
- **Einordnung:** Layout-Fehler, Severity Medium (Bedienelemente teils verdeckt, Workaround nur Kamera-Zugriff verweigern). Bestehende PROJ-5-Prüfung (`/qa PROJ-5`) steht weiterhin aus; dieser Fund ist dort mitzunehmen.

## Nachtrag: Zeitraffer blieb bei Aufnahme 1 hängen (2026-09-30)

- **Fund (Nutzer, am Gerät):** „Zeitraffer starten tut nix mehr". Gemessen: Sequenz startet („Aufnahme 1 von 10"), CameraX ruft `takePictureInternal` auf, liefert aber kein Ergebnis; Vorschau schwarz. Ursache: `implementationMode="compatible"` (TextureView) aus `dbf4001`.
- **Fix `b7de19b`:** Einstellung entfernt, der Clipping-Wrapper aus `0cd291b` bleibt (behebt die Überlagerung allein). Screenshot nach dem Fix: Vorschau zeigt ein Bild, sauber im Rahmen.
- [x] **Nutzer-Test am Gerät („alles ok", 2026-09-30):** Zeitraffer läuft wieder (Fotos, Fahrt zwischen den Aufnahmen). Severity des Funds: High (Kernfunktion ausgefallen), jetzt behoben. Unabhängige Verifikation in `/qa PROJ-5` steht aus.

## Nachtrag 5: Unabhängige Re-Verifikation nach geteilten Änderungen (2026-09-30)

**Scope:** `git diff bd97ce3..HEAD -- src firmware/src android` (letzter unabhängiger Lauf: BUG-5-Re-Verifikation). Geteilter Code geändert (`motor.cpp`: 8000 Steps/s, DIR-Umkehr, `motorStop()` nur bei `isRunning()`, `jogRunning`; `client.ts`; `RootScreen.tsx`; `TimelapseControls.tsx` Kamera-Wrapper) → voller Fan-out mit drei `qa-engineer`-Lanes. `probe.kind: none` — Laufzeit/Hardware `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 13 Suites, 210 Tests, 0 Fehler (`suite10.log`). Firmware kompiliert am HEAD (SUCCESS, RAM 12,4 %, Flash 49,1 %, ohne Upload). Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`. Eigene Proben: 11 Hook-Proben gegen `useTimelapseSequence`, Render-Proben gegen `TimelapseControls` und `RootScreen`.

### Acceptance Criteria
- [x] **AC-1** — Start-Bedingungen (`TimelapseControls.tsx:143-154`, Probe: nur „alles erfüllt" aktiv); Zwischenziele direkt berechnet `round(D·(i−1)/(N−1))`, letzter Schritt exakt D (`useTimelapseSequence.ts:395-397`); Timeout pro Schritt = Fahrzeit + 5 s mit denselben Werten 8000/8000 wie die Firmware (Probe: 160000 Steps → kein Fehler bei 21 s, Timeout bei 26,1 s). Laufzeit `[!]`.
- [ ] **AC-2 — FAIL (BUG-12, Medium):** Rückfahrt kommt erst nach einem zusätzlichen vollen Intervall nach der letzten Aufnahme (`useTimelapseSequence.ts:435-437` wartet auch bei i == N). Probe: 2 Aufnahmen, Intervall 3600 s → Schlitten steht 1 h am Ende, UI „Aufnahme 2 von 2 · Verbleibend: 0 s", Jog/Auto-Fahrt gesperrt, Wakelock an; angezeigte Gesamtdauer weicht um ein Intervall ab. BUG-10 (≤194 Steps still verworfen, App meldet Erfolg) bestätigt.
- [x] **AC-3** — Fortschritt „Aufnahme 3 von 10 · Verbleibend: 2 Min 5 s" (Render-Probe); Low: kein Stundenformat („540 Min 0 s"), Restzeit springt nur pro Aufnahme.
- [x] **AC-4** — Stopp in allen Phasen: während Fahrt, während Fotoaufnahme (laufende Aufnahme wird noch gespeichert, danach nichts mehr), während Pause — je STOP gesendet, keine Rückfahrt, Wakelock frei (Proben P1–P3). Firmware: `motorStop()` → `forceStop()` wirkt, weil `isRunning()` ab `moveTo()` synchron true ist (`RampGenerator.cpp:89`, `FastAccelStepper.cpp:897-899`); Flags immer zurückgesetzt (`motor.cpp:337-349`). Laufzeit `[!]`.
- [x] **AC-5** — ohne Berechtigung Hinweis + „Kamera-Zugriff erlauben", Start gesperrt. BUG-9 (Medium, kein Verweis auf Systemeinstellungen) offen.
- [ ] **AC-6 — FAIL (BUG-11 hochgestuft auf Medium):** eine *abgelehnte* Aufnahme beendet die Sequenz korrekt mit Meldung und STOP (Probe P10); eine *hängende* Aufnahme nie — `capturePhoto` hat keinen Timeout (`useCameraCapture.ts:58-66`). Probe P4: nach 24 h `run=true`, Aufnahme 1, keine Meldung, Wakelock an. Genau so am 2026-09-30 am Gerät aufgetreten (Auslöser TextureView behoben, die fehlende Absicherung nicht). Weitere Auslöser: Verbindungsabbruch während einer Aufnahme (`<Camera>` wird ausgehängt), Bildschirmsperre (EC-3). Workaround: Stopp von Hand.
- [x] **AC-7** — Firmware stoppt bei Abbruch (`ble.cpp:126`). BUG-8 (Medium) offen: App merkt den Abbruch erst beim nächsten Schritt (Probe: 60 s nach Abbruch noch `run=true`).
- [x] **AC-8** — Wakelock an beim Start, frei in `finishRun`/`stop` (`useTimelapseSequence.ts:323, 493, 526`); Einschränkungen durch BUG-8, BUG-11, BUG-12.
- [x] **AC-9** — gegenseitige Sperre in App (`RootScreen.tsx:118-122`, `AutoDriveControls.tsx:351-378`, `TimelapseControls.tsx:150`) und Firmware (`motor.cpp:239, 411, 528-530`); Render-Proben: Jog, Setzen, Dauer, Presets während Sequenz gesperrt, Zeitraffer-Start während Auto-Fahrt gesperrt.
- [x] **AC-10 (Code)** — `CameraRoll.save` mit derselben Foto-Ausgabe wie die Vorschau (`useCameraCapture.ts:59-65`, `RootScreen.tsx:46, 54, 135`). Galerie-Ablage vom Nutzer noch nicht ausdrücklich bestätigt. NEU-2 offen.

### Edge Cases
- [x] **EC-1** (Distanz 0 → Start gesperrt), **EC-2** (Grenzen 2–999 / 1–3600, Hinweise, „2.5"/„-3" abgelehnt — Render-Probe), **EC-4** (nach Reconnect verwirft die Firmware den nächsten Schritt, `ble.cpp:88`, `motor.cpp:528-530`; Low: Meldung „Befehl vermutlich verworfen" statt „Verbindung verloren")
- [!] **EC-3** — Bildschirmsperre/Hintergrund: Laufzeit nicht prüfbar; hängt die Aufnahme dabei, greift BUG-11.

### Security
- [x] Keine Verschlechterung. `WRITE_ENC` unverändert, ein Bond-Slot; TIMELAPSE_MOVE Längen- und Distanzprüfung vor jedem Zugriff (`ble.cpp:213-215`, `motor.cpp:530`); App-Eingaben per Regex und Grenzen, keine Überläufe (max. 1,6e8 Steps, 3,6e6 ms); STOP hält jede Bewegung an; Berechtigungen minimal (CAMERA, WRITE_EXTERNAL_STORAGE ≤ SDK 28, kein Diff im Manifest); Fotos nur in die Galerie, kein Netzwerk-/Teilen-Pfad; keine Secrets.
- **Zusammenfassung:** 9 Checks verifiziert, 5 NOT VERIFIED (Laufzeit; Brute Force/Credentials in URL nicht anwendbar; Rate Limiting not implemented; kein Release-Bundle gebaut).

### Regression
- [x] PROJ-1 (Status 6 Byte, Disconnect-Stopp, `reconnecting` blendet Steuerung aus), PROJ-2 (Jog-Sperre, Watchdog-Ausnahme deckt keinen Jog-Lauf, `scrollEnabled`), PROJ-3 (Auto-Fahrt-Sperre beidseitig, Rückfahrt), PROJ-4 (Presets während Sequenz gesperrt, Migration-Tests grün) — ohne Befund außer BUG-13.

### Neue Bugs
- [ ] **BUG-12 (Medium)** — Rückfahrt erst nach zusätzlichem Intervall (siehe AC-2).
- [ ] **BUG-11 (jetzt Medium)** — hängende Aufnahme ohne Timeout (siehe AC-6).
- [ ] **BUG-13 (Medium, Regression PROJ-1 AC-3):** Verbindungsabbruch mit Reconnect während der Pause einer Sequenz → Sequenz läuft in der App weiter, Jog/Auto-Fahrt/Presets bleiben bis zum Ende des Intervalls (bis 1 h) gesperrt, danach Timeout-Meldung statt „Verbindung verloren". Ursache: `useTimelapseSequence.ts` beobachtet `device → null` nicht (nur Prüfung zu Schrittbeginn, `:381-387`). Kein Sicherheitsproblem (Firmware verwirft den Befehl nach `motorClearPoints()`); Workaround: Zeitraffer-Stopp. Nahe verwandt mit BUG-8.
- [ ] Low: **BUG-14** Schritte mit 0 Steps bei D < N−1 (widerspricht design.md, praktisch folgenlos); **BUG-15** keine Regressionstests für die Kamera-Fixes `0cd291b`/`b7de19b`; **BUG-16** Start möglich ohne Kameragerät (`cameraDevice === undefined`); **BUG-17** Kamera dauerhaft aktiv, solange der Bildschirm offen ist (Akku/Wärme, laut design.md gewollt); **BUG-18** temporäre Fotodateien bleiben im App-Cache; **BUG-19** TIMELAPSE_MOVE jetzt mit 8000 Steps/s (~50 mm/s) — höhere Aufprallenergie ohne Endanschläge; Test `useTimelapseSequence.test.ts:229-258` nutzt 200000 Steps (> 160000-Grenze).

### Nicht verifiziert
- [!] Alle Laufzeit-/Hardware-Aussagen — no way to run and probe this project was recorded: BUG-5-Risikofall (2 Aufnahmen über ≥ 60 cm bei 8000 Steps/s), Stopp-Reaktionszeit, Galerie-Ablage, Clipping der SurfaceView-Vorschau beim Scrollen, Verhalten von VisionCamera bei ausgehängter Kamera/Hintergrund, Notify bei 0-Step-Schritten.

**Production-Ready: NEIN (noch nicht).** Keine Critical/High-Bugs. Offen sind fünf Medium-Bugs (BUG-8, 9, 11, 12, 13) — kein Blocker laut Regel, aber BUG-11 (Sequenz hängt unbegrenzt) ist am Gerät bereits aufgetreten und BUG-12 macht jede Sequenz um ein Intervall zu lang. Die Laufzeit-ACs AC-4, AC-9, AC-10 und der BUG-5-Risikofall sind noch nicht protokolliert am Gerät bestätigt. Status: **In Review**.

## Nachtrag 6: Fix BUG-8/11/12/13 und protokollierter Nutzer-Test am Gerät (2026-09-30)

- **Fix `0e112bf`** (`useTimelapseSequence.ts`): Fotoaufnahme mit 15-s-Timeout (BUG-11); nach der letzten Aufnahme keine Intervall-Wartezeit, Rückfahrt sofort (BUG-12); Verbindungsabbruch beendet die Sequenz sofort, `finishRun()` macht die laufende Schleife ungültig (BUG-8/BUG-13). 213 Tests grün; drei neue Tests, Red-Check: ohne die Fixes alle drei rot. `design.md` um vier Einträge ergänzt.
- **Protokollierter Nutzer-Test** — Checkliste an den Nutzer übergeben, Antwort je Punkt „ja". Gerät: Android EB2103 (Debug-Build über Metro), Firmware-Stand `a763cb3`, App-Stand `0e112bf`:
  - [x] **AC-1 / AC-2 / BUG-12** — 3 Aufnahmen, 5 s Intervall: 3 Fotos, Fahrt dazwischen, Rückfahrt sofort nach der letzten Aufnahme — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-10** — Fotos in der Galerie — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-4** — Stopp während einer Fahrt hält sofort an — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-9** — Jog-Tasten und „Als Start setzen" reagieren während der Sequenz nicht — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **BUG-5** — 2 Aufnahmen über ≥ 60 cm laufen ohne Fehlermeldung durch — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **BUG-8 / BUG-13 / AC-7** — Bluetooth aus/an in der Pause: Sequenz endet sofort mit „Verbindung verloren", Jog und Auto-Fahrt nach dem Neuverbinden sofort bedienbar — vom Nutzer am Gerät bestätigt, 2026-09-30
- Einschränkung: Anzahl der Durchläufe nicht protokolliert; BUG-11 (hängende Aufnahme) lässt sich am Gerät nicht gezielt auslösen — nur per Test belegt. Der Fix `0e112bf` ist noch nicht durch einen unabhängigen `qa-engineer`-Lauf geprüft.
