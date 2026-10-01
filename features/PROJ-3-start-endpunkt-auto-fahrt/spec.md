# PROJ-3: Start-/Endpunkt & Auto-Fahrt

## Dependencies
- Erfordert: PROJ-2 (Manuelle Steuerung / Jog) — Start-/Endpunkt werden durch Jogen zur Position gesetzt, nutzt dessen bestehende Steuerung
- Berührt: PROJ-5 (Zeitraffer-Modus) — die Videoaufnahme (AC-13 ff.) nutzt dieselbe Rückkamera wie dessen Fotoaufnahme; Auto-Fahrt und Zeitraffer schließen sich weiterhin gegenseitig aus (PROJ-5 AC-9)
- Berührt: PROJ-4 (Presets verwalten) — Presets bleiben unverändert, die Video-Einstellungen sind bewusst kein Teil davon

## User Stories
- Als Slider-Besitzer möchte ich die aktuelle Position als Start- bzw. Endpunkt markieren können, nachdem ich manuell dorthin gejogt bin, damit ich eine Kamerafahrt-Strecke definieren kann
- Als Slider-Besitzer möchte ich eine Zieldauer für die Fahrt zwischen Start und Ende eingeben, damit die Aufnahme genau so lange dauert wie geplant
- Als Slider-Besitzer möchte ich die automatische Fahrt jederzeit abbrechen können, damit ich bei einem Problem sofort eingreifen kann
- Als Slider-Besitzer möchte ich nach einer Aufnahme bequem zurück zum Startpunkt fahren können, damit ich für die nächste Aufnahme nicht manuell zurückjogen muss
- Als Slider-Besitzer möchte ich, dass die App während der Auto-Fahrt selbst ein Video aufnimmt, damit ich mit einem einzigen Handy filmen und den Slider steuern kann — eine Kamera-App im Hintergrund nimmt unter Android nicht weiter auf
- Als Slider-Besitzer möchte ich, dass die Aufnahme kurz vor der Fahrt beginnt und kurz danach endet, damit Anfang und Ende des Takes ruhig sind und ich im Schnitt sauber schneiden kann
- Als Slider-Besitzer möchte ich Auflösung, Bildrate, Objektiv, Stabilisierung und Ton einstellen, damit das Video zu meinem Projekt passt
- Als Slider-Besitzer möchte ich Fokus und Belichtung vor der Fahrt festsetzen, damit das Bild während der Fahrt nicht pumpt

## Out of Scope
- Dauerhaftes Speichern mehrerer benannter Fahrten (Presets) — PROJ-4
- Zeitraffer-Modus (schrittweise Fahrt + Kameraauslösung) — PROJ-5
- Direkte Geschwindigkeitseingabe statt Dauer (siehe Decision Log)
- Getrennte, separat einstellbare Dauer für die Rückfahrt (siehe Decision Log)
- Manuelles Jogging oder Setzen neuer Punkte während einer laufenden Auto-Fahrt (siehe Decision Log)
- Anzeige der Strecke/Geschwindigkeit in mm bzw. mm/s — weiterhin nur die Steps-Domäne, echte Steps-pro-mm-Kalibrierung steht aus (wie bei PROJ-2)
- Auto-Fahrt von einer beliebigen Position aus (nicht exakt am Startpunkt der jeweiligen Richtung) — siehe Decision Log
- Manuelle Belichtungswerte (ISO, Verschlusszeit, fester Weißabgleich-Wert), Zoom und Belichtungskorrektur — später per `/refine PROJ-3`, siehe Decision Log
- Video-Einstellungen als Teil der Presets (PROJ-4) — sie werden app-weit gemerkt, nicht pro Preset
- Videoaufnahme im Hintergrund oder bei gesperrtem Bildschirm — der Bildschirm bleibt während der Fahrt mit Video an (AC-27)
- Einstellbare Länge von Vor- und Nachlauf — fest 2 s (siehe Decision Log)
- Videoaufnahme ohne Auto-Fahrt (freie Aufnahme per eigenem Aufnahme-Knopf)
- Frontkamera, eigenes App-Album für Videos
- Weiches Anfahren/Abbremsen (Ease-in/Ease-out) der Fahrt — eigenes Thema, nicht Teil der Videoaufnahme
- Zwei-Handy-Lösung bzw. Fernauslösung einer externen Kamera (wie schon in PROJ-5 verworfen)

