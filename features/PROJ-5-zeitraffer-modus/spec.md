# PROJ-5: Zeitraffer-Modus

## Dependencies
- Erfordert: PROJ-3 (Start-/Endpunkt & Auto-Fahrt) — Zeitraffer baut auf dessen Start-/Endpunkt-Konzept auf und teilt sich den Motor mit dessen Auto-Fahrt

## User Stories
- Als Slider-Besitzer möchte ich eine Zeitraffer-Aufnahme über Anzahl der Aufnahmen und Intervall konfigurieren, damit ich flüssige Zeitraffer-Videos mit Kamerafahrt erstellen kann
- Als Slider-Besitzer möchte ich, dass der Schlitten die Strecke zwischen den Aufnahmen automatisch gleichmäßig abfährt, damit ich mich nicht selbst um die Positionierung kümmern muss
- Als Slider-Besitzer möchte ich den Fortschritt einer laufenden Zeitraffer-Sequenz sehen, damit ich weiß, wie lange es noch dauert
- Als Slider-Besitzer möchte ich eine laufende Sequenz jederzeit abbrechen können, damit ich nicht warten muss, wenn ich es mir anders überlege
- Als Slider-Besitzer möchte ich, dass die Fotos direkt in meiner normalen Foto-Galerie landen, damit ich sie wie jedes andere Foto weiterverarbeiten kann

## Out of Scope
- Zwei-Handy-Lösung mit separater Kamera-Fernauslösung per Bluetooth-HID (Steuer-Handy getrennt vom Kamera-Handy) — erwogen und verworfen zugunsten der Ein-Handy-Lösung, siehe Decision Log
- Hintergrund-/Standby-Betrieb bei gesperrtem Bildschirm oder App im Hintergrund — der Bildschirm muss während der Sequenz an bleiben, siehe Decision Log
- Zeitraffer-Konfigurationen als Presets speichern/laden — nicht Teil von PROJ-4s Presets-Datenmodell (das speichert Start-/Endpunkt + Dauer für normale Auto-Fahrten, nicht Anzahl Aufnahmen/Intervall); könnte später per `/refine PROJ-4` oder eigenem Feature ergänzt werden
- Eigenes Foto-Album/Ordner für Zeitraffer-Aufnahmen — landen in der normalen Geräte-Galerie
- Manuelle Kameraeinstellungen (Belichtung, Fokus, ISO, Weißabgleich) — Standardeinstellungen der verwendeten Kamera-Bibliothek
- Video-Zusammenschnitt aus den Einzelbildern innerhalb der App — übernimmt eine externe App/ein externes Tool
- Automatisches Fortsetzen einer durch Verbindungsabbruch gestoppten Sequenz an der Abbruchstelle — muss manuell neu gestartet werden

## Acceptance Criteria

