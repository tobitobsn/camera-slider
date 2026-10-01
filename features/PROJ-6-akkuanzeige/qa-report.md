# QA Test Results — PROJ-6 Akkuanzeige

**Getestet:** 2026-09-30
**App-URL:** nicht ausführbar hier (`probe.kind: none`, App und Layer `firmware`) — jede Laufzeit-Prüfung ist unten `[!] NOT VERIFIED`, sofern sie nicht durch den protokollierten Nutzer-Test abgedeckt ist
**Tester:** QA Engineer (AI) — drei unabhängige `qa-engineer`-Lanes (Acceptance, Security, Regression), zusammengeführt vom Owner
**Scope:** `full` (erster QA-Lauf); Diff gegenüber `main`: `firmware/src/battery.{h,cpp}` (neu), `motor.{h,cpp}`, `ble.cpp`, `main.cpp`, `src/ble/client.ts`, `src/components/battery.ts` (neu), `BatteryIndicator.tsx` (neu), `BatteryLockBanner.tsx` (neu), `ConnectionHeader.tsx`, `src/screens/RootScreen.tsx`, `AutoDriveControls.tsx`, `TimelapseControls.tsx`, `useTimelapseSequence.ts`, `useSliderStatus.ts` + Tests

> Legende: `[x]` in diesem Lauf verifiziert (Beleg erforderlich) · `[ ] BUG` als fehlerhaft verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund erforderlich)

## Automatisierte Tests (Step 5)

- [x] App: `npm test` → 15 Suites, 228 Tests, 0 Fehler (`suite11.log`); `npx tsc --noEmit` 0 Fehler; `npx eslint` auf die geänderten Dateien 0 Errors (nur Stil-Warnungen `no-bitwise`/`no-void`)
- [x] Firmware: `pio run -e esp32dev` → SUCCESS (RAM 12,4 %, Flash 49,1 %), ohne Upload
- [x] Neue Tests beim Build per Red-Check geprüft (`battery.test.ts`, `client.test.ts`-Block „PROJ-6 battery fields", `BatteryIndicator.test.ts`, `useTimelapseSequence.test.ts` AC-10); bestehende Tests nicht abgeschwächt (`git diff main..HEAD -- 'src/**/*.test.ts' | grep '^-'` leer)
- [!] Layer `firmware`: NOT VERIFIED — no test command recorded for layer firmware. Ersatz: Node-Nachbau der Logik aus `battery.cpp` mit uint32-`millis()`-Arithmetik (`scratchpad/p6acc/fwsim.js`, `ec4.js`)
- E2E: not run (run /e2e-tests for critical flows) — keine E2E-Suite vorhanden

## Protokollierter Nutzer-Test (Gerät, 2026-09-30)

Android EB2103, Release-APK vom 2026-09-30 (App-Stand `c976fba`), Firmware `c976fba` (Kalibrierfaktor 0,993), 3S-Akku bzw. Labornetzteil:

- [x] **AC-1** — Header zeigt „🔋 87 %" bei 12,2 V (rechnerisch 87 % laut Kennlinie) — vom Nutzer am Gerät bestätigt, 2026-09-30
- [x] **AC-3** — Anzeige während einer Fahrt ausgegraut — vom Nutzer am Gerät bestätigt, 2026-09-30
- [x] **AC-11** — im USB-Betrieb „🔋 –" — vom Nutzer am Gerät bestätigt, 2026-09-30
- [x] **AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, EC-1, EC-2, EC-3** — mit Labornetzteil geprüft: orange < 20 %, rot < 10 %, Nachfrage < 10 % (Abbrechen startet nichts), Stopp nach ca. 5 s unter 9,3 V, kurzer Einbruch löst nicht aus, Sperre bleibt bei steigender Spannung bis zum Neustart, Banner + gesperrte Bedienung, Zeitraffer endet mit „Akku leer – Bewegung gestoppt", Stopp auch ohne verbundene App — vom Nutzer am Gerät bestätigt („alles ok" zur Liste 1–9), 2026-09-30
- Einschränkung: Anzahl der Durchläufe und genaue Spannungswerte des Netzteils nicht protokolliert.

## Acceptance Criteria Status

