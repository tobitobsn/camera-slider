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

### Previously Fixed
- **BUG-1** (Medium, Sicherheit/Hardware) — Kein Plausibilitäts-Check für den abgeleiteten Endpunkt in `motorSetEndFromDistance`. Gefixt: Grenze von 76800 Steps (480mm × 160 steps/mm), `firmware/src/motor.cpp`. Residuales, bewusst akzeptiertes Restrisiko bleibt im Code dokumentiert: ohne Referenzpunkt ist dies eine Plausibilitätsgrenze, kein echter Software-Endanschlag.
- **BUG-2** (Low) — Integer-Konvertierung ohne Bereichsprüfung bei sehr großer Distanz. Gefixt als Nebeneffekt von BUG-1s Korrektur (76800 ≪ INT32_MAX).
- **BUG-3** (Medium, Datenverlust-Risiko) — `usePresets`: `save()`/`remove()` schrieben aus dem In-Memory-State statt aus einem frischen Storage-Read, konnten so bestehende Presets überschreiben. Gefixt: lesen jetzt frisch aus AsyncStorage vor jedem Schreiben. Neuer Folgefund beim Fix, offen und als Trade-off akzeptiert: **NEU-2** — ein korrupter oder nicht-Array-Storage-Wert blockiert `save()`/`remove()` jetzt dauerhaft statt (wie vorher) still überschrieben zu werden.
- **REG-1** (Low) — veralteter „5-byte"-Kommentar in `firmware/src/ble.h` nach der Erweiterung des Status-Payloads auf 6 Byte. Gefixt.
- **REG-2** (Low) — Testabdeckung für das 5-Byte-Legacy-Payload (Firmware/App-Versions-Mismatch) ging beim Build verloren. Gefixt: neuer, rot-geprüfter Test in `client.test.ts`.

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
- **REG-1, REG-2** (Low, jetzt behoben) — siehe „Previously Fixed" oben.

### U-6 — AutoDriveControls' PROJ-4-UI hat keine Komponenten-Tests (Medium, Testabdeckungslücke)
**Wo:** `src/components/AutoDriveControls.test.ts` — enthält ausschließlich Tests für exportierte reine Funktionen (`parseDurationSeconds`, `formatSeconds`, `solveAutoDriveSpeedStepsPerSec`, `minAutoDriveDurationSeconds`/`maxAutoDriveDurationSeconds`, `statusLabelFor`). Kein einziger Test rendert die Komponente oder simuliert einen Tap auf Speichern-Button, Dialog, Preset-Zeile oder Löschen-Icon.
**Befund:** AC-1, AC-2, AC-4 bis AC-8 — also praktisch die gesamte sichtbare PROJ-4-Oberfläche (Speichern-Dialog, Preset-Liste, Laden, Löschen-Bestätigung, Sperren während der Fahrt) — haben dadurch **keinerlei automatisierten Regressionsschutz**, nur die Code-Inspektion oben. `usePresets.test.ts` zeigt, dass `react-test-renderer` + `act()` im Projekt bereits als Testmuster etabliert ist (auch ohne `@testing-library/react-native`) — die Lücke ist also keine fehlende Tooling-Option, sondern eine im Build-Task nicht geschlossene Abdeckung.
**Empfehlung:** Vor einem größeren Refactor von `AutoDriveControls.tsx` nachziehen — am günstigsten in einem eigenen, fokussierten Task, nicht rückwirkend in dieser QA-Runde (Scope-Grenze: `/qa` schreibt laut Skill nur isolierte Unit-Tests für Lücken, keine vollen Komponenten-Interaktionstests einer fremden Datei).

## Nachtrag: Re-Verification der Medium-Fixes (2026-09-24, Diff `12cf229..1cf023e`, dann Korrektur `1cf023e..HEAD`)

Auf Nutzerwunsch wurden BUG-1, BUG-3 und BUG-5 gefixt (Commit `1cf023e`) und anschließend per vollem Drei-Lanes-Fan-out re-verifiziert (mehr als drei Produktionsdateien im Diff → volle Breite laut Skill). BUG-1/BUG-2/BUG-3 bestätigt behoben — Details siehe „Previously Fixed" oben (BUG-1s erster Fixversuch hatte selbst einen Kalibrierfehler, 200 statt 400 Vollschritte, von zwei Lanes unabhängig gefunden und korrigiert). BUG-5 dagegen:

- **BUG-5 — Fix zurückgenommen, Bug bleibt offen (Medium).** Zwei unabhängige Lanes fanden denselben strukturellen Fehler: `waitForStatusMatching(device, s => s.hasStart)` unterscheidet nicht zwischen einer Notify, die tatsächlich vom soeben gesendeten SET_START ausgelöst wurde, und einer beliebigen späteren Notify, die zufällig `hasStart: true` trägt (z. B. weil es schon vorher true war). Schwerwiegender: die Firmware sendet laut `bleNotifyStatusIfChanged()` (`firmware/src/ble.cpp`) nur bei einer **geänderten** Payload — steht der Schlitten beim erneuten „Als Start setzen" bereits exakt an der zuvor gesetzten Startposition, ändert sich am Payload nichts, es kommt keine Notify, und die Wartefunktion läuft nach 2s in einen falschen Timeout, obwohl die Firmware den Befehl korrekt übernommen hat — ein ganz normaler Anwendungsfall beim wiederholten Fahren desselben Presets. Dieser Fix hätte also häufiger einen Fehler-Toast auf dem funktionierenden Pfad gezeigt, als er den ursprünglichen stillen Fehlzustand abgefangen hätte. **Zurückgesetzt** (Commit s. u.) auf das ursprüngliche Fire-and-forget-Verhalten; `waitForStatusMatching()` und seine 4 Tests entfernt. BUG-5 bleibt ein offener, dokumentierter Bug — ein belastbarer Fix braucht eine echte Bestätigung von der Firmware pro Befehl (Protokolländerung: z. B. ein Response-Byte oder ein erzwungenes Notify unabhängig vom Diff-Check), keine App-seitige Vermutung aus dem bestehenden Notify-Diff-Protokoll. Das ist eine Architekturentscheidung, keine Ein-Zeilen-Korrektur — siehe Empfehlung unten.

