# PROJ-2 — Technisches Design

> Dies ist das technische Design (das WIE) für das Feature. Der Vertrag (WAS) steht in `spec.md`, die Aufgabenliste in `tasks.md`.
> Plattform: **mobile** (Android, React Native) — wie bei PROJ-1.
> Das Feature spannt zwei Layer: die **App** (React Native, erweitert PROJ-1s `ConnectionProvider`/`ble/client.ts`) und die **Firmware** (Layer `firmware`, ESP32/PlatformIO — `docs/stacks/firmware-esp32-tmc2209.md`). Die Grenze ist ein neues BLE-Kommandoprotokoll auf der bereits in PROJ-1 angelegten Command-Characteristic.
> Erfordert PROJ-1 (Approved) — nutzt dessen Verbindung, erweitert dessen Firmware- und App-Code additiv, ändert keine PROJ-1-Acceptance-Criteria.

## Komponentenstruktur (App)

```
RootScreen (PROJ-1, Content-Area erweitert)
+-- ConnectionHeader (PROJ-1, unverändert)
+-- ContentArea (zustandsabhängig, PROJ-1-Notices unverändert)
    +-- ... (checking_permissions / permission_denied / bluetooth_off / scanning / not_found — PROJ-1, unverändert)
    +-- JogControls (NEU — ersetzt den bisherigen ControlsPlaceholder im Zustand `connected`)
        +-- SpeedSlider (1–100 %, Default 50 %)
        +-- DirectionButtonRow
            +-- JogButton "Rückwärts" (Pressable: onPressIn/onPressOut)
            +-- JogButton "Vorwärts" (Pressable: onPressIn/onPressOut)
        +-- StatusLine ("Fährt vorwärts…" / "Fährt rückwärts…" / nichts, rein informativ)
```

`JogControls` wird weiterhin nur im Zustand `connected` gerendert (AC-7) — dieselbe zustandsabhängige Weiche in `RootScreen.tsx`, die PROJ-1 schon hat. Beim Verlassen von `connected` (Disconnect) wird `JogControls` unmontiert und beim erneuten Verbinden frisch neu gemountet — lokaler Zustand (welche Taste gehalten wird) ist damit **nie** über einen Disconnect hinweg gültig (löst EC-5 ohne Zusatzlogik).

## Jog-Zustandsmaschine (App, lokal in `JogControls`, via `useJogState`)

**Zustände:** `idle` · `jogging_forward` · `jogging_backward` · `blocked` — vier Werte in einem einzigen `status`-Enum (weiterhin kein unabhängiges Boolean-Paar auf der nach außen sichtbaren API), **plus** intern getrackte Halte-Flags (`forwardHeld`, `backwardHeld`), die festhalten, welche Taste physisch noch gedrückt ist. `JogControls` sieht weiterhin nur `status` — die Halte-Flags sind reines Implementierungsdetail des Reducers.

> **Korrektur nach `/qa` (BUG-1, siehe `qa-report.md`):** Die ursprüngliche 3-Zustands-Version (nur `idle`/`jogging_forward`/`jogging_backward`, keine Halte-Flags) implementierte nur die erste Hälfte von AC-4 ("stoppt sofort"), nicht die zweite ("keine Richtung fährt weiter, bis beide Tasten losgelassen und eine erneut gedrückt wird") — ohne Gedächtnis, welche Taste noch physisch gehalten wird, konnte `idle` nach einem Zwischenloslassen nicht unterscheiden, ob wirklich beide Tasten frei waren. Die Vier-Zustands-Version unten behebt das.

