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

> **Überholt seit qa-report.md BUG-16 (2026-09-27):** Die Annahme "ein einzelner Verlust ist unkritisch" traf auf einen *dauerhaften* Ausfall nach einer Auto-Fahrt nicht zu. JOG schreibt jetzt ebenfalls `WITH response` (`src/ble/client.ts`) — siehe qa-report.md für die volle Diagnose. **Tatsächliche Ursache (Nachtrag 7, 2026-09-30):** nicht der Paketverlust, sondern FastAccelStepper: `forceStop()` auf einem *stehenden* Stepper setzt ein Immediate-Stop-Flag, das nur während einer laufenden Rampe gelöscht wird; der nächste `runForward()` endete dadurch ohne Schritt. Behoben in `motorStop()` (`forceStop()` nur bei `isRunning()`). Die Firmware-Characteristic bietet `WRITE_NR` weiterhin an (nicht entfernt, siehe `ble.cpp`), die App nutzt es nur nicht mehr für JOG.

**Geschwindigkeits-Mapping (Prozent → Steps/s):** linear zwischen `MIN_JOG_SPEED = 200 Steps/s` und `MAX_JOG_SPEED = 8000 Steps/s` (ursprünglich 4000, am 2026-09-29 auf 8000 erhöht — siehe Technische Entscheidungen). 1 % → 200 Steps/s, 100 % → 8000 Steps/s, dazwischen linear interpoliert. **Vorläufig**, bis die Steps-pro-mm-Kalibrierung der Mechanik steht (offene Frage aus `spec.md`) — die Prozent-Skala selbst ändert sich dadurch nicht, nur was ein bestimmter Prozentwert in mm/s tatsächlich bedeutet.

**Bewegungsart:** kontinuierlicher Lauf ohne Zielposition (`FastAccelStepper::runForward()`/`runBackward()`), nicht `moveTo()` — es gibt in diesem Feature noch keinen Zielpunkt, das kommt erst mit PROJ-3.

## Datenmodell

_Stand bis 2026-10-07; seit der Erweiterung „Halten im Stillstand“ gibt es einen persistenten Wert auf dem Slider, siehe dort._ **Kein neues persistentes Datenmodell** — `docs/data-model.md` bleibt unverändert. Der Jog-Zustand (welche Taste gehalten wird, aktueller Geschwindigkeits-Reglerwert) ist reiner, nicht persistierter React-State innerhalb von `JogControls` — verschwindet bewusst beim Verlassen des Bildschirms/der Verbindung, es gibt nichts, das über eine Session hinaus gespeichert werden müsste (Presets kommen erst mit PROJ-4).

## Erweiterung der App-BLE-Grenze (`src/ble/client.ts`, `ConnectionProvider`)

- **`src/ble/client.ts`** bekommt zwei neue Exporte: `sendJogCommand(device, direction, speedPercent)` und `sendStopCommand(device)`, beide schreiben auf die (bereits als Konstante vorhandene) Command-Characteristic-UUID. Rein additiv, ändert nichts an den bestehenden Exporten.
- **`ConnectionProvider`** exponiert im Context-Wert zusätzlich das verbundene `Device`-Objekt (`device: Device | null`, `null` außer im Zustand `connected`) — bisher hielt `ConnectionProvider` das Device nur intern (`deviceRef`), ohne es nach außen zu geben. `JogControls` braucht diese Referenz, um Befehle zu senden. **Rein additiv am Context-Wert** (bestehende Felder `state`/`requestScan` unverändert, keine PROJ-1-Acceptance-Criteria betroffen) — trotzdem hier explizit benannt, weil es eine Datei berührt, die PROJ-1 gehört.

## Erweiterung 2026-10-07: Halten im Stillstand (AC-8 bis AC-12, EC-6 bis EC-9)

**Ausgangslage:** `motorSetup()` schaltet `setAutoEnable(true)`. FastAccelStepper bestromt den Treiber dadurch nur während einer Fahrt und zieht EN danach wieder auf HIGH. Im Stillstand hält nur das Rastmoment, und auf geneigter Schiene reicht das nicht. Das gilt für jede Bewegungsart, also für Jog, Auto-Fahrt (PROJ-3) und Zeitraffer-Schritte (PROJ-5). Deshalb sitzt die Lösung zentral in `motor.cpp` und nicht bei einer einzelnen Bewegungsart.

