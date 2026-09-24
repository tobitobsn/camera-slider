# QA Test Results

**Tested:** 2026-09-24
**App URL:** nicht ausführbar hier (`probe.kind: none`, App-Ebene und Layer `firmware`) — jedes Laufzeit-AC ist unten `[!] NOT VERIFIED`, bis ein Mensch es am echten Slider testet
**Tester:** QA Engineer (AI) — drei unabhängige `qa-engineer`-Lanes (Akzeptanz, Security, Regression), zusammengeführt vom Owner
**Scope:** `full` (erster `/qa`-Lauf für PROJ-4, HEAD `b4ad360` auf `feat/PROJ-4-presets-verwalten`)

> Legende: `[x]` in diesem Lauf verifiziert (Beleg nötig) · `[ ] BUG` als kaputt verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund nötig)

## Vorbemerkung zur Methode

`probe.kind: none` gilt sowohl auf App-Ebene als auch im Layer `firmware` — es gab nichts zu starten und nichts live abzufragen. Alle Befunde stammen aus Quellcode-Inspektion (App: `src/ble/client.ts`, `src/components/usePresets.ts`, `src/components/AutoDriveControls.tsx`; Firmware: `firmware/src/{motor,ble}.{h,cpp}`) und aus dem Testsuite-Lauf. Die App-Suite lief einmal vor dem Fan-out (8 Suites/127 Tests) und nach dem QA-Owner-Fix für REG-2 (neuer Test) ein zweites Mal komplett: **8 Suites, 128 Tests, 0 fehlgeschlagen**. Die drei Lanes selbst haben keine Suite erneut ausgeführt, nur einzelne Dateien gelesen.

## Automatisierte Tests (Step 5)

- **App-Suite** (`npm test`) — PASS — **8 Suites, 128 Tests, 0 fehlgeschlagen** (`client.test.ts`, `App.test.tsx`, `ConnectionProvider.test.tsx`, `usePresets.test.ts`, `AutoDriveControls.test.ts`, `connectionReducer.test.ts`, `useJogState.test.ts`, `useSliderStatus.test.ts`), Lauf gegen HEAD `b4ad360`.
- **Firmware-Layer** — `[!] NOT VERIFIED — no test command recorded for layer firmware` (`commands.test: null` in `.ai-eng-kit`). Ersatzweise: `pio run -e esp32dev` → `[SUCCESS]` (RAM 12,4 %, Flash 49,0 %) — belegt nur, dass die Firmware baut, nicht ihr Verhalten.
- **E2E-Suite** — nicht vorhanden, übersprungen (kein früherer `/e2e-tests`-Lauf).

## Acceptance Criteria Status

#### AC-1: Preset speichern (Name, Distanz, Dauer) bei vollständiger Konfiguration
- [!] NOT VERIFIED — no way to run and probe this project was recorded.
- Code-Kette PASS: Button nur sichtbar bei `presetPreconditionMet` (`AutoDriveControls.tsx:258-263,465-478`) → `handleConfirmSavePreset` (`AutoDriveControls.tsx:349-378`) → `usePresets().save()` (`usePresets.ts:101-118`) → `AsyncStorage.setItem` (`usePresets.ts:96-99`). Tests: `usePresets.test.ts:73` (Felder korrekt), `usePresets.test.ts:180` (persistiert über Hook-Remount).
- **BUG-6 (Medium)** — siehe unten: `save()`/`remove()` schreiben aus dem In-Memory-State, nicht aus einem frischen Storage-Read; ein fehlgeschlagener initialer Read kann so bestehende Presets überschreiben.

#### AC-2: Leerer Name blockiert Speichern
- [x] Code-verifiziert: Speichern-Button im Dialog `disabled={presetNameText.trim() === ''}` (`AutoDriveControls.tsx:543`); `handleConfirmSavePreset` prüft `trimmedName === ''` defensiv erneut (`AutoDriveControls.tsx:350-358`).
- [!] NOT VERIFIED (Laufzeit-Rendering) — no way to run and probe this project was recorded.

#### AC-3: Liste zeigt jedes Preset mit Name und Dauer
- [!] NOT VERIFIED — no way to run and probe this project was recorded.
- Code PASS: `presets.map(...)` rendert `preset.name` + `formatSeconds(preset.durationSeconds)` (`AutoDriveControls.tsx:485-499`).

