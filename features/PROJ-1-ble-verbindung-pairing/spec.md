# PROJ-1: BLE-Verbindung & Pairing

## Dependencies
- Keine (erstes Feature, Basis für alle anderen)

## User Stories
- Als Slider-Besitzer möchte ich, dass die App beim Öffnen automatisch meinen Slider findet und verbindet, damit ich nicht manuell danach suchen muss
- Als Slider-Besitzer möchte ich klar sehen, ob die App mit dem Slider verbunden ist, damit ich weiß, ob ich ihn steuern kann
- Als Slider-Besitzer möchte ich, dass die App bei einem kurzen Verbindungsabbruch automatisch neu verbindet, damit ein kurzer Empfangsverlust die Aufnahme nicht ruiniert
- Als Slider-Besitzer möchte ich klar informiert werden, wenn Bluetooth aus ist oder mein Slider nicht gefunden wird, damit ich weiß, was ich tun muss

## Out of Scope
- Mehrere Geräte gleichzeitig verwalten/koppeln (nur ein Slider vorgesehen)
- Manuelle Geräteauswahl aus einer Liste
- Persistente Speicherung einer zuletzt verbundenen Geräte-ID
- Verschlüsselte/gesicherte BLE-Kopplung mit PIN (kein Bonding)
- iOS (siehe PRD Non-Goals)

## Acceptance Criteria
- [ ] **AC-1** — Angenommen die App wird zum ersten Mal gestartet, wenn der Start-Screen erscheint, dann fragt die App die nötigen Bluetooth-Berechtigungen mit einer kurzen Erklärung ab
- [ ] **AC-2** — Angenommen die Berechtigungen wurden erteilt, wenn die App startet, dann beginnt sie automatisch mit dem Scan nach einem Gerät, das die App-eigene Service-UUID bewirbt
- [ ] **AC-3** — Angenommen der Scan findet ein passendes Gerät, wenn die Verbindung ohne PIN/Bonding erfolgreich aufgebaut wird, dann zeigt der Header "Verbunden" inkl. Gerätename und die Steuerungs-UI wird nutzbar
- [ ] **AC-4** — Angenommen der Scan läuft, wenn 10 Sekunden vergehen ohne passendes Gerät, dann zeigt die App "Kein Gerät gefunden" mit einem "Erneut suchen"-Button
- [ ] **AC-5** — Angenommen Bluetooth ist beim App-Start ausgeschaltet, wenn die App das erkennt, dann zeigt sie einen Hinweis mit Button direkt zu den Bluetooth-Einstellungen des Handys
- [ ] **AC-6** — Angenommen die Bluetooth-Berechtigungen wurden abgelehnt, wenn die App das erkennt, dann zeigt sie einen Hinweis-Screen mit Erklärung und Link zu den App-Einstellungen
- [ ] **AC-7** — Angenommen die App ist verbunden, wenn die Verbindung unerwartet abbricht, dann zeigt sie sofort ein Banner "Verbindung verloren" und sperrt die Steuerungs-UI wieder
- [ ] **AC-8** — Angenommen die Verbindung ist verloren, wenn die App automatisch neu verbindet, dann versucht sie das alle 3 Sekunden für bis zu 30 Sekunden, bevor sie in den manuellen "Erneut suchen"-Zustand zurückfällt
- [ ] **AC-9** — Angenommen der Scan findet mehrere Geräte mit passender Service-UUID, wenn die App eine Verbindung aufbaut, dann verbindet sie sich automatisch mit dem zuerst gefundenen Gerät, ohne Auswahl anzuzeigen

## Edge Cases
- **EC-1** — Angenommen ein automatischer Reconnect-Versuch läuft, wenn der Nutzer auf "Erneut suchen" tippt, dann bricht die App die laufenden Versuche ab und startet sofort einen neuen Scan
- **EC-2** — Angenommen die Verbindung bricht während einer aktiven Fahrt ab, dann stoppt die Firmware den Motor eigenständig per Sicherheits-Timeout (`docs/stacks/firmware-esp32-tmc2209.md`) — die App muss dafür keinen Stop-Befehl senden können
- **EC-3** — Angenommen die App war im Hintergrund und die BLE-Verbindung wurde vom Betriebssystem getrennt, wenn die App wieder in den Vordergrund kommt, dann prüft sie den Verbindungsstatus neu und startet bei Bedarf automatisch einen neuen Scan
- **EC-4** — Angenommen der Nutzer hat die Bluetooth-Berechtigung dauerhaft abgelehnt ("nicht mehr fragen"), wenn er den Hinweis-Screen erneut sieht, dann führt der Link direkt zu den App-Einstellungen (eine erneute In-App-Abfrage würde das System stumm ignorieren)
- **EC-5** — Angenommen die App ist bereits verbunden, wenn versehentlich ein zweiter Scan ausgelöst wird (z. B. Doppel-Tipp auf "Erneut suchen"), dann wird kein zweiter, paralleler Verbindungsversuch gestartet

## Technical Requirements
- Discovery basiert auf der Service-UUID, die auch in der Firmware definiert ist (`docs/stacks/firmware-esp32-tmc2209.md`)

## Open Questions
_Keine offenen Fragen._

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Auto-Scan + Auto-Connect zur ersten passenden Service-UUID statt manueller Geräteliste | Einziger Nutzer, ein Gerät — einfachste UX | 2026-09-22 |
| Keine BLE-PIN/Bonding | Privates Hobby-Gerät, kein Schutzbedarf gegen Fremdzugriff | 2026-09-22 |
| Kein Speichern der letzten Geräte-ID | Scan per Service-UUID ist schnell genug, macht Speicherung überflüssig, vermeidet Stale-Referenz-Bug | 2026-09-22 |
| Scan-Timeout 10s, Reconnect-Versuche alle 3s für 30s | Guter Kompromiss zwischen Geduld und Feedback-Schnelligkeit | 2026-09-22 |
| Bei mehreren gefundenen Geräten: erstbestes nehmen, keine Auswahl | Tritt nur während der Entwicklung mit mehreren Prototypen auf | 2026-09-22 |
