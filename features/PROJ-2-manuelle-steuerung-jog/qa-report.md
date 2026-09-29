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

- [ ] **BUG-16 — NICHT bestätigt, siehe Nachtrag 4: der Fix selbst ist vermutlich wirkungslos.** Ursprünglich hier als „sauber verifiziert" dokumentiert (Firmware einmal geflasht, seither nicht mehr angefasst, Nutzer-Test danach: „funktioniert jetzt offensichtlich") — eine zweite, unabhängige Re-Verifikation hat das widerlegt. Bleibt als Beleg stehen (der Reflash selbst fand statt, die Nutzer-Bestätigung ist echt), aber die Schlussfolgerung „damit ist der Confound ausgeschlossen" war falsch: der Flash-Vorgang selbst ist bereits ein Reboot, und genau der könnte erneut die eigentliche Ursache verdeckt haben, nicht dieser Fix.
- Die zuvor als Fix dokumentierte Write-with-Response-Umstellung (`src/ble/client.ts`) bleibt bestehen — sie ist weiterhin die richtige Entscheidung (Zustellbestätigung, Konsistenz mit dem restlichen Protokoll), war aber allein **nicht** die Ursache dieses Bugs.
- **Lehre für zukünftige Hardware-Verifikationen:** ein Firmware-Reflash zwischen Fix und Bestätigungstest ist ein Confound — er setzt beliebigen RAM-Zustand zurück und kann einen Bug unabhängig vom eigentlichen Fix verschwinden lassen. Ein sauberer Bestätigungstest braucht denselben Firmware-/App-Stand, der auch tatsächlich committet wird, ohne Reflash dazwischen.

## Nachtrag 3: BUG-17 — ScrollView stiehlt den Touch von den Jog-Tasten (2026-09-27)

Während desselben Hardware-Tests gemeldet: leichtes Verrutschen des Fingers auf der Vorwärts-/Rückwärts-Taste löste ein Stop aus, deutlich empfindlicher als erwartet.

**Erster Versuch (nicht ausreichend):** `Pressable`s `pressRetentionOffset` auf 40px in jede Richtung gesetzt — keine Wirkung am Gerät ("unverändert"). Nutzerhinweis „kann es mit dem Scrollen zu tun haben" hat auf die tatsächliche Ursache geführt.

**Tatsächliche Ursache:** Die für PROJ-5 hinzugefügte `ScrollView` (`RootScreen.tsx`, behebt ein anderes Problem — Inhalt passte nicht mehr auf einen Bildschirm) verhandelt den Touch-Responder unabhängig von einem Kind-`Pressable`. Schon eine minimale vertikale Fingerbewegung ließ die `ScrollView` den Touch als Scroll-Geste beanspruchen und den Press abbrechen — das passiert eine Ebene über `Pressable`s eigener `pressRetentionOffset`-Logik, die deshalb nie zum Zug kam.

**Fix:** `JogControls` meldet über einen neuen `onJoggingChange`-Callback nach oben, ob gerade eine Jog-Taste gehalten wird; `RootScreen` setzt `scrollEnabled={!jogging}` auf der `ScrollView` für die Dauer. `pressRetentionOffset` bleibt zusätzlich bestehen (schadet nicht, hilft bei einem eventuellen zukünftigen Layout ohne ScrollView).

- [x] **BUG-17 — bestätigt behoben** ("funktioniert"), Nutzer-Bestätigung nach dem `scrollEnabled`-Fix.

**Bug-Übersicht (Stand nach Nachtrag 3, siehe Nachtrag 4 für die Korrektur):**
- Critical/High: 0 offen
- Medium: BUG-12 (akzeptierte Grenze, Mehrgeräte-Steuerung), BUG-13 (Prozess-Empfehlung `/refine PROJ-1`)
- Behoben in dieser Runde: ~~BUG-16~~ (siehe Nachtrag 4 — vermutlich weiterhin offen, High), BUG-17 (ScrollView stiehlt Touch, bestätigt)
- Low: BUG-5..9, BUG-14/15 (bereits vorher offen/dokumentiert)