#### AC-4: Preset laden → Dauer übernommen, Distanz+Richtung gemerkt
- [!] NOT VERIFIED — no way to run and probe this project was recorded.
- Code PASS: `handleLoadPreset` setzt `loadedPreset` und `durationText` (`AutoDriveControls.tsx:312-318`).
- **BUG-8 (Low)** — siehe unten: die Dauer-Validierung wird bis zum nächsten „Als Start setzen" noch gegen die *alte* Distanz gerechnet, nicht gegen die des geladenen Presets.

#### AC-5: „Als Start setzen" bei geladenem Preset leitet Endpunkt automatisch ab
- [!] NOT VERIFIED (physisch) — no way to run and probe this project was recorded.
- Code-Kette PASS: `handleSetStart` wartet auf `sendSetStartCommand`, ruft danach bei `loadedPreset !== null` `sendSetEndFromDistanceCommand` (`AutoDriveControls.tsx:276-290`) → Opcode `0x06`, Test `client.test.ts` (`sendSetEndFromDistanceCommand`-Block) → `ble.cpp:193-208` → `motor.cpp:275-283` (`endPosition = startPosition ± distanceSteps`).
- **BUG-5 (Medium)** — siehe unten: `sendSetStartCommand` kann als BLE-Write-mit-Response erfolgreich auflösen, obwohl die Firmware `motorSetStart()` intern wegen `stepper->isRunning()` (z. B. laufender Jog) still verworfen hat — der App-seitige Erfolg sagt nichts über den Firmware-Zustand. `sendSetEndFromDistanceCommand` feuert dann trotzdem und leitet den Endpunkt von einer unveränderten/falschen `startPosition` ab, ohne dass irgendein Fehler sichtbar wird.
- **BUG-1 (Medium, Sicherheit/Hardware)** — siehe unten: kein Plausibilitäts-Check des abgeleiteten Endpunkts gegen die tatsächliche Schienenlänge.

#### AC-6: Löschen erfordert Bestätigungsdialog
- [x] Code-verifiziert: `handleDeletePreset` öffnet `Alert.alert` mit „Abbrechen"/„Löschen", nur „Löschen" ruft `removePresetFromStorage` (`AutoDriveControls.tsx:320-334`). Test: `usePresets.test.ts:148` (Hook-Ebene, `remove()` entfernt korrekt per id).
- [!] NOT VERIFIED (Laufzeit-Dialog) — no way to run and probe this project was recorded.
- **BUG-7 (Low)** — siehe unten: `loadedPreset` wird nicht zurückgesetzt, wenn genau das geladene Preset gelöscht wird.

#### AC-7: Leerer-Zustand-Hinweistext ohne Presets
- [x] Code-verifiziert: `presets.length === 0 ? <Text>Noch keine Presets gespeichert</Text> : ...` (`AutoDriveControls.tsx:482-484`).
- [!] NOT VERIFIED (Laufzeit-Rendering) — no way to run and probe this project was recorded.

#### AC-8: Laden/Löschen gesperrt während Auto-Fahrt läuft
- [x] Code-verifiziert: beide Pressables in der Preset-Zeile tragen `disabled={status.driving}` (`AutoDriveControls.tsx:489,503`).
- [!] NOT VERIFIED (Laufzeit) — no way to run and probe this project was recorded.
- **BUG-9 (Low)** — siehe unten: der „Als Preset speichern"-Button selbst ist ebenfalls `disabled={status.driving}` (`AutoDriveControls.tsx:468`) — konsistent —, aber `handleConfirmSavePreset` (der Speichern-Button *im* Dialog) prüft `status.driving` nicht erneut. Praktisch nur erreichbar, wenn eine Auto-Fahrt startet, während der Speichern-Dialog bereits offen ist; das native `Modal` blockiert Touches auf den dahinterliegenden Fahr-Buttons, sodass der Pfad nach Code-Lage nicht auslösbar scheint — als Low statt Medium eingestuft, da die Erreichbarkeit selbst unklar ist.

