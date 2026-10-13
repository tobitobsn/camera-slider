# QA-Testergebnisse

## Re-Verifikation 2026-10-13 — BUG-78-Fix (`c396c7e`)

**Art des Laufs:** Re-Verifikation. Der Diff seit dem QA-Commit `1283e4e` ist der Umfang. Die Spec wurde per `/refine` geändert (`9247b01`), aber nur EC-6, und zwar passend zum Fix. Deshalb wird die neue EC-6 hier vollständig geprüft und kein voller Lauf über alle AC gemacht.
**Diff:** `git diff --stat 1283e4e..HEAD -- src firmware`:
- `src/components/JogControls.tsx`: Schalter jetzt `disabled={holdLocked || disabled}` (`:178`)
- `src/screens/RootScreen.tsx`: nur Kommentar (`:164-165`)
- `src/components/JogControls.render.test.ts`: neu
- Firmware: unverändert

`git diff --stat c396c7e..HEAD -- src firmware` ist leer. Der Hardware-Test (Teil 2, 2026-10-13) lief also auf dem aktuellen Code-Stand.
**Tester:** ein unabhängiger `qa-engineer`-Lauf ohne Kenntnis des Builds, mit allen drei Scopes in der Reihenfolge 2 → 3 → 4, beschränkt auf den Diff, BUG-78, BUG-85 und AC-10/EC-6/EC-7. Diese Session hat die Ergebnisse zusammengeführt und die Kernbelege nachgeprüft (`RootScreen.tsx:157-162`, `JogControls.tsx:178`).
**Erreichbarkeit:** `probe.kind: none` für App und Layer `firmware`. Laufzeitverhalten ist nur über den protokollierten Nutzer-Test (unten, Schritte 1–12) belegt.

**Testläufe (einmal vom Owner, vor dem Fan-out):**
- [x] `npm test` → 25 Suites, 370 Tests, alle grün, Exit 0 (Log `scratchpad/test-run.log`)
- [x] `npx tsc --noEmit -p tsconfig.json` → Exit 0
- [x] Gegenprobe der Lane: `JogControls.tsx:178` auf die alte Bedingung `disabled={holdLocked}` zurückgesetzt, dann `npx jest src/components/JogControls.render.test.ts`. Ergebnis: 1 rot („is locked … (EC-6, BUG-78)“, Expected true, Received false), 3 grün. Danach per `git checkout` wiederhergestellt, `git status` sauber, 4/4 grün.
- Firmware-Build: übersprungen. Die Firmware ist seit dem 2026-10-07 unverändert (`git diff --stat 1283e4e..HEAD -- firmware` ist leer).
- [!] Firmware-Tests: NOT VERIFIED — no test command recorded for layer firmware

**Ergebnisse:**
- [x] **BUG-78 geschlossen.** `disabled` (`RootScreen.tsx:157-162`) = `driving || timelapse.isRunning || batteryLocked || video.drive.busy` sperrt jetzt auch den Schalter (`JogControls.tsx:178`). Alle Phasen sind abgedeckt:
  - Auto-Fahrt: `autoDriving` wird vor `moveTo` gesetzt (`motor.cpp:567`).
  - Video-Take: `busy = phase !== 'ready'` (`useVideoDrive.ts:445`) umfasst `starting`, `preroll`, `driving`, `postroll` und `saving`. Test `useVideoDrive.test.ts:202-222`.
  - Zeitraffer: `isRunning` bleibt über Settle-Pause, Foto und Intervall-Pause hinweg true (`useTimelapseSequence.ts:448-480`). Test `useTimelapseSequence.test.ts:546`.
  - Am Gerät vom Nutzer bestätigt (Schritt 12, 2026-10-13).
- [x] **EC-6 (neue Fassung):**
  - Erster Satz: wie bei BUG-78. Der Stopp-Button bleibt bedienbar (`AutoDriveControls.tsx:705`).
  - Zweiter Satz: `jogging` speist `disabled` nicht (`RootScreen.tsx:83, 142`), und die Firmware meldet einen Jog nicht als `driving` (`motor.cpp:677`). Der Schalter bleibt also während Jog bedienbar. Die Firmware schiebt die Änderung auf, bis der Motor steht (`motor.cpp:786`).
  - Am Gerät: Schritt 6 (2026-10-07) und Schritt 12 (2026-10-13).
- [x] **AC-10:** Im Ruhezustand ist kein Term von `disabled` wahr. Render-Test „is operable … (AC-10)“. Bei `null` wird der Schalter ausgeblendet (`JogControls.tsx:175`).
- [x] **EC-7:** `holdLocked` sperrt auch für sich allein (`JogControls.tsx:178`, Render-Test „is locked by the battery lock on its own (EC-7)“). Die Firmware-Seite ist unverändert (`motor.cpp:760-778`).
- [ ] **BUG-85 weiter offen (Low):** `HoldSwitchRow.tsx` ist seit `1283e4e` unverändert, es gibt keine Dimmung bei `disabled`.
- Alle übrigen AC/EC, die Design-Garantien, Security und die Regression der Nachbarn aus dem Lauf vom 2026-10-07 gelten weiter: unverändert seit 2026-10-07 und in diesem Lauf nicht erneut geprüft. Der Diff hat `motor.cpp`, `ble.cpp`, `useHoldSetting.ts`, `HoldSwitchRow.tsx` und `client.ts` nicht berührt.

**Security (auf den Diff beschränkt): 1 verifiziert, 6 NOT VERIFIED.**
- [x] Kein neuer Eingabepfad: Der Schalter sendet weiter einen Boolean über `sendSetHoldCommand` (`client.ts:434`, unverändert). Der Diff enthält keine Env-Variable und keine Konfiguration.
- [!] Auth bypass, Authorization, Brute force, Credentials in der URL, sensible API-Daten: NOT VERIFIED — nicht anwendbar (kein Backend, keine Credentials, keine Formulare)
- [!] Rate limiting: NOT VERIFIED — nicht implementiert, siehe BUG-81
- Beobachtung (kein neuer Bug): Die EC-6-Sperre gibt es nur in der App. Ein fremder BLE-Client kann SET_HOLD weiter im Video-Vor- und -Nachlauf senden. Das deckt BUG-81 schon ab; der Fix macht es nicht schlechter.

**Regression:**
- [x] PROJ-1: In `RootScreen.tsx` haben sich nur Kommentare geändert. `__tests__/App.test.tsx` ist grün.
- [x] PROJ-3, PROJ-5, PROJ-6: Jog-Tasten und Regler hängen am unveränderten `disabled` (`JogControls.tsx:168, 188, 201`). `useVideoDrive.test.ts`, `AutoDriveControls*.test.ts`, `useTimelapseSequence.test.ts`, `TimelapseControls.test.ts` und `BatteryLockBanner.test.ts` sind grün.
- [!] Laufzeit der Nachbarn: NOT VERIFIED — no way to run and probe this project was recorded. Teilweise vom Nutzer abgedeckt (Schritte 9–11, 2026-10-13).

**Unit-Tests (Step 6):** Keine neuen geschrieben. Der Diff enthält keine neue isolierte Logik, nur eine Prop-Bedingung, und die deckt der neue Render-Test samt Gegenprobe ab. Die verbleibende Lücke (wie `disabled` in `RootScreen` zusammengesetzt wird) ist kein Unit-Ziel, siehe BUG-86.

**Neue Befunde:**
- [ ] **BUG-86 (Low, Testlücke):** Kein Test sichert, wie sich `disabled` in `RootScreen.tsx:157-162` zusammensetzt: `video.drive.busy`, `timelapse.isRunning` und dass `jogging` nicht einfließt. Es gibt keine RootScreen-Testdatei. Würde später ein Term entfernt oder `jogging` ergänzt, bliebe die Suite grün, obwohl BUG-78 dann wieder auftritt bzw. der Schalter beim Jog gesperrt wäre. Empfehlung: den Ausdruck in eine kleine Funktion auslagern und testen, oder einen RootScreen-Render-Test schreiben.
- [ ] **BUG-87 (Low, Kommentar-Drift, gehört zu BUG-84):**
  - `HoldSwitchRow.tsx:11` dokumentiert `disabled` nur für EC-7.
  - `JogControls.tsx:56-61` spricht noch von einem „not-yet-built“ Stopp-Button.
- Info, kein Bug: Nach dem letzten Zeitraffer-Foto, und bei einer Auto-Fahrt ohne Video zwischen dem Tippen auf „Fahren“ und der ersten `driving`-Meldung, ist `disabled` für etwa ein Notify-Intervall (Millisekunden) false. Ein Umschalten genau in diesem Moment greift höchstens vor dem Losfahren. Es ist keine Aufnahme betroffen, weil alle Fotos schon gemacht sind bzw. noch kein Take läuft.

**Nicht verifiziert in diesem Lauf:**
- [!] Laufzeit von EC-6, AC-10, EC-7 und BUG-78 durch die Verifier — no way to run and probe this project was recorded. Belegt ist das Verhalten durch den Nutzer-Test (Schritte 4, 6 und 12).
- [!] Optik des gesperrten Schalters (BUG-85) — kein Viewport
- [!] Firmware-Laufzeit — layer firmware: nothing to probe, kein Testbefehl
- [!] Bundle-Grep auf Secrets — kein Release-Build in diesem Lauf. Der Diff enthält keine Konfiguration.

**Production Ready: JA.**
- Es gibt keine Critical-, High- oder Medium-Bugs mehr: BUG-78, der einzige Medium-Bug, ist geschlossen.
- Alle Laufzeit-ACs (AC-1 bis AC-12, EC-6, EC-8) hat der Nutzer am 2026-10-07 und am 2026-10-13 auf dem Galaxy S24 mit dem echten Slider ausgeführt, auf dem aktuellen Code-Stand.
- Offen sind nur Low-Bugs: BUG-77, BUG-79 bis BUG-87.
- Nicht verifiziert bleiben: EC-1, EC-5, EC-9 und EC-7 am Gerät, Fuzzing gegen die BLE-Schnittstelle (GATT), Firmware-Tests.
- Status: **Approved**.

**Deploy-Hinweis:** Das Status-Format ist auf 11 Byte gewachsen. App und Firmware müssen deshalb gemeinsam ausgeliefert werden. Die zuletzt deployte Firmware (`9629317`, v1.4.0) kennt SET_HOLD nicht.

---

## Lauf vom 2026-10-07 (vollständig, nach `/refine` „Halten im Stillstand“)

**Getestet:** 2026-10-07
**App-URL:** nicht ausführbar hier (`probe.kind: none`, Top-Level und Layer `firmware`). Jedes Laufzeit-AC ist unten `[!] NOT VERIFIED`, bis ein menschlicher Test protokolliert ist.
**Tester:** 3 unabhängige `qa-engineer`-Subagenten (Acceptance / Security / Regression), jeweils in frischem Kontext ohne Kenntnis des Builds. Diese Session hat sie zusammengeführt, Code-Belege der Bugs stichprobenartig nachgeprüft und Step 6 (Unit-Tests) gemacht.
**Scope:** vollständig. PROJ-2 kommt aus `/refine` (Commit `85c650e`, „Halten im Stillstand“), der Vertrag hat sich geändert, deshalb keine Re-Verifikation. Geprüft sind alle 12 AC und 9 EC. Schwerpunkt sind die neuen AC-8 bis AC-12 und EC-6 bis EC-9. Untersuchter Diff: `git diff 85c650e..HEAD` (21 Dateien, u. a. `firmware/src/motor.cpp`, `firmware/src/ble.cpp`, `firmware/src/main.cpp`, `src/ble/client.ts`, `src/components/useHoldSetting.ts`, `src/components/HoldSwitchRow.tsx`, `src/components/JogControls.tsx`, `src/screens/RootScreen.tsx`).

> Legende: `[x]` in diesem Lauf verifiziert (Beleg erforderlich) · `[ ] BUG` als fehlerhaft verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund erforderlich)
>
> **Wichtig:** Ein `[x]` bedeutet hier „im Code bzw. per Test belegt“. Das Verhalten am echten Slider ist für **jedes** AC zusätzlich `[!] NOT VERIFIED — no way to run and probe this project was recorded`. Das gilt, bis der menschliche Hardware-Test unten protokolliert ist.