**Betroffene Branches:** `feat/PROJ-5-zeitraffer-modus` (Commits `a4cf131` Firmware-Rückgabewert-Fix, `b715c90` pressRetentionOffset, `d49244c` ScrollView-Fix) — alle drei per Cherry-Pick auch auf `feat/PROJ-2-fix-jog-after-autodrive` (`30e1ed3`, `90eb197`, `88082df`).

## Nachtrag 4: BUG-16-Fix vermutlich wirkungslos — Fehlerzweig mit dieser Bibliotheksversion praktisch unerreichbar (2026-09-27)

Eine zweite, unabhängige `qa-engineer`-Re-Verifikation (Auftrag: Code- und Firmware-Ebene prüfen, nicht die bereits erfolgte Hardware-Bestätigung wiederholen) hat den in Nachtrag 2 dokumentierten Fix bis in die vendorte `FastAccelStepper`-Bibliothek (0.31.8) zurückverfolgt und einen ernsten Einwand gefunden:

**`startResult` ist an dieser Stelle vermutlich immer 0 (Erfolg).** `runForward()`/`runBackward()` → `RampGenerator::startRun()` → gibt nur bei `_parameters.checkValidConfig() != MOVE_OK` einen Fehler zurück, und das schlägt laut `RampCalculator.h` nur fehl, wenn Geschwindigkeit oder Beschleunigung nie gesetzt wurden. Beide sind zum Zeitpunkt jedes `motorJog()`-Aufrufs immer gesetzt (`setAcceleration()` einmalig in `motorSetup()`, `setSpeedInHz()` unmittelbar vor jedem Start-Versuch, `motor.cpp:244`) — die beiden Flags, die den Fehler auslösen könnten, werden nur beim Booten zurückgesetzt. Der neue `else`-Zweig (inkl. des `Serial.printf`-Diagnose-Logs) ist damit nach dieser Analyse **toter Code**, der die Ursache nicht trifft.

**Das erklärt die vorherige "erfolgreiche" Bestätigung nicht weg, sondern relativiert sie:** Das Flashen des Fixes ist selbst bereits ein ESP32-Reboot (Power-On-Reset). Der ursprüngliche Bug-Bericht beschrieb das Symptom als „dauerhaft, ab einem bestimmten Zeitpunkt" — nicht von Anfang an — und Nachtrag 2 selbst dokumentiert, dass der Fehler beim allerersten Diagnose-Reflash bereits einmal spurlos verschwunden war. Ein frischer Boot gefolgt von „mehrfach getestet, funktioniert" unterscheidet nicht zuverlässig zwischen „der Fix wirkt" und „ein frischer Boot maskiert den eigentlichen, wahrscheinlich zustandsabhängigen Bug erneut" — dieselbe Fehlerklasse wie beim allerersten Versuch, nur eine Ebene tiefer.

**Alternative Spur (nicht bestätigt, nur eine Vermutung):** `FastAccelStepper::forceStop()` setzt ein Immediate-Stop-Flag, das nur innerhalb einer laufenden Rampe wieder gelöscht wird. Ein nachfolgender `startRun()`-Aufruf könnte `MOVE_OK` liefern, während die Rampe durch das noch gesetzte Flag sofort wieder beendet wird — der Motor „startet" laut Rückgabewert, bewegt sich aber nicht. Nicht abschließend mit dem normalen Jog-nach-Connect-Verhalten in Einklang gebracht, daher ausdrücklich nur eine Spur, kein bestätigter Fund.

**Nächster Schritt (in Arbeit):** Der ESP32 läuft seit dem letzten (für diese Diagnose nötigen) Reflash ohne weitere Unterbrechung, ein Serial-Monitor läuft mit, ohne die Firmware erneut anzufassen. Gesucht wird: (a) taucht `Motor: jog start failed` je auf, wenn das Symptom erneut auftritt (würde den Fix als wirksam bestätigen), oder (b) tritt das Symptom ohne diese Zeile erneut auf (würde beweisen, dass die Ursache woanders liegt, z. B. der Immediate-Stop-Flag-Verdacht oben). Ausgedehnter Normalbetrieb über mehrere Auto-Fahrt-/Jog-Zyklen, nicht nur ein einzelner Test, ist hier die aussagekräftigere Bestätigung als ein einzelner Erfolg direkt nach einem Reboot.

