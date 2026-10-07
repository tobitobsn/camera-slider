# PROJ-2: Manuelle Steuerung (Jog)

## Dependencies
- Erfordert: PROJ-1 (BLE-Verbindung & Pairing) — Jog-Befehle laufen über die bestehende BLE-Verbindung
- Wirkt auf: PROJ-3 (Auto-Fahrt) und PROJ-5 (Zeitraffer) — das Halten im Stillstand (AC-8 bis AC-12) gilt für den Motor insgesamt, also auch nach einer Auto-Fahrt und zwischen zwei Zeitraffer-Schritten; deren Specs ändern sich dadurch nicht
- Wird übersteuert von: PROJ-6 (Akkuanzeige) — die Schutz-Abschaltung (PROJ-6 AC-12) schaltet den Motor stromlos, egal wie der Schalter steht (EC-7)

## User Stories
- Als Slider-Besitzer möchte ich den Slider per Halten-Buttons manuell in beide Richtungen fahren können, damit ich die Position frei und in Echtzeit einstellen kann
- Als Slider-Besitzer möchte ich die Fahrgeschwindigkeit per Schieberegler live anpassen können, damit ich für unterschiedliche Aufnahmesituationen die passende Geschwindigkeit wähle
- Als Slider-Besitzer möchte ich, dass der Motor sofort stoppt, wenn ich loslasse oder Verbindung/App ausfällt, damit der Schlitten nie unkontrolliert von der Schiene fährt
- Als Slider-Besitzer möchte ich, dass beide Richtungstasten gleichzeitig zu einem sicheren Stopp führen, damit ein Versehen beim Bedienen nicht zu unvorhersehbarem Verhalten führt
- Als Slider-Besitzer möchte ich, dass der Motor den Schlitten im Stillstand festhält, damit er auf schräg aufgestellter Schiene nicht von allein wegrutscht — und ich möchte das in der App abschalten können, wenn ich auf ebener Schiene Akku sparen will

## Out of Scope
- Automatische Fahrt zwischen Start-/Endpunkt (PROJ-3)
- Presets-Verwaltung (PROJ-4)
- Zeitraffer-Modus (PROJ-5)
- Physische/programmierte Endanschläge oder Kalibrierung — der Nutzer behält durch Halten/Loslassen die volle Kontrolle
- Anzeige der Geschwindigkeit in mm/s (nur Prozent-Regler; echte Kalibrierung folgt später)
- Einstellbare Höhe des Haltestroms in der App — vorerst ein fester Wert in der Firmware (siehe Technical Requirements), nur an/aus ist einstellbar
- Erkennen, ob der Schlitten trotz Haltemoment verrutscht ist (keine Positionsrückmeldung/Endschalter vorhanden)

