# PROJ-3 — Technisches Design

> Dies ist das technische Design (das WIE) für das Feature. Der Vertrag (WAS) steht in `spec.md`, die Aufgabenliste in `tasks.md`.
> Plattform: **mobile** (Android, React Native) — wie bei PROJ-1/PROJ-2.
> Das Feature spannt zwei Layer: die **App** (React Native, erweitert PROJ-2s `JogControls`-Bereich um einen neuen Auto-Fahrt-Bereich) und die **Firmware** (Layer `firmware`, ESP32/PlatformIO — `docs/stacks/firmware-esp32-tmc2209.md`). Die Grenze ist eine Erweiterung des in PROJ-2 eingeführten BLE-Kommandoprotokolls, plus die erstmalige echte Nutzung der seit PROJ-1 deklarierten, bisher ungenutzten Status-Characteristic.
> Erfordert PROJ-2 (Approved/Deployed) — erweitert dessen Firmware- und App-Code additiv, ändert keine PROJ-1/PROJ-2-Acceptance-Criteria.

## Component Structure (App)

```
RootScreen (PROJ-1, Content-Area erweitert)
+-- ConnectionHeader (PROJ-1, unverändert)
+-- ContentArea (Zustand `connected`)
    +-- JogControls (PROJ-2, additiv erweitert: neue `disabled`-Prop)
    +-- AutoDriveControls (NEU)
        +-- PointButtons ("Als Start setzen" / "Als Ende setzen")
        +-- DurationInput (Sekunden, Zahleneingabe mit Live-Validierung gegen den aus der Distanz berechneten erlaubten Bereich)
        +-- DriveButtonRow ("Start → Ende" / "Ende → Start" — je nach `atStart`/`atEnd` und beiden gesetzten Punkten aktiviert)
        +-- StopButton (nur sichtbar/aktiv während `driving`)
        +-- StatusLine ("Kein Start/Ende gesetzt" / "Bereit" / "Fährt zum Ende…" / "Fährt zum Start…")
```

`AutoDriveControls` wird wie `JogControls` nur im Zustand `connected` gerendert. Beide Komponenten lesen ihren Zustand aus dem neuen `useSliderStatus`-Hook (siehe unten) — während `driving === true` bekommt `JogControls` `disabled={true}` und `AutoDriveControls` zeigt nur den Stopp-Button aktiv (AC-9).

## Erweiterung der App-BLE-Grenze

### Neuer Hook: `useSliderStatus(device)`

Abonniert die seit PROJ-1 deklarierte, bisher ungenutzte Status-Characteristic (Notify) und liefert:

```
{
  hasStart: boolean,
  hasEnd: boolean,
  atStart: boolean,     // Schlitten steht exakt am gesetzten Startpunkt
  atEnd: boolean,       // Schlitten steht exakt am gesetzten Endpunkt
  driving: boolean,     // eine Auto-Fahrt läuft gerade
  distanceSteps: number | null,  // nur gesetzt wenn hasStart && hasEnd
}
```

Ein eigener, fokussierter Hook statt einer Erweiterung von `ConnectionProvider` — derselbe Musterentscheid wie PROJ-2s `useJogState` (siehe Technische Entscheidungen unten). `JogControls` und `AutoDriveControls` abonnieren beide denselben Hook.

### `src/ble/client.ts` — neue Exporte (additiv)

- `sendSetStartCommand(device)` / `sendSetEndCommand(device)` — kein Payload, Write mit Antwort
- `sendAutoDriveCommand(device, direction, durationSeconds)` — `direction` ist `'startToEnd' | 'endToStart'`
- `sendStopCommand(device)` — **wiederverwendet aus PROJ-2**, kein neuer Export nötig (STOP bricht jetzt auch eine laufende Auto-Fahrt ab)
- `subscribeToStatus(device, callback)` — abonniert die Status-Characteristic, parst die Notify-Payload in das obige Objekt

## Grenze zur Firmware (Erweiterung des BLE-Kommandoprotokolls)

**Command-Characteristic** (`6e400002-…`, PROJ-2) bekommt drei neue Opcodes neben den bestehenden JOG (`0x01`) und STOP (`0x05`):

| Opcode | Name | Payload | Übertragungsart | Bedeutung |
|---|---|---|---|---|
| `0x02` | SET_START | keiner | Write mit Antwort | Merkt sich die aktuelle Position als Startpunkt |
| `0x03` | SET_END | keiner | Write mit Antwort | Merkt sich die aktuelle Position als Endpunkt |
| `0x04` | AUTO_DRIVE | 1 Byte Richtung (`0x00`=Start→Ende, `0x01`=Ende→Start) + 2 Byte Dauer in Zehntelsekunden (uint16, little-endian) | Write mit Antwort | Startet die automatische Fahrt |
| `0x05` | STOP | keiner | Write mit Antwort | **Wiederverwendet aus PROJ-2** — bricht jetzt auch eine laufende Auto-Fahrt sofort ab |

Alle drei neuen Opcodes sind *Write mit Antwort*, wie STOP — einmalige, sicherheitsrelevante Befehle verdienen die Bestätigung, anders als JOGs wiederholtes Herzschlag-Muster (siehe Technische Entscheidungen).

