# PROJ-3 Tasks

> Erzeugt von `/tasks` aus `spec.md` + `design.md`. Der geordnete, nachvollziehbare Build-Plan — die Brücke zwischen dem Vertrag (WAS) und dem Bau (WIE).
> `[P]` = parallelisierbar: die Dateien des Tasks sind disjunkt von jedem anderen `[P]`-Task derselben Ebene, `/build` kann ihn an einen eigenen Subagenten geben.
> Ebenen laufen **sequenziell** (jede ist eine Barriere). Tasks **innerhalb** einer Ebene laufen parallel, wo mit `[P]` markiert. Jeder Task referenziert die AC-IDs aus `spec.md`, die er erfüllt — das ist die AC → Task → Test-Kette.
> Owner: `/tasks` erstellt diese Datei; `/build` hakt die Boxen ab.
> Kein Status-Feld hier — der Feature-Status lebt ausschließlich in `features/INDEX.md`.

## Level 1 — Grundbausteine

<!-- Drei komplett unabhängige Bereiche (Firmware-Motor, App-BLE-Client, JogControls' neue disabled-Prop) → alle [P]. -->

- [x] T1 [P]  Firmware: `motor.h`/`motor.cpp` — absolute Positions-Verfolgung (`getCurrentPosition()`), `motorSetStart()`/`motorSetEnd()` (merken sich die aktuelle Position), `motorAutoDrive(direction, durationDeciseconds)` (berechnet Geschwindigkeit aus eigener Distanz-Kenntnis, validiert 200–4000 Steps/s, startet `moveTo()`), `motorAutoDriveCheck()` (erkennt Zielankunft über `isRunning()`), `motorGetStatus()` (liefert Flags + Distanz), `motorClearPoints()` (setzt `hasStart`/`hasEnd` zurück); `motorWatchdogCheck()` erweitert um `autoDriving`-Guard (EC-4), `motorStop()` erweitert um Reset von `autoDriving`  · files: firmware/src/motor.h, firmware/src/motor.cpp  · → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-10, EC-1, EC-2, EC-4
- [x] T2 [P]  App: `src/ble/client.ts` — neue Exporte `sendSetStartCommand(device)`, `sendSetEndCommand(device)`, `sendAutoDriveCommand(device, direction, durationSeconds)` (Write mit Antwort), neue Konstante `SLIDER_STATUS_CHAR_UUID`, `subscribeToStatus(device, callback)` inkl. reiner `parseStatusPayload()`-Funktion (Flags-Bitfeld + Distanz aus der Notify-Payload) + Unit-Tests für Encoding/Parsing, rot-geprüft  · files: src/ble/client.ts, src/ble/client.test.ts  · → AC-1, AC-2, AC-3, AC-4, AC-6
- [x] T3 [P]  App: `JogControls` — neue `disabled`-Prop (deaktiviert Jog-Tasten optisch und funktional, wenn `true`)  · files: src/components/JogControls.tsx  · → AC-9

## Level 2 — Firmware-Verdrahtung & Status-Hook

<!-- Zwei unabhängige Bereiche, je auf genau einem Level-1-Baustein aufbauend (Firmware-BLE auf T1, App-Status-Hook auf T2) → beide [P]. -->

- [x] T4 [P]  Firmware: Command-Callback um Opcodes `0x02` SET_START, `0x03` SET_END, `0x04` AUTO_DRIVE erweitert (neben bestehendem JOG/STOP), ruft die neuen `motor.cpp`-Funktionen auf; Status-Characteristic sendet echte `notify()`-Aufrufe aus `loop()` bei Zustandsänderung (Payload aus `motorGetStatus()`); `onConnect` (PROJ-1, bestehend) ruft zusätzlich `motorClearPoints()` auf (EC-3)  · files: firmware/src/ble.cpp, firmware/src/ble.h, firmware/src/main.cpp  · → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, EC-1, EC-2, EC-3
- [x] T5 [P]  App: `useSliderStatus(device)`-Hook — abonniert die Status-Characteristic über `client.ts`s `subscribeToStatus`, hält `{hasStart, hasEnd, atStart, atEnd, driving, distanceSteps}` als React-State + Unit-Tests  · files: src/components/useSliderStatus.ts, src/components/useSliderStatus.test.ts  · → AC-7, AC-8, AC-9

## Level 3 — AutoDriveControls

<!-- Einzelner Task, braucht sowohl T2 (Befehle senden) als auch T5 (Status lesen) — kann nicht parallel zu T5 laufen, deshalb eigene Ebene. -->

- [x] T6  App: `AutoDriveControls`-Komponente — `PointButtons` ("Als Start setzen"/"Als Ende setzen"), `DurationInput` (Sekunden, Live-Validierung gegen den aus `distanceSteps` berechneten erlaubten Bereich), `DriveButtonRow` ("Start → Ende"/"Ende → Start", aktiviert je nach `hasStart`/`hasEnd`/`atStart`/`atEnd`/`distanceSteps > 0`), `StopButton` (nur während `driving` aktiv), `StatusLine`; nutzt `useSliderStatus` (T5) für den Zustand und `sendSetStartCommand`/`sendSetEndCommand`/`sendAutoDriveCommand`/`sendStopCommand` (T2, STOP wiederverwendet aus PROJ-2) zum Senden  · files: src/components/AutoDriveControls.tsx  · → AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, EC-1

## Level 4 — Einbindung

- [x] T7  `RootScreen.tsx` — rendert `<AutoDriveControls />` neben `<JogControls disabled={status.driving} />` im Zustand `connected`; `useSliderStatus` wird hier (oder in einer gemeinsamen Stelle) einmal aufgerufen und an beide Komponenten weitergereicht  · files: src/screens/RootScreen.tsx  · → AC-9

## Level 5 — Nachträge nach /refine (bereits gebaut, nachgetragen 2026-10-01)

- [x] T8  App: Dauer-Feld füllt beim Verlassen die kürzestmögliche gültige Dauer ein, wenn sie leer, unlesbar oder zu kurz ist (aufgerundet auf Zehntelsekunden)  · files: src/components/AutoDriveControls.tsx, src/components/AutoDriveControls.test.ts  · Commits: 7ce09e9, 655f28d  · → AC-11
- [x] T9  App: sichtbarer Hinweis „Zu kurz für diese Strecke — Minimum N s" mit Button „Minimum übernehmen", wenn die Dauer zu kurz ist (getippt, aus Preset oder durch Distanzänderung); keine automatische Korrektur außerhalb von AC-11  · files: src/components/AutoDriveControls.tsx, src/components/AutoDriveControls.render.test.ts  · Commits: df41c8c (ersetzt a6b837d, fd34882, b5c92da, aa1ce58)  · → AC-12

## Level 6 — Videoaufnahme: Grundbausteine (Erweiterung 2026-10-01)

<!-- Drei unabhängige Bausteine ohne gemeinsame Dateien → alle [P]. -->

- [ ] T10 [P]  App: `useVideoSettings` — ein gemerkter Datensatz im AsyncStorage unter `camera-slider.video-settings` (Schema-Version 1; Video aufnehmen Nein, Ton Ja, Auflösung `1080p`, Bildrate 30, Objektiv `wide`, Stabilisierung Nein); fehlender/unlesbarer Datensatz oder unbekannter Feldwert → Standard nur für dieses Feld; Schreiben des ganzen Datensatzes bei jeder Nutzeränderung + Unit-Tests  · files: src/components/useVideoSettings.ts, src/components/useVideoSettings.test.ts  · → AC-13, AC-21, AC-24, AC-26
- [ ] T11 [P]  App: `videoFormats` — reine Funktionen: Objektive aus der Geräteliste (Rückkameras vom Typ Weitwinkel/Ultraweitwinkel/Tele, pro Typ das erste); angebotene Formate je Objektiv (3 Standard-Auflösungen × 24/25/30/50/60 fps, nur was das Objektiv meldet, sortiert); Stabilisierung unterstützt ja/nein; wirksamer Wert bei nicht verfügbarem gemerktem Objektiv/Format (`wide`, dann 1080p/30, sonst erste Kombination) ohne den gemerkten Wert zu überschreiben + Unit-Tests  · files: src/components/videoFormats.ts, src/components/videoFormats.test.ts  · → AC-22, AC-23, AC-24, AC-26
- [ ] T12 [P]  Android: Berechtigung `RECORD_AUDIO` im Manifest (mit Kommentar wie bei CAMERA, BUG-3 aus PROJ-5)  · files: android/app/src/main/AndroidManifest.xml  · → AC-20, AC-21

## Level 7 — Videoaufnahme: Kamera und Ablauf

<!-- T13 und T14 haben disjunkte Dateien → beide [P]. T14 definiert in seiner eigenen Datei eine schmale Aufnahme-Schnittstelle (Aufnahme starten → liefert „stoppen"; Rückmeldungen „fertig mit Dateipfad" und „Fehler"), die T13 erfüllt; die Passung prüft T18. -->

- [ ] T13 [P]  App: `useVideoCamera` — Kamera- und Mikrofon-Berechtigung (Mikrofon nur bei Ton an, inkl. „dauerhaft abgelehnt"); gewähltes Objektiv und wirksames Format über `videoFormats` (T11); Video-Output mit Ziel-Auflösung und Ton an/aus; fps- und Stabilisierungs-Vorgabe an die Sitzung; Konfigurationsfehler → Rückfall auf Standard-Format + Hinweis; Sperre per Tippen (Punkt-Messung AF/AE/AWB im Modus „gesperrt", ohne Auto-Reset), „Auto" hebt sie auf, Sperre gilt nach Neukonfiguration als aufgehoben, Hinweis bei nicht unterstützter Messung; stellt die Aufnahme-Schnittstelle aus T14 bereit + Unit-Tests (Bibliothek gemockt)  · files: src/components/useVideoCamera.ts, src/components/useVideoCamera.test.ts  · → AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26
- [ ] T14 [P]  App: `useVideoDrive` — Zustandsmaschine bereit → startet → Vorlauf (2 s) → Fahrt → Nachlauf (2 s) → speichert → bereit gemäß Tabelle in `design.md`: AUTO_DRIVE über den bestehenden `sendAutoDriveCommand`, 3-s-Wächter auf `driving`, Ankunft über `driving` fällt + `atEnd`/`atStart`, Stopp in jeder Phase (STOP nur in „Fahrt"), Aufnahmefehler und Wechsel in den Hintergrund (App-Zustand) → STOP + Fehlermeldung, Vorlauf-Abbruch ohne Losfahren, Verbindungsabbruch → Aufnahme stoppen, Bildschirm-Sperre über `useKeepAwake`, Speichern in die Galerie als Video, Aufnahmedauer + Phase für die Anzeige, zweiter Start außerhalb von „bereit" ignoriert + Unit-Tests (Fake-Timer)  · files: src/components/useVideoDrive.ts, src/components/useVideoDrive.test.ts  · → AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-27, EC-5, EC-6, EC-7

## Level 8 — Videoaufnahme: Bedienoberfläche

<!-- Neue Datei VideoPanel und bestehende TimelapseControls — disjunkt → beide [P]. -->

- [ ] T15 [P]  App: `VideoPanel` (neue Datei) — Berechtigungs-Hinweis (erlauben / Einstellungen öffnen / „oder Ton ausschalten"), Vorschau mit Tippen-zum-Sperren, Schloss-Markierung am Tipp-Punkt und Button „Auto", REC-Anzeige (mm:ss + Phase Vorlauf/Fahrt/Nachlauf), Einstellungen Ton · Format · Objektiv (nur bei >1) · Stabilisierung (nur wenn unterstützt); alles gesperrt, solange beschäftigt + Render-Tests  · files: src/components/VideoPanel.tsx, src/components/VideoPanel.render.test.ts  · → AC-13, AC-16, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-28
- [ ] T16 [P]  App: `TimelapseControls` — neue Prop „Kamera wird für Video genutzt": keine Kamera-Vorschau, Hinweis „Kamera wird für Video genutzt — „Video aufnehmen" ausschalten, um den Zeitraffer zu nutzen", Start gesperrt; ohne die Prop unverändert + Tests  · files: src/components/TimelapseControls.tsx, src/components/TimelapseControls.test.ts  · → EC-10

## Level 9 — Videoaufnahme: Auto-Fahrt-Anbindung

- [ ] T17  App: `AutoDriveControls` — Schalter „Video aufnehmen" (gesperrt während Zeitraffer und während einer Fahrt mit Video), Anzeige „Videolänge ca. X s" (Dauer + 4 s), `VideoPanel` nur bei Schalter an; Fahrt-Buttons und Stopp über `useVideoDrive`, wenn der Schalter an ist, sonst bisheriger Weg; Sperre aller Bedienelemente außer Stopp, solange beschäftigt; Meldung „Video gespeichert" bzw. Fehlermeldung; Preset laden lässt die Video-Einstellungen unverändert + Render-Tests  · files: src/components/AutoDriveControls.tsx, src/components/AutoDriveControls.render.test.ts  · → AC-13, AC-14, AC-15, AC-17, AC-28, AC-29, EC-8, EC-9

## Level 10 — Videoaufnahme: Einbindung

- [ ] T18  App: `RootScreen` — `useVideoSettings`, `useVideoCamera`, `useVideoDrive` je einmal aufrufen und verdrahten (Aufnahme-Schnittstelle von T13 an T14); Kamera-Besitz aus „Video aufnehmen" ableiten; `JogControls` zusätzlich gesperrt, solange die Video-Fahrt nicht „bereit" ist; `TimelapseControls` bekommt „Kamera wird für Video genutzt"  · files: src/screens/RootScreen.tsx  · → AC-28, EC-9, EC-10

## Parallelisierung

- **Ebenen sind Barrieren.** Eine Ebene startet erst, wenn die vorherige vollständig integriert und gegen ihre AC-IDs verifiziert ist.
- **`[P]` setzt disjunkte Dateien voraus.** Zwei `[P]`-Tasks derselben Ebene teilen sich nie einen Pfad unter `files:`.
- **T6 ist bewusst nicht `[P]`** und läuft in einer eigenen Ebene — es ist der einzige Task, der sowohl das App-BLE-Client-Modul (T2, Level 1) als auch den Status-Hook (T5, Level 2) braucht, kann also erst nach beiden vollständig integrierten Ebenen gebaut werden.
- **AC-10** (Disconnect während Auto-Fahrt → Firmware stoppt) braucht keinen eigenen Verdrahtungs-Task — `onDisconnect` ruft in PROJ-2 bereits `motorStop()` auf, T1s Erweiterung von `motorStop()` (Reset von `autoDriving`) deckt den Rest ab.
- Während `/build` läuft jeder `[P]`-Task einer aktiven Ebene in einem eigenen Subagenten mit isoliertem Git-Worktree; danach integriert der Haupt-Agent, verifiziert gegen die AC-IDs der Ebene und hakt die Boxen hier ab.
- **Videoaufnahme (T10–T18):** keine Firmware-Tasks und keine `[user]`-Tasks — die Erweiterung ist rein App-seitig, ohne Dashboard-Einstellungen. Die Verifikation am echten Slider und Handy übernimmt `/qa`.