**Übergänge (vollständige Tabelle, 4 Zustände × 4 Events):**
- `idle` + Vorwärts-Taste gedrückt (`onPressIn`) → `jogging_forward`, `forwardHeld=true` — sendet sofort einen JOG-Befehl (Richtung vorwärts, aktuelle Regler-Geschwindigkeit) und startet ein 300ms-Intervall, das denselben JOG-Befehl wiederholt sendet
- `idle` + Rückwärts-Taste gedrückt → `jogging_backward`, `backwardHeld=true` — analog
- `idle` + Loslassen (beide Richtungen) → bleibt `idle` (No-op, verspätetes/verirrtes Release-Event)
- `jogging_forward` + Vorwärts-Taste losgelassen (`onPressOut`) → `idle`, `forwardHeld=false` — Intervall wird gestoppt, sofort ein STOP-Befehl gesendet (AC-2)
- `jogging_forward` + Rückwärts-Taste zusätzlich gedrückt → **`blocked`** (nicht mehr `idle`), `forwardHeld=true`, `backwardHeld=true` — Intervall wird sofort gestoppt, STOP gesendet, **kein** neuer JOG-Befehl für die Gegenrichtung (AC-4/EC-2 erste Hälfte)
- `jogging_forward` + Vorwärts-Taste erneut gedrückt → bleibt `jogging_forward` (No-op, doppeltes Press-Event)
- `jogging_forward` + Rückwärts-Taste losgelassen → bleibt `jogging_forward` (defensiver No-op; unter der Halte-Flags-Invariante in diesem Zustand eigentlich unerreichbar, da Rückwärts hier nie gehalten war)
- `jogging_backward` → Spiegelfälle der drei `jogging_forward`-Zeilen oben (inkl. → `blocked` bei zusätzlichem Vorwärts-Druck)
- `blocked` + eine der beiden Tasten losgelassen → bleibt **`blocked`**, wenn die *andere* Taste noch gehalten wird (`forwardHeld`/`backwardHeld` entsprechend aktualisiert); wird erst zu `idle`, wenn **beide** Halte-Flags `false` sind (AC-4 zweite Hälfte, BUG-1-Fix) — das ist der Kern der Korrektur
- `blocked` + eine Taste (erneut) gedrückt, während die andere noch gehalten wird oder das Halte-Flag bereits gesetzt ist → bleibt `blocked`, **kein** Wechsel zu `jogging_forward`/`jogging_backward` — genau der BUG-1-Reproduktionsfall (halten → Gegentaste drücken → loslassen → dieselbe Taste erneut drücken, während die erste Taste weiterhin physisch gehalten wird)

**Reduzierbare Zusammenfassung:** `blocked` verhält sich wie ein Stopp-Zustand mit Gedächtnis — er verlässt sich ausschließlich auf die beiden Halte-Flags, niemals auf ein neues Press-Event allein, um wieder in einen fahrenden Zustand zu wechseln.

**Geschwindigkeitsregler während des Fahrens (AC-3):** Ändert der Nutzer den Regler, während `jogging_forward`/`jogging_backward` aktiv ist, ändert sich nur der Wert, der beim *nächsten* der laufenden 300ms-Intervall-Sends mitgeschickt wird — kein sofortiger Extra-Befehl nötig, die nächste Wiederholung liegt ohnehin maximal 300ms entfernt.

## Firmware-Komponentenstruktur

```
firmware/src/ble.cpp (PROJ-1, erweitert)
+-- Command-Characteristic bekommt einen echten Write-Callback (bisher No-op)
    +-- parst den Opcode (JOG | STOP, siehe Kommandoprotokoll unten)
    +-- JOG: ruft motorJog(direction, speedPercent) auf, setzt den Watchdog-Zeitstempel zurück
    +-- STOP: ruft motorStop() auf, setzt den Watchdog-Zeitstempel zurück
+-- onDisconnect-Callback (PROJ-1, bestehend) ruft zusätzlich motorStop() auf, bevor er das Advertising neu startet

firmware/src/motor.h / motor.cpp (NEU)
+-- motorSetup() — TMCStepper-UART-Konfiguration + FastAccelStepper-Initialisierung (Verkabelung/Konstanten aus docs/stacks/firmware-esp32-tmc2209.md)
+-- motorJog(direction, speedPercent) — mappt Prozent auf eine Geschwindigkeit in Steps/s, startet kontinuierlichen Lauf in die angegebene Richtung (kein Zielpunkt, läuft bis motorStop())
+-- motorStop() — hält den Motor sofort an
+-- motorWatchdogCheck() — vergleicht die Zeit seit dem letzten empfangenen JOG-Befehl gegen die 1000ms-Schwelle; bei Überschreitung während eines laufenden Jogs → motorStop() (AC-6/EC-4)

firmware/src/main.cpp (erweitert)
+-- setup() ruft zusätzlich motorSetup() auf
+-- loop() ruft motorWatchdogCheck() auf (bisher leer)
```

