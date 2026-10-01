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

- [x] T10 [user]  Kalibrierung messen: Firmware aus Ebene 2 geflasht, Akkuspannung mit dem Multimeter messen, gleichzeitig den Wert `battery: … mV` im Serial-Monitor ablesen, Verhältnis Multimeter ÷ Firmware an `/build` durchgeben  · where: Multimeter an Akku-Plus/GND; Serial-Monitor 115200 Baud (`pio device monitor`)  · → AC-1, AC-7
- [x] T11  Kalibrierfaktor setzen und neu flashen  · files: firmware/src/battery.cpp  · → AC-1, AC-7

> T10 erledigt 2026-09-30: Nutzer hat im Akkubetrieb 12,2 V am Akku und 2,12 V an GPIO 34 gemessen; der Firmware-Wert (12 280 mV) wurde per BLE vom Mac gelesen, weil USB und Akku nicht gleichzeitig angeschlossen werden können. Faktor 0,993 (T11).

## Ebene 4 — Grundlagen der Erweiterung (Refine 2026-09-30: AC-12, AC-13, EC-7, EC-8, BUG-3..7)

- [x] T12 [P]  Firmware-Akku-Modul erweitern: „Akku seit Start erkannt" (RAM, beim ersten Wert ≥ 5000 mV gesetzt, nie zurückgesetzt); ist er gesetzt und liegt der Schutzwert 5000 ms ununterbrochen < 5000 mV → `motorLockout(Grund „Messung gestört")`, getrennter Zähler vom Leer-Zähler (der ruft `motorLockout(Grund „Akku leer")`); nach der Sperre 60-s-Countdown (`batteryShutdownSeconds()`, 60 → 0, `0` ohne Sperre), danach `motorPrepareDeepSleep()` und Tiefschlaf ohne Weckquelle; BUG-3: Ruhe-Mittelwert neu beginnen, wenn eine Messung die 5000-mV-Grenze kreuzt, erster Wert danach sofort übernehmen; BUG-6: Anzeige-Rundung eines Werts < 5000 mV höchstens auf 4980 mV  · files: firmware/src/battery.h, firmware/src/battery.cpp  · → AC-12, AC-13, EC-4, EC-7
- [x] T13 [P]  Motor-Firmware: `motorLockout(Grund)` (Grund: Akku leer / Messung gestört), `motorLockReason()`; beim Sperren Treiber abschalten (TMC2209 per UART deaktivieren, EN-Pin GPIO 27 HIGH, Auto-Enable aus); `motorPrepareDeepSleep()` hält EN (RTC-fähiger Pin) im Tiefschlaf auf HIGH; `MotorStatus` um den Sperrgrund erweitert  · files: firmware/src/motor.h, firmware/src/motor.cpp  · → AC-12, AC-13
- [x] T14 [P]  App-Datenformat: Byte 8 → `lockReason` (`none`/`lowBattery`/`measurementFault`, unbekannt → `none`; ohne Byte 8 aber bit6 → `lowBattery`), Byte 9 → `shutdownSeconds` (1–60, sonst `null`); BUG-7: Plausibilitätsgrenze 13 500 mV; `SliderStatus` + Anfangszustand erweitert; Tests  · files: src/ble/client.ts, src/ble/client.test.ts, src/components/useSliderStatus.ts, src/components/useSliderStatus.test.ts  · → AC-12, AC-13, EC-8

## Ebene 5 — Verdrahten und Oberfläche der Erweiterung

- [x] T15  Firmware-Status auf 10 Byte: Byte 8 Sperrgrund aus `MotorStatus`, Byte 9 `batteryShutdownSeconds()`; Puffer 8 → 10; Firmware kompiliert  · files: firmware/src/ble.cpp  · → AC-12, AC-13, EC-8
- [x] T16 [P]  Banner nach Grund („Akku leer – bitte laden" / „Akkumessung gestört – bitte Verkabelung prüfen"), Zeile „Slider schaltet sich in N s ab" bei Restsekunden, Hinweis „Bitte schalte den Slider aus und lade den Akku"; Test; `RootScreen` reicht Grund + Sekunden ans Banner und die Akku-Sperre getrennt als `batteryLocked` an `AutoDriveControls` (statt über `disabled`)  · files: src/components/BatteryLockBanner.tsx, src/components/BatteryLockBanner.test.ts, src/screens/RootScreen.tsx  · → AC-9, AC-12, AC-13, EC-8
- [x] T17 [P]  BUG-4: neue Prop `batteryLocked` in `AutoDriveControls` sperrt nur Fahrt-Auslöser, Setzen und Preset laden; „Als Preset speichern" und „Löschen" bleiben bedienbar; `disabled` (Zeitraffer läuft) unverändert  · files: src/components/AutoDriveControls.tsx  · → AC-9
- [x] T18 [P]  BUG-5: `start()` prüft die Sperre selbst und startet nicht; Meldung nach Grund („Akku leer – Bewegung gestoppt" / „Akkumessung gestört – Bewegung gestoppt"), ebenso beim Beenden einer laufenden Sequenz; Tests  · files: src/components/useTimelapseSequence.ts, src/components/useTimelapseSequence.test.ts  · → AC-10, AC-13

## Ebene 6 — Hardware-Test der Erweiterung

- [x] T19 [user]  Mit Labornetzteil: (1) unter 9,3 V → Stopp, Banner mit Countdown, nach 60 s Verbindung weg, Slider reagiert bis Reset nicht; (2) im Akkubetrieb den Spannungsteiler abziehen → „Akkumessung gestört", Countdown, Abschaltung; (3) Start am USB → keine Sperre; (4) optional Stromaufnahme im Tiefschlaf messen  · where: Labornetzteil statt Akku, App verbunden  · → AC-12, AC-13, EC-7, EC-8

> T19 erledigt 2026-09-30 (Nutzer, Labornetzteil): Stopp + Banner „Akku leer" mit Countdown + Abschaltung nach 60 s, Reaktion erst nach Reset; Spannungsteiler abgezogen → „Akkumessung gestört" + Abschaltung; USB-Start ohne Sperre — „alles ok". Der Schlitten lässt sich im Tiefschlaf nicht schieben, aber genauso wenig ohne jeden Strom → mechanisches Halten (Rastmoment/Antrieb), Treiber ist aus.

## Parallelisierung

- **Ebenen sind Schranken.** Ebene 2 startet erst, wenn Ebene 1 integriert und verifiziert ist.
- **`[P]` verlangt disjunkte Dateien** — in jeder Ebene geprüft: keine zwei `[P]`-Tasks teilen einen Pfad.
- **T1 ↔ T2:** T1 ruft `motorLockout()` und prüft, ob der Stepper läuft; T2 deklariert `motorLockout()` und `motorIsLocked()` in `motor.h`. Namen sind hier festgelegt, damit beide parallel laufen können; T5 verbindet beide in Ebene 2.
- **T12 ↔ T13:** Namen `motorLockout(Grund)`, `motorLockReason()`, `motorPrepareDeepSleep()` sind hier festgelegt; T15 verbindet beide.
- **T16 ↔ T17:** T16 übergibt `batteryLocked` an `AutoDriveControls`, T17 nimmt die Prop an — Name hier festgelegt.
- **T10 ist ein `[user]`-Task:** `/build` übergibt ihn nach Ebene 2 mit Anleitung; T11 wartet auf den Wert.
