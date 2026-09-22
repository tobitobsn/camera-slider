# ESP32-Firmware — Schrittmotor über TMC2209 — die konkreten Verfahren

> **Gilt, wenn `.ai-eng-kit` → `layers[].name` == `firmware`.**
> Root: `firmware/`. Sprache: C++ (Arduino-Framework), Build-System: PlatformIO.
> MCU: klassisches ESP32 (ESP32-WROOM-32-Modul, generisches DevKit-Board, 2×19-Pin) — PlatformIO-Board `esp32dev`.
> Motor: 42BYGHM809 (1,7 A/Phase, 0,9°/Schritt = 400 Vollschritte/Umdrehung).
> Treiber: BIGTREETECH TMC2209 V1.3 StepStick (UART + Step/Dir, Pololu-Footprint).

---

## Projekt-Setup (PlatformIO)

```ini
; firmware/platformio.ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
lib_deps =
    teemuatlut/TMCStepper @ ^0.7.3
    gin66/FastAccelStepper @ ^0.31.1
    h2zero/NimBLE-Arduino @ ^2.5.1
```

`FastAccelStepper` statt `AccelStepper`: erzeugt die Step-Pulse über die Hardware-Timer/RMT-Peripherie des ESP32 statt per Software-Polling in `loop()` — bei einem 0,9°-Motor mit hoher Mikroschrittzahl reißt eine software-getaktete Lösung sonst bei höheren Geschwindigkeiten ab.

## Verkabelung TMC2209 ↔ ESP32

| TMC2209-Pin | ESP32-Pin | Zweck |
|---|---|---|
| VM | 12–24 V Netzteil (+) | Motorspannung — **nicht** über den ESP32-5V-Pin |
| GND | gemeinsame Masse mit ESP32 | Motor- und Logik-GND **müssen verbunden sein** |
| VIO | 3V3 | Logikversorgung des Treibers |
| STEP | GPIO (frei wählbar, z. B. 25) | Schrittpuls |
| DIR | GPIO (z. B. 26) | Richtung |
| EN | GPIO (z. B. 27) | Enable, **LOW-aktiv** — HIGH schaltet den Treiber stromlos (wichtig für den Not-Halt) |
| PDN_UART | GPIO (z. B. 16, per 1kΩ-Widerstand) | UART Single-Wire zu TMCStepper — Strom & Modus werden hierüber gesetzt, kein Trimpoti nötig |
| 1A/1B, 2A/2B | Motorspulen (42BYGHM809, 4 Adern) | Spulenpaare per Multimeter/Datenblatt zuordnen, sonst dreht der Motor nicht rund |
| MS1/MS2 | offen lassen | im UART-Modus per Software gesetzt, nicht per Pin |

**Nie Motorstecker bei eingeschaltetem Treiber abziehen/stecken** — das zerstört die TMC2209-Endstufe zuverlässig.

## Treiber per UART konfigurieren (TMCStepper)

```cpp
#include <TMCStepper.h>

#define DRIVER_ADDRESS 0b00
#define R_SENSE 0.11f  // BTT TMC2209 V1.3: 0.11 Ω Sense-Widerstände

TMC2209Stepper driver(&Serial2, R_SENSE, DRIVER_ADDRESS);

void setupDriver() {
  Serial2.begin(115200, SERIAL_8N1, /*RX=*/17, /*TX=*/16);
  driver.begin();
  driver.toff(4);
  driver.rms_current(1700);       // 1,7 A Phasenstrom lt. Datenblatt 42BYGHM809
  driver.microsteps(16);          // 400 Vollschritte × 16 = 6400 Schritte/Umdrehung
  driver.pwm_autoscale(true);     // StealthChop — lautloser Lauf im unteren Geschwindigkeitsbereich
  driver.en_spreadCycle(false);
}
```

`rms_current()` setzt den **RMS**-Strom, nicht den Spitzenstrom — 1700 mA entspricht dem Datenblattwert des 42BYGHM809. Höher als nötig einstellen heizt den Treiber unnötig auf (Kühlkörper ist im Lieferumfang, aber Dauerlast bei >1,4 A RMS ohne Luftstrom im Gehäuse prüfen).

## Bewegungssteuerung (FastAccelStepper)

