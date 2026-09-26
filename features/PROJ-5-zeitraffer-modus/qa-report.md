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
- [ ] **BUG-5 bleibt offen und ist NICHT getestet worden** — der Nutzer hat gezielt nur die kurze Sequenz getestet, nicht die vorgeschlagene lange Strecke (>360mm). Der Bug ist damit weder bestätigt noch entkräftet, aber der Code ist unverändert seit dem letzten Fund — er besteht mit hoher Wahrscheinlichkeit weiterhin.

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
