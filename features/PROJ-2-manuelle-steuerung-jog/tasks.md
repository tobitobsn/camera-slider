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

## Erweiterung 2026-10-07: Halten im Stillstand (AC-8 bis AC-12, EC-6 bis EC-9)

> Grundlage: `design.md` → „Erweiterung 2026-10-07: Halten im Stillstand". Firmware und App müssen zusammen ausgeliefert werden (Status-Payload wächst auf 11 Byte).

## Level 4 — Grundbausteine (Halten im Stillstand)

<!-- Firmware-Motor, App-BLE-Client und App-Darstellung sind komplett getrennte Dateien → alle [P]. -->

- [ ] T9 [P]  Firmware: Haltestrom (`kHoldCurrentFraction` = 0,6 über `rms_current(1700, 0.6)`, TPOWERDOWN 20, IHOLDDELAY 8); Einstellung per `Preferences` (Namespace `slider`, Schlüssel `hold`, Default an) beim Start laden; an → Auto-Enable aus und Treiber bis zur ersten Fahrt stromlos, aus → Auto-Enable an; `motorSetHold()` merkt nur vor (während der Sperre ignoriert); `motorHoldCheck()` (Sperre → nichts, Fahrt → vorgemerkt lassen, sonst bei Änderung speichern und sofort anwenden: an = Auto-Enable aus + Treiber ein, aus = Auto-Enable an + Treiber aus); Treiber beim Start von `motorJog`/`motorAutoDrive`/`motorTimelapseMoveTo` einschalten, wenn Halten an; `holdAtStandstill` in `MotorStatus`  · files: firmware/src/motor.h, firmware/src/motor.cpp  · → AC-8, AC-9, AC-11, AC-12, EC-6, EC-7, EC-8
- [ ] T10 [P]  App: `sendSetHoldCommand(device, enabled)` (Opcode `0x08`, Write mit Antwort); `SliderStatus.holdAtStandstill` (an/aus/`null`); `parseStatusPayload()` liest Byte 10 Bit 0 nur bei mindestens 11 Byte; Default in `useSliderStatus`; Tests (10 Byte → `null`, 11 Byte an/aus, Reserve-Bits ignoriert)  · files: src/ble/client.ts, src/ble/client.test.ts, src/components/useSliderStatus.ts  · → AC-10, EC-9
- [ ] T11 [P]  App: `HoldSwitchRow` — rein darstellend: Text „Motor hält im Stillstand", Switch im Stil von „Video aufnehmen", Fehlerzeile „Einstellung konnte nicht übertragen werden"; Props: Wert, nicht bedienbar, Umschalt-Callback, Fehler; Render-Test  · files: src/components/HoldSwitchRow.tsx, src/components/HoldSwitchRow.render.test.ts  · → AC-10, EC-7

## Level 5 — Verdrahtung (Halten im Stillstand)

<!-- Firmware-BLE (auf T9), Firmware-main (auf T9) und App-Schalterlogik (auf T10+T11) berühren je eigene Dateien → alle [P]. -->

- [ ] T12 [P]  Firmware: Opcode `0x08` SET_HOLD (genau 2 Byte, Wert `0x00`/`0x01`, sonst ignorieren) → `motorSetHold()`; Status-Payload von 10 auf 11 Byte (Byte 10 Bit 0 = `holdAtStandstill`, Bits 1–7 = 0), `gLastStatusPayload` mitwachsen lassen  · files: firmware/src/ble.cpp  · → AC-10, AC-11, EC-9
- [ ] T13 [P]  Firmware: `loop()` ruft `motorHoldCheck()` auf  · files: firmware/src/main.cpp  · → AC-10, EC-6
- [ ] T14 [P]  App: Hook `useHoldSetting` (vorgemerkter Wert bis zum passenden Status, bei Sendefehler zurück + Fehler, Fehler weg beim nächsten Erfolg) + Unit-Tests; `JogControls` rendert `HoldSwitchRow` unter dem Geschwindigkeitsregler, eigene Props (`holdAtStandstill`, `holdLocked`) statt `disabled`, Zeile ausgeblendet bei `null`  · files: src/components/useHoldSetting.ts, src/components/useHoldSetting.test.ts, src/components/JogControls.tsx  · → AC-10, EC-6, EC-9

## Level 6 — Einbindung (Halten im Stillstand)

- [ ] T15 [P]  `RootScreen` reicht `status.holdAtStandstill` und `status.batteryLocked` aus dem bestehenden `useSliderStatus(device)` an `JogControls` durch  · files: src/screens/RootScreen.tsx  · → AC-10, EC-7
- [ ] T16 [P]  Stack-Pack nachziehen: Haltemodus statt festem `setAutoEnable(true)`, IHOLD/TPOWERDOWN/IHOLDDELAY, NVS-Schlüssel `slider`/`hold`  · files: docs/stacks/firmware-esp32-tmc2209.md  · → AC-8, AC-11

## Parallelisierung

- **Ebenen sind Barrieren.** Eine Ebene startet erst, wenn die vorherige vollständig integriert und gegen ihre AC-IDs verifiziert ist.
- **`[P]` setzt disjunkte Dateien voraus.** Zwei `[P]`-Tasks derselben Ebene teilen sich nie einen Pfad unter `files:`.
- **AC-5** (Disconnect während Jog → Firmware stoppt, App zeigt PROJ-1s bestehenden "Verbindung verloren"-Zustand) hat keinen eigenen App-seitigen Task — die App-Seite ist bereits durch PROJ-1s `RootScreen`-Zustandslogik abgedeckt (JogControls wird beim Verlassen von `connected` automatisch unmontiert).
- Während `/build` läuft jeder `[P]`-Task einer aktiven Ebene in einem eigenen Subagenten mit isoliertem Git-Worktree; danach integriert der Haupt-Agent, verifiziert gegen die AC-IDs der Ebene und hakt die Boxen hier ab.
- **Halten im Stillstand:** Der Hardwaretest auf schräger Schiene (Haltemoment bei 60 %, Wärme von Motor/Treiber, Akkulaufzeit) ist kein Build-Task. Ihn übernimmt `/qa` gegen den echten Slider. Für die Firmware gibt es keinen automatisierten Test (`none`).