Das Feature spannt beide Layer. Die Grenze dazwischen bilden ein neuer Opcode auf der Command-Characteristic und ein neues Byte im Status-Payload.

### Firmware (`firmware/`)

```
firmware/src/motor.h / motor.cpp (erweitert)
+-- motorSetup()
|   +-- Haltestrom: rms_current(1700 mA, Haltefaktor `kHoldCurrentFraction` = 0,6) → IHOLD = 60 % von IRUN (ca. 1,0 A)
|   +-- TPOWERDOWN = 20 (Haltestrom greift ca. 0,4 s nach dem letzten Schritt)
|   +-- IHOLDDELAY = 8 (Strom sinkt in kleinen Stufen statt auf einen Schlag → kein Ruck)
|   +-- liest die gespeicherte Einstellung aus dem Flash (NVS); fehlt sie → „an"
|   +-- Einstellung an:  Auto-Enable AUS, Treiber bleibt aber vorerst stromlos (AC-12)
|   +-- Einstellung aus: Auto-Enable AN (Verhalten wie bisher)
+-- motorSetHold(an/aus)        — NEU, vom BLE-Task aufgerufen; merkt nur den Wunsch vor
+-- motorHoldCheck()            — NEU, aus loop(); wendet einen vorgemerkten Wunsch an
+-- motorGetStatus()            — liefert zusätzlich holdAtStandstill (den gespeicherten Wunsch)
+-- Bewegungsstart (motorJog, motorAutoDrive, motorTimelapseMoveTo)
    +-- ist die Einstellung an → Treiber vor dem Start einschalten (enableOutputs);
        danach bleibt er an, auch nach dem Stopp
+-- motorLockout() (PROJ-6, unverändert): Auto-Enable aus, EN HIGH, toff 0 — hat Vorrang

firmware/src/ble.cpp (erweitert)
+-- Opcode 0x08 SET_HOLD → motorSetHold()
+-- Status-Payload wächst von 10 auf 11 Byte (Byte 10 = Einstellungs-Flags)

firmware/src/main.cpp (erweitert)
+-- loop() ruft zusätzlich motorHoldCheck() auf
```

**Ablauf von `motorHoldCheck()`**, der einzigen Stelle, an der sich der Haltemodus ändert:
1. Ist der Slider gesperrt (PROJ-6), passiert nichts. Der Treiber bleibt aus (EC-7).
2. Gibt es keinen vorgemerkten Wunsch, passiert nichts.
3. Läuft der Motor gerade, bleibt der Wunsch vorgemerkt und wird beim ersten Durchlauf im Stillstand angewendet (EC-6).
4. Sonst wird der Wunsch im Flash gespeichert (nur wenn er sich vom gespeicherten Wert unterscheidet) und sofort angewendet (AC-10):
   - **an:** Auto-Enable aus, Treiber ein. Der Motor hält ab jetzt, auch wenn er seit dem Einschalten noch nicht gefahren ist. Der Nutzer hat es ausdrücklich verlangt.
   - **aus:** Auto-Enable an, Treiber aus. Der Motor ist sofort stromlos (AC-9).

**Warum ein vorgemerkter Wunsch statt direkter Ausführung im BLE-Callback:** UART-Zugriffe auf den TMC2209 und das Setzen von EN laufen schon heute im `loop()`-Task (PROJ-6-Sperre aus `battery.cpp`). Dasselbe gilt für das Schreiben in den Flash, das einige Millisekunden blockiert. Bleiben alle Hardware- und Flash-Zugriffe in einem Task, kann die Sperre nie mitten in ein halbes Umschalten fallen. Den Wunsch übergibt der BLE-Task über ein `volatile`-Flag, wie bei den übrigen Flags in `motor.cpp`.

**Verhalten im Einzelnen:**

