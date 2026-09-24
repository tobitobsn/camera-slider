# PROJ-4: Presets verwalten

## Dependencies
- Erfordert: PROJ-3 (Start-/Endpunkt & Auto-Fahrt) — Presets bauen direkt auf dessen Start-/Endpunkt-Konzept und Auto-Fahrt-Bereich auf

## User Stories
- Als Slider-Besitzer möchte ich eine erfolgreich eingerichtete Fahrt (Start, Ende, Dauer) unter einem Namen speichern, damit ich sie später wiederverwenden kann, ohne alles neu einzustellen
- Als Slider-Besitzer möchte ich meine gespeicherten Presets in einer Liste sehen, damit ich schnell erkenne, was mir zur Verfügung steht
- Als Slider-Besitzer möchte ich ein Preset laden, damit ich nur noch zum Startpunkt jogen muss statt beide Punkte manuell zu setzen
- Als Slider-Besitzer möchte ich ein nicht mehr gebrauchtes Preset löschen, damit meine Liste übersichtlich bleibt

## Out of Scope
- Umbenennen/Überschreiben bestehender Presets — löschen und neu speichern stattdessen (siehe Decision Log)
- Speichern absoluter Schritt-Positionen — nur Distanz + Dauer (siehe Decision Log)
- Presets-Synchronisation zwischen Geräten oder in eine Cloud — weiterhin rein lokal, wie PROJ-1/2/3
- Zeitraffer-Presets (schrittweise Fahrt + Kameraauslösung) — PROJ-5
- Sortieren/Filtern/Suchen in der Preset-Liste — bei der erwarteten kleinen Anzahl nicht nötig
- Eine feste Obergrenze für die Anzahl an Presets — siehe Open Questions

## Acceptance Criteria
- [ ] **AC-1** — Angenommen Start, Ende und eine gültige Dauer sind gesetzt (PROJ-3), wenn der Nutzer „Als Preset speichern" drückt und einen Namen eingibt, dann wird ein neues Preset mit diesem Namen, der aktuellen Distanz und der aktuellen Dauer lokal gespeichert
- [ ] **AC-2** — Angenommen die Namens-Eingabe ist leer, wenn der Nutzer versucht zu speichern, dann ist der Speichern-Button deaktiviert bzw. das Speichern wird verhindert
- [ ] **AC-3** — Angenommen mindestens ein Preset ist gespeichert, wenn die App verbunden ist, dann zeigt eine Liste jedes Preset mit Name und Dauer
- [ ] **AC-4** — Angenommen die App ist verbunden, wenn der Nutzer ein Preset in der Liste antippt, dann wird dessen Dauer in das Dauer-Feld der Auto-Fahrt-Steuerung übernommen und dessen Distanz für die automatische Endpunkt-Ableitung gemerkt
- [ ] **AC-5** — Angenommen ein Preset wurde geladen (AC-4), wenn der Nutzer zum physischen Startpunkt jogt und „Als Start setzen" drückt, dann wird der Endpunkt automatisch aus der neuen Startposition plus der gespeicherten Distanz abgeleitet, ohne dass der Nutzer manuell zum Endpunkt fahren muss
- [ ] **AC-6** — Angenommen ein Preset existiert, wenn der Nutzer das Löschen-Icon antippt, dann erscheint ein Bestätigungsdialog; erst nach Bestätigung wird das Preset entfernt
- [ ] **AC-7** — Angenommen keine Presets sind gespeichert, wenn der Nutzer den Auto-Fahrt-Bereich sieht, dann zeigt ein Hinweistext, dass noch keine Presets gespeichert sind
- [ ] **AC-8** — Angenommen eine Auto-Fahrt läuft gerade, wenn der Nutzer die Preset-Liste sieht, dann sind Laden und Löschen deaktiviert (konsistent mit PROJ-3s AC-9 — UI während der Fahrt gesperrt bis auf Stopp)
- [ ] **AC-9** — Angenommen Presets wurden gespeichert, wenn die App neu gestartet und die Verbindung neu aufgebaut wird, dann sind alle zuvor gespeicherten Presets weiterhin vorhanden (persistiert über App-Neustarts hinweg, im Unterschied zu Start/Ende selbst, die laut PROJ-3 pro Sitzung zurückgesetzt werden)