## Acceptance Criteria
- [ ] **AC-1** — Angenommen die App ist mit dem Slider verbunden, wenn der Nutzer eine Richtungstaste (Vorwärts oder Rückwärts) gedrückt hält, dann fährt der Slider in der entsprechenden Richtung, solange die Taste gehalten wird
- [ ] **AC-2** — Angenommen der Slider fährt gerade durch eine gehaltene Richtungstaste, wenn der Nutzer die Taste loslässt, dann stoppt der Motor sofort
- [ ] **AC-3** — Angenommen die App ist verbunden, wenn der Nutzer den Geschwindigkeits-Schieberegler verstellt (auch während eine Richtungstaste gehalten wird), dann wird die neue Geschwindigkeit sofort übernommen
- [ ] **AC-4** — Angenommen der Nutzer hält eine Richtungstaste, wenn er zusätzlich die andere Richtungstaste drückt, dann stoppt der Motor sofort, und keine Richtung fährt weiter, bis beide Tasten losgelassen und eine erneut gedrückt wird
- [ ] **AC-5** — Angenommen der Slider fährt per Jog, wenn die BLE-Verbindung unerwartet abbricht, dann stoppt die Firmware den Motor eigenständig, unabhängig von der App, und die App zeigt den bestehenden "Verbindung verloren"-Zustand aus PROJ-1
- [ ] **AC-6** — Angenommen eine Richtungstaste wird gehalten, wenn die App länger als ca. 1 Sekunde kein Halte-Signal mehr senden kann (Absturz, Hintergrund, Paketverlust), dann stoppt die Firmware den Motor eigenständig
- [ ] **AC-7** — Angenommen die App ist nicht verbunden, wenn der Nutzer den Hauptbildschirm sieht, dann sind die Jog-Steuerelemente nicht bedienbar (Platzhalter aus PROJ-1 bleibt sichtbar)
- [ ] **AC-8** — Angenommen „Halten im Stillstand“ ist eingeschaltet, wenn der Motor nach einer Fahrt (Jog, Auto-Fahrt, Zeitraffer-Schritt) stoppt, dann bleibt er mit reduziertem Haltestrom bestromt und hält den Schlitten auch auf geneigter Schiene an seiner Position, bis die nächste Fahrt beginnt
- [ ] **AC-9** — Angenommen „Halten im Stillstand“ ist ausgeschaltet, wenn der Motor stoppt, dann wird er stromlos geschaltet (Verhalten wie bisher)
- [ ] **AC-10** — Angenommen die App ist verbunden, wenn der Nutzer den Hauptbildschirm sieht, dann zeigt die Jog-Steuerung unter dem Geschwindigkeitsregler einen Schalter „Motor hält im Stillstand“ mit dem Zustand, den der Slider meldet; ein Umschalten wirkt sofort — auch auf einen gerade stehenden Motor
- [ ] **AC-11** — Angenommen der Nutzer hat den Schalter umgestellt, wenn die Verbindung abbricht, die App geschlossen oder der Slider neu gestartet wird, dann behält der Slider die zuletzt gewählte Einstellung und wendet sie auch ohne verbundene App an
- [ ] **AC-12** — Angenommen der Slider wurde noch nie umgestellt (Auslieferungszustand), wenn er startet, dann ist „Halten im Stillstand“ eingeschaltet; der Motor wird beim Einschalten trotzdem erst mit der ersten Fahrt bestromt

## Edge Cases
- **EC-1** — Angenommen der Nutzer hält eine Richtungstaste und zieht den Finger aus dem Button-Bereich heraus statt ihn direkt loszulassen, dann zählt das trotzdem als Loslassen, und der Motor stoppt
- **EC-2** — Angenommen beide Richtungstasten werden gleichzeitig gedrückt, dann stoppt der Motor sofort (siehe AC-4), keine Richtung hat Vorrang
- **EC-3** — Angenommen die Verbindung bricht während einer Jog-Fahrt ab, dann stoppt die Firmware eigenständig, ohne auf ein Signal der App zu warten (siehe AC-5)
- **EC-4** — Angenommen die App sendet aus irgendeinem Grund länger als die Timeout-Schwelle kein Halte-Signal, während eine Taste eigentlich noch gehalten wird, dann stoppt die Firmware eigenständig (siehe AC-6) — auch wenn die BLE-Verbindung selbst formal noch besteht
- **EC-5** — Angenommen die Verbindung wird nach einem Abbruch während einer Jog-Fahrt wiederhergestellt, dann zeigt die App die Steuerung im gestoppten Ausgangszustand (keine Richtungstaste optisch aktiv) — nie einen Zustand, der eine noch laufende Fahrt suggeriert
- **EC-6** — Angenommen der Nutzer schaltet „Halten im Stillstand“ während einer laufenden Fahrt um, dann läuft die Fahrt unverändert weiter, und die neue Einstellung gilt ab dem nächsten Stopp
- **EC-7** — Angenommen der Slider ist nach einem Schutz-Stopp gesperrt (PROJ-6), dann ist der Motor stromlos, auch wenn „Halten im Stillstand“ eingeschaltet ist, und der Schalter ist wie die übrigen Bewegungs-Bedienelemente nicht bedienbar
- **EC-8** — Angenommen die Verbindung bricht ab, während der Motor im Stillstand hält, dann hält er weiter — ein Verbindungsabbruch schaltet den Motor nur während einer Fahrt ab (AC-5), nicht im Stillstand
- **EC-9** — Angenommen der Schalter wird umgestellt, die Bestätigung des Sliders bleibt aber aus (Verbindungsabbruch im selben Moment), dann zeigt die App nach dem Wiederverbinden den Zustand, den der Slider meldet — nie einen nur in der App angenommenen

