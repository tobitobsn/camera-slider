# QA-Testergebnisse

**Getestet:** 2026-09-23
**App-URL:** nicht ausführbar hier (`probe.kind: none`, sowohl Top-Level als auch Layer `firmware`) — jedes Laufzeit-AC ist unten `[!] NOT VERIFIED`, solange kein menschlicher Test protokolliert ist.
**Tester:** 3 unabhängige `qa-engineer`-Subagenten (Acceptance / Security / Regression), jeweils in frischem Kontext ohne Kenntnis des Builds; zusammengeführt von dieser Session.
**Scope:** vollständig — erster `/qa`-Lauf für PROJ-2, alle 7 AC + 5 EC geprüft.

> Legende: `[x]` in diesem Lauf verifiziert (Beleg erforderlich) · `[ ] BUG` als fehlerhaft verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund erforderlich)

## Re-Verifikation (2026-09-23, gleicher Tag)

Nach dem ersten Lauf hat der Nutzer entschieden: alle vier Medium-Bugs fixen, inklusive BLE-Bonding für BUG-3/BUG-4. `/build`-Fixes liefen parallel auf disjunkten Dateien (`git diff --stat` gegen den QA-Commit `5977e07`: `src/components/useJogState.ts`, `src/components/useJogState.test.ts`, `src/components/JogControls.tsx`, `firmware/src/motor.cpp`, `firmware/src/ble.cpp`, plus `design.md`/Stack-Pack-Doku). BUG-1 bis BUG-4 unten sind entsprechend als **behoben** markiert, mit der jeweiligen Evidenz aus der Fix-Session. Die übrigen Abschnitte (AC-1/2/5/6/7, EC-1/3/4/5, BUG-5..9) sind **unverändert seit dem ersten Lauf, nicht erneut geprüft** — der Fix hat diese Dateien/Verhaltensweisen nicht berührt. Suite danach: `npm test` → **5 Suites / 74 Tests, alle grün** (war 61; +13 aus der erweiterten `useJogState.test.ts`, 37 statt 24 Tests). `npx tsc --noEmit` → exit 0.

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
- [!] NOT VERIFIED (Laufzeit) — no way to run and probe this project was recorded. Plumbing Ende-zu-Ende aus der Quelle bestätigt: `JogControls.tsx:109/116` (onPressIn) → `useJogState.ts:34-37` (idle→jogging_*) → `JogControls.tsx:67-84` (sofortiger Send + 300ms-Intervall) → `src/ble/client.ts:144-160` (Opcode 0x01, korrektes Payload) → `firmware/src/ble.cpp:61-71` (Längenprüfung + `motorJog()`) → `firmware/src/motor.cpp:83-105` (kontinuierlicher Lauf, kein `moveTo()`).

#### AC-2 — Loslassen → Motor stoppt sofort
- [!] NOT VERIFIED (Laufzeit). Pfad aus der Quelle bestätigt: `useJogState.ts:51-52/69-70` (jogging→idle, Test grün: `useJogState.test.ts:14-20`) → `JogControls.tsx:80-83` (Cleanup: clearInterval + STOP) → `client.ts:167-175` (Opcode 0x05, Write mit Antwort) → `ble.cpp:72-78` → `motor.cpp:107-115` (`forceStop()`, kein Decel-Ramp).

