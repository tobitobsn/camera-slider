# PROJ-3: Start-/Endpunkt & Auto-Fahrt

## Dependencies
- Erfordert: PROJ-2 (Manuelle Steuerung / Jog) — Start-/Endpunkt werden durch Jogen zur Position gesetzt, nutzt dessen bestehende Steuerung

## User Stories
- Als Slider-Besitzer möchte ich die aktuelle Position als Start- bzw. Endpunkt markieren können, nachdem ich manuell dorthin gejogt bin, damit ich eine Kamerafahrt-Strecke definieren kann
- Als Slider-Besitzer möchte ich eine Zieldauer für die Fahrt zwischen Start und Ende eingeben, damit die Aufnahme genau so lange dauert wie geplant
- Als Slider-Besitzer möchte ich die automatische Fahrt jederzeit abbrechen können, damit ich bei einem Problem sofort eingreifen kann
- Als Slider-Besitzer möchte ich nach einer Aufnahme bequem zurück zum Startpunkt fahren können, damit ich für die nächste Aufnahme nicht manuell zurückjogen muss

## Out of Scope
- Dauerhaftes Speichern mehrerer benannter Fahrten (Presets) — PROJ-4
- Zeitraffer-Modus (schrittweise Fahrt + Kameraauslösung) — PROJ-5
- Direkte Geschwindigkeitseingabe statt Dauer (siehe Decision Log)
- Getrennte, separat einstellbare Dauer für die Rückfahrt (siehe Decision Log)
- Manuelles Jogging oder Setzen neuer Punkte während einer laufenden Auto-Fahrt (siehe Decision Log)
- Anzeige der Strecke/Geschwindigkeit in mm bzw. mm/s — weiterhin nur die Steps-Domäne, echte Steps-pro-mm-Kalibrierung steht aus (wie bei PROJ-2)
- Auto-Fahrt von einer beliebigen Position aus (nicht exakt am Startpunkt der jeweiligen Richtung) — siehe Decision Log

