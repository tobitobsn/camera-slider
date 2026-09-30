# PROJ-6 Tasks

> Erzeugt von `/tasks` aus `spec.md` + `design.md`. Der geordnete, rückverfolgbare Bauplan — die Brücke zwischen Vertrag (WAS) und Build (WIE).
> `[P]` = parallelisierbar: die Dateien des Tasks überschneiden sich mit keinem anderen `[P]`-Task derselben Ebene.
> Ebenen laufen **nacheinander** (jede ist eine Schranke). Jeder Task nennt die AC-/EC-IDs aus `spec.md`, die er erfüllt (AC → Task → Test).
> `[user]` = nur der Nutzer kann es tun: `where:` statt `files:`, nie `[P]`, vom Nutzer abgehakt.
> Eigentümer: `/tasks` legt diese Datei an; `/build` hakt ab — außer `[user]`-Tasks.

## Ebene 1 — Grundlagen (Firmware-Module, Datenformat, Rechenlogik)

- [x] T1 [P]  Firmware-Modul Akku: ADC an GPIO 34 (11 dB), Messung alle 200 ms (Mittel aus 16 Werten, kalibrierte Millivolt × Teilerfaktor 126/22 × Kalibrierfaktor 1,000), Anzeigewert nur im Stillstand (höchstens alle 10 s übernommen, auf 20 mV gerundet, 0 = noch kein Wert), Schutzwert jede Messung, Zähler „≥ 5000 mV und < 9300 mV für 5000 ms ununterbrochen" → `motorLockout()`, solange gesperrt einen laufenden Stepper erneut stoppen, Serial-Ausgabe `battery: … mV` für die Kalibrierung; öffentliche Funktionen `batterySetup()`, `batteryUpdate()`, `batteryDisplayMillivolts()`, `batteryIsLocked()`  · files: firmware/src/battery.h, firmware/src/battery.cpp  · → AC-2, AC-3, AC-7, AC-8, AC-11, EC-1, EC-3
- [x] T2 [P]  Motor-Sperre: Sperr-Flag (RAM, nur Neustart hebt auf), `motorLockout()` (Flag setzen, dann `motorStop()`), `motorIsLocked()`, Ablehnung am Anfang von `motorJog()`, `motorAutoDrive()`, `motorTimelapseMoveTo()`; `MotorStatus` um `locked` und `moving` (Stepper läuft) erweitern  · files: firmware/src/motor.h, firmware/src/motor.cpp  · → AC-3, AC-7, AC-8, EC-3
- [x] T3 [P]  App-Datenformat: `parseStatusPayload()` liest 8 Byte (bit6 `batteryLocked`, bit7 `moving`, Bytes 6–7 Millivolt LE; `0` oder > 20000 → `null`), 6-Byte-Payload alter Firmware → `batteryMillivolts: null`, `batteryLocked: false`, `moving: false`; `SliderStatus` und Anfangszustand in `useSliderStatus` erweitert; Tests  · files: src/ble/client.ts, src/ble/client.test.ts, src/components/useSliderStatus.ts, src/components/useSliderStatus.test.ts  · → AC-1, AC-3, AC-9, AC-11, EC-5
- [x] T4 [P]  App-Rechenlogik: reine Funktionen `batteryPercent(millivolts)` (Kennlinie aus design.md, lineare Interpolation, 0–100, `null` bei `null` oder < 5000 mV) und `batteryLevel(percent)` (`unknown` / `ok` ≥ 20 / `low` < 20 / `critical` < 10); Tests inkl. Stützpunkte, Grenzen 20/10, 5000 mV, `null`  · files: src/components/battery.ts, src/components/battery.test.ts  · → AC-1, AC-4, AC-5, AC-11, EC-4

## Ebene 2 — Verdrahten (Firmware) und Oberfläche (App)

- [x] T5  Firmware verdrahten: `packStatusPayload()` auf 8 Byte (bit6 locked, bit7 moving, Bytes 6–7 `batteryDisplayMillivolts()` LE), Puffergrößen 6 → 8; `batterySetup()` in `setup()`, `batteryUpdate()` in `loop()` vor `bleNotifyStatusIfChanged()`; Firmware kompiliert  · files: firmware/src/ble.cpp, firmware/src/main.cpp  · → AC-1, AC-2, AC-7
- [x] T6 [P]  Akkuanzeige im Header: `BatteryIndicator` (🔋 + Prozent oder „🔋 –", Farbe normal / orange < 20 % / rot < 10 %, abgeschwächt solange `moving`), rechts im `ConnectionHeader`, nur im Zustand `connected`, liest `useSliderStatus(device)`  · files: src/components/BatteryIndicator.tsx, src/components/ConnectionHeader.tsx  · → AC-1, AC-2, AC-3, AC-4, AC-5, AC-11, EC-4, EC-5
- [x] T7 [P]  Sperre in der Oberfläche: `BatteryLockBanner` („Akku leer – bitte laden", dauerhaft, rot) unter dem Header bei `batteryLocked`; `disabled` von JogControls, AutoDriveControls und TimelapseControls um „oder batteryLocked" ergänzt  · files: src/components/BatteryLockBanner.tsx, src/screens/RootScreen.tsx  · → AC-9, EC-2
- [x] T8 [P]  Nachfrage bei < 10 %: vor „Start → Ende" / „Ende → Start" und vor „Zeitraffer starten" bei `batteryLevel === critical` Dialog „Akku fast leer – Fahrt trotzdem starten?" (Abbrechen / Trotzdem starten); kein Dialog bei `unknown`  · files: src/components/AutoDriveControls.tsx, src/components/TimelapseControls.tsx  · → AC-6, EC-6
- [x] T9 [P]  Zeitraffer bei Sperre beenden: wechselt `batteryLocked` während einer laufenden Sequenz auf ja → `finishRun` mit „Akku leer – Bewegung gestoppt" (keine weitere Aufnahme, keine Rückfahrt); Test  · files: src/components/useTimelapseSequence.ts, src/components/useTimelapseSequence.test.ts  · → AC-10, EC-6

## Ebene 3 — Kalibrierung

- [ ] T10 [user]  Kalibrierung messen: Firmware aus Ebene 2 geflasht, Akkuspannung mit dem Multimeter messen, gleichzeitig den Wert `battery: … mV` im Serial-Monitor ablesen, Verhältnis Multimeter ÷ Firmware an `/build` durchgeben  · where: Multimeter an Akku-Plus/GND; Serial-Monitor 115200 Baud (`pio device monitor`)  · → AC-1, AC-7
- [ ] T11  Kalibrierfaktor setzen und neu flashen  · files: firmware/src/battery.cpp  · → AC-1, AC-7

## Parallelisierung

- **Ebenen sind Schranken.** Ebene 2 startet erst, wenn Ebene 1 integriert und verifiziert ist.
- **`[P]` verlangt disjunkte Dateien** — in jeder Ebene geprüft: keine zwei `[P]`-Tasks teilen einen Pfad.
- **T1 ↔ T2:** T1 ruft `motorLockout()` und prüft, ob der Stepper läuft; T2 deklariert `motorLockout()` und `motorIsLocked()` in `motor.h`. Namen sind hier festgelegt, damit beide parallel laufen können; T5 verbindet beide in Ebene 2.
- **T10 ist ein `[user]`-Task:** `/build` übergibt ihn nach Ebene 2 mit Anleitung; T11 wartet auf den Wert.