```cpp
#include <FastAccelStepper.h>

FastAccelStepperEngine engine = FastAccelStepperEngine();
FastAccelStepper *stepper = nullptr;

void setupMotion() {
  engine.init();
  stepper = engine.stepperConnectToPin(25);   // STEP-Pin
  stepper->setDirectionPin(26);
  stepper->setEnablePin(27, /*low_active_out=*/true);
  stepper->setAutoEnable(true);               // schaltet EN nur während einer Fahrt scharf
  stepper->setSpeedInHz(4000);                // Schritte/Sekunde, aus gewünschter mm/s + Spindelsteigung ableiten
  stepper->setAcceleration(8000);
}

// Absolute Zielposition anfahren (Schritte, nicht mm — Umrechnung lebt in der BLE-Kommandoschicht)
void moveTo(int32_t targetSteps) {
  stepper->moveTo(targetSteps);
}
```

**Software-Endanschläge:** ohne physische Endschalter zwei Software-Grenzen (`minSteps`/`maxSteps`) führen, die jeder `moveTo()`-Aufruf clamped, bevor er an den Treiber geht — verhindert, dass ein falsch gesetzter Endpunkt den Schlitten von der Schiene fährt. Physische Endschalter (mechanisch oder optisch) sind eine spätere Hardware-Erweiterung, keine Firmware-Entscheidung.

## BLE-Kommandoschicht (NimBLE)

Ein einziger GATT-Service mit wenigen Characteristics reicht für dieses Produkt — kein Grund für mehrere Services:

```cpp
#include <NimBLEDevice.h>

#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CMD_CHAR_UUID        "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // Write: Befehle
#define STATUS_CHAR_UUID     "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // Notify: Status

// Befehlsformat: 1 Byte Opcode + Payload, z. B.
//   0x01 <int32 steps>            JOG (relative Schritte, Geschwindigkeit aus aktuellem Setting)
//   0x02                          SET_START (aktuelle Position als Startpunkt merken)
//   0x03                          SET_END (aktuelle Position als Endpunkt merken)
//   0x04 <uint16 durationMs>      AUTO_MOVE (Start → Ende in gegebener Dauer)
//   0x05                          STOP (sofortiges Anhalten, EN low halten)
```

Der genaue GATT-Aufbau (Opcodes, Payload-Layout, Notify-Frequenz für Live-Position) wird in `design.md` von PROJ-1 festgelegt, sobald `/architecture` läuft — hier steht nur der Rahmen, damit Firmware und App von Anfang an dasselbe Protokoll annehmen.

**STOP muss unabhängig vom aktuellen Firmware-Zustand funktionieren** — als Interrupt-artiger Pfad, der `stepper->forceStopAndNewPosition()` aufruft und danach `EN` HIGH setzt, nicht als weiterer Eintrag in einer Befehlswarteschlange, die bei einer hängenden Bewegung nicht mehr abgearbeitet wird.

## Kalibrierung / Steps-pro-mm

Die Umrechnung Schritte↔mm hängt von der Mechanik ab (Riemen-Zähnezahl, GT2-Teilung 2 mm, Riemenrad-Zähnezahl, Mikroschrittzahl):

```
steps_per_mm = (Vollschritte_pro_Umdrehung × Mikroschritte) / (Zähnezahl_Riemenrad × Riementeilung_mm)
             = (200 × 16) / (Zähnezahl × 2)
```

Der konkrete Wert ist eine Kalibrierungs-Konstante in der Firmware, kein Architektur-Thema — wird gemessen (Sollstrecke fahren, tatsächliche Strecke messen, Wert korrigieren), sobald die Mechanik steht.

## Sicherheit

- `EN`-Pin HIGH (Treiber aus) im Fehlerfall und beim Boot, bevor der erste Befehl kommt — ein stromloser Motor ist der sichere Default
- Kein Dauerstrom im Stillstand nötig (haltendes Moment optional über `pwm_autoscale`), sonst Wärmeentwicklung unnötig hoch
- BLE-Verbindungsabbruch während einer Fahrt → Firmware stoppt die Bewegung selbstständig nach einem Timeout ohne Heartbeat/Befehl (kein "weiterfahren ins Blaue", wenn die App die Verbindung verliert)
