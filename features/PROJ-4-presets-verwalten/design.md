# PROJ-4 — Technisches Design

> Dies ist das technische Design (das WIE) für das Feature. Der Vertrag (WAS) steht in `spec.md`, die Aufgabenliste in `tasks.md`.
> Plattform: **mobile** (Android, React Native) — wie bei PROJ-1/2/3.
> Das Feature spannt zwei Layer: die **App** (React Native, erweitert PROJ-3s `AutoDriveControls`-Bereich um Preset-Verwaltung) und die **Firmware** (Layer `firmware`, ESP32/PlatformIO — `docs/stacks/firmware-esp32-tmc2209.md`). Die Grenze ist eine additive Erweiterung des in PROJ-2/3 eingeführten BLE-Kommandoprotokolls um einen neuen Opcode und ein zusätzliches Byte in der Status-Characteristic.
> Erfordert PROJ-3 (Approved/Deployed) — erweitert dessen App- und Firmware-Code additiv, ändert keine PROJ-1/2/3-Acceptance-Criteria.
> Kein neuer Screen: `docs/app-shell.md` sieht Presets bereits als Abschnitt auf der bestehenden einzigen Seite vor (Owner PROJ-1) — dieses Design fügt nur Inhalte in den bestehenden Content-Bereich ein, ohne den Rahmen selbst zu ändern.

## Component Structure

```
RootScreen (PROJ-1, unverändert)
+-- ConnectionHeader (PROJ-1, unverändert)
+-- ContentArea (Zustand `connected`)
    +-- JogControls (PROJ-2/3, unverändert)
    +-- AutoDriveControls (PROJ-3, erweitert für PROJ-4)
        +-- PointButtons / DurationInput / DriveButtonRow / StopButton / StatusLine (PROJ-3, unverändert)
        +-- SavePresetButton (NEU) — sichtbar, sobald Start, Ende und eine gültige Dauer gesetzt sind (AC-1)
        +-- SavePresetDialog (NEU) — Modal mit Namens-Eingabe, öffnet sich bei Tap auf SavePresetButton (AC-1, AC-2)
        +-- PresetList (NEU) — je gespeichertem Preset eine Zeile: Name, Dauer, Lösch-Icon (AC-3)
            +-- EmptyState ("Noch keine Presets gespeichert") (AC-7)
```

`SavePresetButton`, `SavePresetDialog` und `PresetList` werden direkt in `AutoDriveControls` ergänzt (kein separates Eltern-Kind-Verhältnis mit Props-Durchreichung) — Details siehe Technische Entscheidungen.

## Erweiterung der App-BLE-Grenze

### Neuer Hook: `usePresets()`

Liest/schreibt Presets aus dem lokalen Gerätespeicher (AsyncStorage) und liefert:

```
{
  presets: Preset[],       // sortiert nach createdAt, neueste zuerst
  save(name, distanceSteps, endIsAfterStart, durationSeconds): Promise<void>,
  remove(id): Promise<void>,
}
```

Lädt die Liste einmal beim Mount aus AsyncStorage. Ein eigener, fokussierter Hook statt Erweiterung eines bestehenden — derselbe Musterentscheid wie PROJ-2s `useJogState`/PROJ-3s `useSliderStatus`.

### `src/ble/client.ts` — neuer Export (additiv)

- `sendSetEndFromDistanceCommand(device, endIsAfterStart, distanceSteps)` — Opcode `0x06`, Write mit Antwort
- `SliderStatus` bekommt ein neues Feld `endIsAfterStart: boolean | null` (nur gesetzt, wenn `hasStart && hasEnd`), aus dem erweiterten Status-Payload geparst

## Grenze zur Firmware (Erweiterung des BLE-Kommandoprotokolls)

**Command-Characteristic** (`6e400002-…`) bekommt einen neuen Opcode neben den bestehenden (JOG `0x01`, SET_START `0x02`, SET_END `0x03`, AUTO_DRIVE `0x04`, STOP `0x05`):