## Edge Cases
- **EC-1** — Angenommen zwei Presets tragen denselben Namen, dann werden beide unverändert in der Liste angezeigt, ohne Fehlermeldung (siehe Decision Log)
- **EC-2** — Angenommen ein Preset ist geladen (Dauer vorausgefüllt, Distanz gemerkt) und der Nutzer ändert die Dauer danach manuell, dann wird beim Auslösen der Fahrt die manuell geänderte Dauer verwendet, nicht die ursprünglich im Preset gespeicherte
- **EC-3** — Angenommen ein Preset ist geladen, wenn der Nutzer stattdessen ganz regulär (unabhängig vom Preset) sowohl Start als auch Ende manuell setzt, dann überschreibt das manuelle Setzen des Endpunkts die aus dem Preset abgeleitete Endposition
- **EC-4** — Angenommen das lokale Speichern eines neuen Presets schlägt fehl (z. B. Gerätespeicher voll), dann zeigt die App eine Fehlermeldung und das Preset erscheint nicht in der Liste
- **EC-5** — Angenommen der Nutzer trennt die Verbindung, während ein Preset geladen ist (Dauer vorausgefüllt, Startpunkt aber noch nicht gesetzt), dann geht nur dieser geladene Zustand verloren (konsistent mit PROJ-3s EC-3) — das gespeicherte Preset selbst bleibt in der Liste erhalten

## Technical Requirements
- Presets werden lokal auf dem Gerät persistiert, über App-Neustarts hinweg (konkreter Mechanismus — z. B. AsyncStorage — technische Entscheidung von `/architecture`)
- Preset-Datenmodell mindestens: Name, Distanz in Steps, Dauer in Sekunden — siehe `docs/data-model.md` (wird von `/architecture` aktualisiert)
- Die Firmware braucht eine neue Fähigkeit, einen Endpunkt aus Startposition + Distanz abzuleiten, ohne dass der Schlitten dort physisch war (bisher setzt `SET_END` immer die aktuelle physische Position) — technische Entscheidung von `/architecture`
- Baut auf PROJ-3s Auto-Fahrt-Bereich, Start-/Endpunkt-Konzept und BLE-Kommandoprotokoll auf

## Open Questions
- [ ] Ab welcher Anzahl Presets (falls überhaupt) sollte die Liste eine Grenze, Scroll-Optimierung oder Gruppierung bekommen? Aktuell keine Grenze vorgesehen — bei Bedarf später nachschärfen

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Preset speichert Distanz + Dauer, keine absoluten Schritt-Positionen | Die Firmware-Schrittzählung ist nicht über einen ESP32-Neustart hinweg stabil (kein Referenzpunkt, keine Endanschläge) — eine gespeicherte absolute Position wäre nach einem Neustart bedeutungslos oder sogar gefährlich | 2026-09-24 |
| Endpunkt wird beim Laden automatisch aus Startposition + gespeicherter Distanz abgeleitet, kein manuelles Jogen zum Endpunkt nötig | Reduziert den manuellen Aufwand beim Wiederverwenden eines Presets von zwei Positionierungsschritten auf einen | 2026-09-24 |
| Presets werden im bestehenden Auto-Fahrt-Bereich (PROJ-3) verwaltet, kein eigener Bildschirm | Die App hat bisher nur einen Screen (RootScreen) ohne Navigation; ein zweiter Screen wäre unverhältnismäßiger Aufwand für eine einfache Liste | 2026-09-24 |
| „Als Preset speichern" erscheint erst, wenn Start, Ende und eine gültige Dauer bereits gesetzt sind | Ein Preset speichert immer einen tatsächlich funktionierenden Fahrt-Zustand, nie eine unvollständige oder ungültige Konfiguration | 2026-09-24 |
| Doppelte Preset-Namen sind erlaubt, kein Duplikat-Check beim Speichern | Einfachste Regel fürs MVP; der Nutzer kann Presets ohnehin an der angezeigten Dauer unterscheiden, ein Namenskonflikt ist keine Fehlfunktion | 2026-09-24 |
| Presets können nur gelöscht und neu gespeichert werden, nicht umbenannt oder überschrieben | Reduziert den MVP-Funktionsumfang; Umbenennen kann bei Bedarf später per `/refine` ergänzt werden | 2026-09-24 |
| Löschen eines Presets erfordert einen Bestätigungsdialog | Es gibt kein Undo für ein lokal gelöschtes Preset | 2026-09-24 |
