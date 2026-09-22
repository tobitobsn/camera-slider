# PROJ-2: Manuelle Steuerung (Jog)

## Dependencies
- Erfordert: PROJ-1 (BLE-Verbindung & Pairing) — Jog-Befehle laufen über die bestehende BLE-Verbindung

## User Stories
- Als Slider-Besitzer möchte ich den Slider per Halten-Buttons manuell in beide Richtungen fahren können, damit ich die Position frei und in Echtzeit einstellen kann
- Als Slider-Besitzer möchte ich die Fahrgeschwindigkeit per Schieberegler live anpassen können, damit ich für unterschiedliche Aufnahmesituationen die passende Geschwindigkeit wähle
- Als Slider-Besitzer möchte ich, dass der Motor sofort stoppt, wenn ich loslasse oder Verbindung/App ausfällt, damit der Schlitten nie unkontrolliert von der Schiene fährt
- Als Slider-Besitzer möchte ich, dass beide Richtungstasten gleichzeitig zu einem sicheren Stopp führen, damit ein Versehen beim Bedienen nicht zu unvorhersehbarem Verhalten führt

## Out of Scope
- Automatische Fahrt zwischen Start-/Endpunkt (PROJ-3)
- Presets-Verwaltung (PROJ-4)
- Zeitraffer-Modus (PROJ-5)
- Physische/programmierte Endanschläge oder Kalibrierung — der Nutzer behält durch Halten/Loslassen die volle Kontrolle
- Anzeige der Geschwindigkeit in mm/s (nur Prozent-Regler; echte Kalibrierung folgt später)

## Acceptance Criteria
- [ ] **AC-1** — Angenommen die App ist mit dem Slider verbunden, wenn der Nutzer eine Richtungstaste (Vorwärts oder Rückwärts) gedrückt hält, dann fährt der Slider in der entsprechenden Richtung, solange die Taste gehalten wird
- [ ] **AC-2** — Angenommen der Slider fährt gerade durch eine gehaltene Richtungstaste, wenn der Nutzer die Taste loslässt, dann stoppt der Motor sofort
- [ ] **AC-3** — Angenommen die App ist verbunden, wenn der Nutzer den Geschwindigkeits-Schieberegler verstellt (auch während eine Richtungstaste gehalten wird), dann wird die neue Geschwindigkeit sofort übernommen
- [ ] **AC-4** — Angenommen der Nutzer hält eine Richtungstaste, wenn er zusätzlich die andere Richtungstaste drückt, dann stoppt der Motor sofort, und keine Richtung fährt weiter, bis beide Tasten losgelassen und eine erneut gedrückt wird
- [ ] **AC-5** — Angenommen der Slider fährt per Jog, wenn die BLE-Verbindung unerwartet abbricht, dann stoppt die Firmware den Motor eigenständig, unabhängig von der App, und die App zeigt den bestehenden "Verbindung verloren"-Zustand aus PROJ-1
- [ ] **AC-6** — Angenommen eine Richtungstaste wird gehalten, wenn die App länger als ca. 1 Sekunde kein Halte-Signal mehr senden kann (Absturz, Hintergrund, Paketverlust), dann stoppt die Firmware den Motor eigenständig
- [ ] **AC-7** — Angenommen die App ist nicht verbunden, wenn der Nutzer den Hauptbildschirm sieht, dann sind die Jog-Steuerelemente nicht bedienbar (Platzhalter aus PROJ-1 bleibt sichtbar)

## Edge Cases
- **EC-1** — Angenommen der Nutzer hält eine Richtungstaste und zieht den Finger aus dem Button-Bereich heraus statt ihn direkt loszulassen, dann zählt das trotzdem als Loslassen, und der Motor stoppt
- **EC-2** — Angenommen beide Richtungstasten werden gleichzeitig gedrückt, dann stoppt der Motor sofort (siehe AC-4), keine Richtung hat Vorrang
- **EC-3** — Angenommen die Verbindung bricht während einer Jog-Fahrt ab, dann stoppt die Firmware eigenständig, ohne auf ein Signal der App zu warten (siehe AC-5)
- **EC-4** — Angenommen die App sendet aus irgendeinem Grund länger als die Timeout-Schwelle kein Halte-Signal, während eine Taste eigentlich noch gehalten wird, dann stoppt die Firmware eigenständig (siehe AC-6) — auch wenn die BLE-Verbindung selbst formal noch besteht
- **EC-5** — Angenommen die Verbindung wird nach einem Abbruch während einer Jog-Fahrt wiederhergestellt, dann zeigt die App die Steuerung im gestoppten Ausgangszustand (keine Richtungstaste optisch aktiv) — nie einen Zustand, der eine noch laufende Fahrt suggeriert

## Technical Requirements
- Geschwindigkeit wird als 0–100%-Wert übertragen; die genaue physikalische Umrechnung (mm/s, Steps/s) hängt von der noch ausstehenden Steps-pro-mm-Kalibrierung der Mechanik ab (siehe `docs/stacks/firmware-esp32-tmc2209.md`) — technische Entscheidung von `/architecture`

## Open Questions
- [ ] Exakte Geschwindigkeitsbereiche (mm/s) stehen erst nach der mechanischen Kalibrierung fest

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Halten-Buttons statt Tippen-für-feste-Distanz | Echtzeitkontrolle, sicherer für ein bewegliches Gerät ohne Endschalter | 2026-09-23 |
| Geschwindigkeit als Prozent-Schieberegler (0–100%), jederzeit verstellbar | Einfach, keine Kalibrierung für den Regler-Wert selbst nötig | 2026-09-23 |
| Beide Richtungstasten gleichzeitig → sofortiger Stopp | Sicherer als "eine Richtung gewinnt" | 2026-09-23 |
| Dead-man's-switch: Halte-Signal alle ~300ms, Firmware stoppt eigenständig nach ~1s ohne Signal | Schützt vor App-Absturz/Hintergrund/Paketverlust, unabhängig vom offiziellen Verbindungsstatus | 2026-09-23 |
| Kein zusätzlicher Jog-spezifischer Fehlerhinweis bei Verbindungsabbruch | PROJ-1s bestehender "Verbindung verloren"-Zustand reicht aus | 2026-09-23 |