## Testläufe (einmal vor dem Fan-out, vom Owner)

- [x] App-Suite: `npm test` → 24 Suites, 363 Tests, alle grün (Log `scratchpad/test-run.log`, Exit 0)
- [x] Typprüfung: `npx tsc --noEmit -p tsconfig.json` → Exit 0
- [x] Firmware-Compile: `pio run -e esp32dev` → SUCCESS (RAM 12,5 %, Flash 50,5 %). Die Regressions-Lane hat zusätzlich in ein frisches Build-Verzeichnis kompiliert (`PLATFORMIO_BUILD_DIR=… pio run -e esp32dev`) → SUCCESS, alle 4 `src`-Dateien neu übersetzt. Einzige Warnung ist ein vorbestehendes, veraltetes `NimBLEService::start()` in `ble.cpp:416`.
- [!] Firmware-Tests: NOT VERIFIED — no test command recorded for layer firmware (`layers[0].commands.test: null`)
- [x] Nach Step 6 nur die betroffenen Dateien: `npx jest src/components/useHoldSetting.test.ts src/ble/client.test.ts src/components/HoldSwitchRow.render.test.ts` → 3 Suites, 55 Tests grün

## Acceptance-Criteria-Status

#### AC-1 — Taste halten → Slider fährt
- [x] Code/Test: JOG wird sofort und dann alle 300 ms gesendet (`src/components/JogControls.tsx:131-147`). Zustandsmaschine getestet in `useJogState.test.ts`. Firmware `motor.cpp:284-375`. Bei Halten an wird der Treiber vorher bestromt (`motor.cpp:317`).
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### AC-2 — Loslassen → sofortiger Stopp
- [x] Code/Test: Das Effect-Cleanup stoppt das Intervall und sendet STOP (`JogControls.tsx:143-146`). Firmware `forceStop()` in `motor.cpp:395-397`. Test `useJogState.test.ts` „jogging_forward + RELEASE_FORWARD -> idle“.
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### AC-3 — Geschwindigkeit live
- [x] Code: Die Geschwindigkeit geht über `speedRef` mit dem nächsten 300-ms-Heartbeat raus (`JogControls.tsx:124-139`). Firmware `setSpeedInHz` (`motor.cpp:314, 332-339`). „Sofort“ heißt hier bis zu 300 ms, wie im Design festgelegt.
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### AC-4 — Beide Tasten → Stopp
- [x] Test: Zustand `blocked` getestet in `useJogState.test.ts:45-51, 99-155`
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### AC-5 — Disconnect während Jog → Firmware stoppt
- [x] Code: `onDisconnect` ruft bei verschlüsselter Verbindung `motorStop()` (`firmware/src/ble.cpp:142-144`). Die App zeigt das PROJ-1-Banner in `reconnecting` (`src/screens/RootScreen.tsx:203-211`).
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### AC-6 — Dead-man's-switch ~1 s
- [x] Code: Watchdog mit 1000 ms (`motor.cpp:417-436`), aufgerufen in `loop()`. `lastJogMillis` wird vor dem Start gesetzt (`motor.cpp:308`).
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### AC-7 — Nicht verbunden → nicht bedienbar
- [x] Code: `JogControls` wird nur in `connected` gerendert (`RootScreen.tsx:121-200`) und liefert ohne `device` null (`JogControls.tsx:149-151`). Der Platzhalter hat `pointerEvents="none"` (`RootScreen.tsx:206-209`).
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### AC-8 — Halten an → Motor bleibt mit reduziertem Strom bestromt
- [x] Code: `rms_current(1700, 0.6)` setzt IHOLD = 60 % (`motor.cpp:32, 256`, TMCStepper `TMCStepper.cpp:38-42`). Dazu `TPOWERDOWN(20)` und `iholddelay(8)` (`motor.cpp:257-258`). Halten an = `setAutoEnable(false)` (`motor.cpp:281`). Alle drei Bewegungsstarts bestromen: Jog `:317`, Auto-Fahrt `:571`, Zeitraffer `:635`. `motorStop()` schaltet nicht ab (`motor.cpp:377-415`).
- [!] Hardware: NOT VERIFIED — ob 60 % den Schlitten auf geneigter Schiene halten und ob der Übergang ruckfrei ist, zeigt nur der Hardwaretest (Open Question in `spec.md`)
- Siehe BUG-79 (Race beim Einschalten)

#### AC-9 — Halten aus → stromlos
- [x] Code: `setAutoEnable(true)` (`motor.cpp:281, 805`). FastAccelStepper schaltet direkt nach dem Stopp ab (`_off_delay_count` = 1, `FastAccelStepper.cpp:485-494`). Beim Umschalten im Stillstand sofort `disableOutputs()` (`motor.cpp:806`).
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### AC-10 — Schalter unter dem Geschwindigkeitsregler, zeigt den Slider-Zustand, wirkt sofort
- [x] Code/Test: `HoldSwitchRow` steht in `JogControls.tsx:172-179` direkt nach dem Regler. Label in `HoldSwitchRow.tsx:6`. Der Wert kommt aus Status-Byte 10 (`src/ble/client.ts:495`). Opcode 0x08 in `ble.cpp:245-254`. `motorHoldCheck()` wendet den Wunsch im nächsten `loop()` an (`motor.cpp:766-813`). Tests: `HoldSwitchRow.render.test.ts`, `client.test.ts:241-256, 311-335`, `useHoldSetting.test.ts`.
- [!] Darstellung/Laufzeit: NOT VERIFIED — kein Viewport, kein Gerät
- Siehe BUG-78 (Schalter während eines Video-Takes bedienbar) und BUG-77 (Anzeige bei schnellem Umschalten)

#### AC-11 — Einstellung bleibt über Abbruch/Neustart auf dem Slider
- [x] Code: NVS `slider`/`hold` wird beim Boot gelesen (`motor.cpp:279-281`) und beim Anwenden geschrieben, nur wenn sich der Wert ändert (`:789-791`). `onDisconnect` lässt den Wert in Ruhe (`ble.cpp:122-151`).
- [!] Neustart am Gerät: NOT VERIFIED — no way to run and probe this project was recorded
- Siehe BUG-80 (Schreibergebnis ungeprüft, Wunsch vor dem Speichern gemeldet) und BUG-81 (Fremdgerät, Flash-Verschleiß)

#### AC-12 — Auslieferungszustand: an, aber erst mit der ersten Fahrt bestromt
- [x] Code: Default `getBool(..., true)` (`motor.cpp:280`). EN steht beim Boot auf HIGH (`motor.cpp:245-246`). `setAutoEnable(false)` fasst den Pin nicht an (`FastAccelStepper.cpp:596-601`). Bestromt wird erst über `energizeIfHolding()` (`motor.cpp:221-225`).
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

## Edge-Cases-Status

#### EC-1 — Finger aus dem Button gezogen = Loslassen
- [x] Code: `Pressable onPressOut` (`JogControls.tsx:182-207`), Retention-Offset 40 px (`JogControls.tsx:28`, bewusst wegen BUG-17)
- [!] Touch am Gerät: NOT VERIFIED — kein Gerät

#### EC-2 — Beide Tasten, keine Richtung hat Vorrang
- [x] Test: `useJogState.test.ts:45-56`. `directionFor(blocked) = null` (`JogControls.tsx:131-134`).

#### EC-3 — Abbruch während Jog → Firmware stoppt
- [x] Code (Garantie): `ble.cpp:142-144`
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### EC-4 — Kein Halte-Signal trotz bestehender Verbindung → Stopp
- [x] Code (Garantie): Watchdog `motor.cpp:417-436`, unabhängig vom Verbindungsstatus
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### EC-5 — Nach Reconnect gestoppter Ausgangszustand
- [x] Code: Unmount/Remount über den Zweig `reconnecting` (`RootScreen.tsx:203-211`), Startzustand `idle`
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### EC-6 — Umschalten während einer Fahrt → gilt ab dem nächsten Stopp
- [x] Code (Garantie): Der BLE-Callback merkt den Wunsch nur vor (`motor.cpp:759-764`). `motorHoldCheck()` lässt ihn liegen, solange `isRunning()` gilt (`motor.cpp:785-787`).
- [ ] BUG-78: Im Vor- und Nachlauf eines Video-Takes sowie in den Pausen zwischen Zeitraffer-Schritten steht der Motor. Ein Umschalten wirkt dort sofort, mitten in der für den Nutzer laufenden Fahrt.

#### EC-7 — Schutz-Sperre: stromlos, Schalter nicht bedienbar
- [x] Code/Test (Garantie): `motorSetHold()` ignoriert den Befehl bei Sperre (`motor.cpp:759-762`). `motorHoldCheck()` verwirft Wünsche und schaltet im Stillstand erneut ab (`:770-780`), im selben `loop()`-Task wie `motorLockout()` (`main.cpp:60, 64`). `motorLockout()` setzt zusätzlich `toff(0)` (`motor.cpp:735`). App: `holdLocked = batteryLocked` (`RootScreen.tsx:167`). Test `HoldSwitchRow.render.test.ts` „is not operable while disabled (EC-7)“.
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### EC-8 — Abbruch im Stillstand → Motor hält weiter
- [x] Code (Garantie): `onDisconnect` ruft nur `motorStop()` (`ble.cpp:142-144`). Das schaltet im Stillstand nicht ab (`motor.cpp:395-414`). Auch das STOP nach dem Reconnect (`ConnectionProvider.tsx:161`) schaltet nicht ab.
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

#### EC-9 — Ausbleibende Bestätigung → nach Reconnect gilt der gemeldete Zustand
- [x] Code/Test: `useSliderStatus` setzt bei `device = null` auf `holdAtStandstill: null` zurück (`useSliderStatus.ts:56-60`). Der Remount verwirft `pending`. Der Wert kommt per Notify-on-Subscribe (`ble.cpp:276-288`). Tests `useHoldSetting.test.ts`, darunter neu: „never keeps the failed request, even when the slider reports no value (EC-9)“.
- [!] Laufzeit: NOT VERIFIED — no way to run and probe this project was recorded

### Design-Garantien gegen den Code (alle vorhanden)
- [x] Umschalten nur im `loop()`-Task (`motor.cpp:759-813`, `main.cpp` `loop()`)
- [x] SET_HOLD mit Länge ≠ 2 oder Wert > 1 wird ignoriert (`ble.cpp:249`, vom Owner nachgeprüft)
- [x] Flash-Schreiben nur bei echter Änderung (`motor.cpp:789`)
- [x] Payload 11 Byte, Byte 10 Bit 0 (`ble.cpp:85`). Der Diff-Check deckt 11 Byte ab (`ble.cpp:435-448`).
- [x] Der Parser liest Byte 10 nur bei ≥ 11 Byte. Bei 10 Byte → `null`, Schalter ausgeblendet (`client.ts:495`, `JogControls.tsx:172`, `client.test.ts:326`).
- [x] Pending-Fallback 1,5 s (`useHoldSetting.ts:11, 40-51`)
- [x] FAS-Falle mit dem Auto-Disable-Zähler abgefangen (`motor.cpp:800-803`, `FastAccelStepper.cpp:723-726`)

## Security-Audit-Ergebnisse

Die Angriffsfläche ist die BLE-GATT-Schnittstelle des ESP32 (kein HTTP, kein Login). **Verifiziert: 5 · NOT VERIFIED: 5.**

