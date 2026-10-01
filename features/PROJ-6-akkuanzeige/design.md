# PROJ-6 — Tech Design

> Plattform: **mobile** (Android, React Native) — wie PROJ-1..5. Das Feature spannt drei Ebenen: **Hardware** (Spannungsteiler, vom Nutzer einzubauen), **Firmware** (Layer `firmware`, ESP32/PlatformIO: Messung + Schutz-Stopp) und **App** (Anzeige, Warnung, Sperre).
> Die **Grenze** zwischen Firmware und App ist eine additive Erweiterung der bestehenden Status-Characteristic (`6e400003-…`) um zwei Flag-Bits und zwei Bytes Spannung — dieselbe Erweiterungsart wie bei PROJ-4 und PROJ-5. Kein neuer Opcode, keine neue Characteristic.
> Wegfallende Web-Gates: keine HTTP-Routen, kein Login, keine Datenbank-Zugriffsregeln. Die Eingabevalidierung an der Grenze bleibt: die App verarbeitet nur plausible Spannungswerte (siehe Datenmodell).

## Hardware (vom Nutzer verbaut, 2026-09-30)

```
Akku + (3S, 9,0–12,6 V) ──[ 82 kΩ ]──[ 22 kΩ ]──┬── GPIO 34 (ADC1, reiner Eingang)
                                                 │
                                          [ 22 kΩ ]   ║ C = 100 nF
                                                 │    ║
GND (gemeinsam mit ESP32) ───────────────────────┴────╨
```

- R1 = 82 kΩ + 22 kΩ in Reihe = 104 kΩ (oben), R2 = 22 kΩ (unten) — mit den vorhandenen Bauteilen.
- Teilerfaktor nominell (104 + 22) / 22 ≈ 5,727 → 12,6 V ≙ ca. 2,20 V am Pin, 9,3 V ≙ ca. 1,62 V, 9,0 V ≙ ca. 1,57 V — der ganze Bereich liegt im genauen Teil des ESP32-ADC (bis ca. 2,45 V).
- GPIO 34 ist frei (belegt sind 0 BOOT, 16/17 UART, 25 STEP, 26 DIR, 27 EN) und gehört zu ADC1 — ADC2 ist bei aktivem Bluetooth nicht nutzbar.
- Ruhestrom des Teilers ca. 0,1 mA (12,6 V / 126 kΩ) — vernachlässigbar.

## Component Structure

```
RootScreen (PROJ-1)
+-- ConnectionHeader (PROJ-1, erweitert)
|   +-- BatteryIndicator (NEU) — rechts im Header, nur im Zustand `connected`
|       · Symbol + Prozent („🔋 78 %") oder „🔋 –" (kein Akku / noch kein Wert)
|       · Farbe: normal ≥ 20 %, orange < 20 %, rot < 10 %
|       · abgeschwächt (Deckkraft reduziert) solange der Motor fährt (AC-3)
+-- BatteryLockBanner (NEU) — unter dem Header, nur wenn der Slider gesperrt ist:
|       „Akku leer – bitte laden" (dauerhaft, rot, nicht wegklickbar)
+-- ContentArea (Zustand `connected`)
    +-- JogControls (PROJ-2, erweitert: zusätzlich gesperrt, wenn batteryLocked)
    +-- AutoDriveControls (PROJ-3/4, erweitert: gesperrt bei batteryLocked;
    |     Nachfrage „Akku fast leer – Fahrt trotzdem starten?" vor „Start → Ende"/„Ende → Start" bei < 10 %)
    +-- TimelapseControls (PROJ-5, erweitert: gesperrt bei batteryLocked; dieselbe Nachfrage vor „Zeitraffer starten")
```

Die Sperre wird wie die bestehende gegenseitige Sperre von PROJ-5 in `RootScreen` zusammengeführt: `disabled` für alle drei Bereiche wird um „oder batteryLocked" ergänzt — kein neuer Mechanismus.

## Firmware-Komponentenstruktur (Layer `firmware`)

