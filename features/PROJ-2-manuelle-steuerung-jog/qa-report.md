# QA-Testergebnisse

**Getestet:** 2026-09-23
**App-URL:** nicht ausführbar hier (`probe.kind: none`, sowohl Top-Level als auch Layer `firmware`) — jedes Laufzeit-AC ist unten `[!] NOT VERIFIED`, solange kein menschlicher Test protokolliert ist.
**Tester:** 3 unabhängige `qa-engineer`-Subagenten (Acceptance / Security / Regression), jeweils in frischem Kontext ohne Kenntnis des Builds; zusammengeführt von dieser Session.
**Scope:** vollständig — erster `/qa`-Lauf für PROJ-2, alle 7 AC + 5 EC geprüft.

> Legende: `[x]` in diesem Lauf verifiziert (Beleg erforderlich) · `[ ] BUG` als fehlerhaft verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund erforderlich)

## Re-Verifikation (2026-09-23, gleicher Tag)

Nach dem ersten Lauf hat der Nutzer entschieden: alle vier Medium-Bugs fixen, inklusive BLE-Bonding für BUG-3/BUG-4. `/build`-Fixes liefen parallel auf disjunkten Dateien (`git diff --stat` gegen den QA-Commit `5977e07`: `src/components/useJogState.ts`, `src/components/useJogState.test.ts`, `src/components/JogControls.tsx`, `firmware/src/motor.cpp`, `firmware/src/ble.cpp`, plus `design.md`/Stack-Pack-Doku). BUG-1 bis BUG-4 unten sind entsprechend als **behoben** markiert, mit der jeweiligen Evidenz aus der Fix-Session. Die übrigen Abschnitte (AC-1/2/5/6/7, EC-1/3/4/5, BUG-5..9) sind **unverändert seit dem ersten Lauf, nicht erneut geprüft** — der Fix hat diese Dateien/Verhaltensweisen nicht berührt. Suite danach: `npm test` → **5 Suites / 74 Tests, alle grün** (war 61; +13 aus der erweiterten `useJogState.test.ts`, 37 statt 24 Tests). `npx tsc --noEmit` → exit 0.

## Menschlicher Hardware-Test (2026-09-23, ESP32 + echter Slider)

Firmware kompiliert und geflasht (`pio run -e esp32dev -t upload`), App auf echtem Android-Gerät. Checkliste gezielt in dieser Reihenfolge durchgegangen, damit zuerst die beiden riskantesten offenen Punkte dieser Session getestet werden:
1. **Handy vor dem Test vom Slider entkoppelt**, dann verbunden, sofort eine Jog-Taste gehalten → **funktioniert direkt beim ersten Versuch, keine Verzögerung/kein Kopplungsdialog bemerkt** (testet BUG-10s Fix: der Fire-and-forget-STOP nach dem Connect trifft das Timing zuverlässig)
2. Loslassen → Motor stoppt sofort
3. Geschwindigkeitsregler während gehaltener Taste bewegt → Motor reagiert live
4. Beide Tasten nacheinander getestet (eine hält, zweite dazu → Stopp; eine loslassen während die andere weiter hält, dann neu drücken → keine Fahrt, bis wirklich beide losgelassen wurden)
5. Bluetooth während laufender Fahrt ausgeschaltet → Motor stoppt eigenständig
6. **App in den Hintergrund/geschlossen, während eine Taste gehalten wurde → Motor stoppt von selbst nach ca. 1s** (Watchdog, `motorWatchdogCheck()`)

Nutzer-Bestätigung: „alles funktioniert", mit expliziter Einzelbestätigung für Punkt 1 (sofort, keine Verzögerung) und Punkt 6 (von selbst gestoppt) auf gezielte Rückfrage. AC-7 (Steuerung nur im `connected`-Zustand sichtbar) beiläufig durch den wiederholten Connect/Disconnect-Zyklus mitbestätigt, nicht separat abgefragt. **Nicht explizit getestet:** EC-1 (Finger aus dem Button-Bereich ziehen) und EC-5 (Zustand nach einem Reconnect) — beide bleiben `[!] NOT VERIFIED`, niedriges Risiko, aus der Quelle plausibel abgesichert (siehe unten).

## Test-Suite (einmalig vor dem Fan-out gelaufen)

```
> CameraSliderApp@0.0.1 test
> jest

PASS __tests__/App.test.tsx
PASS src/connection/ConnectionProvider.test.tsx
PASS src/components/useJogState.test.ts
PASS src/connection/connectionReducer.test.ts

Test Suites: 4 passed, 4 total
Tests:       57 passed, 57 total
```

