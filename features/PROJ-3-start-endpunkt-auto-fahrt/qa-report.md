# QA Test Results

**Tested:** 2026-09-24
**App URL:** nicht ausführbar hier (`probe.kind: none`, App-Ebene und Layer `firmware`) — jedes Laufzeit-AC ist unten `[!] NOT VERIFIED`, bis ein Mensch es testet
**Tester:** QA Engineer (AI) — drei unabhängige `qa-engineer`-Lanes (Akzeptanz, Security, Regression), zusammengeführt vom Owner
**Scope:** `full` (erster `/qa`-Lauf für PROJ-3, HEAD `d3a37a4` auf `feat/PROJ-3-start-endpunkt-auto-fahrt`)

> Legende: `[x]` in diesem Lauf verifiziert (Beleg nötig) · `[ ] BUG` als kaputt verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund nötig)

## Vorbemerkung zur Methode

`probe.kind: none` gilt sowohl auf App-Ebene als auch im Layer `firmware` — es gab nichts zu starten und nichts live abzufragen. Alle Befunde stammen aus Quellcode-Inspektion (inkl. der vendorten Bibliotheken `firmware/.pio/libdeps/esp32dev/{FastAccelStepper,NimBLE-Arduino}`), aus dem einmaligen Suite-Lauf des Owners und aus einer Nachrechnung der Dauer-/Geschwindigkeitsformeln. Die App-Suite lief einmal vor dem Fan-out (6 Suites/92 Tests, siehe unten) und wurde vom Owner nach dem Hinzufügen eines neuen Testfiles ein zweites Mal komplett wiederholt (7 Suites/109 Tests) — beide Läufe sind unten zitiert. Die drei Lanes selbst haben keine Suite erneut ausgeführt, nur einzelne Dateien gelesen.

## Automatisierte Tests (Step 5)

- **App-Suite** (`npm test`) — PASS — erster Lauf vor dem Fan-out: 6 Suites, 92 Tests, 0 fehlgeschlagen (`ConnectionProvider.test.tsx`, `connectionReducer.test.ts`, `useJogState.test.ts`, `client.test.ts`, `useSliderStatus.test.ts`, `App.test.tsx`). Zweiter Lauf nach Ergänzung von `AutoDriveControls.test.ts` (Owner, Step 6): 7 Suites, **109 Tests, 0 fehlgeschlagen**.
- **Firmware-Layer** — `[!] NOT VERIFIED — no test command recorded for layer firmware` (`commands.test: null` in `.ai-eng-kit`). Ersatzweise: `pio run -e esp32dev` → `[SUCCESS]` (RAM 12,6 %, Flash 48,9 %) — belegt nur, dass die Firmware baut, nicht ihr Verhalten.
- **E2E-Suite** — nicht vorhanden, übersprungen (kein früherer `/e2e-tests`-Lauf).

## Acceptance Criteria Status

#### AC-1: Startpunkt setzen (überschreibt vorherigen)
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Code-Kette vollständig geprüft: `AutoDriveControls.tsx:123-125` → `client.ts:214-222` (Opcode `0x02`, Write mit Antwort, Test `client.test.ts:77`) → `ble.cpp:143-148` → `motor.cpp:226-235` (überschreibt `startPosition`).
- Zusatzbefund: wird still ignoriert, solange der Stepper läuft (`motor.cpp:230`) — siehe BUG-11.

#### AC-2: Endpunkt setzen (überschreibt vorherigen)
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Gleiche Kette: `AutoDriveControls.tsx:127-129` → `client.ts:229-237` (Test `client.test.ts:93`) → `ble.cpp:150-155` → `motor.cpp:237-243`.
- Gleicher Zusatzbefund wie AC-1 (BUG-11).

#### AC-3: Auto-Fahrt Start → Ende kommt nach eingegebener Dauer an
- [ ] BUG-2 (Medium) — die Firmware berechnet `speed = distance/duration` (`motor.cpp:280-291`) ohne die Beschleunigungsrampe (`kAcceleration = 8000` steps/s², `motor.cpp:24,139`) einzurechnen. `setSpeedInHz` ist laut vendortem `FastAccelStepper.h:400-401` die *Maximal*geschwindigkeit, nicht die Durchschnittsgeschwindigkeit — die reale Fahrzeit ist `d/v + v/a`, bei 4000 steps/s also **+0,5 s** zu lang (Beispiel: 40 000 Steps/„10 s" kommen nach ca. 10,5 s an, 5 % zu spät). Bei kurzen Fahrten unter 0,5 s wird das Profil dreieckig und weicht noch stärker ab (800 Steps/„0,2 s" → ca. 0,63 s). `spec.md`s Decision Log lehnt eine „stille Abweichung von der eingegebenen Dauer" explizit ab — das ist genau das.
- [!] NOT VERIFIED (physisch) — no way to run and probe this project was recorded.
- Rest der Kette PASS (Code): `AutoDriveControls.tsx:116` (nur bei `atStart`), `client.ts:249-271` (Opcode `0x04`, Richtung `0x00`, Tests `client.test.ts:110,135,145`), `ble.cpp:157-171`, `motor.cpp:305` (`moveTo(endPosition)`).

#### AC-4: Auto-Fahrt Ende → Start kommt nach eingegebener Dauer an
- [ ] BUG-2 (Medium) — derselbe Rampenfehler wie AC-3, gleicher Codepfad (`motor.cpp:280-291`).
- [!] NOT VERIFIED (physisch) — no way to run and probe this project was recorded.
- Rest der Kette PASS (Code): `AutoDriveControls.tsx:117` (nur bei `atEnd`), Richtung `0x01` (`client.ts:39-42`, Test `client.test.ts:125`), Ziel `startPosition` (`motor.cpp:260-263`).

#### AC-5: Stopp hält den Motor sofort an
- [!] NOT VERIFIED — no way to run and probe this project was recorded.
- Garantie im Code PASS: Stopp-Button sichtbar/aktiv nur während `driving` (`AutoDriveControls.tsx:216-223`) → STOP als Write mit Antwort (`client.ts:199-207`, Test `client.test.ts:61`) → `ble.cpp:172-178` → `motorStop()` → `forceStop()` ohne Bremsrampe, laut `FastAccelStepper.h:575-578` Stillstand nach ca. 20 ms (`motor.cpp:189`) → `autoDriving = false` (`motor.cpp:201`).

#### AC-6: Ungültige Dauer → Fehlermeldung mit erlaubtem Bereich, keine Fahrt
- [ ] BUG-3 (Medium) — App und Firmware validieren unterschiedliche Werte: die App prüft die *ungerundete* Eingabe (`AutoDriveControls.tsx:91-97`), gesendet wird aber `Math.round(sekunden*10)` (`client.ts:254-257`), und die Firmware prüft den *gerundeten* Wert (`motor.cpp:283-286`). Folge: Werte knapp an der Grenze gelten in der App als gültig (Button aktiv), der Druck bewirkt aber nichts — ohne jede Rückmeldung. Nachgerechnet (Node, Formeln aus den drei genannten Stellen):
  | Distanz | Eingabe | Gesendet | Firmware-Speed | Ergebnis |
  |---|---|---|---|---|
  | 50100 Steps | 12,53 s | 125 ds | 4008 steps/s | von der Firmware abgelehnt |
  | 840 Steps | 0,22 s | 2 ds | 4200 steps/s | von der Firmware abgelehnt |
  | 1012 Steps | 5,055 s | 51 ds | 198,4 steps/s | von der Firmware abgelehnt |
- [ ] BUG-4 (Low) — die angezeigte Fehlermeldung rundet Minimum und Maximum beide mit `toFixed(1)` (`AutoDriveControls.tsx:41-43`) statt Minimum auf-/Maximum abzurunden. Bei 50100 Steps zeigt die Meldung „erlaubt: 12.5–250.5 s", obwohl exakt 12,5 s wegen BUG-3 als ungültig markiert wird — die Meldung widerspricht sich selbst.
- [!] NOT VERIFIED (Darstellung am Gerät) — no way to run and probe this project was recorded.
- Grundmechanik PASS (Code): Bereichsberechnung `distance/4000 … distance/200` (`AutoDriveControls.tsx:84-97`), Auslöser gesperrt bei ungültiger Dauer (`:108-117`), Firmware prüft unabhängig erneut (`motor.cpp:283-286`).