#### AC-9: Presets überleben App-Neustart
- [!] NOT VERIFIED — no way to run and probe this project was recorded (persistente Speicherung lässt sich ohne echten App-Neustart nicht beobachten).
- Code PASS: `AsyncStorage.setItem`/`getItem` statt In-Memory-only-State (`usePresets.ts:41-55,96-99`). Test `usePresets.test.ts:180` simuliert einen Hook-Remount (Proxy für „App neu geladen, gleicher Storage") und bestätigt, dass das Preset erhalten bleibt.

## Edge Cases

#### EC-1: Doppelte Namen erlaubt, keine Fehlermeldung
- [x] Code-verifiziert: kein Duplikat-Check in `usePresets.ts:save()`. Test: `usePresets.test.ts:99`.

#### EC-2: Dauer nach dem Laden manuell geändert → manueller Wert gilt
- [x] Code-verifiziert: `durationText`/`durationSeconds` ist unabhängiger State von `loadedPreset` (`AutoDriveControls.tsx:183-184,195-198`); `handleDrive` liest `durationSeconds`, nie `loadedPreset` (`AutoDriveControls.tsx:299-304`).

#### EC-3: Manuelles Setzen des Endpunkts überschreibt den aus dem Preset abgeleiteten
- [x] Code-verifiziert: `handleSetEnd` ruft `setLoadedPreset(null)` vor dem Senden (`AutoDriveControls.tsx:292-297`).

#### EC-4: Fehlgeschlagenes lokales Speichern zeigt Fehlermeldung, Preset erscheint nicht in der Liste
- [x] Code-verifiziert: `save()` wirft bei fehlgeschlagenem `AsyncStorage.setItem` weiter (`usePresets.ts:96-99`, kein try/catch dort), `presets`-State wird nur nach erfolgreichem `persist()` aktualisiert; `handleConfirmSavePreset`s `.catch()` zeigt `ToastAndroid` (`AutoDriveControls.tsx:374-377`). Test: `usePresets.test.ts:211` ("a failed save() does not add the preset ... and the returned promise rejects").
- [!] NOT VERIFIED (sichtbarer Toast) — no way to run and probe this project was recorded.

#### EC-5: Trennung während geladenem, aber noch nicht gesetztem Preset — nur der geladene Zustand geht verloren
- [x] Code-verifiziert: `loadedPreset` ist lokaler Komponenten-State ohne Persistenz; `RootScreen` (PROJ-1) unmountet `AutoDriveControls` bei Trennung, ein Remount startet mit `loadedPreset === null` (Kommentar `AutoDriveControls.tsx:190-194`, gegen `RootScreen.tsx`s Switch-Logik nicht erneut nachgeschlagen — Konsistenz mit PROJ-3s EC-3-Muster als Beleg übernommen, nicht neu gegengeprüft).
- [!] NOT VERIFIED (Laufzeit) — no way to run and probe this project was recorded.

## Zusätzliche Befunde (nicht in spec.md, während der Verifikation gefunden)

### BUG-1 — Kein Plausibilitäts-Check für den abgeleiteten Endpunkt (Medium, Sicherheit/Hardware)
**Wo:** `firmware/src/motor.cpp:275-283` (`motorSetEndFromDistance`).
**Befund:** Der Slider hat keine Endanschläge (`spec.md`s Decision Log: „kein Referenzpunkt, keine Endanschläge"). Lädt der Nutzer ein Preset und fährt anschließend per Jog zu einer physisch *anderen* Stelle als der ursprünglichen Aufnahmeposition, bevor er „Als Start setzen" drückt, leitet die Firmware den Endpunkt trotzdem blind aus `startPosition ± distanceSteps` ab — ohne jede Prüfung, ob dieser Punkt überhaupt noch auf der Schiene liegt. Eine anschließende Auto-Fahrt kann den Schlitten gegen das physische Schienenende fahren.
**Auswirkung:** Bei normaler Fehlbedienung (leicht falsch positioniert) potenziell Schrittverlust oder mechanische Belastung von Motor/Riemen — widerspricht der PRD-Erfolgsmetrik „Slider fährt ruckel-/schrittverlustfrei über die volle Schienenlänge".
**Empfehlung:** Vor `/deploy` entscheiden, ob eine Plausibilitätsgrenze (z. B. maximale erwartete Schienenlänge als Konstante) in `motorSetEndFromDistance` sinnvoll ist, oder ob das Risiko bewusst getragen wird (wie schon für die fehlenden Endanschläge generell in `spec.md` akzeptiert).

### BUG-2 — Integer-Konvertierung ohne Bereichsprüfung bei sehr großer Distanz (Low)
**Wo:** `firmware/src/motor.cpp:279-281`.
**Befund:** `static_cast<int32_t>(distanceSteps)` bei einem `uint32_t distanceSteps > INT32_MAX` ist implementierungsdefiniertes Verhalten (C++17). Das Wire-Format (`ble.cpp:202-205`) erlaubt beliebige 32-Bit-Werte vom Client.
**Auswirkung:** Praktisch unerreichbar über die reguläre App (reale Schienenlängen liegen um Größenordnungen darunter), aber ein böswillig gebauter BLE-Write nach erfolgreichem Pairing könnte einen Wert in diesem Bereich senden.
**Empfehlung:** Niedrige Priorität; optionale Bereichsprüfung vor dem Cast, falls Härtung gegen einen bereits gebondeten, aber kompromittierten Client gewünscht ist.

### BUG-3 — usePresets: `save()`/`remove()` schreiben aus dem In-Memory-State, nicht aus einem frischen Storage-Read (Medium, Datenverlust-Risiko)
**Wo:** `src/components/usePresets.ts:41-55` (`readStoredPresets` fängt jeden Fehler zu `[]` ab) kombiniert mit `usePresets.ts:96-99,101-118` (`persist`/`save` bauen die neue Liste aus dem React-State `presets`, nicht aus einem erneuten `AsyncStorage.getItem`).
**Befund:** Schlägt der initiale Read beim Mount aus irgendeinem Grund fehl (z. B. transienter AsyncStorage-Fehler), obwohl echte Presets gespeichert sind, bleibt `presets` bei `[]`. Der nächste `save()`-Aufruf schreibt `[...[], newPreset]` und überschreibt damit den kompletten gespeicherten Bestand mit nur dem einen neuen Preset — alle vorherigen Presets sind unwiderruflich weg.
**Auswirkung:** Stiller, kompletter Datenverlust ohne jede Fehlermeldung (das `save()` selbst gilt als erfolgreich).
**Empfehlung:** `save`/`remove` sollten aus einem frischen `AsyncStorage.getItem`-Read heraus mergen statt aus dem möglicherweise veralteten React-State, oder zumindest ein fehlgeschlagener initialer Read sollte sichtbar signalisiert werden statt still zu `[]` zu werden.

### BUG-4 — Preset-Name ohne die in design.md zugesagte 60-Zeichen-Grenze (Low)
**Wo:** `design.md:86` legt fest „name: Text, 1–60 Zeichen, Pflichtfeld". Weder `usePresets.ts` noch das `TextInput` im Speichern-Dialog (`AutoDriveControls.tsx:526-533`, kein `maxLength`) erzwingen eine Obergrenze — nur die Leer-Prüfung existiert.
**Auswirkung:** Rein kosmetisch (ein sehr langer Name kann die Listenzeile stauchen/umbrechen), keine Absturz- oder Datengefahr.
**Empfehlung:** `maxLength={60}` am `TextInput` ergänzen, falls die 60-Zeichen-Grenze aus design.md tatsächlich durchgesetzt werden soll.

### BUG-5 — SET_START-„Erfolg" aus App-Sicht sagt nichts über den tatsächlichen Firmware-Zustand (Medium)
**Wo:** `AutoDriveControls.tsx:276-290` (`handleSetStart`) kombiniert mit `firmware/src/ble.cpp:157-163` (Opcode-Handler ruft `motorSetStart()` unbedingt auf, unabhängig von dessen Ergebnis) und `firmware/src/motor.cpp:256-265` (`motorSetStart()` verwirft still bei `stepper->isRunning()`).
**Befund:** `sendSetStartCommand` ist ein BLE „Write With Response" — die Response ist ein reiner ATT-Protokoll-Ack, kein Signal, ob `motorSetStart()` intern tatsächlich `hasStart`/`startPosition` aktualisiert hat. Läuft der Motor noch (z. B. Restlauf eines Jogs, der Jog-Button ist beim „Als Start setzen"-Button nicht durch `status.driving` gesperrt, da `driving` nur `autoDriving` widerspiegelt — `useSliderStatus`/`ble.cpp:52-58`), verwirft die Firmware den SET_START still, aber `await sendSetStartCommand(device)` löst trotzdem erfolgreich auf. Bei geladenem Preset feuert `handleSetStart` daraufhin unbedingt `sendSetEndFromDistanceCommand`, das den Endpunkt von einer unveränderten/falschen `startPosition` ableitet — ohne jede sichtbare Fehlermeldung.
**Auswirkung:** Ein falsch abgeleiteter Endpunkt ohne jedes Nutzer-Feedback; PROJ-4 vergrößert die Konsequenz eines bereits seit PROJ-3 bestehenden Musters (stille Ablehnung von SET_START/SET_END), da jetzt automatisch ein zweiter, davon abhängiger Befehl nachgeschickt wird.
**Empfehlung:** Der Status-Payload aktualisiert sich ohnehin per Notify — nach dem SET_START-Response könnte die App kurz auf `status.hasStart`/`atStart` prüfen, bevor sie `sendSetEndFromDistanceCommand` feuert, statt dem reinen ATT-Ack zu vertrauen.

### BUG-6 — `loadedPreset` bei Duration-Validierung: kurzzeitig gegen alte Distanz statt gegen die des Presets (Low, kosmetisch)
**Wo:** `AutoDriveControls.tsx:203-231` — `rangeAvailable`/`durationValid` werden aus `status.distanceSteps` berechnet (dem *aktuellen* Firmware-Zustand), während `handleLoadPreset` (`AutoDriveControls.tsx:312-318`) nur `durationText` setzt, nicht `status`.
**Befund:** Zwischen dem Laden eines Presets und dem Drücken von „Als Start setzen" validiert die App die übernommene Dauer noch gegen die alte, noch aktive Distanz — nicht gegen die des geladenen Presets. Kann kurzzeitig eine irreführende „Ungültige Dauer"-Meldung zeigen oder eine tatsächlich ungültige Kombination fälschlich als gültig anzeigen.
**Auswirkung:** Rein kosmetisch/vorübergehend, behebt sich automatisch sobald „Als Start setzen" gedrückt und der neue Status per Notify eintrifft.

### BUG-7 — `loadedPreset` wird nicht zurückgesetzt, wenn das geladene Preset selbst gelöscht wird (Low)
**Wo:** `AutoDriveControls.tsx:320-334` (`handleDeletePreset`) — berührt `loadedPreset` nicht.
**Befund:** Lädt der Nutzer ein Preset (Distanz/Richtung werden in `loadedPreset` kopiert) und löscht anschließend genau dieses Preset aus der Liste, bleibt `loadedPreset` unverändert bestehen. „Als Start setzen" leitet danach weiterhin den Endpunkt aus den kopierten Werten des bereits gelöschten Presets ab.
**Auswirkung:** Nicht mehr aus der Liste sichtbar, aber funktional noch „aktiv" — verwirrend, aber kein Datenverlust (die Werte sind reine lokale Kopien, keine Referenz auf das gelöschte Preset).

### BUG-8 (jetzt behoben) / BUG-9 (jetzt behoben) — siehe „Regressionsbefunde REG-1/REG-2" unten (Owner-Fix, Step 6)

### U-1 — Unbehandelte Promise-Rejection bei valider, aber falsch geformter Storage-Payload (Low)
**Wo:** `usePresets.ts:41-55` (`readStoredPresets`) + `usePresets.ts:37-39` (`sortByCreatedAtDescending`).
**Befund:** `readStoredPresets()` fängt nur JSON-*Parse*-Fehler ab. Ist der gespeicherte Wert valides JSON, aber kein Array (z. B. `"{}"` durch eine fremde App/einen manuellen ADB-Eingriff auf denselben Storage-Key), gibt `JSON.parse` erfolgreich ein Objekt zurück (nur per TS-Cast als `Preset[]` behauptet). Der nachfolgende `sortByCreatedAtDescending([...loaded])`-Spread auf ein Nicht-Array wirft eine TypeError — unbehandelt, da `readStoredPresets().then(...)` in `usePresets.ts:85-89` kein `.catch()` hat.
**Auswirkung:** Unhandled Promise Rejection beim Hook-Mount; in Entwicklung sichtbar als Red-Box/Warnung, in Production je nach RN-Konfiguration ein stiller Fehler ohne Presets-Anzeige.
**Empfehlung:** Niedrige Priorität (erfordert externe Manipulation des Storage-Keys), aber `Array.isArray(parsed) ? parsed : []` als Laufzeit-Check wäre eine günstige Absicherung.

## Security Audit (Red Team)

- **Authentifizierung/Autorisierung (BLE-Ebene)** — [x] Code-verifiziert, unverändert seit PROJ-3: Command-Characteristic verlangt weiterhin `WRITE_ENC` (`ble.cpp:352-354`), der neue Opcode `0x06` nutzt dieselbe Characteristic und damit denselben Schutz — kein separater, ungesicherter Pfad eingeführt.
- **Input-Validierung am Protokoll-Rand** — [x] Code-verifiziert: `onWrite()` prüft `len != 6` für den neuen Opcode und verwirft sonst (`ble.cpp:193-196`), analog zu den bestehenden Opcodes — kein Out-of-Bounds-Read möglich.
- **Exponierte Geheimnisse** — [x] `grep -rn "SECRET\|API_KEY\|PASSWORD" src/ firmware/src/` (Owner, vor Fan-out) — keine Treffer außer den bekannten, öffentlichen BLE-UUIDs.
- **Sensible Daten im Status-Payload** — [x] Code-verifiziert: das neue Byte 5 kodiert nur „Endpunkt vor/nach Start" (ein Bit Richtungsinformation), keine absolute Position, keine PII — konsistent mit design.md's expliziter Entscheidung „nie absolute Positionen an die App".
- **Rate Limiting / Brute Force** — entfällt: keine Login-/Credential-Prüfung in diesem Feature.
- **AsyncStorage-Inhalt** — [!] NOT VERIFIED (Laufzeit) — AsyncStorage auf Android ist unverschlüsselt und app-privat (Sandbox); Presets enthalten keine sensiblen Daten (Name, Distanz, Dauer) — kein zusätzliches Risiko gegenüber dem Ist-Zustand des Betriebssystems.
- **BUG-2 (Integer-Konvertierung, s. o.)** ist der einzige sicherheitsrelevante Fund dieser Lane, bereits oben unter „Zusätzliche Befunde" aufgeführt statt dupliziert.

## Regressionstest (Step 4)

Geprüfte, als „Deployed" markierte Features: PROJ-1 (BLE-Verbindung & Pairing), PROJ-2 (Manuelle Steuerung/Jog), PROJ-3 (Start-/Endpunkt & Auto-Fahrt).

- **PROJ-1/PROJ-2** — [x] Code-verifiziert unverändert: `git diff --stat v1.1.0-PROJ-3..HEAD -- src/ble/ firmware/src/` zeigt nur additive Änderungen (neuer Opcode, neues Payload-Byte, neue Felder) an `client.ts`/`ble.cpp`, keine Änderung an JOG (`0x01`)/STOP (`0x05`)-Pfaden oder deren Tests.
- **PROJ-3 (Start-/Endpunkt & Auto-Fahrt)** — [x] Code-verifiziert: `motorSetStart()`/`motorSetEnd()`/`motorAutoDrive()`/`motorWatchdogCheck()` in `motor.cpp` textuell unverändert gegenüber `v1.1.0-PROJ-3` (nur `motorSetEndFromDistance` und die `endIsAfterStart`-Erweiterung in `motorGetStatus()` sind neu hinzugekommen, additiv). Bestehende PROJ-3-Tests in `client.test.ts`/`AutoDriveControls.test.ts` laufen weiterhin grün (Teil der 128).
- **REG-1 (Low, jetzt behoben)** — `firmware/src/ble.h:35-38` beschrieb das Status-Payload noch als „5-byte" nach dessen Erweiterung auf 6 Byte durch PROJ-4. Kein funktionaler Bug (reiner Kommentar), aber irreführend für die nächste Änderung an diesem Payload. **Fix:** Commit `b4ad360` — Kommentar korrigiert.
- **REG-2 (Low, jetzt behoben)** — Die Build-Phase hatte `client.test.ts`s 5-Byte-Payload-Testfälle durch die neuen 6-Byte-Fälle *ersetzt* statt ergänzt, wodurch die Abwärtskompatibilitäts-Abdeckung für ein Firmware/App-Versions-Mismatch (alte Firmware, neue App) verloren ging. **Fix:** Commit `b4ad360` — neuer Test „parses a legacy 5-byte payload (pre-PROJ-4 firmware) with endIsAfterStart defaulting true", rot-geprüft gegen `client.ts`s `endIsAfterStart`-Default (Änderung von `bytes[5] ?? 0` zu `?? 1`, genau dieser eine Test schlug fehl, danach zurückgesetzt).

### U-6 — AutoDriveControls' PROJ-4-UI hat keine Komponenten-Tests (Medium, Testabdeckungslücke)
**Wo:** `src/components/AutoDriveControls.test.ts` — enthält ausschließlich Tests für exportierte reine Funktionen (`parseDurationSeconds`, `formatSeconds`, `solveAutoDriveSpeedStepsPerSec`, `minAutoDriveDurationSeconds`/`maxAutoDriveDurationSeconds`, `statusLabelFor`). Kein einziger Test rendert die Komponente oder simuliert einen Tap auf Speichern-Button, Dialog, Preset-Zeile oder Löschen-Icon.
**Befund:** AC-1, AC-2, AC-4 bis AC-8 — also praktisch die gesamte sichtbare PROJ-4-Oberfläche (Speichern-Dialog, Preset-Liste, Laden, Löschen-Bestätigung, Sperren während der Fahrt) — haben dadurch **keinerlei automatisierten Regressionsschutz**, nur die Code-Inspektion oben. `usePresets.test.ts` zeigt, dass `react-test-renderer` + `act()` im Projekt bereits als Testmuster etabliert ist (auch ohne `@testing-library/react-native`) — die Lücke ist also keine fehlende Tooling-Option, sondern eine im Build-Task nicht geschlossene Abdeckung.
**Empfehlung:** Vor einem größeren Refactor von `AutoDriveControls.tsx` nachziehen — am günstigsten in einem eigenen, fokussierten Task, nicht rückwirkend in dieser QA-Runde (Scope-Grenze: `/qa` schreibt laut Skill nur isolierte Unit-Tests für Lücken, keine vollen Komponenten-Interaktionstests einer fremden Datei).

## Production-Ready Entscheidung

**Empfehlung: NEIN, noch nicht — aber nah dran.** Keine Critical- oder High-Bugs. Zwei echte Medium-Bugs mit realer Konsequenz (BUG-1 Datenverlust-Risiko bei Presets, BUG-5 stiller Fehlzustand bei „Als Start setzen") sollten vor dem Hardwaretest behoben werden, dazu optional BUG-1 (Firmware, Plausibilitätscheck) als bewusste Produktentscheidung geklärt werden — beide sind mit vertretbarem Aufwand zu schließen und beide sind eng am Kernnutzen dieses Features (ein Preset zuverlässig zu laden, ohne den Schlitten falsch zu positionieren).

**Was von hier aus nicht geprüft werden konnte** (jedes runtime-AC oben): tatsächliches BLE-Verhalten am echten ESP32, ob der abgeleitete Endpunkt bei realer Fehlpositionierung wirklich zu einem harten Anschlag führt, Rendering von Dialog/Liste/Fehlertexten, `ToastAndroid`-Sichtbarkeit, App-Neustart-Persistenz am echten Gerät. `probe.kind: none` bedeutet: alles davon bleibt beim menschlichen Hardwaretest, wie schon bei PROJ-1/2/3.

**Bug-Übersicht nach Schweregrad:**
- Critical: 0
- High: 0
- Medium: 3 — BUG-1 (kein Plausibilitätscheck Endpunkt, Firmware), BUG-3 (usePresets Datenverlust bei fehlgeschlagenem Initial-Read), BUG-5 (SET_START-„Erfolg" ohne Firmware-Bestätigung) — sowie U-6 als Testabdeckungslücke, nicht als Funktionsbug gezählt
- Low: 6 — BUG-2 (Integer-Cast ohne Bereichsprüfung), BUG-4 (fehlende 60-Zeichen-Grenze), BUG-6 (Validierung kurzzeitig gegen alte Distanz), BUG-7 (`loadedPreset` überlebt Löschung des eigenen Presets), BUG-9 (Save-Dialog prüft `driving` nicht erneut, fraglich erreichbar), U-1 (unhandled rejection bei fremdgeschriebenem Storage-Wert)
- Bereits behoben (Owner, Step 6): REG-1, REG-2

**Welche Bugs sollen zuerst behoben werden?**
