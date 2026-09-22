# PROJ-2 Tasks

> Erzeugt von `/tasks` aus `spec.md` + `design.md`. Der geordnete, nachvollziehbare Build-Plan — die Brücke zwischen dem Vertrag (WAS) und dem Bau (WIE).
> `[P]` = parallelisierbar: die Dateien des Tasks sind disjunkt von jedem anderen `[P]`-Task derselben Ebene, `/build` kann ihn an einen eigenen Subagenten geben.
> Ebenen laufen **sequenziell** (jede ist eine Barriere). Tasks **innerhalb** einer Ebene laufen parallel, wo mit `[P]` markiert. Jeder Task referenziert die AC-IDs aus `spec.md`, die er erfüllt — das ist die AC → Task → Test-Kette.
> Owner: `/tasks` erstellt diese Datei; `/build` hakt die Boxen ab.
> Kein Status-Feld hier — der Feature-Status lebt ausschließlich in `features/INDEX.md`.

## Level 1 — Grundbausteine

<!-- Vier komplett unabhängige Bereiche (Firmware-Motor, App-BLE-Client, App-Zustandsmaschine, App-Connection-Context) → alle [P]. -->

- [x] T1 [P]  Firmware: `motor.h`/`motor.cpp` — `motorSetup()` (TMCStepper-UART + FastAccelStepper-Init), `motorJog(direction, speedPercent)` (kontinuierlicher Lauf, 1–100% → 200–4000 Steps/s linear), `motorStop()`, `motorWatchdogCheck()` (1000ms-Schwelle seit letztem JOG)  · files: firmware/src/motor.h, firmware/src/motor.cpp  · → AC-1, AC-2, AC-6
- [x] T2 [P]  App: `sendJogCommand(device, direction, speedPercent)` + `sendStopCommand(device)` in `ble/client.ts` (Command-Characteristic-UUID, JOG als Write-ohne-Antwort, STOP als Write-mit-Antwort) + `@react-native-community/slider` installieren  · files: src/ble/client.ts, package.json  · → AC-1, AC-2, AC-3
- [x] T3 [P]  App: `useJogState`-Hook — reine Zustandsmaschine `idle`/`jogging_forward`/`jogging_backward`, Übergänge für Press/Release je Richtung, Beide-Tasten-gleichzeitig-Guard (sofort zurück zu `idle`, kein Richtungswechsel) + Unit-Tests, rot-geprüft  · files: src/components/useJogState.ts, src/components/useJogState.test.ts  · → AC-1, AC-2, AC-4, EC-2
- [x] T4 [P]  App: `ConnectionProvider` — Context um `device: Device | null` erweitert (gesetzt/genullt an denselben Stellen wie `deviceRef.current`, `null` außer im Zustand `connected`)  · files: src/connection/ConnectionProvider.tsx  · → Voraussetzung für T7 (kein eigenes AC, rein additive PROJ-1-Erweiterung)

## Level 2 — Verdrahtung

<!-- Drei unabhängige Bereiche, je auf genau einem Level-1-Baustein aufbauend (Firmware-BLE auf T1, Firmware-main auf T1, App-JogControls auf T2+T3+T4) → alle [P]. -->

- [x] T5 [P]  Firmware: Command-Characteristic bekommt echten Write-Callback (Opcode `0x01` JOG → `motorJog()` + Watchdog-Zeitstempel zurücksetzen, Opcode `0x05` STOP → `motorStop()`), Characteristic-Property auf `WRITE | WRITE_NR`, `onDisconnect`-Callback (PROJ-1, bestehend) um `motorStop()` erweitert  · files: firmware/src/ble.cpp  · → AC-1, AC-2, AC-4, AC-5, AC-6, EC-2, EC-3, EC-4
- [x] T6 [P]  Firmware: `main.cpp` — `setup()` ruft zusätzlich `motorSetup()`, `loop()` ruft `motorWatchdogCheck()` (bisher leer)  · files: firmware/src/main.cpp  · → AC-6, EC-4
- [x] T7 [P]  App: `JogControls`-Komponente — `SpeedSlider` (1–100%, Default 50%), `DirectionButtonRow` (zwei `Pressable` mit `onPressIn`/`onPressOut`), `StatusLine`; nutzt `useJogState` (T3) für die Zustandslogik, `device` aus `ConnectionProvider`-Context (T4) und `sendJogCommand`/`sendStopCommand` (T2); 300ms-Intervall sendet JOG wiederholt, solange eine Taste gehalten wird  · files: src/components/JogControls.tsx  · → AC-1, AC-2, AC-3, AC-7, EC-1, EC-5

## Level 3 — Einbindung

- [x] T8  `RootScreen.tsx` — ersetzt `ControlsPlaceholder` im Zustand `connected` durch `<JogControls />`  · files: src/screens/RootScreen.tsx  · → AC-7

## Parallelisierung

- **Ebenen sind Barrieren.** Eine Ebene startet erst, wenn die vorherige vollständig integriert und gegen ihre AC-IDs verifiziert ist.
- **`[P]` setzt disjunkte Dateien voraus.** Zwei `[P]`-Tasks derselben Ebene teilen sich nie einen Pfad unter `files:`.
- **AC-5** (Disconnect während Jog → Firmware stoppt, App zeigt PROJ-1s bestehenden "Verbindung verloren"-Zustand) hat keinen eigenen App-seitigen Task — die App-Seite ist bereits durch PROJ-1s `RootScreen`-Zustandslogik abgedeckt (JogControls wird beim Verlassen von `connected` automatisch unmontiert).
- Während `/build` läuft jeder `[P]`-Task einer aktiven Ebene in einem eigenen Subagenten mit isoliertem Git-Worktree; danach integriert der Haupt-Agent, verifiziert gegen die AC-IDs der Ebene und hakt die Boxen hier ab.