- [x] Schreibschutz: Die Command-Characteristic verlangt Verschlüsselung (`WRITE_ENC`, `ble.cpp:404-406`). SET_HOLD läuft darüber. Einschränkung siehe BUG-81: Just-Works-Verschlüsselung ist für jedes Gerät erreichbar.
- [x] Eingabevalidierung: Zu kurze, zu lange und ungültige SET_HOLD-Writes werden ignoriert (`ble.cpp:249-252`), leere Writes verworfen (`ble.cpp:160`). Kein Lesen außerhalb der Puffergrenzen.
- [x] App-Parser: Byte 10 nur bei Länge ≥ 11, reservierte Bits ausmaskiert (`client.ts:495`). Kein Lesen außerhalb der Grenzen.
- [x] Sperre nicht umgehbar: SET_HOLD wird während der PROJ-6-Sperre ignoriert, der Treiber bleibt stromlos (`motor.cpp:759-780, 735`).
- [x] Keine Secrets: Suche über `src`, `firmware/src`, `android/app/src` und die Strings des Release-Bundles (`index.android.bundle`) nach Key-Mustern → keine Treffer. `ios/.xcode.env` gemäß Regel nicht gelesen.
- [!] Rate limiting: NOT VERIFIED — nicht implementiert. Für SET_HOLD hat das Folgen, siehe BUG-81.
- [!] Brute force / Enumeration / Massen-Signup: NOT VERIFIED — nicht anwendbar, keine Credentials und keine Konten. Pairing ist Just Works ohne Passkey.
- [!] Credentials in der URL: NOT VERIFIED — nicht anwendbar, keine Formulare oder URLs
- [!] Fuzzing/Flut gegen die echte GATT-Schnittstelle: NOT VERIFIED — no way to run and probe this project was recorded
- [!] `[user]`-Tasks: keine in `tasks.md`, nichts zu prüfen

## Regression (Deployed-Nachbarn)

- [x] **PROJ-1:** `ConnectionProvider` und `connectionReducer` sind nicht im Diff, ihre Tests sind grün. Bytes 0–9 des Status sind unverändert (`ble.cpp:58-85`). Disconnect-Stopp unverändert (`ble.cpp:142-144`).
- [x] **PROJ-3:** `motorAutoDrive` bestromt vor `moveTo` (`motor.cpp:571`). Stopp und Abbruch unverändert, Suite grün. **Aber:** BUG-78 widerspricht AC-9/AC-28.
- [x] **PROJ-4:** Preset-Code nicht im Diff, `usePresets.test.ts` grün, `motorSetEndFromDistance` unverändert
- [x] **PROJ-5:** `motorTimelapseMoveTo` bestromt (`motor.cpp:635`). Gegenseitiger Ausschluss und Suite grün.
- [x] **PROJ-6:** `motorLockout` unverändert (`motor.cpp:714-736`). `holdLocked` hängt an `batteryLocked`. Die 10-Byte-Payload wird weiter geparst (`client.test.ts`). Siehe BUG-83.
- [!] Laufzeit aller Nachbarn: NOT VERIFIED — no way to run and probe this project was recorded

## Unit-Tests (Step 6)

`src/components/useHoldSetting.test.ts`, drei neue Tests:
1. Der Wunschwert bleibt stehen, solange die Übertragung noch läuft, auch über die 1,5-s-Wartezeit hinaus.
2. Kommt vor der Bestätigung noch ein Status mit dem alten Wert, springt der Schalter nicht zurück.
3. Nach einem Sendefehler bleibt kein alter Wunschwert stehen, auch wenn der Slider `null` meldet (EC-9).

Rot-Prüfung durchgeführt:
- Die Guards im Hook wurden gebrochen: Timer unabhängig vom Sendeerfolg, Pending bei jedem Status löschen, Pending bei Sendefehler nicht löschen. Ergebnis: Test 1 und 2 rot, zusammen mit 2 bestehenden Tests.
- Der dritte Guard wurde einzeln gebrochen, weil eine andere Mutation ihn maskiert hatte. Dabei fiel auf, dass Test 3 in seiner ersten Fassung grün blieb. Er wurde deshalb umgeschrieben und ist danach rot geworden.
- Danach wurde alles wiederhergestellt, Ergebnis 9/9 grün. Der Hook ist unverändert (`git status`: nur die Testdatei geändert).

Zusätzlich mit einer Wegwerf-Probe (gelöscht) BUG-77 reproduziert, siehe unten.

## E2E-Tests

- Status: **nicht gelaufen** (`/e2e-tests` für kritische Flows; bei probe `none` ohnehin nur am Gerät sinnvoll)

## Menschlicher Hardware-Test (Teil 1 und Teil 2 erledigt)

**Stand 2026-10-07:**
- Getestet wurde mit der Firmware vom Stand `c396c7e`, frisch geflasht (`pio run -e esp32dev -t upload`, „Hash of data verified“).
- Die App ist ein Release-APK mit dem BUG-78-Fix, installiert per `adb install -r` auf dem Galaxy S24 (SM-S921B).

Ergebnisse von Teil 1:
- [x] Schritt 1 / AC-12 — vom Nutzer verifiziert auf dem Galaxy S24 + echtem Slider, 2026-10-07: Nach dem Einschalten ist der Motor stromlos.
- [x] Schritt 2 / AC-8 — vom Nutzer verifiziert auf dem Galaxy S24 + echtem Slider, 2026-10-07: Mit Halten an hält der Schlitten auf schräger Schiene, kein Ruck. Die Open Question „Reichen 60 %?“ ist damit für diese Aufstellung beantwortet.
- [x] Schritt 3 / AC-9 — vom Nutzer verifiziert auf dem Galaxy S24 + echtem Slider, 2026-10-07: Mit Halten aus ist der Motor nach dem Stopp stromlos.
- [x] Schritt 4 / AC-10 — vom Nutzer verifiziert auf dem Galaxy S24 + echtem Slider, 2026-10-07: Ein Umschalten im Stillstand wirkt sofort.
- [x] Schritt 5 / AC-11 — vom Nutzer verifiziert auf dem Galaxy S24 + echtem Slider, 2026-10-07: Die Einstellung „aus“ bleibt über einen Neustart des Sliders erhalten.
- [x] Schritt 6 / EC-6 (Jog-Teil) — vom Nutzer verifiziert auf dem Galaxy S24 + echtem Slider, 2026-10-07: Ein Umschalten während der Jog-Fahrt gilt erst nach dem Stopp.
- [x] Schritt 7 / EC-8 — vom Nutzer verifiziert auf dem Galaxy S24 + echtem Slider, 2026-10-07: Der Motor hält weiter, wenn im Stillstand Bluetooth abgeschaltet wird.
Ergebnisse von Teil 2 (gleicher Firmware- und App-Stand wie Teil 1, Galaxy S24, Ergebnisse gemeldet am 2026-10-13):
- [x] Schritt 8 / Wärme/Akku (Open Questions) — vom Nutzer verifiziert: Nach 20 min Halten sind Treiber und Motor kühl, der Akkustand ist um 3 % gesunken. Für BUG-83 reicht das nicht, dafür fehlt der Vergleich mit Halten aus.
- [x] Schritt 9 / PROJ-5 — vom Nutzer verifiziert: Im Zeitraffer auf schräger Schiene mit Halten an springt das Bild nicht.
- [x] Schritt 10 / PROJ-3 — vom Nutzer verifiziert: Fahrt mit Video und Ton, Halten an, auf der Tonspur ist nichts zu hören.
- [x] Schritt 11 / AC-1–AC-7 (Kurz-Regression) — vom Nutzer verifiziert: alles wie bisher.
- [x] Schritt 12 / EC-6 (BUG-78-Teil) — vom Nutzer verifiziert: Im Video-Take und in der Zeitraffer-Sequenz reagiert der Schalter nicht, er ist also gesperrt. Das erfüllt EC-6 („nicht bedienbar“). **Er ist aber nicht ausgegraut**, siehe BUG-85.

Die Checkliste, ein Schritt pro Punkt:

1. **AC-12:** Slider frisch einschalten, ohne zu fahren. Lässt sich der Schlitten von Hand verschieben (stromlos)?
2. **AC-8:** Schiene schräg aufstellen, schwerste Kamera drauf, Halten an, kurz joggen und loslassen. Bleibt der Schlitten stehen? Gibt es beim Stopp einen Ruck?
3. **AC-9:** Halten aus, joggen, loslassen. Ist der Motor stromlos (Schlitten von Hand verschiebbar)?
4. **AC-10:** Im Stillstand den Schalter umlegen. Wirkt es sofort (hält bzw. lässt los)?
5. **AC-11:** Auf „aus“ stellen, Slider aus- und wieder einschalten, App neu verbinden. Zeigt der Schalter „aus“?
6. **EC-6:** Während einer Jog-Fahrt umschalten. Fährt der Motor unverändert weiter, und gilt die Einstellung erst nach dem Stopp?
7. **EC-8:** Halten an, im Stillstand Bluetooth am Handy ausschalten. Hält der Motor weiter?
8. **Wärme/Akku (Open Questions):** 15–30 min halten lassen. Wie warm werden Motor und Treiber? Wie stark sinkt der Akkustand?
9. **PROJ-5:** Zeitraffer auf schräger Schiene mit Halten an. Verschiebt sich das Bild kurz nach jedem Schritt (Stromabsenkung beginnt ca. 0,4 s nach dem Stopp)?
10. **PROJ-3:** Fahrt mit Video und Ton, Halten an. Ist der Haltestrom auf der Tonspur hörbar (Pfeifen/Brummen)?
11. **AC-1–AC-7 (Kurz-Regression):** Jog vor/zurück, loslassen, beide Tasten, Bluetooth aus während der Fahrt. Alles wie bisher?
12. **EC-6 / BUG-78:** Auto-Fahrt mit „Video aufnehmen“ starten. Ist der Schalter im Vorlauf, während der Fahrt und im Nachlauf ausgegraut? Dasselbe während einer Zeitraffer-Sequenz prüfen.

## Nicht verifiziert in diesem Lauf

- [!] Laufzeitverhalten aller AC-1–12 und EC-1–9 — no way to run and probe this project was recorded (`probe.kind: none`, App und Firmware)
- [!] Hardwarewerte: Haltemoment bei 60 %, Ruckfreiheit, Wärme, Akkulaufzeit — Open Questions der Spec, nur am Gerät
- [!] Darstellung des Schalters, Touch-Verhalten (EC-1) — kein Viewport, kein Gerät
- [!] Firmware-Tests — no test command recorded for layer firmware
- [!] Fuzzing/Flut gegen die GATT-Schnittstelle, Fremdgerät-Szenarien — kein Gerät
- [!] Rate limiting — nicht implementiert (siehe BUG-81)
- [!] Seiteneffekte auf PROJ-3 (Ton), PROJ-5 (Bildverschiebung), PROJ-6 (Spannungsmessung) — nur am Gerät messbar

## Bugs Found

### Previously Fixed
_Behoben und unabhängig re-verifiziert. Details stehen in der Git-Historie (`git log --grep="PROJ-2"`)._

| ID | Severity | Kurzbeschreibung |
|---|---|---|
| BUG-1 | Medium | AC-4/EC-2 — zweite Richtungstaste „gewann“ nach Zwischenloslassen, ohne dass beide je gemeinsam losgelassen wurden |
| BUG-2 | Medium | AC-3 — Geschwindigkeitswechsel während laufender Fahrt in der Firmware nicht übernommen |
| BUG-3 | Medium | Command-Characteristic ohne Authentifizierung, mit physischer Wirkung (Just-Works-Bonding; Schutzwirkung im Security-Audit 2026-09-23 beschrieben) |
| BUG-4 | Medium | Kein Re-Advertising bei erfolgreichem Connect — Connection-Squatting möglich |
| BUG-10 | High | App nicht an die Bonding-Pflicht angepasst — erster Jog nach frischem Pairing brach still ab |
| BUG-11 | Medium | Fremdes Gerät konnte durch Verbinden+Trennen die laufende Fahrt stoppen |
| BUG-14/15 | Low | Veraltete Kommentare in `client.ts`/`ble.cpp` |
| BUG-16 | High | Jog nach Auto-Fahrt dauerhaft tot — Ursache `forceStop()` im Stillstand (Immediate-Stop-Flag), behoben in `a763cb3`. Lehre: Ein Firmware-Reflash zwischen Fix und Bestätigungstest verfälscht das Ergebnis, weil der Neustart den Fehlerzustand löscht |
| BUG-17 | Medium | ScrollView stahl den Touch von den Jog-Tasten — Scrollen während Jog gesperrt |
| BUG-18 | High | PROJ-3 AC-11 — automatisch eingetragene Mindestdauer abgerundet statt aufgerundet |
| BUG-20 | Medium | Erster JOG nach STOP im Stillstand geschluckt (Restfenster siehe BUG-24) |
| BUG-22 | Low | Doku/Kommentare mit falscher BUG-16-Ursache, DIR-Polarität fehlte (Rest siehe BUG-26) |
| BUG-23 | Low | `lastJogMillis` erst nach dem Start gesetzt |
| BUG-78 | Medium | Halte-Schalter im Video-Vor-/Nachlauf und in Zeitraffer-Pausen bedienbar — gesperrt mit `c396c7e`, re-verifiziert 2026-10-13 |