## Grenze zur Firmware (BLE-Kommandoprotokoll)

Nutzt die in PROJ-1 bereits angelegte Command-Characteristic (`6e400002-…`, bisher deklariert aber ungenutzt). Die Firmware-Pack-Datei (`docs/stacks/firmware-esp32-tmc2209.md`) hatte dafür nur einen Platzhalter-Vorschlag ("relative Schritte") — dieser wird durch das folgende, für den Halten-Buttons-Ansatz passendere Protokoll ersetzt (Pack wird entsprechend nachgezogen).

**Zwei Befehle, je 1 Byte Opcode + Payload:**

| Opcode | Name | Payload | Bedeutung |
|---|---|---|---|
| `0x01` | JOG | 1 Byte Richtung (`0x00`=vorwärts, `0x01`=rückwärts) + 1 Byte Geschwindigkeit (`1`–`100`, Prozent) | „Fahre (weiter) in diese Richtung mit dieser Geschwindigkeit" — wird alle 300ms wiederholt, solange eine Taste gehalten wird |
| `0x05` | STOP | kein Payload | „Halte sofort an" — bei Loslassen, Richtungswechsel oder als Firmware-eigene Reaktion auf Disconnect/Watchdog |

**Übertragungsart:** JOG als *Write ohne Antwort* (`WRITE_NR`) — wird alle 300ms wiederholt, ein einzelner Verlust ist unkritisch, die nächste Wiederholung korrigiert es, und der Watchdog fängt einen kompletten Ausfall ohnehin ab. STOP als *Write mit Antwort* (`WRITE`) — sicherheitskritisch und selten genug, dass die zusätzliche Bestätigung (ATT-Level-ACK der Firmware) den kleinen Mehraufwand wert ist. Die Command-Characteristic bekommt dafür beide Eigenschaften (`WRITE | WRITE_NR`) statt nur `WRITE` wie bisher.

> **Überholt seit qa-report.md BUG-16 (2026-09-27):** Die Annahme "ein einzelner Verlust ist unkritisch" traf auf einen *dauerhaften* Ausfall nach einer Auto-Fahrt nicht zu. JOG schreibt jetzt ebenfalls `WITH response` (`src/ble/client.ts`) — siehe qa-report.md für die volle Diagnose. Die Firmware-Characteristic bietet `WRITE_NR` weiterhin an (nicht entfernt, siehe `ble.cpp`), die App nutzt es nur nicht mehr für JOG.

**Geschwindigkeits-Mapping (Prozent → Steps/s):** linear zwischen `MIN_JOG_SPEED = 200 Steps/s` und `MAX_JOG_SPEED = 8000 Steps/s` (ursprünglich 4000, am 2026-09-29 auf 8000 erhöht — siehe Technische Entscheidungen). 1 % → 200 Steps/s, 100 % → 8000 Steps/s, dazwischen linear interpoliert. **Vorläufig**, bis die Steps-pro-mm-Kalibrierung der Mechanik steht (offene Frage aus `spec.md`) — die Prozent-Skala selbst ändert sich dadurch nicht, nur was ein bestimmter Prozentwert in mm/s tatsächlich bedeutet.

**Bewegungsart:** kontinuierlicher Lauf ohne Zielposition (`FastAccelStepper::runForward()`/`runBackward()`), nicht `moveTo()` — es gibt in diesem Feature noch keinen Zielpunkt, das kommt erst mit PROJ-3.

## Datenmodell

**Kein neues persistentes Datenmodell** — `docs/data-model.md` bleibt unverändert. Der Jog-Zustand (welche Taste gehalten wird, aktueller Geschwindigkeits-Reglerwert) ist reiner, nicht persistierter React-State innerhalb von `JogControls` — verschwindet bewusst beim Verlassen des Bildschirms/der Verbindung, es gibt nichts, das über eine Session hinaus gespeichert werden müsste (Presets kommen erst mit PROJ-4).

