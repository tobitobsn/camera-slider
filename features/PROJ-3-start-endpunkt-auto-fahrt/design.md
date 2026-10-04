# PROJ-3 — Technisches Design

> Dies ist das technische Design (das WIE) für das Feature. Der Vertrag (WAS) steht in `spec.md`, die Aufgabenliste in `tasks.md`.
> Plattform: **mobile** (Android, React Native) — wie bei PROJ-1/PROJ-2.
> Das Feature spannt zwei Layer: die **App** (React Native, erweitert PROJ-2s `JogControls`-Bereich um einen neuen Auto-Fahrt-Bereich) und die **Firmware** (Layer `firmware`, ESP32/PlatformIO — `docs/stacks/firmware-esp32-tmc2209.md`). Die Grenze ist eine Erweiterung des in PROJ-2 eingeführten BLE-Kommandoprotokolls, plus die erstmalige echte Nutzung der seit PROJ-1 deklarierten, bisher ungenutzten Status-Characteristic.
> Erfordert PROJ-2 (Approved/Deployed) — erweitert dessen Firmware- und App-Code additiv, ändert keine PROJ-1/PROJ-2-Acceptance-Criteria.
> **Erweiterung 2026-10-01 — Videoaufnahme (AC-13 bis AC-29, EC-5 bis EC-10):** reine App-Erweiterung, **keine Firmware-Änderung**, kein neuer BLE-Opcode. Beschrieben im Abschnitt „Videoaufnahme während der Auto-Fahrt" am Ende dieses Dokuments; alles davor beschreibt den unveränderten Stand von AC-1 bis AC-12.

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
+-- motorAutoDrive(direction, durationDeciseconds) — berechnet Geschwindigkeit aus eigener Distanz-Kenntnis und Dauer, validiert 200–8000 Steps/s unabhängig von der App, startet moveTo() zum jeweiligen Zielpunkt
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
| Der angezeigte erlaubte Dauer-Bereich rundet die Untergrenze auf, die Obergrenze ab (`ceilToDeciseconds`/`floorToDeciseconds`); die automatisch eingetragene Mindestdauer wird aufgerundet | `toFixed(1)` rundete zum nächsten Zehntel und nannte ungültige Grenzen (BUG-16/18) |
| Keine automatische Korrektur mehr bei Distanzänderung, keine Schutzphase, kein Timer. Ist die Dauer zu kurz, leer oder unlesbar, zeigt `AutoDriveControls` „Zu kurz für diese Strecke — Minimum X s" (bzw. „Keine gültige Dauer") mit Button „Minimum übernehmen" (`showDurationTooShort`, `handleUseMinimumDuration`); AC-11 (Korrektur beim Verlassen des Felds) bleibt | Die automatische Überschreibung musste Nutzer-Änderungen von der Zwischen-Distanz des Preset-Ablaufs unterscheiden und erzeugte über fünf QA-Runden neue Rennen (BUG-24, 27, 29–37). Die sichtbare Meldung löst den Kern von BUG-19 („stumm gesperrt") ohne Raten; Preset-Dauern werden nie angefasst |

## Videoaufnahme während der Auto-Fahrt (Erweiterung 2026-10-01)

Deckt AC-13 bis AC-29 und EC-5 bis EC-10 ab. Grundlage: die mit PROJ-5 bereits eingebundene Kamera-Bibliothek `react-native-vision-camera` **5.2.3**. Alle unten genannten Fähigkeiten wurden gegen deren installierte Typdefinitionen und den Android-Quellcode geprüft (`node_modules/react-native-vision-camera/src/specs/…`, `android/…/HybridCameraController.kt`), nicht aus dem Gedächtnis.

### Was die Bibliothek auf Android hergibt (geprüft)