#### BUG-77: Schnelles Mehrfach-Umschalten — veraltete Antworten bestimmen die Anzeige
- **Severity:** Low
- **Steps to Reproduce (per Wegwerf-Test reproduziert):** `reported = false`, toggle(true) → Sendung A hängt; toggle(false), toggle(true). Dann scheitert A verspätet. Ergebnis der Probe: vorher `value = true`, danach `value = false` mit `sendFailed = true`, obwohl die neueste Sendung noch läuft. Ursache: `useHoldSetting.ts:57-72` ordnet Antworten keiner Anfrage zu.
- Verwandt (Acceptance-Lane): Wer schnell aus und wieder an schaltet, löscht den Pending-Wert sofort (`useHoldSetting.ts:33-38`). Kommen beide Befehle in getrennten `loop()`-Durchläufen an, wird der Motor kurz stromlos geschaltet; auf schräger Schiene ist ein minimales Rutschen möglich.
- Am Ende stimmt der Zustand, weil der gemeldete Wert korrigiert.
- **Priority:** Nice to have

#### BUG-79: Race beim Einschalten von „Halten“ gegen einen gleichzeitigen Fahrtstart
- **Severity:** Low
- **Beschreibung:**
  - `motorHoldCheck()` prüft `isRunning()` (`motor.cpp:785`) und führt dann `setAutoEnable(false)` → `disableOutputs()` → `enableOutputs()` aus (`:800-803`). Das ist nicht atomar gegenüber einem Start aus dem NimBLE-Task.
  - Startet in diesem Fenster eine Fahrt (mit noch `holdApplied == false`, also ohne `energizeIfHolding`), zieht `disableOutputs()` EN mitten im Lauf hoch, denn ohne Auto-Enable verweigert es nicht mehr (`FastAccelStepper.cpp:700`).
  - Folge: Schritte gehen verloren und die Position weicht ab (PROJ-3 AC-8). Das Fenster liegt im Mikrosekunden-Bereich. Der Zweig „aus“ ist robust.
- **Priority:** Nice to have

#### BUG-80: Die Persistenz der Einstellung ist nicht abgesichert
- **Severity:** Low
- **Beschreibung:**
  - (1) Die Rückgabewerte von `prefs.putBool()` (`motor.cpp:790`) und `prefs.begin()` (`:279`) werden ignoriert. Trotzdem wird `holdApplied` gesetzt und gemeldet. Bei einem NVS-Fehler gilt nach dem Neustart still der alte Wert.
  - (2) Ein Wunsch während einer Fahrt wird sofort als Status gemeldet (`motor.cpp:682-684`), gespeichert aber erst beim nächsten Stillstand. Wird der Slider vor dem Fahrtende ausgeschaltet, gilt der alte Wert, obwohl die App den neuen gezeigt hat.
  - Beides berührt AC-11 am Rand.
- **Priority:** Nice to have

#### BUG-81: Fremdgerät kann die Einstellung dauerhaft ändern und den Flash ungebremst beschreiben
- **Severity:** Low (Erweiterung des bereits akzeptierten Restrisikos „Pairing steht jedem offen“, `design.md:229`)
- **Beschreibung:**
  - NimBLE verschlüsselt den Link auch dann, wenn das Speichern des Bonds abgelehnt wird (`ble_sm.c:615, 619, 1027-1037`). Damit ist `WRITE_ENC` für jedes Gerät in Reichweite erfüllt.
  - Neu gegenüber dem bisherigen Risiko: Die Einstellung überlebt einen Neustart. Auf schräger Schiene rutscht die Kamera dann nach dem nächsten Stopp weg.
  - Es gibt keine Drosselung. Abwechselnd `08 01`/`08 00` per Write-without-response löst pro `loop()` einen NVS-Commit aus (`motor.cpp:789-791`). Grob 10⁷–10⁸ Writes bis zum Flash-Verschleiß, das wären Tage Dauerangriff. Dieselbe Partition hält die Bonds.
  - Wiederholtes `08 01` erzeugt außerdem jedes Mal einen kurzen stromlosen Impuls (`motor.cpp:800-803`).
- **Steps to Reproduce (nicht ausgeführt, kein Gerät):** Zweites Handy mit nRF Connect → Just Works → Write `08 00` auf `6e400002-…` → Neustart → Status-Byte 10 = `0x00`
- **Priority:** Nice to have

#### BUG-82: Ein Umschaltwunsch kann zwischen zwei Tasks verloren gehen
- **Severity:** Low
- **Beschreibung:** `if (holdRequest == request) holdRequest = -1;` (`motor.cpp:810-812`) ist nicht atomar. Ein `motorSetHold()` aus dem NimBLE-Task genau dazwischen wird überschrieben. Die App fällt nach 1,5 s auf den gemeldeten Wert zurück, EC-9 bleibt gewahrt, aber das Umschalten wird still verworfen. Das Fenster ist wenige Instruktionen breit.
- **Priority:** Nice to have

#### BUG-83: Die Akku-Messung „im Stillstand“ ist mit Halten an jetzt eine Messung unter Last
- **Severity:** Low (unbekannte Größe, geschätzt einige 10 mV)
- **Beschreibung:**
  - PROJ-6 misst nur im Stillstand, weil die Spannung unter Last sinkt (`battery.cpp:173-178`). Im Werkszustand fließen im Stillstand jetzt ca. 1 A Haltestrom.
  - Folgen: Die Anzeige liest niedriger, und die 9,3-V-Schwelle greift früher (konservative Richtung). `kCalibrationFactor` wurde am 2026-09-30 ohne Haltestrom kalibriert.
  - Weder Spec noch Design erwähnen das.
- **Steps to Reproduce:** Akkuspannung im Stillstand mit Halten an und aus vergleichen (Hardwaretest)
- **Priority:** Nächster Durchgang / im Hardwaretest messen

#### BUG-84: Doku- und Kommentar-Drift
- **Severity:** Low
- **Beschreibung:**
  - Der Kommentar im `default`-Zweig von `firmware/src/ble.cpp:255-259` zählt die Opcodes nur bis `0x07`.
  - PROJ-6 `design.md:78, 200, 212` beschreibt den Status mit 10 Byte, der aktuelle Stand steht in PROJ-2 `design.md` bzw. im Stack-Pack.
  - `docs/stacks/firmware-esp32-tmc2209.md:117` behauptet, weitere Opcodes seien „noch nicht festgelegt“ (vorbestehend).
  - Der Ruhestrom in PROJ-6 `design.md:210` (ca. 100 mA) berücksichtigt den Haltestrom nicht.
- **Priority:** Nice to have

#### BUG-85: Gesperrter Halte-Schalter wird nicht ausgegraut
- **Severity:** Low (nur Optik, die Sperre selbst wirkt)
- **Gefunden:** Hardware-Test Schritt 12, Galaxy S24, 2026-10-13
- **Beschreibung:** Während Auto-Fahrt, Video-Take und Zeitraffer-Sequenz reagiert der Schalter „Motor hält im Stillstand“ nicht, sieht aber unverändert aus. Die Jog-Tasten daneben werden dagegen mit `opacity: 0.4` gedimmt (`JogControls.tsx:193, 258-259`). Der Nutzer sieht nicht, dass der Schalter gesperrt ist.
- **Vermutete Ursache:** `HoldSwitchRow` setzt eigene `trackColor`/`thumbColor` (`HoldSwitchRow.tsx:33-34`). Unter Android ersetzen sie die Standard-Darstellung für `disabled`, und eine eigene Dimmung gibt es nicht. Am Gerät nicht separat geprüft: ob der Schalter „Video aufnehmen“ (gleiches Styling) dasselbe zeigt.
- **Lösungsrichtung:** Den Schalter (oder die ganze Zeile) bei `disabled` wie die Jog-Tasten mit `opacity: 0.4` dimmen.
- **Priority:** Nice to have

### Auch bemerkt (vorbestehend, nicht PROJ-2)
- Der Release-APK ist mit dem öffentlichen Debug-Keystore signiert (`android/app/build.gradle:103`)
- `gLastStatusPayload`/`gHasSentStatus` werden ohne Synchronisation aus zwei Tasks beschrieben (`ble.cpp:288-289, 448-449`)
- `bleSetup()` läuft vor `motorSetup()` (`main.cpp:42-43`). Ein sehr frühes Subscribe würde `hold = true` vor dem Laden aus dem NVS melden. Praktisch kaum erreichbar.

## Zusammenfassung

- **Acceptance Criteria:** 12/12 im Code bzw. per Test belegt. Am Gerät vom Nutzer verifiziert: AC-8 bis AC-12, EC-6 (Jog-Teil) und EC-8 am 2026-10-07; AC-1 bis AC-7 (Kurz-Regression), Wärme/Akku, die Nachbar-Effekte (PROJ-3, PROJ-5) und der BUG-78-Teil von EC-6 am 2026-10-13. EC: 9/9 im Code belegt. Der BUG-78-Fix `c396c7e` wirkt am Gerät; die formale Re-Verifikation durch `/qa` steht noch aus.
- **Bugs:** 9 neu (0 Critical, 0 High, 1 Medium, 8 Low); BUG-85 kam aus dem Hardware-Test vom 2026-10-13
- **Security:** 5 Checks verifiziert, 5 NOT VERIFIED (Rate limiting nicht implementiert; Brute force, URL-Credentials nicht anwendbar; Laufzeit-Fuzzing ohne Gerät; keine `[user]`-Tasks)
- **Production Ready:** **NEIN — not verified.** Es gibt keinen Critical- oder High-Bug. Der Hardware-Test ist vollständig bestanden (Schritte 1–12). Es fehlt noch die Re-Verifikation des BUG-78-Fixes durch `/qa`.
- **Empfehlung:** `/qa PROJ-2` als Re-Verifikation im Umfang von `c396c7e` laufen lassen. Optional vorher BUG-85 (Optik) per `/build` beheben.

> „Production Ready: JA“ würde nur „keine Critical/High-Bugs“ bedeuten, nicht „alles geprüft“.

---

# Frühere Läufe (2026-09-23 bis 2026-09-30, vor dem `/refine` vom 2026-10-07)

> Unverändert übernommen. Diese Ergebnisse beziehen sich auf den Vertrag mit AC-1 bis AC-7 und EC-1 bis EC-5. Sie wurden in diesem Lauf **nicht** erneut abgehakt.


**Getestet:** 2026-09-23
**App-URL:** nicht ausführbar hier (`probe.kind: none`, sowohl Top-Level als auch Layer `firmware`) — jedes Laufzeit-AC ist unten `[!] NOT VERIFIED`, solange kein menschlicher Test protokolliert ist.
**Tester:** 3 unabhängige `qa-engineer`-Subagenten (Acceptance / Security / Regression), jeweils in frischem Kontext ohne Kenntnis des Builds; zusammengeführt von dieser Session.
**Scope:** vollständig — erster `/qa`-Lauf für PROJ-2, alle 7 AC + 5 EC geprüft.

> Legende: `[x]` in diesem Lauf verifiziert (Beleg erforderlich) · `[ ] BUG` als fehlerhaft verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund erforderlich)

### Re-Verifikation (2026-09-23, gleicher Tag)