#### AC-7: Ohne beide Punkte sind die Auto-Fahrt-Auslöser deaktiviert
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Logik PASS (Code): beide Auslöser erfordern `hasStart && hasEnd && distanceSteps > 0` (`AutoDriveControls.tsx:108-117`, `disabled` in Z. 194/206); Flags korrekt geparst (`client.ts:284-306`, Tests `client.test.ts:170,228,238`). Kein Komponententest für `AutoDriveControls` in der Suite (nur die reinen Hilfsfunktionen, siehe Step 6).

#### AC-8: Auslöser nur aktiv, wenn exakt am jeweiligen Startpunkt der Richtung
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Logik PASS (Code): `atStart`/`atEnd` kommen aus der Firmware, exakter Vergleich nur im Stillstand (`motor.cpp:357-365`), App schaltet danach (`AutoDriveControls.tsx:116-117`), Firmware lehnt unabhängig ab (`motor.cpp:264-270`). Parse-Test: `client.test.ts:217`.

#### AC-9: Während einer Auto-Fahrt reagieren nur der Stopp-Button, Jog/Setzen nicht
- [ ] **BUG-1 (High)** — die Sperre existiert nur in der App-UI, nicht in der Firmware. `motorJog()` prüft `autoDriving` nicht (`motor.cpp:142-180`), der Command-Handler reicht jeden JOG-Write ungeprüft durch (`ble.cpp:132-141`). Trifft während einer laufenden Auto-Fahrt (`autoDriving == true`, gesetzt in `motor.cpp:304` vor `moveTo()`) ein JOG-Befehl ein, macht `runForward()`/`runBackward()` aus der geplanten `moveTo()`-Fahrt einen **unbegrenzten Dauerlauf** (`FastAccelStepper`s dokumentiertes Verhalten, vendort in `RampGenerator.cpp:32-47`). `autoDriving` bleibt dabei `true` (motorJog fasst es nicht an), wodurch **beide** verbleibenden Sicherheitsnetze verstummen: `motorAutoDriveCheck()` löscht das Flag nur bei `!isRunning()`, was bei Dauerlauf nie eintritt (`motor.cpp:318`), und `motorWatchdogCheck()` kehrt bei `autoDriving == true` sofort zurück, ganz ohne den 1-Sekunden-Timeout zu prüfen (`motor.cpp:208-215`). Der Motor stoppt dann nur noch durch ein explizites STOP oder einen vollständigen Verbindungsabbruch — auf einer Schiene ohne Endanschläge (`spec.md` → Out of Scope) ein reales Risiko für die Mechanik.
  - Erreichbar aus der App: Das Notify mit `driving=true` braucht eine BLE-Roundtrip-Latenz, bis dahin ist kein Jog-Button optimistisch gesperrt (`AutoDriveControls.tsx:131-136` sendet AUTO_DRIVE ohne selbst zu sperren; `JogControls` sperrt erst, wenn `status.driving` über das Notify ankommt, `RootScreen.tsx:34,68`) — ein zweiter Fingertipp in diesem kurzen Fenster reicht.
  - Reproduktion (aus dem Code, nicht auf Hardware ausgeführt): Start/Ende setzen, „Start → Ende" antippen, innerhalb von ca. 100 ms „▲ Vorwärts" gedrückt halten, danach nichts mehr senden (App einfrieren/STOP unterdrücken). Erwartet: Stopp nach ≤1 s. Laut Code tatsächlich: Dauerlauf.
  - Widerspricht `design.md`s eigenem Grundsatz (Zeile 117: „Firmware verlässt sich nicht auf die App") — der ist für AUTO_DRIVE umgesetzt, für JOG während einer Fahrt aber nicht.
  - **Unabhängig von drei separaten QA-Lanes (Akzeptanz, Security, Regression) gefunden und mit identischen `file:line`-Belegen bestätigt** — kein Einzelbefund.
  - Fix-Richtung (nicht selbst umgesetzt, gehört zu `/build`): Guard in `motorJog()`, z. B. `if (autoDriving) return;` — analog zum bestehenden `isRunning()`-Guard in `motorSetStart()`/`motorSetEnd()`.
- [!] NOT VERIFIED (UI-Sperre selbst am Gerät) — no way to run and probe this project was recorded.

#### AC-10: BLE-Abbruch während Auto-Fahrt → Firmware stoppt eigenständig
- [ ] BUG-5 (Medium) — die Firmware stoppt nur, wenn `getConnectedCount() == 0` ist (`ble.cpp:107-113`). Advertising läuft auch während einer bestehenden Verbindung weiter (`ble.cpp:87`), erlaubt bis zu 3 gleichzeitige Verbindungen (`nimconfig.h:225`), und für den reinen *Connect* ist kein Bonding nötig (`WRITE_ENC` schützt nur Schreibzugriffe). Hält also ein zweites, unbeteiligtes BLE-Gerät (z. B. eine Scanner-App in Reichweite) eine eigene Verbindung, stoppt die Firmware nicht, wenn nur die App-Verbindung abbricht — und der Jog-Watchdog greift wegen BUG-1 während `autoDriving` ohnehin nicht. Für den Normalfall (kein zweites Gerät verbunden) bleibt die Garantie intakt.
- [!] NOT VERIFIED (Normalfall, Hardware) — no way to run and probe this project was recorded.
- Grundmechanismus PASS (Code): `onDisconnect` → `motorStop()` (`ble.cpp:107-113`), für jeden Fahrmodus.

## Edge Cases Status

#### EC-1: Start = Ende (0 Steps) → Auslöser deaktiviert
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Logik PASS (Code): Hinweistext (`AutoDriveControls.tsx:106,187-189`), Auslöser gesperrt über `distanceSteps > 0` (`:113`), Firmware lehnt unabhängig ab (`motor.cpp:275-278`).

#### EC-2: Zweite Auslöse-Anfrage während laufender Fahrt wird ignoriert
- [x] PASS (Garantie im Code bestätigt) — `motor.cpp:251` lehnt bei `autoDriving || stepper->isRunning()` ab, gesetzt in `motor.cpp:303-305`. Alle Command-Writes laufen seriell im einen NimBLE-Host-Task (`NimBLEDevice.cpp:884,1009` der vendorten Bibliothek) — kein Check-then-Set-Race zwischen zwei AUTO_DRIVE-Anfragen möglich, auch nicht über mehrere Verbindungen hinweg. Die App selbst entprellt einen Doppel-Tap nicht (`AutoDriveControls.tsx:131-136`), die Firmware fängt es aber zuverlässig ab.

#### EC-3: App-Neustart/Reconnect → Start/Ende nicht mehr gesetzt
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Garantien PASS (Code): Firmware `onConnect` → `motorClearPoints()` (`ble.cpp:74` → `motor.cpp:245-248`); App `useSliderStatus` setzt bei `device === null` zurück (`useSliderStatus.ts:48-56`, Tests `useSliderStatus.test.ts:108,139`, im Suite-Lauf bestanden).
- Zusatzbefund BUG-6 (Medium, siehe unten) — dieselbe Firmware-Logik löscht die Punkte bei **jedem** neuen Connect, nicht nur bei einem Reconnect der eigenen App.

#### EC-4: Auto-Fahrt läuft weiter, wenn App in den Hintergrund geht/abstürzt
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Garantie PASS (Code): Watchdog kehrt bei `autoDriving` sofort zurück (`motor.cpp:208-215`), App sendet beim Hintergrund-Wechsel nichts Eigenes (`ConnectionProvider.tsx:240-258` reagiert nur auf `active`). Beobachtung (kein Bug): ein echter App-Absturz schließt auf Android meist die GATT-Verbindung, dann greift eher AC-10 als EC-4.

## Nicht dokumentierte Befunde

#### BUG-6 (Medium) — jeder BLE-Connect löscht Start/Ende, nicht nur der eigenen App
`ble.cpp:74` ruft `motorClearPoints()` in `onConnect` für **jede** neue Verbindung auf, auch unverschlüsselt/ungebondet (`onConnect` feuert vor Pairing, vendort in `NimBLEServer.cpp:446-471`) und auch während die App bereits verbunden ist (Advertising läuft weiter, `ble.cpp:87`). Ein beliebiges fremdes Gerät in Reichweite kann so mitten in der Sitzung — auch während einer laufenden Fahrt — die gesetzten Punkte löschen. Die App sieht nur `hasStart=false` über das Notify, ohne Erklärung. Workaround: Punkte neu setzen.

#### BUG-7 (Medium) — Bond-Verdrängung kann die App aussperren, auch für STOP
Just-Works-Bonding nimmt jede Pairing-Anfrage ohne Rückfrage an (`ble.cpp:234,245`). Bei maximal 3 gespeicherten Bonds (`nimconfig.h:234`) wird bei Überlauf der älteste per `ble_gap_unpair_oldest_peer()` verdrängt (vendort in `ble_store_util.c:350-355`). Drei fremde Pairings verdrängen so den Bond der App; die Command-Characteristic verlangt `WRITE_ENC` (`ble.cpp:280-282`), wodurch alle App-Writes fehlschlagen — STOP eingeschlossen — bis der Nutzer die Kopplung manuell in den Android-Einstellungen entfernt. Ob Android danach automatisch neu pairt: `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

#### BUG-8 (Low) — AUTO_DRIVE-Richtungsbyte nicht streng validiert
`ble.cpp:161-163`: jeder Wert ungleich `0x00` wird als „Ende→Start" gewertet, auch `0x02`–`0xFF`, statt nur `0x00`/`0x01` zu akzeptieren. Keine Sicherheitsfolge (Position/Distanz/Geschwindigkeit werden danach unabhängig geprüft), aber ungültige Eingabe wird angenommen statt verworfen. Dasselbe Muster besteht bereits bei JOG (PROJ-2, `ble.cpp:138-139`).

#### BUG-9 (Low) — veralteter Sicherheits-Kommentar
`ble.cpp:225-228` behauptet, ein Passkey-/Zahlenvergleich-Flow sei „not an option" — laut PROJ-2s `qa-report.md` wurde diese Aussage in `design.md` und im Stack-Pack bereits korrigiert (ein fester Passkey wäre mit `BLE_HS_IO_DISPLAY_ONLY` + `setSecurityPasskey()` + `mitm=true` + `WRITE_AUTHEN` möglich), nur der Firmware-Kommentar wurde nicht nachgezogen.

#### BUG-10 (Low) — Statuszeile zeigt keine Richtung, kein Einzelpunkt-Hinweis
`AutoDriveControls.tsx:46-52` zeigt während der Fahrt immer nur „Fährt…", `design.md` sieht „Fährt zum Ende…"/„Fährt zum Start…" vor. Bei nur einem gesetzten Punkt wird nicht angezeigt, welcher. Abweichung vom Design, nicht vom Spec (spec.md schreibt keinen exakten Wortlaut vor).

#### BUG-11 (Low) — SET_START/SET_END ohne Rückmeldung ignoriert, wenn der Stepper läuft
`motor.cpp:230,238`: wird still verworfen, solange `isRunning()` true ist (z. B. ~20 ms nach Jog-Loslassen, oder Multi-Touch „Jog halten + Setzen tippen"). Die Setzen-Buttons sind nur während `driving` gesperrt, nicht während des Joggens. Ein alter Punkt bleibt dann unbemerkt bestehen.

#### BUG-12 (Low) — Data Race auf `gLastStatusPayload`/`gHasSentStatus`
`ble.cpp:41-42,211-212,324-325`: `onSubscribe` (BLE-Host-Task) und `bleNotifyStatusIfChanged()` (loop-Task) schreiben denselben nicht-`volatile` Puffer ohne Synchronisation und rufen `setValue()`/`notify()` potenziell gleichzeitig auf. Gleiche Bugklasse wie die in dieser Session bereits behobenen `motor.cpp`-Races, hier aber übersehen. Schlimmstenfalls: eine veraltete oder doppelte Notification, sichtbar z. B. als kurzzeitig falsch angezeigter `driving`-Status.

#### BUG-13 (Low) — schmales Race-Fenster in `motorAutoDriveCheck()`
Treffen STOP und ein neues AUTO_DRIVE genau zwischen dem Lesen von `autoDriving`/`autoDriveStartMillis` und dem `isRunning()`-Aufruf ein, kann `autoDriving` fälschlich gelöscht werden (`motor.cpp:303-322`). Fällt sicher aus (Motor stoppt), wirkt aber wie eine abgebrochene statt einer nie gestarteten Fahrt.

#### BUG-14 (Low) — Rückgabewert von `moveTo()` ignoriert
`motor.cpp:305`: scheitert der Aufruf, bleibt `autoDriving` nur bis zum Ende der 100-ms-Anlaufzeit `true`, dann setzt sich der Zustand von selbst zurück (`motor.cpp:315-321`). Harmlos (kein hängendes `driving`), aber keine Fehlerrückmeldung an den Nutzer.

## Security Audit Results

_BLE-Peripherie ohne HTTP-Oberfläche, kein Backend, keine Nutzerkonten — die Checkliste ist entsprechend übersetzt, siehe Vorbemerkung. Alles unten ist Code-Inspektion, `probe.kind: none`._

- [x] **BLE-Link-Absicherung (Äquivalent zu „Authentication bypass")** — Command-Characteristic trägt `WRITE_ENC` (`ble.cpp:280-282`), unverschlüsselte Writes erreichen `onWrite` nicht. Evidenz: `ble.cpp:234,245`.
- [ ] **BUG (Kontext, keine Neubewertung)** — Just Works (`mitm=false`) authentifiziert nicht, nur verschlüsselt: jedes Gerät in Reichweite kann pairen und danach schreiben. Diese Risikoentscheidung wurde bei PROJ-2 bewusst getroffen (`features/PROJ-2-manuelle-steuerung-jog/qa-report.md:109`) — hier nur zur Kenntnis genommen, keine neue Bewertung. PROJ-3 senkt die Angriffshürde aber von „muss dauerhaft JOG senden" auf „ein einziges Paket" (BUG-1) und fügt zwei neue, von Fremdgeräten auslösbare Nebenwirkungen hinzu (BUG-6, BUG-5).
- [!] NOT VERIFIED — not applicable (keine Nutzerkonten, Einzelnutzer-Gerät) — Authorization über mehrere Nutzer hinweg.
- [x] **Eingabevalidierung an der BLE-Grenze (Äquivalent zu Input Injection)** — Längenprüfung vor jedem Payload-Zugriff, exakte Länge je Opcode (`ble.cpp:126,133,144,151,158,173`), unbekannte Opcodes ignoriert (`:179-183`), kein Out-of-Bounds-Read möglich. AUTO_DRIVE wird unabhängig von der App erneut validiert (`motor.cpp:251-286`: `autoDriving`, `hasStart`/`hasEnd`, exakte Position, Distanz≠0, Geschwindigkeit 200–4000). Ausnahme: BUG-8 (loses Richtungsbyte, Low, keine Sicherheitsfolge).
- [x] **Geschwindigkeits-/Bereichsprüfung unabhängig von der App** — PASS. `motor.cpp:283-286` lehnt außerhalb 200–4000 steps/s ab; bei `uint16`-Dauer (max. 6553,5 s) ist keine Geschwindigkeit außerhalb des Bereichs erreichbar.
- [x] **Integer-Overflow/-Underflow bei Positions-/Distanzrechnung** — PASS mit Anmerkung (Low, physisch unerreichbar). `int32`-Subtraktionen (`motor.cpp:272,347`) könnten bei >2³¹ Steps Auseinanderliegen (theoretisch UB) überlaufen — physisch auf einer endlichen Schiene ausgeschlossen.
- [!] NOT VERIFIED — not implemented (optional for MVP) — Rate Limiting auf BLE-Writes; im Web-Sinn nicht anwendbar.
- [!] NOT VERIFIED — not applicable (kein Login/Signup/Passwort-Reset, kein Credential-Check) — Brute Force, Account-Enumeration.
- [!] NOT VERIFIED — not applicable (no HTTP surface in this project) — Credentials in der URL.
- [x] **Keine Secrets im Bundle** — PASS. Kein Backend, `grep -rniE "api[_-]?key|secret|token|password|https?://" src App.tsx firmware/src` findet nur Kommentartreffer; die BLE-UUIDs sind öffentlicher Protokollvertrag.
- [x] **Status-Characteristic-Payload enthält nichts Sensibles** — PASS. Exakt 5 Byte, Flags + Distanz (`ble.cpp:48-61`), keine Adressen/Bonds/Geräte-IDs. Notify ist unverschlüsselt abrufbar (`ble.cpp:289`) — bei diesem Inhalt unbedenklich.
- [ ] **BUG-5 (Medium)** — AC-10s Disconnect-Stopp-Garantie ist durch ein unbeteiligtes, ungebondetes Zweitgerät aushebelbar (Details oben unter AC-10).
- [ ] **BUG-6 (Medium)** — jeder Connect löscht die Punkte, auch von einem unbeteiligten Gerät (Details oben).
- [ ] **BUG-7 (Medium)** — Bond-Verdrängung kann die App aussperren (Details oben).
- [ ] **BUG-8 (Low)** — loses AUTO_DRIVE-Richtungsbyte (Details oben).
- [ ] **BUG-9 (Low)** — veralteter Sicherheits-Kommentar (Details oben).
- [ ] **BUG-12 (Low)** — Data Race auf dem Status-Notify-Puffer (Details oben).

**Security-Zusammenfassung:** 6 Checks verifiziert (PASS), 4 NOT VERIFIED (3× not applicable, 1× not implemented/optional), 6 Bugs gefunden (0 Critical, 0 High — BUG-1 selbst ist als Acceptance-Bug unter AC-9 gezählt, nicht doppelt hier —, 3 Medium: BUG-5/6/7, 3 Low: BUG-8/9/12).

## E2E Tests
- Status: **not run** (run `/e2e-tests` for critical flows)

## Step 6 — Unit-Tests (Owner)

Neu geschrieben: `src/components/AutoDriveControls.test.ts` (17 Tests) für die drei reinen, bis dahin ungetesteten Hilfsfunktionen aus `AutoDriveControls.tsx` (`parseDurationSeconds`, `formatSeconds`, `statusLabelFor` — dafür `export` ergänzt, keine Verhaltensänderung). Abdeckung: Komma-/Punkt-Dezimaltrennzeichen, leere/nicht-numerische/negative/unendliche Eingabe, Rundung, alle drei Statuszeilen-Fälle.

Rot-Probe durchgeführt: alle drei Funktionen in der Quelldatei gezielt kaputt gemacht (Komma-Ersetzung entfernt, Null-/Negativ-/Unendlich-Filter entfernt, Rundung auf 3 statt 1 Dezimalstelle, Reihenfolge der `statusLabelFor`-Zweige vertauscht + Fallback-Text geändert), Testdatei erneut laufen lassen: **12 von 17 Tests wurden rot**, jeweils mit der erwarteten Diskrepanz (z. B. „Expected: null, Received: NaN" / „Expected: Bereit, Received: kaputt"); die verbleibenden 5 grünen Tests betreffen Eingaben, die von der jeweils kaputt gemachten Regel nicht berührt waren. Danach Quelldatei zurückgesetzt, Testdatei erneut grün (17/17). Kein Blindgänger-Test in der Datei.

Gesamte Suite nach der Ergänzung erneut komplett gelaufen (Owner, Step 5-Nachtrag): `npm test` → 7 Suites, 109 Tests, 0 fehlgeschlagen.

## Not Verified In This Run

- [!] Laufzeitverhalten der gesamten App und Firmware auf echter Hardware — AC-1, AC-2, AC-5, AC-7, AC-8, EC-1, EC-3, EC-4 vollständig; der physische/UI-Teil von AC-3, AC-4, AC-6, AC-9, AC-10 — Grund: `no way to run and probe this project was recorded` (`probe.kind: none`, App-Ebene und Layer `firmware`).
- [!] Firmware-eigene Tests — kein `commands.test` für den Layer `firmware` hinterlegt (`null`); nur der Compile-Nachweis (`pio run` → SUCCESS) liegt vor.
- [!] Komponententest für `AutoDriveControls` als Ganzes (Rendering, Button-Enablement-Kette end-to-end) — nur die extrahierten reinen Hilfsfunktionen sind unit-getestet (Step 6); kein Render-Test in der Suite.
- [!] Zwei parallele `monitorCharacteristicForService`-Aufrufe auf dieselbe Status-Characteristic (`RootScreen.tsx:34` und `AutoDriveControls.tsx:73`, je über `useSliderStatus`) — ob `react-native-ble-plx` das auf Android als eine gemeinsame native Subscription führt oder als zwei, ist ungeprüft.
- [!] Rate Limiting auf BLE-Writes — nicht implementiert, für ein MVP dieser Art optional, keine Web-Analogie anwendbar.
- [!] Verhalten von Android nach Verlust des Bonds (BUG-7) — ob automatisch neu gepaart wird — nur auf echter Hardware prüfbar.
- [!] Cross-Browser/Responsive/DevTools — entfällt vollständig, mobile App ohne Browser-Oberfläche.

## Bugs Found

### Previously Fixed
- **BUG-1** — JOG während laufender Auto-Fahrt hebelt Watchdog UND Auto-Fahrt-Ankunftserkennung aus — Severity: High
- **BUG-2** — Auto-Fahrt kommt wegen ignorierter Beschleunigungsrampe später an als die eingegebene Dauer — Severity: Medium
- **BUG-3** — App validiert die Dauer ungerundet, Firmware gerundet — Grenzwerte scheitern stillschweigend — Severity: Medium
- **BUG-5** — Disconnect-Stopp-Garantie (AC-10) durch unbeteiligtes Zweitgerät aushebelbar — Severity: Medium
- **BUG-6** — Jeder BLE-Connect löscht Start-/Endpunkt, nicht nur ein Reconnect der eigenen App — Severity: Medium
- **BUG-7** — Bond-Verdrängung (Just Works, max. 3 Bonds) kann die App aussperren, auch für STOP — Severity: Medium

Details und Fix-Verlauf: siehe „Re-Verifikation" unten.

### BUG-4: Angezeigter Dauer-Bereich in der Fehlermeldung ist an den Grenzen widersprüchlich
- **Severity:** Low
- **Steps to Reproduce:** Distanz 50100 Steps, ungültige Dauer eingeben → Meldung „erlaubt: 12.5–250.5 s" erscheint, obwohl genau 12,5 s (wegen BUG-3) tatsächlich abgelehnt wird.
- **Priority:** Nice to have (hängt an BUG-3s Fix)

### BUG-8: AUTO_DRIVE-Richtungsbyte nicht streng validiert
- **Severity:** Low
- **Priority:** Nice to have

### BUG-9: Veralteter Sicherheits-Kommentar in ble.cpp
- **Severity:** Low
- **Priority:** Nice to have

### BUG-10: Statuszeile zeigt keine Fahrtrichtung / keinen Einzelpunkt-Hinweis
- **Severity:** Low
- **Priority:** Nice to have

### BUG-11: SET_START/SET_END ohne Rückmeldung ignoriert, wenn der Stepper noch läuft
- **Severity:** Low
- **Priority:** Nice to have

### BUG-12: Data Race auf dem Status-Notify-Puffer (`gLastStatusPayload`/`gHasSentStatus`)
- **Severity:** Low
- **Priority:** Fix in next sprint (gleiche Bugklasse wie die in dieser Session bereits gefixten `motor.cpp`-Races)

### BUG-13: Schmales Race-Fenster in `motorAutoDriveCheck()` bei gleichzeitigem STOP+AUTO_DRIVE
- **Severity:** Low
- **Priority:** Nice to have

### BUG-14: Rückgabewert von `moveTo()` ignoriert
- **Severity:** Low
- **Priority:** Nice to have

## Summary (Erstlauf, 2026-09-24 — inzwischen überholt, siehe Re-Verifikation unten)
- **Acceptance Criteria:** 0/10 als voll bestätigt verifizierbar (kein Probe möglich), 4 AC mit einem im Code bestätigten Bug (AC-3, AC-4, AC-6, AC-9), 1 AC mit bedingtem Bug (AC-10), 5 AC mit intakter Code-Kette aber `NOT VERIFIED` (AC-1, AC-2, AC-5, AC-7, AC-8); EC-2 PASS (Garantie im Code bestätigt), EC-1/EC-3/EC-4 `NOT VERIFIED` mit intakter Code-Kette
- **Bugs Found:** 14 total (0 Critical, 1 High, 5 Medium, 8 Low)
- **Security:** 6/10 Checks verifiziert, 4 NOT VERIFIED (3× not applicable, 1× not implemented/optional) — siehe Security-Zusammenfassung oben
- **Production Ready:** NO (Stand Erstlauf)
- **Empfehlung (Erstlauf):** Vor allem BUG-1 (High) fixen — das ist der Kern-Bug, den alle drei Lanes unabhängig gefunden haben und der die zentrale Sicherheitsgarantie von AC-9 in der Firmware aushebelt. Die Medium-Bugs (BUG-2,3,5,6,7) sollten im selben Durchgang mit, da sie alle dieselbe Interaktion (Firmware verlässt sich zu sehr auf die App bzw. auf "es verbindet sich schon niemand Fremdes") betreffen. Danach `/qa` erneut — als Re-Verifikation im Umfang des Diffs.

---

## Re-Verifikation (2026-09-24, mehrere Runden)

**Auftrag:** High- und Medium-Bugs (BUG-1, 2, 3, 5, 6, 7) fixen. Die Low-Bugs (BUG-4, 8–14) bleiben bewusst offen.

**Ablauf** — vier Commits, jeder unabhängig re-verifiziert (fünf weitere `qa-engineer`-Lanes über drei Runden):

1. `6dc8e80` — erster Fix-Durchgang für BUG-1, 2, 3, 5, 6, 7.
2. **Re-Verifikation Runde 1** (drei Lanes, volle Breite, da der Diff gemeinsam mit PROJ-1/PROJ-2 genutzten Firmware-Code betrifft): BUG-1, BUG-2, BUG-6 sauber geschlossen. BUG-3 nur teilweise (Rundung stimmte, Rest-Ungenauigkeit durch `float32` vs. `double` blieb). **BUG-5 und BUG-7 waren beide schlimmer als vorher**: der unbedingte `motorStop()` bei jedem Disconnect ließ ein beliebiges unautorisiertes Gerät per bloßem Connect/Disconnect jede laufende Fahrt abbrechen (Wiedereinführung von PROJ-2s eigenem, bereits gefixtem N-1-Bug — unabhängig von zwei Lanes gefunden); `CONFIG_BT_NIMBLE_MAX_BONDS=1` ließ schon ein einziges fremdes Pairing den App-Bond verdrängen und die App trennen (vorher waren drei nötig).
3. `89e0c8f` — Korrektur: `onDisconnect` prüft jetzt `connInfo.isEncrypted()` statt der Verbindungsanzahl (nur eine Verbindung, die tatsächlich das Pairing abgeschlossen hat, kann je den Motor gesteuert haben). Ein eigener `NimBLEDeviceCallbacks::onStoreStatus`-Handler lehnt einen Bond-Speicher-Überlauf jetzt ab, statt den bestehenden Bond zu verdrängen. Dazu die numerisch stabile Form (`2ad/(aT+√disc)` statt `(aT−√disc)/2`) gegen die verbleibende BUG-3-Ungenauigkeit.
4. **Re-Verifikation Runde 2** (drei Lanes, weiterhin volle Breite): BUG-1, BUG-2, BUG-5 bestätigt korrekt geschlossen. BUG-3s numerische Form mathematisch bestätigt (575 Abweichungen auf wenige exakte Grenzfälle reduziert). **BUG-7 war jetzt korrekt für den Speicher-Schutz, aber ohne Rückweg**: Da nichts mehr verdrängt, gab es keinen Weg mehr, einen falsch belegten Bond-Slot zu löschen (z. B. nach der NVS-Migration von der alten `MAX_BONDS=3`-Firmware) — nur noch per Flash-Löschen behebbar.
5. `126097e` — Ergänzung: BOOT-Taster-Reset (`NimBLEDevice::deleteAllBonds()`) als Rückweg, dazu eine kleine symmetrische Geschwindigkeits-Toleranz (0,1 Steps/s) gegen die verbleibenden exakten BUG-3-Grenzfälle.
6. **Re-Verifikation Runde 3** (eine fokussierte Lane, schmaler Diff): Der BOOT-Taster-Mechanismus wie dokumentiert („beim Einschalten halten") **kann auf echter Hardware nicht funktionieren** — GPIO0 ist ein Strapping-Pin, den das ROM genau im Einschalt-Moment liest; gehalten löst das den USB-Download-Modus aus, die Firmware startet nie. Außerdem: Die 0,1-Steps/s-Toleranz war größer als nötig und ließ die App in seltenen Fällen mehr Dauern akzeptieren, als sie selbst als gültigen Bereich anzeigt.
7. `f188420` — finale Korrektur: BOOT-Taster wird jetzt in einem 2-Sekunden-Fenster **nach** dem Start abgefragt (nicht während des Einschaltens) — das ist nach dem ROM-Einlese-Zeitpunkt, also ein ganz normaler GPIO. Toleranz auf 0,01 Steps/s reduziert (gegen eine 759-Mio.-Kombinationen-Stichprobe verifiziert: weiterhin 0 schädliche Abweichungen).

**Status je Bug nach allen Runden:**

| Bug | Status | Beleg |
|---|---|---|
| BUG-1 (High) | **Geschlossen** | `motorJog()` lehnt bei `autoDriving` ab (`motor.cpp`), dreifach unabhängig bestätigt |
| BUG-2 (Medium) | **Geschlossen** (mathematisch; physische Ankunftszeit weiterhin `NOT VERIFIED`) | Trapez-Geschwindigkeitsformel in `motor.cpp`/`AutoDriveControls.tsx`, Herleitung zweifach unabhängig nachgerechnet |
| BUG-3 (Medium) | **Geschlossen** | Rundung + numerisch stabile Form + 0,01-Steps/s-Toleranz; 0 schädliche Abweichungen über 759 Mio. geprüfte Kombinationen |
| BUG-5 (Medium) | **Geschlossen** | `onDisconnect` prüft `connInfo.isEncrypted()`; schließt sowohl den ursprünglichen Bug als auch die selbst verursachte Regression gegen PROJ-2 |
| BUG-6 (Medium) | **Geschlossen** für den gemeldeten Fall | `onConnect` löscht Punkte nur bei `getConnectedCount()==1`. Bekannter Low-Restfall: hält ein fremdes Gerät durchgehend eine zweite Verbindung, während die App neu verbindet, greift die Bedingung nicht (EC-3 in diesem Rand-Szenario verletzt) — nicht gefixt, Severity Low |
| BUG-7 (Medium) | **Geschlossen** | Eigener `onStoreStatus`-Handler lehnt Bond-Überlauf ab statt zu verdrängen, plus BOOT-Taster-Reset (2-Sekunden-Fenster nach dem Start) als Rückweg |

**Neue, in den Re-Verifikationsrunden gefundene Low-Restbefunde (nicht gefixt, bewusst — außerhalb des High/Medium-Auftrags):**
- Verwaiste CCCD-Einträge, wenn ein Angreifer mit bis zu 8 verschiedenen Adressen sitzungsweise pairt und jeweils die Status-Characteristic abonniert — füllt den CCCD-Speicher, erst dann betroffen. Erfordert einen gezielten, mehrfachen Angriff.
- Nach einem BOOT-Taster-Reset behält Android seinen alten Schlüssel; der Nutzer muss die Kopplung dort vermutlich manuell entfernen, bevor ein Neu-Pairing klappt — nicht dokumentiert.
- Bereits vor PROJ-3 bestehend: `setSpeedInHz()` rundet auf ganze Hz, was bei sehr langen, langsamen Fahrten stärker von der eingegebenen Dauer abweicht als die neue Toleranz (bis zu einigen Sekunden bei extremen Distanzen) — `setSpeedInMilliHz()` wäre der genauere Weg, nicht umgesetzt.

**Tests:** `npm test` — 7 Suites, 117 Tests, 0 fehlgeschlagen (inkl. 25 neuer Tests für `AutoDriveControls.tsx`, rot-geprüft). `pio run -e esp32dev` — SUCCESS nach jedem Commit dieser Reihe.

## Summary (nach Re-Verifikation)
- **High/Medium-Bugs:** 6/6 geschlossen (BUG-1, 2, 3, 5, 6, 7), jeweils unabhängig re-verifiziert
- **Offen (bewusst, Low):** BUG-4, 8–14 sowie die drei oben genannten neuen Low-Restbefunde
- **Production Ready (Stand vor dem Hardware-Test):** NOT READY — not verified (kein Critical/High-Bug mehr offen, aber `probe.kind: none` — kein einziges Laufzeit-AC wurde tatsächlich ausgeführt)
- **Empfehlung (Stand vor dem Hardware-Test):** Human-Hardware-Test wie bei PROJ-1/PROJ-2 — insbesondere: normale Jog-/Auto-Fahrt-Regression, JOG während einer laufenden Auto-Fahrt (BUG-1), Trennen der App-Verbindung während einer Fahrt (BUG-5).

## Aufgezeichneter Human-Hardware-Test (2026-09-24)

Nach dem Re-Verifikations-Zyklus (Firmware neu geflasht ab Commit `f188420`) hat der Nutzer den geforderten fokussierten Test am echten Slider durchgeführt und bestätigt ("hardwaretest ok"):

- [x] **AC-1/AC-2/AC-3/AC-4/AC-5/AC-7/AC-8** — normale Jog-/Auto-Fahrt-Regression (Start/Ende setzen, beide Fahrtrichtungen, Stopp, Button-Freischaltung) — verified by user on real hardware, 2026-09-24
- [x] **AC-9 (BUG-1-Fix)** — Jog-Taste während einer laufenden Auto-Fahrt zeigt keine Wirkung mehr (kein unkontrollierter Dauerlauf) — verified by user on real hardware, 2026-09-24
- [x] **AC-10 (BUG-5-Fix)** — Trennen der App-Verbindung während einer laufenden Fahrt stoppt den Motor weiterhin zuverlässig — verified by user on real hardware, 2026-09-24
- [!] NOT VERIFIED — AC-6s Rand-Toleranz (0,01 Steps/s) auf exakten Grenzwerten, EC-1/EC-3/EC-4 im Detail, sowie die Mehrgeräte-BLE-Szenarien (BUG-6/BUG-7/BOOT-Taster-Reset) — nicht Teil dieses fokussierten Tests, keine bekannten Probleme aus dem Code-Review

**Production Ready: JA** — kein Critical/High-Bug offen, die sicherheitskritischen Fixes (BUG-1, BUG-5) sind auf echter Hardware bestätigt.

## Nachtrag: Re-Verifikation nach 8000 Steps/s, BUG-18-Fix, DIR-Umkehr (2026-09-29)

**Scope: voller Lauf, drei `qa-engineer`-Lanes (Acceptance, Security, Regression).** Kein reiner Diff-Lauf, weil der letzte Report (`dc9bffa`, 2026-09-24) älter ist als die Spec-Verfeinerung von AC-11 (2026-09-27) und die Änderungen an geteiltem Code (`kJogSpeedMaxHz`, DIR-Polarität) alle Nachbar-Features berühren. `probe.kind: none` (App und Layer `firmware`) — jede Laufzeit-/Hardware-Prüfung ist `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 12 Suites, 195 Tests, 0 Fehler (Log `suite3.log` im Scratchpad). Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

### Acceptance Criteria
- [x] **AC-1, AC-2** — Code + Render-Probe: `motor.cpp:361-378`, `ble.cpp:160-173`, `AutoDriveControls.tsx:375-396`; Hardware `[!]`
- [x] **AC-3, AC-4** — Code + Render-Probe: Kodierung `client.ts:294-304`, Richtung/Ist-Position `motor.cpp:408-418`, Zeit inkl. Rampe `motor.cpp:447-465`; Ankunft nach Dauer auf Hardware `[!]`
- [x] **AC-5** — Code + Probe (Stopp-Button nur bei `driving`), `ble.cpp:189-195`, `motor.cpp:311-336`; „sofort" auf Hardware `[!]`
- [ ] **AC-6 — teilweise FAIL (BUG-16, Medium):** zu lange Dauer bleibt stehen und wird gemeldet (Probe: `'100'` bei 1000 Steps → Meldung, Auslöser aus). Die Meldung nennt aber den erlaubten Bereich mit `toFixed(1)` (`AutoDriveControls.tsx:519-523`) — Untergrenze gerundet statt aufgerundet, Obergrenze gerundet statt abgerundet. Beispiel: 1000 Steps zeigt „0.7–5.0 s", 0.7 wird zu 0.8 korrigiert; 1009 Steps zeigt „0.7–5.1 s", 5.1 wird abgelehnt (bei ~50 % der Distanzen falsch, Simulation über 1–160000 Steps). Identisch mit der Klasse des früheren BUG-4. Fix: `ceilToDeciseconds` für die Untergrenze, `floor` für die Obergrenze.
- [x] **AC-7, AC-8, AC-9** — Render-Probe + Code (`AutoDriveControls.tsx:319-329`, `motor.cpp:397-418`, `RootScreen.tsx:118-119`); Hardware für AC-9 `[!]`
- [x] **AC-10** — Code-Garantie `ble.cpp:125-127`; Laufzeit `[!]` (Hardware-Nachweis vom 2026-09-24 im Erstlauf)
- [x] **AC-11 für Distanzen ≥ 35 Steps** — `ceilToDeciseconds` (`AutoDriveControls.tsx:159-161`), Simulation über 1–160000 Steps: der eingetragene Wert ist immer gültig, die Firmware (float32) lehnt keinen ab; 195 Tests grün.
- [ ] **AC-11 für 1–14 und 21–34 Steps — FAIL (BUG-17, Low):** in 0,1-s-Schritten gibt es keine gültige Dauer; die Korrektur trägt „0.1"/„0.2" ein, danach erscheint „erlaubt: 0.1–0.1 s". Höchstens ~0,2 mm Distanz, praktisch irrelevant.

### Edge Cases
- [x] **EC-1** (Distanz 0) — Probe + `motor.cpp:423-426`
- [x] **EC-2** — Garantie `motor.cpp:397-398` (Ablehnung bei `autoDriving || isRunning()`), serielle Verarbeitung auf dem NimBLE-Host-Task; Race nicht provoziert
- [ ] **EC-3 — Lücke (BUG-18, Low, aus Code abgeleitet):** `motorClearPoints()` nur beim Übergang 0→1 verbundene Zentrale (`ble.cpp:87-89`); besteht beim Reconnect noch ein zweiter Link (alter Link vor dem Supervision-Timeout, fremdes Gerät), bleiben Punkte erhalten. Keine Sicherheitsfolge.
- [x] **EC-4** — Code `motor.cpp:342-350, 495-509`; Laufzeit `[!]`

### Weitere Befunde
- [ ] **BUG-15 (High, Regression PROJ-4): DIR-Umkehr `5feb442` dreht die physische Richtung gespeicherter Presets.** Ein Preset speichert `endIsAfterStart` in Zählrichtung (`usePresets.ts:28-35`, `AutoDriveControls.tsx:462-467`); `setDirectionPin(kDirPin, false)` (`motor.cpp:216`) kehrt um, welche physische Richtung „steigende Schritte" ist. Ohne Migration/Versionsfeld (`STORAGE_KEY` unverändert) legt „Als Start setzen" nach dem Laden eines **vor dem 2026-09-29 gespeicherten** Presets das Ende auf die Gegenseite; der Slider hat keine Endanschläge (`kMaxPlausibleDistanceSteps` prüft nur den Betrag). Workaround: alte Presets löschen und neu speichern. Innerhalb einer Sitzung sind Start/Ende/`moveTo`/Zeitraffer konsistent (`motor.cpp:409-418, 532-534`).
- [ ] **BUG-19 (Medium, UE-1):** zu kurze Dauer ohne Blur (Default „10", Wert von vor dem Setzen neuer Punkte) deaktiviert die Auslöser stumm, Statuszeile zeigt „Bereit". Repro (Probe): Distanz 160000, Feld unberührt → `disabled=true`, keine Meldung. Betrifft jede Distanz über ~72.000 Steps (~450 mm). Workaround: Feld antippen und verlassen.
- [ ] Low: **BUG-20** Fehlermeldung erscheint schon beim Tippen, nicht erst beim Verlassen des Felds (`AutoDriveControls.tsx:302-306`, AC-6-Wortlaut); **BUG-21** `motorSetStart/End` ohne `autoDriving`-Wache (`motor.cpp:365, 373`, nur theoretisches Zeitfenster) und `moveTo()`-Rückgabewert verworfen (`motor.cpp:492`, bereits BUG-14); **BUG-22** Sicherheits-Doku irreführend: `platformio.ini:27` nennt späteres Pairing „harmless", der BUG-7-Fix lehnt aber nur das Speichern des Bonds ab, der verschlüsselte Link kommt trotzdem zustande (`ble_sm.c:1027-1033`, Just-Works-Entscheidung unverändert); **BUG-23** Doku/Kommentar-Drift: `AutoDriveControls.tsx:92` („= 2000 steps" → 8000), `design.md:64-69` (Status 5 Byte statt 6), `spec.md` Technical Requirements (`speed = distance/duration` statt Rampen-Formel), `docs/stacks/firmware-esp32-tmc2209.md:79` (`setDirectionPin` ohne Polarität) und `:113-114` (Opcodes „noch nicht festgelegt"); App: Dauer ohne uint16-Obergrenze (`client.ts:294-297`, physisch unerreichbar) und `Number()` nimmt Hex/Exponent an.
- **Bekannte Bugs unverändert, nicht verschlechtert:** BUG-8, BUG-12, BUG-13, BUG-14, BUG-6-Restfall.

### Security (Red-Team)
- [x] Verschlüsselungspflicht `WRITE_ENC` für beide Write-Arten (`ble.cpp:377-379`)
- [x] Längenprüfung vor jedem Zugriff (`ble.cpp:143-233`), Dauer 0 abgelehnt (`motor.cpp:398`), Geschwindigkeit 200–8000 (`motor.cpp:466-470`); float32-Nachrechnung aller 65 535 Dauerwerte × 19 Distanzen: 0 NaN/Inf, kommandierter Wert immer in 200–8000
- [x] Keine Secrets in Quelle (`git grep`); Release-Bundle (Stand 2026-09-27, nicht aktueller Stand) ohne Treffer
- [x] Status-Notify enthält keine sensiblen Daten (6 Byte, `ble.cpp:54-69`)
- [!] Authorization, Brute Force, Enumeration, Credentials in URLs — not applicable (kein Login/keine HTTP-Oberfläche); Rate Limiting — not implemented (optional); alle Laufzeit-Checks — no way to run and probe this project was recorded
- **Zusammenfassung:** 4 Checks verifiziert, mehrere NOT VERIFIED (Laufzeit/nicht anwendbar). Just-Works-Risiko (fremdes Gerät kann alle Opcodes schreiben) bleibt die akzeptierte Grenze aus PROJ-2.

### Regression
- [x] Status-Characteristic 6 Byte App↔Firmware (`ble.cpp:54-69`, `client.ts:409-445`), Opcodes 0x01–0x07 und Längen deckungsgleich, gemeinsamer Bereich 200–8000 in Jog/Auto-Fahrt/Zeitraffer, gespeicherte Preset-Dauern bleiben gültig (Bereich nur breiter), Zustandsflags `jogRunning/autoDriving/timelapseMoving` konsistent (`motor.cpp:239, 258-260, 293-305, 491`), PROJ-1-Verbindungsfluss unberührt (nur Kommentar-Diff)
- [x] App gültig / Firmware ablehnend: 0 Fälle (Simulation). Umgekehrt 18 Fälle an der 200-Steps/s-Grenze — sichere Richtung.
- [!] E2E-Suite: keine vorhanden. Layer firmware ohne Test.

### Nicht verifiziert in diesem Lauf
- [!] Alle Laufzeit-/Hardware-Ergebnisse (AC-1..5, AC-9, AC-10, EC-2..4 real): no way to run and probe this project was recorded — inklusive Fahrt und Stopp bei 8000 Steps/s (Schrittverluste, `forceStop` aus voller Fahrt) und die physische Richtung nach der DIR-Umkehr
- [!] Optik/Layout (Deaktiviert-Darstellung, Fehlerfarbe), Firmware-Tests

**Production-Ready: NEIN.** BUG-15 ist High (Regression PROJ-4, gespeicherte Presets nach der DIR-Umkehr), dazu BUG-16 und BUG-19 (Medium) und Laufzeit nicht verifiziert. Status: **In Review**.

## Nachtrag 2: Re-Verifikation der Fixes BUG-15/16/19 (2026-09-30)

**Scope (Re-Verifikation):** `git diff 442c552..HEAD -- src features/PROJ-3-start-endpunkt-auto-fahrt/spec.md` (Commits `a6b837d`, `c44e0e8`): `usePresets.ts`, `AutoDriveControls.tsx` (jeweils + Test), `spec.md` (neues AC-12). Ein `qa-engineer`-Lauf mit allen drei Scopes (2 → 3 → 4), eingegrenzt auf den Diff und die offenen Bugs. Alles andere aus dem Nachtrag vom 2026-09-29 gilt weiter — _unverändert seit 2026-09-29, in diesem Lauf nicht neu geprüft (Diff berührt AC-1, AC-2, AC-5, AC-7..AC-10, EC-1..EC-4 nicht)_. `probe.kind: none` — Laufzeit/Hardware ist `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 12 Suites, 199 Tests, 0 Fehler (`suite4.log`). Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

### Fix-Status
- [x] **BUG-19 geschlossen** — Render-Probe: Standardwert „10", dann Distanz 160000 → „21.0", „Start → Ende" aktiv, 2 Renders, keine Schleife (`AutoDriveControls.tsx:321-327`). Eine zu lange Dauer wird nicht überschrieben (Probe: „900" bleibt nach Distanzwechsel).
- [x] **BUG-16 geschlossen (Distanzen ≥ 35 Steps)** — `AutoDriveControls.tsx:168-170, 542-543`; Simulation über 1–160000 Steps: angezeigte Grenzen sind in 0 Fällen in der App ungültig und in 0 Fällen in der Firmware (float32) abgelehnt. Rest: BUG-17 (jetzt Anzeige „0.1–0.0 s"/„0.2–0.1 s" bei 1–34 Steps, weiterhin Low, höchstens ~0,2 mm).
- [x] **BUG-15 geschlossen auf Code-Ebene** — `migrateDirection` (`usePresets.ts:53-67`), Best-Effort-Schreiben (`:78-94`), Stempel `dirVersion: 2` (`:166`); idempotent, bei fehlgeschlagenem Schreiben kein Doppel-Flip (Probe), Vorzeichen passt zu `motor.cpp:216, 380-389`. PROJ-5 nutzt keine Presets. Bedingung siehe BUG-25. Physische Richtung nach dem Laden eines alten Presets: `[!]` Hardware.
- [x] **AC-12** — Probe: leer → „12.3" (Distanz 90000), „abc" → „11.0" (80000); Distanz ändert sich nicht → getippte Zeit bleibt.

### Neue Bugs
- [ ] **BUG-24 (High, Regression PROJ-4 AC-4/AC-5/EC-2; ausgelöst durch den BUG-19-Fix): Die Dauer eines geladenen Presets wird durch eine Zwischen-Distanz still überschrieben.** `handleSetStart` (`AutoDriveControls.tsx:396-410`) sendet SET_START und danach SET_END_FROM_DISTANCE; dazwischen meldet die Firmware per Notify (`main.cpp:56`, `ble.cpp:402-420`) eine Zwischen-Distanz (neuer Start gegen alten Endpunkt), auf die der neue Effekt (`:321-327`) korrigiert. Die spätere Preset-Distanz holt den Wert nicht zurück. Repro (Render-Probe): Bereich 0…100000, Preset „Schnell" (20000 Steps, 3.5 s) laden → „3.5"; „Als Start setzen" bei 50000 → Zwischen-Notify → „7.3"; End-Notify 20000 → bleibt „7.3"; „Start → Ende" sendet 7.3 statt 3.5. Tritt auf, wenn schon ein Endpunkt existiert und |alter Endpunkt − neuer Start| größer als die Preset-Distanz ist (häufig). Schlimmer Fall: Ziel-Distanz klein → Wert wird „zu lang", Fehlermeldung, Fahrt gesperrt. Workaround: Dauer nach dem Setzen neu eintippen. _Notify-Reihenfolge auf dem Gerät `[!]` — aus Code + Probe abgeleitet._
- [ ] **BUG-25 (Medium, bedingt): Migration erkennt „alte Polarität" nur am fehlenden `dirVersion`.** Presets, die zwischen dem Flash der Firmware `5feb442` (2026-09-29 20:26) und der Installation eines App-Builds ab `a6b837d` (2026-09-30 00:18) gespeichert wurden, sind schon in neuer Polarität gespeichert und werden trotzdem gedreht (`usePresets.ts:56-64`); dasselbe, wenn die neue App ohne neu geflashte Firmware läuft. Ob solche Presets existieren, kann nur der Nutzer sagen.
- [ ] **BUG-26 (Low, Doku-Drift):** `dirVersion`/Migration fehlen in `docs/data-model.md` und PROJ-4 `design.md`; AC-12 und der Distanz-Effekt fehlen in PROJ-3 `design.md`.
- [ ] Low, vorbestehend: `durationSeconds` als String im Speicher lässt `formatSeconds` werfen (`AutoDriveControls.tsx:624`, nur mit Zugriff auf den privaten App-Speicher); eine korrupte Preset-Liste (`[null, …]`) blockiert Speichern/Löschen (Toast statt Datenverlust).

### Security / Regression
- [x] Manipulierte AsyncStorage-Daten (NaN, negativ, Bruchzahl, falscher Bool) erreichen die Firmware nur innerhalb ihrer Grenzen: `client.ts:333-343`, `motor.cpp:381-382, 450-470`. Keine neuen Secrets im Diff. Restliche Punkte not applicable / not implemented (Rate Limiting) / `[!]`.
- [x] PROJ-4 AC-1, AC-3, AC-6, AC-9 (Probe + Suite); PROJ-5 unberührt (kein Preset-Zugriff, `useTimelapseSequence.ts:28, 475-476`). PROJ-4 AC-4+AC-5 zusammen und EC-2: FAIL → BUG-24.

### Nicht verifiziert
- [!] Alle Laufzeit-/Hardware-Ergebnisse: Ankunft nach Dauer, physische Richtung migrierter Presets, echte Notify-Reihenfolge (no way to run and probe this project was recorded)
- [!] Ob Presets aus dem Zeitfenster von BUG-25 existieren; Release-Bundle nicht neu gebaut; Optik/Layout

**Production-Ready: NEIN** — BUG-24 (High, Regression) ist offen; BUG-15/16/19 sind geschlossen. Status: **In Review**.

## Nachtrag 3: Re-Verifikation des BUG-24-Fixes (2026-09-30)

**Scope (Re-Verifikation):** `git diff d105b00..HEAD -- src features/PROJ-3-start-endpunkt-auto-fahrt/spec.md` (Commit `fd34882`): `AutoDriveControls.tsx` (+Test), `spec.md` (AC-12 präzisiert). Ein `qa-engineer`-Lauf mit allen drei Scopes. Alles andere: _unverändert seit 2026-09-29/30, in diesem Lauf nicht neu geprüft (AC-1..5, AC-7..10, EC-1..4 — Diff berührt sie nicht)_. `probe.kind: none` — Laufzeit/Hardware `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 12 Suites, 200 Tests, 0 Fehler (`suite5.log`). `npx eslint` auf die geänderten Dateien: exit 0. Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

### Ergebnis
- [x] **BUG-24, Hauptpfad geschlossen** — Render-Probe: Bereich 100000 → Preset „Schnell" (20000 Steps, 3.5 s) → „Als Start setzen" bei 50000 → Zwischen-Notify → bleibt „3.5"; gesendet wird `setStart`, `endFromDist(true, 20000)`, `auto(startToEnd, 3.5)` (`AutoDriveControls.tsx:172-177, 340-348`). Auch: Zwischen-Distanz 0, Preset ohne vorhandenen Endpunkt, React StrictMode (Doppel-Effekt idempotent).
- [x] **BUG-19/AC-12, erste Distanz** — Standardwert „10" + Distanz 160000 → „21.0", Auslöser aktiv; leer → „12.3" (90000); „abc" → „11.0" (80000); lange Dauer „900" bleibt (Probe, `:340-348`).
- [x] **AC-6, AC-11 unverändert korrekt** — „600" bleibt, Meldung „13.5–500.0 s"; „1" → „13.5" nach Blur; Distanz 1414 + leer → „0.9" (`:159-161, 184-186, 224`).
- [x] **PROJ-5** — `useTimelapseSequence.ts:28` importiert nur das unveränderte `minAutoDriveDurationSeconds`; mit `disabled=true` bleibt das Feld gesperrt (`RootScreen.tsx:122`, Probe).
- [x] **Security** — Diff fügt nur `useRef` und eine reine Funktion hinzu, keine neuen Eingabepfade/Secrets (`git diff d105b00..HEAD`).

### Offene / neue Bugs
- [ ] **BUG-27 (High) — Restpfad von BUG-24:** Ist vor dem Laden eines Presets **nur ein Endpunkt** gesetzt (kein Start), wird die Zwischen-Distanz nach „Als Start setzen" zur _ersten_ bekannten Distanz; die Korrektur überschreibt die Preset-Dauer. Repro (Probe C): Notify `hasEnd=true, hasStart=false` (bei 100000) → Preset „Schnell" laden („3.5") → „Als Start setzen" bei 50000 → Zwischen-Notify → „7.3" → End-Notify 20000 → bleibt „7.3"; „Start → Ende" sendet 7.3 statt 3.5. Schlimmer (Probe C2): Preset „Kurz" (2000 Steps, 1.0 s), Zwischen-Distanz 150000 → „19.8" → „Ungültige Dauer — erlaubt: 1.0–10.0 s", Fahrt gesperrt. Ursache: `AutoDriveControls.tsx:344` unterscheidet „erstmals bekannt" nicht von „Zwischen-Distanz während der Preset-Ableitung". Verletzt PROJ-4 AC-4/AC-5 und die AC-12-Zusicherung „Laden eines Presets überschreibt die Dauer nicht". Der neue Unit-Test (`AutoDriveControls.test.ts:206-213`) prüft nur die reine Funktion und wertet `(null, 160000) → true` als gewollt — deckt diesen Pfad daher nicht ab. Workaround: Dauer nach dem Setzen neu eintippen. _Notify-Reihenfolge auf dem Gerät `[!]` — aus Code (`motor.cpp:361-370, 599-606`, `main.cpp:56`, `ble.cpp:402-420`) und Probe abgeleitet._
- [ ] **BUG-28 (Medium) — Teil-Regression von BUG-19 durch `fd34882`:** wird die Distanz nach dem ersten Bekanntwerden _größer_ und ist die unberührte Dauer dann zu kurz, sind die Auslöser ohne Meldung gesperrt (Probe E: Distanz 50000, Feld „10" gültig → „Als Ende setzen" → Distanz 160000 → bleibt „10", „Start → Ende" deaktiviert, keine Meldung; nach Blur „21.0"). Der präzisierte AC-12-Text widerspricht sich hier: „Spätere Änderungen der Distanz … überschreiben die Dauer nicht" vs. „die Auto-Fahrt-Auslöser bleiben nie stumm gesperrt wegen einer zu kurzen Dauer". Zu kurze Dauern zeigen keine Meldung, nur zu lange (`showDurationError`, `:327-331`) — Klärung per `/refine PROJ-3`.
- [ ] **BUG-26 (Low)** weiterhin offen: `design.md` kennt AC-12 und den Distanz-Effekt nicht.
- Weiterhin offen aus Nachtrag 2: **BUG-25** (Medium, bedingt: Presets aus dem Zeitfenster 2026-09-29 20:26 – 2026-09-30 00:18 würden von der Migration gedreht — der Nutzer muss klären, ob es solche gibt), BUG-17, BUG-20..23.
- Beobachtung (harmlos): Wird die Distanz bekannt → null → wieder bekannt, läuft die Korrektur erneut (Probe F); ein Disconnect läuft nicht über diesen Weg, weil `RootScreen.tsx:93-122` die Komponente außerhalb von `connected` aushängt.

### Nicht verifiziert
- [!] Echte Notify-Reihenfolge SET_START → Zwischen-Distanz → SET_END_FROM_DISTANCE auf dem ESP32, Ankunft nach Dauer, physisches Verhalten (no way to run and probe this project was recorded); PROJ-4 EC-2 nicht geprüft; Release-Bundle nicht gebaut; Optik/Layout; Firmware-Tests; Rate Limiting (not implemented).

**Production-Ready: NEIN** — BUG-27 (High, Regression PROJ-4) ist offen, dazu BUG-28 (Medium) und BUG-25 (Medium, bedingt). Status: **In Review**.

## Nachtrag 4: Fixes BUG-27/28, Nutzer-Test am Gerät (2026-09-30)

- **Fixes seit Nachtrag 3:** `b5c92da` (BUG-27/BUG-28: Auto-Korrektur bei jeder Änderung der bekannten Distanz, außer während ein Preset angewendet wird; `presetTargetDistanceRef`, `shouldAutoCorrectOnDistanceChange` mit drei Parametern), `3bccc04` (BUG-26: Design-Doku, PROJ-4 `dirVersion`, `docs/data-model.md`). 207 Tests grün, davon 7 neue Render-Tests in `AutoDriveControls.render.test.ts` (Preset-Ablauf komplett, Red-Check: ohne Guard 3 rot, ohne Änderungs-Regel 3 rot).
- [x] **BUG-25 erledigt — vom Nutzer bestätigt (2026-09-30):** im Zeitfenster 2026-09-29 20:26 – 2026-09-30 00:18 wurde kein Preset gespeichert, es gibt keine Presets mit falsch gedrehter Richtung; auf dem Gerät existierte vor dem Update kein altes Preset.
- [x] **BUG-26 geschlossen** — `design.md` (PROJ-3, PROJ-4) und `docs/data-model.md` aktualisiert (`3bccc04`).
- [x] **Nutzer-Test am Gerät („alles ok", 2026-09-30, Android EB2103, Debug-Build über Metro):** geprüft wurden das Laden eines Presets mit anschließendem „Als Start setzen" (Dauer bleibt) und die automatische Korrektur der Dauer bei langen Strecken. Umfang und Anzahl der Durchläufe nicht protokolliert.
- **Nicht durch einen unabhängigen `/qa`-Lauf verifiziert:** BUG-27 und BUG-28 (die Fixes `b5c92da`/`3bccc04` liegen nach dem letzten QA-Lauf). Status bleibt **In Review** bis zu einem weiteren `/qa PROJ-3` im Umfang dieser Commits.