## Erweiterung der App-BLE-Grenze (`src/ble/client.ts`, `ConnectionProvider`)

- **`src/ble/client.ts`** bekommt zwei neue Exporte: `sendJogCommand(device, direction, speedPercent)` und `sendStopCommand(device)`, beide schreiben auf die (bereits als Konstante vorhandene) Command-Characteristic-UUID. Rein additiv, ändert nichts an den bestehenden Exporten.
- **`ConnectionProvider`** exponiert im Context-Wert zusätzlich das verbundene `Device`-Objekt (`device: Device | null`, `null` außer im Zustand `connected`) — bisher hielt `ConnectionProvider` das Device nur intern (`deviceRef`), ohne es nach außen zu geben. `JogControls` braucht diese Referenz, um Befehle zu senden. **Rein additiv am Context-Wert** (bestehende Felder `state`/`requestScan` unverändert, keine PROJ-1-Acceptance-Criteria betroffen) — trotzdem hier explizit benannt, weil es eine Datei berührt, die PROJ-1 gehört.

## Abhängigkeiten

- `@react-native-community/slider` — Geschwindigkeitsregler; React Native selbst liefert seit Version 0.60 keinen Slider mehr im Core
- Firmware: keine neuen Bibliotheken — `TMCStepper` und `FastAccelStepper` stehen bereits seit PROJ-1 in `platformio.ini`, wurden aber noch nicht genutzt

## Settings the user makes

_Keine — kein Backend, kein Provider-Dashboard betroffen._

