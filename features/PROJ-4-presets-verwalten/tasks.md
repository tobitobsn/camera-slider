# PROJ-4 Tasks

> Erzeugt von `/tasks` aus `spec.md` + `design.md`. Der geordnete, nachvollziehbare Build-Plan — die Brücke zwischen dem Vertrag (WAS) und dem Bau (WIE).
> `[P]` = parallelisierbar: die Dateien des Tasks sind disjunkt von jedem anderen `[P]`-Task derselben Ebene, `/build` kann ihn an einen eigenen Subagenten geben.
> Ebenen laufen **sequenziell** (jede ist eine Barriere). Tasks **innerhalb** einer Ebene laufen parallel, wo mit `[P]` markiert. Jeder Task referenziert die AC-IDs aus `spec.md`, die er erfüllt — das ist die AC → Task → Test-Kette.
> Owner: `/tasks` erstellt diese Datei; `/build` hakt die Boxen ab.
> Kein Status-Feld hier — der Feature-Status lebt ausschließlich in `features/INDEX.md`.

## Level 1 — Grundbausteine

<!-- Drei komplett unabhängige Bereiche (Firmware-Motor, App-BLE-Protokoll, neuer Presets-Hook) → alle [P]. -->

- [ ] T1 [P]  Firmware: `motor.h`/`motor.cpp` — `motorSetEndFromDistance(endIsAfterStart, distanceSteps)` (verlangt `hasStart`, verweigert bei laufendem Motor oder `autoDriving`, setzt `endPosition = startPosition ± distanceSteps`, `hasEnd = true`); `motorGetStatus()` erweitert um die Endpunkt-Richtung (`endPosition >= startPosition`, nur aussagekräftig wenn `hasStart && hasEnd`)  · files: firmware/src/motor.h, firmware/src/motor.cpp  · → AC-5
- [ ] T2 [P]  App: `src/ble/client.ts` — neuer Export `sendSetEndFromDistanceCommand(device, endIsAfterStart, distanceSteps)` (Opcode `0x06`, Write mit Antwort); `SliderStatus` um `endIsAfterStart: boolean | null` erweitert; `parseStatusPayload()` auf das 6-Byte-Payload angepasst (neues Richtungs-Byte) + Unit-Tests für Encoding/Parsing, rot-geprüft  · files: src/ble/client.ts, src/ble/client.test.ts  · → AC-4, AC-5
- [ ] T3 [P]  App: neuer Hook `usePresets()` — liest/schreibt Presets aus AsyncStorage (`@react-native-async-storage/async-storage` als neue Abhängigkeit ergänzen), `Preset`-Typ (id, name, distanceSteps, endIsAfterStart, durationSeconds, createdAt), liefert `{ presets (nach createdAt absteigend sortiert), save(name, distanceSteps, endIsAfterStart, durationSeconds), remove(id) }`, Fehlerbehandlung bei fehlgeschlagenem Speicherzugriff (EC-4) + Unit-Tests, rot-geprüft  · files: src/components/usePresets.ts, src/components/usePresets.test.ts  · → AC-1, AC-3, AC-6, AC-9, EC-1, EC-4

## Level 2 — Firmware-Verdrahtung & UI

<!-- T4 baut auf T1 auf (Firmware-Funktion muss existieren), T5 baut auf T2 (Protokoll) und T3 (Presets-Hook) auf. Beide Tasks liegen in komplett unterschiedlichen Dateien (Firmware vs. App-Komponente) → beide [P]. -->

- [ ] T4 [P]  Firmware: Command-Callback um Opcode `0x06` (SET_END_FROM_DISTANCE) erweitert, ruft `motorSetEndFromDistance()` auf; `packStatusPayload()` liefert jetzt 6 Byte (neues Endpunkt-Richtung-Byte, additiv)  · files: firmware/src/ble.cpp  · → AC-4, AC-5
- [ ] T5 [P]  App: `AutoDriveControls` erweitert — `SavePresetButton` (sichtbar bei gesetztem Start+Ende+gültiger Dauer) + Speichern-Dialog (Namens-Eingabe, Speichern deaktiviert bei leerem Namen); `PresetList` (Name+Dauer je Zeile, Hinweistext bei leerer Liste, während `driving` gesperrt); Löschen mit Bestätigungsdialog (`Alert.alert`); geladenes Preset als lokaler Komponenten-Zustand (füllt Dauer-Feld, merkt Distanz+Richtung); „Als Start setzen" sendet bei geladenem Preset nach erfolgreicher SET_START-Antwort zusätzlich `sendSetEndFromDistanceCommand`; geladener Zustand wird verworfen bei manuellem Setzen des Endpunkts, beim Laden eines anderen Presets und beim Trennen der Verbindung; Erfolgs-/Fehler-Feedback über `ToastAndroid`  · files: src/components/AutoDriveControls.tsx, src/components/AutoDriveControls.test.ts  · → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, EC-1, EC-2, EC-3, EC-5

## Parallelisierung

- **Ebenen sind Barrieren.** Eine Ebene startet erst, wenn die vorherige vollständig integriert und gegen ihre AC-IDs verifiziert ist.
- **`[P]` setzt disjunkte Dateien voraus.** T1/T2/T3 (Ebene 1) und T4/T5 (Ebene 2) teilen sich jeweils keinen Pfad unter `files:`.
- **T5 ist bewusst nicht weiter aufgeteilt**, obwohl es mehrere sichtbare Teilbereiche abdeckt (Speichern-Dialog, Liste, Löschen, geladener Zustand): `design.md` entscheidet sich ausdrücklich gegen separate Komponenten-Dateien für diese Teile (kein Eltern-Kind-Verhältnis mit Props-Durchreichung), sie leben alle in `AutoDriveControls.tsx` — eine Aufteilung in mehrere `[P]`-Tasks wäre wegen der gemeinsamen Datei ohnehin nicht zulässig.
- Während `/build` läuft jeder `[P]`-Task einer aktiven Ebene in einem eigenen Subagenten mit isoliertem Git-Worktree; danach integriert der Haupt-Agent, verifiziert gegen die AC-IDs der Ebene und hakt die Boxen hier ab.
