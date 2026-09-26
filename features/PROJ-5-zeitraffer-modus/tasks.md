# PROJ-5 Tasks

> Erzeugt von `/tasks` aus `spec.md` + `design.md`. Der geordnete, nachvollziehbare Build-Plan — die Brücke zwischen dem Vertrag (WAS) und dem Bau (WIE).
> `[P]` = parallelisierbar: die Dateien des Tasks sind disjunkt von jedem anderen `[P]`-Task derselben Ebene, `/build` kann ihn an einen eigenen Subagenten geben.
> Ebenen laufen **sequenziell** (jede ist eine Barriere). Tasks **innerhalb** einer Ebene laufen parallel, wo mit `[P]` markiert. Jeder Task referenziert die AC-IDs aus `spec.md`, die er erfüllt — das ist die AC → Task → Test-Kette.
> Owner: `/tasks` erstellt diese Datei; `/build` hakt die Boxen ab.
> Kein Status-Feld hier — der Feature-Status lebt ausschließlich in `features/INDEX.md`.

## Level 1 — Grundbausteine

<!-- Drei komplett unabhängige Bereiche (Firmware-Motor, App-BLE-Protokoll, Geräte-Fähigkeiten-Hooks) → alle [P]. -->

- [ ] T1 [P]  Firmware: `motor.h`/`motor.cpp` — `motorTimelapseMoveTo(direction, distanceSteps)` (verlangt `hasStart`, verweigert bei laufendem Motor, `autoDriving` oder bereits laufender `timelapseMoving`-Bewegung, sowie bei Distanz über `kMaxPlausibleDistanceSteps`; bewegt zu `startPosition ± distanceSteps`, lässt `startPosition`/`endPosition`/`hasEnd` unangetastet) und `motorTimelapseMoveCheck()` (analog `motorAutoDriveCheck()`, setzt `timelapseMoving = false` nach Ankunft); `motorGetStatus()` liefert zusätzlich `timelapseMoving` (Bit 5); `motorStop()` setzt `timelapseMoving = false` zusätzlich zu `autoDriving = false`; `motorWatchdogCheck()` und `motorAutoDrive()` bekommen je eine zusätzliche Sperrbedingung (`!timelapseMoving`)  · files: firmware/src/motor.h, firmware/src/motor.cpp  · → AC-1, AC-2, AC-4, AC-6, AC-9
- [ ] T2 [P]  App: `src/ble/client.ts` — neuer Export `sendTimelapseMoveCommand(device, direction, distanceStepsFromStart)` (Opcode `0x07`, Write mit Antwort); `SliderStatus` um `timelapseMoving: boolean` erweitert; `parseStatusPayload()` liest Bit 5 aus Byte 0 + Unit-Tests für Encoding/Parsing, rot-geprüft  · files: src/ble/client.ts, src/ble/client.test.ts  · → AC-1, AC-6
- [ ] T3 [P]  App: neue Hooks `useCameraCapture()` (Kamera-Berechtigung über `useCameraPermission`, Foto aufnehmen über `usePhotoOutput`/`capturePhotoToFile`, Speichern in die Geräte-Galerie über `@react-native-camera-roll/camera-roll`, stellt die Vorschau-Bausteine für `CameraPreview` bereit) und `useKeepAwake()` (aktiviert/deaktiviert Bildschirm-Wachhalten); `react-native-vision-camera`, `@react-native-camera-roll/camera-roll` und eine Keep-Awake-Bibliothek als neue Abhängigkeiten ergänzen (gegen New-Architecture-Kompatibilität verifizieren) + Unit-Tests, rot-geprüft  · files: src/components/useCameraCapture.ts, src/components/useCameraCapture.test.ts, src/components/useKeepAwake.ts, src/components/useKeepAwake.test.ts, package.json, package-lock.json  · → AC-5, AC-8, AC-10

## Level 2 — Firmware-Verdrahtung & Sequenz-Hook

<!-- T4 baut auf T1 auf (Firmware-Funktion muss existieren), T5 baut auf T2 (Protokoll) und T3 (Geräte-Fähigkeiten) auf. Beide Tasks liegen in komplett unterschiedlichen Dateien → beide [P]. -->