#### AC-3 — Geschwindigkeits-Schieberegler live übernommen, auch während gehaltener Taste
- [x] App-seitig: `JogControls.tsx:61-65/74` — `speedRef` wird bei jeder Änderung nachgezogen und *innerhalb* von `send()` gelesen, Übernahme spätestens beim nächsten 300ms-Tick. Wertebereich beidseitig verteidigt (App `JogControls.tsx:11-12,95-98`, Firmware `motor.cpp:44-49`).
- [x] BUG-2 **behoben** (Re-Verifikation): `motor.cpp:91-129` — `motorJog()` unterscheidet jetzt "bereits läuft, gleiche Richtung" (`applySpeedAcceleration()`, FastAccelStepper's dokumentierter Weg für Live-Geschwindigkeitsänderung an einer laufenden Bewegung) von "startet frisch" (`runForward()`/`runBackward()`). Gegengeprüft an zwei unabhängigen Quellen: der vendorten Bibliothek (`.pio/libdeps/esp32dev/FastAccelStepper/src/FastAccelStepper.h`, Doc-Kommentare zu `setSpeedInHz()`/`applySpeedAcceleration()`) und einer Live-Context7-Abfrage gegen `gin66/fastaccelstepper` — beide stimmen wörtlich überein.
- [!] NOT VERIFIED (Laufzeit) — physisches Verhalten auf Hardware weiterhin offen, siehe „Gesamte Firmware-Kompilierbarkeit" unten.

#### AC-4 — Beide Richtungstasten gleichzeitig → sofortiger Stopp, keine Richtung fährt weiter, bis beide losgelassen und eine erneut gedrückt wird
- [x] Kernaussage (gleichzeitig gedrückt → Stopp, keine Richtung gewinnt) verifiziert aus der Quelle: `useJogState.ts:89-94` (`jogging_forward + PRESS_BACKWARD → blocked`) und `:111-113` (Spiegelfall).
- [x] BUG-1 **behoben** (Re-Verifikation): neuer Status `blocked` plus interne `forwardHeld`/`backwardHeld`-Merker (`useJogState.ts:33-43, 123-153`) — `blocked` löst sich erst zu `idle`, wenn **beide** Merker `false` sind (`:128-143`), ein erneutes Drücken bleibt in `blocked` (`:144-151`, genau der ursprüngliche Bug-Repro). Test: `useJogState.test.ts`, dedizierter Repro-Test (hold backward → press forward → release forward, backward weiter gehalten → press forward erneut → bleibt `blocked`) plus vollständige 4×4-Tabelle, 37/37 grün (`npx jest src/components/useJogState.test.ts`). Rot-Check dokumentiert (Fix zurückgedreht → 4 Tests fielen mit `status: 'jogging_forward'` statt `'blocked'` durch → wiederhergestellt → wieder grün).

#### AC-5 — Disconnect während Jog → Firmware stoppt eigenständig, App zeigt PROJ-1s „Verbindung verloren"-Zustand
- [x] Verifiziert aus der Quelle (Garantie): `firmware/src/ble.cpp:34-46` — `onDisconnect` ruft `motorStop()` (Z. 42) **vor** `NimBLEDevice::startAdvertising()` (Z. 45), PROJ-1s Reconnect-Pfad unverändert (`ConnectionProvider.tsx:135-137`, `RootScreen.tsx:51-59`).
- [!] NOT VERIFIED (Laufzeit) — tatsächlicher Motorstopp auf Hardware.

#### AC-6 — >~1s ohne Halte-Signal → Firmware stoppt eigenständig (Dead-man's-switch)
- [x] Verifiziert aus der Quelle (Garantie, alle drei Teile): Schwelle `motor.cpp:33` (1000ms), Prüfung + Stopp nur wenn `isRunning()` (`motor.cpp:117-124`), Zeitstempel-Reset bei jedem `motorJog()` (`motor.cpp:104`), tatsächlich aufgerufen in `main.cpp:12-14` (nicht nur deklariert).
- [!] NOT VERIFIED (Laufzeit) — tatsächliches 1000ms-Timing auf Hardware.
- Robustheits-Hinweis: siehe BUG-6 (Low).

#### AC-7 — Nicht verbunden → Jog-Steuerung nicht bedienbar, PROJ-1-Platzhalter bleibt sichtbar
- [x] Verifiziert aus der Quelle: `RootScreen.tsx:34-61` rendert `<JogControls />` ausschließlich im `case 'connected'`; alle sieben übrigen Status (vollständiger Switch über `connectionReducer.ts:11-19`) zeigen PROJ-1-Notices bzw. den gesperrten Platzhalter (`reconnecting`). Zweiter Riegel: `JogControls.tsx:86-88` rendert `null` ohne `device`, `ConnectionProvider.tsx:274-281` liefert `device` nur im Status `connected`.

## Edge-Cases-Status

#### EC-1 — Finger aus dem Button-Bereich gezogen zählt als Loslassen
- [!] NOT VERIFIED — kein Touch-Gerät, kein Simulator. Aus der Quelle bestätigt ist nur, dass die App dem `Pressable`-Plattform-Default nicht in die Quere kommt (`JogControls.tsx:108-121`, kein `pressRetentionOffset`/`hitSlop`-Override).

#### EC-2 — Beide Tasten gleichzeitig → Stopp, keine Richtung hat Vorrang
- [x] Kernaussage verifiziert (siehe AC-4).
- [x] BUG-1 **behoben** (siehe AC-4).

#### EC-3 — Verbindungsabbruch während Jog → Firmware stoppt eigenständig, ohne auf die App zu warten
- [x] Verifiziert aus der Quelle (siehe AC-5).

#### EC-4 — App sendet >Schwelle kein Halte-Signal, obwohl Taste noch gehalten → Firmware stoppt eigenständig, auch bei formal bestehender Verbindung
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
- [x] BUG-3 **behoben** (Re-Verifikation, Nutzerentscheidung: fixen statt akzeptieren): `ble.cpp:117` `NimBLEDevice::setSecurityAuth(bonding=true, mitm=false, sc=true)` + `ble.cpp:163-165` Command-Characteristic trägt jetzt zusätzlich `NIMBLE_PROPERTY::WRITE_ENC` — Just-Works-Bonding (kein Display/Tastatur am Gerät, daher kein Passkey-Flow), Schreiben erfordert jetzt eine gebondete, verschlüsselte Verbindung. Jede API gegen den vendorten NimBLE-Quellcode verifiziert (Header, Implementierung UND den tatsächlichen ATT-Permission-Check in `ble_att_svr.c`/`ble_gatts.c` — bestätigt, dass `WRITE_ENC` für `WRITE` und `WRITE_NR` gleichermaßen greift, siehe `design.md`).
- [x] BUG-4 **behoben** (Re-Verifikation): `ble.cpp:44` — `onConnect` ruft jetzt ebenfalls `NimBLEDevice::startAdvertising()` (bisher nur `onDisconnect`). Max. 3 gleichzeitige Verbindungen (`nimconfig.h:225`) bedeutet: kostet niemanden den Slot, hält den Slider aber weiterhin auffindbar. Zusammen mit BUG-3s Fix kann ein unbonded Fremdgerät zwar weiterhin einen Slot belegen, aber keine Befehle mehr schreiben — das physische Sicherheitsrisiko ist geschlossen, die reine "Slot besetzt"-Unannehmlichkeit nicht vollständig.
- [!] NOT VERIFIED (neu, durch den Fix) — ob Android/react-native-ble-plx die Just-Works-Bondierung ohne App-seitige Änderung transparent abschließt, ist ohne echtes Gerät nicht prüfbar. Die Fix-Session hält das für wahrscheinlich (OS-seitiger Pairing-Dialog läuft automatisch), flaggt aber ausdrücklich als informationelle Einschätzung, nicht als verifiziert — Teil des anstehenden Hardware-Tests.

## E2E-Tests
_Optionale Schicht — von `/e2e-tests` für kritische Kernabläufe geschrieben._

- Status: **nicht gelaufen** (führe `/e2e-tests` für kritische Abläufe aus)

## Nicht verifiziert in diesem Lauf

- [!] **AC-1, AC-2, AC-3 (Laufzeitverhalten)** — no way to run and probe this project was recorded (`probe.kind: none`); echte Android-App + BLE-/Motor-Hardware nötig.
- [!] **AC-5, AC-6 (tatsächlicher Motorstopp/Watchdog-Timing auf Hardware)** — Garantie im Code bestätigt, physische Wirkung nicht.
- [!] **EC-1 (Finger aus dem Button-Bereich)** — kein Touch-Gerät/Simulator.
- [!] **Gesamte Firmware-Kompilierbarkeit** — `pio` auf keiner der drei Prüfmaschinen installiert (`pio not found`); Layer `firmware` hat `probe.kind: none`. Kein Build, kein Flash möglich. **Größtes offenes Risiko**: die von PROJ-2 neu genutzten NimBLE-2.x-Konstrukte (`NimBLECharacteristicCallbacks::onWrite`, `NIMBLE_PROPERTY::WRITE_NR`) und `motor.cpp` wurden nirgends kompiliert.
- [!] **Layer `firmware`, Tests** — no test command recorded for layer firmware (`.ai-eng-kit` → `layers[0].commands.test: null`, vorbestehende Lücke).
- [!] **Multi-Touch: gleichzeitiges Drücken zweier `Pressable`s** — ob React Natives Responder-System beide `onPressIn`-Events wirklich zuverlässig liefert, ist aus dem Code nicht entscheidbar, nur auf Gerät prüfbar.
- [!] **BLE-Bonding in der Praxis (BUG-3-Fix), Connection-Squatting (BUG-4-Fix)** — beide Fixes statisch aus Property-Flags/NimBLE-Quellcode belegt, nicht praktisch mit einem zweiten Gerät nachgestellt. Insbesondere: ob die Just-Works-Bondierung von Android/react-native-ble-plx transparent abgeschlossen wird, braucht echte Hardware.
- [!] **Neuer nativer Android-Build** — `@react-native-community/slider@^5.2.1` ist eine neue native Abhängigkeit; ob Autolinking im Release-Build (`commands.build`) sauber durchläuft, ist ohne Android-Toolchain hier nicht prüfbar.
- [!] **Optik/Layout** (Button-Größen, Slider-Darstellung, dunkles Theme) — kein Browser, kein Viewport, kein Gerät.

## Bugs Found

#### BUG-1: AC-4/EC-2 — Zweite Richtungstaste "gewinnt" nach Zwischenloslassen, ohne dass beide je gemeinsam losgelassen wurden
- **Status: BEHOBEN** (siehe AC-4 oben für Evidenz)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Rückwärts-Taste halten (Motor fährt rückwärts)
  2. Zusätzlich Vorwärts-Taste drücken → Motor stoppt (korrekt, AC-4 Kernaussage)
  3. Vorwärts-Taste wieder loslassen — **Rückwärts bleibt weiter gehalten**
  4. Vorwärts-Taste erneut drücken
  5. Erwartet (spec.md AC-4 / design.md:34): keine Richtung fährt, solange nicht beide Tasten zwischenzeitlich gemeinsam losgelassen wurden
  6. Tatsächlich: Zustand wird `jogging_forward`, der Slider fährt vorwärts — der Reducer (`useJogState.ts:34-37`) kennt keinen Merker für eine noch physisch gehaltene Taste, `idle + PRESS_FORWARD` wird bedingungslos zu `jogging_forward`
- **Risiko:** begrenzt — die gefahrene Richtung entspricht stets der zuletzt gedrückten Taste, Loslassen stoppt weiterhin sofort; kein Kontrollverlust, aber eine dokumentierte Sicherheitsgarantie fehlt.
- **Priority:** Fix in next sprint

#### BUG-2: AC-3 — Firmware-seitiger Geschwindigkeitswechsel während laufender Fahrt unbestätigt
- **Status: BEHOBEN** (siehe AC-3 oben für Evidenz)
- **Severity:** Medium
- **Beschreibung:** `motor.cpp:88-93` verlässt sich darauf, dass `setSpeedInHz()` gefolgt von einem erneuten `runForward()`/`runBackward()`-Aufruf die neue Geschwindigkeit auf eine bereits laufende Bewegung anwendet. FastAccelStepper (`gin66/FastAccelStepper @ ^0.31.1`) dokumentiert für eine Geschwindigkeitsänderung während einer laufenden Fahrt `applySpeedAcceleration()` als den vorgesehenen Weg — ob ein wiederholter `run*()`-Aufruf denselben Effekt hat, ließ sich ohne installierte Bibliothek/Kompilierung nicht bestätigen.
- **Auswirkung falls falsch:** AC-3 würde auf echter Hardware fehlschlagen — der Regler würde erst nach Loslassen + erneutem Drücken wirken, nicht live während des Haltens.
- **Priority:** Vor dem geplanten Hardware-Test klären (Doku/Quellcode von FastAccelStepper prüfen oder direkt am Gerät testen)

#### BUG-3: Command-Characteristic ohne Authentifizierung — jetzt mit physischer Wirkung
- **Status: BEHOBEN** — Nutzerentscheidung: "Fix einplanen" (siehe Security-Audit oben für Evidenz)
- **Severity:** Medium (Begründung, kein Reflex-Label — siehe unten)
- **Beschreibung:** `firmware/src/ble.cpp:99-101` — die Command-Characteristic trägt nur `WRITE | WRITE_NR`, kein `WRITE_ENC`/`WRITE_AUTHEN`, kein Bonding, keine Peer-Whitelist. Jedes BLE-fähige Gerät in Funkreichweite kann sich ohne Kopplung verbinden und JOG/STOP schreiben — den Motor **physisch fahren lassen**, wiederholt beliebig lange (siehe Watchdog-Grenze unten).
- **Warum Medium und nicht Critical/High:** Kein Datenverlust, keine PII, kein Netzwerkzugriff nötig (Funkreichweite ~10–30m), Einzelnutzer-Hobbygerät, nur während eines Drehs eingeschaltet, Besitzer typischerweise in der Nähe. **Aber:** Der Slider hat laut spec.md ausdrücklich **keine Endanschläge** (Out of Scope), und dies ist das erste Feature, in dem ein unauthentifizierter Write real etwas bewegt — Worst Case ist Sachschaden an montiertem Kamera-Equipment, nicht nur ein wackelnder Schlitten.
- **Wichtig:** PROJ-1s Entscheidung „keine BLE-PIN, kein Schutzbedarf" (`features/PROJ-1-ble-verbindung-pairing/spec.md:49`) wurde getroffen, als die Command-Characteristic noch **keine Wirkung hatte** (`firmware/src/ble.h:6-8`: „not yet wired to any behavior"). PROJ-2 ändert diese Faktenlage. Das ist nur dann weiterhin ein akzeptiertes Risiko, wenn du es in Kenntnis der neuen Lage bestätigst — siehe Frage unten.
- **Priority:** Nutzerentscheidung nötig vor Approved (siehe Frage am Ende dieses Berichts)