Nach dem ersten Lauf hat der Nutzer entschieden: alle vier Medium-Bugs fixen, inklusive BLE-Bonding für BUG-3/BUG-4. `/build`-Fixes liefen parallel auf disjunkten Dateien (`git diff --stat` gegen den QA-Commit `5977e07`: `src/components/useJogState.ts`, `src/components/useJogState.test.ts`, `src/components/JogControls.tsx`, `firmware/src/motor.cpp`, `firmware/src/ble.cpp`, plus `design.md`/Stack-Pack-Doku). BUG-1 bis BUG-4 unten sind entsprechend als **behoben** markiert, mit der jeweiligen Evidenz aus der Fix-Session. Die übrigen Abschnitte (AC-1/2/5/6/7, EC-1/3/4/5, BUG-5..9) sind **unverändert seit dem ersten Lauf, nicht erneut geprüft** — der Fix hat diese Dateien/Verhaltensweisen nicht berührt. Suite danach: `npm test` → **5 Suites / 74 Tests, alle grün** (war 61; +13 aus der erweiterten `useJogState.test.ts`, 37 statt 24 Tests). `npx tsc --noEmit` → exit 0.

### Menschlicher Hardware-Test (2026-09-23, ESP32 + echter Slider)

Firmware kompiliert und geflasht (`pio run -e esp32dev -t upload`), App auf echtem Android-Gerät. Checkliste gezielt in dieser Reihenfolge durchgegangen, damit zuerst die beiden riskantesten offenen Punkte dieser Session getestet werden:
1. **Handy vor dem Test vom Slider entkoppelt**, dann verbunden, sofort eine Jog-Taste gehalten → **funktioniert direkt beim ersten Versuch, keine Verzögerung/kein Kopplungsdialog bemerkt** (testet BUG-10s Fix: der Fire-and-forget-STOP nach dem Connect trifft das Timing zuverlässig)
2. Loslassen → Motor stoppt sofort
3. Geschwindigkeitsregler während gehaltener Taste bewegt → Motor reagiert live
4. Beide Tasten nacheinander getestet (eine hält, zweite dazu → Stopp; eine loslassen während die andere weiter hält, dann neu drücken → keine Fahrt, bis wirklich beide losgelassen wurden)
5. Bluetooth während laufender Fahrt ausgeschaltet → Motor stoppt eigenständig
6. **App in den Hintergrund/geschlossen, während eine Taste gehalten wurde → Motor stoppt von selbst nach ca. 1s** (Watchdog, `motorWatchdogCheck()`)

Nutzer-Bestätigung: „alles funktioniert", mit expliziter Einzelbestätigung für Punkt 1 (sofort, keine Verzögerung) und Punkt 6 (von selbst gestoppt) auf gezielte Rückfrage. AC-7 (Steuerung nur im `connected`-Zustand sichtbar) beiläufig durch den wiederholten Connect/Disconnect-Zyklus mitbestätigt, nicht separat abgefragt. **Nicht explizit getestet:** EC-1 (Finger aus dem Button-Bereich ziehen) und EC-5 (Zustand nach einem Reconnect) — beide bleiben `[!] NOT VERIFIED`, niedriges Risiko, aus der Quelle plausibel abgesichert (siehe unten).

### Test-Suite (einmalig vor dem Fan-out gelaufen)

```
> CameraSliderApp@0.0.1 test
> jest

PASS __tests__/App.test.tsx
PASS src/connection/ConnectionProvider.test.tsx
PASS src/components/useJogState.test.ts
PASS src/connection/connectionReducer.test.ts

Test Suites: 4 passed, 4 total
Tests:       57 passed, 57 total
```

