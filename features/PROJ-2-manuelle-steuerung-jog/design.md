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

## Jog-Zustandsmaschine (App, lokal in `JogControls`)

**Zustände:** `idle` · `jogging_forward` · `jogging_backward` — ein einziges Enum, wie schon bei PROJ-1s Verbindungsstatus, keine unabhängigen Booleans.

**Übergänge:**
- `idle` → (Vorwärts-Taste gedrückt, `onPressIn`) `jogging_forward` — sendet sofort einen JOG-Befehl (Richtung vorwärts, aktuelle Regler-Geschwindigkeit) und startet ein 300ms-Intervall, das denselben JOG-Befehl wiederholt sendet
- `idle` → (Rückwärts-Taste gedrückt) `jogging_backward` — analog
- `jogging_forward` → (Vorwärts-Taste losgelassen, `onPressOut`) `idle` — Intervall wird gestoppt, sofort ein STOP-Befehl gesendet (AC-2)
- `jogging_backward` → (Rückwärts-Taste losgelassen) `idle` — analog
- `jogging_forward` → (Rückwärts-Taste zusätzlich gedrückt, während Vorwärts noch gehalten wird) `idle` — Intervall wird sofort gestoppt, STOP gesendet, **kein** neuer JOG-Befehl für die Gegenrichtung (AC-4/EC-2); erst wenn beide Tasten wieder losgelassen und eine erneut gedrückt wird, geht es weiter
- `jogging_backward` → (Vorwärts-Taste zusätzlich gedrückt) `idle` — analog

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

**Geschwindigkeits-Mapping (Prozent → Steps/s):** linear zwischen `MIN_JOG_SPEED = 200 Steps/s` und `MAX_JOG_SPEED = 4000 Steps/s` (deckt sich mit dem bereits im Firmware-Pack skizzierten `setSpeedInHz(4000)`-Wert als Maximum). 1 % → 200 Steps/s, 100 % → 4000 Steps/s, dazwischen linear interpoliert. **Vorläufig**, bis die Steps-pro-mm-Kalibrierung der Mechanik steht (offene Frage aus `spec.md`) — die Prozent-Skala selbst ändert sich dadurch nicht, nur was ein bestimmter Prozentwert in mm/s tatsächlich bedeutet.

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

| Entscheidung | Begründung | Alternative erwogen | Trade-off | Datum |
|---|---|---|---|---|
| Command-Protokoll: JOG (wiederholt, ohne Antwort) + STOP (einmalig, mit Antwort) statt eines einzigen Befehlstyps | Passt zur Halten-Buttons-UX: JOG ist ein "Herzschlag", der Verlust einzelner Pakete verkraftet; STOP ist sicherheitskritisch und selten, verdient die Bestätigung | Ein einziger Befehlstyp mit Statusfeld | Zwei Opcodes statt einem — minimal mehr Parsing-Code in der Firmware, dafür klarere Zuverlässigkeits-Garantien pro Befehlstyp | 2026-09-23 |
| Watchdog-Guarantee (EC-4): Firmware vergleicht Zeit seit letztem JOG gegen 1000ms (≈3 verpasste 300ms-Intervalle), unabhängig vom offiziellen BLE-Verbindungsstatus | Schützt vor App-Absturz/Hintergrund/Paketverlust, wie in `spec.md` AC-6 gefordert — dieselbe Idee wie PROJ-1s Verbindungs-Robustheit, jetzt für die Motorsteuerung konkret umgesetzt | Nur auf den BLE-Disconnect-Callback verlassen | Ein Disconnect kann Sekunden dauern, bis ihn das Betriebssystem erkennt — der Watchdog reagiert unabhängig davon in ≤1s | 2026-09-23 |
| Disconnect-Guarantee (EC-3): `onDisconnect`-Callback (PROJ-1, bestehend) ruft zusätzlich `motorStop()` auf | Direkte Umsetzung von AC-5 — der Callback existierte in PROJ-1 bereits für das Advertising-Neustarten, bekommt jetzt eine zweite, sicherheitsrelevante Aufgabe | Separater Timeout-Mechanismus statt des bestehenden Callbacks | Keiner — reine Erweiterung eines bestehenden, funktionierenden Callbacks | 2026-09-23 |
| Beide-Tasten-Guarantee (EC-2): rein App-seitig über die Zustandsmaschine durchgesetzt (nie zwei Richtungen gleichzeitig gesendet) | Ein Motor kann physisch ohnehin nicht in zwei Richtungen gleichzeitig laufen — die App verhindert bereits, dass ein widersprüchlicher Befehl das Gerät überhaupt erreicht | Firmware-seitige Prüfung zusätzlich | Einfacher; die Firmware muss keinen Fall behandeln, der wegen der App-Logik nie eintritt | 2026-09-23 |
| `ConnectionProvider`-Context um `device` erweitert, statt eines zweiten, parallelen Wegs an das verbundene Device zu kommen | Eine einzige Quelle der Wahrheit für "welches Device ist verbunden" — konsistent mit dem bestehenden Muster (`state`, `requestScan`) | `JogControls` importiert `ble/client.ts` direkt und hält eine eigene Device-Referenz | Eine zweite Referenz auf dasselbe Device könnte auseinanderlaufen (z. B. nach einem Reconnect) — der Context ist die einzige Stelle, die das schon korrekt trackt | 2026-09-23 |
| Geschwindigkeits-Mapping 1–100 % → 200–4000 Steps/s linear, als vorläufige Konstante | Ermöglicht das Bauen, ohne auf die noch ausstehende Mechanik-Kalibrierung zu warten; reine Zahlenkonstante, leicht später anzupassen | Auf die Kalibrierung warten, bevor PROJ-2 gebaut wird | Die tatsächliche mm/s-Geschwindigkeit ist bis zur Kalibrierung nur eine Schätzung — betrifft nur die Firmware-Konstante, keine App-Logik | 2026-09-23 |
| Slider-Wertebereich 1–100 % (nicht 0–100 %) | Verhindert den Degenerationsfall "Taste gedrückt, aber Geschwindigkeit 0 → sichtbar nichts passiert", ohne dass der Nutzer versteht warum | 0–100 % zulassen | Nutzer kann die Geschwindigkeit nicht auf exakt 0 stellen — unnötig, da Stillstand über Loslassen erreicht wird | 2026-09-23 |
| `onPressIn`/`onPressOut` von React Natives `Pressable` statt einer eigenen Touch-Geste-Logik für EC-1 (Finger aus dem Button gezogen) | `Pressable` feuert `onPressOut` zuverlässig auch beim Herausziehen des Fingers — Plattform-Standardverhalten, keine Extra-Logik nötig | Eigene `PanResponder`-Logik | Keiner — Standardkomponente deckt den Fall bereits ab | 2026-09-23 |

## Offene Fragen

- [ ] Aus `spec.md` übernommen: Exakte Geschwindigkeitsbereiche (mm/s) stehen erst nach der mechanischen Kalibrierung fest — die 200–4000-Steps/s-Konstante ist ein vorläufiger, aber funktionsfähiger Platzhalter.