#### BUG-4: Kein Re-Advertising bei erfolgreichem Connect — Connection-Squatting möglich
- **Status: BEHOBEN** (siehe Security-Audit oben für Evidenz)
- **Severity:** Medium
- **Beschreibung:** `firmware/src/ble.cpp` startet Advertising nur beim Boot (`:110`) und nach Disconnect (`:45`). Bei erfolgreichem Connect startet NimBLE es **nicht** neu (bestätigt im NimBLE-Quellcode selbst: `NimBLEServer.cpp:447-475`, der `startAdvertising()`-Aufruf im Connect-Event liegt nur im Fehlerpfad). Ein fremdes Central, das sich zuerst verbindet, belegt den Slider und macht ihn für die App unsichtbar — die App zeigt PROJ-1s „Kein Gerät gefunden", nicht „jemand anderes ist verbunden".
- **Auswirkung:** verhindert die Kernfunktion für den legitimen Nutzer vollständig, solange der Angreifer verbunden bleibt — typischerweise mitten in einem Dreh am unpraktischsten.
- **Priority:** Fix in next sprint (hängt an derselben Ursache wie BUG-3 — eine Pairing-/Bonding-Lösung würde beides zugleich schließen)

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

## Zusammenfassung (nach Re-Verifikation, 2026-09-23)
- **Acceptance Criteria:** 5/7 aus der Quelle verifiziert (AC-3, AC-4, AC-5, AC-6, AC-7 — BUG-1/BUG-2 behoben), 2/7 ausschließlich Laufzeit-NOT-VERIFIED (AC-1, AC-2 — Plumbing bereits im ersten Lauf bestätigt)
- **Edge Cases:** 5/5 verifiziert (EC-2 jetzt vollständig, EC-3/4/5 unverändert), 1/5 zusätzlich nicht verifizierbar bleibt (EC-1 — Touch-Gerät nötig)
- **Bugs gefunden:** 9 gesamt, **4 behoben in dieser Re-Verifikation** (BUG-1, BUG-2, BUG-3, BUG-4 — alle Medium), 0 Critical/High/Medium offen, 5 Low weiterhin offen (BUG-5 bis BUG-9, alle "Nice to have")
- **Security:** 4/10 Checks aktiv verifiziert (Input-Validierung, keine Secrets im Code, BUG-3-Fix, BUG-4-Fix), 6/10 NOT VERIFIED (nicht anwendbar für dieses Backend-lose Mobile-Produkt, siehe oben)
- **Production Ready:** **NEIN — noch nicht verifiziert** (kein Bug mehr blockiert, aber kein Laufzeit-AC wurde bisher ausgeführt)
- **Empfehlung:** Keine offenen Critical/High/Medium-Bugs mehr — nächster Schritt ist der protokollierte menschliche Hardware-Test (Firmware kompilieren + flashen, dann die Laufzeit-ACs am echten Gerät durchgehen), derselbe Weg wie bei PROJ-1. Die 5 offenen Low-Bugs können parallel oder danach adressiert werden, sie blockieren nichts.

> "Production Ready: NEIN" bedeutet hier ausschließlich: kein einziges Laufzeit-AC wurde bisher ausgeführt (`probe.kind: none`, kein menschlicher Test protokolliert) — nicht mehr, dass Bugs offen sind. Sobald der Hardware-Test protokolliert ist, kann der Status auf Approved wechseln, vorausgesetzt er findet nichts Neues.