## Technical Requirements
- Geschwindigkeit wird als 0–100%-Wert übertragen; die genaue physikalische Umrechnung (mm/s, Steps/s) hängt von der noch ausstehenden Steps-pro-mm-Kalibrierung der Mechanik ab (siehe `docs/stacks/firmware-esp32-tmc2209.md`) — technische Entscheidung von `/architecture`
- Haltestrom im Stillstand: vorerst **60 % des Fahrstroms** (1,7 A → ca. 1,0 A), als ein fester, leicht änderbarer Wert in der Firmware; der Übergang vom Fahr- zum Haltestrom erfolgt ohne Ruck. Der Wert wird im Hardwaretest auf geneigter Schiene überprüft (Open Question)
- Die Einstellung „Halten im Stillstand“ wird dauerhaft auf dem Slider (ESP32) gespeichert, nicht auf dem Handy; die App liest sie beim Verbinden vom Slider

## Open Questions
- [ ] Exakte Geschwindigkeitsbereiche (mm/s) stehen erst nach der mechanischen Kalibrierung fest
- [ ] Reichen 60 % Haltestrom bei der schrägsten geplanten Aufstellung mit der schwersten Kamera, und wie warm werden Motor und Treiber bei dauerhaftem Halten? → Hardwaretest nach `/build`; falls nötig Wert anpassen
- [ ] Wie stark verkürzt dauerhaftes Halten die Akkulaufzeit (3S, 3× 18650)? → messen im Hardwaretest

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Halten-Buttons statt Tippen-für-feste-Distanz | Echtzeitkontrolle, sicherer für ein bewegliches Gerät ohne Endschalter | 2026-09-23 |
| Geschwindigkeit als Prozent-Schieberegler (0–100%), jederzeit verstellbar | Einfach, keine Kalibrierung für den Regler-Wert selbst nötig | 2026-09-23 |
| Beide Richtungstasten gleichzeitig → sofortiger Stopp | Sicherer als "eine Richtung gewinnt" | 2026-09-23 |
| Dead-man's-switch: Halte-Signal alle ~300ms, Firmware stoppt eigenständig nach ~1s ohne Signal | Schützt vor App-Absturz/Hintergrund/Paketverlust, unabhängig vom offiziellen Verbindungsstatus | 2026-09-23 |
| Kein zusätzlicher Jog-spezifischer Fehlerhinweis bei Verbindungsabbruch | PROJ-1s bestehender "Verbindung verloren"-Zustand reicht aus | 2026-09-23 |
| Motor hält den Schlitten im Stillstand mit reduziertem Strom, abschaltbar in der App | Praxisbefund: auf geneigter Schiene reicht das Rastmoment des stromlosen Motors nicht, der Schlitten rutscht weg (und die gespeicherten Punkte stimmen danach nicht mehr); abschaltbar, um auf ebener Schiene Akku und Wärme zu sparen | 2026-10-07 |
| Haltestrom vorerst 60 % des Fahrstroms | Kompromiss aus Haltemoment und Wärme/Akku; ein Startwert, der im Hardwaretest bestätigt oder angepasst wird | 2026-10-07 |
| Einstellung im Slider gespeichert, ab Werk an | Die Kamera soll auch nach Verbindungsabbruch oder Neustart des Sliders gehalten werden — nur eine Einstellung auf dem Gerät selbst gilt ohne App | 2026-10-07 |
| Schalter bei der Jog-Steuerung unter dem Geschwindigkeitsregler | Die App hat nur eine Seite; dort ist er beim Aufbauen des Sliders zur Hand und selbsterklärend | 2026-10-07 |
| Im Stillstand schaltet ein Verbindungsabbruch den Motor nicht ab | Der Abbruch-Stopp (AC-5) schützt vor unkontrollierter Fahrt; ein stehender, haltender Motor fährt nicht — ihn abzuschalten würde genau das Wegrutschen auslösen | 2026-10-07 |