| Situation | Einstellung an | Einstellung aus |
|---|---|---|
| Nach dem Einschalten, vor der ersten Fahrt | stromlos (AC-12) | stromlos |
| Während einer Fahrt | voller Fahrstrom 1,7 A | voller Fahrstrom 1,7 A |
| Nach dem Stopp (Jog, Auto-Fahrt, Zeitraffer-Schritt) | nach ca. 0,4 s sanft auf 60 % (AC-8) | stromlos (AC-9) |
| Verbindungsabbruch im Stillstand | hält weiter (EC-8) — `onDisconnect` ruft nur `motorStop()`, das den Treiber nicht abschaltet | stromlos |
| Verbindungsabbruch während Jog | Motor stoppt (AC-5) und hält danach | Motor stoppt, danach stromlos |
| Sperre nach Schutz-Stopp (PROJ-6) | stromlos (EC-7) | stromlos |
| Neustart | gespeicherter Wert gilt (AC-11), erst ab der ersten Fahrt bestromt | gespeicherter Wert gilt |

**Speicherung:** ESP32-Flash über die `Preferences`-Bibliothek des Arduino-ESP32-Cores (NVS). Namespace `slider`, Schlüssel `hold`, ein Wahrheitswert. Fehlt der Schlüssel (Auslieferungszustand, nach einem Flash-Löschen), gilt „an" (AC-12). Geschrieben wird nur bei einer tatsächlichen Änderung. Bei einigen Umschaltungen pro Drehtag spielt der Flash-Verschleiß keine Rolle.

### Grenze App ↔ Firmware

**Neuer Befehl** auf der Command-Characteristic:

| Opcode | Name | Payload | Bedeutung |
|---|---|---|---|
| `0x08` | SET_HOLD | 1 Byte: `0x01` = Halten an, `0x00` = aus | Einstellung ändern. Jeder andere Payload-Wert und jede falsche Länge (≠ 2 Byte) werden ignoriert. Gesendet wird als Write mit Antwort, wie alle Befehle. Während der Sperre (PROJ-6) wird der Befehl ignoriert und nicht vorgemerkt, sonst würde er nach einer gar nicht stattfindenden Entsperrung greifen. |

**Status-Payload: 10 → 11 Byte.** Byte 10 ist ein neues Einstellungs-Flagfeld, weil alle 8 Bits von Byte 0 belegt sind. Bit 0 = `holdAtStandstill` (gespeicherter bzw. vorgemerkter Wunsch), Bits 1–7 sind reserviert und `0`. Die App liest diesen Wert. Ändert er sich, sendet die Firmware über den bestehenden Diff-Check in `bleNotifyStatusIfChanged()` ohnehin ein Notify. Beim Verbinden liefert Notify-on-Subscribe den aktuellen Stand (AC-10, EC-9).

`holdAtStandstill` meldet den **Wunsch** und nicht, ob der Treiber gerade bestromt ist. Der Schalter zeigt damit die Einstellung des Nutzers. Ob der Motor im Moment tatsächlich Strom hat (z. B. vor der ersten Fahrt nach dem Einschalten), zeigt die App bewusst nicht an.

### App (`src/`)

```
RootScreen (unverändert in der Struktur)
+-- JogControls (erweitert, bekommt zwei neue Props von RootScreen)
    +-- SpeedSlider
    +-- HoldSwitchRow (NEU, direkt unter dem Regler)
    |   +-- Text „Motor hält im Stillstand"
    |   +-- Switch (gleicher Stil wie „Video aufnehmen" in AutoDriveControls)
    |   +-- Fehlerzeile „Einstellung konnte nicht übertragen werden" (nur nach einem Sendefehler)
    +-- DirectionButtonRow (unverändert)
    +-- StatusLine (unverändert)
```

- **`src/ble/client.ts`:** neuer Export `sendSetHoldCommand(device, enabled)`. `SliderStatus` bekommt das Feld `holdAtStandstill` (an / aus / `null`). `parseStatusPayload()` liest Byte 10 nur, wenn das Payload mindestens 11 Byte lang ist, sonst `null`.
- **`HoldSwitchRow`** (neue Datei `src/components/HoldSwitchRow.tsx`) ist rein darstellend. Props: der gemeldete Wert, „nicht bedienbar" und ein Umschalt-Callback.
- **Was der Schalter zeigt:**
  - Normalfall: den zuletzt gemeldeten Wert `status.holdAtStandstill`.
  - Während ein Umschalten unterwegs ist (Befehl gesendet, noch kein Status mit dem neuen Wert): den gewünschten Wert, damit der Schalter nicht kurz zurückspringt.
  - Schlägt das Senden fehl: zurück auf den gemeldeten Wert, dazu die Fehlerzeile. Sie verschwindet beim nächsten erfolgreichen Umschalten.
  - Nach dem Wiederverbinden ist `JogControls` frisch gemountet. Ein vorgemerkter Wert aus der alten Verbindung existiert nicht mehr, es gilt nur der gemeldete (EC-9).