## Acceptance Criteria
- [ ] **AC-1** — Angenommen die App ist verbunden und der Nutzer ist zu einer Position gejogt, wenn er „Als Start setzen" drückt, dann wird diese Position als Startpunkt für die aktuelle Sitzung gespeichert (ein zuvor gesetzter Startpunkt wird dabei überschrieben)
- [ ] **AC-2** — Angenommen die App ist verbunden und der Nutzer ist zu einer Position gejogt, wenn er „Als Ende setzen" drückt, dann wird diese Position als Endpunkt für die aktuelle Sitzung gespeichert (ein zuvor gesetzter Endpunkt wird dabei überschrieben)
- [ ] **AC-3** — Angenommen Start- und Endpunkt sind gesetzt und der Schlitten steht am Startpunkt, wenn der Nutzer eine gültige Dauer eingibt und „Start → Ende" auslöst, dann fährt der Schlitten automatisch zum Endpunkt und kommt nach der eingegebenen Dauer dort an
- [ ] **AC-4** — Angenommen Start- und Endpunkt sind gesetzt und der Schlitten steht am Endpunkt, wenn der Nutzer eine gültige Dauer eingibt und „Ende → Start" auslöst, dann fährt der Schlitten automatisch zurück zum Startpunkt und kommt nach der eingegebenen Dauer dort an
- [ ] **AC-5** — Angenommen eine Auto-Fahrt läuft, wenn der Nutzer „Stopp" drückt, dann hält der Motor sofort an, unabhängig davon wie weit die Fahrt fortgeschritten ist
- [ ] **AC-6** — Angenommen Start- und Endpunkt sind gesetzt, wenn der Nutzer beim Verlassen des Dauer-Felds eine Dauer eingetragen hat, die bei der Distanz zwischen den Punkten eine Geschwindigkeit unter der Mindestgeschwindigkeit (200 Steps/s) ergäbe (die Dauer ist zu lang), dann zeigt die App eine Fehlermeldung mit dem erlaubten Dauer-Bereich und startet keine Fahrt — das Feld behält die eingegebene, zu lange Dauer bei
- [ ] **AC-11** — Angenommen Start- und Endpunkt sind gesetzt, wenn der Nutzer das Dauer-Feld verlässt und die eingetragene Dauer leer ist, nicht als Zahl auswertbar ist, oder eine Geschwindigkeit über der Höchstgeschwindigkeit (8000 Steps/s) ergäbe (die Dauer ist zu kurz oder fehlt), dann trägt die App automatisch die für die aktuelle Distanz kürzestmögliche gültige Dauer in das Feld ein, ohne eine Fehlermeldung zu zeigen — der Nutzer kann direkt mit diesem Wert „Start → Ende"/„Ende → Start" auslösen
- [ ] **AC-12** — Angenommen der Nutzer hat noch nicht in das Dauer-Feld getippt, wenn Start- und Endpunkt gesetzt sind (oder sich ihre Distanz ändert) und die eingetragene Dauer für die aktuelle Distanz zu kurz, leer oder nicht als Zahl auswertbar ist, dann trägt die App ebenfalls automatisch die kürzestmögliche gültige Dauer ein (wie AC-11), ohne dass der Nutzer das Feld erst verlassen muss — die Auto-Fahrt-Auslöser bleiben nie stumm gesperrt wegen einer zu kurzen Dauer. Eine zu lange Dauer bleibt unverändert (AC-6)
- [ ] **AC-7** — Angenommen kein Startpunkt oder kein Endpunkt ist gesetzt, wenn der Nutzer den Hauptbildschirm sieht, dann sind die Auto-Fahrt-Auslöser („Start → Ende" / „Ende → Start") deaktiviert
- [ ] **AC-8** — Angenommen der Schlitten steht nicht exakt am Startpunkt der jeweiligen Richtung, wenn der Nutzer diese Richtung auslösen will, dann ist der entsprechende Auslöser deaktiviert (analog für die Gegenrichtung und deren Startpunkt)
- [ ] **AC-9** — Angenommen eine Auto-Fahrt läuft, wenn der Nutzer die Jog-Tasten oder die „Setzen"-Buttons betätigt, dann reagieren sie nicht — nur der Stopp-Button ist bedienbar
- [ ] **AC-10** — Angenommen die BLE-Verbindung bricht während einer laufenden Auto-Fahrt ab, dann stoppt die Firmware den Motor eigenständig, unabhängig von der App

## Edge Cases
- **EC-1** — Angenommen Start- und Endpunkt sind identisch (0 Steps Distanz), dann ist der jeweilige Auto-Fahrt-Auslöser deaktiviert, mit einem Hinweis, dass Start und Ende sich unterscheiden müssen
- **EC-2** — Angenommen eine Auto-Fahrt läuft bereits, wenn eine zweite Auslöse-Anfrage eintrifft (z. B. durch Doppel-Tap oder eine App-seitige Wiederholung), dann ignoriert die Firmware die zweite Anfrage
- **EC-3** — Angenommen die App wird neu gestartet oder die Verbindung neu aufgebaut, dann sind Start- und Endpunkt nicht mehr gesetzt (keine Persistenz über die Sitzung hinaus)
- **EC-4** — Angenommen eine Auto-Fahrt läuft und die App wird in den Hintergrund geschickt oder stürzt ab, während die BLE-Verbindung formal bestehen bleibt, dann läuft die Fahrt trotzdem bis zum Ziel weiter — kein Watchdog-Timeout wie beim Jog nötig, da kein fortlaufendes Halte-Signal erwartet wird

## Technical Requirements
- Geschwindigkeit wird aus der Distanz (Steps) zwischen Start und Ende und der eingegebenen Dauer berechnet: `speed = distance_steps / duration_seconds`, muss innerhalb 200–8000 Steps/s liegen (derselbe Bereich wie PROJ-2s Jog)
- Baut auf PROJ-2s Motoransteuerung auf, braucht aber erstmals eine absolute Positions-Verfolgung in der Firmware (PROJ-2 kennt nur kontinuierlichen Lauf ohne Ziel) — technische Entscheidung von `/architecture`