Danach von dieser Session ergänzt: `src/ble/client.test.ts` (4 neue Unit-Tests für `sendJogCommand`/`sendStopCommand`, rot geprüft — Wire-Format-Vertauschung eingebaut, alle 3 JOG-Tests fielen korrekt durch, danach wiederhergestellt und grün). Gesamtstand danach: `npm test` → **5 Suites / 61 Tests, alle grün.** `npx tsc --noEmit -p tsconfig.json` → exit 0.

Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware` (`.ai-eng-kit` → `layers[0].commands.test: null`, vorbestehende Lücke, nicht durch PROJ-2 entstanden).

### Acceptance-Criteria-Status

#### AC-1 — Taste halten → Slider fährt in der entsprechenden Richtung
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 — funktioniert direkt beim ersten Versuch nach frischem Entkoppeln (siehe „Menschlicher Hardware-Test" oben, Punkt 1). Plumbing zusätzlich aus der Quelle bestätigt: `JogControls.tsx:109/116` (onPressIn) → `useJogState.ts:34-37` (idle→jogging_*) → `JogControls.tsx:67-84` (sofortiger Send + 300ms-Intervall) → `src/ble/client.ts:144-160` (Opcode 0x01, korrektes Payload) → `firmware/src/ble.cpp:61-71` (Längenprüfung + `motorJog()`) → `firmware/src/motor.cpp:83-105` (kontinuierlicher Lauf, kein `moveTo()`).

#### AC-2 — Loslassen → Motor stoppt sofort
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 2). Pfad zusätzlich aus der Quelle bestätigt: `useJogState.ts:51-52/69-70` (jogging→idle, Test grün: `useJogState.test.ts:14-20`) → `JogControls.tsx:80-83` (Cleanup: clearInterval + STOP) → `client.ts:167-175` (Opcode 0x05, Write mit Antwort) → `ble.cpp:72-78` → `motor.cpp:107-115` (`forceStop()`, kein Decel-Ramp).

#### AC-3 — Geschwindigkeits-Schieberegler live übernommen, auch während gehaltener Taste
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 3) — Motor reagiert live auf Reglerbewegung während gehaltener Taste.
- [x] App-seitig: `JogControls.tsx:61-65/74` — `speedRef` wird bei jeder Änderung nachgezogen und *innerhalb* von `send()` gelesen, Übernahme spätestens beim nächsten 300ms-Tick. Wertebereich beidseitig verteidigt (App `JogControls.tsx:11-12,95-98`, Firmware `motor.cpp:44-49`).
- [x] BUG-2 **behoben** (Re-Verifikation): `motor.cpp:91-129` — `motorJog()` unterscheidet jetzt "bereits läuft, gleiche Richtung" (`applySpeedAcceleration()`, FastAccelStepper's dokumentierter Weg für Live-Geschwindigkeitsänderung an einer laufenden Bewegung) von "startet frisch" (`runForward()`/`runBackward()`). Gegengeprüft an zwei unabhängigen Quellen: der vendorten Bibliothek (`.pio/libdeps/esp32dev/FastAccelStepper/src/FastAccelStepper.h`, Doc-Kommentare zu `setSpeedInHz()`/`applySpeedAcceleration()`) und einer Live-Context7-Abfrage gegen `gin66/fastaccelstepper` — beide stimmen wörtlich überein. Jetzt auch am echten Motor bestätigt.

#### AC-4 — Beide Richtungstasten gleichzeitig → sofortiger Stopp, keine Richtung fährt weiter, bis beide losgelassen und eine erneut gedrückt wird
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 4) — genau die Halten/Loslassen/Neu-drücken-Sequenz aus dem BUG-1-Repro getestet, verhält sich wie erwartet.
- [x] Kernaussage (gleichzeitig gedrückt → Stopp, keine Richtung gewinnt) verifiziert aus der Quelle: `useJogState.ts:89-94` (`jogging_forward + PRESS_BACKWARD → blocked`) und `:111-113` (Spiegelfall).
- [x] BUG-1 **behoben** (Re-Verifikation): neuer Status `blocked` plus interne `forwardHeld`/`backwardHeld`-Merker (`useJogState.ts:33-43, 123-153`) — `blocked` löst sich erst zu `idle`, wenn **beide** Merker `false` sind (`:128-143`), ein erneutes Drücken bleibt in `blocked` (`:144-151`, genau der ursprüngliche Bug-Repro). Test: `useJogState.test.ts`, dedizierter Repro-Test (hold backward → press forward → release forward, backward weiter gehalten → press forward erneut → bleibt `blocked`) plus vollständige 4×4-Tabelle, 37/37 grün (`npx jest src/components/useJogState.test.ts`). Rot-Check dokumentiert (Fix zurückgedreht → 4 Tests fielen mit `status: 'jogging_forward'` statt `'blocked'` durch → wiederhergestellt → wieder grün). Jetzt auch am echten Gerät bestätigt.

#### AC-5 — Disconnect während Jog → Firmware stoppt eigenständig, App zeigt PROJ-1s „Verbindung verloren"-Zustand
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 5) — Bluetooth während laufender Fahrt ausgeschaltet, Motor stoppte eigenständig.
- [x] Verifiziert aus der Quelle (Garantie): `firmware/src/ble.cpp:34-46` — `onDisconnect` ruft `motorStop()` (Z. 42) **vor** `NimBLEDevice::startAdvertising()` (Z. 45), PROJ-1s Reconnect-Pfad unverändert (`ConnectionProvider.tsx:135-137`, `RootScreen.tsx:51-59`).

#### AC-6 — >~1s ohne Halte-Signal → Firmware stoppt eigenständig (Dead-man's-switch)
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 6) — App in den Hintergrund/geschlossen, während eine Taste gehalten wurde, Motor stoppte nach ca. 1s von selbst.
- [x] Verifiziert aus der Quelle (Garantie, alle drei Teile): Schwelle `motor.cpp:33` (1000ms), Prüfung + Stopp nur wenn `isRunning()` (`motor.cpp:117-124`), Zeitstempel-Reset bei jedem `motorJog()` (`motor.cpp:104`), tatsächlich aufgerufen in `main.cpp:12-14` (nicht nur deklariert).
- Robustheits-Hinweis: siehe BUG-6 (Low) — betraf nur einen internen Race zwischen zwei Firmware-Tasks, nicht das jetzt bestätigte Verhalten.

#### AC-7 — Nicht verbunden → Jog-Steuerung nicht bedienbar, PROJ-1-Platzhalter bleibt sichtbar
- [x] Beiläufig menschlich bestätigt, 2026-09-23 — durch den wiederholten Connect/Disconnect-Zyklus während der Checkliste, nicht separat abgefragt.
- [x] Verifiziert aus der Quelle: `RootScreen.tsx:34-61` rendert `<JogControls />` ausschließlich im `case 'connected'`; alle sieben übrigen Status (vollständiger Switch über `connectionReducer.ts:11-19`) zeigen PROJ-1-Notices bzw. den gesperrten Platzhalter (`reconnecting`). Zweiter Riegel: `JogControls.tsx:86-88` rendert `null` ohne `device`, `ConnectionProvider.tsx:274-281` liefert `device` nur im Status `connected`.

### Edge-Cases-Status

#### EC-1 — Finger aus dem Button-Bereich gezogen zählt als Loslassen
- [!] NOT VERIFIED — kein Touch-Gerät, kein Simulator. Aus der Quelle bestätigt ist nur, dass die App dem `Pressable`-Plattform-Default nicht in die Quere kommt (`JogControls.tsx:108-121`, kein `pressRetentionOffset`/`hitSlop`-Override).

#### EC-2 — Beide Tasten gleichzeitig → Stopp, keine Richtung hat Vorrang
- [x] Menschlich verifiziert (siehe AC-4).
- [x] Kernaussage verifiziert (siehe AC-4).
- [x] BUG-1 **behoben** (siehe AC-4).

#### EC-3 — Verbindungsabbruch während Jog → Firmware stoppt eigenständig, ohne auf die App zu warten
- [x] Menschlich verifiziert (siehe AC-5).
- [x] Verifiziert aus der Quelle (siehe AC-5).

#### EC-4 — App sendet >Schwelle kein Halte-Signal, obwohl Taste noch gehalten → Firmware stoppt eigenständig, auch bei formal bestehender Verbindung
- [x] Menschlich verifiziert (siehe AC-6).
- [x] Verifiziert aus der Quelle (siehe AC-6).

#### EC-5 — Reconnect nach Abbruch während Jog → App zeigt gestoppten Ausgangszustand, keine optisch aktive Taste
- [x] Verifiziert aus der Quelle: `RootScreen.tsx` mountet `JogControls` nur im `connected`-Zweig — beim Verlassen (z. B. nach `reconnecting`) wird die Komponente **unmontiert**, nicht nur versteckt; `useJogState.ts` startet bei jedem Mount neu mit `useReducer(jogStateReducer, 'idle')`. Kein Zustand überlebt den Disconnect.

### Security-Audit-Ergebnisse

_Dieses Feature hat keine HTTP-Oberfläche, keine Accounts, keine Datenbank (`platform: mobile`, `stack.backend: localstorage`). Die Standard-Checkliste greift größtenteils nicht — siehe die Zeilen unten, jede einzeln begründet statt stillschweigend übersprungen. Der reale Angriffsvektor ist der BLE-GATT-Kommandokanal._

- [!] NOT VERIFIED — Authentication Bypass: nicht anwendbar, kein Login/keine Session (kein Backend).
- [!] NOT VERIFIED — Authorization (User X/Y): nicht anwendbar, kein Mehrbenutzer-Modell (`docs/PRD.md`: „Ausschließlich der Erbauer selbst").
- [x] Input-Validierung (BLE-Payload): Längenprüfung **vor** jedem Indexzugriff — `firmware/src/ble.cpp:55-57` (len==0), `:62-66` (JOG, exakt 3 Byte), `:73-75` (STOP, exakt 1 Byte); zweite unabhängige Schutzebene bestätigt in der installierten Bibliothek selbst: `NimBLEAttValue::operator[]` gibt bei Out-of-Range `0` zurück statt zu lesen (`firmware/.pio/libdeps/esp32dev/NimBLE-Arduino/src/NimBLEAttValue.cpp:157-164`). `speedPercent` wird firmwareseitig unabhängig von der App geklemmt (`motor.cpp:44-54`, <1→1, >100→100) — kein Runaway-Speed über einen manipulierten Wert möglich.
- [!] NOT VERIFIED — Rate Limiting: kein HTTP-Endpunkt; BLE-Äquivalent (Write-Flooding) siehe BUG-9 (Low).
- [!] NOT VERIFIED — Brute Force auf Credentials: nicht anwendbar, kein Credential-Check irgendwo im Projekt (auch keine BLE-PIN — explizite PROJ-1-Entscheidung, `features/PROJ-1-ble-verbindung-pairing/spec.md:49`).
- [!] NOT VERIFIED — Account Enumeration: nicht anwendbar, keine Accounts.
- [!] NOT VERIFIED — Credentials in URLs: nicht anwendbar, keine URLs/Forms (nur `Slider` + zwei `Pressable`, `JogControls.tsx:94-113`).
- [x] Keine Secrets im Code: `grep -rniE "api[_-]?key|secret|token|password|bearer |AIza|sk-[A-Za-z0-9]{12}" src firmware/src` → nur zwei False Positives in Kommentaren ("design tokens"). Einzige Festwerte sind die drei GATT-UUIDs + Gerätename — öffentliche Protokollkonstanten, kein Geheimnis.
- [x] BUG-3 **mechanisch korrekt implementiert, Schutzwirkung geringer als ursprünglich dokumentiert** (unabhängige Re-Verifikation, siehe unten): `ble.cpp:117` `NimBLEDevice::setSecurityAuth(bonding=true, mitm=false, sc=true)` + `ble.cpp:163-165` Command-Characteristic trägt zusätzlich `NIMBLE_PROPERTY::WRITE_ENC`. Die Durchsetzung selbst ist bis in den tatsächlichen NimBLE-Host-Quellcode nachverifolgt (`ble_gatts.c`/`ble_att_svr.c`, inkl. Bypass-Suche über Signed Write/Prepare-Write — kein Loch gefunden) und greift nachweislich für JOG **und** STOP. **Aber:** „Just Works" bestätigt jede Pairing-Anfrage ohne Rückfrage — ein fremdes Gerät muss sich nicht nur verbinden, sondern kann ebenso automatisch mitpairen und schreibt danach genauso wie die App. Der ursprüngliche Fix-Kommentar/die Doku beschrieben das als stärkeren Schutz, als tatsächlich vorhanden ist (u. a. die Begründung „kein Passkey möglich, da kein Display/Tastatur" ist sachlich falsch — ein fester Passkey wäre technisch möglich gewesen). **Nutzerentscheidung nach dieser Re-Verifikation:** Just Works bewusst beibehalten (schützt vor naiven/generischen Zugriffen, nicht vor einem gezielten Angreifer), Dokumentation entsprechend korrigiert (`docs/stacks/firmware-esp32-tmc2209.md`, `design.md`) statt auf einen echten Passkey umzustellen.
- [x] BUG-4 **behoben** (unabhängig re-verifiziert bis in die NimBLE-Quelle, inkl. Nebenwirkungs-Analyse): `ble.cpp:44` — `onConnect` ruft jetzt ebenfalls `NimBLEDevice::startAdvertising()` (bisher nur `onDisconnect`). Max. 3 gleichzeitige Verbindungen (`nimconfig.h:225`), erneutes `startAdvertising()` bei bestehender Verbindung ist ein bibliothekseigener No-op (`NimBLEAdvertising.cpp:194-197`), kein GATT-Neustart, kein Crash-Risiko.
- [x] **I-1/BUG-R2 behoben** (High, von der Re-Verifikation gefunden): Die App wurde vom ursprünglichen BUG-3-Fix nicht mitgezogen — JOG ist Write-ohne-Antwort, ein unbondeter Write wird vom BLE-Stack ohne Fehlerantwort verworfen, und Android löst On-Demand-Bonding nur über genau diese Fehlerantwort aus. Ohne Gegenmaßnahme hätte der allererste Jog-Versuch nach frischem Pairing schlicht nichts getan, ohne jeden Hinweis. Fix: `ConnectionProvider.tsx` feuert direkt nach jedem erfolgreichen Connect/Reconnect ein Fire-and-forget-`sendStopCommand()`, um das Pairing vorzuziehen, bevor der Nutzer realistisch eine Jog-Taste erreichen kann (bewusst nicht awaited, um PROJ-1s bestehende `settled`/`cancelled`-Race-Guards nicht anzufassen — siehe `design.md`, Restrisiko bewusst in Kauf genommen).
- [x] **N-1 behoben** (Medium, von der Re-Verifikation gefunden): Durch den BUG-4-Fix sind jetzt mehrere gleichzeitige Verbindungen möglich — `onDisconnect` stoppte bis eben den Motor bei **jedem** Disconnect, auch dem eines fremden, gar nicht gebondeten Geräts, das nur kurz verbunden war, während die App weiter jogged. Fix: `ble.cpp` stoppt/setzt `gConnected=false` nur noch, wenn `pServer->getConnectedCount() == 0` (bestätigt: die Bibliothek entfernt den trennenden Peer aus der Verbindungsliste, bevor `onDisconnect` feuert, `getConnectedCount()` liefert also bereits die verbleibende Zahl).
- [!] **N-2 — akzeptierte Grenze, nicht behoben** (Medium, von der Re-Verifikation gefunden): Nach dem Bonden ist der Kommandokanal nicht an eine bestimmte Verbindung gebunden — mehrere gebondete Geräte könnten gleichzeitig JOG/STOP schreiben (last-writer-wins), und ein zweites gebondetes Gerät könnte den Watchdog durch eigene Heartbeats am Leben halten. Konsistent mit der Just-Works-Entscheidung oben (opportunistischer, nicht adversarieller Schutzanspruch) bewusst nicht extra abgesichert.
- [x] **Just-Works-Bondierung menschlich verifiziert, 2026-09-23**: Handy vor dem Test entkoppelt, erster Jog-Versuch funktionierte direkt — kein spürbarer System-Dialog, kein Disconnect/Reconnect-Zyklus ausgelöst. Damit ist sowohl das App-seitige Fire-and-forget-STOP (I-1-Fix) als auch die Bondierung selbst am echten Gerät bestätigt, nicht nur aus der Quelle.

### E2E-Tests
_Optionale Schicht — von `/e2e-tests` für kritische Kernabläufe geschrieben._

- Status: **nicht gelaufen** (führe `/e2e-tests` für kritische Abläufe aus)

### Nicht verifiziert in diesem Lauf

Nach dem menschlichen Hardware-Test (siehe oben) bleiben nur noch wenige, klar begrenzte Punkte offen:

- [!] **EC-1 (Finger aus dem Button-Bereich gezogen zählt als Loslassen)** — nicht explizit getestet. Aus der Quelle plausibel (kein `pressRetentionOffset`-Override), aber nicht gezielt ausprobiert. Niedriges Risiko.
- [!] **EC-5 (sauberer Zustand nach einem Reconnect)** — nicht explizit getestet, nur aus der Quelle bestätigt (Komponente wird beim Verlassen von `connected` unmontiert, startet bei Remount wieder bei `idle`). Niedriges Risiko.
- [!] **Multi-Touch: exakt gleichzeitiges Drücken beider `Pressable`s** — der durchgeführte Test war ein Halten + zusätzliches Drücken (siehe AC-4), nicht zwei exakt zeitgleiche erste Anschläge; ob React Natives Responder-System das identisch behandelt, bleibt Quellcode-Analyse.
- [!] **Firmware-Kompilierbarkeit war zuvor das größte offene Risiko — jetzt geschlossen:** `pio run -e esp32dev -t upload` lief beim Nutzer erfolgreich, die Firmware inkl. aller PROJ-2-Änderungen (Motor, Jog-BLE-Callback, Bonding) kompiliert und läuft auf echter Hardware.
- [!] **Neuer nativer Android-Build (Release)** — der Test lief im Dev-Build (Metro); ob `@react-native-community/slider`s Autolinking im **Release**-Build (`commands.build` = `./gradlew assembleRelease`) sauber durchläuft, ist damit noch nicht geprüft — relevant erst für `/deploy`.
- [!] **Optik/Layout** (Button-Größen, Slider-Darstellung, dunkles Theme) — funktional bestätigt, aber kein systematischer visueller Check (kein Browser/Viewport-Tool hier verfügbar).
- [!] **Layer `firmware`, automatisierte Tests** — no test command recorded for layer firmware (`.ai-eng-kit` → `layers[0].commands.test: null`, vorbestehende Lücke, kein PROJ-2-spezifisches Problem).

### Bugs Found

#### BUG-5: StatusLine zeigt "Bereit" statt der in design.md spezifizierten leeren Zeile im Idle-Zustand
- **Severity:** Low
- **Beschreibung:** `design.md` spezifiziert die StatusLine als „Fährt vorwärts…" / „Fährt rückwärts…" / *nichts* (idle). Implementiert ist stattdessen „Bereit" (`JogControls.tsx:21-24`). Kosmetische Abweichung vom Design — für EC-5 (klar erkennbarer Ruhezustand) eher hilfreich als schädlich.
- **Priority:** Nice to have

#### BUG-6: `lastJogMillis` ohne `volatile`/Synchronisation zwischen BLE- und loop()-Task
- **Severity:** Low
- **Beschreibung:** `motor.cpp:42` — anders als das bereits `volatile` deklarierte `gConnected` (`ble.cpp:24`) im selben Feature ist `lastJogMillis` nicht `volatile`, wird aber aus dem NimBLE-Host-Task geschrieben (`motorJog()` im `onWrite`-Callback) und aus dem `loop()`-Task gelesen (`motorWatchdogCheck()`). Auf dem Xtensa-ESP32 praktisch unkritisch (32-Bit-aligned Load/Store ist atomar, kein LTO über Task-Grenzen), aber inkonsistente Konvention auf genau dem Sicherheitsmechanismus, den AC-6 garantieren soll.
- **Priority:** Nice to have

#### BUG-7: Veralteter Platzhaltertext im `reconnecting`-Zustand
- **Severity:** Low
- **Beschreibung:** `RootScreen.tsx` zeigt im `reconnecting`-Zustand weiterhin „Steuerung folgt in einem späteren Feature." (`ControlsPlaceholder`) — sachlich überholt, seit die Jog-Steuerung existiert. Der Nutzer sieht genau diesen Text, wenn die Verbindung während einer Fahrt gerade abreißt.
- **Priority:** Nice to have

#### BUG-8: `sendJogCommand` klemmt `speedPercent` nicht vor dem Verpacken ins Byte-Array
- **Severity:** Low
- **Beschreibung:** `src/ble/client.ts:144-159` — ein Wert außerhalb 1–100 würde beim Verpacken in `Uint8Array` modulo 256 umlaufen. Aktuell nicht erreichbar (UI-Slider liefert nur 1–100, Firmware klemmt zusätzlich unabhängig, `motor.cpp:44-49`) — reine Defense-in-Depth-Lücke für einen hypothetischen künftigen Aufrufer.
- **Priority:** Nice to have

#### BUG-9: Kein Rate-Limit auf dem BLE-Write-Pfad (Flooding-Stress)
- **Severity:** Low
- **Beschreibung:** `ble.cpp:50-83` verarbeitet jeden Write sofort, ohne Drosselung. Schnelles Wechseln der Richtung könnte wiederholte Beschleunigungs-/Bremsrampen erzwingen — mechanisch durch `kAcceleration = 8000` Steps/s² (`motor.cpp:24`) entschärft (kein Sprung, immer eine Rampe), und ohnehin durch BUG-3 abgedeckt: wer das kann, kann auch einfach durchfahren.
- **Priority:** Nice to have

#### BUG-12 (war N-2): Kein Schutz vor mehreren gleichzeitig steuernden, gebondeten Geräten
- **Status: Akzeptierte Grenze, nicht behoben** — konsistent mit der Just-Works-Entscheidung (siehe Security-Audit oben)
- **Severity:** Medium
- **Priority:** Nice to have

#### BUG-13 (war BUG-R3): PROJ-1s `spec.md` widerspricht jetzt der Firmware
- **Severity:** Medium
- **Beschreibung:** `features/PROJ-1-ble-verbindung-pairing/spec.md` (Status: Approved) sagt weiterhin explizit „keine BLE-PIN/Bonding" (AC-3, Out of Scope, Decision Log) — seit PROJ-2s BUG-3-Fix stimmt das nicht mehr. Die Entscheidung ist nur in PROJ-2s `design.md` dokumentiert, nicht im Vertrag des Features, das sie eigentlich betrifft.
- **Priority:** Empfehlung: `/refine PROJ-1` ausführen, um die Spec nachzuziehen — nicht in dieser Session gemacht, da `spec.md` während `/build`/Bugfixes read-only ist und eine Vertragsänderung einen eigenen Review verdient.

### Zusammenfassung (nach menschlichem Hardware-Test, 2026-09-23)
- **Acceptance Criteria:** 7/7 verifiziert — alle sieben AC menschlich am echten Gerät bestätigt (AC-1, AC-2, AC-4, AC-5, AC-6 explizit getestet; AC-3, AC-7 ebenfalls bestätigt), zusätzlich alle aus der Quelle abgesichert
- **Edge Cases:** 3/5 menschlich verifiziert (EC-2, EC-3, EC-4), 2/5 nur aus der Quelle (EC-1, EC-5 — nicht explizit getestet, niedriges Risiko)
- **Bugs gefunden:** 13 gesamt (+ 2 nebenbei korrigierte Kommentare), **6 behoben** (BUG-1, BUG-2, BUG-3-Mechanik, BUG-4, BUG-10, BUG-11), **1 bewusst akzeptiert statt gefixt** (BUG-12), **1 als Prozess-Empfehlung offen** (BUG-13, `/refine PROJ-1`, blockiert PROJ-2 nicht), 0 Critical/High/Medium blockieren noch etwas, 5 Low weiterhin offen (BUG-5..9, alle "Nice to have")
- **Security:** Zwei vollständig unabhängige Re-Verifikationen durchlaufen (nicht nur die Fix-Autoren selbst) — Mechanik bis in den NimBLE-Host-Quellcode nachverfolgt, Bypass-Suche ohne Fund, tatsächliche Schutzwirkung korrigiert dokumentiert; Bonding jetzt auch am echten Gerät bestätigt
- **Firmware:** kompiliert und läuft auf echter Hardware (`pio run -e esp32dev -t upload` erfolgreich) — damit ist das zuvor größte offene Risiko geschlossen
- **Production Ready:** **JA**
- **Empfehlung:** Approved. Offene Punkte sind ausschließlich Low-Bugs (Nice to have) und zwei nicht blockierende Empfehlungen: `/refine PROJ-1` für BUG-13 (Spec-Drift), optional `/e2e-tests` für die kritischsten Abläufe als dauerhaftes Regressionsnetz.

> "Production Ready: JA" heißt: kein Critical/High/Medium-Bug offen, und alle sieben Laufzeit-ACs wurden an echter Hardware durchgespielt. EC-1 und EC-5 wurden nicht separat abgefragt — aus der Quelle plausibel, niedriges Risiko, kein Blocker.

### Nachtrag 5: Re-Verifikation nach Erhöhung der Höchstgeschwindigkeit 4000 → 8000 Steps/s (2026-09-29)

**Scope (Re-Verifikation):** `git diff 0f08bd1..HEAD -- src firmware/src` (Commits `94ba380`, `5d65f78`). Im Code ändern sich nur `kJogSpeedMaxHz` (`firmware/src/motor.cpp:31`) und der App-Spiegel `MAX_SPEED_STEPS_PER_SEC` (`src/components/AutoDriveControls.tsx:33`); der Rest sind Kommentare, Test-Fixtures und Doku. Ein `qa-engineer`-Lauf mit allen drei Scopes (2 → 3 → 4), eingegrenzt auf den Diff — bewusst nicht der volle Fan-out, weil der Diff faktisch zwei Konstanten sind. Alles andere ist aus dem Bericht oben übernommen: _unverändert seit 2026-09-27, in diesem Lauf nicht neu geprüft_ (AC-4, AC-5, AC-7, EC-1, EC-2, EC-3, EC-5 — ihre Dateien liegen nicht im Diff).

**Test-Suite (einmalig, Owner):** `npm test` → 12 Suites, 193 Tests, 0 Fehler (Log im Scratchpad `suite.log`). Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

**Ergebnis:**
- [x] Mapping 1–100 % → 200–8000 Steps/s, Klemmung, kein Overflow — `motor.cpp:180-190` (Nachbau der Formel in float32: 1 % → 200, 50 % → 4061, 100 % → 8000, Byte 255 → 8000)
- [x] Toleranz Firmware ↔ App identisch (200/8000, 0,01) — `motor.cpp:30-31,50,450-451` ↔ `AutoDriveControls.tsx:32-33,49,281-282`
- [x] Zeitraffer-Timeout passt zur neuen Geschwindigkeit — `useTimelapseSequence.ts:74-77`, `motor.cpp:520`
- [x] AC-1, AC-2, AC-3, AC-6 / EC-4 — Steuerlogik unverändert (`motor.cpp:219-341`); Laufzeit: `[!] NOT VERIFIED — no way to run and probe this project was recorded`
- [x] Security: Speed-Byte > 100 wird geklemmt (`motor.cpp:181-185`), Opcode-/Längenprüfung unverändert (`ble.cpp:143-233`), keine neuen Secrets
- [ ] BUG-19 (Low): veraltete Kommentare — `AutoDriveControls.tsx:92` („= 2000 steps" → 8000), `useTimelapseSequence.test.ts:305-307` (Werte 13000/18000/30500 → 7250/12250/18500 ms), `AutoDriveControls.test.ts:107-111` (Aussage „must reject" stimmt bei Deckel 8000 nicht mehr).

**Nebenwirkungen, kein Verstoß gegen ein AC (zur Kenntnis):**
- Der Standardwert 50 % fährt jetzt ca. 4061 statt 2081 Steps/s (etwa doppelt so schnell).
- Der Watchdog-Nachlauf (AC-6, 1 s) beträgt bei voller Geschwindigkeit jetzt bis ca. 50 mm statt 25 mm (8000 Steps/s ÷ 160 Steps/mm); der Slider hat keine Endanschläge.

**Nicht verifiziert in diesem Lauf:**
- [!] Motor bei 8000 Steps/s (Schrittverluste, StealthChop-Drehmoment, Wärme, ungebremster `forceStop()` aus voller Fahrt) — no way to run and probe this project was recorded. Der Nutzer-Test mit 6000 und 8000 („soweit funktioniert's", 2026-09-29) ist eine Aussage im Chat, kein protokollierter Testlauf.
- [!] Settle-Pause von 400 ms (`useTimelapseSequence.ts:87`) bei schnelleren Zeitraffer-Schritten — Hardware.
- [!] Laufzeit AC-1..7, EC-1..5, PROJ-3/4/5 an echter Hardware.

**Production-Ready: NEIN** — BUG-16 (High) ist weiterhin offen und BUG-18 (PROJ-3 AC-11) ist neu; zusätzlich Laufzeit nicht verifiziert. Status: **In Review**.

### Nachtrag 6: BUG-16 — Fix am Gerät bestätigt, BUG-18 behoben (2026-09-29)

- **Zusatzänderung `5feb442`:** DIR-Polarität invertiert (`setDirectionPin(kDirPin, false)`), weil „vorwärts/rückwärts" physisch vertauscht war; vom Nutzer bestätigt („passt"). Wirkt konsistent auf Jog, Auto-Fahrt und Zeitraffer.
- Weiterhin offen: BUG-19 (Low, veraltete Kommentare), BUG-12/13 (Medium, akzeptiert/Prozess), BUG-5..9, 14, 15 (Low).

**Status:** bleibt **In Review**, bis `/qa PROJ-2` (Re-Verifikation im Umfang der Fixes `4552ed5`, `655f28d`, `5feb442`) läuft. Kein Critical/High-Bug ist nach Stand des Nutzers offen.

### Nachtrag 7: Unabhängige Re-Verifikation — BUG-16-Fix, DIR-Umkehr, 8000 Steps/s (2026-09-30)

**Scope:** `git diff ea0b613..HEAD -- firmware/src src/ble src/components/JogControls.tsx src/components/useJogState.ts src/screens` → nur `firmware/src/motor.cpp` (`4552ed5` BUG-16, `5feb442` DIR-Umkehr). Weil `motor.cpp` von Jog, Auto-Fahrt und Zeitraffer geteilt wird: voller Fan-out mit drei `qa-engineer`-Lanes. `probe.kind: none` — Laufzeit/Hardware `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 13 Suites, 210 Tests, 0 Fehler (`suite9.log`). Firmware kompiliert am HEAD (`pio run -e esp32dev`, SUCCESS, RAM 12,4 %, Flash 49,1 %, ohne Upload). Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