```
main.cpp loop()
+-- motorWatchdogCheck() / motorAutoDriveCheck() / motorTimelapseMoveCheck()   (unverändert)
+-- batteryUpdate()            (NEU, battery.cpp)
+-- bleNotifyStatusIfChanged() (erweitert: 8-Byte-Payload)

battery.cpp / battery.h (NEU)
+-- batterySetup()      — ADC-Pin konfigurieren (11-dB-Dämpfung, Messbereich bis ca. 2,5 V am Pin)
+-- batteryUpdate()     — alle 200 ms eine Messung (Mittel aus 16 Einzelwerten, kalibrierte Millivolt
|                          des ADC × Teilerfaktor × Kalibrierfaktor) — zwei getrennte Werte:
|   · Anzeigewert: nur aktualisiert, wenn der Stepper steht; gleitender Mittelwert der Ruhemessungen,
|     höchstens alle 10 s neu übernommen, auf 20 mV gerundet (begrenzt Notifies auf ≤ 1 pro 10 s)
|   · Schutzwert: jede Messung, auch unter Last — für den 5-s-Filter des Schutz-Stopps
+-- batteryDisplayMillivolts() — letzter Anzeigewert, 0 = noch kein Wert
+-- batteryIsLocked()          — Sperre aktiv (bis Neustart)

motor.cpp (erweitert)
+-- motorLockout()   (NEU) — setzt das Sperr-Flag und ruft motorStop()
+-- motorJog / motorAutoDrive / motorTimelapseMoveTo — verwerfen jeden Befehl, solange gesperrt
+-- motorGetStatus() — liefert zusätzlich `locked` und `moving` (Stepper läuft)
```

**Schutz-Stopp-Logik (AC-7, AC-8, EC-1, EC-3, AC-11):**
- „Akku erkannt" = Schutzwert ≥ 5,0 V. Darunter: kein Schutz-Stopp, Zähler zurückgesetzt.
- Liegt der Schutzwert ≥ 5,0 V und < 9,3 V, läuft ein Zähler; jede Messung ≥ 9,3 V setzt ihn zurück. Erreicht er 5 s ununterbrochen → `motorLockout()`.
- Gilt in Bewegung **und** im Stillstand (AC-8: auch im Stillstand unter 9,3 V → gesperrt).
- Die Sperre ist ein reiner RAM-Zustand und wird **nur** durch einen Neustart des ESP32 aufgehoben (Akkuwechsel = Neustart, da der ESP32 am Akku hängt). Keine automatische Aufhebung bei Spannungserholung (EC-3).
- Solange gesperrt, prüft `batteryUpdate()` in jedem Durchlauf, ob der Stepper trotzdem läuft, und ruft dann erneut `motorStop()` (siehe Technische Entscheidungen, Race-Garantie).
- Wirkt unabhängig von der App (EC-2): alles läuft in `loop()` auf dem ESP32.

## Grenze zur Firmware (Erweiterung der Status-Characteristic)