**Suite nach Korrektur:** 8 Suites, 129 Tests (133 minus die 4 entfernten `waitForStatusMatching`-Tests), alle grün. `tsc --noEmit` sauber. Firmware-Build SUCCESS (RAM 12,4%, Flash 49,0%).

## Production-Ready Entscheidung

**Empfehlung: NEIN, noch nicht.** Keine Critical-Bugs. BUG-1/BUG-2/BUG-3 sind nach Korrektur bestätigt behoben. **BUG-5 bleibt offen (Medium)** — ein Fixversuch wurde bewusst zurückgenommen, weil er den Fehlzustand verschlimmert statt behoben hätte; ein echter Fix braucht eine Protokolländerung in der Firmware (siehe Nachtrag oben) und sollte als eigene, kleine Design-Entscheidung getroffen werden, nicht als Eile-Patch. Alle übrigen Befunde sind Low oder eine Testabdeckungslücke (U-6) und blockieren aus QA-Sicht nicht zwingend den Hardwaretest.

**Was von hier aus nicht geprüft werden konnte** (jedes runtime-AC oben): tatsächliches BLE-Verhalten am echten ESP32, ob der abgeleitete Endpunkt bei realer Fehlpositionierung wirklich zu einem harten Anschlag führt, Rendering von Dialog/Liste/Fehlertexten, `ToastAndroid`-Sichtbarkeit, App-Neustart-Persistenz am echten Gerät, das Verhalten von react-native-ble-plx bei zwei gleichzeitigen Notify-Monitoren auf derselben Characteristic. `probe.kind: none` bedeutet: alles davon bleibt beim menschlichen Hardwaretest, wie schon bei PROJ-1/2/3.

**Bug-Übersicht nach Schweregrad (Stand nach Re-Verification):**
- Critical: 0
- High: 0
- Medium: 1 offen — BUG-5 (SET_START-„Erfolg" ohne belastbare Firmware-Bestätigung; Fix-Versuch zurückgenommen, braucht Protokolländerung) — sowie U-6 als Testabdeckungslücke, nicht als Funktionsbug gezählt
- Low: 7 — BUG-4 (fehlende 60-Zeichen-Grenze), BUG-6 (Validierung kurzzeitig gegen alte Distanz), BUG-7 (`loadedPreset` überlebt Löschung des eigenen Presets), BUG-9 (Save-Dialog prüft `driving` nicht erneut, fraglich erreichbar), U-1 (unhandled rejection bei fremdgeschriebenem Storage-Wert), NEU-2 (korrupter Storage-Wert blockiert save()/remove() dauerhaft), Lost-Update-Race bei schnellem Doppel-Tap auf Speichern
- Behoben und re-verifiziert: BUG-1 (korrigiert, 76800 statt 38400), BUG-2, BUG-3
- Bereits behoben (Owner, Step 6, vorheriger /qa-Lauf): REG-1, REG-2

**Welche Bugs sollen zuerst behoben werden — BUG-5 jetzt als eigene Protokoll-Design-Entscheidung angehen, oder als dokumentiertes Restrisiko in den Hardwaretest gehen?**

Nutzerentscheidung: mit dokumentiertem Restrisiko (BUG-5) in den Hardwaretest gehen, ohne weiteren Fixversuch.

## Hardwaretest (2026-09-24)

Manueller Test durch den Nutzer am echten Slider, Debug-Build (frischer `installDebug`, da die zuvor installierte APK älter als die AsyncStorage-Abhängigkeit war und das native Modul fehlte — separat gefunden und gefixt, kein PROJ-4-Code-Bug). Ergebnis: **alles ok** — Preset speichern/laden/löschen, BUG-1-Korrektur (Presets über die alte 240mm-Grenze hinaus), Start/Ende/Auto-Fahrt funktionieren.

Zwei Beobachtungen während des Tests waren beim Nachfragen kein Bug, sondern bestätigtes Design-Verhalten:
- Preset-Laden aktualisiert sichtbar nur das Dauer-Feld; Distanz/Richtung werden intern gemerkt und erst bei „Als Start setzen" wirksam (AC-5) — keine Regression.
- „Start und Ende müssen sich unterscheiden" blockierte kurzzeitig die Fahrt, nachdem „Als Start setzen" erneut an der bisherigen Endposition gedrückt wurde (`motorSetStart()` löscht `hasEnd` nicht — vorbestehendes, dokumentiertes Verhalten, kein PROJ-4-Fund). Löste sich durch Setzen eines neuen, abweichenden Endpunkts.

**Status: Approved.** BUG-5 bleibt offen und dokumentiert (siehe oben) — akzeptiertes Restrisiko, keine Blockade für den Produktiveinsatz laut Nutzerentscheidung.