- [ ] T4 [P]  Firmware: Command-Callback um Opcode `0x07` (TIMELAPSE_MOVE) erweitert, ruft `motorTimelapseMoveTo()` auf; `packStatusPayload()` liefert zusätzlich Bit 5 (`timelapseMoving`), Byte-Anzahl bleibt bei 6  · files: firmware/src/ble.cpp  · → AC-1, AC-6
- [ ] T5 [P]  App: neuer Hook `useTimelapseSequence(device)` — vollständige Ablaufsteuerung: erste Aufnahme sofort am Startpunkt, danach (Anzahl−1) Schritte (Zielposition je Schritt direkt aus `Gesamtdistanz * i/(Anzahl-1)` berechnet, nicht aufsummiert), je Schritt `sendTimelapseMoveCommand` senden, zweistufig auf `timelapseMoving: true` dann `false` warten, feste Settle-Pause, Foto über `useCameraCapture()` auslösen, Rest des Intervalls abwarten; nach dem letzten Schritt bestehenden `sendAutoDriveCommand` (Ende→Start) senden; `stop()` sendet `sendStopCommand` und beendet die Sequenz ohne Rückfahrt; aktiviert/deaktiviert `useKeepAwake()` über den gesamten Sequenz-Lebenszyklus; ein fehlgeschlagener Schritt (Zeitüberschreitung beim ersten Warte-Schritt, fehlgeschlagene Aufnahme, Verbindungsabbruch) beendet die Sequenz sofort mit Fehler + Unit-Tests, rot-geprüft  · files: src/components/useTimelapseSequence.ts, src/components/useTimelapseSequence.test.ts  · → AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-10, EC-3, EC-4

## Level 3 — UI

<!-- T6 hebt den geteilten "Zeitraffer läuft"-Zustand nach RootScreen (baut auf T5s Schnittstelle auf), T7 ist die eigentliche neue Komponente (baut auf T5 + T3 auf, per Props aus T6). Disjunkte Dateien → beide [P]. -->

- [ ] T6 [P]  App: `RootScreen.tsx` ruft `useTimelapseSequence(device)` auf (wie es `useSliderStatus(device)` bereits für `driving` tut) und reicht den daraus resultierenden "läuft"-Zustand als zusätzliche Sperre durch: in `JogControls`s bestehenden `disabled`-Prop hinein-ge-ORt, `AutoDriveControls` bekommt einen neuen `disabled`-Prop dafür; rendert die neue `TimelapseControls`-Komponente und reicht ihr die volle `useTimelapseSequence`-Schnittstelle als Props durch  · files: src/screens/RootScreen.tsx, src/components/JogControls.tsx, src/components/AutoDriveControls.tsx  · → AC-9
- [ ] T7 [P]  App: neue Komponente `TimelapseControls` — Kamera-Vorschau (`useCameraCapture()`), Eingabe Anzahl Aufnahmen (2–999) und Intervall (1–3600s) mit Validierung, berechnete Gesamtdauer-Anzeige, Start-Button (aktiv bei gesetztem Start+Ende, Schlitten exakt am Start, Kamera-Berechtigung erteilt, keine andere Fahrt aktiv — eigene `useSliderStatus(device)`-Subscription wie `AutoDriveControls`), Fortschrittsanzeige ("Aufnahme X von Y" + Restzeit) während laufender Sequenz, Stopp-Button, Berechtigungs-Hinweis bei fehlender Kamera-Berechtigung; empfängt die `useTimelapseSequence`-Schnittstelle als Props (aus T6) + Unit-Tests, rot-geprüft  · files: src/components/TimelapseControls.tsx, src/components/TimelapseControls.test.ts  · → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10, EC-1, EC-2, EC-3, EC-4

## Parallelisierung

- **Ebenen sind Barrieren.** Eine Ebene startet erst, wenn die vorherige vollständig integriert und gegen ihre AC-IDs verifiziert ist.
- **`[P]` setzt disjunkte Dateien voraus.** T1/T2/T3 (Ebene 1), T4/T5 (Ebene 2) und T6/T7 (Ebene 3) teilen sich jeweils keinen Pfad unter `files:`. T3 bündelt bewusst zwei kleine, unabhängige Hooks (`useCameraCapture`/`useKeepAwake`) in einem Task, weil beide `package.json`/`package-lock.json` anfassen — zwei getrennte `[P]`-Tasks hätten dort kollidiert.
- Während `/build` läuft jeder `[P]`-Task einer aktiven Ebene in einem eigenen Subagenten mit isoliertem Git-Worktree; danach integriert der Haupt-Agent, verifiziert gegen die AC-IDs der Ebene und hakt die Boxen hier ab.
