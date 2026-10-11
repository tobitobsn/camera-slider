# PROJ-7: Drehachse (Pan)

## Dependencies
- Erfordert: PROJ-1 (BLE-Verbindung & Pairing): Dreh-Befehle und Winkelanzeige laufen über die bestehende Verbindung.
- Erfordert: PROJ-2 (Manuelle Steuerung): Das Drehen per Hand folgt denselben Regeln wie der Jog der Schiene (Halten-Tasten, Dead-man's-switch, Geschwindigkeitsregler). Der Schalter „Motor hält im Stillstand“ gilt künftig für beide Motoren.
- Erweitert: PROJ-3 (Start-/Endpunkt & Auto-Fahrt):
  - „Als Start/Ende setzen“ speichert zusätzlich den Winkel.
  - Die Auto-Fahrt bewegt beide Achsen.
  - Die Dauer-Prüfung berücksichtigt beide Achsen.
  - Die PROJ-3-Spec wird mit `/refine PROJ-3` nachgezogen, wo sie Formulierungen nur für die Schiene enthält (AC-6, AC-8, AC-11, AC-12).
- Wirkt auf: PROJ-4 (Presets) und PROJ-5 (Zeitraffer). Beide bleiben vorerst ohne Drehung, siehe AC-14 und AC-15.
- Wirkt auf: PROJ-6 (Akkuanzeige). Die Schutz-Abschaltung schaltet auch den Drehmotor stromlos.

## User Stories
- Als Slider-Besitzer möchte ich die Kamera per Halten-Tasten nach links und rechts drehen können, damit ich sie für eine Einstellung genau ausrichten kann.
- Als Slider-Besitzer möchte ich, dass „Als Start setzen“ und „Als Ende setzen“ auch die Ausrichtung der Kamera speichern, damit ich eine Fahrt mit Schwenk ohne zusätzliche Bedienschritte einrichten kann.
- Als Slider-Besitzer möchte ich, dass die Kamera während der Auto-Fahrt gleichmäßig vom Start- zum Endwinkel dreht und gleichzeitig mit dem Schlitten ankommt, damit ich Parallax-Fahrten um ein Motiv aufnehmen kann.
- Als Slider-Besitzer möchte ich auch einen reinen Schwenk ohne Bewegung auf der Schiene fahren können, damit ich Panorama-Schwenks mit derselben Bedienung bekomme.
- Als Slider-Besitzer möchte ich den aktuellen Drehwinkel in der App sehen, damit ich weiß, wo die Kamera gerade hinschaut.
- Als Slider-Besitzer möchte ich, dass die Drehung begrenzt ist, damit sich kein Kabel um die Achse wickelt.
- Als Slider-Besitzer möchte ich den Slider auch ohne montierte Drehachse wie bisher benutzen können.

## Out of Scope
- Zeitraffer mit Drehung: später per `/refine PROJ-5`. Bis dahin dreht der Zeitraffer nicht mit (AC-15).
- Winkel in Presets: später per `/refine PROJ-4`. Bis dahin speichern Presets keinen Winkel (AC-14).
- Automatisches Anpeilen eines Motivs (Tracking, Winkel aus Abstand und Position berechnet).
- Tilt (Neigung) oder weitere Achsen.
- Ein Referenzpunkt oder Endschalter für „geradeaus“. Die Mitte ist die Ausrichtung beim Einschalten.
- Erkennen, ob der Drehmotor blockiert, abgesteckt oder verrutscht ist.
- Gleichzeitiges Verschieben und Drehen per Hand.
- Ein eigener Geschwindigkeitsregler oder ein eigener Halte-Schalter für die Drehachse.
- Eine in der App einstellbare Drehgrenze.

## Acceptance Criteria
- [ ] **AC-1** — Angenommen die App ist verbunden und die Drehachse ist erkannt, wenn der Nutzer die Taste „↺ Links“ bzw. „Rechts ↻“ gedrückt hält, dann dreht sich die Kamera in diese Richtung, solange die Taste gehalten wird, und stoppt sofort beim Loslassen.
- [ ] **AC-2** — Angenommen die Drehachse ist erkannt, wenn der Nutzer dreht, dann gilt die Geschwindigkeit des bestehenden Geschwindigkeitsreglers (PROJ-2), auch wenn er während des Drehens verstellt wird.
- [ ] **AC-3** — Angenommen der Nutzer hält eine Dreh-Taste, wenn er zusätzlich die andere Dreh-Taste drückt, dann stoppt der Motor sofort, und keine Richtung dreht weiter, bis beide losgelassen und eine erneut gedrückt wird (wie PROJ-2 AC-4).
- [ ] **AC-4** — Angenommen eine Schienen-Taste wird gehalten, wenn der Nutzer den Bildschirm sieht, dann sind die Dreh-Tasten nicht bedienbar, und umgekehrt sind die Schienen-Tasten nicht bedienbar, solange eine Dreh-Taste gehalten wird.
- [ ] **AC-5** — Angenommen die App ist verbunden und die Drehachse ist erkannt, wenn der Nutzer den Hauptbildschirm sieht, dann zeigt die App den aktuellen Drehwinkel in Grad, gemessen gegenüber der Ausrichtung beim Einschalten des Sliders (z. B. „Drehung: −35°“), und aktualisiert ihn beim Drehen und während der Auto-Fahrt.
- [ ] **AC-6** — Angenommen die Kamera steht bei +180° bzw. −180° gegenüber der Ausrichtung beim Einschalten, wenn der Nutzer weiter in diese Richtung dreht, dann bleibt die Kamera an der Grenze stehen, und die App zeigt einen kurzen Hinweis, dass die Drehgrenze erreicht ist. In die Gegenrichtung lässt sie sich normal drehen.
- [ ] **AC-7** — Angenommen die App ist verbunden und die Drehachse ist erkannt, wenn der Nutzer „Als Start setzen“ bzw. „Als Ende setzen“ drückt, dann speichert der Slider für die aktuelle Sitzung neben der Schienenposition auch den aktuellen Drehwinkel als Start- bzw. Endwinkel. Ein zuvor gesetzter Wert wird überschrieben.
- [ ] **AC-8** — Angenommen Start- und Endpunkt sind gesetzt und Schiene und Drehung stehen beide am Startpunkt der gewählten Richtung, wenn der Nutzer „Start → Ende“ bzw. „Ende → Start“ auslöst, dann fahren Schlitten und Drehung gleichzeitig los, bewegen sich gleichmäßig und kommen nach der eingegebenen Dauer gleichzeitig am Ziel an.
- [ ] **AC-9** — Angenommen die Schiene oder die Drehung steht nicht am Startpunkt der jeweiligen Richtung, wenn der Nutzer diese Richtung auslösen will, dann ist der Auslöser deaktiviert (Erweiterung von PROJ-3 AC-8).
- [ ] **AC-10** — Angenommen Start und Ende liegen auf der Schiene an derselben Position, aber Start- und Endwinkel sind verschieden, wenn der Nutzer die Fahrt auslöst, dann dreht nur die Kamera, als reiner Schwenk mit der eingegebenen Dauer. Sind Position und Winkel gleich, bleibt die Fahrt wie bisher gesperrt.
- [ ] **AC-11** — Angenommen Start- und Endpunkt sind gesetzt, wenn die App eine Dauer prüft (zu kurz, zu lang, Mindestdauer, „Minimum übernehmen“), dann berücksichtigt sie beide Achsen: Gültig ist eine Dauer nur, wenn beide Achsen sie innerhalb ihrer Mindest- und Höchstgeschwindigkeit fahren können. Die angezeigte Mindestdauer ist die der langsameren Achse.
- [ ] **AC-12** — Angenommen eine Auto-Fahrt mit Drehung läuft, wenn der Nutzer „Stopp“ drückt oder die BLE-Verbindung abbricht, dann halten beide Motoren sofort an (wie PROJ-3 AC-5/AC-10).
- [ ] **AC-13** — Angenommen „Motor hält im Stillstand“ (PROJ-2) ist eingeschaltet bzw. ausgeschaltet, wenn der Drehmotor stoppt, dann hält er die Kamera mit reduziertem Strom in ihrer Ausrichtung bzw. ist stromlos, genau wie der Schienenmotor. Die Schutz-Abschaltung aus PROJ-6 schaltet auch den Drehmotor stromlos.
- [ ] **AC-14** — Angenommen der Nutzer lädt ein Preset (PROJ-4), wenn der Endpunkt daraus gesetzt wird, dann wird der Endwinkel gleich dem Startwinkel gesetzt, die Fahrt läuft also ohne Drehung. Beim Speichern eines Presets wird kein Winkel gespeichert.
- [ ] **AC-15** — Angenommen Start- und Endwinkel sind verschieden, wenn der Nutzer einen Zeitraffer (PROJ-5) startet, dann fährt nur die Schiene, und die Kamera bleibt in ihrer aktuellen Ausrichtung. Die App weist kurz darauf hin, dass der Zeitraffer die Kamera nicht mitdreht.
- [ ] **AC-16** — Angenommen der Slider erkennt beim Einschalten keine Drehachse (zweiter Treiber antwortet nicht), wenn der Nutzer die App verbindet, dann sind Dreh-Tasten und Winkelanzeige ausgeblendet, und alle Funktionen arbeiten wie bisher nur mit der Schiene. Die App zeigt höchstens einen unauffälligen Hinweis „Drehachse nicht erkannt“ und keine Fehlermeldung.

## Edge Cases
- **EC-1** — Angenommen der Nutzer hält eine Dreh-Taste und zieht den Finger aus dem Button-Bereich, dann zählt das als Loslassen, und der Motor stoppt (wie PROJ-2 EC-1).
- **EC-2** — Angenommen die BLE-Verbindung bricht während des Drehens per Hand ab oder die App sendet länger als ca. 1 Sekunde kein Halte-Signal, dann stoppt die Firmware den Drehmotor eigenständig (wie PROJ-2 AC-5/AC-6).
- **EC-3** — Angenommen die Drehgrenze (AC-6) würde während einer Auto-Fahrt erreicht, dann kann das nicht passieren: Start- und Endwinkel liegen durch AC-6 immer innerhalb von ±180°, und die Fahrt dreht nur zwischen ihnen.
- **EC-4** — Angenommen der Slider wird neu gestartet, dann beginnt die Winkelzählung neu bei 0° für die dann aktuelle Ausrichtung, und Start- und Endpunkt samt Winkeln sind nicht mehr gesetzt (wie PROJ-3 EC-3).
- **EC-5** — Angenommen die App verbindet sich neu, ohne dass der Slider neu gestartet wurde, dann zeigt sie den Winkel, den der Slider meldet. Die Zählung läuft auf dem Slider weiter und hängt nicht an der App.
- **EC-6** — Angenommen die Kamera wird bei stromlosem Motor von Hand verdreht oder der Drehmotor verliert Schritte, dann stimmen Winkelanzeige, Drehgrenze und gespeicherte Winkel nicht mehr. Das ist eine bekannte Grenze ohne Endschalter, und die App erkennt es nicht.
- **EC-7** — Angenommen eine Auto-Fahrt läuft, dann sind auch die Dreh-Tasten nicht bedienbar, und nur der Stopp-Button ist bedienbar (wie PROJ-3 AC-9).
- **EC-8** — Angenommen der Slider ist nach einem Schutz-Stopp gesperrt (PROJ-6), dann sind die Dreh-Tasten wie die übrigen Bewegungs-Bedienelemente nicht bedienbar.

## Technical Requirements
- Hardware Drehachse: NEMA-17-Pancake-Schrittmotor, 1,8°/Schritt, 1,0 A, Zahnriemen-Untersetzung 20:60 (3:1, GT2, 200 mm geschlossener Riemen), eigener zweiter TMC2209-Treiber. Verdrahtung und Pins entscheidet `/architecture` mit dem Nutzer.
- Grenzen für Drehgeschwindigkeit und Haltestrom des Drehmotors entscheidet `/architecture`, passend zu Motor und Untersetzung.
- Keine personenbezogenen Daten: Das Feature speichert nur Winkel für die laufende Sitzung auf dem Slider.

## Open Questions
- [ ] Ist der zweite TMC2209 schon verdrahtet, an welchen Pins, und mit welcher UART-Adresse? Klären in `/architecture`.
- [ ] Welche Drehgeschwindigkeit ist für glatte Schwenks sinnvoll, und ab wann ruckelt die Kamera bzw. das Handy auf dem Drehteller? Klären im Hardwaretest.
- [ ] Wie stark verkürzt der zweite Motor, vor allem beim Halten im Stillstand, die Akkulaufzeit? Messen im Hardwaretest, zusammen mit PROJ-2 Schritt 8.

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Kern ist Schwenk zwischen Start- und Endwinkel während der Auto-Fahrt, plus Drehen per Hand zum Einrichten | Parallax-Fahrten sind der Hauptnutzen. Drehen per Hand ist nötig, um die Winkel zu setzen. Zeitraffer, Presets und Tracking kommen später als eigene Ausbaustufen | 2026-10-12 |
| „Als Start/Ende setzen“ speichert Position und Winkel zusammen, keine eigenen Buttons | Kein zusätzlicher Bedienschritt, die Fahrt wird wie bisher eingerichtet | 2026-10-12 |
| Drehung auf ±180° gegenüber der Ausrichtung beim Einschalten begrenzt | Ohne Endschalter weiß der Slider nur die relative Drehung. Die Grenze verhindert, dass sich ein Kabel aufwickelt. Die Mitte legt der Nutzer fest, indem er die Kamera vor dem Einschalten ausrichtet | 2026-10-12 |
| Zweite Reihe Halten-Tasten unter den Schienen-Tasten, gemeinsamer Geschwindigkeitsregler, Winkelanzeige in Grad | Gleiche Bedienlogik wie bei der Schiene, kein zusätzlicher Regler | 2026-10-12 |
| Kein gleichzeitiges Verschieben und Drehen per Hand | Einfache und sichere Bedienung. Kombinierte Bewegungen macht die Auto-Fahrt | 2026-10-12 |
| Schalter „Motor hält im Stillstand“ gilt für beide Motoren | Die Kamera soll sich nicht durch Kabelzug oder Stoß verdrehen. Ein zweiter Schalter würde die Bedienung unübersichtlich machen | 2026-10-12 |
| Beide Achsen starten und kommen gleichzeitig an, ein reiner Schwenk ist erlaubt | Gleichmäßige Parallax-Bewegung. Ein reiner Schwenk ist mit derselben Bedienung ein Bonus | 2026-10-12 |
| Dauer-Prüfung über beide Achsen, die langsamere bestimmt die Mindestdauer | Keine Achse darf über ihre Höchst- oder unter ihre Mindestgeschwindigkeit fahren | 2026-10-12 |
| Ohne erkannte Drehachse läuft alles wie bisher, die Dreh-Bedienung ist ausgeblendet | Der Slider bleibt auch ohne den Aufbau voll nutzbar | 2026-10-12 |
| Zeitraffer dreht nicht mit, Presets speichern keinen Winkel, beim Laden ist der Endwinkel gleich dem Startwinkel | Hält PROJ-7 klein. Die Erweiterungen kommen später per `/refine PROJ-5` und `/refine PROJ-4` | 2026-10-12 |