- [ ] **AC-1** — Angenommen Start- und Endpunkt sind gesetzt (PROJ-3) und der Schlitten steht exakt am Startpunkt, wenn der Nutzer eine Anzahl Aufnahmen (2–999) und ein Intervall (1–3600 Sekunden) einstellt und die Zeitraffer-Sequenz startet, dann macht die App sofort die erste Aufnahme am Startpunkt und fährt danach den Schlitten in (Anzahl−1) gleich großen Schritten zum Endpunkt, wobei nach jedem Fahrschritt (nach einer kurzen Settle-Pause) eine weitere Aufnahme ausgelöst wird, bis alle Aufnahmen gemacht sind
- [ ] **AC-2** — Angenommen eine Zeitraffer-Sequenz läuft, wenn die letzte Aufnahme am Endpunkt gemacht wurde, dann fährt der Schlitten automatisch zurück zum Startpunkt und die Sequenz gilt danach als abgeschlossen
- [ ] **AC-3** — Angenommen eine Zeitraffer-Sequenz läuft, wenn der Nutzer auf die App schaut, dann zeigt sie die aktuelle Aufnahmenummer, die Gesamtzahl der Aufnahmen und die verbleibende Zeit an
- [ ] **AC-4** — Angenommen eine Zeitraffer-Sequenz läuft, wenn der Nutzer Stopp drückt, dann hält der Schlitten sofort an, es werden keine weiteren Aufnahmen gemacht, und der Schlitten bleibt an der aktuellen Position stehen (keine automatische Rückfahrt)
- [ ] **AC-5** — Angenommen die Kamera-Berechtigung ist nicht erteilt, wenn der Nutzer eine Zeitraffer-Sequenz starten will, dann zeigt die App einen Hinweis und fragt die Berechtigung an (falls noch nicht abgelehnt) bzw. verweist auf die Systemeinstellungen (falls dauerhaft abgelehnt), und die Sequenz startet nicht
- [ ] **AC-6** — Angenommen eine Zeitraffer-Sequenz läuft, wenn eine einzelne Aufnahme fehlschlägt (z. B. Gerätespeicher voll), dann stoppt die Sequenz sofort mit einer Fehlermeldung, und der Schlitten hält an der aktuellen Position an
- [ ] **AC-7** — Angenommen eine Zeitraffer-Sequenz läuft, wenn die Bluetooth-Verbindung zum Schlitten abbricht, dann stoppt die Sequenz (keine weiteren Fahrbefehle möglich), und die App zeigt den Verbindungsabbruch wie gewohnt an
- [ ] **AC-8** — Angenommen eine Zeitraffer-Sequenz läuft, wenn die Sequenz aktiv ist, dann verhindert die App aktiv, dass der Bildschirm sich sperrt (Wakelock), solange die Sequenz läuft, und gibt diese Sperre nach Abschluss/Abbruch der Sequenz wieder frei
- [ ] **AC-9** — Angenommen eine Zeitraffer-Sequenz läuft, wenn der Nutzer versucht, eine normale Auto-Fahrt (PROJ-3) zu starten (und umgekehrt: eine normale Auto-Fahrt läuft und der Nutzer versucht, eine Zeitraffer-Sequenz zu starten), dann wird das verhindert — beide teilen sich denselben Motor und schließen sich gegenseitig aus
- [ ] **AC-10** — Angenommen eine Zeitraffer-Sequenz läuft, wenn eine Aufnahme gemacht wird, dann wird sie in der normalen Foto-Galerie des Geräts gespeichert, genau wie jedes andere Kamerafoto

## Edge Cases
- **EC-1** — Angenommen Start- und Endpunkt sind identisch (0 Steps Distanz), wenn der Nutzer eine Zeitraffer-Sequenz starten will, dann wird das verhindert (analog zu PROJ-3s EC-1)
- **EC-2** — Angenommen die eingegebene Anzahl Aufnahmen oder das Intervall liegt außerhalb der gültigen Grenzen (2–999 bzw. 1–3600 Sekunden), wenn der Nutzer die Sequenz starten will, dann wird das verhindert und ein Hinweis auf die gültige Spanne gezeigt
- **EC-3** — Angenommen der Bildschirm wird trotz aktivem Wakelock manuell gesperrt (z. B. Power-Button gedrückt) oder die App wird zwangsweise vom Betriebssystem in den Hintergrund verdrängt, wenn dadurch eine Aufnahme fehlschlägt, dann greift dasselbe Verhalten wie bei jedem anderen Aufnahmefehler (AC-6: Sequenz stoppt sofort mit Fehlermeldung)
- **EC-4** — Angenommen eine Zeitraffer-Sequenz wurde durch einen Verbindungsabbruch mitten in der Sequenz gestoppt, wenn die Verbindung zum Slider wiederhergestellt wird, dann setzt sich die Sequenz nicht automatisch fort — der Nutzer muss sie bei Bedarf manuell neu starten

