# PROJ-6: Akkuanzeige

## Dependencies
- Erfordert: PROJ-1 (BLE-Verbindung & Pairing) — der Messwert kommt über die bestehende Verbindung, die Anzeige sitzt im Verbindungs-Header
- Betrifft: PROJ-2 (Jog), PROJ-3 (Auto-Fahrt), PROJ-5 (Zeitraffer) — der Schutz-Stopp hält jede Bewegungsart an und sperrt neue; die Warnung vor dem Start gilt für Auto-Fahrt und Zeitraffer
- Hardware-Voraussetzung: Spannungsteiler vom Akku-Plus auf GPIO 34 (82 kΩ + 22 kΩ oben, 22 kΩ unten, 100 nF gegen GND, gemeinsame Masse) — verbaut am 2026-09-30

## User Stories
- Als Slider-Besitzer möchte ich den Ladezustand des Akkus jederzeit in der App sehen, damit ich weiß, ob er für die geplante Aufnahme reicht
- Als Slider-Besitzer möchte ich rechtzeitig gewarnt werden, wenn der Akku zur Neige geht, damit mir eine lange Aufnahme nicht mittendrin abbricht
- Als Slider-Besitzer möchte ich vor dem Start eines Zeitraffers oder einer Auto-Fahrt bei fast leerem Akku nachgefragt werden, damit ich bewusst entscheide, ob ich trotzdem starte
- Als Slider-Besitzer möchte ich, dass der Slider meine 18650-Zellen (ohne BMS) vor Tiefentladung schützt, auch wenn die App gerade nicht verbunden ist, damit die Zellen nicht beschädigt werden
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

## Edge Cases
- **EC-1** — Angenommen der Motor fährt mit hoher Geschwindigkeit an und die Spannung bricht dabei kurz unter 9,3 V ein, wenn sie sich innerhalb von 5 Sekunden wieder erholt, dann löst der Schutz-Stopp nicht aus und die Anzeige springt nicht
- **EC-2** — Angenommen die App ist nicht verbunden (Absturz, Hintergrund, Bluetooth aus), wenn der Akku während einer Bewegung die Schutzschwelle unterschreitet, dann stoppt die Firmware trotzdem (siehe AC-7); beim nächsten Verbinden zeigt die App sofort den gesperrten Zustand (AC-9)
- **EC-3** — Angenommen die Spannung erholt sich nach dem Schutz-Stopp im Ruhezustand wieder über 9,3 V, wenn eine neue Bewegung angefordert wird, dann bleibt der Slider trotzdem gesperrt (AC-8) — kein Wechsel zwischen Anlaufen und Stoppen
- **EC-4** — Angenommen der Slider wird per USB betrieben und später zusätzlich ein Akku angeschlossen (oder umgekehrt), wenn sich der Messwert über bzw. unter 5 V bewegt, dann wechselt die Anzeige zwischen Prozentwert und „🔋 –", ohne Fehlermeldung
- **EC-5** — Angenommen die Verbindung wird hergestellt, wenn noch kein Messwert vorliegt (direkt nach dem Start des ESP32), dann zeigt der Header „🔋 –" bis zum ersten gültigen Wert
- **EC-6** — Angenommen der Nutzer bestätigt die Nachfrage bei unter 10 % und startet einen Zeitraffer, wenn der Akku während der Sequenz die Schutzschwelle erreicht, dann greift AC-10 — die Bestätigung setzt den Schutz-Stopp nicht außer Kraft

## Technical Requirements (optional)
- Akku: 3× 18650 in Reihe (3S), ohne BMS; Spannungsbereich ca. 9,0 V (leer) bis 12,6 V (voll)
- Schutz-Schwelle 9,3 V (ca. 3,1 V pro Zelle), 5 Sekunden ununterbrochen; „kein Akku erkannt" unter 5 V
- Die Umrechnung Spannung → Prozent ist eine Näherung über die Entladekennlinie von Li-Ionen-Zellen — Verfahren und Kennlinie entscheidet `/architecture`
- Der Schutz-Stopp muss in der Firmware liegen (wirkt ohne App), die Anzeige/Warnung in der App

## Open Questions
- [ ] Kalibrierung: Der genaue Umrechnungsfaktor des Spannungsteilers wird nach dem Einbau einmal mit einem Multimeter bestimmt — wie und wo er hinterlegt wird, entscheidet `/architecture`
- [x] Welcher ADC1-Pin wird tatsächlich verwendet → GPIO 34, Teiler 104 kΩ / 22 kΩ, vom Nutzer verbaut (2026-09-30)
- [ ] Läuft der Motor im stromlosen Zustand frei, sodass der Schlitten nach einem Schutz-Stopp von Hand geschoben werden kann? (TMC2209 im stromlosen Zustand — am Gerät zu prüfen)

- [ ] Wird der ESP32 aus dem Akku versorgt (dann hebt ein Akkuwechsel die Sperre automatisch auf, AC-8) oder separat? Falls separat, bleibt nur die Reset-Taste — am Aufbau zu prüfen (aus `/architecture`)

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