| Bedarf | Verfügbar über | Ergebnis |
|---|---|---|
| Video aufnehmen, stoppen, Datei erhalten | Video-Output der Kamera + „Recorder" (Start mit Rückmeldung „fertig" und „Fehler", Stopp, Abbruch) | ✅ Datei ist immer `.mp4` |
| Ton an/aus | Option „Audio aktivieren" am Video-Output, Mikrofon-Berechtigungs-Hook der Bibliothek | ✅ |
| Auflösung | Ziel-Auflösung am Video-Output; die vom Objektiv unterstützten Video-Auflösungen sind abfragbar | ✅ |
| Bildrate | Bildraten-Vorgabe an die Kamera-Sitzung; pro Objektiv abfragbar, welche fps unterstützt werden | ✅ |
| Stabilisierung | Stabilisierungs-Vorgabe an die Sitzung (aus / „standard"); pro Objektiv abfragbar, ob unterstützt — nur über „standard", „automatisch" meldet Android immer als unterstützt und schaltet nichts ein (QA BUG-46, 2026-10-02) | ✅ |
| Objektiv | Liste aller Kameras mit Typ (Weitwinkel / Ultraweitwinkel / Tele) und Position (vorn/hinten) | ✅ sofern der Hersteller die Objektive einzeln freigibt |
| Fokus + Belichtung + **Weißabgleich** per Tippen sperren | „Fokussieren auf Punkt" mit Modus „gesperrt" und ohne automatisches Zurücksetzen, für alle drei Messarten (AF/AE/AWB), die das Objektiv unterstützt; „Fokus zurücksetzen" hebt die Sperre auf | ✅ — beantwortet die Open Question zum Weißabgleich: er wird mitgesperrt, wo das Objektiv AWB-Messung unterstützt |
| Manuelle ISO/Verschlusszeit, direkte Sperr-Befehle | in der Bibliothek ausdrücklich „nur iOS" | ❌ — passt zum Out of Scope der Spec |

### Kamera-Besitz (EC-10)

Android erlaubt nur **eine** aktive Kamera-Sitzung. Die App bekommt deshalb eine einzige, eindeutige Regel, abgeleitet allein aus dem gemerkten Schalter „Video aufnehmen":

- **Schalter an** → Besitzer ist die Auto-Fahrt. Nur ihre Vorschau ist aktiv. Der Zeitraffer-Abschnitt rendert keine Kamera, zeigt „Kamera wird für Video genutzt — „Video aufnehmen" ausschalten, um den Zeitraffer zu nutzen", und sein Start-Button ist gesperrt.
- **Schalter aus** → Besitzer ist der Zeitraffer, exakt wie heute (PROJ-5 unverändert). Die Auto-Fahrt rendert keine Kamera.

Der Schalter selbst ist gesperrt, solange eine Zeitraffer-Sequenz läuft (EC-9) oder eine Fahrt mit Video läuft (AC-28) — so kann der Besitz nie mitten in einer Aufnahme wechseln.

### Component Structure (App) — Erweiterung

```
RootScreen (erweitert)
+-- useVideoSettings()  (NEU, einmal hier — gemerkte Video-Einstellungen, liefert auch den Kamera-Besitz)
+-- useVideoCamera(…)   (NEU, einmal hier — Berechtigungen, Objektive, Formate, Video-Output, Sperre)
+-- useVideoDrive(…)    (NEU, einmal hier — Ablauf einer Fahrt mit Video, siehe Zustandsmodell)
+-- JogControls         (disabled zusätzlich, solange useVideoDrive nicht „bereit" ist — auch im Vor-/Nachlauf, in dem die Firmware nicht „driving" meldet)
+-- AutoDriveControls   (erweitert)
|   +-- … bestehende Teile (Punkte, Dauer, Fahrt-Buttons, Stopp, Status, Presets) unverändert
|   +-- VideoToggle            „Video aufnehmen" (Schalter)
|   +-- ExpectedVideoLength    „Videolänge ca. X s" = Dauer + 4 s (AC-29), nur bei Schalter an und gültiger Dauer
|   +-- VideoPanel (NEU, nur bei Schalter an)
|   |   +-- VideoPermissionHint   Kamera fehlt / Mikrofon fehlt (bei Ton an) — Anfragen bzw. „Einstellungen öffnen", plus Hinweis „oder Ton ausschalten" (AC-20)
|   |   +-- VideoPreview          Kamera-Vorschau, Tippen = sperren (AC-25), Sperr-Markierung am Tipp-Punkt + Button „Auto"
|   |   +-- RecordingIndicator    roter Punkt „REC", Aufnahmedauer mm:ss, Phase „Vorlauf" / „Fahrt" / „Nachlauf" (AC-16)
|   |   +-- VideoSettings         Ton (Schalter) · Format (Auswahl „1080p · 30 fps") · Objektiv (Auswahl, nur bei >1) · Stabilisierung (Schalter, nur wenn unterstützt)
|   +-- Fahrt-Buttons            bei Schalter an → starten useVideoDrive statt direkt AUTO_DRIVE
+-- TimelapseControls  (erweitert: neue Prop „Kamera wird für Video genutzt" → keine Vorschau, Hinweis, Start gesperrt)
```

`useVideoDrive` sitzt — wie `useTimelapseSequence` — in `RootScreen`, weil sein „beschäftigt"-Zustand Jog, Auto-Fahrt und Zeitraffer gleichzeitig sperren muss. Die Fahrt-Buttons, der Stopp-Button und die Video-Teile in `AutoDriveControls` bekommen seine Schnittstelle als Props. `VideoPanel` und seine Teile kommen in eine **eigene Datei** (`AutoDriveControls.tsx` hat bereits ~960 Zeilen).

### Datenmodell: Video-Einstellungen (lokal)

Ein einziger Datensatz im AsyncStorage unter dem Schlüssel `camera-slider.video-settings` (Namensschema wie `camera-slider.presets`). Gehört dem Nutzer, liegt nur auf dem Handy, bleibt bis zur Deinstallation der App. Keine personenbezogenen Daten.

| Feld | Typ | Werte | Standard |
|---|---|---|---|
| Schema-Version | Zahl | `1` | 1 |
| Video aufnehmen | Ja/Nein | — | Nein |
| Ton | Ja/Nein | — | Ja |
| Auflösung | Auswahl | `720p` (1280×720), `1080p` (1920×1080), `2160p` (3840×2160) | `1080p` |
| Bildrate | Zahl | 24, 25, 30, 50, 60 | 30 |
| Objektiv | Auswahl | `wide` (Weitwinkel), `ultraWide` (Ultraweitwinkel), `tele` (Tele) | `wide` |
| Stabilisierung | Ja/Nein | — | Nein |

- **Gespeichert wird das Objektiv als Typ, nicht als Geräte-ID** — so passt der Wert auch nach einem Handywechsel noch, oder fällt sauber auf den Standard zurück.
- **Laden:** fehlt der Datensatz, ist er nicht lesbar oder hat ein Feld einen unbekannten Wert → das betroffene Feld bekommt seinen Standard (die übrigen bleiben). Kein Fehlerdialog.
- **Nicht verfügbar auf diesem Gerät (AC-26):** Ist das gemerkte Objektiv nicht vorhanden → `wide`. Ist die gemerkte Kombination aus Auflösung + fps auf dem gewählten Objektiv nicht verfügbar → 1080p/30, falls verfügbar, sonst die erste angebotene Kombination. Der gemerkte Wert wird dabei **nicht** überschrieben, solange der Nutzer nichts ändert (ein kurzzeitig anderes Objektiv soll die Wahl nicht löschen).
- **Schreiben:** bei jeder Änderung durch den Nutzer der ganze Datensatz (Lesen-Ändern-Schreiben wie bei den Presets).
- **Nicht gespeichert:** die Fokus-/Belichtungssperre (nur Sitzung, AC-26), aufgenommene Videos (liegen in der Galerie, gehören danach nicht mehr zur App).

### Angebotene Formate und Objektive

- **Objektive (AC-23):** alle Rückkameras, deren Typ Weitwinkel, Ultraweitwinkel oder Tele ist; pro Typ die erste. Eine logische Multi-Kamera (VisionCamera-Typ `dual`, `dual-wide`, `triple`, `quad`) gilt als Weitwinkel und hat Vorrang vor einer einzelnen Weitwinkel-Kamera — viele Hersteller geben die Hauptkamera nur so frei (QA BUG-70). Gibt der Hersteller nur eine Rückkamera frei, gibt es genau ein Objektiv → keine Auswahl angezeigt. Linsen, die nur über den Zoom der Multi-Kamera erreichbar sind (z. B. Tele beim Galaxy S24), werden nicht angeboten.
- **Formate (AC-22):** Kandidaten sind für das gewählte Objektiv die Kombinationen aus den drei Standard-Auflösungen (nur solche, die das Objektiv für Video meldet) und den fünf Standard-Bildraten (nur solche, die das Objektiv meldet). Anzeige z. B. „4K · 25 fps", sortiert nach Auflösung, dann fps. Bewusst keine exotischen Seitenverhältnisse oder Zwischenwerte.
- **Vorab-Abfrage (QA BUG-47, 2026-10-02):** Das Objektiv meldet Bildraten nur pro Objektiv, nicht pro Auflösung — 4K geht oft nur bis 30 fps, und die Kamera wählt dann still die nächstliegende Bildrate. Deshalb fragt die App bei jedem Objektiv- bzw. Stabilisierungswechsel für jeden Kandidaten bei der Kamera nach (VisionCamera `resolveConstraints` mit denselben Outputs — Vorschau + Video in der Ziel-Auflösung — und derselben Stabilisierung wie die echte Sitzung), welche Bildrate tatsächlich käme, und bietet nur die Kombinationen an, bei denen genau die gewählte herauskommt. Bis die Antwort da ist, ist die Format-Auswahl kurz ausgeblendet; die Sitzung nutzt solange das gemerkte Format aus den Kandidaten.
- **Sicherheitsnetz:** Landet die echte Sitzung trotzdem auf einer anderen Bildrate (`onSessionConfigSelected`), zeigt die App „60 fps nicht verfügbar — es wird mit 30 fps aufgenommen", statt still abzuweichen.
- **Stabilisierung (AC-24):** Schalter nur sichtbar, wenn das gewählte Objektiv Video-Stabilisierung meldet (Modus „standard"). An = „standard" (schaltet auf Android die Stabilisierung wirklich ein), aus = „aus".
- **Lehnt die Kamera eine Kombination trotzdem ab** (Fehler beim Konfigurieren der Sitzung) → zurück auf den Standard aus der Liste oben, Hinweis „Format nicht verfügbar — auf 1080p · 30 fps zurückgesetzt".
- Jede Änderung an Objektiv, Format oder Stabilisierung konfiguriert die Sitzung neu → eine bestehende Fokus-/Belichtungssperre ist danach aufgehoben und wird als „Auto" angezeigt.

### Fokus-, Belichtungs- und Weißabgleich-Sperre (AC-25)

- Tippen in die Vorschau → die Kamera misst Fokus, Belichtung und (wo unterstützt) Weißabgleich an diesem Punkt und hält sie danach fest, ohne zeitliches Zurücksetzen. Die Vorschau zeigt am Tipp-Punkt eine Markierung mit Schloss, daneben den Button „Auto".
- Erneutes Tippen → neue Messung am neuen Punkt, wieder gesperrt. „Auto" → Sperre aufgehoben, Kamera regelt wieder automatisch.
- Unterstützt das Objektiv keine Punkt-Messung, ist Tippen wirkungslos und es erscheint einmal „Fokus-Sperre wird von diesem Objektiv nicht unterstützt".
- Wird eine Messung von einer neueren abgelöst (erneutes Tippen, „Auto“), bricht die Kamera die ältere ab. Das ist kein Fehler und wird nicht gemeldet, es zählt die neuere. Echte Fehler zeigen nur die erste Zeile der Fehlermeldung, nie den nativen Stacktrace. Eine erfolgreiche Sperre räumt eine frühere Fokus-Fehlermeldung ab (QA BUG-68).
- Während einer Fahrt mit Video ist Tippen und „Auto" gesperrt (AC-28) — die Sperre bleibt garantiert unverändert.

### Ablauf einer Fahrt mit Video — Zustandsmodell (`useVideoDrive`)

Zustände: **bereit** → **startet** → **Vorlauf** → **Fahrt** → **Nachlauf** → **speichert** → bereit.

| Von | Ereignis | Nach | Was passiert |
|---|---|---|---|
| bereit | Fahrt-Button, aber Kamera- bzw. (bei Ton an) Mikrofon-Berechtigung fehlt oder keine Rückkamera bekannt | bereit | Hinweis; die Berechtigung wird angefragt, wo Android das noch erlaubt, sonst Verweis auf die Einstellungen; keine Aufnahme, keine Fahrt (AC-20) |
| bereit | Fahrt-Button (Richtung, Dauer), alles erteilt | startet | Bildschirm-Sperre verhindern (`useKeepAwake`, AC-27); 5-s-Start-Wächter |
| startet | Recorder angelegt und Aufnahme gestartet | Vorlauf | Aufnahmedauer-Uhr läuft (Anzeige AC-16), 2-s-Timer |
| startet | Aufnahme kann nicht starten | bereit | Fehlermeldung, keine Fahrt (AC-18) |
| startet (auch nach Stopp) | Start-Wächter läuft ab, ohne dass die Kamera geantwortet hat | bereit | Meldung „Aufnahme konnte nicht starten — die Kamera reagiert nicht"; Bildschirm-Sperre freigeben (AC-27). Kommt der Start später doch noch, wird die Aufnahme sofort gestoppt und ihre Datei gelöscht |
| Vorlauf | 2 s abgelaufen | Fahrt | AUTO_DRIVE (bestehender Opcode, Richtung + Dauer) senden; 3-s-Wächter „Fahrt hat begonnen" starten |
| Fahrt | Firmware meldet `driving` | Fahrt | Wächter beendet |
| Fahrt | Wächter läuft ab, ohne dass `driving` kam (Firmware hat abgelehnt) | speichert | Aufnahme stoppen, Meldung „Fahrt konnte nicht starten" |
| Fahrt | `driving` wird wieder falsch **und** Schlitten steht am Ziel (`atEnd` bzw. `atStart`) | Nachlauf | 2-s-Timer |
| Fahrt | `driving` wird falsch, Schlitten **nicht** am Ziel (Schutz-Stopp, PROJ-6) | speichert | Aufnahme sofort stoppen (EC-6) |
| Nachlauf | 2 s abgelaufen | speichert | Aufnahme stoppen (AC-14) |
| startet/Vorlauf/Fahrt/Nachlauf | Stopp gedrückt | speichert | in „Fahrt" STOP senden; Timer abbrechen; Aufnahme sofort stoppen (AC-17) |
| Vorlauf/Fahrt/Nachlauf/speichert | Aufnahme-Fehler des Recorders | speichert → bereit | in „Fahrt" STOP senden; alle Timer abbrechen; Fehlermeldung mit Grund; die bis dahin geschriebene Datei (Pfad vom Recorder) sofort in die Galerie — der Recorder meldet sie nach einem Fehler nie als „fertig" (AC-18, QA BUG-44) |
| Vorlauf/Fahrt/Nachlauf | Recorder meldet „fertig", ohne dass die App gestoppt hat (z. B. Kamera entzogen, Sitzung neu konfiguriert) | speichert → bereit | wie ein Aufnahme-Fehler: in „Fahrt" STOP senden, Meldung „Aufnahme wurde unerwartet beendet", Datei speichern; im Vorlauf fährt der Schlitten nie los (AC-18, EC-7, QA BUG-45) |
| startet/Vorlauf/Fahrt/Nachlauf | App geht in den Hintergrund | speichert | in „Fahrt" STOP senden; Vorlauf-Timer abbrechen (Schlitten fährt nie los, EC-7); Fehlermeldung mit Grund (AC-18). Im Zustand „speichert" wird nichts mehr unterbrochen |
| startet/Vorlauf/Fahrt/Nachlauf | BLE-Verbindung weg | speichert | Aufnahme stoppen (Firmware stoppt den Motor selbst, AC-19/AC-10) |
| speichert | Aufnahme-Datei fertig | bereit | Video in die Galerie (Typ „Video"); Erfolg → „Video gespeichert" (AC-15); Fehler → Meldung „Video konnte nicht gespeichert werden" (eine frühere Fehlermeldung des Laufs bleibt stehen); danach die Kopie im App-Cache löschen; Bildschirm-Sperre freigeben |

- **Doppelte Auslösung (EC-5):** Fahrt-Buttons reagieren nur im Zustand „bereit"; der Hook ignoriert einen zweiten Start in jedem anderen Zustand. Zusätzlich lehnt die Firmware einen zweiten AUTO_DRIVE ohnehin ab (EC-2).
- **Hintergrund:** Der Wechsel in den Hintergrund wird über den App-Zustand von React Native erkannt und **selbst** als Fehler behandelt, statt sich darauf zu verlassen, dass die Kamera-Bibliothek einen Aufnahmefehler meldet — so ist EC-7 deterministisch.
- **Teil-Take bei Fehler:** Der Recorder gibt mit dem Fehler den Pfad der bis dahin geschriebenen Datei mit; die App versucht sie zu speichern. Scheitert das (Datei unbrauchbar), bleibt es bei der Fehlermeldung („soweit möglich", AC-18).
- **Video-Datei:** wird in den Cache-Ordner der App aufgenommen und von dort in die Galerie kopiert. Danach löscht die App die Cache-Kopie über ein eigenes kleines Android-Modul (`CacheFiles`, löscht nur innerhalb des App-Caches) — auch nach einem gescheiterten Speichern, weil die Kopie für den Nutzer ohnehin unerreichbar ist. Beim App-Start werden außerdem übrig gebliebene Aufnahmen (`VisionCamera_*.mp4`, z. B. nach einem Absturz) gelöscht (QA BUG-48).
- **Ohne Video** (Schalter aus) bleibt der bisherige Weg der Fahrt-Buttons unverändert — AC-3/AC-4 und EC-4 (Fahrt läuft im Hintergrund weiter) gelten dort weiter.

### Sperren der Bedienung

- Solange `useVideoDrive` nicht „bereit" ist: Jog, Punkte setzen, Presets laden/löschen, Dauer, alle Video-Einstellungen, Schalter „Video aufnehmen", Tippen in die Vorschau → gesperrt; nur Stopp bedienbar (AC-28, analog AC-9).
- Läuft eine Zeitraffer-Sequenz: Schalter „Video aufnehmen" gesperrt (EC-9). Ist der Schalter an: Zeitraffer-Start gesperrt (EC-10).
- Akku-Sperre (PROJ-6) sperrt die Fahrt-Buttons wie bisher, unabhängig vom Video.

### Berechtigungen

- Kamera: bestehende Android-Berechtigung (seit PROJ-5 im Manifest).
- **Mikrofon: neu** — `RECORD_AUDIO` muss ins Android-Manifest (ohne Eintrag lehnt Android die Anfrage still ab, wie BUG-3 in PROJ-5 bei der Kamera). Angefragt wird nur, wenn Ton an ist.
- Galerie: bestehend (`WRITE_EXTERNAL_STORAGE` bis Android 9, ab Android 10 nicht nötig).
- Hinweis-Muster wie in PROJ-5: noch nicht abgelehnt → „Zugriff erlauben"; dauerhaft abgelehnt → „Einstellungen öffnen".

### Abhängigkeiten (Erweiterung)

- Keine neue Bibliothek. Neu ist ein eigenes kleines Android-Modul im App-Projekt (`android/app/src/main/java/com/camerasliderapp/CacheFilesModule.kt` + `CacheFilesPackage.kt`, registriert in `MainApplication.kt`, erreicht über den TurboModule-Interop-Layer) zum Löschen der Cache-Kopien (QA BUG-48, Entscheidung des Nutzers 2026-10-02). Genutzt werden: `react-native-vision-camera` (Video-Output, Recorder, Geräteliste, Mikrofon-Berechtigung, Punkt-Messung), `@react-native-camera-roll/camera-roll` (Speichern als Video), `@sayem314/react-native-keep-awake` (über den bestehenden `useKeepAwake`), `@react-native-async-storage/async-storage` (Einstellungen).
- Firmware: unverändert.

### Technische Entscheidungen (Erweiterung 2026-10-01)

| Entscheidung | Begründung |
|---|---|
| Keine Firmware-Änderung — Vor- und Nachlauf werden in der App getimt, die Fahrt nutzt den bestehenden AUTO_DRIVE | Die Firmware kennt keine Kamera; Vor-/Nachlauf sind reine Aufnahme-Zeit, kein Motorverhalten. Kein neues Protokoll, kein gemeinsamer Firmware-Release nötig |
| Ein Kamera-Besitzer, abgeleitet aus dem Schalter „Video aufnehmen" (EC-10) | Android erlaubt nur eine aktive Kamera-Sitzung; die Regel ist eindeutig, hat keine Übergangszustände und lässt PROJ-5 bei ausgeschaltetem Schalter völlig unverändert |
| `useVideoDrive` als eigener Orchestrator in `RootScreen`, nicht in `AutoDriveControls` | Sein „beschäftigt"-Zustand muss Jog und Zeitraffer sperren, auch im Vor-/Nachlauf, in dem die Firmware nicht „driving" meldet — gleiches Muster wie `useTimelapseSequence` |
| Ankunft über den bestehenden Status (`driving` fällt, `atEnd`/`atStart` gesetzt), nicht über die Dauer | Die Firmware ist die Quelle der Wahrheit für die Position; unterscheidet sauber „angekommen" (→ Nachlauf) von „unterwegs gestoppt" (→ sofort stoppen, EC-6) |
| 3-s-Wächter nach AUTO_DRIVE | Die Firmware lehnt eine ungültige Fahrt still ab; ohne Wächter liefe die Aufnahme endlos weiter |
| Hintergrund-Wechsel selbst als Fehler behandeln (App-Zustand), zusätzlich zum Fehler-Callback des Recorders | Deterministisches EC-7/AC-18 unabhängig davon, wie schnell oder ob die Kamera-Bibliothek die Unterbrechung meldet |
| Sperre per Punkt-Messung im Modus „gesperrt" für AF/AE/AWB, statt der direkten Sperr-Befehle | Die direkten Sperr-Befehle sind in VisionCamera 5.2.3 nur iOS; die Punkt-Messung mit Sperre ist auf Android implementiert (CameraX) und sperrt den Weißabgleich mit. Alternative erwogen: natives Camera2-Modul |
| Feste Format-Liste (3 Auflösungen × 5 Bildraten), gefiltert nach dem, was das Objektiv meldet | Verständliche Auswahl statt Dutzender Roh-Formate; deckt die üblichen Video-Normen (24/25/30/50/60) ab |
| Objektiv als Typ speichern, nicht als Geräte-ID | Überlebt einen Handywechsel und Neuinstallationen der Kamera-Treiber; fällt sauber auf Weitwinkel zurück |
| Videos zuerst in den Temp-Ordner, dann in die Galerie kopieren | Gleicher Weg wie die Zeitraffer-Fotos (PROJ-5), eine bewährte Speicherroute |
| Cache-Kopie nach dem Kopieren per eigenem Android-Modul löschen, plus Aufräumen beim App-Start (QA BUG-48) | Weder VisionCamera noch CameraRoll löschen die Quelle; ohne Löschen bliebe jeder Take dauerhaft doppelt liegen (bei 4K Hunderte MB) |
| Formate vorab bei der Kamera abfragen (`resolveConstraints`) statt nur nach Objektiv-Meldung filtern (QA BUG-47) | AC-22 verlangt, nur wirklich verfügbare Kombinationen anzubieten; die Kamera wählt sonst still eine andere Bildrate |
| Stabilisierung über den Modus „standard" statt „automatisch" (QA BUG-46) | „Automatisch" meldet Android immer als unterstützt und lässt die Stabilisierung unbestimmt; „standard" entspricht der echten Fähigkeit und schaltet sie ein |
| Berechtigungsprüfung über die Aufnahme-Schnittstelle (`prepare()`), aufgerufen von `useVideoDrive` vor jedem Start (QA BUG-42) | Die Zustandsmaschine bleibt der eine Ort, der über den Start entscheidet; die Kamera-Seite kennt die Berechtigungen |
| Logische Multi-Kamera (`dual`/`dual-wide`/`triple`/`quad`) gilt als Weitwinkel und hat Vorrang (QA BUG-70) | Galaxy S24 (SM-S921B, Android 16) gibt die Hauptkamera nur als logische `triple`-Kamera mit Autofokus frei, dazu die Ultraweitwinkel einzeln ohne Autofokus; die App verwarf `triple` und nahm mit der Fixfokus-Ultraweitwinkel auf (auch Ursache von BUG-69) |
| `VideoPanel` in eigener Datei | `AutoDriveControls.tsx` hat bereits ~960 Zeilen; die Video-Teile sind ein abgegrenzter Block |

### Umsetzungsnotizen (`/build`, 2026-10-01)

- `useVideoDrive` bekommt den Slider-Status als Parameter (aus `RootScreen`, wo `useSliderStatus` ohnehin läuft), statt selbst `useSliderStatus` aufzurufen — macht die Zustandsmaschine direkt testbar; Verhalten wie im Design.
- Die Aufnahme-Schnittstelle (`VideoRecorderPort`) ist in `useVideoDrive.ts` definiert und wird von `useVideoCamera` erfüllt; zusätzlich zum 3-s-Wächter hat „speichert" eine 10-s-Obergrenze, falls der Recorder nach dem Stopp keine Datei liefert (dann Meldung „Video konnte nicht abgeschlossen werden").
- Ein fehlgeschlagenes Schreiben der Video-Einstellungen behält die Änderung für die laufende Sitzung (keine Fehlermeldung) — die Einstellungen sind Komfort, keine Nutzerdaten.
- `TimelapseControls` bekommt die Prop „Kamera wird für Video genutzt" als optionale Prop mit Standard „aus"; `RootScreen` übergibt sie immer.
- Kein Firmware-Code geändert.

### Umsetzungsnotizen (`/build`, QA-Fixes 2026-10-02)

- QA-Lauf vom 2026-10-02 (`qa-report.md`): gefixt sind BUG-42 bis BUG-48 (2 High, 5 Medium), dazu BUG-53 (Low, eine Zeile in derselben Funktion). Die übrigen Low-Bugs (BUG-49 bis BUG-52, BUG-54 bis BUG-57) sind offen.
- `VideoRecorderPort` hat zwei Änderungen: neu `prepare()` (BUG-42), und `onError` bekommt zusätzlich den Dateipfad (BUG-44).
- Der Test-Recorder in `useVideoDrive.test.ts` verhält sich jetzt wie VisionCamera: kein `onFinished` nach einem Fehler, `stop()` danach schlägt fehl. Der alte Fake hatte BUG-44 verdeckt.
- Das Aufräumen der Zeitraffer-Fotos (PROJ-5, `VisionCamera_*.jpg`) ist bewusst **nicht** Teil dieses Fixes. PROJ-5 ist ausgeliefert, und das wäre eine eigene Änderung (`/refine PROJ-5`). Das Modul könnte es leisten.

### Umsetzungsnotizen (`/build`, QA-Fix BUG-58, 2026-10-02)

- Der Start-Wächter gehört immer dem aktuellen Lauf. Ein verspätet eintreffender Start eines abgebrochenen Laufs prüft jetzt zuerst die Lauf-Nummer und fasst den Wächter nicht mehr an (`useVideoDrive.ts`, `startRecording(...).then`). Vorher löschte er den Wächter des nächsten Laufs, und die App hing dauerhaft in „Startet“ bzw. „Speichert“ (gleiche Folge wie BUG-43).
- Nach Priorisierung durch den Nutzer nur BUG-58 gefixt. BUG-59 bis BUG-66 und die älteren Low-Bugs bleiben offen.

### Umsetzungsnotizen (`/build`, QA-Fix BUG-70, 2026-10-02)

- `availableLenses` (`videoFormats.ts`) behandelt `dual`, `dual-wide`, `triple` und `quad` als Weitwinkel mit Vorrang vor einer einzelnen Weitwinkel-Kamera. Diagnose per `adb shell dumpsys media.camera` am Galaxy S24: Kamera 0 = logische Kamera aus drei Linsen, Brennweite 5,4 mm, AF; Kamera 2 = 2,2 mm, AF-Modus nur „aus“. VisionCamera typisiert eine Kamera mit mehr als einer physischen Linse nach deren Anzahl (`CameraInfo+deviceType.kt`).
- Behebt damit auch BUG-69 auf diesem Gerät: Die Weitwinkel-Wahl ist jetzt die Kamera mit Autofokus. Auf einer Linse ohne AF-Messung bleibt die Sperre weiterhin verweigert (Spec-Frage aus BUG-69, nicht entschieden).
- Kein anderes Verhalten auf Geräten ohne Multi-Kamera (Test „uses a single wide-angle camera as wide when there is no multi-camera“).

### Umsetzungsnotizen (`/build`, QA-Fix BUG-68, 2026-10-02)

- Diagnose per `adb logcat` am OnePlus Nord CE (EB2103): Bei mehreren Tipps und „Auto“ liefen alle Fokus-Messungen sauber durch (`lock3A … converged … lock af`), kein Abbruch. Der Abbruch aus dem Screenshot („Cancelled by another startFocusAndMetering()“) tritt nur auf, wenn eine zweite Messung kommt, bevor die erste fertig ist. Woher die zweite vorhin kam, ließ sich nicht mehr klären. Der Fix hängt deshalb nicht von der Ursache ab.
- `useVideoCamera.ts` `lockAt`: Ein abgebrochener Aufruf (`OperationCanceledException` bzw. „cancelled by …“) wird still ignoriert. Erfolg räumt eine frühere Meldung „Fokus konnte nicht gesperrt werden“ ab.
- `describeError` in `useVideoCamera.ts` und `useVideoDrive.ts` gibt nur noch die erste Zeile der Fehlermeldung weiter. Native Fehler von VisionCamera tragen den Stacktrace in der Message.
- Nicht angefasst: `useTimelapseSequence.ts` (PROJ-5) hat dieselbe ungekürzte `describeError`. PROJ-5 ist ausgeliefert, das wäre ein eigener Fix.

## Open Questions

- [ ] Aus `spec.md` übernommen: genaue min/max-Dauer-Grenzen stehen erst nach der Steps-pro-mm-Kalibrierung fest — betrifft nur die reale mm/s-Bedeutung, nicht die Steps/s-Rechnung selbst