**Status-Characteristic** (`6e400003-…`, seit PROJ-1 deklariert, bisher ungenutzt) sendet jetzt echte Notify-Payloads:

| Byte | Inhalt |
|---|---|
| 0 | Flags-Bitfeld: Bit 0 `hasStart`, Bit 1 `hasEnd`, Bit 2 `atStart`, Bit 3 `atEnd`, Bit 4 `driving` |
| 1–4 | Distanz in Steps zwischen Start und Ende (uint32, little-endian) — nur gültig, wenn Bit 0 und Bit 1 beide gesetzt sind |

**Gesendet wird:** nach jedem SET_START/SET_END, nach jedem Motor-Stopp (Jog-Loslassen, Disconnect, Auto-Fahrt-Ankunft am Ziel, Auto-Fahrt-Abbruch per STOP), und einmal direkt nachdem die App die Notification abonniert (üblicher BLE-Musterablauf „Notify-on-Subscribe", damit die App sofort den aktuellen Stand kennt, ohne selbst nachzufragen).

## Firmware-Komponentenstruktur (Erweiterung)

```
firmware/src/ble.cpp (PROJ-1/2, erweitert)
+-- Command-Callback um SET_START/SET_END/AUTO_DRIVE erweitert (neben JOG/STOP)
+-- Status-Characteristic sendet jetzt echte notify()-Aufrufe (Payload aus motor.cpp)
+-- onConnect (PROJ-1, bestehend) ruft zusätzlich motorClearPoints() auf — siehe unten

firmware/src/motor.h / motor.cpp (PROJ-2, erweitert)
+-- motorSetStart() / motorSetEnd() — merkt sich stepper->getCurrentPosition() als Referenzpunkt (nur gültig/aussagekräftig im Stillstand, siehe Technische Entscheidungen)
+-- motorAutoDrive(direction, durationDeciseconds) — berechnet Geschwindigkeit aus eigener Distanz-Kenntnis und Dauer, validiert 200–4000 Steps/s unabhängig von der App, startet moveTo() zum jeweiligen Zielpunkt
+-- motorAutoDriveCheck() — in loop() aufgerufen: erkennt Zielankunft (isRunning() wird false, während intern `autoDriving` gesetzt ist), löst Status-Update aus
+-- motorGetStatus() — liefert die Flags + Distanz für die Status-Characteristic
+-- motorClearPoints() — setzt `hasStart`/`hasEnd` (und damit implizit `atStart`/`atEnd`/`distanceSteps`) zurück; aufgerufen von `onConnect`
+-- motorWatchdogCheck() — erweitert: greift nur noch, wenn NICHT `autoDriving` (EC-4 aus spec.md)
+-- motorStop() — erweitert: setzt auch `autoDriving = false` zurück, egal ob Jog oder Auto-Fahrt gerade lief
```

## Datenmodell

**Kein neues persistentes Datenmodell** — `docs/data-model.md` bleibt unverändert. Start- und Endpunkt sind laut spec.md explizit nicht persistiert (EC-3): reiner Firmware-interner Zustand (zwei Step-Zahlen im RAM des ESP32) für die Dauer der Verbindung, gespiegelt im App-seitigen `useSliderStatus`-Hook als reiner React-State. Verschwindet beim Neustart von App oder ESP32 — nichts, das über eine Sitzung hinaus gespeichert werden müsste (dauerhafte Presets kommen erst mit PROJ-4).

## Abhängigkeiten

- App: keine neue Bibliothek — eine einfache Zahlen-`TextInput` (React-Native-Core) für die Dauer-Eingabe reicht, kein Slider o. Ä. nötig
- Firmware: keine neue Bibliothek — `FastAccelStepper`s `moveTo()`/`getCurrentPosition()`/`isRunning()` stehen bereits seit PROJ-2 zur Verfügung, werden hier erstmals genutzt (verifiziert gegen die vendorte `firmware/.pio/libdeps/esp32dev/FastAccelStepper/src/FastAccelStepper.h`, siehe Technische Entscheidungen)

## Settings the user makes

_Keine — kein Backend, kein Provider-Dashboard betroffen._

## Technische Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Status-Characteristic (seit PROJ-1 deklariert, bisher ungenutzt) bekommt jetzt echte Notify-Payloads (Flags + Distanz) | Die App muss ohne Polling wissen, ob Start/Ende gesetzt sind, ob der Schlitten gerade exakt an einem der beiden Punkte steht, und die gültige Dauer-Spanne berechnen können — Notify ist der dafür vorgesehene BLE-Mechanismus, die Characteristic existiert bereits |
| Zwei neue Opcodes SET_START (`0x02`) / SET_END (`0x03`), kein Payload | Firmware merkt sich `stepper->getCurrentPosition()` als Referenzpunkt — die App muss nie eine Step-Zahl selbst kennen oder mitschicken, die Firmware bleibt einzige Quelle der Wahrheit für Positionen |
| Neuer Opcode AUTO_DRIVE (`0x04`): Richtung + Dauer in Zehntelsekunden, Firmware berechnet die Geschwindigkeit selbst | Firmware kennt die Distanz bereits exakt (aus den selbst gesetzten Start-/Endpunkten) — vermeidet, dass App und Firmware unterschiedliche Vorstellungen von der Distanz haben könnten |
| STOP (`0x05`, aus PROJ-2) wird für den Abbruch einer Auto-Fahrt wiederverwendet, kein neuer Opcode | Gleiche Semantik ("halte sofort an"), unabhängig vom Fahrmodus — ein Handler statt zwei |
| Alle drei neuen Opcodes als Write **mit** Antwort (wie STOP), nicht ohne wie JOG | Einmalige, sicherheitsrelevante Befehle verdienen die Bestätigung — anders als JOGs wiederholtes, verlust-tolerantes Herzschlag-Muster (300ms-Intervall) |
| `moveTo()` (FastAccelStepper) für Auto-Fahrt statt der kontinuierlichen `runForward()`/`runBackward()` aus PROJ-2s Jog | Auto-Fahrt hat ein bekanntes Ziel und eine bekannte Distanz — genau der Anwendungsfall, für den `moveTo()` gedacht ist (als Stub bereits im Firmware-Pack skizziert, von PROJ-2 noch nicht gebraucht) |
| `getCurrentPosition()` wird nur im Stillstand gelesen (nach einem Motor-Stopp), nie während einer laufenden Bewegung | Verifiziert gegen den vendorten Header: „The actual position may be off by the number of steps in the ongoing command" (ESP32/RMT-Implementierung) — die Funktion ist während einer Bewegung nicht präzise, im Stillstand aber exakt. SET_START/SET_END werden ohnehin nur nach einem Jog-Stopp ausgelöst (der Nutzer jogt, lässt los, setzt dann) |
| Watchdog (`motorWatchdogCheck()`, aus PROJ-2) greift während einer Auto-Fahrt nicht — ein neues `autoDriving`-Flag schaltet ihn für diese Zeit stumm | EC-4 (spec.md): Auto-Fahrt erwartet kein fortlaufendes Halte-Signal wie Jog — ein Watchdog-Stopp mitten in einer vom Nutzer selbst ausgelösten, terminierenden Fahrt wäre falsch |
| Firmware erkennt die Zielankunft selbst (`isRunning()` wird `false`, während `autoDriving` gesetzt ist), statt auf ein Signal von der App zu warten | Die Firmware kennt Ziel und Distanz bereits vollständig — sie muss nicht auf die App warten, um zu wissen, dass sie fertig ist |
| Firmware validiert AUTO_DRIVE unabhängig von der App erneut (hasStart/hasEnd, steht exakt am richtigen Punkt, berechnete Geschwindigkeit im Bereich) und ignoriert eine ungültige Anfrage still (kein Fahrtstart) | Verteidigung in der Tiefe, wie schon bei PROJ-2 (z. B. Geschwindigkeits-Klemmung unabhängig von der App) — die App verhindert ungültige Anfragen zwar schon über die UI (aus `useSliderStatus` abgeleitet), die Firmware verlässt sich aber nicht darauf |
| Neuer Hook `useSliderStatus(device)` abonniert die Status-Characteristic, statt `ConnectionProvider` um Auto-Fahrt-spezifischen Zustand zu erweitern | Hält `ConnectionProvider` bei seiner bestehenden Verantwortung (reiner Verbindungs-Lebenszyklus) — dasselbe Muster wie PROJ-2s `useJogState`, ein eigener, fokussierter Hook pro Feature-Zustand |
| `JogControls` bekommt eine neue `disabled`-Prop (aus `useSliderStatus`s `driving`-Flag), statt während Auto-Fahrt unmontiert zu werden | Die Steuerung bleibt sichtbar, nur nicht bedienbar — der Nutzer sieht jederzeit den vollständigen Bildschirm, konsistent mit AC-9 ("reagieren nicht", nicht "verschwinden") |
| `onConnect` (PROJ-1, bestehend) ruft zusätzlich `motorClearPoints()` auf, statt Start/Ende nur beim ESP32-Neustart zu verlieren — und zwar nur beim Übergang von 0 auf 1 verbundene Zentrale, nicht bei jedem Connect | EC-3 (spec.md) verlangt „kein Start/Ende" sowohl nach einem App-Neustart als auch nach einem bloßen Reconnect — reines RAM-Verhalten hätte die Punkte über einen Reconnect hinweg behalten, da der ESP32 dabei nicht neu startet. Ursprünglich bei *jedem* `onConnect` ausgelöst; das ließ aber auch ein unbeteiligtes zweites BLE-Gerät die Punkte mitten in der Sitzung löschen (qa-report.md BUG-6) — auf den 0→1-Übergang eingeschränkt, damit nur eine echte neue App-Sitzung zurücksetzt |

## Open Questions

- [ ] Aus `spec.md` übernommen: genaue min/max-Dauer-Grenzen stehen erst nach der Steps-pro-mm-Kalibrierung fest — betrifft nur die reale mm/s-Bedeutung, nicht die Steps/s-Rechnung selbst
