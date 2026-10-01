# PROJ-6: Akkuanzeige

## Dependencies
- Erfordert: PROJ-1 (BLE-Verbindung & Pairing) — der Messwert kommt über die bestehende Verbindung, die Anzeige sitzt im Verbindungs-Header
- Betrifft: PROJ-2 (Jog), PROJ-3 (Auto-Fahrt), PROJ-5 (Zeitraffer) — der Schutz-Stopp hält jede Bewegungsart an und sperrt neue; die Warnung vor dem Start gilt für Auto-Fahrt und Zeitraffer
- Hardware-Voraussetzung: Spannungsteiler vom Akku-Plus auf GPIO 34 (82 kΩ + 22 kΩ oben, 22 kΩ unten, 100 nF gegen GND, gemeinsame Masse) — verbaut am 2026-09-30

## User Stories
- Als Slider-Besitzer möchte ich den Ladezustand des Akkus jederzeit in der App sehen, damit ich weiß, ob er für die geplante Aufnahme reicht
- Als Slider-Besitzer möchte ich rechtzeitig gewarnt werden, wenn der Akku zur Neige geht, damit mir eine lange Aufnahme nicht mittendrin abbricht
- Als Slider-Besitzer möchte ich vor dem Start eines Zeitraffers oder einer Auto-Fahrt bei fast leerem Akku nachgefragt werden, damit ich bewusst entscheide, ob ich trotzdem starte
- Als Slider-Besitzer möchte ich, dass der Slider meine 18650-Zellen (ohne BMS) vor Tiefentladung schützt — auch nach dem Stopp, durch Abschalten der Elektronik, und auch wenn die App gerade nicht verbunden ist —, damit die Zellen nicht beschädigt werden
- Als Slider-Besitzer möchte ich erfahren, wenn die Akkumessung selbst ausfällt, damit ein unbemerkt abgeschalteter Schutz meine Zellen nicht gefährdet
- Als Slider-Besitzer möchte ich den Slider weiterhin per USB am Rechner betreiben und testen können, ohne dass eine fehlende Akkuspannung als „leer" gewertet wird

## Out of Scope
- Anzeige der Spannung in Volt (nur Prozent + Symbol)
- Verlauf/Historie des Akkustands, Restlaufzeit-Schätzung
- Ladeerkennung oder Ladestandsanzeige beim Laden
- Einzelzellen-Überwachung und Balancing (nur die Gesamtspannung des 3S-Packs wird gemessen)
- Einstellbare Warnschwellen in der App (feste Werte)
- Jog bei gesperrtem Slider nach Schutz-Stopp (Schlitten muss dann von Hand bewegt werden)
- Automatische Aufhebung der Sperre, wenn die Spannung sich erholt (nur durch Neustart des ESP32)
- Warnung/Nachfrage vor einem Jog (Jog ist kurz und unter direkter Kontrolle)
- Vollständige Abschaltung des Akkus (Nullverbrauch): Step-down-Wandler, Spannungsteiler und Treiber-Versorgung ziehen auch im Tiefschlaf weiter wenige mA — echter Schutz nur durch Hardware (Schalter oder Unterspannungs-Abschaltmodul); die App/Spec empfiehlt, den Slider nach einem Schutz-Stopp auszuschalten