## Open Questions
- [ ] Genaue min/max-Dauer-Grenzen hängen von der noch ausstehenden Steps-pro-mm-Kalibrierung der Mechanik ab (wie bei PROJ-2 offen)

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Zur Position jogen + „Setzen"-Button statt Zahlen-Eingabe | Nutzt PROJ-2s bestehende Steuerung, keine Kalibrierung nötig, bevor die Funktion nutzbar ist | 2026-09-23 |
| Dauer eingeben, Geschwindigkeit wird berechnet (nicht umgekehrt) | Für Kamerafahrten ist die Aufnahmelänge das eigentliche Ziel, nicht eine bestimmte Geschwindigkeit | 2026-09-23 |
| Ungültige Dauer → Fehlermeldung statt automatisches Klemmen auf die nächstmögliche Geschwindigkeit | Eine stille Abweichung von der eingegebenen Dauer wäre bei einer zeitkritischen Aufnahme überraschend | 2026-09-23 |
| **Aufgehoben, siehe unten:** ab 2026-09-27 gilt die Mindestdauer-Auto-Korrektur (AC-11) für den Fall „Dauer zu kurz/leer/unlesbar" — die obige Entscheidung bleibt aber für den Fall „Dauer zu lang" bestehen (AC-6) | — | — |
| Bei zu kurzer/leerer/nicht lesbarer Dauer beim Verlassen des Felds automatisch die Mindestdauer eintragen, statt nur einen Fehler zu zeigen | Während echter Hardware-Tests störte die reine Fehlermeldung beim häufigsten Fall (Nutzer will „so schnell wie möglich" fahren) — die Mindestdauer selbst auszurechnen ist unnötige Reibung; bewusst NICHT symmetrisch für eine zu lange Dauer, da dort ein Absprung auf wenige Sekunden bei einer eigentlich gewollten langsamen Fahrt überraschend wäre (die ursprüngliche Begründung von 2026-09-23 gilt für diesen Fall weiter) | 2026-09-27 |
| Korrektur erst beim Verlassen des Felds (onBlur), nicht während des Tippens | Während des Tippens das Feld zu überschreiben würde dem Nutzer die Eingabe erschweren | 2026-09-27 |
| Auto-Fahrt nur auslösbar, wenn der Schlitten exakt am Startpunkt der jeweiligen Richtung steht | Eindeutige, vorhersagbare Strecke und Dauer — kein Sonderfall „fahre von irgendwo zum Ziel" | 2026-09-23 |
| „Ende → Start" als eigener Auslöser, mit derselben Dauer wie „Start → Ende" | Bequem für mehrere Takes hintereinander, ohne die UI-Komplexität zweier getrennter Dauer-Felder | 2026-09-23 |
| Start-/Endpunkt werden nicht persistiert, nur für die aktuelle Sitzung | Konsistent mit PROJ-1/2s „keine Persistenz"-Linie; dauerhaftes Speichern mehrerer Fahrten kommt mit PROJ-4 (Presets) | 2026-09-23 |
| Disconnect während Auto-Fahrt → Firmware stoppt sofort (wie beim Jog) | Ein konsistentes Sicherheitsprinzip über alle Fahrmodi hinweg statt pro Modus unterschiedlicher Regeln | 2026-09-23 |
| UI während Auto-Fahrt komplett gesperrt bis auf den Stopp-Button | Verhindert widersprüchliche gleichzeitige Befehle (Jog + Auto-Fahrt), einfacher zu bauen und zu testen | 2026-09-23 |
| Höchstgeschwindigkeit von 4000 auf 8000 Steps/s erhöht (AC-11, Technical Requirements) — Änderung über `/refine PROJ-2` | Gleicher Bereich wie PROJ-2s Jog; am echten Slider mit 6000 und 8000 getestet, ohne Probleme. AC-IDs unverändert | 2026-09-29 |
| AC-12: Auto-Korrektur der zu kurzen Dauer auch bei Änderung der Distanz, nicht nur beim Verlassen des Felds — angehängt über `/refine PROJ-3`, Code bereits in `a6b837d` | QA-Fund (BUG-19): Der Standardwert „10" war bei Distanzen über ca. 450 mm zu kurz und sperrte die Auslöser ohne Meldung, solange der Nutzer das Feld nicht berührte. Bestehende AC-IDs unverändert | 2026-09-30 |