- **Wann der Schalter fehlt oder gesperrt ist:**
  - `holdAtStandstill` ist `null` (ältere Firmware ohne Byte 10): Die Zeile wird nicht angezeigt. So bietet die App keinen Schalter an, den der Slider nicht versteht.
  - Gesperrt (PROJ-6, `status.batteryLocked`): Der Schalter ist nicht bedienbar (EC-7).
  - Bei laufender Auto-Fahrt (inkl. Vor-/Nachlauf eines Video-Takes) oder Zeitraffer-Sequenz ist er **gesperrt** wie die übrigen Jog-Elemente (EC-6, PROJ-3 AC-9/AC-28): Die Zeile ist nicht bedienbar, sobald `holdLocked` **oder** das bestehende `disabled` von `JogControls` gilt. `holdLocked` bleibt als eigenes Prop, weil die Akku-Sperre den Schalter auch ohne `disabled` sperren muss. Während einer Jog-Fahrt bleibt er bedienbar; die Firmware wendet die Änderung erst beim Stopp an (`motorHoldCheck()` wartet auf `!isRunning()`).
- **`RootScreen`** reicht `status.holdAtStandstill` und `status.batteryLocked` aus seinem bestehenden `useSliderStatus(device)`-Aufruf an `JogControls` durch. Es gibt keinen zusätzlichen Status-Abonnenten.

### Datenmodell (Detail)

Ein einzelner Wert **auf dem Slider**, nicht auf dem Handy:
- `hold` — Wahrheitswert, Pflicht, Default `an`, gespeichert im ESP32-NVS (Namespace `slider`).
- Zugriff: Nur der gebondete, verbundene Client kann den Wert über SET_HOLD ändern. Die Command-Characteristic verlangt seit PROJ-1/PROJ-2 eine verschlüsselte, gebondete Verbindung. Lesen geht über das Status-Notify.
- Wird nie gelöscht. Ein Flash-Löschen setzt ihn auf den Default zurück.

`docs/data-model.md` führt ihn bereits als Entität „Slider-Einstellung ‚Halten im Stillstand‘" (seit dem Refine vom 2026-10-07).

### Gegencheck Plattform (mobile, kein Backend)

Gilt weiter: Eingabeprüfung an der Grenze (SET_HOLD prüft Länge und Wert in der Firmware), Zugriff nur über die gebondete, verschlüsselte Characteristic, keine Secrets.
Entfällt, weil es auf dieser Plattform kein Gegenstück gibt: Rate-Limiting (kein Credential), HTTP-Header, Routen-Schutz.

## Abhängigkeiten