- [!] **BUG-16 — Status zurückgesetzt auf offen (High), NOT VERIFIED ob der committete Fix wirkt.** Verifikation läuft weiter, siehe „Nächster Schritt" oben.
- **`design.md` noch nicht nachgezogen** (von der Re-Verifikation ebenfalls gefunden): beschreibt BUG-16 weiterhin als durch Write-with-Response verursacht/behoben — nicht mehr aktuell, unabhängig vom Ausgang der laufenden Diagnose.

## Nachtrag 5: Re-Verifikation nach Erhöhung der Höchstgeschwindigkeit 4000 → 8000 Steps/s (2026-09-29)

**Scope (Re-Verifikation):** `git diff 0f08bd1..HEAD -- src firmware/src` (Commits `94ba380`, `5d65f78`). Im Code ändern sich nur `kJogSpeedMaxHz` (`firmware/src/motor.cpp:31`) und der App-Spiegel `MAX_SPEED_STEPS_PER_SEC` (`src/components/AutoDriveControls.tsx:33`); der Rest sind Kommentare, Test-Fixtures und Doku. Ein `qa-engineer`-Lauf mit allen drei Scopes (2 → 3 → 4), eingegrenzt auf den Diff — bewusst nicht der volle Fan-out, weil der Diff faktisch zwei Konstanten sind. Alles andere ist aus dem Bericht oben übernommen: _unverändert seit 2026-09-27, in diesem Lauf nicht neu geprüft_ (AC-4, AC-5, AC-7, EC-1, EC-2, EC-3, EC-5 — ihre Dateien liegen nicht im Diff).

**Test-Suite (einmalig, Owner):** `npm test` → 12 Suites, 193 Tests, 0 Fehler (Log im Scratchpad `suite.log`). Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

**Ergebnis:**
- [x] Mapping 1–100 % → 200–8000 Steps/s, Klemmung, kein Overflow — `motor.cpp:180-190` (Nachbau der Formel in float32: 1 % → 200, 50 % → 4061, 100 % → 8000, Byte 255 → 8000)
- [x] Toleranz Firmware ↔ App identisch (200/8000, 0,01) — `motor.cpp:30-31,50,450-451` ↔ `AutoDriveControls.tsx:32-33,49,281-282`
- [x] Zeitraffer-Timeout passt zur neuen Geschwindigkeit — `useTimelapseSequence.ts:74-77`, `motor.cpp:520`
- [x] AC-1, AC-2, AC-3, AC-6 / EC-4 — Steuerlogik unverändert (`motor.cpp:219-341`); Laufzeit: `[!] NOT VERIFIED — no way to run and probe this project was recorded`
- [x] Security: Speed-Byte > 100 wird geklemmt (`motor.cpp:181-185`), Opcode-/Längenprüfung unverändert (`ble.cpp:143-233`), keine neuen Secrets
- [ ] **BUG-18 (High nach Regressions-Regel, Wirkung Medium) — PROJ-3 AC-11:** `autoCorrectedDurationText()` trägt `formatSeconds(minAutoDriveDurationSeconds(d))` ein (`AutoDriveControls.tsx:188`); `formatSeconds` rundet mit `toFixed(1)` auf die nächste Zehntelsekunde statt aufzurunden (`:148-150`). Liegt der gerundete Wert unter dem echten Minimum, bleibt die Dauer ungültig, die Fahrt-Buttons bleiben gesperrt und jedes weitere Verlassen des Felds setzt denselben Wert erneut ein. Die Fehlerklasse existierte schon bei 4000, der Diff verschiebt die betroffenen Distanzen: jetzt z. B. d=4000 → „1.4" (echt 1,414), d=3000 → „1.2", d=9920 → „2.2" (vorher fahrbar). Workaround: Dauer manuell um 0,1 s erhöhen. Die Tests bleiben grün, weil sie nur `text == formatSeconds(min)` prüfen, nicht die Fahrbarkeit. Fix gehört in `/build` (aufrunden), Bezug: PROJ-3 BUG-4 (Rundung in der Fehlermeldung).
- [ ] BUG-19 (Low): veraltete Kommentare — `AutoDriveControls.tsx:92` („= 2000 steps" → 8000), `useTimelapseSequence.test.ts:305-307` (Werte 13000/18000/30500 → 7250/12250/18500 ms), `AutoDriveControls.test.ts:107-111` (Aussage „must reject" stimmt bei Deckel 8000 nicht mehr).
- BUG-16 (High, offen): vom Diff nicht berührt (`motorJog()`/`motorStop()`/`forceStop()` unverändert), bleibt offen.