| Opcode | Name | Payload | Übertragungsart | Bedeutung |
|---|---|---|---|---|
| `0x06` | SET_END_FROM_DISTANCE | 1 Byte Richtung (`0x00` = Ende liegt in Richtung steigender Schritte vom Start, `0x01` = fallend) + 4 Byte Distanz in Steps (uint32, little-endian) | Write mit Antwort | Leitet den Endpunkt aus der aktuellen Startposition + Distanz ab, ohne dass der Schlitten dort physisch war |

Wie die drei neuen Opcodes aus PROJ-3: Write **mit** Antwort — ein einmaliger, sicherheitsrelevanter Befehl, kein wiederholtes Herzschlag-Muster.

**Status-Characteristic** (`6e400003-…`) wächst von 5 auf 6 Byte:

| Byte | Inhalt |
|---|---|
| 0 | Flags-Bitfeld (unverändert: Bit 0 `hasStart`, Bit 1 `hasEnd`, Bit 2 `atStart`, Bit 3 `atEnd`, Bit 4 `driving`) |
| 1–4 | Distanz in Steps zwischen Start und Ende (uint32, little-endian) — unverändert, weiterhin der Betrag (immer positiv) |
| 5 (NEU) | Endpunkt-Richtung: `0x00` = Ende liegt in Richtung steigender Schritte vom Start, `0x01` = fallend — nur gültig, wenn Bit 0 und Bit 1 beide gesetzt sind |

Byte 5 ist rein additiv — bestehende PROJ-1/2/3-Auswertung von Byte 0–4 ist davon nicht betroffen.

## Firmware-Komponentenstruktur (Erweiterung)

```
firmware/src/ble.cpp (PROJ-1/2/3, erweitert)
+-- Command-Callback um SET_END_FROM_DISTANCE (0x06) erweitert
+-- packStatusPayload() erweitert um Byte 5 (Endpunkt-Richtung)

firmware/src/motor.h / motor.cpp (PROJ-2/3, erweitert)
+-- motorSetEndFromDistance(endIsAfterStart, distanceSteps) — setzt endPosition = startPosition ± distanceSteps (Vorzeichen aus endIsAfterStart), hasEnd = true. Verlangt hasStart, verweigert bei laufendem Motor oder autoDriving (dieselben Schutzmechanismen wie motorSetStart()/motorSetEnd())
+-- motorGetStatus() — liefert zusätzlich die Endpunkt-Richtung (endPosition >= startPosition), nur aussagekräftig wenn hasStart && hasEnd
```

## Datenmodell

**Preset** (neue Entität, siehe aktualisiertes `docs/data-model.md`):

```
Jedes Preset hat:
- id: eindeutige lokale Kennung (Zeitstempel bei Erstellung)
- name: Text, 1–60 Zeichen, Pflichtfeld
- distanceSteps: positive ganze Zahl (Steps zwischen Start und Ende)
- endIsAfterStart: true/false (Richtung des Endpunkts relativ zum Startpunkt)
- durationSeconds: positive Zahl, eine Nachkommastelle (Zehntelsekunden-Genauigkeit, wie PROJ-3s Dauer-Feld)
- createdAt: Zeitstempel (Millisekunden) — bestimmt die Anzeige-Reihenfolge (neueste zuerst)

Gehört zu: dem Nutzer selbst, rein lokal auf dem Gerät.
Gespeichert in: AsyncStorage, eine JSON-Liste unter einem einzigen Schlüssel.
Aufbewahrung: bis der Nutzer das Preset explizit löscht — keine automatische Ablaufzeit, keine Obergrenze.
```

Kein neues Datenmodell auf Firmware-Seite — `distanceSteps`/`endIsAfterStart` werden bei jedem Laden eines Presets frisch über die neue Command/Status-Erweiterung übertragen, nichts wird dort gespeichert.

## Abhängigkeiten

- `@react-native-async-storage/async-storage` — persistiert die Preset-Liste über App-Neustarts hinweg (bislang keine lokale Persistenz im Projekt, PROJ-1/2/3 speichern nichts)
- Kein Toast-Paket nötig: `ToastAndroid` (React-Native-Core, Android-only — passt zur Android-only-Ausrichtung des Projekts) deckt das in `docs/app-shell.md` vorgesehene Erfolgs-Feedback ("Preset gespeichert") ab
- Keine UUID-Bibliothek nötig: `Date.now()` als String reicht als lokal eindeutige ID (siehe Technische Entscheidungen)

