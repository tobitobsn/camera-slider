# PROJ-3 Tasks

> Erzeugt von `/tasks` aus `spec.md` + `design.md`. Der geordnete, nachvollziehbare Build-Plan — die Brücke zwischen dem Vertrag (WAS) und dem Bau (WIE).
> `[P]` = parallelisierbar: die Dateien des Tasks sind disjunkt von jedem anderen `[P]`-Task derselben Ebene, `/build` kann ihn an einen eigenen Subagenten geben.
> Ebenen laufen **sequenziell** (jede ist eine Barriere). Tasks **innerhalb** einer Ebene laufen parallel, wo mit `[P]` markiert. Jeder Task referenziert die AC-IDs aus `spec.md`, die er erfüllt — das ist die AC → Task → Test-Kette.
> Owner: `/tasks` erstellt diese Datei; `/build` hakt die Boxen ab.
> Kein Status-Feld hier — der Feature-Status lebt ausschließlich in `features/INDEX.md`.

## Level 1 — Grundbausteine

<!-- Drei komplett unabhängige Bereiche (Firmware-Motor, App-BLE-Client, JogControls' neue disabled-Prop) → alle [P]. -->

- [x] T1 [P]  Firmware: `motor.h`/`motor.cpp` — absolute Positions-Verfolgung (`getCurrentPosition()`), `motorSetStart()`/`motorSetEnd()` (merken sich die aktuelle Position), `motorAutoDrive(direction, durationDeciseconds)` (berechnet Geschwindigkeit aus eigener Distanz-Kenntnis, validiert 200–4000 Steps/s, startet `moveTo()`), `motorAutoDriveCheck()` (erkennt Zielankunft über `isRunning()`), `motorGetStatus()` (liefert Flags + Distanz), `motorClearPoints()` (setzt `hasStart`/`hasEnd` zurück); `motorWatchdogCheck()` erweitert um `autoDriving`-Guard (EC-4), `motorStop()` erweitert um Reset von `autoDriving`  · files: firmware/src/motor.h, firmware/src/motor.cpp  · → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-10, EC-1, EC-2, EC-4
- [x] T2 [P]  App: `src/ble/client.ts` — neue Exporte `sendSetStartCommand(device)`, `sendSetEndCommand(device)`, `sendAutoDriveCommand(device, direction, durationSeconds)` (Write mit Antwort), neue Konstante `SLIDER_STATUS_CHAR_UUID`, `subscribeToStatus(device, callback)` inkl. reiner `parseStatusPayload()`-Funktion (Flags-Bitfeld + Distanz aus der Notify-Payload) + Unit-Tests für Encoding/Parsing, rot-geprüft  · files: src/ble/client.ts, src/ble/client.test.ts  · → AC-1, AC-2, AC-3, AC-4, AC-6
- [x] T3 [P]  App: `JogControls` — neue `disabled`-Prop (deaktiviert Jog-Tasten optisch und funktional, wenn `true`)  · files: src/components/JogControls.tsx  · → AC-9

## Level 2 — Firmware-Verdrahtung & Status-Hook

<!-- Zwei unabhängige Bereiche, je auf genau einem Level-1-Baustein aufbauend (Firmware-BLE auf T1, App-Status-Hook auf T2) → beide [P]. -->

- [ ] T4 [P]  Firmware: Command-Callback um Opcodes `0x02` SET_START, `0x03` SET_END, `0x04` AUTO_DRIVE erweitert (neben bestehendem JOG/STOP), ruft die neuen `motor.cpp`-Funktionen auf; Status-Characteristic sendet echte `notify()`-Aufrufe aus `loop()` bei Zustandsänderung (Payload aus `motorGetStatus()`); `onConnect` (PROJ-1, bestehend) ruft zusätzlich `motorClearPoints()` auf (EC-3)  · files: firmware/src/ble.cpp, firmware/src/ble.h, firmware/src/main.cpp  · → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, EC-1, EC-2, EC-3
- [ ] T5 [P]  App: `useSliderStatus(device)`-Hook — abonniert die Status-Characteristic über `client.ts`s `subscribeToStatus`, hält `{hasStart, hasEnd, atStart, atEnd, driving, distanceSteps}` als React-State + Unit-Tests  · files: src/components/useSliderStatus.ts, src/components/useSliderStatus.test.ts  · → AC-7, AC-8, AC-9

## Level 3 — AutoDriveControls

<!-- Einzelner Task, braucht sowohl T2 (Befehle senden) als auch T5 (Status lesen) — kann nicht parallel zu T5 laufen, deshalb eigene Ebene. -->

- [ ] T6  App: `AutoDriveControls`-Komponente — `PointButtons` ("Als Start setzen"/"Als Ende setzen"), `DurationInput` (Sekunden, Live-Validierung gegen den aus `distanceSteps` berechneten erlaubten Bereich), `DriveButtonRow` ("Start → Ende"/"Ende → Start", aktiviert je nach `hasStart`/`hasEnd`/`atStart`/`atEnd`/`distanceSteps > 0`), `StopButton` (nur während `driving` aktiv), `StatusLine`; nutzt `useSliderStatus` (T5) für den Zustand und `sendSetStartCommand`/`sendSetEndCommand`/`sendAutoDriveCommand`/`sendStopCommand` (T2, STOP wiederverwendet aus PROJ-2) zum Senden  · files: src/components/AutoDriveControls.tsx  · → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, EC-1

## Level 4 — Einbindung

- [ ] T7  `RootScreen.tsx` — rendert `<AutoDriveControls />` neben `<JogControls disabled={status.driving} />` im Zustand `connected`; `useSliderStatus` wird hier (oder in einer gemeinsamen Stelle) einmal aufgerufen und an beide Komponenten weitergereicht  · files: src/screens/RootScreen.tsx  · → AC-9

## Parallelisierung

- **Ebenen sind Barrieren.** Eine Ebene startet erst, wenn die vorherige vollständig integriert und gegen ihre AC-IDs verifiziert ist.
- **`[P]` setzt disjunkte Dateien voraus.** Zwei `[P]`-Tasks derselben Ebene teilen sich nie einen Pfad unter `files:`.
- **T6 ist bewusst nicht `[P]`** und läuft in einer eigenen Ebene — es ist der einzige Task, der sowohl das App-BLE-Client-Modul (T2, Level 1) als auch den Status-Hook (T5, Level 2) braucht, kann also erst nach beiden vollständig integrierten Ebenen gebaut werden.
- **AC-10** (Disconnect während Auto-Fahrt → Firmware stoppt) braucht keinen eigenen Verdrahtungs-Task — `onDisconnect` ruft in PROJ-2 bereits `motorStop()` auf, T1s Erweiterung von `motorStop()` (Reset von `autoDriving`) deckt den Rest ab.
- Während `/build` läuft jeder `[P]`-Task einer aktiven Ebene in einem eigenen Subagenten mit isoliertem Git-Worktree; danach integriert der Haupt-Agent, verifiziert gegen die AC-IDs der Ebene und hakt die Boxen hier ab.