## Acceptance Criteria
- [ ] **AC-1** — Angenommen die App ist verbunden und der Nutzer ist zu einer Position gejogt, wenn er „Als Start setzen" drückt, dann wird diese Position als Startpunkt für die aktuelle Sitzung gespeichert (ein zuvor gesetzter Startpunkt wird dabei überschrieben)
- [ ] **AC-2** — Angenommen die App ist verbunden und der Nutzer ist zu einer Position gejogt, wenn er „Als Ende setzen" drückt, dann wird diese Position als Endpunkt für die aktuelle Sitzung gespeichert (ein zuvor gesetzter Endpunkt wird dabei überschrieben)
- [ ] **AC-3** — Angenommen Start- und Endpunkt sind gesetzt und der Schlitten steht am Startpunkt, wenn der Nutzer eine gültige Dauer eingibt und „Start → Ende" auslöst, dann fährt der Schlitten automatisch zum Endpunkt und kommt nach der eingegebenen Dauer dort an
- [ ] **AC-4** — Angenommen Start- und Endpunkt sind gesetzt und der Schlitten steht am Endpunkt, wenn der Nutzer eine gültige Dauer eingibt und „Ende → Start" auslöst, dann fährt der Schlitten automatisch zurück zum Startpunkt und kommt nach der eingegebenen Dauer dort an
- [ ] **AC-5** — Angenommen eine Auto-Fahrt läuft, wenn der Nutzer „Stopp" drückt, dann hält der Motor sofort an, unabhängig davon wie weit die Fahrt fortgeschritten ist
- [ ] **AC-6** — Angenommen Start- und Endpunkt sind gesetzt, wenn der Nutzer beim Verlassen des Dauer-Felds eine Dauer eingetragen hat, die bei der Distanz zwischen den Punkten eine Geschwindigkeit unter der Mindestgeschwindigkeit (200 Steps/s) ergäbe (die Dauer ist zu lang), dann zeigt die App eine Fehlermeldung mit dem erlaubten Dauer-Bereich und startet keine Fahrt — das Feld behält die eingegebene, zu lange Dauer bei
- [ ] **AC-11** — Angenommen Start- und Endpunkt sind gesetzt, wenn der Nutzer das Dauer-Feld verlässt und die eingetragene Dauer leer ist, nicht als Zahl auswertbar ist, oder eine Geschwindigkeit über der Höchstgeschwindigkeit (8000 Steps/s) ergäbe (die Dauer ist zu kurz oder fehlt), dann trägt die App automatisch die für die aktuelle Distanz kürzestmögliche gültige Dauer in das Feld ein, ohne eine Fehlermeldung zu zeigen — der Nutzer kann direkt mit diesem Wert „Start → Ende"/„Ende → Start" auslösen
- [ ] **AC-12** — Angenommen Start- und Endpunkt sind gesetzt, wenn die eingetragene Dauer für die aktuelle Distanz zu kurz ist (egal ob getippt, aus einem Preset geladen oder weil sich die Distanz geändert hat), dann zeigt die App sofort sichtbar einen Hinweis mit der Mindestdauer (z. B. „Zu kurz für diese Strecke — Minimum 13.5 s") und einen Button „Minimum übernehmen", der diese Mindestdauer ins Feld einträgt — die Auto-Fahrt-Auslöser sind nie ohne sichtbaren Grund gesperrt. Die App ändert die Dauer außerhalb von AC-11 (Verlassen des Felds) nie selbstständig; insbesondere bleibt die Dauer eines geladenen Presets unverändert
- [ ] **AC-7** — Angenommen kein Startpunkt oder kein Endpunkt ist gesetzt, wenn der Nutzer den Hauptbildschirm sieht, dann sind die Auto-Fahrt-Auslöser („Start → Ende" / „Ende → Start") deaktiviert
- [ ] **AC-8** — Angenommen der Schlitten steht nicht exakt am Startpunkt der jeweiligen Richtung, wenn der Nutzer diese Richtung auslösen will, dann ist der entsprechende Auslöser deaktiviert (analog für die Gegenrichtung und deren Startpunkt)
- [ ] **AC-9** — Angenommen eine Auto-Fahrt läuft, wenn der Nutzer die Jog-Tasten oder die „Setzen"-Buttons betätigt, dann reagieren sie nicht — nur der Stopp-Button ist bedienbar
- [ ] **AC-10** — Angenommen die BLE-Verbindung bricht während einer laufenden Auto-Fahrt ab, dann stoppt die Firmware den Motor eigenständig, unabhängig von der App

### Videoaufnahme während der Auto-Fahrt
- [ ] **AC-13** — Angenommen die App ist verbunden, wenn der Nutzer im Auto-Fahrt-Abschnitt den Schalter „Video aufnehmen" (Standard: aus) einschaltet, dann erscheinen dort die Kamera-Vorschau der Rückkamera und die Video-Einstellungen (AC-21 bis AC-25); ist der Schalter aus, verhält sich die Auto-Fahrt unverändert wie in AC-3/AC-4 und es wird keine Vorschau angezeigt
- [ ] **AC-14** — Angenommen „Video aufnehmen" ist an, die nötigen Berechtigungen sind erteilt und der Schlitten steht am Startpunkt der jeweiligen Richtung, wenn der Nutzer „Start → Ende" oder „Ende → Start" auslöst, dann startet die App die Videoaufnahme, wartet 2 Sekunden (Vorlauf, Schlitten steht), fährt dann wie in AC-3/AC-4 mit der eingegebenen Dauer zum Ziel, nimmt nach der Ankunft noch 2 Sekunden weiter auf (Nachlauf) und beendet die Aufnahme dann automatisch
- [ ] **AC-15** — Angenommen eine Fahrt mit Video ist regulär beendet (AC-14), wenn die Aufnahme gestoppt wurde, dann ist das Video in der normalen Galerie des Geräts gespeichert, wie jedes andere Kamera-Video, und die App bestätigt das kurz („Video gespeichert")
- [ ] **AC-16** — Angenommen eine Fahrt mit Video läuft, wenn der Nutzer auf die App schaut, dann zeigt sie sichtbar, dass aufgenommen wird, mit der bisherigen Aufnahmedauer und der aktuellen Phase (Vorlauf / Fahrt / Nachlauf)
- [ ] **AC-17** — Angenommen eine Fahrt mit Video läuft (in jeder Phase, auch im Vor- oder Nachlauf), wenn der Nutzer „Stopp" drückt, dann hält der Motor sofort an (wie AC-5), die Aufnahme endet sofort ohne Nachlauf, und das bis dahin aufgenommene Video wird in der Galerie gespeichert
- [ ] **AC-18** — Angenommen „Video aufnehmen" ist an, wenn die Aufnahme nicht starten kann oder während der Fahrt unerwartet abbricht (z. B. Speicher voll, Kamerafehler, App in den Hintergrund verdrängt), dann fährt der Schlitten nicht los bzw. hält sofort an, die App zeigt eine Fehlermeldung mit dem Grund, und ein bereits aufgenommener Teil wird gespeichert, soweit das möglich ist
- [ ] **AC-19** — Angenommen eine Fahrt mit Video läuft, wenn die BLE-Verbindung abbricht, dann stoppt die Firmware den Motor (AC-10), die App beendet die Aufnahme, speichert das Video und zeigt den Verbindungsabbruch wie gewohnt an
- [ ] **AC-20** — Angenommen „Video aufnehmen" ist an und die Kamera-Berechtigung (bzw. bei eingeschaltetem Ton die Mikrofon-Berechtigung) fehlt, wenn der Nutzer den Schalter einschaltet oder eine Fahrt auslösen will, dann zeigt die App einen Hinweis und fragt die Berechtigung an (falls noch nicht abgelehnt) bzw. verweist auf die Systemeinstellungen (falls dauerhaft abgelehnt), und eine Fahrt mit Video startet nicht — bei fehlender Mikrofon-Berechtigung nennt der Hinweis außerdem, dass mit ausgeschaltetem Ton ohne Mikrofon aufgenommen werden kann
- [ ] **AC-21** — Angenommen „Video aufnehmen" ist an, wenn der Nutzer den Schalter „Ton" (Standard: an) umschaltet, dann wird das Video mit Ton über das Handy-Mikrofon (an) bzw. ohne Tonspur (aus) aufgenommen
- [ ] **AC-22** — Angenommen „Video aufnehmen" ist an, wenn der Nutzer Auflösung und Bildrate wählt, dann bietet die App nur die Kombinationen an, die das Gerät der App für Video zur Verfügung stellt, und nimmt mit der gewählten auf; Standard ist 1080p mit 30 fps, falls verfügbar, sonst der Standard des Geräts
- [ ] **AC-23** — Angenommen „Video aufnehmen" ist an und das Gerät stellt der App mehrere Rückkamera-Objektive zur Verfügung (z. B. Weitwinkel, Ultraweitwinkel, Tele), wenn der Nutzer ein Objektiv wählt, dann zeigt die Vorschau dieses Objektiv und die Aufnahme nutzt es; bei nur einem verfügbaren Objektiv wird keine Auswahl angezeigt
- [ ] **AC-24** — Angenommen „Video aufnehmen" ist an und das Gerät unterstützt Videostabilisierung für die App, wenn der Nutzer den Schalter „Stabilisierung" (Standard: aus) umschaltet, dann wird mit bzw. ohne Stabilisierung aufgenommen; unterstützt das Gerät sie nicht, wird der Schalter nicht angezeigt
- [ ] **AC-25** — Angenommen die Kamera-Vorschau ist sichtbar, wenn der Nutzer auf eine Stelle in der Vorschau tippt, dann stellt die Kamera Fokus und Belichtung auf diese Stelle ein und hält beide danach fest (sichtbar als gesperrt markiert), bis der Nutzer erneut tippt oder die Sperre über „Auto" aufhebt — eine gesperrte Einstellung bleibt während der gesamten Fahrt mit Video unverändert
- [ ] **AC-26** — Angenommen der Nutzer hat „Video aufnehmen", „Ton", Auflösung/Bildrate, Objektiv und „Stabilisierung" eingestellt, wenn die App neu gestartet wird, dann sind diese Einstellungen weiterhin so gesetzt; die Fokus-/Belichtungssperre (AC-25) gilt dagegen nur für die aktuelle Sitzung — ist eine gemerkte Einstellung auf dem Gerät nicht mehr verfügbar, gilt deren Standardwert
- [ ] **AC-27** — Angenommen eine Fahrt mit Video läuft, wenn die Fahrt läuft (einschließlich Vor- und Nachlauf), dann verhindert die App, dass der Bildschirm sich sperrt, und gibt diese Sperre nach Ende der Aufnahme wieder frei
- [ ] **AC-28** — Angenommen eine Fahrt mit Video läuft, wenn der Nutzer die Video-Einstellungen (AC-21 bis AC-25) oder den Schalter „Video aufnehmen" ändern will, dann sind sie nicht bedienbar — wie in AC-9 ist nur der Stopp-Button bedienbar
- [ ] **AC-29** — Angenommen „Video aufnehmen" ist an und eine gültige Dauer ist eingetragen, wenn der Nutzer den Auto-Fahrt-Abschnitt sieht, dann zeigt die App die erwartete Videolänge an (Dauer + 4 s für Vor- und Nachlauf)

## Edge Cases
- **EC-1** — Angenommen Start- und Endpunkt sind identisch (0 Steps Distanz), dann ist der jeweilige Auto-Fahrt-Auslöser deaktiviert, mit einem Hinweis, dass Start und Ende sich unterscheiden müssen
- **EC-2** — Angenommen eine Auto-Fahrt läuft bereits, wenn eine zweite Auslöse-Anfrage eintrifft (z. B. durch Doppel-Tap oder eine App-seitige Wiederholung), dann ignoriert die Firmware die zweite Anfrage
- **EC-3** — Angenommen die App wird neu gestartet oder die Verbindung neu aufgebaut, dann sind Start- und Endpunkt nicht mehr gesetzt (keine Persistenz über die Sitzung hinaus)
- **EC-4** — Angenommen eine Auto-Fahrt läuft und die App wird in den Hintergrund geschickt oder stürzt ab, während die BLE-Verbindung formal bestehen bleibt, dann läuft die Fahrt trotzdem bis zum Ziel weiter — kein Watchdog-Timeout wie beim Jog nötig, da kein fortlaufendes Halte-Signal erwartet wird
- **EC-5** — Angenommen eine Fahrt mit Video läuft bereits (auch während des Vorlaufs), wenn eine zweite Auslöse-Anfrage eintrifft (z. B. Doppel-Tap), dann wird sie ignoriert — es entsteht keine zweite Aufnahme und keine zweite Fahrt
- **EC-6** — Angenommen eine Fahrt mit Video läuft und der Slider löst einen Schutz-Stopp aus (z. B. Akku leer, PROJ-6), wenn der Motor dadurch anhält, dann behandelt die App das wie „Stopp" (AC-17): Aufnahme sofort beenden, Video speichern
- **EC-7** — Angenommen die App wird während des Vorlaufs in den Hintergrund verdrängt, wenn die Aufnahme dadurch abbricht, dann fährt der Schlitten gar nicht erst los (AC-18) — EC-4 („Fahrt läuft im Hintergrund weiter") gilt nur für Fahrten ohne Video
- **EC-8** — Angenommen der Nutzer lädt ein Preset (PROJ-4), wenn Dauer und Distanz übernommen werden, dann bleiben die Video-Einstellungen unverändert
- **EC-9** — Angenommen „Video aufnehmen" ist an, wenn eine Zeitraffer-Sequenz (PROJ-5) läuft, dann sind die Auto-Fahrt-Auslöser weiterhin gesperrt (PROJ-5 AC-9) — und umgekehrt kann während einer Fahrt mit Video keine Zeitraffer-Sequenz starten

## Technical Requirements
- Geschwindigkeit wird aus der Distanz (Steps) zwischen Start und Ende und der eingegebenen Dauer berechnet: `speed = distance_steps / duration_seconds`, muss innerhalb 200–8000 Steps/s liegen (derselbe Bereich wie PROJ-2s Jog)
- Baut auf PROJ-2s Motoransteuerung auf, braucht aber erstmals eine absolute Positions-Verfolgung in der Firmware (PROJ-2 kennt nur kontinuierlichen Lauf ohne Ziel) — technische Entscheidung von `/architecture`
- Videoaufnahme nutzt die Rückkamera, die mit PROJ-5 bereits eingebunden ist; wie die Kamera zwischen der Vorschau im Auto-Fahrt-Abschnitt und der im Zeitraffer-Abschnitt geteilt wird, entscheidet `/architecture`
- Benötigt zusätzlich die Android-Mikrofon-Berechtigung (nur bei eingeschaltetem Ton) und das Speichern von Videos in die Galerie
- Vor- und Nachlauf: fest je 2 Sekunden; die eingegebene Dauer bezieht sich weiterhin nur auf die Fahrt selbst (AC-3/AC-4 unverändert)
- Video-Einstellungen werden lokal auf dem Handy gespeichert (siehe `docs/data-model.md`)

## Open Questions
- [ ] Genaue min/max-Dauer-Grenzen hängen von der noch ausstehenden Steps-pro-mm-Kalibrierung der Mechanik ab (wie bei PROJ-2 offen)
- [ ] Ob sich zusätzlich der Weißabgleich festsetzen lässt (AC-25 fordert nur Fokus + Belichtung), hängt davon ab, was die Kamera-Bibliothek auf Android freigibt — klärt `/architecture`; falls ja, gehört er mit in die Sperre
- [ ] Welche Auflösungen, Bildraten und Objektive das konkrete Handy der App tatsächlich anbietet, zeigt sich erst am Gerät — beeinflusst nur die Auswahl (AC-22/AC-23), nicht den Vertrag

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
| AC-12 präzisiert (2026-09-30): Auto-Korrektur nur, wenn die Distanz erstmals bekannt wird, nicht bei jeder Distanzänderung | QA-Fund BUG-24: Beim Setzen eines neuen Startpunkts meldet die Firmware kurz eine Zwischen-Distanz; die Korrektur darauf überschrieb die Dauer eines geladenen Presets (PROJ-4 AC-4/AC-5). Bestehende AC-IDs unverändert | 2026-09-30 |
| AC-12 neu gefasst (2026-09-30): Korrektur bei jeder Änderung der bekannten Distanz, außer während ein Preset angewendet wird | QA-Funde BUG-27/28: „nur beim erstmaligen Bekanntwerden" ließ die Sperre bei späterer Vergrößerung zu und erwischte die Zwischen-Distanz, wenn vorher nur ein Endpunkt gesetzt war. Die Ausnahme „Preset wird angewendet" trennt die Zwischen-Distanz der Firmware sauber von echten Nutzeränderungen. Bestehende AC-IDs unverändert | 2026-09-30 |
| AC-12 ergänzt (2026-09-30): Ende der Preset-Anwendung löst eine einmalige Prüfung der Dauer gegen die aktuelle Distanz aus | QA-Funde BUG-29/30: Eine von Hand zu kurz getippte Dauer oder ein Preset, dessen Distanz nie eintrifft, ließ die Auslöser stumm gesperrt. Die eigene Preset-Dauer ist für ihre Distanz immer gültig und bleibt unberührt. Bestehende AC-IDs unverändert | 2026-09-30 |
| AC-12 neu gefasst (2026-09-30): Statt die Dauer bei Distanzänderung automatisch zu überschreiben, zeigt die App bei zu kurzer Dauer die Mindestdauer an und bietet „Minimum übernehmen" an | Die automatische Überschreibung musste Distanzänderungen des Nutzers von Zwischen-Distanzen des Preset-Ablaufs unterscheiden (Schutzphase + Timer) und erzeugte über fünf QA-Runden immer neue Rennen (BUG-24, 27, 29–37). Der eigentliche Kern von BUG-19 war „stumm gesperrt" — eine sichtbare Meldung mit Ein-Tipp-Übernahme löst das ohne Raten. AC-11 (Korrektur beim Verlassen des Felds) bleibt. Bestehende AC-IDs unverändert | 2026-09-30 |
| Videoaufnahme als Erweiterung von PROJ-3 statt als eigenes Feature (PROJ-7) | Entscheidung des Nutzers im `/write-spec`-Gespräch: die Aufnahme ist eine Option der Auto-Fahrt, keine eigenständige Fähigkeit | 2026-10-01 |
| Ein Handy filmt und steuert; die App nimmt das Video selbst auf | Android beendet die Aufnahme einer Kamera-App, sobald die Slider-App in den Vordergrund kommt — eine Ein-Handy-Lösung geht nur mit Aufnahme in der Slider-App (gleiche Linie wie PROJ-5) | 2026-10-01 |
| Schalter „Video aufnehmen" + fester Vor-/Nachlauf von je 2 s | Ruhiger Anfang und ruhiges Ende des Takes, der fast abrupte Anfahr-/Bremsmoment lässt sich wegschneiden; fester Wert hält die ohnehin volle Seite einfach (wie die Settle-Pause in PROJ-5) | 2026-10-01 |
| Video gilt für beide Richtungen („Start → Ende" und „Ende → Start") | Hin- und Rückfahrt werden je ein Take, die Wahl fällt im Schnitt | 2026-10-01 |
| Ton per Schalter, Standard an | Der Motor läuft leise (StealthChop), Atmo-Ton ist nützlich; wer extern Ton aufnimmt, schaltet ab und braucht dann keine Mikrofon-Berechtigung | 2026-10-01 |
| Kamera-Einstellungen: Auflösung/fps, Objektiv, Fokus-/Belichtungssperre, Stabilisierung (Standard aus) | Das, was für Slider-Fahrten wirklich zählt; Stabilisierung standardmäßig aus, weil der Slider selbst stabilisiert und digitale Stabilisierung das Bild beschneidet | 2026-10-01 |
| Manuelles ISO/Verschlusszeit, Zoom und Belichtungskorrektur vorerst Out of Scope | Die Sperre von Fokus und Belichtung verhindert bereits das Pumpen während der Fahrt; manuelles ISO/Verschluss ist mit der vorhandenen Kamera-Bibliothek auf Android voraussichtlich nicht direkt verfügbar und würde den Aufwand stark erhöhen | 2026-10-01 |
| Video-Einstellungen app-weit lokal merken, nicht in Presets; Fokus-/Belichtungssperre nur pro Sitzung | Verhalten wie bei einer normalen Kamera-App; die Sperre hängt von der Szene ab und wäre beim nächsten Dreh falsch; Presets bleiben ohne Datenmodell-Migration | 2026-10-01 |
| Stopp während Fahrt mit Video speichert den Teil-Take | Ein abgebrochener Take kann trotzdem brauchbar sein; löschen kann der Nutzer selbst in der Galerie | 2026-10-01 |
| Abbruch der Aufnahme stoppt den Motor mit Fehlermeldung | Wie in PROJ-5 AC-6: lieber sofort sichtbar abbrechen als eine Fahrt ohne Video, die erst beim Sichten auffällt | 2026-10-01 |
| Kamera-Vorschau im Auto-Fahrt-Abschnitt, nur bei eingeschaltetem Video | Ohne Video bleibt der Abschnitt so kompakt wie bisher; keine Änderung am Seitenaufbau oder am Zeitraffer-Abschnitt | 2026-10-01 |