### Acceptance Criteria
- [x] **AC-1** — Richtungskette durchgängig: „▲ Vorwärts" → `'forward'` → 0x00 (`client.ts:36-39`) → `kForward` (`ble.cpp:155-157`) → `runForward()` (`motor.cpp:293-295`). DIR-Umkehr (`motor.cpp:216`) kippt nur den Pin-Pegel (`StepperISR.cpp:52`), Zählrichtung, Positionen und `endIsAfterStart` bleiben — eine Stelle, konsistent für alle Modi. Einschränkung: BUG-20.
- [x] **AC-2** — Loslassen → `idle` → Cleanup sendet STOP (`useJogState.ts:86-88`, `JogControls.tsx:127-130`) → `forceStop()`
- [x] **AC-3** — Speed pro 300-ms-Tick frisch gelesen (`JogControls.tsx:108-125`), Firmware `setSpeedInHz` + `applySpeedAcceleration` (`motor.cpp:247, 265-272`)
- [x] **AC-4, EC-2** — `blocked`-Zustand, STOP, kein JOG bis beide Tasten los (`useJogState.ts:89-151`, Tests grün)
- [x] **AC-5, EC-3** — `onDisconnect` → `motorStop()` bei verschlüsseltem Link (`ble.cpp:125-127`); App zeigt `reconnecting` (`RootScreen.tsx:139-147`)
- [x] **AC-6, EC-4** — Watchdog 1000 ms (`motor.cpp:54, 338-357`), unabhängig vom BLE-Status; Nachlauf bei 8000 Steps/s bis ~51 mm
- [x] **AC-7** — Steuerung nur in `connected` (`RootScreen.tsx:93-121`); BUG-7 (Low) unverändert
- [x] **EC-1** — Verlassen des Rechtecks (+40 px) oder ScrollView-Übernahme → `onPressOut` (Stopp); Scrollen während Jog gesperrt (`RootScreen.tsx:116`). Anmerkung: Zurückziehen in den Button ohne Abheben startet die Fahrt erneut.
- [x] **EC-5** — Remount startet in `idle`, Firmware stoppt beim Disconnect
- [x] **Mapping 8000 Steps/s** — float32 nachgerechnet: 0/1→200, 50→4061, 100/255→8000, kein Überlauf (`motor.cpp:180-190`)