Die Status-Characteristic (`6e400003-…`, Notify) wächst von 6 auf **10 Byte** (8 Byte ursprünglich, +2 durch den Refine vom 2026-09-30 — siehe „Erweiterung nach QA"):

| Byte | Inhalt | Neu? |
|---|---|---|
| 0 | Flags: bit0 hasStart, bit1 hasEnd, bit2 atStart, bit3 atEnd, bit4 driving, bit5 timelapseMoving, **bit6 batteryLocked**, **bit7 moving** | bit6/7 neu |
| 1–4 | distanceSteps (uint32 LE) | unverändert |
| 5 | Richtung (0x00 = Ende nach Start) | unverändert |
| **6–7** | **Akkuspannung in Millivolt (uint16 LE)**, Anzeigewert; `0` = noch kein Wert | neu |
| **8** | **Sperrgrund:** `0` = keine Sperre, `1` = Akku leer (AC-7), `2` = Akkumessung gestört (AC-13); andere Werte → wie `0` behandelt | neu (Refine) |
| **9** | **Sekunden bis zur Abschaltung:** `0`–`60` während der Frist nach der Sperre (AC-12), sonst `0` | neu (Refine) |

- `moving` (bit7) = der Stepper bewegt sich gerade (jede Bewegungsart, auch Jog). Die App nutzt es nur für das Abschwächen der Anzeige (AC-3).
- Notify wie bisher nur bei Änderung. Die Spannung ändert sich höchstens alle 10 s und in 20-mV-Schritten; `moving` ändert sich bei jedem Start/Stopp einer Bewegung — ein zusätzliches Notify pro Bewegungswechsel, unkritisch.
- **Rückwärtskompatibel in der App:** Ein 6-Byte-Payload (alte Firmware) wird als `batteryMillivolts = null`, `batteryLocked = false`, `moving = false` gelesen → Anzeige „🔋 –", alles andere wie bisher. Ein 8-Byte-Payload (PROJ-6 vor dem Refine) → Sperrgrund aus bit6 als „Akku leer" abgeleitet, keine Frist. Muster wie bei PROJ-4 (5 → 6 Byte).
- **Alte App (v1.3.0) liest nur die ersten 6 Byte** — längere Payloads schaden ihr nicht (Regression-Lane geprüft).

## Datenmodell

Keine persistierte Entität — `docs/data-model.md` bleibt unverändert. Alle Werte sind flüchtiger Laufzeitzustand.

**App — `SliderStatus` (bestehend, PROJ-3) wird erweitert um:**
- `batteryMillivolts` — ganze Zahl oder `null`. `null`, wenn der Payload keine Bytes 6–7 hat oder der Wert `0` ist (noch kein Wert, EC-5). Werte über 20 000 mV gelten als unplausibel und werden als `null` behandelt.
- `batteryLocked` — ja/nein (bit6)
- `moving` — ja/nein (bit7)

**App — abgeleiteter Akkuzustand (reine Funktion, keine Speicherung):**
- `batteryPercent` — ganze Zahl 0–100 oder `null` („kein Akku"): `null`, wenn `batteryMillivolts` `null` oder < 5000 (AC-11, EC-4, EC-5). Sonst über die Kennlinie unten, begrenzt auf 0–100.
- `batteryLevel` — eine von: `unknown` (Prozent `null`), `ok` (≥ 20), `low` (< 20, orange), `critical` (< 10, rot).

**Kennlinie Spannung → Prozent** (je Zelle = Packspannung ÷ 3, lineare Interpolation zwischen den Stützpunkten; Näherung für Li-Ionen im Ruhezustand):

| Zellspannung | Packspannung | Prozent |
|---|---|---|
| ≥ 4,20 V | ≥ 12,60 V | 100 |
| 4,10 V | 12,30 V | 90 |
| 4,00 V | 12,00 V | 80 |
| 3,90 V | 11,70 V | 65 |
| 3,80 V | 11,40 V | 50 |
| 3,70 V | 11,10 V | 35 |
| 3,60 V | 10,80 V | 20 |
| 3,50 V | 10,50 V | 10 |
| 3,40 V | 10,20 V | 5 |
| ≤ 3,10 V | ≤ 9,30 V | 0 |

0 % fällt damit genau auf die Schutz-Schwelle der Firmware.

**Firmware — Konstanten (in `battery.cpp`, keine Laufzeit-Einstellung):**
- Messpin GPIO 34; Teilerfaktor 126/22; Kalibrierfaktor (Start 1,000, nach der Multimeter-Messung einmal gesetzt, siehe „Settings the user makes")
- Schwellen: „Akku erkannt" 5000 mV, Schutz 9300 mV, Filter 5000 ms
- Messtakt 200 ms, 16 Einzelwerte je Messung, Anzeige-Übernahme höchstens alle 10 s, Rundung 20 mV

## Behaviors & Access

Keine Accounts, kein Backend. Das Feature fügt **keinen** schreibenden Befehl hinzu — der Akkuzustand ist nur lesbar. Schreiben erfordert weiter den verschlüsselten BLE-Link aus PROJ-1/2; der Status (inkl. Akkuwerte, Sperre, Fahrt) ist dagegen wie seit PROJ-3 ohne Pairing per Notify lesbar — keine persönlichen Daten. Die Sperre kann von keiner Seite per BLE aufgehoben werden, nur durch Neustart.

**App-Verhalten:**
- **Anzeige** (AC-1..5, AC-11, EC-4, EC-5): `BatteryIndicator` liest den Status über `useSliderStatus(device)` (bestehendes Muster, eigenes Abo neben den anderen). Abgeschwächt, solange `moving`.
- **Nachfrage** (AC-6, EC-6): Vor dem Senden von AUTO_DRIVE bzw. dem Start des Zeitraffers prüft die jeweilige Komponente `batteryLevel === critical`. Wenn ja: Bestätigungsdialog „Akku fast leer – Fahrt trotzdem starten?" mit „Abbrechen" / „Trotzdem starten". Nur „Trotzdem starten" löst den Befehl aus. Kein Dialog bei `unknown`. Jog fragt nicht (Out of Scope).
- **Sperre** (AC-9): Ist `batteryLocked`, zeigt `RootScreen` das `BatteryLockBanner` und sperrt Jog, Auto-Fahrt (inkl. Setzen und Presets laden) und Zeitraffer-Start über die bestehenden `disabled`-Props. Der Stopp-Button bleibt bedienbar (schadet nicht).
- **Zeitraffer** (AC-10): `useTimelapseSequence` beobachtet `batteryLocked`. Wechselt es während einer laufenden Sequenz auf „ja", endet die Sequenz sofort über den bestehenden Fehlerpfad (`finishRun`) mit „Akku leer – Bewegung gestoppt" — keine weitere Aufnahme, keine Rückfahrt.

## Erweiterung nach QA (Refine 2026-09-30: AC-12, AC-13, EC-7, EC-8 und Low-Bugs)

### Ablauf nach der Sperre (AC-12, EC-8)

```
Sperre ausgelöst (Grund: Akku leer ODER Messung gestört)
  1. Sperr-Flag setzen, Sperrgrund merken, Bewegung stoppen            (wie bisher, motorLockout)
  2. Motortreiber stromlos:  TMC2209 per UART deaktivieren (Treiber-Ausgänge aus)
                             UND EN-Pin (GPIO 27) auf HIGH = Treiber aus
  3. Frist 60 s: BLE bleibt aktiv, Status meldet Sperrgrund + verbleibende Sekunden (1× pro Sekunde)
  4. Nach 60 s: EN-Pin-Zustand für den Tiefschlaf festhalten, ESP32 in den Tiefschlaf ohne Weckquelle
     → aus bis Reset oder Stromunterbrechung (Akkuwechsel)
```

- **Warum der EN-Pin festgehalten werden muss:** Im Tiefschlaf verlieren normale Ausgänge ihren Pegel; ein schwebender EN-Eingang des Treibers könnte ihn wieder einschalten. GPIO 27 ist RTC-fähig, sein HIGH-Pegel wird über die Halte-Funktion des ESP32 in den Tiefschlaf hinübergerettet. Zusätzlich ist der Treiber per UART deaktiviert (doppelte Absicherung, solange der Treiber Logik-Versorgung hat).
- **Weckquelle:** keine. Der ESP32 wacht nur durch Reset oder Neustart der Versorgung auf — beides bedeutet, dass der Nutzer bewusst eingreift (Akkuwechsel, Laden).
- **EC-8:** Die Frist sendet den Status weiter; eine Verbindung in dieser Zeit bekommt beim Abonnieren sofort Sperrgrund und Restsekunden (bestehender Mechanismus Notify-on-Subscribe).
- **Restverbrauch** im Tiefschlaf: Step-down-Wandler (Leerlaufstrom je nach Modul 0,1–5 mA), Spannungsteiler (ca. 0,1 mA), Treiber-Versorgung (wenige mA) — bekannte Grenze laut spec.md Out of Scope.

### Fehlererkennung der Messung (AC-13, EC-7)

- `battery.cpp` merkt sich **„Akku seit Start erkannt"** (Ja/Nein, RAM, gesetzt nach insgesamt 5 Messwerten ≥ 5000 mV seit dem Start — gezählt, nicht am Stück, nie zurückgesetzt. BUG-13: ein einzelner Störwert reicht nicht; NEU-A: ein schon beim Einschalten wackelnder Kontakt wird trotzdem erkannt).
- Ist er gesetzt und liegt der Schutzwert **5 s ununterbrochen unter 5000 mV** → Sperre mit Grund „Messung gestört" (derselbe Ablauf wie oben).
- Ist er nicht gesetzt (Start im USB-Betrieb, EC-7) → Werte < 5000 mV bedeuten weiter „kein Akku": keine Sperre, keine Abschaltung.
- **Ein gemeinsamer Zähler „unsicher"** (geändert nach QA BUG-8, 2026-10-01): Jede Messung, die „leer" (5,0–9,3 V) **oder** „gestört" (< 5 V nach erkanntem Akku) ist, zählt weiter; nur eine Messung ≥ 9,3 V (oder < 5 V ohne erkannten Akku) setzt ihn zurück. Nach 5 s → Sperre. Grund: „Messung gestört", wenn die Strecke mindestens einen Wert < 5 V enthielt, sonst „Akku leer". Vorher waren die Zähler getrennt — ein Wackelkontakt bei leerem Akku hat sie gegenseitig zurückgesetzt und den Schutz ausgehebelt.

### App

- **`SliderStatus`** zusätzlich: `lockReason` — eines von `none`, `lowBattery`, `measurementFault` (aus Byte 8; fehlt Byte 8, aber bit6 gesetzt → `lowBattery`), und `shutdownSeconds` — ganze Zahl 0–60 oder `null` (aus Byte 9; `null` ohne Byte 9 oder bei `0`).
- **`BatteryLockBanner`** bekommt Grund und Restsekunden:
  - `lowBattery`: Titel „Akku leer – bitte laden"
  - `measurementFault`: Titel „Akkumessung gestört – bitte Verkabelung prüfen"
  - mit Restsekunden: Zeile „Slider schaltet sich in N s ab" (N zählt live mit, 1× pro Sekunde vom Slider gemeldet); danach bricht die Verbindung ab und die App zeigt ihren normalen Zustand für eine verlorene Verbindung
  - Text „Bitte schalte den Slider aus und lade den Akku" als Hinweis auf den Restverbrauch
- Die Sperre in `RootScreen`/`TimelapseControls` hängt weiter an `batteryLocked` (bit6) — unabhängig vom Grund.

### Low-Bugs aus der QA (ohne Spec-Änderung)

| Bug | Lösung |
|---|---|
| BUG-3 — gemischter Anzeigewert beim Wechsel USB ↔ Akku | Der Ruhe-Mittelwert wird verworfen und neu begonnen, sobald eine Messung auf die andere Seite von 5000 mV wechselt; der erste Wert nach dem Wechsel wird sofort übernommen |
| BUG-4 — Presets speichern/löschen bei Sperre gesperrt | `AutoDriveControls` bekommt eine eigene Angabe „Bewegung gesperrt" (Akku-Sperre), die nur Bewegungs-Auslöser, Setzen und Preset laden sperrt; „Als Preset speichern" und „Löschen" bleiben bedienbar. Die bestehende Sperre während eines Zeitraffers bleibt wie sie ist |
| BUG-5 — Zeitraffer-Start über offenen Dialog trotz Sperre | `useTimelapseSequence.start()` prüft die Sperre selbst und startet nicht, sondern meldet sofort „Akku leer – Bewegung gestoppt" bzw. „Akkumessung gestört – …" |
| BUG-6 — Rundung über die 5000-mV-Grenze | Die Anzeige-Rundung überschreitet die Grenze nie: ein ungerundeter Wert unter 5000 mV wird höchstens auf 4980 mV gerundet |
| BUG-7 — Plausibilität / Doku | App-Grenze für plausible Werte von 20 000 auf 13 500 mV (3S max. 12 600 mV + Toleranz); darüber „🔋 –". Behaviors-&-Access-Satz zum „verschlüsselten Link" korrigiert: der Status (inkl. Akkuwerte) ist ohne Pairing per Notify lesbar — enthält keine persönlichen Daten |

## Dependencies

Keine neuen Pakete — App: bestehende React-Native-Mittel (`Alert` für die Nachfrage); Firmware: ADC-Funktionen des Arduino-ESP32-Kerns (kalibrierte Millivolt-Messung, Pin-Dämpfung).

## Settings the user makes

| Setting | Where | When | Value | Why | → AC |
| --- | --- | --- | --- | --- | --- |
| ~~Spannungsteiler einbauen~~ (erledigt 2026-09-30) | Hardware: Akku-Plus → 82 kΩ → 22 kΩ → GPIO 34 → 22 kΩ → GND, 100 nF parallel zum unteren 22 kΩ, gemeinsame Masse | now | siehe Abschnitt „Hardware" | ohne ihn misst die Firmware < 5 V → „kein Akku", Feature inaktiv | AC-1..11 |
| Kalibrierfaktor bestimmen | Akkuspannung mit Multimeter messen, gleichzeitig den Wert aus dem Serial-Monitor (`battery: … mV`) ablesen, Verhältnis an `/build` durchgeben; danach Firmware neu flashen | now | Multimeter-Wert ÷ Firmware-Wert (typisch 0,95–1,05) | ADC-Toleranz und Widerstandstoleranz summieren sich; ohne Kalibrierung kann der Schutz-Stopp einige Zehntel Volt zu früh oder zu spät auslösen | AC-1, AC-7 |

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| --- | --- | --- | --- | --- |
| Akkuwert in der bestehenden Status-Characteristic (6 → 8 Byte) | Ein Abo, ein Decoder, dasselbe additive Erweiterungsmuster wie PROJ-4/5; alte Firmware bleibt lesbar | Eigene Battery-Characteristic (bzw. die BLE-Standard-„Battery Service") | Status-Notify wird etwas häufiger (Spannung ≤ 1× pro 10 s, `moving` pro Bewegungswechsel) | 2026-09-30 |
| Firmware überträgt Millivolt, die App rechnet in Prozent um | Kennlinie und Warnschwellen sind Anzeige-Logik, in der App leicht anpassbar und testbar; die Firmware braucht nur Volt für den Schutz-Stopp | Prozent in der Firmware berechnen | Kennlinie existiert nur in der App — ein zweiter Client müsste sie nachbauen (gibt es nicht) | 2026-09-30 |
| Anzeigewert nur im Stillstand, Schutzwert auch unter Last (zwei getrennte Werte) | Anzeige springt nicht bei Lastspitzen (AC-3); Schutz muss auch während der Fahrt greifen (AC-7) | Ein einziger gefilterter Wert für beides | Etwas mehr Firmware-Logik | 2026-09-30 |
| Schutz-Stopp über „5 s ununterbrochen < 9,3 V" (Zähler, bei jeder Messung ≥ 9,3 V zurückgesetzt) | Filtert Einbrüche beim Anfahren mit 8000 Steps/s (EC-1), greift bei echter Entladung trotzdem zuverlässig | Mittelwert über 5 s | Ein tatsächlich leerer Akku, der unter Last kurz über 9,3 V springt, verzögert den Stopp — unkritisch, da er im Stillstand sofort wieder zählt | 2026-09-30 |
| **Race-Garantie für die Sperre:** Sperr-Flag wird vor `motorStop()` gesetzt; jede Bewegungsfunktion prüft es zuerst; solange gesperrt, stoppt `batteryUpdate()` in jedem `loop()`-Durchlauf einen trotzdem laufenden Stepper erneut | BLE-Befehle laufen im NimBLE-Task, die Messung in `loop()` — ein Befehl, der die Prüfung genau vor dem Setzen des Flags passiert hat, könnte sonst eine Bewegung nach dem Stopp starten | Mutex zwischen den Tasks | Eine im Extremfall bis zu einem `loop()`-Durchlauf (< 1 ms) laufende Bewegung, dann gestoppt | 2026-09-30 |
| Sperre nur im RAM, Aufhebung nur durch Neustart | Spec-Entscheidung (EC-3); Akkuwechsel startet den ESP32 ohnehin neu | Persistente Sperre im Flash | Ein Neustart ohne Akkuwechsel (z. B. Reset-Taste) hebt die Sperre auf — bei leerem Akku sperrt der nächste 5-s-Zyklus sofort wieder | 2026-09-30 |
| Kalibrierte Millivolt-Messung des ESP32-Kerns, 16-fach gemittelt, 100 nF am Pin | Nutzt die werksseitige ADC-Kalibrierung des Chips; Mittelung und Kondensator glätten Motorstörungen | Rohwerte + eigene Kennlinie des ADC | Nichtlinearität des ESP32-ADC am Rand des Bereichs — der Messbereich (1,57–2,20 V) liegt im gut linearen Teil |
| Teiler 104 kΩ / 22 kΩ (82 k + 22 k in Reihe oben) statt 82 k / 22 k | Mit 82 k / 22 k läge 12,6 V bei ca. 2,67 V am Pin, oberhalb des genauen ADC-Bereichs (bis ca. 2,45 V) — die Anzeige wäre ab ca. 65 % ungenauer; mit den vorhandenen Bauteilen lässt sich das ohne Kosten vermeiden | 82 kΩ / 22 kΩ | Ein Widerstand mehr auf der Platine | 2026-09-30 | 2026-09-30 |
| Kalibrierfaktor als Firmware-Konstante (Neu-Flashen nötig) | Einmalige Kalibrierung, kein zusätzlicher Befehl und keine Einstellung in der App nötig | Kalibrierung per App-Befehl, im Flash gespeichert | Änderung nur per Flash — für einen Einzelaufbau vertretbar | 2026-09-30 |
| Kennlinie als Stützpunkt-Tabelle mit linearer Interpolation, 0 % = Schutz-Schwelle | Einfach, testbar, ausreichend genau für eine Anzeige; 0 % entspricht dem Moment, in dem der Slider stoppt | Rein lineare Umrechnung 9,3–12,6 V | Näherung — tatsächliche Kapazität hängt von Zellen, Alter und Temperatur ab | 2026-09-30 |
| Nach der Sperre: Treiber per UART deaktivieren + EN-Pin HIGH, 60 s Frist mit BLE, dann Tiefschlaf ohne Weckquelle (AC-12) | Senkt den Verbrauch von ca. 100 mA (ESP32 + BLE + Treiber) auf den Rest von Wandler, Teiler und Treiber-Versorgung; die Frist lässt die App den Grund zeigen | Light-Sleep mit periodischem Aufwachen; nur Sperre ohne Abschaltung | Nach dem Tiefschlaf ist der Slider „aus", bis der Nutzer eingreift — gewollt | 2026-09-30 |
| EN-Pin (GPIO 27, RTC-fähig) im Tiefschlaf per Halte-Funktion auf HIGH | Ohne Halten würde der Pin schweben und könnte den Treiber wieder einschalten (Motor bestromt, Verbrauch steigt) | Nur UART-Deaktivierung | Keine | 2026-09-30 |
| Sperrgrund und Restsekunden als Bytes 8 und 9 im Status (10 Byte) | Die App braucht den Grund (AC-13-Meldung) und einen verlässlichen Countdown auch bei später Verbindung (EC-8); ein App-seitiger Countdown wäre nach einer Neuverbindung falsch | Countdown in der App ab Erkennen der Sperre | 1 Notify pro Sekunde während der 60 s | 2026-09-30 |
| „Akku seit Start erkannt" als Kriterium für einen Messfehler (AC-13) | USB und Akku gehen nicht gleichzeitig — ein Abfall unter 5 V ohne Neustart kann nur ein Fehler sein; USB-Start (EC-7) bleibt unberührt | Pull-down-/Leerlauf-Erkennung am Pin in Hardware | Ein echter Akku-Ausfall bei weiterlaufendem ESP32 ist physikalisch nicht möglich, daher kein Fehlalarm-Risiko aus dieser Richtung | 2026-09-30 |
| Ein gemeinsamer Zähler „unsicher" (leer oder gestört) statt zwei getrennter (BUG-8) | Alle Werte der Strecke liegen unter 9,3 V — das ist der Auslöser von AC-7; getrennte Zähler setzen sich bei Wackelkontakt gegenseitig zurück und schützen nie | Getrennte Zähler (bisher) | Bei gemischter Strecke sperrt es nach 5 s Gesamtdauer, also ggf. früher als „5 s < 5 V" — Richtung sicher | 2026-10-01 |
## Open Questions

- [x] Hängt der ESP32 am Akku (dann ist Akkuwechsel = Neustart, wie angenommen) oder separat versorgt? Falls separat: Aufhebung der Sperre nur über die Reset-Taste — am Aufbau zu prüfen → Ja, über Step-down (spec.md, 2026-09-30)
- [ ] Reicht der 16-fache Mittelwert gegen Störungen des Schrittmotortreibers, oder braucht es mehr Filterung? Erst am Gerät messbar

## Umsetzungshinweise (`/build`, 2026-09-30)

- **Abweichung:** `TimelapseControls` hat keine `disabled`-Prop. Die Sperre des Zeitraffer-Starts bei `batteryLocked` sitzt deshalb in dessen eigener Startbedingung (`startEnabled`), nicht in `RootScreen` — gleiche Wirkung (AC-9).
- **Nachfrage-Dialog:** eine gemeinsame Funktion `confirmIfBatteryCritical()` in `src/components/battery.ts`, genutzt von `AutoDriveControls` und `TimelapseControls` (zwei Aufrufer).
- **„Orange" bei < 20 %** ist das Amber-Akzent-Token `colors.primary` — kein eigener Farbwert im Design-System.
- **Kalibrierung:** Faktor 0,993 (Multimeter 12 200 mV ÷ Firmware 12 280 mV im Akkubetrieb). Da USB und Akku nicht gleichzeitig angeschlossen werden können, wurde der Firmware-Wert per BLE vom Mac gelesen (die Status-Characteristic ist ohne Pairing per Notify lesbar).
- **Refine-Build (2026-09-30):** Ebenen 4–5 umgesetzt (T12–T18). Der Treiber wird nach der Sperre über `setAutoEnable(false)` + `disableOutputs()` + EN-Pin HIGH + `toff(0)` abgeschaltet; im Tiefschlaf hält `gpio_hold_en` + `gpio_deep_sleep_hold_en` den EN-Pin auf HIGH. Hardware-Test T19: der Schlitten lässt sich nach der Abschaltung nicht schieben — identisch zum komplett stromlosen Slider, also mechanisch (Rastmoment/Antrieb), nicht elektrisch. Damit ist die offene Frage „läuft der Motor stromlos frei" für diesen Aufbau mit „nein, aus mechanischen Gründen" beantwortet (Spec-Pflege über `/refine` oder `/qa`).
- **Build-Hinweis:** Gradle hat das JS-Bundle der Release-App nach Code-Änderungen nicht immer neu erzeugt; `./gradlew assembleRelease --rerun-tasks` erzwingt es. Vor der Installation prüfen, ob neue Bezeichner im Bundle stehen.
- **Bugfix-Build nach zweitem QA-Lauf (2026-10-01):** BUG-8 gemeinsamer Unsicher-Zähler (`battery.cpp` `updateProtection`); BUG-9 `gpio_hold_dis` + `gpio_deep_sleep_hold_dis` am Anfang von `motorSetup()`; BUG-10 Countdown-Start über eigenes Flag statt 0-Sentinel; BUG-11 eigener Hinweistext bei Messfehler (Verkabelung prüfen) — die zweizeilige Darstellung „Akku leer – bitte laden" + „Slider schaltet sich in N s ab" bleibt wie entschieden; BUG-13 „Akku erkannt" erst nach 1 s ≥ 5000 mV. BUG-12 (EC-4 ↔ AC-13) ist eine Spec-Frage für `/refine`. Geprüft per Node-Nachbau (`scratchpad/sim8.js`): Wackelkontakt 9000/0 mV, Zufallswerte und „4 s leer + 1× 0" sperren jetzt nach 5 s mit Grund „gestört"; EC-1, EC-7 und der Einzelspike sperren nicht.
- **Nachbesserung nach Nachtrag 3 (2026-10-01):** NEU-A — „Akku erkannt" zählt jetzt 5 Messwerte ≥ 5000 mV seit dem Start statt 1 s am Stück; ein ab dem Einschalten wackelnder Kontakt bei leerem Akku sperrt dadurch nach ca. 6 s (Simulation `scratchpad/sim9.js`: 9000/0 mV im 200-ms-Takt, 500/500 und 800/200 ms). Bekannte Grenze: fünf verstreute Störspitzen an einem offenen Pin würden im USB-Betrieb sperren — mit dem verbauten 22-kΩ-Pull-down nicht realistisch. NEU-C — `motorSetup()` treibt EN zuerst HIGH, erst dann wird der Hold freigegeben.