## Acceptance Criteria
- [ ] **AC-1** — Angenommen die App ist mit dem Slider verbunden und ein Akku ist erkannt, wenn der Nutzer den Hauptbildschirm sieht, dann zeigt der Verbindungs-Header den Ladezustand als Akku-Symbol mit Prozentwert (z. B. „🔋 78 %") an
- [ ] **AC-2** — Angenommen der Motor steht still, wenn sich der Ladezustand ändert, dann wird die Anzeige spätestens nach 30 Sekunden aktualisiert — auch in den Pausen zwischen den Aufnahmen eines laufenden Zeitraffers
- [ ] **AC-3** — Angenommen eine durchgehende Bewegung läuft (Jog, Auto-Fahrt, einzelne Zeitraffer-Fahrt), wenn die Anzeige sichtbar ist, dann zeigt sie weiter den letzten im Stillstand gemessenen Wert, sichtbar abgeschwächt (ausgegraut), und aktualisiert sich erst nach dem Ende der Bewegung
- [ ] **AC-4** — Angenommen ein Akku ist erkannt, wenn der Ladezustand unter 20 % liegt, dann wird die Akkuanzeige orange dargestellt; es wird nichts blockiert
- [ ] **AC-5** — Angenommen ein Akku ist erkannt, wenn der Ladezustand unter 10 % liegt, dann wird die Akkuanzeige rot dargestellt
- [ ] **AC-6** — Angenommen der Ladezustand liegt unter 10 %, wenn der Nutzer „Zeitraffer starten" oder eine Auto-Fahrt („Start → Ende" / „Ende → Start") auslöst, dann fragt die App „Akku fast leer – Fahrt trotzdem starten?" und startet nur nach Bestätigung; bei Abbruch passiert nichts
- [ ] **AC-7** — Angenommen ein Akku ist erkannt und eine Bewegung läuft, wenn die Akkuspannung mindestens 5 Sekunden ununterbrochen unter 9,3 V liegt, dann stoppt die Firmware die Bewegung eigenständig — unabhängig davon, ob die App verbunden ist
- [ ] **AC-8** — Angenommen der Schutz-Stopp hat ausgelöst (oder die Spannung lag im Stillstand 5 Sekunden unter 9,3 V), wenn danach ein Jog, eine Auto-Fahrt oder ein Zeitraffer angefordert wird, dann führt die Firmware ihn nicht aus — die Sperre bleibt bis zum Neustart des ESP32 (z. B. durch Akkuwechsel) bestehen
- [ ] **AC-9** — Angenommen der Slider ist gesperrt, wenn die App verbunden ist, dann zeigt sie dauerhaft „Akku leer – bitte laden", und alle Bewegungs-Bedienelemente (Jog, Auto-Fahrt, Zeitraffer-Start) sind nicht bedienbar
- [ ] **AC-10** — Angenommen ein Zeitraffer läuft, wenn der Schutz-Stopp auslöst, dann beendet die App die Sequenz mit der Meldung „Akku leer – Bewegung gestoppt" (keine weitere Aufnahme, keine Rückfahrt)
- [ ] **AC-11** — Angenommen die gemessene Spannung liegt unter 5 V (kein Akku erkannt, z. B. Betrieb nur über USB oder Spannungsteiler nicht verbaut), wenn die App verbunden ist, dann zeigt der Header „🔋 –" ohne Warnfarbe, es gibt keine Nachfrage vor dem Start, und der Schutz-Stopp ist nicht aktiv — alle Bewegungen funktionieren normal
- [ ] **AC-12** — Angenommen der Schutz-Stopp hat ausgelöst (AC-7/AC-8), wenn die Sperre aktiv wird, dann schaltet die Firmware sofort den Motortreiber stromlos, bleibt noch 60 Sekunden per Bluetooth erreichbar (die App zeigt in dieser Zeit „Akku leer – Slider schaltet sich in 60 s ab") und versetzt den ESP32 danach in den Tiefschlaf — er ist dann bis zum Neustart (Akkuwechsel oder Reset) aus; die App zeigt anschließend ihren normalen Zustand für eine verlorene Verbindung
- [ ] **AC-13** — Angenommen seit dem Start des ESP32 wurde ein Akku erkannt (Messwert ≥ 5 V), wenn der Messwert danach mindestens 5 Sekunden ununterbrochen unter 5 V liegt (Messung ausgefallen, z. B. Spannungsteiler gelöst), dann behandelt die Firmware das wie einen leeren Akku (Stopp, Sperre, Abschaltung nach AC-12), und die App zeigt „Akkumessung gestört – bitte Verkabelung prüfen" statt „Akku leer"

## Edge Cases
- **EC-1** — Angenommen der Motor fährt mit hoher Geschwindigkeit an und die Spannung bricht dabei kurz unter 9,3 V ein, wenn sie sich innerhalb von 5 Sekunden wieder erholt, dann löst der Schutz-Stopp nicht aus und die Anzeige springt nicht
- **EC-2** — Angenommen die App ist nicht verbunden (Absturz, Hintergrund, Bluetooth aus), wenn der Akku während einer Bewegung die Schutzschwelle unterschreitet, dann stoppt die Firmware trotzdem (siehe AC-7); beim nächsten Verbinden zeigt die App sofort den gesperrten Zustand (AC-9)
- **EC-3** — Angenommen die Spannung erholt sich nach dem Schutz-Stopp im Ruhezustand wieder über 9,3 V, wenn eine neue Bewegung angefordert wird, dann bleibt der Slider trotzdem gesperrt (AC-8) — kein Wechsel zwischen Anlaufen und Stoppen
- **EC-4** — Angenommen der Slider wurde per USB gestartet (kein Akku erkannt), wenn danach ein Akku angeschlossen wird und der Messwert über 5 V steigt, dann wechselt die Anzeige von „🔋 –" auf den Prozentwert, ohne Fehlermeldung. Die Gegenrichtung (Akku war erkannt, Messwert fällt ohne Neustart unter 5 V) ist kein Wechsel auf „🔋 –", sondern AC-13 — auch wenn dabei USB angesteckt ist (z. B. zum Flashen im Akkubetrieb, dann Akku abgezogen)
- **EC-5** — Angenommen die Verbindung wird hergestellt, wenn noch kein Messwert vorliegt (direkt nach dem Start des ESP32), dann zeigt der Header „🔋 –" bis zum ersten gültigen Wert
- **EC-6** — Angenommen der Nutzer bestätigt die Nachfrage bei unter 10 % und startet einen Zeitraffer, wenn der Akku während der Sequenz die Schutzschwelle erreicht, dann greift AC-10 — die Bestätigung setzt den Schutz-Stopp nicht außer Kraft
- **EC-7** — Angenommen der ESP32 startet im USB-Betrieb und es wurde seit dem Start nie ein Akku erkannt (Messwert immer < 5 V), dann gilt weiter AC-11: „🔋 –", kein Schutz-Stopp, keine Sperre, keine Abschaltung
- **EC-8** — Angenommen während der 60 Sekunden bis zur Abschaltung (AC-12) verbindet sich die App neu oder erst jetzt, dann sieht sie sofort den gesperrten Zustand und die Abschalt-Meldung
- **EC-9** — Angenommen ein Akku ist erkannt und leer, wenn der Messwert durch einen Wackelkontakt am Spannungsteiler zwischen „leer" (5–9,3 V) und „unter 5 V" springt, dann zählen beide Bereiche gemeinsam: nach 5 Sekunden ununterbrochen unter 9,3 V sperrt die Firmware (AC-7) — mit der Meldung „Akkumessung gestört", weil die Strecke Werte unter 5 V enthielt

## Technical Requirements (optional)
- Akku: 3× 18650 in Reihe (3S), ohne BMS; Spannungsbereich ca. 9,0 V (leer) bis 12,6 V (voll)
- Schutz-Schwelle 9,3 V (ca. 3,1 V pro Zelle), 5 Sekunden ununterbrochen; „kein Akku erkannt" unter 5 V
- Die Umrechnung Spannung → Prozent ist eine Näherung über die Entladekennlinie von Li-Ionen-Zellen — Verfahren und Kennlinie entscheidet `/architecture`
- Der Schutz-Stopp muss in der Firmware liegen (wirkt ohne App), die Anzeige/Warnung in der App

## Open Questions
_Keine offenen Fragen._

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Anzeige als Prozent + Akku-Symbol im Verbindungs-Header, ohne Volt | Immer sichtbar, unabhängig vom Scrollen; Volt ist im Alltag wenig aussagekräftig | 2026-09-30 |
| Zwei Warnstufen: < 20 % orange (nur Hinweis), < 10 % rot + Nachfrage vor Zeitraffer/Auto-Fahrt | Frühe, nicht störende Vorwarnung; bewusste Entscheidung vor langen Fahrten, ohne den Nutzer zu bevormunden | 2026-09-30 |
| Schutz-Stopp in der Firmware bei < 9,3 V über 5 s, wirkt auf alle Bewegungen | Akkupack hat kein BMS — Tiefentladung würde die Zellen beschädigen; Firmware wirkt auch ohne App | 2026-09-30 |
| Sperre nach Schutz-Stopp bleibt bis zum Neustart des ESP32, auch für Jog | Verhindert Pendeln zwischen Anlaufen und Stoppen, wenn sich die Spannung im Ruhezustand erholt; einfachste sichere Lösung | 2026-09-30 |
| Messwert nur im Stillstand aktualisieren, während Bewegung letzten Wert ausgegraut zeigen | Spannung sinkt unter Last — sonst springende Anzeige; im Zeitraffer wird in jeder Pause gemessen | 2026-09-30 |
| Messwert < 5 V = „kein Akku erkannt": keine Warnung, kein Schutz-Stopp | USB-Betrieb beim Flashen/Testen und Betrieb vor dem Hardware-Einbau müssen weiter funktionieren | 2026-09-30 |
| Nach dem Schutz-Stopp Motortreiber stromlos, 60 s Frist, dann Tiefschlaf des ESP32 bis zum Neustart (AC-12) | QA-Befund BUG-1 (High): die Sperre allein ließ ESP32, Bluetooth und Treiber weiterlaufen und entlud die Zellen ohne BMS weiter; die 60 s geben der App Zeit, den Grund anzuzeigen | 2026-09-30 |
| Ausfall der Messung nach erkanntem Akku = Fehler, behandelt wie leerer Akku, eigene Meldung (AC-13) | QA-Befund BUG-2 (Medium): ein gelöster Spannungsteiler schaltete den Schutz still ab; USB und Akku gehen nicht gleichzeitig, ein Abfall unter 5 V ohne Neustart kann daher nur ein Fehler sein | 2026-09-30 |
| EC-4 gilt nur noch für „USB-Start, dann Akku"; „Akku erkannt, dann < 5 V" ist immer AC-13 (BUG-12) | QA-Befund: EC-4 und AC-13 widersprachen sich; der Schutz vor einem gelösten Teiler hat Vorrang. Akku-Abziehen bei angestecktem USB führt bewusst zur Sperre | 2026-10-01 |
| Wackelkontakt zwischen „leer" und „< 5 V" zählt als eine Strecke, Meldung „gestört" (EC-9) | QA-Befund BUG-8 (High): getrennte Zähler setzten sich gegenseitig zurück, der Schutz griff nie | 2026-10-01 |
| Restverbrauch im Tiefschlaf (Step-down, Teiler, Treiber-VM) bleibt als bekannte Grenze, Nullverbrauch nur per Hardware | Firmware kann den Wandler nicht abschalten; ehrlich dokumentiert statt versprochen | 2026-09-30 |