### Security
- [x] Keine Verschlechterung, keine neuen Critical/High/Medium. JOG-Länge/Opcode geprüft (`ble.cpp:143-152, 228-233`), Speed geklemmt, WRITE_ENC unverändert (`ble.cpp:377-379`). Der BUG-16-Fix öffnet keinen Weg, den Motor ungewollt laufen zu lassen oder den Watchdog auszuhebeln (Watchdog liest `jogRunning` nicht; Dauerlauf nur über `motorJog`, das bei `autoDriving/timelapseMoving` ablehnt). Keine Secrets (`git grep`; nur öffentliche RN-Debug-Keystore-Werte, bekannt).
- **Zusammenfassung:** 6 Checks verifiziert, 6 NOT VERIFIED (Laufzeit; Auth/Authorization/Brute Force/Credentials in URL/API-Antworten nicht anwendbar; Rate Limiting not implemented, BLE-Pendant BUG-9).

### Regression
- [x] PROJ-3 (Richtung, Ankunft, Stopp, Watchdog-Ausnahme, Speed-Grenzen App = Firmware), PROJ-4 (Vorzeichen SET_END_FROM_DISTANCE, Migration `dirVersion`), PROJ-5 (Richtung, 8000 Steps/s, Ankunftserkennung, Timeout), PROJ-1 (Verbindungsfluss, Disconnect-Stopp) — alles aus dem Code konsistent; Modusübergänge Jog → Auto-Fahrt → Jog, Jog → Zeitraffer → Jog, Stopp → Jog ohne Befund.

### Neue Bugs
- [ ] **BUG-21 (Medium, bedingt, deploy-relevant) — deployte App v1.2.0 und aktuelle Firmware passen nicht zusammen.** v1.2.0 hat die Preset-Migration (`a6b837d`) nicht; mit der Firmware ab `5feb442` legt ein altes Preset dort das Ende auf die Gegenseite (keine Endanschläge). App und Firmware müssen gemeinsam ausgeliefert werden; der Deployments-Eintrag hält keine Firmware-Version fest.
- Außerhalb Scope bemerkt: `FastAccelStepper @ ^0.31.1` offene Versionsbreite (Fix stützt sich auf Bibliotheksinternas); Zeitraffer-Rückfahrt bei ≤194 Steps von der Firmware verworfen (PROJ-5, Low).

### Nicht verifiziert
- [!] Laufzeit aller AC/EC, BUG-16 und BUG-20 am Gerät, physische Richtung, Schrittverluste/Wärme bei 8000 Steps/s, `forceStop()` aus voller Fahrt, Touch-Verhalten — no way to run and probe this project was recorded. Die Host-Simulation belegt die Rampenlogik, nicht das Hardware-Timing.

**Production-Ready: NOT READY — not verified.** Keine Critical/High-Bugs offen (BUG-16 aus Code-Sicht geschlossen). Offen: BUG-20 und BUG-21 (Medium). Der letzte protokollierte Hardware-Test aller PROJ-2-ACs (2026-09-23) liegt vor den Firmware-Änderungen; Freigabe nur über einen neu protokollierten Nutzer-Test. Status: **In Review**.

### Nachtrag 8: Fix BUG-20/22/23 und protokollierter Nutzer-Test am Gerät (2026-09-30)

- **Fix `a763cb3`:** `motorStop()` ruft `forceStop()` nur bei `stepper->isRunning()` (tatsächliche Ursache von BUG-16, behebt BUG-20); `lastJogMillis` wird vor dem Start gesetzt (BUG-23); Kommentare korrigiert. **Doku `8b33168`:** PROJ-2 `design.md` (richtige BUG-16-Ursache, DIR-Umkehr, Zeitstempel), Stack-Pack-Beispiel mit Polarität (BUG-22). Firmware kompiliert und geflasht (`pio run -e esp32dev -t upload`, SUCCESS).
- **Protokollierter Nutzer-Test** — Checkliste an den Nutzer übergeben, Antwort „alles ok" für alle Punkte. Gerät: Android EB2103 (Debug-Build über Metro), Firmware-Stand `a763cb3`, ohne Neustart zwischen den Punkten:
  - [x] **AC-1** — Vorwärts/Rückwärts halten fährt in die richtige Richtung — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-1 / BUG-20** — kurzes Antippen direkt nach dem Verbinden bewegt den Slider sofort — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-2** — Loslassen stoppt sofort — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-3** — Regler während des Haltens ändert das Tempo direkt — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-4** — zweite Taste zusätzlich → Stopp — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **BUG-16** — Auto-Fahrt und Jog mehrfach im Wechsel, Jog springt jedes Mal an — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-5** — Bluetooth aus beim Joggen → Slider stoppt eigenständig — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-6** — App im Hintergrund/geschlossen beim Joggen → Stopp nach etwa 1 s — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-7** — nicht verbunden → Jog-Tasten nicht bedienbar — vom Nutzer am Gerät bestätigt, 2026-09-30
- Einschränkung: Anzahl der Durchläufe nicht protokolliert; EC-1 (Finger herausziehen), EC-5 (Reconnect) nicht separat abgefragt. Der Fix `a763cb3` ist noch nicht durch einen unabhängigen `qa-engineer`-Lauf geprüft.

### Nachtrag 9: Unabhängige Re-Verifikation des Fixes `a763cb3` — Freigabe (2026-09-30)

**Scope:** `git diff 4034f4a..HEAD -- firmware/src features/PROJ-2-manuelle-steuerung-jog/design.md docs/stacks/firmware-esp32-tmc2209.md` (Commits `a763cb3`, `8b33168`). Ein `qa-engineer`-Lauf, alle drei Scopes (2 → 3 → 4), eingegrenzt auf den Diff und BUG-20/22/23. Firmware-Build am HEAD: SUCCESS (RAM 12,4 %, Flash 49,1 %, ohne Upload); Disassembly von `motor.cpp.o`; Host-Simulation gegen die vendorte FastAccelStepper 0.31.8 mit zeitgenauer Queue (Engine-Task alle 4 ms), alte und neue `motorStop()`-Variante im Vergleich. App-Suite vom Diff nicht betroffen (zuletzt `suite9.log`, 210 grün). Laufzeit: `[!] NOT VERIFIED — no way to run and probe this project was recorded`; der protokollierte Nutzer-Test steht in Nachtrag 8.

### Ergebnis
- [x] **BUG-16 geschlossen** — Simulation: nach gesetztem Flag alt 0 + 0 Schritte (Dauerausfall), neu 0 + 210 (heilt sich beim nächsten Tipp), weil ein STOP im Stillstand das Flag nicht mehr setzt (`motor.cpp:330`).
- [x] **BUG-20 geschlossen** für STOP im Stillstand — Simulation T1: Flag bleibt 0, 200-ms-Tipp fährt 210 Schritte; vom Nutzer am Gerät bestätigt (Nachtrag 8). Restfenster siehe BUG-24.
- [x] **BUG-22 geschlossen** für alle aufgezählten Stellen — `design.md:81, 119, 123, 124, 125` und Stack-Pack `:79` stimmen mit dem Code überein. Rest siehe BUG-26.
- [x] **BUG-23 geschlossen** — `lastJogMillis` steht nach dem frühen Return bei `autoDriving/timelapseMoving` (`motor.cpp:239-246`) und im Maschinencode vor `setSpeedInHz`/`runForward` (`motorJog+0x3b`); ein abgelehnter JOG hält keinen fremden Lauf am Leben.
- [x] **Kein Stopp kann ausfallen** — `isRunning()` umfasst Rampe *und* Queue (`FastAccelStepper.cpp:897-899`); der Guard überspringt `forceStop()` nur, wenn physisch nichts läuft. STOP während Jog (T2) und während Auto-Fahrt (T5): 88 Restschritte, Stillstand nach 21 ms — identisch zur alten Variante. Watchdog ruft `motorStop()` nur bei `isRunning()`. Alle BLE-Pfade sind im NimBLE-Host-Task serialisiert.
- [x] **AC-1..AC-6 (Firmware-Anteil), EC-2..EC-4** — Code + Simulation, siehe oben; AC-7, EC-1, EC-5 nur App-Dateien, nicht im Diff (unverändert seit Nachtrag 7).
- [x] **Security:** keine neue Angriffsfläche; keine Secrets im Diff. Auth/Authorization/Brute Force/Credentials in URL nicht anwendbar, Rate Limiting not implemented (BUG-9).
- [x] **Regression PROJ-1/3/4/5:** STOP während Auto-Fahrt und Zeitraffer wirksam, Flags immer zurückgesetzt (`motor.cpp:344, 349`); `moveTo()` löscht ein hängendes Flag (Folgefahrt 2000/2000 Schritte); Disconnect-Stopp unverändert.

### Neue Befunde (alle Low)
- [ ] **BUG-24 (Low) — Restfenster von BUG-20:** ein STOP in den letzten ~18–22 ms einer Bewegung (Rampe schon beendet, Queue läuft noch) oder ein zweiter STOP 3–20 ms nach dem ersten setzt das Flag weiterhin; der nächste Jog-Start wird dann einen Herzschlag (~300 ms) lang geschluckt, der Tipp danach fährt (heilt sich selbst). Ursache: `isRunning()` ist weiter als die Bedingung, unter der das Flag gelöscht wird (Rampe aktiv). Möglicher Ansatz: `isRampGeneratorActive()` als Bedingung. Repro am Gerät (ungeprüft): genau beim Ankommen einer Auto-Fahrt „Stopp" tippen oder „Stopp" doppelt tippen, dann kurz joggen.
- [ ] **BUG-25 (Low, vorbestehend):** im Watchdog wird `millis()` vor `lastJogMillis` gelesen (Disassembly `motorWatchdogCheck` 0x2f–0x3b); ein genau dazwischen geschriebener Herzschlag lässt die Differenz überlaufen → unberechtigter, sicherer Stopp mitten im Jog, läuft beim nächsten Herzschlag wieder an.
- [ ] **BUG-26 (Low, Doku-Rest):** `motor.cpp:282-294` beschreibt BUG-16 noch mit der alten Ursache (verworfener Rückgabewert), der Fehlerzweig `:301-307` bleibt toter Code; das Restfenster (BUG-24) ist in `motor.cpp:320-321` und `design.md` nicht erwähnt; der Stack-Pack warnt nicht vor der `forceStop()`-Falle.
- Außerhalb Scope: `FastAccelStepper @ ^0.31.1` nicht fest gepinnt (Fix hängt an Bibliotheksinterna, vendort ist 0.31.8).

### Offene Bugs gesamt
- **Medium:** BUG-21 (deployte App v1.2.0 und aktuelle Firmware müssen gemeinsam ausgeliefert werden — für `/deploy`), BUG-12 (akzeptierte Grenze, Mehrgeräte), BUG-13 (Prozess-Empfehlung).
- **Low:** BUG-5..9, BUG-14/15, BUG-19, BUG-24..26.

**Production-Ready: JA.** Keine Critical/High-Bugs offen. BUG-16 und BUG-20 sind unabhängig verifiziert geschlossen; alle Laufzeit-ACs sind durch den protokollierten Nutzer-Test (Nachtrag 8) auf dem aktuellen Firmware-Stand ausgeführt. Nicht verifiziert bleiben: Hardware-Timing (die Simulation belegt die Rampenlogik), Schrittverluste/Wärme bei 8000 Steps/s, EC-1/EC-5 am Gerät. **BUG-21 ist beim Deploy zu beachten:** App und Firmware nur gemeinsam ausliefern. Status: **Approved**.