- [x] **AC-1** — `ConnectionHeader.tsx:94-98` rendert `BatteryIndicator` nur im Zustand `connected`; Label `🔋 ${percent} %` (`BatteryIndicator.tsx:32`); `BatteryIndicator.test.ts` grün. Gerät: Nutzer-Test.
- [x] **AC-2** — Messung alle 200 ms, Übernahme höchstens alle 10 s nur im Stillstand (`battery.cpp:20-22, 86-104`), Notify bei Änderung (`ble.cpp:415-429`). Simulation: Stillstand → Übernahmen bei 0,2 / 10,2 / 20,2 / 30,2 s; Zeitraffer (2 s Fahrt, 1 s Pause) → Übernahme ca. alle 12 s in einer Pause. Jede Zeitraffer-Pause ist ≥ 400 ms Settle + Foto, also mindestens eine Ruhemessung. Beobachtung: der erste Wert nach einer Fahrt enthält noch Ruhewerte von davor (bis zu einem Fenster verzögert) — innerhalb der 30 s.
- [x] **AC-3** — Messungen während `motorIsRunning()` verworfen (`battery.cpp:87`); bit7 `moving` (`motor.cpp:620`, `ble.cpp:65`, `client.ts:440`); Deckkraft 0,45 (`BatteryIndicator.tsx:36, 50`, Test grün). Gerät: Nutzer-Test.
- [x] **AC-4** — < 20 % → `colors.primary` (Amber, `BatteryIndicator.tsx:13-14`); 10 780 mV → 19 % `low`; kein Alert, AUTO_DRIVE wird gesendet (Render-Probe).
- [x] **AC-5** — < 10 % → `colors.destructive` (`BatteryIndicator.tsx:12`, Test grün). Die Stufe hängt am gerundeten Prozentwert (10 480 mV = 9,67 % → „10 %" orange) — passt zur sichtbaren Zahl.
- [x] **AC-6** — `confirmIfBatteryCritical` (`battery.ts:80-91`) aus `AutoDriveControls.tsx:436` und `TimelapseControls.tsx:172`; Probe bei 5 %: Text und Buttons exakt, Abbrechen sendet nichts, Bestätigen genau ein Befehl; kein Alert bei `low`/`ok`/`unknown`/40 mV; Jog fragt nicht (`JogControls` nutzt `battery.ts` nicht).
- [x] **AC-7** — `battery.cpp:65-84`, Schwellen 9300/5000 mV, 5000 ms, `batteryUpdate()` in `loop()` ohne BLE-Bedingung (`main.cpp:60`). Simulation: 9299 mV → Sperre bei 5,2 s; genau 9300 mV → keine Sperre; 5000 mV → Sperre; 4999 mV → nie; Sperre ≥ 5 s nach Beginn; `millis()`-Überlauf über 2^32 korrekt.
- [x] **AC-8** — `lockedOut` nur in `motorLockout()` gesetzt (`motor.cpp:655`), RAM-only, kein Aufhebe-Pfad (`grep`); Guard in `motorJog`/`motorAutoDrive`/`motorTimelapseMoveTo` (`motor.cpp:246, 418, 535`), keine weiteren Bewegungsaufrufe; Sperre auch im Stillstand (Simulation 9200 mV ohne Bewegung). Race-Garantie aus design.md umgesetzt: Flag vor `motorStop()` (`motor.cpp:655-656`), erneuter Stopp in jedem `loop()` (`battery.cpp:116-118`).
- [x] **AC-9** — `RootScreen.tsx:124-129` (Banner + `disabled`), Render-Probe: Banner „Akku leer – bitte laden", Jog/Auto-Fahrt/Setzen/Presets gesperrt, Zeitraffer-Start gesperrt (`TimelapseControls.tsx:153`). Banner scrollt mit (nicht angepinnt), bleibt aber, solange gesperrt.
- [x] **AC-10** — Effekt `useTimelapseSequence.ts:519-523`, Test `useTimelapseSequence.test.ts` grün; Probe: Sperre während einer Fahrt (Stopp + Sperre in einem Notify) → kein weiteres Foto, keine Rückfahrt, richtige Meldung; Sperre während der letzten Fahrt → keine Rückfahrt. Einschränkung siehe BUG-5.
- [x] **AC-11** — Firmware < 5000 mV → kein Zähler (`battery.cpp:66-72`); App `batteryPercent` = null → „🔋 –" in Normalfarbe (`battery.ts:42`); kein Alert bei 40 mV/null. Gerät: Nutzer-Test.

## Edge Cases Status

- [x] **EC-1** — jede Messung ≥ 9300 mV setzt den Zähler zurück (`battery.cpp:68-72`); Simulation 4,8 s low / 0,2 s ok über 60 s → keine Sperre; Anzeige nimmt keine Lastwerte. Gerät: Nutzer-Test (Netzteil).
- [x] **EC-2** — Schutz ohne BLE-Bedingung (`main.cpp:60`); `onSubscribe` sendet sofort den vollen Status inkl. bit6 (`ble.cpp:258-270`). Gerät: Nutzer-Test.
- [x] **EC-3** — Simulation 9000 mV 7 s, dann 12 000 mV → bleibt gesperrt (`battery.cpp:78`, kein Unlock-Pfad). Gerät: Nutzer-Test.
- [x] **EC-4** — Wechsel Prozent ↔ „–" (`battery.ts:42`, `client.ts:445`). Rand siehe BUG-3.
- [x] **EC-5** — `displayMillivolts` startet bei 0 → `null` → „–" (`battery.cpp:47`, `client.ts:445`, `useSliderStatus.ts:31`); erster Wert ca. 200 ms nach Start von `loop()`.
- [x] **EC-6** — Bestätigung gibt nur den App-Befehl frei, Firmware-Schutz unabhängig (`battery.cpp:65-84`); AC-10 greift unabhängig vom Start (Probe).

## Security Audit (Red Team)

- [x] Sperre auslösen durch Fremdgerät unmöglich: `lockedOut` nur aus `battery.cpp:82` (lokaler ADC-Wert), kein BLE-Pfad (`grep`)
- [x] Sperre aufheben durch Fremdgerät unmöglich: keine Unlock-Funktion, kein Neustart per BLE (`grep esp_restart|ESP.restart` leer)
- [x] Sperre umgehen unmöglich: alle drei Bewegungs-Einstiege prüfen `lockedOut` zuerst (`motor.cpp:246, 418, 535`); keine neuen Opcodes, Command-Characteristic weiter `WRITE_ENC` (`ble.cpp:385-387`)
- [x] Parser-Validierung: Bytes 6–7 nur bei Länge ≥ 8, 0 und > 20 000 mV → null, Prozent geklemmt (`client.ts:427-446`, `battery.ts:42-59`, Tests grün)
- [x] Gefälschtes Gerät: kann nur die eigene Sitzung beeinflussen (Banner/Nachfrage), nicht den echten Slider — die Firmware liest keine Werte von der App
- [x] Secrets: keine im Diff (`git grep`), Hermes-Bundle der Release-APK ohne Treffer
- [!] Authentication/Authorization/Injection/Credentials in URL — nicht anwendbar (kein Backend, kein Login, keine Formulare)
- [!] Rate Limiting — not implemented (optional; PROJ-6 fügt keinen Write hinzu)
- **Zusammenfassung:** 6 Checks verifiziert, 4 NOT VERIFIED (nicht anwendbar / not implemented); Befunde BUG-1, BUG-2, BUG-6, BUG-7.

## Regressionstest (Step 4)

- [x] PROJ-1: Header in allen anderen Zuständen unverändert (Button/Spinner, kein 🔋), Status-Abo unverändert; neue App + alte 6-Byte-Firmware → Akku `null`, alle Felder gleich; alte App v1.3.0 + neue 8-Byte-Firmware → alle bisherigen Felder korrekt (Probe mit dem `main`-Decoder)
- [x] PROJ-2: Mapping unverändert, nur `lockedOut` im Guard; `batteryUpdate()` blockiert `loop()` höchstens ca. 1–2 ms je 200 ms (16 ADC-Lesungen), Schritterzeugung läuft in eigenem Task höherer Priorität — kein Einfluss auf Watchdog (1000 ms) oder Grace (100 ms); Jog-Loslassen bei Sperre sendet weiter STOP
- [x] PROJ-3: Auto-Fahrt ohne Dialog bei null/ok/USB sofort gesendet; Rückfahrt am Zeitraffer-Ende ohne Dialog
- [x] PROJ-4: Speicher unverändert (`usePresets.ts` nicht im Diff); ohne Sperre alle Preset-Aktionen aktiv. Befund BUG-4 bei Sperre
- [x] PROJ-5: zusätzliche Notifies (bit7, Spannung) lassen `waitForStatusCondition` unberührt (Prädikate prüfen nur `timelapseMoving`); Startbedingung und neuer Effekt korrekt; Disconnect setzt `batteryLocked` zurück, kein Fehlauslösen
- [!] Alle Flows am Gerät — nur so weit abgedeckt, wie der Nutzer-Test oben reicht

## Bugs Found

### BUG-1 — High — Tiefentladungsschutz schützt nur vor Bewegung, nicht den Akku selbst (Spec-Lücke)
- **Befund:** Nach dem Schutz-Stopp laufen ESP32 (BLE-Advertising), TMC2209-Logik und Spannungsteiler unbegrenzt weiter — kein Deep-Sleep, keine Abschaltung (`grep deep_sleep|esp_deep|light_sleep|stopAdvertising firmware/src` leer). `battery.cpp:78-83` sperrt nur die Bewegung. Die Zellen ohne BMS werden unter 3,1 V/Zelle weiter entladen, bis unter die Schädigungsgrenze.
- **Warum High:** User Story 4 der Spec („schützt meine 18650-Zellen vor Tiefentladung, auch wenn die App nicht verbunden ist") wird nur teilweise erfüllt; AC-7/AC-8 sind im Wortlaut erfüllt, schützen aber nicht vor dem Grundverbrauch. Tiefentladene Li-Ion-Zellen wieder aufzuladen ist ein Sicherheitsrisiko. Bleibt der Slider nach dem Stopp eingeschaltet liegen (EC-2, ohne App), bemerkt es niemand.
- **Voraussetzung:** Der ESP32 hängt am Akku (offene Frage in spec.md/design.md; das Design geht davon aus).
- **Repro (Gerät):** Pack unter 9,3 V bringen, Sperre abwarten, eingeschaltet liegen lassen, Spannung über Stunden messen.
- **Vorschlag:** `/refine PROJ-6` — z. B. nach der Sperre Motortreiber abschalten und ESP32 in Deep-Sleep (Aufwachen nur per Reset/Akkuwechsel).

### BUG-2 — Medium — Schutz fällt still aus, wenn der Spannungsteiler sich löst (Spec-Lücke, spec-konform nach AC-11)
- Löst sich im Akkubetrieb der obere Zweig oder der Abgriff, zieht der untere 22-kΩ-Widerstand den Pin auf ca. 0 V → < 5000 mV → „kein Akku": Schutz-Stopp dauerhaft aus (`battery.cpp:66-72`), App zeigt nur „🔋 –" wie im USB-Betrieb. Workaround: „–" im Akkubetrieb bemerken. Vorschlag: `/refine PROJ-6` (z. B. „einmal erkannter Akku, der danach verschwindet" als Fehler werten).

### BUG-3 — Low — gemischter Anzeigewert beim Wechsel USB ↔ Akku (EC-4-Rand)
- `battery.cpp:92-103` mittelt alle Ruhewerte seit der letzten Übernahme; Wechsel innerhalb eines 10-s-Fensters ergibt z. B. 6240 mV → ca. 10 s „🔋 0 %" rot und die Nachfrage. Praktisch kaum erreichbar, da USB und Akku nicht gleichzeitig gehen (Wechsel = Neustart).

### BUG-4 — Low — Presets speichern/löschen während der Sperre gesperrt
- `RootScreen.tsx:129` → `AutoDriveControls.tsx:379` sperrt auch „Als Preset speichern" und „Löschen", obwohl AC-9 nur Bewegungs-Bedienelemente nennt (design.md zusätzlich „Setzen und Presets laden"). Reine Speicheraktionen fehlen bis zum Neustart.

### BUG-5 — Low — Zeitraffer-Start trotz Sperre über offenen Nachfrage-Dialog
- Dialog offen → Sperre kommt → „Trotzdem starten": `TimelapseControls.tsx:172` prüft die Sperre nicht erneut, der Effekt reagiert nur auf einen Wechsel. Folge: ein Foto, dann Timeout-Meldung statt „Akku leer – Bewegung gestoppt". Keine Bewegung (Firmware verwirft).

### BUG-6 — Low — Rundungsgrenze 5000 mV nicht deckungsgleich
- Firmware prüft „Akku erkannt" am ungerundeten Wert, überträgt gerundet (20 mV): 4990–4999 mV werden als 5000 gesendet → App zeigt „0 %" rot + Nachfrage, Firmware nimmt „kein Akku" an. Praktisch sehr unwahrscheinlich.

### BUG-7 — Low — Doku/Plausibilität
- design.md („einziger Zugriff ist der verschlüsselte BLE-Link") widerspricht dem ungeschützten Status-Notify (`ble.cpp:394`), über den jetzt zusätzlich Spannung, Sperre und Fahrtzustand lesbar sind (keine PII). `MAX_PLAUSIBLE_BATTERY_MILLIVOLTS = 20000` ist für 3S (max. 12,6 V) weit — Werte 12,6–20 V erscheinen still als 100 %. Stopp-Button der Auto-Fahrt ist bei Sperre `disabled` (design.md sagt „bedienbar"), praktisch folgenlos.

## Nicht verifiziert in diesem Lauf

- [!] Laufzeit aller AC/EC über den Nutzer-Test hinaus — no way to run and probe this project was recorded (App und Layer firmware)
- [!] Hält BUG-1 über Stunden an (tatsächlicher Ruhestrom nach der Sperre) — nur am Gerät messbar
- [!] Reicht die 16-fache Mittelung gegen Motortreiber-Störungen nahe der Schwelle (Fehlauslösung/Verzögerung) — offene Frage design.md, nur am Gerät
- [!] Hängt der ESP32 am Akku (Akkuwechsel = Neustart = Aufhebung der Sperre) — offene Frage spec.md
- [!] Fünf parallele Status-Abos auf Android erhalten jeweils das Notify-on-Subscribe — nur am Gerät
- [!] Optik von Farbe, Abschwächung, Banner-Layout — kein Viewport; vom Nutzer funktional bestätigt
- [!] Firmware-Tests — no test command recorded for layer firmware

## Zusammenfassung

- **Acceptance Criteria:** 11 von 11 im Code und in Proben erfüllt; AC-1, AC-3..AC-11 zusätzlich vom Nutzer am Gerät bestätigt (AC-2 nur im Code/Simulation)
- **Edge Cases:** 6 von 6 erfüllt; BUG-3/BUG-5 an den Rändern
- **Bugs:** 0 Critical, 1 High (BUG-1, Spec-Lücke), 1 Medium (BUG-2, Spec-Lücke), 5 Low
- **Security:** keine Umgehung der Sperre möglich; 6 Checks verifiziert, 4 nicht anwendbar
- **Regression:** keine an PROJ-1..5

**Production-Ready: NEIN.** BUG-1 (High) ist offen — der Code erfüllt zwar jedes AC, aber die Spec schützt den Akku nicht vor dem Grundverbrauch nach dem Stopp. Das braucht `/refine PROJ-6`, dann `/build`. Status: **In Review**.

---

# Nachtrag 2 — Zweiter Lauf nach `/refine` (AC-12, AC-13, EC-7, EC-8) und `/build`, 2026-10-01

**Breite:** volle Breite, keine Re-Verifikation. Der Vertrag hat sich geändert (`/refine` hat AC-12, AC-13, EC-7 und EC-8 ergänzt). Drei unabhängige `qa-engineer`-Lanes: Acceptance (Step 2), Security (Step 3) und Regression (Steps 4 und 5). Diff seit dem ersten QA-Commit: `git diff --stat d413fcd..HEAD` mit 18 Dateien (Firmware battery/ble/motor, App client.ts, AutoDriveControls, BatteryLockBanner, useSliderStatus, useTimelapseSequence, RootScreen, dazu die Tests).

**Probe:** `probe.kind: none` (App und Layer firmware). Jede Laufzeitprüfung ist `[!] NOT VERIFIED — no way to run and probe this project was recorded`. Belege am Gerät stammen nur aus dem protokollierten Nutzertest T19.

## Automatisierte Tests
- [x] `npm test`: 16 Suites, 238 Tests bestanden, 0 fehlgeschlagen. Log `scratchpad/suite12.log`, Lauf durch den Owner vor dem Fan-out.
- [x] Firmware-Build `pio run -e esp32dev`: `[SUCCESS]` (`scratchpad/fw12.log`). Damit ist nur belegt, dass der Code kompiliert, nicht dass er sich richtig verhält.
- [!] Firmware-Tests: no test command recorded for layer firmware. Ersatz sind Node-Nachbauten von `battery.cpp` (`scratchpad/p6r2/fw.js`, `probe.js`, `probe0.js`; `scratchpad/p6sec/wackel.js`).
- [x] Gegenproben mit einzelnen Dateien: `npx jest src/ble/client.test.ts` mit 36/36 grün; Render-Probe `p6r2/app.probe.test.tsx` mit 2/2 grün.

## Protokollierter Nutzertest T19 (Gerät, Labornetzteil, 2026-09-30/10-01)
1. Unterspannung: Bewegung stoppt, der Banner zeigt den Countdown, nach 60 s ist die Verbindung weg, der Slider reagiert erst nach einem Reset wieder.
2. Spannungsteiler abgezogen: „Akkumessung gestört“, danach Abschaltung.
3. Start über USB ohne Akku: keine Sperre.
4. Ruhestrom im Tiefschlaf: optional, nicht gemessen.

Der Nutzer hat „alles ok“ zurückgemeldet. Dass der Schlitten im Tiefschlaf hält, ist mechanisch bedingt, denn er hält ohne Strom genauso. Deshalb belegt T19 nicht, dass EN im Tiefschlaf HIGH bleibt. Das ist nur im Code belegt (`motor.cpp:682-687`).

## Acceptance Criteria (dieser Lauf)
- [x] AC-1 — `ConnectionHeader.tsx:94-98`, `BatteryIndicator.tsx:32`, `BatteryIndicator.test.ts:38` grün
- [x] AC-2 — `battery.cpp:21-23, 152-181`; Simulation: Übernahme in Zeitraffer-Pausen innerhalb von 30 s
- [x] AC-3 — `battery.cpp:153-156`, Bit 7 `moving` (`motor.cpp:624`, `ble.cpp:66`, `client.ts:453`), `BatteryIndicator.test.ts:49`
- [x] AC-4 — `battery.ts:68`, `BatteryIndicator.tsx:13-14`, `battery.test.ts:32`
- [x] AC-5 — `battery.ts:65`, `BatteryIndicator.tsx:11-12`
- [x] AC-6 — `battery.ts:80-91`; Aufrufer `AutoDriveControls.tsx:449` und `TimelapseControls.tsx:172`; `battery.test.ts:53,62`
- [ ] **AC-7 — FAIL → BUG-8.** Bei konstanter Unterspannung greift die Sperre (Simulation: 9200 mV → Sperre nach 5,2 s). Springt der Messwert dagegen zwischen 5000–9299 mV und < 5000 mV, liegt er „ununterbrochen unter 9,3 V“, und es wird trotzdem nie gesperrt.
- [x] AC-8 — Guards `motor.cpp:249, 421, 538`; `lockedOut` hat keinen Weg zurück
- [x] AC-9 — Render-Probe: Banner, Jog/Auto/Zeitraffer gesperrt (`RootScreen.tsx:124-139`, `AutoDriveControls.tsx:365,533,544,665`, `TimelapseControls.tsx:153`)
- [x] AC-10 — `useTimelapseSequence.ts:527-531`, Tests `:569`, `:633` grün
- [x] AC-11 — `battery.cpp:105-111`, `battery.ts:42`
- [x] AC-12 — Treiber aus `motor.cpp:669-675`; Countdown `battery.cpp:132-150` (Simulation: 60 → 1, Tiefschlaf genau nach 60 000 ms, auch über den `millis()`-Überlauf); keine Weckquelle (`grep esp_sleep_enable` leer); am Gerät T19 (1). Wortlaut des Banners: siehe BUG-11.
- [x] AC-13 — `battery.cpp:104-127`; Simulation: Übergang 11 000 → 0 mV ergibt Sperre mit Grund 2 nach 5 s; am Gerät T19 (2). Bei Wackelkontakt mit leerem Akku: BUG-8.

## Edge Cases (dieser Lauf)
- [x] EC-1 — Simulation: 4,8 s bei 9000 mV, dann 0,2 s bei 9400 mV, im Wechsel → keine Sperre
- [x] EC-2 — `main.cpp:60`, Notify-on-Subscribe `ble.cpp:263-275`
- [x] EC-3 — Simulation: 7 s Unterspannung, danach 12 V → bleibt gesperrt, Tiefschlaf nach 60 s
- [ ] **EC-4 — Widerspruch in der Spec → BUG-12** (zu AC-13)
- [x] EC-5 — `battery.cpp:65`, `client.ts:458`
- [x] EC-6 — Die Firmware schützt unabhängig vom Dialog
- [x] EC-7 — Simulation: USB mit 0 mV bzw. Rauschen von 0 bis 4999 mV über 200 s → keine Sperre; am Gerät T19 (3). Restrisiko: BUG-13
- [x] EC-8 — im Code: Notify-on-Subscribe mit Byte 8 und 9 (`ble.cpp:269-273`); [!] am Gerät nicht verifiziert (T19 deckt spätes Verbinden nicht ab)

## Security Audit (dieser Lauf)
- [x] Abschaltung per BLE auslösen, verhindern oder verzögern: nicht möglich. `motorLockout()` wird nur aus `battery.cpp:122,126` aufgerufen. Es gibt keinen neuen Opcode, und Befehle sind weiterhin `WRITE_ENC` (`ble.cpp:391-392`). Es gibt kein `esp_restart`.
- [x] Aufwachen aus dem Tiefschlaf: keine Weckquelle konfiguriert.
- [x] Treiber bleibt aus: `setAutoEnable(false)` steht vor `disableOutputs()` (`FastAccelStepper.cpp:700`). Auto-Enable wird nur in `motorSetup` gesetzt.
- [x] Bewegungsbefehle in der 60-s-Frist werden abgewiesen (`motor.cpp:249,421,538`). Den Rest-Race fängt der Guard in `battery.cpp:193-195` ab.
- [ ] **Wackelkontakt am Teiler → BUG-8**
- [x] Parser für Byte 8 und 9: unbekannte Gründe werden als `lowBattery` gelesen, der Countdown nur im Bereich 1..60 übernommen, Längen-Guards (`client.ts:456-466`), 36/36 Tests grün
- [x] Secrets: `git diff main..HEAD` enthält keine Werte
- [x] Status-Notify ohne Pairing lesbar: nur Sperrgrund und Countdown, keine PII (`design.md:129`)
- [!] Auth, Autorisierung, Injection, Credentials in der URL, Brute Force — nicht anwendbar (kein Backend, kein Login)
- [!] Rate Limiting — not implemented (optional for MVP); das Feature bringt keinen schreibenden Befehl mit
- [!] Aushungern von `loop()` durch eine BLE-Flut eines gebondeten Geräts; ob `toff(0)` per UART tatsächlich ankommt; Hermes-Bundle auf Secrets — nur am Gerät bzw. nicht neu gebaut

## Regression (dieser Lauf)
- [x] PROJ-1: Die alte App v1.3.0 liest nur Byte 0..5 (`git show main:src/ble/client.ts`); die neue App kommt mit 6- und 8-Byte-Firmware zurecht (`client.test.ts:281, 290`)
- [x] PROJ-2: Der Treiber wird nur in `motorLockout()` abgeschaltet; der Jog-Pfad bekommt nur zusätzlich `lockedOut`; geschätzte ADC-Last 1–2 ms alle 200 ms bei einem Watchdog von 1000 ms (nicht gemessen)
- [x] PROJ-3: Der Stopp-Button hängt nur an `disabled` (`AutoDriveControls.tsx:627`)
- [x] PROJ-4: Speichern und Löschen sind bei Akku-Sperre bedienbar (`AutoDriveControls.render.test.ts:270`)
- [x] PROJ-5: Die gegenseitige Sperre ist unverändert; `start()`-Guard und Meldungen greifen nur bei Sperre
- [!] Alles auf echter Hardware, darunter Jog nach dem Neustart aus dem Tiefschlaf — no way to run and probe this project was recorded

## Status der Bugs aus dem ersten Lauf
- BUG-1 (High) — **geschlossen** (AC-12, Code, Simulation, T19 (1)). Ruhestrom im Tiefschlaf nicht gemessen.
- BUG-2 (Medium) — **geschlossen für einen dauerhaft gelösten Teiler** (AC-13, T19 (2)). Ein Wackelkontakt bei leerem Akku bleibt offen → BUG-8.
- BUG-3, BUG-4, BUG-5, BUG-6, BUG-7 (Low) — **geschlossen** (`battery.cpp:160-167`; `AutoDriveControls.tsx:644,679` und Test; `useTimelapseSequence.ts:544-547` und Test `:611`; `battery.cpp:82-84` und Simulation; `client.ts:109`, `design.md:129`, `AutoDriveControls.tsx:628`)

## Neue Bugs

### BUG-8 — High — Wackelkontakt am Spannungsteiler hebelt den Tiefentladungsschutz aus (AC-7, AC-13)
- **Ort:** `firmware/src/battery.cpp:90-127`. „Leer“ (5000–9299 mV) und „gestört“ (< 5000 mV nach erkanntem Akku) haben getrennte Zähler, und jede Messung im jeweils anderen Bereich setzt den Zähler zurück (so in `design.md:161` festgelegt).
- **Folge:** Ein loser Abgriff liefert immer nur zu niedrige Werte. Bei leerem Pack liegt deshalb jede Messung unter 9,3 V, springt aber zwischen „leer“ und „< 5 V“. Keiner der beiden Zähler erreicht 5 s. Bewegung, Treiber und ESP32 laufen weiter, und die Zellen ohne BMS werden tiefentladen.
- **Belege:** In beiden Simulationen (Security `p6sec/wackel.js`, Acceptance `p6r2/probe.js`) gab es keine Sperre:
  - 9000 und 0 mV im 200-ms-Wechsel: keine Sperre in 600 s
  - Wechsel im 1-s-Takt: keine Sperre in 300 s
  - 4 s 9000 mV und eine Messung mit 0 mV, wiederholt: keine Sperre
  - Zufallswerte 0..9000 mV: keine Sperre in 3600 s

  Zum Vergleich mit gesundem Teiler: konstant 9000 mV sperrt nach 5,2 s, ein dauerhaft gelöster Teiler nach 5 s (Grund „gestört“).
- **Severity:** Die Acceptance-Lane bewertet Medium, die Security-Lane High. Zusammengeführt: **High**. Die Messung liegt 5 s und länger ununterbrochen unter 9,3 V, das ist der Auslöser von AC-7, und trotzdem wird nicht gesperrt. Außerdem ist ein gelöster Teiler genau der Fall, für den AC-13 eingeführt wurde. Die Folge ist eine Tiefentladung von Zellen ohne BMS.
- **Repro am Gerät:** Labornetzteil auf 9,0 V stellen, den Abgriff des Teilers im Takt von etwa 1–3 s an- und abklemmen. Ergebnis: keine Sperre, kein Countdown.
- **Fix-Richtung (Design, kein `/refine` nötig):** ein gemeinsamer Zähler „unsicher“ (leer *oder* gestört nach erkanntem Akku). Der Sperrgrund ergibt sich aus der letzten Messung oder aus dem überwiegenden Bereich. Das ist AC-7-konform, `design.md:161` muss angepasst werden.

### BUG-9 — Low — Halten des EN-Pins wird beim Booten nicht freigegeben
`motorPrepareDeepSleep()` setzt `gpio_hold_en(GPIO27)` und `gpio_deep_sleep_hold_en()`. `gpio_hold_dis` kommt im Code nirgends vor. Heute ist das vermutlich folgenlos, denn es gibt keine Weckquelle, und ein Reset bzw. Stromwechsel löscht den Hold. Mit einer künftigen Weckquelle bliebe der Treiber nach dem Aufwachen aber aus. Prüfung am Gerät: Sperre auslösen, Tiefschlaf abwarten, Reset per EN-Taste, dann joggen. Fix: `gpio_hold_dis(GPIO27)` in `motorSetup()`.

### BUG-10 — Low — Sperre bei genau `millis()==0` geht sofort in den Tiefschlaf
`battery.cpp:137-140`: `lockedAtMillis = 1` und `elapsed = 0 − 1` ergeben einen Überlauf, also sofort `esp_deep_sleep_start()` ohne die 60-s-Frist. Beleg ist die Probe `p6r2/probe0.js`. Praktisch nur nach 49,7 Tagen Laufzeit auf die Millisekunde genau erreichbar.

### BUG-11 — Low — Banner-Texte
- AC-12 verlangt „Akku leer – Slider schaltet sich in 60 s ab“. Gerendert werden zwei Zeilen, „Akku leer – bitte laden“ und „Slider schaltet sich in 60 s ab“ (`BatteryLockBanner.tsx:20-30`). Inhaltlich ist das gleich, und so ist es in `design.md:166-169` entschieden.
- Bei `measurementFault` steht im Hinweis weiterhin „… lade den Akku“ (`BatteryLockBanner.tsx:31-34`). Passend wäre ein Hinweis auf die Verkabelung.

### BUG-12 — Low — Widerspruch in der Spec zwischen EC-4 und AC-13
EC-4 verlangt bei „Akku erkannt, dann < 5 V ohne Neustart“ die Anzeige „🔋 –“ ohne Fehlermeldung. AC-13 verlangt in diesem Fall Sperre und Abschaltung. Der Code folgt AC-13. Laut Nutzer ist der Fall physisch nicht erreichbar, weil USB und Akku nie gleichzeitig angeschlossen sind; die Security-Lane nennt aber genau das als Bedien-Falle, etwa beim Flashen im Akkubetrieb. EC-4 per `/refine` angleichen.

### BUG-13 — Low — Eine einzige Messung ≥ 5000 mV setzt „Akku erkannt“ dauerhaft
`battery.cpp:106-108` hat keine Entprellung. Ohne verbauten Teiler schwebt GPIO 34; eine Störung, gefolgt von 5 s < 5 V, würde im USB-Betrieb sperren (Widerspruch zu AC-11 und EC-7). Mit dem verbauten 22-kΩ-Pull-down ist das unrealistisch.

### Beobachtungen (kein Bug)
- `motorSetStart`, `motorSetEnd` und `motorSetEndFromDistance` sind in der Firmware nicht an `lockedOut` gebunden; gesperrt wird nur in der App. Bewegt wird dabei nichts.
- Die offene Frage in `spec.md`, ob der Motor stromlos frei läuft, ist durch T19 beantwortet (er hält mechanisch), aber noch nicht abgehakt. Das bei Gelegenheit per `/refine` nachziehen.

## Nicht verifiziert in diesem Lauf
- [!] Laufzeit aller AC und EC auf dem aktuellen Stand über T19 hinaus — no way to run and probe this project was recorded
- [!] EC-8 am Gerät (Verbinden während der Frist)
- [!] EN bleibt im Tiefschlaf HIGH — T19 kann das nicht unterscheiden (mechanisches Halten)
- [!] Ruhestrom im Tiefschlaf — T19 (4) nicht gemessen
- [!] Optik von Banner und Header — kein Viewport
- [!] Firmware-Tests — no test command recorded for layer firmware

## Zusammenfassung (zweiter Lauf)
- **Acceptance Criteria:** 12 von 13 erfüllt; AC-7 FAIL (BUG-8)
- **Edge Cases:** 7 von 8 erfüllt; EC-4 widerspricht AC-13 (BUG-12)
- **Bugs:** 0 Critical, 1 High (BUG-8), 0 Medium, 5 Low (BUG-9 bis BUG-13); BUG-1 bis BUG-7 geschlossen (BUG-2 bis auf den Wackelkontakt)
- **Security:** keine Umgehung der Sperre per BLE; der Schutz selbst hat die Lücke BUG-8
- **Regression:** keine in PROJ-1 bis PROJ-5

**Production-Ready: NEIN.** BUG-8 (High) ist offen. Der Fix bleibt im Design, kein Vertragswechsel: `/build PROJ-6` mit gemeinsamem Unsicher-Zähler, die Low-Bugs BUG-9 bis BUG-11 und BUG-13 gleich mit. BUG-12 braucht ein kurzes `/refine PROJ-6`. Danach Re-Verifikation per `/qa`. Status: **In Review**.

---

# Nachtrag 3 — Re-Verifikation nach Bugfix-Build und `/refine`, 2026-10-01

**Breite:** Re-Verifikation, `git diff --stat 2bed11a..HEAD`. Geänderte Produktionsdateien:
- `firmware/src/battery.cpp`
- `firmware/src/motor.cpp`
- `src/components/BatteryLockBanner.tsx` (dazu der Test)

Außerdem hat `/refine` in `spec.md` EC-4 enger gefasst, EC-9 ergänzt und eine offene Frage geschlossen. Der Vertrag hat sich damit nur an Stellen geändert, die der Diff selbst abdeckt. Deshalb lief eine einzige `qa-engineer`-Lane mit Step 2, dann 3, dann 4. Geprüft wurden BUG-8 bis BUG-13, EC-4, EC-9 und jedes AC/EC, dessen Code im Diff liegt.

Alle übrigen Ergebnisse aus Nachtrag 2 gelten weiter: AC-1 bis AC-6, AC-10, EC-2, EC-5, EC-6 — unverändert seit 2026-10-01 (Nachtrag 2), in diesem Lauf nicht erneut ausgeführt, weil der Diff `battery.ts`, `BatteryIndicator`, `client.ts`, `ble.cpp` und die Steuer-Komponenten nicht berührt.

**Probe:** `none` für App und Firmware. Belege kommen aus Code, Simulation (`scratchpad/qa14/fw.js`, `scen.js`, Nachbau von `battery.cpp`) und den Nutzertests.

## Automatisierte Tests
- [x] `npm test`: 16 Suites und 239 Tests bestanden, 0 fehlgeschlagen (`scratchpad/suite14.log`, ein Lauf durch den Owner)
- [x] Firmware-Build `[SUCCESS]` (`scratchpad/fw14.log`); die Objektdateien sind jünger als die Quellen
- [x] Gegenprobe einzeln: `npx jest src/components/BatteryLockBanner.test.ts` → 5/5. Der Rot-Nachweis für den neuen Test (BUG-11) wurde im Build erbracht: Gegen die alte Banner-Version schlug er fehl.
- [!] Firmware-Tests — no test command recorded for layer firmware

## Protokollierter Nutzertest (Gerät, Labornetzteil, 2026-10-01, Firmware `f798cce`, App-Release mit neuem Banner-Text)
- Akku bei 9,0 V, Abgriff am Teiler im Takt von 1–3 s an- und abgeklemmt:
  - Sperre mit „Akkumessung gestört – bitte Verkabelung prüfen“
  - Hinweis auf die Verkabelung
  - Countdown, danach Abschaltung
- Gegenprobe bei 12 V: keine Sperre
- Rückmeldung des Nutzers: „alles ok“

## Offene Bugs aus Nachtrag 2
- [x] **BUG-8 (High) — geschlossen.**
  - Code: gemeinsamer Zähler in `battery.cpp:123-148`.
  - Simulation: Wechsel 9000/0 mV (200 ms und 1 s), „4 s leer + 1× 0 mV“ und Zufallswerte 0..9000 sperren nach 5,0 s mit Grund „gestört“. Bei gesundem Akku ergibt der Wechsel 11000/0 mV keine Sperre.
  - Am Gerät bestätigt durch den Nutzertest.
  - Restlücke im Boot-Fenster: NEU-A.
- [x] **BUG-9 (Low) — geschlossen** im Code (`motor.cpp:207-208`). Laufzeit „Tiefschlaf → Reset → Jog“ nicht verifiziert. Die Reihenfolge beim Aufwachen beschreibt NEU-C.
- [x] **BUG-10 (Low) — geschlossen.** `battery.cpp:158-163`. Simulation: Sperre bei genau `millis()==0` und über den Überlauf ergibt 60..1 und den Tiefschlaf nach 60 000 ms.
- [x] **BUG-11 (Low) — geschlossen.** `BatteryLockBanner.tsx:25-28`, Test `:34-39`. Der Text steht im Release-Bundle (UTF-16-Suche) und wurde vom Nutzer gesehen.
- [x] **BUG-12 (Low) — geschlossen.** EC-4 in `spec.md:46` neu gefasst und deckungsgleich mit `battery.cpp:125`.
- [x] **BUG-13 (Low) — geschlossen.** `battery.cpp:114-122`. Simulation im USB-Betrieb: ein Spike und 5 Spikes in Folge sperren nicht, erst 1 s am Stück. Folgedefekt: NEU-A.

## Acceptance Criteria und Edge Cases im Diff
- [x] AC-7 — Simulation: konstant 9200 mV → „leer“ nach 5,0 s, auch in der ersten Sekunde nach dem Boot. Schutz auch während der Fahrt (`battery.cpp:228`). [!] Am Gerät auf `f798cce`: nur über den Wackeltest; eine Sperre mit Grund „leer“ wurde dort nicht ausgelöst.
- [x] AC-8 — Guards `motor.cpp:253, 425, 542`; `lockedOut` nur `= true` (`motor.cpp:667`)
- [x] AC-9 — `RootScreen.tsx:124-139` ist unverändert, Titel per Test `BatteryLockBanner.test.ts:17-19`
- [x] AC-11 — Simulation: USB 0 mV bzw. Rauschen 0..4999 über 600 s → keine Sperre (`battery.cpp:125`)
- [x] AC-12 — `motor.cpp:673-679`, `battery.cpp:164-168`. Simulation: 60..1, Tiefschlaf nach 60 s, keine Weckquelle. Am Gerät: Countdown und Abschaltung im Nutzertest.
- [x] AC-13 — Simulation: 11000 → 0 mV ergibt „gestört“ nach 5,0 s. Am Gerät: Nutzertest. Bei gemischter Strecke sperrt es früher, so gewollt (EC-9). Abweichung bei der Definition von „erkannt“: NEU-A.
- [x] EC-1 — Simulation: 4,8 s 9000 mV / 0,2 s 9400 mV und ein einzelner 0-mV-Wert alle 3 s bei gesundem Akku → keine Sperre
- [x] EC-3 — Simulation: 7 s 9000 mV, danach 12000 mV → bleibt gesperrt, Tiefschlaf; `motorLockout` idempotent (`motor.cpp:659-661`)
- [x] EC-4 — Simulation: USB, dann Akku → Prozentwert ohne Fehler. Akku ab bei weiter angestecktem USB → „gestört“ nach 5 s. Den Header beschreibt NEU-B.
- [x] EC-7 — Simulation: USB 0 mV, Rauschen, 1 und 5 Spikes → keine Sperre
- [x] EC-8 — Code: Notify-on-Subscribe ist unverändert (`ble.cpp:262-275`), der Countdown-Wert stimmt in der Simulation. [!] Am Gerät nicht geprüft.
- [x] EC-9 — Simulation und Nutzertest am Gerät, solange der Akku vorher erkannt war. Für das Boot-Fenster: NEU-A.

## Security (beschränkt auf den Diff)
- [ ] Schutz per Verkabelung aushebeln → NEU-A (nur im Boot-Fenster)
- [x] Timing und Überlauf: Sperre bei `millis()==0`, über den Überlauf, „erkannt“-Filter über den Überlauf — Simulation
- [x] Sperre per BLE auslösen, aufheben oder verzögern: nicht möglich. `motorLockout` wird nur aus `battery.cpp:142,147` aufgerufen; `ble.cpp` und `main.cpp` sind nicht im Diff.
- [x] Secrets: `git diff 2bed11a..HEAD | grep -iE "key|secret|token|password"` liefert nichts
- [!] Auth, Injection, Brute Force, Credentials in der URL — nicht anwendbar. Rate Limiting — not implemented (optional for MVP).

## Regression
- [x] PROJ-2, PROJ-3, PROJ-5 (`motorSetup`): nur `motor.cpp:207-208` ist dazugekommen, ohne Wirkung beim Kaltstart; `setEnablePin` und `setAutoEnable(true)` unverändert (`motor.cpp:231-232`)
- [x] PROJ-1 / RootScreen: Banner-Props unverändert; `AutoDriveControls.render.test.ts`, `ConnectionProvider.test.tsx` und `App.test.tsx` grün (suite14)
- [!] Laufzeit am Gerät — no way to run and probe this project was recorded

## Neue Befunde
### NEU-A — Medium — Wackelkontakt schon ab dem Einschalten wird nie gesperrt
- **Ursache:** „Akku erkannt“ verlangt seit dem Fix für BUG-13 eine Sekunde am Stück mindestens 5 V (`battery.cpp:114-125`). Liefert ein loser Abgriff vom Einschalten an nie 6 Messungen in Folge über 5 V, wird der Akku nie erkannt, und der Slider sperrt nie.
- **Simulation** (leerer Pack, 9000 mV): Keine dieser Folgen sperrt in 3600 s.
  - Wechsel 9000/0 mV alle 200 ms
  - 500 ms Kontakt / 500 ms keiner
  - 800 ms Kontakt / 200 ms keiner
- Mit 10 s festem Kontakt vor dem Wackeln sperrt der Slider nach 5 s.
- **Abweichung von der Spec:** AC-13 definiert „erkannt“ als „Messwert ≥ 5 V“, ohne Dauer. Der Code-Kommentar in `battery.cpp:52` ist veraltet.
- **Keine Regression:** Vor dem Fix sperrte dieser Fall wegen BUG-8 ebenfalls nicht.
- **Warum nur Medium:** Die Vorbedingung ist eng: Das Flackern muss schon ab dem Einschalten im Takt unter 1 s laufen. Ein Teiler, der schon vor dem Einschalten ganz ab ist, fällt ohnehin unter AC-11.
- **Lösungsrichtung:** Den Filter zählend bauen, also mindestens 1 s über 5 V seit dem Start, auch mit Unterbrechungen. Alternativ die Spec anpassen und die Lücke als bekannte Grenze dokumentieren.

### NEU-B — Low — Header zeigt „🔋 –“ bei erkanntem Akku unter 5 V
Die Firmware übernimmt den Wert unter 5 V im Stillstand sofort (`battery.cpp:184-191`). Die App zeigt dafür „🔋 –“ (`battery.ts:41-42`). Das passiert in den 5 s vor der Sperre und danach neben dem Banner „Akkumessung gestört“. EC-4 sagt dagegen „kein Wechsel auf „🔋 –““. Inhaltlich greift AC-13, die Abweichung betrifft nur den Wortlaut von EC-4.

### NEU-C — Low — EN-Hold wird vor dem aktiven HIGH freigegeben (heute nicht erreichbar)
`gpio_hold_dis` (`motor.cpp:207`) läuft, bevor EN in `setEnablePin` HIGH getrieben wird (`motor.cpp:231`); `driver.toff(4)` kommt schon vorher. Beim Aufwachen aus dem Tiefschlaf wäre EN deshalb kurz undefiniert. Ohne Weckquelle kommt das heute nicht vor. Sichere Reihenfolge: EN als Ausgang auf HIGH setzen, erst dann den Hold freigeben.

### Beobachtungen (kein Bug)
- In `design.md` steht die Frage „Hängt der ESP32 am Akku …“ noch als offen, in `spec.md` ist sie geschlossen (Doku-Drift).
- An der 9,3-V-Schwelle gibt es keine Hysterese. Das war schon vor dem Diff so und ist EC-1-konform.

## Nicht verifiziert in diesem Lauf
- [!] Laufzeit am Gerät über den Wackeltest vom 2026-10-01 hinaus — no way to run and probe this project was recorded. Betroffen: Sperre „leer“ (AC-7) auf `f798cce`, EC-8, Neustart nach dem Tiefschlaf mit Jog (BUG-9), NEU-A und NEU-B.
- [!] Firmware-Tests — no test command recorded for layer firmware (Ersatz: Simulation)
- [!] Optik von Banner und Header — kein Viewport
- [!] EN bleibt im Tiefschlaf HIGH; Ruhestrom — nur Code, am Gerät nicht messbar bzw. nicht gemessen

## Zusammenfassung (Nachtrag 3)
- **Offene Bugs aus Nachtrag 2:** alle 6 geschlossen (BUG-8 bis BUG-13)
- **Neu:** 0 Critical, 0 High, 1 Medium (NEU-A), 2 Low (NEU-B, NEU-C)
- **Security:** keine Umgehung per BLE; Lücke per Verkabelung nur noch im Boot-Fenster (NEU-A)
- **Regression:** keine

**Production-Ready:** siehe Abschluss unten.

## Abschluss Nachtrag 3 — Fix NEU-A und NEU-C, Nutzertest, Entscheidung (2026-10-01)

**Fix** `9629317` (Diff: `git diff 8e113ba..9629317 -- firmware/src`):
- NEU-A: „Akku erkannt“ zählt jetzt 5 Messwerte ≥ 5000 mV seit dem Start, statt 1 s am Stück zu verlangen (`battery.cpp`).
- NEU-C: EN wird HIGH getrieben, bevor der Hold freigegeben wird (`motor.cpp` `motorSetup`).

Der Fix wurde in diesem Lauf nicht von einer eigenen Lane geprüft, sondern über die Simulation des Owners und einen Nutzertest am Gerät. Beides deckt genau den geänderten Code ab.

- [x] Firmware-Build `[SUCCESS]`, geflasht 2026-10-01
- [x] Simulation `scratchpad/sim9.js` (Nachbau `battery.cpp`):
  - **Wackeln ab dem Einschalten** (9000/0 mV alle 200 ms, 500/500 ms, 800/200 ms): Sperre „gestört“ nach 6,0–6,6 s, Tiefschlaf nach weiteren 60 s
  - **Bisherige Fälle** (konstant 9000 mV, Teiler ab, Wackeln nach erkanntem Akku, EC-1, EC-7, Einzelspike, voller Akku mit Wackeln, `millis()==0`): Ergebnisse unverändert
  - **USB-Betrieb:** 4 Spikes oder ein Akku für nur 0,8 s führen zu keiner Sperre
- [x] **AC-7 am Gerät** (Nutzer, Labornetzteil 9,0 V, Firmware `9629317`, 2026-10-01): Kontakt fest, nach dem Einschalten erscheint „Akku leer – bitte laden“ mit Countdown, danach schaltet der Slider ab. Rückmeldung: „ok“.
- [x] **EC-9 und AC-13 am Gerät, Wackeln ab dem Einschalten** (Nutzer, gleiche Sitzung): „Akkumessung gestört“. Rückmeldung: „ok“.
- **NEU-A: geschlossen. NEU-C: geschlossen** (Code; das Aufwachen aus dem Tiefschlaf kommt ohne Weckquelle nicht vor).
- **Bekannte Grenze** (`design.md`): Fünf verstreute Störspitzen an einem offenen Messpin würden im USB-Betrieb sperren (Simulation „5 Spikes verteilt“ → Sperre nach 13 s). Mit dem verbauten 22-kΩ-Pull-down ist das nicht realistisch. Gewertet als Grenze, nicht als Bug.
- **Offen:** NEU-B (Low). Bei einer Messstörung zeigt der Header „🔋 –“, wörtlich gegen EC-4. Inhaltlich gilt AC-13.

**Weiterhin nicht verifiziert:**
- EC-8 am Gerät (Verbinden während der 60-s-Frist)
- Jog nach Tiefschlaf und Reset
- Ruhestrom im Tiefschlaf
- Optik von Banner und Header (kein Viewport)
- Firmware-Tests (kein Testkommando)

**Production-Ready: JA.**
- Kein Critical, kein High offen; offen ist nur NEU-B (Low).
- Die Laufzeit-Kriterien des Schutzes wurden vom Nutzer am Gerät ausgeführt:
  - AC-7, AC-12, AC-13 und EC-9 auf der aktuellen Firmware
  - Anzeige-ACs am 2026-09-30
  - T19
- Die oben genannten Punkte bleiben ungeprüft.

Status: **Approved**.