## Technische Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Command-Protokoll: JOG (wiederholt, ohne Antwort) + STOP (einmalig, mit Antwort) statt eines einzigen Befehlstyps — **überholt seit BUG-16 (2026-09-27): JOG schreibt jetzt ebenfalls mit Antwort, siehe qa-report.md** | Passt zur Halten-Buttons-UX: JOG ist ein "Herzschlag", der Verlust einzelner Pakete verkraftet; STOP ist sicherheitskritisch und selten, verdient die Bestätigung |
| Watchdog-Guarantee (EC-4): Firmware vergleicht Zeit seit letztem JOG gegen 1000ms (≈3 verpasste 300ms-Intervalle), unabhängig vom offiziellen BLE-Verbindungsstatus | Schützt vor App-Absturz/Hintergrund/Paketverlust, wie in `spec.md` AC-6 gefordert — dieselbe Idee wie PROJ-1s Verbindungs-Robustheit, jetzt für die Motorsteuerung konkret umgesetzt |
| Disconnect-Guarantee (EC-3): `onDisconnect`-Callback (PROJ-1, bestehend) ruft zusätzlich `motorStop()` auf | Direkte Umsetzung von AC-5 — der Callback existierte in PROJ-1 bereits für das Advertising-Neustarten, bekommt jetzt eine zweite, sicherheitsrelevante Aufgabe |
| Beide-Tasten-Guarantee (EC-2): rein App-seitig über die Zustandsmaschine durchgesetzt (nie zwei Richtungen gleichzeitig gesendet) | Ein Motor kann physisch ohnehin nicht in zwei Richtungen gleichzeitig laufen — die App verhindert bereits, dass ein widersprüchlicher Befehl das Gerät überhaupt erreicht |
| `ConnectionProvider`-Context um `device` erweitert, statt eines zweiten, parallelen Wegs an das verbundene Device zu kommen | Eine einzige Quelle der Wahrheit für "welches Device ist verbunden" — konsistent mit dem bestehenden Muster (`state`, `requestScan`) |
| Geschwindigkeits-Mapping 1–100 % → 200–8000 Steps/s linear, als vorläufige Konstante | Ermöglicht das Bauen, ohne auf die noch ausstehende Mechanik-Kalibrierung zu warten; reine Zahlenkonstante, leicht später anzupassen |
| Maximum von 4000 auf 8000 Steps/s erhöht (2026-09-29) | Am echten Slider zuerst mit 6000, dann mit 8000 getestet — läuft ohne Probleme; Beschleunigung bleibt bei 8000 Steps/s² (Rampe bis Maximum ca. 1 s). Wirkt auf Jog, Auto-Fahrt (PROJ-3) und Zeitraffer (PROJ-5), da alle dieselbe Konstante `kJogSpeedMaxHz` nutzen |
| Slider-Wertebereich 1–100 % (nicht 0–100 %) | Verhindert den Degenerationsfall "Taste gedrückt, aber Geschwindigkeit 0 → sichtbar nichts passiert", ohne dass der Nutzer versteht warum |
| `onPressIn`/`onPressOut` von React Natives `Pressable` statt einer eigenen Touch-Geste-Logik für EC-1 (Finger aus dem Button gezogen) | `Pressable` feuert `onPressOut` zuverlässig auch beim Herausziehen des Fingers — Plattform-Standardverhalten, keine Extra-Logik nötig |
| BUG-3/BUG-4-Fix (`qa-report.md`): BLE-Bonding + durchgängiges Advertising, `firmware/src/ble.cpp` | Command-Characteristic steuert seit PROJ-2 tatsächlich den Motor; der Slider hat keine Endanschläge (spec.md → Out of Scope) — ein unauthentifizierter Write eines fremden Geräts könnte den Schlitten physisch von der Schiene fahren (BUG-3), und ein fremdes Gerät, das sich zuerst verbindet, würde den Slider für die App unauffindbar machen (BUG-4, kein Re-Advertising nach erfolgreichem Connect). Löst PROJ-1s Entscheidung „keine BLE-PIN/Bonding" (`features/PROJ-1-ble-verbindung-pairing/spec.md` Decision Log) ab, die galt, als die Characteristic noch wirkungslos war. Nutzerfreigabe für diese sicherheitsrelevante Änderung eingeholt. **Konkret:** `NimBLEDevice::setSecurityAuth(/*bonding=*/true, /*mitm=*/false, /*sc=*/true)` + `NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT)` in `bleSetup()` — „Just Works"-Bonding, kein Passkey/keine Bestätigung nötig (Board hat weder Display noch Tastatur). Command-Characteristic bekommt zusätzlich `NIMBLE_PROPERTY::WRITE_ENC` (neben weiterhin `WRITE`/`WRITE_NR`) — verlangt einen verschlüsselten (gebondeten) Link für jeden Write, JOG *und* STOP. `ServerCallbacks::onConnect` ruft jetzt zusätzlich `NimBLEDevice::startAdvertising()` auf (bisher nur in `onDisconnect`). Verifiziert gegen die real vendorten NimBLE-Arduino-2.5.1-Header/-Quellen unter `firmware/.pio/libdeps/esp32dev/NimBLE-Arduino/src/`. **Aktuell gültige Schutzwirkung (per Re-Verifikation korrigiert):** Just Works verlangt vor dem ersten Schreiben einen Pairing-Schritt, bestätigt ihn aber ohne jede Rückfrage — es gibt kein „Pairing-Fenster", das Pairing steht dauerhaft jedem offen, und ein fremdes Gerät kann ebenso automatisch mitpairen wie die App (kein Passkey, keine Bestätigung nötig). Der Schutz wehrt naive/generische Zugriffe ab, nicht einen gezielten Angreifer mit einem BLE-fähigen Gerät. Echter Schutz bräuchte einen festen Passkey (MITM ein) — für dieses private Hobby-Gerät bewusst nicht umgesetzt (Nutzerentscheidung nach der Security-Re-Verifikation), siehe `qa-report.md` BUG-3. |
| Fix zu BUG-2 (`qa-report.md`): `motorJog()` unterscheidet jetzt "Fahrt neu starten" von "Fahrt läuft bereits in dieselbe Richtung" über ein selbst getracktes `jogRunning`/`jogRunningDirection`-Flag (`motor.cpp`, per `motorStop()` zurückgesetzt). Neu/Richtungswechsel: `setSpeedInHz()` + `runForward()`/`runBackward()`. Bereits laufend, gleiche Richtung (die wiederholten 300ms-JOG-Heartbeats bei gehaltener Taste): `setSpeedInHz()` + `applySpeedAcceleration()` | Laut Doc-Kommentar in der vendorten `FastAccelStepper.h` (`firmware/.pio/libdeps/esp32dev/FastAccelStepper/src/FastAccelStepper.h:495-498`) genau der für kontinuierlich laufende Stepper vorgesehene Weg, eine neue Geschwindigkeit zu übernehmen; zusätzlich mit Context7 (`/gin66/fastaccelstepper`) gegengeprüft — deckt sich wörtlich mit der vendorten Headerdatei. `isRunning()` liefert keine Richtung, daher das eigene Tracking. |
| Fix zu BUG-1 (`qa-report.md`): `useJogState.ts`s Zustandsmaschine bekommt einen vierten Status `blocked` plus intern getrackte `forwardHeld`/`backwardHeld`-Halte-Flags (`InternalState`, nicht Teil der nach außen exponierten API von `useJogState()`) | Die 3-Status-Version (`idle`/`jogging_forward`/`jogging_backward`) implementierte nur die erste Hälfte von AC-4 ("stoppt sofort bei Gegentaste") — ohne Gedächtnis, welche Taste noch physisch gehalten wird, konnte sie die zweite Hälfte ("keine Richtung fährt weiter, bis beide Tasten losgelassen und eine erneut gedrückt wird") nicht erzwingen: nach `jogging_backward` → (Vorwärts zusätzlich) → `idle` → (Vorwärts losgelassen, Rückwärts weiterhin physisch gehalten) → (Vorwärts erneut gedrückt) ging der alte Reducer bedingungslos wieder auf `jogging_forward`, obwohl Rückwärts nie losgelassen wurde |
| Fix zu Re-Verifikations-Befund I-1/BUG-R2 (`qa-report.md`): `ConnectionProvider.tsx` feuert nach jedem erfolgreichen Connect/Reconnect ein Fire-and-forget-`sendStopCommand(connectedDevice)` | Der BUG-3-Fix (Bonding) bricht den ersten Jog-Versuch nach frischem Pairing still: JOG ist Write-ohne-Antwort, ein unverschlüsselter Write wird vom BLE-Stack ohne Fehlerantwort verworfen — Android startet On-Demand-Bonding aber nur über genau diese Fehlerantwort. Ohne Gegenmaßnahme merkt der Nutzer nur "Taste halten tut nichts", bis zufällig ein Loslassen das Pairing auslöst. **Bewusst nicht awaited** (bleibendes, akzeptiertes Restrisiko): PROJ-1s Connect-Timing hat eigene, hart erarbeitete `settled`/`cancelled`-Guards gegen Races (BUG-3/NEU-1 aus PROJ-1s QA-Historie) — ein await vor dem Dispatch hätte dieses Zeitfenster vergrößert. Fire-and-forget schließt die Lücke in der Praxis fast immer (BLE-Pairing dauert typischerweise deutlich unter 1s), ohne PROJ-1s Race-Schutz anzufassen. |
| Fix zu Re-Verifikations-Befund N-1 (`qa-report.md`): `ble.cpp`s `onDisconnect` stoppt den Motor/setzt `gConnected=false` nur noch, wenn `pServer->getConnectedCount() == 0` | Der BUG-4-Fix (durchgängiges Advertising) macht mehrere gleichzeitige BLE-Verbindungen möglich (NimBLE-Default: bis zu 3) — vorher bedeutete `onDisconnect` immer "die eine App-Verbindung ist weg", jetzt kann es genauso gut ein fremdes Gerät sein, das kurz verbindet und wieder trennt, während die App weiterhin verbunden ist und jogged. **Bekannte Einschränkung:** `getConnectedCount() == 0` erkennt nicht, OB der verbleibende Peer tatsächlich die App ist — für dieses Produkt ausreichend; siehe auch `qa-report.md` N-2 (mehrere gebondete Geräte könnten gleichzeitig steuern) als bewusst akzeptierte, verwandte Grenze. |

## Offene Fragen

- [ ] Aus `spec.md` übernommen: Exakte Geschwindigkeitsbereiche (mm/s) stehen erst nach der mechanischen Kalibrierung fest — die 200–8000-Steps/s-Konstante ist ein vorläufiger, aber funktionsfähiger Platzhalter.
