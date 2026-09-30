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