**Nebenwirkungen, kein Verstoß gegen ein AC (zur Kenntnis):**
- Der Standardwert 50 % fährt jetzt ca. 4061 statt 2081 Steps/s (etwa doppelt so schnell).
- Der Watchdog-Nachlauf (AC-6, 1 s) beträgt bei voller Geschwindigkeit jetzt bis ca. 50 mm statt 25 mm (8000 Steps/s ÷ 160 Steps/mm); der Slider hat keine Endanschläge.

**Nicht verifiziert in diesem Lauf:**
- [!] Motor bei 8000 Steps/s (Schrittverluste, StealthChop-Drehmoment, Wärme, ungebremster `forceStop()` aus voller Fahrt) — no way to run and probe this project was recorded. Der Nutzer-Test mit 6000 und 8000 („soweit funktioniert's", 2026-09-29) ist eine Aussage im Chat, kein protokollierter Testlauf.
- [!] Settle-Pause von 400 ms (`useTimelapseSequence.ts:87`) bei schnelleren Zeitraffer-Schritten — Hardware.
- [!] Laufzeit AC-1..7, EC-1..5, PROJ-3/4/5 an echter Hardware.

**Production-Ready: NEIN** — BUG-16 (High) ist weiterhin offen und BUG-18 (PROJ-3 AC-11) ist neu; zusätzlich Laufzeit nicht verifiziert. Status: **In Review**.

## Nachtrag 6: BUG-16 — Fix am Gerät bestätigt, BUG-18 behoben (2026-09-29)

- [x] **BUG-16 — vom Nutzer am echten Slider als behoben gemeldet** („bug16 behoben", 2026-09-29), nach Commit `4552ed5`. **Neue Ursachenvermutung und Fix:** `jogRunning` wurde nur von `motorStop()` zurückgesetzt; ein `moveTo()` (Auto-Fahrt/Zeitraffer), das einen als laufend markierten Jog überschrieb und dann ankam, ließ das Flag auf einem stehenden Stepper auf „läuft" stehen — jeder Herzschlag rief danach nur `applySpeedAcceleration()` auf. Jetzt: `motorJog()` setzt das Flag zurück, wenn `!stepper->isRunning()`, und `motorAutoDrive()`/`motorTimelapseMoveTo()` setzen `jogRunning = false` (`firmware/src/motor.cpp`). Der frühere Rückgabewert-Fix bleibt bestehen.
  - **Einschränkungen (ehrlich):** Die Ursache ist aus dem Code hergeleitet, nicht am Gerät nachgestellt (kein Serial-Log). Nach dem Flash lief der Test nicht auf einem lange laufenden Gerät — der Flash-Confound aus Nachtrag 4 gilt weiter, und die Stichprobengröße (Anzahl Durchläufe) ist nicht protokolliert. `[!]` Die Wirksamkeit ist damit vom Nutzer bestätigt, aber nicht durch einen unabhängigen `/qa`-Lauf verifiziert.
- [x] **BUG-18 — behoben** in `655f28d` (`ceilToDeciseconds`, `AutoDriveControls.tsx`), 195 Tests grün, Red-Check durchgeführt (4 Tests rot ohne Fix). Fahrbarkeit an der Hardware nicht separat getestet.
- **Zusatzänderung `5feb442`:** DIR-Polarität invertiert (`setDirectionPin(kDirPin, false)`), weil „vorwärts/rückwärts" physisch vertauscht war; vom Nutzer bestätigt („passt"). Wirkt konsistent auf Jog, Auto-Fahrt und Zeitraffer.
- Weiterhin offen: BUG-19 (Low, veraltete Kommentare), BUG-12/13 (Medium, akzeptiert/Prozess), BUG-5..9, 14, 15 (Low).

**Status:** bleibt **In Review**, bis `/qa PROJ-2` (Re-Verifikation im Umfang der Fixes `4552ed5`, `655f28d`, `5feb442`) läuft. Kein Critical/High-Bug ist nach Stand des Nutzers offen.

## Nachtrag 7: Unabhängige Re-Verifikation — BUG-16-Fix, DIR-Umkehr, 8000 Steps/s (2026-09-30)

**Scope:** `git diff ea0b613..HEAD -- firmware/src src/ble src/components/JogControls.tsx src/components/useJogState.ts src/screens` → nur `firmware/src/motor.cpp` (`4552ed5` BUG-16, `5feb442` DIR-Umkehr). Weil `motor.cpp` von Jog, Auto-Fahrt und Zeitraffer geteilt wird: voller Fan-out mit drei `qa-engineer`-Lanes. `probe.kind: none` — Laufzeit/Hardware `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 13 Suites, 210 Tests, 0 Fehler (`suite9.log`). Firmware kompiliert am HEAD (`pio run -e esp32dev`, SUCCESS, RAM 12,4 %, Flash 49,1 %, ohne Upload). Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

### BUG-16 — aus Code-Sicht geschlossen, Ursache korrigiert
- [x] **Geschlossen** — `motor.cpp:258-260` (`if (jogRunning && !stepper->isRunning()) jogRunning = false;`) behandelt jeden Pfad „Flag gesetzt, Stepper steht". Belegt per Host-Simulation der vendorten FastAccelStepper 0.31.8 (Queue-Attrappe): alter Herzschlag (`applySpeedAcceleration`) → 0 Schritte, neuer Herzschlag (`runForward`) → 3242 Schritte; im Dauerlauf ist `isRunning` in 0 von 200 Takten false, also kein Ruckeln/Neustart.
- **Tatsächliche Ursache** (die Spur aus Nachtrag 4, jetzt belegt): `motorStop()` ruft `forceStop()` auch bei stehendem Motor (`motor.cpp:318`); das setzt `force_immediate_stop` (`FastAccelStepper.cpp:674-682`), das nur in `getNextCommand()` gelöscht wird und bei inaktiver Rampe gesetzt bleibt (`:373`). Das nächste `runForward()` liefert `MOVE_OK`, die Rampe endet aber ohne einen Schritt (`RampGenerator.cpp:128-141, 252-258`). Loslassen sendet wieder STOP → der Zustand hält sich selbst, bis Reboot/Flash — passt zu „dauerhaft ab einem Zeitpunkt" und „Reflash heilt es". `moveTo()` (Auto-Fahrt) ist nicht betroffen (5000/5000 Schritte).
- Die in Nachtrag 6 und im Code-Kommentar (`motor.cpp:249-257, 489-491, 554`) genannte Ursache („`moveTo()` überschreibt einen laufenden Jog") ist **nicht erreichbar**: `motorAutoDrive()` und `motorTimelapseMoveTo()` lehnen bei laufendem Stepper ab (`motor.cpp:398, 514`). Die Zeilen `:491` und `:554` sind harmlos, aber praktisch wirkungslos.
- Laufzeit am Gerät: vom Nutzer am 2026-09-30 als behoben gemeldet (Nachtrag 6); in diesem Lauf `[!]`.

### Acceptance Criteria
- [x] **AC-1** — Richtungskette durchgängig: „▲ Vorwärts" → `'forward'` → 0x00 (`client.ts:36-39`) → `kForward` (`ble.cpp:155-157`) → `runForward()` (`motor.cpp:293-295`). DIR-Umkehr (`motor.cpp:216`) kippt nur den Pin-Pegel (`StepperISR.cpp:52`), Zählrichtung, Positionen und `endIsAfterStart` bleiben — eine Stelle, konsistent für alle Modi. Einschränkung: BUG-20.
- [x] **AC-2** — Loslassen → `idle` → Cleanup sendet STOP (`useJogState.ts:86-88`, `JogControls.tsx:127-130`) → `forceStop()`
- [x] **AC-3** — Speed pro 300-ms-Tick frisch gelesen (`JogControls.tsx:108-125`), Firmware `setSpeedInHz` + `applySpeedAcceleration` (`motor.cpp:247, 265-272`)
- [x] **AC-4, EC-2** — `blocked`-Zustand, STOP, kein JOG bis beide Tasten los (`useJogState.ts:89-151`, Tests grün)
- [x] **AC-5, EC-3** — `onDisconnect` → `motorStop()` bei verschlüsseltem Link (`ble.cpp:125-127`); App zeigt `reconnecting` (`RootScreen.tsx:139-147`)
- [x] **AC-6, EC-4** — Watchdog 1000 ms (`motor.cpp:54, 338-357`), unabhängig vom BLE-Status; Nachlauf bei 8000 Steps/s bis ~51 mm
- [x] **AC-7** — Steuerung nur in `connected` (`RootScreen.tsx:93-121`); BUG-7 (Low) unverändert
- [x] **EC-1** — Verlassen des Rechtecks (+40 px) oder ScrollView-Übernahme → `onPressOut` (Stopp); Scrollen während Jog gesperrt (`RootScreen.tsx:116`). Anmerkung: Zurückziehen in den Button ohne Abheben startet die Fahrt erneut.
- [x] **EC-5** — Remount startet in `idle`, Firmware stoppt beim Disconnect
- [x] **Mapping 8000 Steps/s** — float32 nachgerechnet: 0/1→200, 50→4061, 100/255→8000, kein Überlauf (`motor.cpp:180-190`)

### Security
- [x] Keine Verschlechterung, keine neuen Critical/High/Medium. JOG-Länge/Opcode geprüft (`ble.cpp:143-152, 228-233`), Speed geklemmt, WRITE_ENC unverändert (`ble.cpp:377-379`). Der BUG-16-Fix öffnet keinen Weg, den Motor ungewollt laufen zu lassen oder den Watchdog auszuhebeln (Watchdog liest `jogRunning` nicht; Dauerlauf nur über `motorJog`, das bei `autoDriving/timelapseMoving` ablehnt). Keine Secrets (`git grep`; nur öffentliche RN-Debug-Keystore-Werte, bekannt).
- **Zusammenfassung:** 6 Checks verifiziert, 6 NOT VERIFIED (Laufzeit; Auth/Authorization/Brute Force/Credentials in URL/API-Antworten nicht anwendbar; Rate Limiting not implemented, BLE-Pendant BUG-9).

### Regression
- [x] PROJ-3 (Richtung, Ankunft, Stopp, Watchdog-Ausnahme, Speed-Grenzen App = Firmware), PROJ-4 (Vorzeichen SET_END_FROM_DISTANCE, Migration `dirVersion`), PROJ-5 (Richtung, 8000 Steps/s, Ankunftserkennung, Timeout), PROJ-1 (Verbindungsfluss, Disconnect-Stopp) — alles aus dem Code konsistent; Modusübergänge Jog → Auto-Fahrt → Jog, Jog → Zeitraffer → Jog, Stopp → Jog ohne Befund.

### Neue Bugs
- [ ] **BUG-20 (Medium) — Der erste JOG nach einem STOP im Stillstand wird geschluckt; gefahren wird erst ab dem zweiten Herzschlag (~300 ms). Kurzes Antippen unter ~300 ms bewegt nichts.** Folge des BUG-16-Mechanismus: das Immediate-Stop-Flag schluckt den ersten Start, der Reset heilt es erst beim nächsten Herzschlag. STOP im Stillstand kommt häufig vor (nach jedem Connect, nach Ende/Abbruch des Zeitraffers, nach einem Watchdog-Stopp, nach jedem geschluckten Tipp). Simulation: erster Start 0 Schritte, zweiter 3242. Abhilfe-Idee: `forceStop()` in `motorStop()` nur bei `stepper->isRunning()`. Workaround: länger halten. Laufzeit `[!]`.
- [ ] **BUG-21 (Medium, bedingt, deploy-relevant) — deployte App v1.2.0 und aktuelle Firmware passen nicht zusammen.** v1.2.0 hat die Preset-Migration (`a6b837d`) nicht; mit der Firmware ab `5feb442` legt ein altes Preset dort das Ende auf die Gegenseite (keine Endanschläge). App und Firmware müssen gemeinsam ausgeliefert werden; der Deployments-Eintrag hält keine Firmware-Version fest.
- [ ] **BUG-22 (Low, Doku):** falsche BUG-16-Ursache in `motor.cpp:249-257, 489-491, 554` und Nachtrag 6; `design.md:81, 109, 119` kennen den Firmware-Fix und die DIR-Umkehr nicht; `docs/stacks/firmware-esp32-tmc2209.md:79` zeigt `setDirectionPin(26)` ohne Polarität; toter Fehlerzweig `motor.cpp:299-305` bleibt.
- [ ] **BUG-23 (Low):** `lastJogMillis` wird erst nach dem Start gesetzt (`motor.cpp:293-308`); in einem Mikrosekunden-Fenster kann der Watchdog (anderer Task) nach >1 s Pause den frischen Start stoppen — endet immer im Stillstand, heilt beim nächsten Herzschlag.
- Außerhalb Scope bemerkt: `FastAccelStepper @ ^0.31.1` offene Versionsbreite (Fix stützt sich auf Bibliotheksinternas); Zeitraffer-Rückfahrt bei ≤194 Steps von der Firmware verworfen (PROJ-5, Low).

### Nicht verifiziert
- [!] Laufzeit aller AC/EC, BUG-16 und BUG-20 am Gerät, physische Richtung, Schrittverluste/Wärme bei 8000 Steps/s, `forceStop()` aus voller Fahrt, Touch-Verhalten — no way to run and probe this project was recorded. Die Host-Simulation belegt die Rampenlogik, nicht das Hardware-Timing.

**Production-Ready: NOT READY — not verified.** Keine Critical/High-Bugs offen (BUG-16 aus Code-Sicht geschlossen). Offen: BUG-20 und BUG-21 (Medium). Der letzte protokollierte Hardware-Test aller PROJ-2-ACs (2026-09-23) liegt vor den Firmware-Änderungen; Freigabe nur über einen neu protokollierten Nutzer-Test. Status: **In Review**.

## Nachtrag 8: Fix BUG-20/22/23 und protokollierter Nutzer-Test am Gerät (2026-09-30)

- **Fix `a763cb3`:** `motorStop()` ruft `forceStop()` nur bei `stepper->isRunning()` (tatsächliche Ursache von BUG-16, behebt BUG-20); `lastJogMillis` wird vor dem Start gesetzt (BUG-23); Kommentare korrigiert. **Doku `8b33168`:** PROJ-2 `design.md` (richtige BUG-16-Ursache, DIR-Umkehr, Zeitstempel), Stack-Pack-Beispiel mit Polarität (BUG-22). Firmware kompiliert und geflasht (`pio run -e esp32dev -t upload`, SUCCESS).
- **Protokollierter Nutzer-Test** — Checkliste an den Nutzer übergeben, Antwort „alles ok" für alle Punkte. Gerät: Android EB2103 (Debug-Build über Metro), Firmware-Stand `a763cb3`, ohne Neustart zwischen den Punkten:
  - [x] **AC-1** — Vorwärts/Rückwärts halten fährt in die richtige Richtung — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-1 / BUG-20** — kurzes Antippen direkt nach dem Verbinden bewegt den Slider sofort — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-2** — Loslassen stoppt sofort — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-3** — Regler während des Haltens ändert das Tempo direkt — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-4** — zweite Taste zusätzlich → Stopp — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **BUG-16** — Auto-Fahrt und Jog mehrfach im Wechsel, Jog springt jedes Mal an — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-5** — Bluetooth aus beim Joggen → Slider stoppt eigenständig — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-6** — App im Hintergrund/geschlossen beim Joggen → Stopp nach etwa 1 s — vom Nutzer am Gerät bestätigt, 2026-09-30
  - [x] **AC-7** — nicht verbunden → Jog-Tasten nicht bedienbar — vom Nutzer am Gerät bestätigt, 2026-09-30
- Einschränkung: Anzahl der Durchläufe nicht protokolliert; EC-1 (Finger herausziehen), EC-5 (Reconnect) nicht separat abgefragt. Der Fix `a763cb3` ist noch nicht durch einen unabhängigen `qa-engineer`-Lauf geprüft.