## Settings the user makes

_Keine — kein Backend, kein Provider-Dashboard betroffen._

## Technische Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Presets als eine JSON-Liste unter einem einzigen AsyncStorage-Schlüssel, Lesen-Ändern-Schreiben bei jeder Operation | Kleine, einstellige bis niedrige zweistellige Anzahl an Presets zu erwarten — für diese Größenordnung einfach und schnell genug |
| Neuer Opcode SET_END_FROM_DISTANCE (`0x06`): Richtung + Distanz, Firmware leitet den Endpunkt aus der Startposition ab | Firmware bleibt einzige Quelle der Wahrheit für Positionen (wie schon bei SET_START/SET_END/AUTO_DRIVE aus PROJ-3) — die App kennt nie eine absolute Step-Zahl |
| Status-Payload um 1 Byte (Endpunkt-Richtung) erweitert statt die bestehende Distanz auf ein Vorzeichen umzustellen | Presets müssen beim Speichern wissen, in welche Richtung der Endpunkt vom Start aus lag, um ihn beim Laden korrekt abzuleiten — die App kannte bisher nur den Betrag. Ein zusätzliches Byte lässt Byte 1–4 unverändert, kein Risiko für bestehende PROJ-1/2/3-Auswertung |
| Presets nur in "vorwärts"-Richtung zu unterstützen wurde erwogen und verworfen | Hätte Presets auf eine physische Anordnung beschränkt (Start immer die kleinere Schritt-Zahl), obwohl PROJ-3 Start/Ende bereits symmetrisch behandelt (beide Richtungen gleichberechtigt auslösbar) — die Alternative wäre gewesen, kein neues Status-Byte einzuführen und den Endpunkt immer bei Start + Distanz zu erwarten |
| Feedback beim Speichern/Löschen über `ToastAndroid` (React-Native-Core), keine zusätzliche Bibliothek | App ist ausschließlich für Android (PRD-Constraint) — `ToastAndroid` deckt genau das ab, was `docs/app-shell.md` für Erfolgs-Feedback vorsieht, ohne neue Abhängigkeit |
| Preset-ID = `Date.now()`-Zeitstempel als String | Presets werden nacheinander von einem einzigen Nutzer auf einem Gerät gespeichert — Kollisionsrisiko praktisch null |
| Geladenes Preset (Distanz + Richtung + Dauer) lebt als lokaler Komponenten-Zustand in `AutoDriveControls`, nicht in `useSliderStatus` oder einem eigenen Hook | Reiner UI-Zustand für die aktuelle Interaktion, kein vom Firmware-Status gemeldeter Wert |
| Geladenes Preset wird automatisch verworfen: beim manuellen Setzen des Endpunkts (EC-3 aus spec.md), beim Laden eines anderen Presets, oder beim Trennen der Verbindung (EC-5) | Verhindert, dass eine veraltete Distanz-Ableitung nach einer bewussten manuellen Änderung unbemerkt weiterwirkt |
| „Als Start setzen" sendet bei geladenem Preset zusätzlich SET_END_FROM_DISTANCE, direkt im Anschluss an die Antwort auf SET_START | Beide Writes laufen seriell im selben NimBLE-Host-Task (wie schon bei PROJ-3s Command-Verarbeitung) — kein Risiko, dass die Firmware den zweiten Befehl vor dem ersten sieht, solange die App auf die Antwort des ersten wartet, bevor sie den zweiten schickt |
| Presets in der Liste sortiert nach Erstellungsdatum, neueste zuerst | Ohne Sortier-/Filterfunktion (spec.md → Out of Scope) ist die Erstellungsreihenfolge die einfachste, vorhersagbare Ordnung |

## Open Questions

- [ ] Aus `spec.md` übernommen: ab welcher Preset-Anzahl (falls überhaupt) sollte die Liste eine Grenze, Scroll-Optimierung oder Gruppierung bekommen? Aktuell keine Grenze vorgesehen