- `@react-native-community/slider` — Geschwindigkeitsregler; React Native selbst liefert seit Version 0.60 keinen Slider mehr im Core
- Firmware: keine neuen Bibliotheken — `TMCStepper` und `FastAccelStepper` stehen bereits seit PROJ-1 in `platformio.ini`, wurden aber noch nicht genutzt
- Halten im Stillstand (2026-10-07): keine neuen Pakete. `Preferences` (NVS) gehört zum Arduino-ESP32-Core, der Switch kommt aus React Native selbst.

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
| Fix zu BUG-2 (`qa-report.md`): `motorJog()` unterscheidet jetzt "Fahrt neu starten" von "Fahrt läuft bereits in dieselbe Richtung" über ein selbst getracktes `jogRunning`/`jogRunningDirection`-Flag (`motor.cpp`, per `motorStop()` zurückgesetzt und seit BUG-16 zusätzlich in `motorJog()`, wenn der Stepper steht). Neu/Richtungswechsel: `setSpeedInHz()` + `runForward()`/`runBackward()`. Bereits laufend, gleiche Richtung (die wiederholten 300ms-JOG-Heartbeats bei gehaltener Taste): `setSpeedInHz()` + `applySpeedAcceleration()` | Laut Doc-Kommentar in der vendorten `FastAccelStepper.h` (`firmware/.pio/libdeps/esp32dev/FastAccelStepper/src/FastAccelStepper.h:495-498`) genau der für kontinuierlich laufende Stepper vorgesehene Weg, eine neue Geschwindigkeit zu übernehmen; zusätzlich mit Context7 (`/gin66/fastaccelstepper`) gegengeprüft — deckt sich wörtlich mit der vendorten Headerdatei. `isRunning()` liefert keine Richtung, daher das eigene Tracking. |
| Fix zu BUG-1 (`qa-report.md`): `useJogState.ts`s Zustandsmaschine bekommt einen vierten Status `blocked` plus intern getrackte `forwardHeld`/`backwardHeld`-Halte-Flags (`InternalState`, nicht Teil der nach außen exponierten API von `useJogState()`) | Die 3-Status-Version (`idle`/`jogging_forward`/`jogging_backward`) implementierte nur die erste Hälfte von AC-4 ("stoppt sofort bei Gegentaste") — ohne Gedächtnis, welche Taste noch physisch gehalten wird, konnte sie die zweite Hälfte ("keine Richtung fährt weiter, bis beide Tasten losgelassen und eine erneut gedrückt wird") nicht erzwingen: nach `jogging_backward` → (Vorwärts zusätzlich) → `idle` → (Vorwärts losgelassen, Rückwärts weiterhin physisch gehalten) → (Vorwärts erneut gedrückt) ging der alte Reducer bedingungslos wieder auf `jogging_forward`, obwohl Rückwärts nie losgelassen wurde |
| Fix zu Re-Verifikations-Befund I-1/BUG-R2 (`qa-report.md`): `ConnectionProvider.tsx` feuert nach jedem erfolgreichen Connect/Reconnect ein Fire-and-forget-`sendStopCommand(connectedDevice)` | Der BUG-3-Fix (Bonding) bricht den ersten Jog-Versuch nach frischem Pairing still: JOG ist Write-ohne-Antwort, ein unverschlüsselter Write wird vom BLE-Stack ohne Fehlerantwort verworfen — Android startet On-Demand-Bonding aber nur über genau diese Fehlerantwort. Ohne Gegenmaßnahme merkt der Nutzer nur "Taste halten tut nichts", bis zufällig ein Loslassen das Pairing auslöst. **Bewusst nicht awaited** (bleibendes, akzeptiertes Restrisiko): PROJ-1s Connect-Timing hat eigene, hart erarbeitete `settled`/`cancelled`-Guards gegen Races (BUG-3/NEU-1 aus PROJ-1s QA-Historie) — ein await vor dem Dispatch hätte dieses Zeitfenster vergrößert. Fire-and-forget schließt die Lücke in der Praxis fast immer (BLE-Pairing dauert typischerweise deutlich unter 1s), ohne PROJ-1s Race-Schutz anzufassen. |
| Fix zu Re-Verifikations-Befund N-1 (`qa-report.md`): `ble.cpp`s `onDisconnect` stoppt den Motor/setzt `gConnected=false` nur noch, wenn `pServer->getConnectedCount() == 0` | Der BUG-4-Fix (durchgängiges Advertising) macht mehrere gleichzeitige BLE-Verbindungen möglich (NimBLE-Default: bis zu 3) — vorher bedeutete `onDisconnect` immer "die eine App-Verbindung ist weg", jetzt kann es genauso gut ein fremdes Gerät sein, das kurz verbindet und wieder trennt, während die App weiterhin verbunden ist und jogged. **Bekannte Einschränkung:** `getConnectedCount() == 0` erkennt nicht, OB der verbleibende Peer tatsächlich die App ist — für dieses Produkt ausreichend; siehe auch `qa-report.md` N-2 (mehrere gebondete Geräte könnten gleichzeitig steuern) als bewusst akzeptierte, verwandte Grenze. |
| BUG-16/BUG-20 (2026-09-30): `motorStop()` ruft `forceStop()` nur, wenn der Stepper läuft; zusätzlich setzt `motorJog()` ein veraltetes `jogRunning` zurück, wenn der Stepper steht (Sicherheitsnetz) | `forceStop()` im Stillstand setzt in FastAccelStepper ein Immediate-Stop-Flag, das nur eine laufende Rampe löscht — der nächste Jog-Start endete ohne Schritt, und jedes Loslassen setzte das Flag erneut (Dauerausfall bis Reboot). Die zuvor angenommene Ursache („`moveTo()` überschreibt laufenden Jog") ist im Code nicht erreichbar, weil `motorAutoDrive()`/`motorTimelapseMoveTo()` bei laufendem Stepper ablehnen. Hängt an der Bibliotheksversion (`FastAccelStepper @ ^0.31.1`) |
| DIR-Polarität invertiert: `setDirectionPin(kDirPin, false)` (2026-09-29) | Vorwärts/Rückwärts war physisch vertauscht; eine Stelle ändert nur den Pin-Pegel, Zählrichtung und logische Positionen bleiben — konsistent für Jog, Auto-Fahrt und Zeitraffer. Gespeicherte Presets werden per `dirVersion` migriert (PROJ-4 design.md) |
| `lastJogMillis` wird vor dem Start des Laufs gesetzt (BUG-23) | Der Watchdog (anderer Task) sieht sonst in einem kurzen Fenster einen frisch gestarteten Lauf mit altem Zeitstempel |
| Halten im Stillstand über den TMC2209-Haltestrom (IHOLD = 60 % von IRUN, TPOWERDOWN 20, IHOLDDELAY 8) statt Treiber dauerhaft mit vollem Strom (2026-10-07) | Der Treiber senkt den Strom im Stillstand selbst, und ein sanftes IHOLDDELAY verhindert einen Ruck beim Übergang. **Alternative:** voller Strom im Stillstand (einfacher, maximales Haltemoment). **Trade-off:** ca. 40 % weniger Haltemoment als bei vollem Strom. Dafür deutlich weniger Wärme und Akkuverbrauch, und laut Stack-Pack bleibt der Dauerstrom mit ca. 1,0 A unter der Wärmegrenze von 1,4 A ohne Luftstrom. Der Wert ist eine Konstante und wird im Hardwaretest bestätigt. |
| Haltemodus über Auto-Enable steuern: an → Auto-Enable aus, Treiber wird bei Bewegungsstart eingeschaltet und bleibt an; aus → Auto-Enable an wie bisher (2026-10-07) | Nur ein Schalter im Code entscheidet, und PROJ-6s Sperre (Auto-Enable aus + `disableOutputs()` + `toff(0)`) bleibt unverändert gültig. **Alternative:** Auto-Enable immer an und `setDelayToDisable()` hochsetzen. **Trade-off der Alternative:** maximal ca. 65 s Verzögerung, also kein dauerhaftes Halten, das passt nicht. Nachteil der gewählten Lösung: Jeder Bewegungsstart muss den Treiber selbst einschalten (drei Stellen in `motor.cpp`). |
| Umschalten nur im `loop()`-Task (`motorHoldCheck()`), der BLE-Callback merkt nur vor (2026-10-07) | Die Garantie hinter EC-6 und EC-7: Hardware- und Flash-Zugriffe liegen in einem Task mit der PROJ-6-Sperre. Damit wird nie während einer Fahrt umgeschaltet und nie ein gesperrter Treiber wieder eingeschaltet. **Alternative:** direkt im BLE-Callback umschalten. **Trade-off:** bis zu einem `loop()`-Durchlauf Verzögerung (Millisekunden). |
| Einstellung im ESP32-NVS (`Preferences`), Default an (2026-10-07) | Folgt aus AC-11 und AC-12: Sie muss ohne App und nach einem Neustart gelten. **Alternative:** in der App speichern (AsyncStorage) und beim Verbinden senden. **Trade-off:** Der Wert gehört dann zu einem Handy statt zum Slider. Bei einem Single-Owner-Gerät ist das egal. |
| Status-Payload um Byte 10 (Einstellungs-Flags) erweitert statt eines eigenen Lese-Befehls (2026-10-07) | Der bestehende Notify mit Diff-Check und Notify-on-Subscribe liefert den Wert ohne neuen Mechanismus. Byte 0 ist voll, deshalb ein neues Byte mit Reserve-Bits. **Alternative:** eigene Read-Characteristic. **Trade-off:** App und Firmware müssen zusammen ausgeliefert werden. Eine ältere App ignoriert Byte 10 (Längenprüfung nur nach unten), eine neue App blendet den Schalter bei älterer Firmware aus. |
| ~~Schalter bleibt während Auto-Fahrt/Zeitraffer bedienbar, eigenes Prop statt `disabled` (2026-10-07)~~ — ersetzt, siehe nächste Zeile | Ging davon aus, dass die Firmware jede Fahrt als „läuft“ meldet. Vor-/Nachlauf eines Video-Takes und Zeitraffer-Pausen sind aber Stillstand, dort wirkte das Umschalten sofort (BUG-78). |
| Schalter gesperrt, wenn `holdLocked` oder `disabled` gilt; während Jog bedienbar (2026-10-07, BUG-78) | Folgt aus der neuen EC-6: kein Umschalten mitten in einer Auto-Fahrt, einem Video-Take oder einer Zeitraffer-Sequenz, PROJ-3 AC-9/AC-28 bleiben gültig. **Alternative:** bedienbar lassen und die Änderung App-seitig bis zum Ende von Take/Sequenz aufschieben. **Trade-off:** Wer während der Fahrt umstellen will, muss bis nach dem Stopp warten; dafür keine zusätzliche Aufschiebe-Logik. |

## Offene Fragen

- [ ] Aus `spec.md` übernommen: Reicht 60 % Haltestrom auf der schrägsten Aufstellung, wie warm werden Motor/Treiber, wie viel Akkulaufzeit kostet dauerhaftes Halten? → Hardwaretest; `kHoldCurrentFraction` ggf. anpassen
- [ ] Aus `spec.md` übernommen: Exakte Geschwindigkeitsbereiche (mm/s) stehen erst nach der mechanischen Kalibrierung fest — die 200–8000-Steps/s-Konstante ist ein vorläufiger, aber funktionsfähiger Platzhalter.

## Umsetzungsnotizen — Halten im Stillstand (Build 2026-10-07)

- **FastAccelStepper-Falle, im Design nicht vorhergesehen:** Die Engine schaltet den Treiber ab, sobald ihr `_auto_disable_delay_counter` (gesetzt von der letzten Fahrt mit Auto-Enable) abgelaufen ist. `needAutoDisable()` prüft dabei nicht, ob Auto-Enable noch an ist. Ein Umschalten von „aus“ auf „an“ kurz nach einer Fahrt hätte den Treiber also trotzdem abgeschaltet. Deshalb läuft `motorHoldCheck()` beim Einschalten in dieser Reihenfolge: `setAutoEnable(false)` → `disableOutputs()` (setzt den Zähler zurück, wenige Mikrosekunden stromlos) → `enableOutputs()`. Steht auch im Stack-Pack.
- **Sperre (EC-7) zusätzlich abgesichert:** Ist der Slider gesperrt, schaltet `motorHoldCheck()` den Treiber in jedem `loop()`-Durchlauf im Stillstand erneut ab. Das deckt den Fall ab, dass ein Fahrtbefehl seine Sperrprüfung kurz vor der Sperre passiert und den Treiber eingeschaltet hat.
- **Ergänzung in der App:** `useHoldSetting` verwirft einen vorgemerkten Wert spätestens 1,5 s nach einem erfolgreichen Senden (`HOLD_PENDING_TIMEOUT_MS`), auch wenn kein passender Status kam. So bleibt der Schalter nicht auf einem Wert hängen, den der Slider ignoriert hat (z. B. Sperre im selben Moment).

- **BUG-78 behoben (2026-10-07):** `HoldSwitchRow` ist jetzt gesperrt, wenn `holdLocked || disabled` gilt (`src/components/JogControls.tsx`), also auch während Auto-Fahrt inkl. Video-Vor-/Nachlauf und Zeitraffer-Sequenz (neue EC-6). Render-Test `src/components/JogControls.render.test.ts`, rot-geprüft gegen die alte Bedingung `holdLocked`. Firmware unverändert.