Danach von dieser Session ergänzt: `src/ble/client.test.ts` (4 neue Unit-Tests für `sendJogCommand`/`sendStopCommand`, rot geprüft — Wire-Format-Vertauschung eingebaut, alle 3 JOG-Tests fielen korrekt durch, danach wiederhergestellt und grün). Gesamtstand danach: `npm test` → **5 Suites / 61 Tests, alle grün.** `npx tsc --noEmit -p tsconfig.json` → exit 0.

Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware` (`.ai-eng-kit` → `layers[0].commands.test: null`, vorbestehende Lücke, nicht durch PROJ-2 entstanden).

## Acceptance-Criteria-Status

#### AC-1 — Taste halten → Slider fährt in der entsprechenden Richtung
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 — funktioniert direkt beim ersten Versuch nach frischem Entkoppeln (siehe „Menschlicher Hardware-Test" oben, Punkt 1). Plumbing zusätzlich aus der Quelle bestätigt: `JogControls.tsx:109/116` (onPressIn) → `useJogState.ts:34-37` (idle→jogging_*) → `JogControls.tsx:67-84` (sofortiger Send + 300ms-Intervall) → `src/ble/client.ts:144-160` (Opcode 0x01, korrektes Payload) → `firmware/src/ble.cpp:61-71` (Längenprüfung + `motorJog()`) → `firmware/src/motor.cpp:83-105` (kontinuierlicher Lauf, kein `moveTo()`).

#### AC-2 — Loslassen → Motor stoppt sofort
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 2). Pfad zusätzlich aus der Quelle bestätigt: `useJogState.ts:51-52/69-70` (jogging→idle, Test grün: `useJogState.test.ts:14-20`) → `JogControls.tsx:80-83` (Cleanup: clearInterval + STOP) → `client.ts:167-175` (Opcode 0x05, Write mit Antwort) → `ble.cpp:72-78` → `motor.cpp:107-115` (`forceStop()`, kein Decel-Ramp).

#### AC-3 — Geschwindigkeits-Schieberegler live übernommen, auch während gehaltener Taste
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 3) — Motor reagiert live auf Reglerbewegung während gehaltener Taste.
- [x] App-seitig: `JogControls.tsx:61-65/74` — `speedRef` wird bei jeder Änderung nachgezogen und *innerhalb* von `send()` gelesen, Übernahme spätestens beim nächsten 300ms-Tick. Wertebereich beidseitig verteidigt (App `JogControls.tsx:11-12,95-98`, Firmware `motor.cpp:44-49`).
- [x] BUG-2 **behoben** (Re-Verifikation): `motor.cpp:91-129` — `motorJog()` unterscheidet jetzt "bereits läuft, gleiche Richtung" (`applySpeedAcceleration()`, FastAccelStepper's dokumentierter Weg für Live-Geschwindigkeitsänderung an einer laufenden Bewegung) von "startet frisch" (`runForward()`/`runBackward()`). Gegengeprüft an zwei unabhängigen Quellen: der vendorten Bibliothek (`.pio/libdeps/esp32dev/FastAccelStepper/src/FastAccelStepper.h`, Doc-Kommentare zu `setSpeedInHz()`/`applySpeedAcceleration()`) und einer Live-Context7-Abfrage gegen `gin66/fastaccelstepper` — beide stimmen wörtlich überein. Jetzt auch am echten Motor bestätigt.

#### AC-4 — Beide Richtungstasten gleichzeitig → sofortiger Stopp, keine Richtung fährt weiter, bis beide losgelassen und eine erneut gedrückt wird
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 4) — genau die Halten/Loslassen/Neu-drücken-Sequenz aus dem BUG-1-Repro getestet, verhält sich wie erwartet.
- [x] Kernaussage (gleichzeitig gedrückt → Stopp, keine Richtung gewinnt) verifiziert aus der Quelle: `useJogState.ts:89-94` (`jogging_forward + PRESS_BACKWARD → blocked`) und `:111-113` (Spiegelfall).
- [x] BUG-1 **behoben** (Re-Verifikation): neuer Status `blocked` plus interne `forwardHeld`/`backwardHeld`-Merker (`useJogState.ts:33-43, 123-153`) — `blocked` löst sich erst zu `idle`, wenn **beide** Merker `false` sind (`:128-143`), ein erneutes Drücken bleibt in `blocked` (`:144-151`, genau der ursprüngliche Bug-Repro). Test: `useJogState.test.ts`, dedizierter Repro-Test (hold backward → press forward → release forward, backward weiter gehalten → press forward erneut → bleibt `blocked`) plus vollständige 4×4-Tabelle, 37/37 grün (`npx jest src/components/useJogState.test.ts`). Rot-Check dokumentiert (Fix zurückgedreht → 4 Tests fielen mit `status: 'jogging_forward'` statt `'blocked'` durch → wiederhergestellt → wieder grün). Jetzt auch am echten Gerät bestätigt.

#### AC-5 — Disconnect während Jog → Firmware stoppt eigenständig, App zeigt PROJ-1s „Verbindung verloren"-Zustand
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 5) — Bluetooth während laufender Fahrt ausgeschaltet, Motor stoppte eigenständig.
- [x] Verifiziert aus der Quelle (Garantie): `firmware/src/ble.cpp:34-46` — `onDisconnect` ruft `motorStop()` (Z. 42) **vor** `NimBLEDevice::startAdvertising()` (Z. 45), PROJ-1s Reconnect-Pfad unverändert (`ConnectionProvider.tsx:135-137`, `RootScreen.tsx:51-59`).

#### AC-6 — >~1s ohne Halte-Signal → Firmware stoppt eigenständig (Dead-man's-switch)
- [x] Menschlich verifiziert am echten Gerät, 2026-09-23 (Punkt 6) — App in den Hintergrund/geschlossen, während eine Taste gehalten wurde, Motor stoppte nach ca. 1s von selbst.
- [x] Verifiziert aus der Quelle (Garantie, alle drei Teile): Schwelle `motor.cpp:33` (1000ms), Prüfung + Stopp nur wenn `isRunning()` (`motor.cpp:117-124`), Zeitstempel-Reset bei jedem `motorJog()` (`motor.cpp:104`), tatsächlich aufgerufen in `main.cpp:12-14` (nicht nur deklariert).
- Robustheits-Hinweis: siehe BUG-6 (Low) — betraf nur einen internen Race zwischen zwei Firmware-Tasks, nicht das jetzt bestätigte Verhalten.

#### AC-7 — Nicht verbunden → Jog-Steuerung nicht bedienbar, PROJ-1-Platzhalter bleibt sichtbar
- [x] Beiläufig menschlich bestätigt, 2026-09-23 — durch den wiederholten Connect/Disconnect-Zyklus während der Checkliste, nicht separat abgefragt.
- [x] Verifiziert aus der Quelle: `RootScreen.tsx:34-61` rendert `<JogControls />` ausschließlich im `case 'connected'`; alle sieben übrigen Status (vollständiger Switch über `connectionReducer.ts:11-19`) zeigen PROJ-1-Notices bzw. den gesperrten Platzhalter (`reconnecting`). Zweiter Riegel: `JogControls.tsx:86-88` rendert `null` ohne `device`, `ConnectionProvider.tsx:274-281` liefert `device` nur im Status `connected`.

## Edge-Cases-Status

#### EC-1 — Finger aus dem Button-Bereich gezogen zählt als Loslassen
- [!] NOT VERIFIED — kein Touch-Gerät, kein Simulator. Aus der Quelle bestätigt ist nur, dass die App dem `Pressable`-Plattform-Default nicht in die Quere kommt (`JogControls.tsx:108-121`, kein `pressRetentionOffset`/`hitSlop`-Override).

#### EC-2 — Beide Tasten gleichzeitig → Stopp, keine Richtung hat Vorrang
- [x] Menschlich verifiziert (siehe AC-4).
- [x] Kernaussage verifiziert (siehe AC-4).
- [x] BUG-1 **behoben** (siehe AC-4).

#### EC-3 — Verbindungsabbruch während Jog → Firmware stoppt eigenständig, ohne auf die App zu warten
- [x] Menschlich verifiziert (siehe AC-5).
- [x] Verifiziert aus der Quelle (siehe AC-5).

#### EC-4 — App sendet >Schwelle kein Halte-Signal, obwohl Taste noch gehalten → Firmware stoppt eigenständig, auch bei formal bestehender Verbindung
- [x] Menschlich verifiziert (siehe AC-6).
- [x] Verifiziert aus der Quelle (siehe AC-6).

#### EC-5 — Reconnect nach Abbruch während Jog → App zeigt gestoppten Ausgangszustand, keine optisch aktive Taste
- [x] Verifiziert aus der Quelle: `RootScreen.tsx` mountet `JogControls` nur im `connected`-Zweig — beim Verlassen (z. B. nach `reconnecting`) wird die Komponente **unmontiert**, nicht nur versteckt; `useJogState.ts` startet bei jedem Mount neu mit `useReducer(jogStateReducer, 'idle')`. Kein Zustand überlebt den Disconnect.

## Security-Audit-Ergebnisse

_Dieses Feature hat keine HTTP-Oberfläche, keine Accounts, keine Datenbank (`platform: mobile`, `stack.backend: localstorage`). Die Standard-Checkliste greift größtenteils nicht — siehe die Zeilen unten, jede einzeln begründet statt stillschweigend übersprungen. Der reale Angriffsvektor ist der BLE-GATT-Kommandokanal._

- [!] NOT VERIFIED — Authentication Bypass: nicht anwendbar, kein Login/keine Session (kein Backend).
- [!] NOT VERIFIED — Authorization (User X/Y): nicht anwendbar, kein Mehrbenutzer-Modell (`docs/PRD.md`: „Ausschließlich der Erbauer selbst").
- [x] Input-Validierung (BLE-Payload): Längenprüfung **vor** jedem Indexzugriff — `firmware/src/ble.cpp:55-57` (len==0), `:62-66` (JOG, exakt 3 Byte), `:73-75` (STOP, exakt 1 Byte); zweite unabhängige Schutzebene bestätigt in der installierten Bibliothek selbst: `NimBLEAttValue::operator[]` gibt bei Out-of-Range `0` zurück statt zu lesen (`firmware/.pio/libdeps/esp32dev/NimBLE-Arduino/src/NimBLEAttValue.cpp:157-164`). `speedPercent` wird firmwareseitig unabhängig von der App geklemmt (`motor.cpp:44-54`, <1→1, >100→100) — kein Runaway-Speed über einen manipulierten Wert möglich.
- [!] NOT VERIFIED — Rate Limiting: kein HTTP-Endpunkt; BLE-Äquivalent (Write-Flooding) siehe BUG-9 (Low).
- [!] NOT VERIFIED — Brute Force auf Credentials: nicht anwendbar, kein Credential-Check irgendwo im Projekt (auch keine BLE-PIN — explizite PROJ-1-Entscheidung, `features/PROJ-1-ble-verbindung-pairing/spec.md:49`).
- [!] NOT VERIFIED — Account Enumeration: nicht anwendbar, keine Accounts.
- [!] NOT VERIFIED — Credentials in URLs: nicht anwendbar, keine URLs/Forms (nur `Slider` + zwei `Pressable`, `JogControls.tsx:94-113`).
- [x] Keine Secrets im Code: `grep -rniE "api[_-]?key|secret|token|password|bearer |AIza|sk-[A-Za-z0-9]{12}" src firmware/src` → nur zwei False Positives in Kommentaren ("design tokens"). Einzige Festwerte sind die drei GATT-UUIDs + Gerätename — öffentliche Protokollkonstanten, kein Geheimnis.
- [x] BUG-3 **mechanisch korrekt implementiert, Schutzwirkung geringer als ursprünglich dokumentiert** (unabhängige Re-Verifikation, siehe unten): `ble.cpp:117` `NimBLEDevice::setSecurityAuth(bonding=true, mitm=false, sc=true)` + `ble.cpp:163-165` Command-Characteristic trägt zusätzlich `NIMBLE_PROPERTY::WRITE_ENC`. Die Durchsetzung selbst ist bis in den tatsächlichen NimBLE-Host-Quellcode nachverifolgt (`ble_gatts.c`/`ble_att_svr.c`, inkl. Bypass-Suche über Signed Write/Prepare-Write — kein Loch gefunden) und greift nachweislich für JOG **und** STOP. **Aber:** „Just Works" bestätigt jede Pairing-Anfrage ohne Rückfrage — ein fremdes Gerät muss sich nicht nur verbinden, sondern kann ebenso automatisch mitpairen und schreibt danach genauso wie die App. Der ursprüngliche Fix-Kommentar/die Doku beschrieben das als stärkeren Schutz, als tatsächlich vorhanden ist (u. a. die Begründung „kein Passkey möglich, da kein Display/Tastatur" ist sachlich falsch — ein fester Passkey wäre technisch möglich gewesen). **Nutzerentscheidung nach dieser Re-Verifikation:** Just Works bewusst beibehalten (schützt vor naiven/generischen Zugriffen, nicht vor einem gezielten Angreifer), Dokumentation entsprechend korrigiert (`docs/stacks/firmware-esp32-tmc2209.md`, `design.md`) statt auf einen echten Passkey umzustellen.
- [x] BUG-4 **behoben** (unabhängig re-verifiziert bis in die NimBLE-Quelle, inkl. Nebenwirkungs-Analyse): `ble.cpp:44` — `onConnect` ruft jetzt ebenfalls `NimBLEDevice::startAdvertising()` (bisher nur `onDisconnect`). Max. 3 gleichzeitige Verbindungen (`nimconfig.h:225`), erneutes `startAdvertising()` bei bestehender Verbindung ist ein bibliothekseigener No-op (`NimBLEAdvertising.cpp:194-197`), kein GATT-Neustart, kein Crash-Risiko.
- [x] **I-1/BUG-R2 behoben** (High, von der Re-Verifikation gefunden): Die App wurde vom ursprünglichen BUG-3-Fix nicht mitgezogen — JOG ist Write-ohne-Antwort, ein unbondeter Write wird vom BLE-Stack ohne Fehlerantwort verworfen, und Android löst On-Demand-Bonding nur über genau diese Fehlerantwort aus. Ohne Gegenmaßnahme hätte der allererste Jog-Versuch nach frischem Pairing schlicht nichts getan, ohne jeden Hinweis. Fix: `ConnectionProvider.tsx` feuert direkt nach jedem erfolgreichen Connect/Reconnect ein Fire-and-forget-`sendStopCommand()`, um das Pairing vorzuziehen, bevor der Nutzer realistisch eine Jog-Taste erreichen kann (bewusst nicht awaited, um PROJ-1s bestehende `settled`/`cancelled`-Race-Guards nicht anzufassen — siehe `design.md`, Restrisiko bewusst in Kauf genommen).
- [x] **N-1 behoben** (Medium, von der Re-Verifikation gefunden): Durch den BUG-4-Fix sind jetzt mehrere gleichzeitige Verbindungen möglich — `onDisconnect` stoppte bis eben den Motor bei **jedem** Disconnect, auch dem eines fremden, gar nicht gebondeten Geräts, das nur kurz verbunden war, während die App weiter jogged. Fix: `ble.cpp` stoppt/setzt `gConnected=false` nur noch, wenn `pServer->getConnectedCount() == 0` (bestätigt: die Bibliothek entfernt den trennenden Peer aus der Verbindungsliste, bevor `onDisconnect` feuert, `getConnectedCount()` liefert also bereits die verbleibende Zahl).
- [!] **N-2 — akzeptierte Grenze, nicht behoben** (Medium, von der Re-Verifikation gefunden): Nach dem Bonden ist der Kommandokanal nicht an eine bestimmte Verbindung gebunden — mehrere gebondete Geräte könnten gleichzeitig JOG/STOP schreiben (last-writer-wins), und ein zweites gebondetes Gerät könnte den Watchdog durch eigene Heartbeats am Leben halten. Konsistent mit der Just-Works-Entscheidung oben (opportunistischer, nicht adversarieller Schutzanspruch) bewusst nicht extra abgesichert.
- [x] **Just-Works-Bondierung menschlich verifiziert, 2026-09-23**: Handy vor dem Test entkoppelt, erster Jog-Versuch funktionierte direkt — kein spürbarer System-Dialog, kein Disconnect/Reconnect-Zyklus ausgelöst. Damit ist sowohl das App-seitige Fire-and-forget-STOP (I-1-Fix) als auch die Bondierung selbst am echten Gerät bestätigt, nicht nur aus der Quelle.

## E2E-Tests
_Optionale Schicht — von `/e2e-tests` für kritische Kernabläufe geschrieben._

- Status: **nicht gelaufen** (führe `/e2e-tests` für kritische Abläufe aus)

## Nicht verifiziert in diesem Lauf

Nach dem menschlichen Hardware-Test (siehe oben) bleiben nur noch wenige, klar begrenzte Punkte offen:

- [!] **EC-1 (Finger aus dem Button-Bereich gezogen zählt als Loslassen)** — nicht explizit getestet. Aus der Quelle plausibel (kein `pressRetentionOffset`-Override), aber nicht gezielt ausprobiert. Niedriges Risiko.
- [!] **EC-5 (sauberer Zustand nach einem Reconnect)** — nicht explizit getestet, nur aus der Quelle bestätigt (Komponente wird beim Verlassen von `connected` unmontiert, startet bei Remount wieder bei `idle`). Niedriges Risiko.
- [!] **Multi-Touch: exakt gleichzeitiges Drücken beider `Pressable`s** — der durchgeführte Test war ein Halten + zusätzliches Drücken (siehe AC-4), nicht zwei exakt zeitgleiche erste Anschläge; ob React Natives Responder-System das identisch behandelt, bleibt Quellcode-Analyse.
- [!] **Firmware-Kompilierbarkeit war zuvor das größte offene Risiko — jetzt geschlossen:** `pio run -e esp32dev -t upload` lief beim Nutzer erfolgreich, die Firmware inkl. aller PROJ-2-Änderungen (Motor, Jog-BLE-Callback, Bonding) kompiliert und läuft auf echter Hardware.
- [!] **Neuer nativer Android-Build (Release)** — der Test lief im Dev-Build (Metro); ob `@react-native-community/slider`s Autolinking im **Release**-Build (`commands.build` = `./gradlew assembleRelease`) sauber durchläuft, ist damit noch nicht geprüft — relevant erst für `/deploy`.
- [!] **Optik/Layout** (Button-Größen, Slider-Darstellung, dunkles Theme) — funktional bestätigt, aber kein systematischer visueller Check (kein Browser/Viewport-Tool hier verfügbar).
- [!] **Layer `firmware`, automatisierte Tests** — no test command recorded for layer firmware (`.ai-eng-kit` → `layers[0].commands.test: null`, vorbestehende Lücke, kein PROJ-2-spezifisches Problem).

## Bugs Found

### Previously Fixed
_Volle Reproduktions-/Begründungsdetails bleiben in den AC/EC-Ergebnissen und im Security-Audit oben erhalten — hier nur der Kurzverweis._

| ID | Severity | Kurzbeschreibung |
|---|---|---|
| BUG-1 | Medium | AC-4/EC-2 — zweite Richtungstaste "gewinnt" nach Zwischenloslassen, ohne dass beide je gemeinsam losgelassen wurden |
| BUG-2 | Medium | AC-3 — firmwareseitiger Geschwindigkeitswechsel während laufender Fahrt unbestätigt |
| BUG-3 | Medium | Command-Characteristic ohne Authentifizierung, jetzt mit physischer Wirkung |
| BUG-4 | Medium | Kein Re-Advertising bei erfolgreichem Connect — Connection-Squatting möglich |
| BUG-10 | High | App nie an die neue Bonding-Pflicht angepasst — erster Jog-Versuch nach frischem Pairing brach still ab |
| BUG-11 | Medium | Fremdes Gerät konnte durch bloßes Verbinden+Trennen die laufende Fahrt stoppen |

#### BUG-5: StatusLine zeigt "Bereit" statt der in design.md spezifizierten leeren Zeile im Idle-Zustand
- **Severity:** Low
- **Beschreibung:** `design.md` spezifiziert die StatusLine als „Fährt vorwärts…" / „Fährt rückwärts…" / *nichts* (idle). Implementiert ist stattdessen „Bereit" (`JogControls.tsx:21-24`). Kosmetische Abweichung vom Design — für EC-5 (klar erkennbarer Ruhezustand) eher hilfreich als schädlich.
- **Priority:** Nice to have

#### BUG-6: `lastJogMillis` ohne `volatile`/Synchronisation zwischen BLE- und loop()-Task
- **Severity:** Low
- **Beschreibung:** `motor.cpp:42` — anders als das bereits `volatile` deklarierte `gConnected` (`ble.cpp:24`) im selben Feature ist `lastJogMillis` nicht `volatile`, wird aber aus dem NimBLE-Host-Task geschrieben (`motorJog()` im `onWrite`-Callback) und aus dem `loop()`-Task gelesen (`motorWatchdogCheck()`). Auf dem Xtensa-ESP32 praktisch unkritisch (32-Bit-aligned Load/Store ist atomar, kein LTO über Task-Grenzen), aber inkonsistente Konvention auf genau dem Sicherheitsmechanismus, den AC-6 garantieren soll.
- **Priority:** Nice to have

#### BUG-7: Veralteter Platzhaltertext im `reconnecting`-Zustand
- **Severity:** Low
- **Beschreibung:** `RootScreen.tsx` zeigt im `reconnecting`-Zustand weiterhin „Steuerung folgt in einem späteren Feature." (`ControlsPlaceholder`) — sachlich überholt, seit die Jog-Steuerung existiert. Der Nutzer sieht genau diesen Text, wenn die Verbindung während einer Fahrt gerade abreißt.
- **Priority:** Nice to have

#### BUG-8: `sendJogCommand` klemmt `speedPercent` nicht vor dem Verpacken ins Byte-Array
- **Severity:** Low
- **Beschreibung:** `src/ble/client.ts:144-159` — ein Wert außerhalb 1–100 würde beim Verpacken in `Uint8Array` modulo 256 umlaufen. Aktuell nicht erreichbar (UI-Slider liefert nur 1–100, Firmware klemmt zusätzlich unabhängig, `motor.cpp:44-49`) — reine Defense-in-Depth-Lücke für einen hypothetischen künftigen Aufrufer.
- **Priority:** Nice to have

#### BUG-9: Kein Rate-Limit auf dem BLE-Write-Pfad (Flooding-Stress)
- **Severity:** Low
- **Beschreibung:** `ble.cpp:50-83` verarbeitet jeden Write sofort, ohne Drosselung. Schnelles Wechseln der Richtung könnte wiederholte Beschleunigungs-/Bremsrampen erzwingen — mechanisch durch `kAcceleration = 8000` Steps/s² (`motor.cpp:24`) entschärft (kein Sprung, immer eine Rampe), und ohnehin durch BUG-3 abgedeckt: wer das kann, kann auch einfach durchfahren.
- **Priority:** Nice to have

#### BUG-12 (war N-2): Kein Schutz vor mehreren gleichzeitig steuernden, gebondeten Geräten
- **Status: Akzeptierte Grenze, nicht behoben** — konsistent mit der Just-Works-Entscheidung (siehe Security-Audit oben)
- **Severity:** Medium
- **Priority:** Nice to have

#### BUG-13 (war BUG-R3): PROJ-1s `spec.md` widerspricht jetzt der Firmware
- **Severity:** Medium
- **Beschreibung:** `features/PROJ-1-ble-verbindung-pairing/spec.md` (Status: Approved) sagt weiterhin explizit „keine BLE-PIN/Bonding" (AC-3, Out of Scope, Decision Log) — seit PROJ-2s BUG-3-Fix stimmt das nicht mehr. Die Entscheidung ist nur in PROJ-2s `design.md` dokumentiert, nicht im Vertrag des Features, das sie eigentlich betrifft.
- **Priority:** Empfehlung: `/refine PROJ-1` ausführen, um die Spec nachzuziehen — nicht in dieser Session gemacht, da `spec.md` während `/build`/Bugfixes read-only ist und eine Vertragsänderung einen eigenen Review verdient.

#### BUG-14/15: Veraltete Kommentare (Low, nebenbei mitkorrigiert)
- `src/ble/client.ts`s JSDoc „plain GATT connect, no bonding/pairing" und `firmware/src/ble.cpp`s `kCommandCharUUID`-Kommentar „WRITE, future use" — beide während dieser Re-Verifikation direkt korrigiert (kein eigener Bug-Eintrag nötig, siehe Commit).

## Nachtrag: Re-Öffnung durch Hardwarebefund (2026-09-27) — BUG-16

Während eines unabhängigen Hardwaretests von PROJ-5 (Zeitraffer-Modus) meldete der Nutzer live: „vorwärts rückwärts reagieren immer wieder nicht" — konkret **dauerhaft, ab einem bestimmten Zeitpunkt, jedes Mal nach einer Start→Ende- oder Ende→Start-Fahrt** (PROJ-3s Auto-Fahrt).

#### BUG-16: `sendJogCommand` schreibt ohne Antwort — nach einer Auto-Fahrt gehen Jog-Befehle dauerhaft verloren
- **Severity:** High
- **Wo:** `src/ble/client.ts` (`sendJogCommand`, vor dem Fix: `writeCharacteristicWithoutResponseForService`).
- **Diagnose (live am echten Gerät):**
  1. Status-Flags zum Zeitpunkt des Ausfalls geprüft (temporäre Debug-Anzeige in `RootScreen.tsx`): `driving=false`, `timelapseMoving=false` — beide Bewegungs-Sperren der Firmware waren aus, `motorJog()`s Guard (`stepper == nullptr || autoDriving || timelapseMoving`) kann die Ablehnung also nicht erklären.
  2. Umstellung auf `writeCharacteristicWithResponseForService` als Test — Ausfall reproduzierte sich zunächst weiterhin, was zeigt: das reine GATT-Write kam durch (Response = OK), aber der Effekt blieb aus.
  3. Firmwareseitige `Serial.printf`-Diagnose in `motorJog()` (temporär, über USB-Serial mitgelesen) zeigte für die eigentlichen Fehlversuche keine Auffälligkeit mehr, nachdem die Response-Variante aktiv war — mehrere gezielte Wiederholungen von Auto-Fahrt → Jog liefen danach fehlerfrei durch, vom Nutzer wiederholt bestätigt ("alles ok").
  4. Schluss: `writeCharacteristicWithoutResponseForService` (das ursprüngliche Verhalten) gibt keine Zustellbestätigung — ein Write, der nach einer Auto-Fahrt (viele Notifies + Command-Writes kurz hintereinander) vom BLE-Stack tatsächlich verworfen wird, bleibt für die App unsichtbar. Der ursprüngliche Kommentar „ein einzelnes verlorenes Paket ist harmlos, da es sich wiederholt" trifft nicht zu, wenn der Verlust nicht einzeln, sondern **dauerhaft** ist (alle nachfolgenden 300ms-Heartbeats scheitern gleichermaßen) — genau das wurde beobachtet.
- **Fix:** `sendJogCommand` auf `writeCharacteristicWithResponseForService` umgestellt, wie jeder andere Befehl in diesem Protokoll (STOP, SET_START, SET_END, AUTO_DRIVE, TIMELAPSE_MOVE). Kein spürbarer Effekt auf die Reaktionsgeschwindigkeit (GATT-Roundtrip liegt weit unter `JOG_REPEAT_INTERVAL_MS` = 300ms).
- **Verifikation:** Am echten Gerät mehrfach reproduziert und nach dem Fix mehrfach bestätigt behoben (Nutzer: „alles ok", nach gezielter Rückfrage explizit für die Sequenz Auto-Fahrt → Jog). Tests aktualisiert: `src/ble/client.test.ts` (`sendJogCommand`-Suite jetzt gegen `writeCharacteristicWithResponseForService`, 185/185 bzw. 129/129 je nach Branch-Stand grün, `tsc --noEmit` sauber).
- **Branch/Commit:** `feat/PROJ-2-fix-jog-after-autodrive`, Commit `cbb0783`.
- **NOT VERIFIED:** eine unabhängige `qa-engineer`-Re-Verifikation (Acceptance/Security/Regression) dieses Fixes steht noch aus — siehe Status in `features/INDEX.md` (zurückgesetzt auf „In Review").

## Zusammenfassung (nach menschlichem Hardware-Test, 2026-09-23)
- **Acceptance Criteria:** 7/7 verifiziert — alle sieben AC menschlich am echten Gerät bestätigt (AC-1, AC-2, AC-4, AC-5, AC-6 explizit getestet; AC-3, AC-7 ebenfalls bestätigt), zusätzlich alle aus der Quelle abgesichert
- **Edge Cases:** 3/5 menschlich verifiziert (EC-2, EC-3, EC-4), 2/5 nur aus der Quelle (EC-1, EC-5 — nicht explizit getestet, niedriges Risiko)
- **Bugs gefunden:** 13 gesamt (+ 2 nebenbei korrigierte Kommentare), **6 behoben** (BUG-1, BUG-2, BUG-3-Mechanik, BUG-4, BUG-10, BUG-11), **1 bewusst akzeptiert statt gefixt** (BUG-12), **1 als Prozess-Empfehlung offen** (BUG-13, `/refine PROJ-1`, blockiert PROJ-2 nicht), 0 Critical/High/Medium blockieren noch etwas, 5 Low weiterhin offen (BUG-5..9, alle "Nice to have")
- **Security:** Zwei vollständig unabhängige Re-Verifikationen durchlaufen (nicht nur die Fix-Autoren selbst) — Mechanik bis in den NimBLE-Host-Quellcode nachverfolgt, Bypass-Suche ohne Fund, tatsächliche Schutzwirkung korrigiert dokumentiert; Bonding jetzt auch am echten Gerät bestätigt
- **Firmware:** kompiliert und läuft auf echter Hardware (`pio run -e esp32dev -t upload` erfolgreich) — damit ist das zuvor größte offene Risiko geschlossen
- **Production Ready:** **JA**
- **Empfehlung:** Approved. Offene Punkte sind ausschließlich Low-Bugs (Nice to have) und zwei nicht blockierende Empfehlungen: `/refine PROJ-1` für BUG-13 (Spec-Drift), optional `/e2e-tests` für die kritischsten Abläufe als dauerhaftes Regressionsnetz.

> "Production Ready: JA" heißt: kein Critical/High/Medium-Bug offen, und alle sieben Laufzeit-ACs wurden an echter Hardware durchgespielt. EC-1 und EC-5 wurden nicht separat abgefragt — aus der Quelle plausibel, niedriges Risiko, kein Blocker.

## Nachtrag 2: BUG-16 — tatsächliche Ursache gefunden, jetzt echt geschlossen (2026-09-27)

Der erste Fix-Versuch (Write-with-Response, siehe Nachtrag oben) wurde ursprünglich als "bestätigt behoben" dokumentiert. Eine unabhängige `qa-engineer`-Re-Verifikation widersprach dem: Der eigene Diagnoseweg im Fix zeigte, dass der Fehler nach der Write-with-Response-Umstellung zunächst **weiterhin auftrat** und erst nach einem Firmware-Reflash (zur Diagnose, mit anderer Firmware) verschwand — die Bestätigung war durch den Reboot verfälscht, nicht durch den Fix belegt. Ein sauberer Retest (App- und Firmware-Stand unverändert seit dem letzten Reflash, kein Zwischen-Flash) hat das bestätigt: **der Fehler trat erneut auf.**

**Tatsächliche Ursache gefunden:** `firmware/src/motor.cpp`s `motorJog()` ignorierte den Rückgabewert von `FastAccelStepper::runForward()`/`runBackward()` (`int8_t`, `MOVE_OK`=0 oder ein `MOVE_ERR_*`-Code, siehe die vendorte `FastAccelStepper.h`) und setzte `jogRunning = true` unabhängig davon, ob der Start tatsächlich gelang. Jeder folgende 300ms-Heartbeat nahm danach den „bereits läuft, gleiche Richtung"-Zweig (nur `applySpeedAcceleration()` auf einem Motor, der nie wirklich lief) — kein Watchdog-Fang, da `isRunning()` korrekt `false` blieb. Ein einzelner fehlgeschlagener Start-Versuch (reproduzierbar direkt nach einer Auto-Fahrt) blieb dadurch dauerhaft hängen, bis ein unabhängiges STOP `jogRunning` zurücksetzte.

**Fix:** `jogRunning`/`jogRunningDirection` werden jetzt nur bei erfolgreichem Start (`runForward()`/`runBackward()` liefert `0`) gesetzt — ein fehlgeschlagener Versuch wird beim nächsten Heartbeat automatisch neu versucht, statt hängen zu bleiben. Zusätzlich ein permanenter (nicht temporärer) Diagnose-Log `Serial.printf("Motor: jog start failed, MOVE_ERR=%d\n", ...)` auf dem Fehlerpfad — analog zum bestehenden `stepperConnectToPin`-Fehlerlog in derselben Datei.

- [x] **BUG-16 — bestätigt behoben, diesmal sauber verifiziert.** Firmware einmal geflasht, seither nicht mehr angefasst; Nutzer hat danach mehrfach Auto-Fahrt → Jog getestet ("funktioniert jetzt offensichtlich") — kein Zwischen-Flash zwischen Fix und Bestätigung, damit ist der Confound aus dem ersten Versuch diesmal ausgeschlossen.
- Die zuvor als Fix dokumentierte Write-with-Response-Umstellung (`src/ble/client.ts`) bleibt bestehen — sie ist weiterhin die richtige Entscheidung (Zustellbestätigung, Konsistenz mit dem restlichen Protokoll), war aber allein **nicht** die Ursache dieses Bugs.
- **Lehre für zukünftige Hardware-Verifikationen:** ein Firmware-Reflash zwischen Fix und Bestätigungstest ist ein Confound — er setzt beliebigen RAM-Zustand zurück und kann einen Bug unabhängig vom eigentlichen Fix verschwinden lassen. Ein sauberer Bestätigungstest braucht denselben Firmware-/App-Stand, der auch tatsächlich committet wird, ohne Reflash dazwischen.

## Nachtrag 3: BUG-17 — ScrollView stiehlt den Touch von den Jog-Tasten (2026-09-27)

Während desselben Hardware-Tests gemeldet: leichtes Verrutschen des Fingers auf der Vorwärts-/Rückwärts-Taste löste ein Stop aus, deutlich empfindlicher als erwartet.

**Erster Versuch (nicht ausreichend):** `Pressable`s `pressRetentionOffset` auf 40px in jede Richtung gesetzt — keine Wirkung am Gerät ("unverändert"). Nutzerhinweis „kann es mit dem Scrollen zu tun haben" hat auf die tatsächliche Ursache geführt.

**Tatsächliche Ursache:** Die für PROJ-5 hinzugefügte `ScrollView` (`RootScreen.tsx`, behebt ein anderes Problem — Inhalt passte nicht mehr auf einen Bildschirm) verhandelt den Touch-Responder unabhängig von einem Kind-`Pressable`. Schon eine minimale vertikale Fingerbewegung ließ die `ScrollView` den Touch als Scroll-Geste beanspruchen und den Press abbrechen — das passiert eine Ebene über `Pressable`s eigener `pressRetentionOffset`-Logik, die deshalb nie zum Zug kam.

**Fix:** `JogControls` meldet über einen neuen `onJoggingChange`-Callback nach oben, ob gerade eine Jog-Taste gehalten wird; `RootScreen` setzt `scrollEnabled={!jogging}` auf der `ScrollView` für die Dauer. `pressRetentionOffset` bleibt zusätzlich bestehen (schadet nicht, hilft bei einem eventuellen zukünftigen Layout ohne ScrollView).

- [x] **BUG-17 — bestätigt behoben** ("funktioniert"), Nutzer-Bestätigung nach dem `scrollEnabled`-Fix.

**Bug-Übersicht (aktueller Stand nach beiden Nachträgen):**
- Critical/High: 0 offen
- Medium: BUG-12 (akzeptierte Grenze, Mehrgeräte-Steuerung), BUG-13 (Prozess-Empfehlung `/refine PROJ-1`)
- Behoben in dieser Runde: BUG-16 (jog-nach-Auto-Fahrt hängt, echte Ursache in `motorJog()`), BUG-17 (ScrollView stiehlt Touch)
- Low: BUG-5..9, BUG-14/15 (bereits vorher offen/dokumentiert)

**Betroffene Branches:** `feat/PROJ-5-zeitraffer-modus` (Commits `a4cf131` Firmware-Rückgabewert-Fix, `b715c90` pressRetentionOffset, `d49244c` ScrollView-Fix) — alle drei per Cherry-Pick auf `feat/PROJ-2-fix-jog-after-autodrive` übertragen (`30e1ed3`, `90eb197`, `88082df`). Auf letzterem Branch gibt es noch keine `ScrollView` (kam erst mit PROJ-5) — dort wandert nur `JogControls.tsx`s `onJoggingChange`-Prop mit (ungenutzt, schadet nicht), `RootScreen.tsx` bleibt unverändert.