## Technical Requirements
- Benötigt eine Kamera-Bibliothek für React Native inklusive der zugehörigen Android-Kamera-Berechtigung (konkrete Bibliothek ist eine Entscheidung von `/architecture`)
- Benötigt einen Wakelock-/Keep-Awake-Mechanismus während einer laufenden Sequenz (konkreter Mechanismus: `/architecture`)
- Baut auf PROJ-3s Start-/Endpunkt-Konzept und dessen "exakt am Startpunkt"-Auslösebedingung auf
- Kein neuer Screen — Abschnitt auf der bestehenden einzigen Seite, wie bereits in `docs/app-shell.md` als zukünftiger Abschnitt vorgesehen

## Open Questions
- [ ] Konkrete Kamera-Bibliothek und Wakelock-Mechanismus sind technische Entscheidungen, die `/architecture` trifft

## Decision Log

### Product Decisions
| Decision | Rationale | Date |
|----------|-----------|------|
| Ein Handy übernimmt sowohl Steuerung als auch Kamera-Aufnahme (statt zwei Handys: Steuer-Handy getrennt von einem am Schlitten montierten Kamera-Handy mit simulierter Bluetooth-Fernauslösung) | Technisch deutlich zuverlässiger umzusetzen — eine etablierte React-Native-Kamera-Bibliothek statt einer am ESP32 selbst gebauten, unerprobten Bluetooth-HID-Kamerafernbedienung; nur eine Bluetooth-Verbindung nötig (App↔ESP32, bereits vorhanden); kein zweites Handy nötig | 2026-09-25 |
| Konfiguration über Anzahl Aufnahmen + Intervall (nicht Gesamtdauer + Intervall, nicht Distanz pro Schritt) | Direkteste, am wenigsten abstrakte Eingabe für den Nutzer — die resultierende Gesamtdauer wird berechnet und angezeigt, nicht eingegeben | 2026-09-25 |
| Bildschirm muss während der gesamten Sequenz an bleiben, kein Hintergrundbetrieb | Kamera-Zugriff im Hintergrund ist auf Android stark eingeschränkt und für dieses Hobby-Tool nicht nötig; Sequenzen dauern typischerweise Minuten bis wenige Stunden | 2026-09-25 |
| Settle-Pause nach jedem Fahrschritt als fester, nicht einstellbarer technischer Wert | Hält die UI einfach (kein zusätzliches Eingabefeld) und vermeidet trotzdem Bewegungsunschärfe durch Nachschwingen des Schlittens | 2026-09-25 |
| Bei Bluetooth-Verbindungsabbruch stoppt die Sequenz; kein automatisches Fortsetzen an der Abbruchstelle nach Wiederverbindung | Konsistent mit PROJ-3s bestehendem Sicherheitsverhalten (Verbindungsabbruch stoppt aktive Bewegung); ein Wiederaufnahme-Mechanismus wäre für ein Hobby-Tool unverhältnismäßiger Aufwand | 2026-09-25 |
| Nach regulärem Abschluss fährt der Schlitten automatisch zum Start zurück; bei manuellem Stopp bleibt er an der aktuellen Position stehen | Ein regulärer Abschluss soll direkt für eine weitere Fahrt bereitstehen; ein manueller Abbruch ist ein bewusster, sofortiger Stopp ohne Folgeaktion, konsistent mit dem bestehenden Stopp-Verhalten aus PROJ-2/3 | 2026-09-25 |
| Eine einzelne fehlgeschlagene Aufnahme stoppt die gesamte Sequenz statt sie zu überspringen | Verhindert eine Zeitraffer-Sequenz mit stillen Bildlücken, die der Nutzer erst beim späteren Sichten bemerkt — lieber sofort sichtbar stoppen | 2026-09-25 |
| Fotos landen in der normalen Geräte-Galerie, kein eigenes App-Album | Einfachste Lösung, entspricht dem Verhalten jeder normalen Kamera-App | 2026-09-25 |
| Zeitraffer-Sequenz und normale Auto-Fahrt (PROJ-3) schließen sich gegenseitig aus | Beide steuern denselben Motor; paralleler Betrieb wäre technisch und für den Nutzer undefiniert | 2026-09-25 |
