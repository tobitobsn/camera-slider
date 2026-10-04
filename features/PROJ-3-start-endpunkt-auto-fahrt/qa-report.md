# QA Test Results

**Tested:** 2026-10-02 (Re-Verifikation 4: Fixes für BUG-68, BUG-69 und BUG-70 aus `2465c41` und `00fd14b`)
**App URL:** hier nicht ausführbar (`probe.kind: none`, sowohl App-Ebene als auch Layer `firmware`). Der letzte protokollierte Gerätetest stammt vom 2026-10-02 (Abschnitt „Gerätetest“ in Re-Verifikation 2) und ist **älter als dieser Diff**.
**Tester:** QA Engineer (AI). Eine unabhängige `qa-engineer`-Lane ohne Build-Kontext mit allen drei Scopes (Step 2 → 3 → 4), zusammengeführt vom Owner.
**Scope:** **Re-Verifikation, Breite = Diff.** Der letzte Report kam aus `ce63f1e`. Diff-Befehl: `git diff --stat ce63f1e..HEAD` (HEAD `00fd14b`). Geänderte Produktionsdateien:
- `src/components/useVideoCamera.ts` (+25)
- `src/components/useVideoDrive.ts` (+4/−2)
- `src/components/videoFormats.ts` (+23)

Dazu die zugehörigen Tests, `design.md` und `features/INDEX.md`. Unverändert sind `firmware`, `src/ble`, `src/connection`, `src/screens`, `android`, `package*.json`, `useCameraCapture.ts`, `TimelapseControls.tsx`, `useTimelapseSequence.ts`, `AutoDriveControls.tsx`, `VideoPanel.tsx` und `useVideoSettings.ts` (`git diff --stat ce63f1e..HEAD -- <Pfade>` leer). Drei Produktionsdateien, kein geteilter Code → eine Lane. Release-Build: `skipped` (Lane ohne Build; `android/` und Abhängigkeiten unverändert).

> Legende: `[x]` = in diesem Lauf geprüft (mit Beleg) · `[ ] BUG` = als fehlerhaft festgestellt · `[!] NOT VERIFIED` = in diesem Lauf nicht prüfbar (mit Grund)
>
> **Wichtig:** Ein `[x]` heißt hier „im Code, in den Bibliotheksquellen und in den Unit-Tests erfüllt“. Am echten Handy und Slider wurde nichts ausgeführt.

## Re-Verifikation 4 (2026-10-02, nach `00fd14b`)

### Automatisierte Tests (Step 5)

- [x] `npm test` (einmal vom Owner vor der Lane, Log `scratchpad/suite-run-4.log`): 22 Suites, **347 passed, 0 failed**.
- [!] Layer `firmware`: NOT VERIFIED, no test command recorded for layer firmware. `firmware/` ist im Diff unverändert.
- E2E-Suite: keine vorhanden, nicht ausgeführt.

### Status der offenen Bugs

**BUG-68 (Medium, AC-25): [x] im Code geschlossen, am Gerät nicht bestätigt**
- Abgelöste Messungen werden still ignoriert: `isFocusCancelled` (`useVideoCamera.ts:98-100`), angewandt in `:239-243`. Die geprüften Texte stimmen mit CameraX 1.7.0-alpha03 überein („Cancelled by another startFocusAndMetering()“, „Cancelled by cancelFocusAndMetering()“, `FocusMeteringControl.class` per `javap`). „Auto“ ruft `resetFocus` → `cancelFocusAndMetering` (`HybridCameraController.kt:185-191`).
- Kein Stacktrace mehr in Meldungen: `describeError` gibt nur die erste Zeile weiter (`useVideoCamera.ts:89-92`, gleich in `useVideoDrive.ts:80-83`).
- Eine gelungene Sperre räumt eine frühere „Fokus konnte nicht gesperrt werden“-Meldung ab (`useVideoCamera.ts:235-238`).
- Rest (Low, kosmetisch): Bei echten nativen Fehlern bleibt der Java-Klassenname in der ersten Zeile stehen, z. B. „Fokus konnte nicht gesperrt werden: java.lang.IllegalStateException: Foo bar“ (Lane-Probe P4). Die neuen Tests nutzen Messages ohne Klassen-Präfix.
- Ursache des zweiten Fokus-Aufrufs weiter ungeklärt. Der Fix hängt davon bewusst nicht ab (`design.md`).
- [!] Ein Tipp am OnePlus Nord CE ohne Meldung: NOT VERIFIED, no way to run and probe this project was recorded.

**BUG-70 (Medium, AC-23): [x] im Code geschlossen für die Konstellation des Galaxy S24**
- `videoFormats.ts:55`, `:75-80`, `:86-88`: `dual/dual-wide/triple/quad` gelten als Weitwinkel. Die Typisierung passt zur Bibliothek (`CameraInfo+deviceType.kt:17-24`).
- Test `videoFormats.test.ts:79` (S24): Weitwinkel = Kamera `0` (triple), Ultraweitwinkel = Kamera `2`. Die Auswahl erscheint ab zwei Objektiven (`VideoPanel.tsx:166`).
- Die App setzt keinen Zoom (grep `zoom` in `src`: 0 Treffer), CameraX startet mit 1.0 = Hauptlinse der logischen Kamera.
- Keine Duplikate, höchstens ein Gerät pro Objektivtyp (`:89-92`). Front-Multi-Kameras sind ausgeschlossen (`:72`).
- **Nebenwirkung:** Meldet ein Gerät eine einzelne Weitwinkel-Kamera **und** eine logische Multi-Kamera, bietet die App die einzelne nicht mehr an (`videoFormats.ts:86-88`, Lane-Probe P9). Das ist laut Commit eine Nutzerentscheidung vom 2026-10-02. Ob das **Hauptgerät OnePlus Nord CE** so eine Kamera meldet, ist offen. Falls ja, nimmt dort jetzt eine andere Kamera auf als im Gerätetest, und AC-22 bis AC-25 müssen dort neu bestätigt werden.
- [!] Auswahl am Galaxy S24, Verhalten am Nord CE: NOT VERIFIED, no way to run and probe this project was recorded.

**BUG-69 (Low, AC-25): [ ] weiter offen, auf dem Standardobjektiv nur umgangen**
- `lockAt` prüft weiter nur `supportsFocusMetering` (`useVideoCamera.ts:226-229`, nicht im Diff). Auf dem S24 trifft es jetzt die Ultraweitwinkel-Kamera, die durch den BUG-70-Fix auswählbar geworden ist (laut `design.md` ohne AF). `design.md` bestätigt: „Spec-Frage aus BUG-69, nicht entschieden“.

### Acceptance Criteria (Code im Diff)

- [x] **AC-15**: Nur der Text der Fehlermeldung hat sich geändert (`useVideoDrive.ts:215`), der Speicherpfad ist unverändert.
- [x] **AC-17**: Der Stopp-Pfad nutzt `describeError` nicht und ist unverändert.
- [x] **AC-18**: Startfehler `useVideoDrive.ts:362-368`, Recorder-Abbruch `:275`, BLE-Fehler beim Fahrt-Start `:298`, jeweils mit erster Zeile. Test `useVideoDrive.test.ts:311`. Kante siehe BUG-74.
- [x] **AC-22**: Auf Multi-Geräten kommen die Formate jetzt von der logischen Kamera. Die Abfrage läuft mit der neuen ID neu (`useVideoCamera.ts:119-127`), die Logik ist unverändert. [!] Ob das S24 dort 1080p/30 meldet: NOT VERIFIED.
- [x] **AC-23**: siehe BUG-70. Vertragslücke Tele per Zoom: siehe BUG-75. [!] Ob die logische Kamera intern die Linse wechselt (Makro, wenig Licht): NOT VERIFIED.
- [x] **AC-24**: Code unverändert (`videoFormats.ts:180-182`). Auf Multi-Geräten entscheidet jetzt die logische Kamera, ob der Schalter erscheint. [!] Laufzeit NOT VERIFIED.
- [x] **AC-25**: Sperre mit `adaptiveness: 'locked'`, `autoResetAfter: null` (`useVideoCamera.ts:234`, Test `useVideoCamera.test.ts:293`). Gegenproben der Lane: Tipp, Tipp → der zweite zählt (Test `:356`). Tipp, dann Unmount → 0 `console.error` (P8). Andere Meldungen als der Fokusfehler bleiben stehen (`:237`). Offen: BUG-69, BUG-72, BUG-73.
- [x] **AC-26**: Gemerkt wird der Objektivtyp, keine Geräte-ID (`useVideoSettings.ts:35`, `:79`). Ein gemerktes „wide“ landet jetzt auf der logischen Kamera, ein nicht verfügbares „tele“ fällt auf „wide“ zurück (`effectiveLens`, `videoFormats.ts:100-106`, P9). Fokus-Sperre beim Objektivwechsel zurückgesetzt (`useVideoCamera.ts:186-190`).
- [x] **AC-28**: unverändert, die Sperre liegt im Panel (`VideoPanel.tsx`, nicht im Diff).
- [x] **EC-8**: Presets berühren keine Video-Einstellungen (grep `lens|videoSettings|useVideo` in `usePresets.ts` leer).
- Alle anderen AC und EC (AC-1 bis AC-14, AC-16, AC-19 bis AC-21, AC-27, AC-29, EC-1 bis EC-7, EC-9, EC-10): unverändert seit Re-Verifikation 2 und dem Gerätetest vom 2026-10-02, **in diesem Lauf nicht neu geprüft** (der Diff berührt ihre Pfade nicht, nur den Meldungstext über `describeError`).
- [!] Alle Laufzeitprüfungen der AC oben: NOT VERIFIED, no way to run and probe this project was recorded.

### Security (Diff-Bereich)

- [x] Keine Secrets, kein Netzwerk, kein Logging im Diff: `git diff ce63f1e..HEAD -U0 | grep "^+" | grep -ciE "api[_-]?key|secret|token|passw|bearer|BEGIN .*KEY|AKIA|sk_live|ghp_|console\.|fetch\(|http"` → 0.
- [x] Keine neue Eingabestrecke: Tipp-Koordinaten unverändert über `VideoPanel.tsx:55` → `focusTo`, nativ geprüft (`HybridCameraController.kt:145-147`). Die Objektiv-Zuordnung verarbeitet nur Geräte-Metadaten. Abhängigkeiten und Manifest unverändert.
- [x] Weniger Informationsabfluss: keine nativen Stacktraces mehr in Fokus-, Kamera- und Fahrt-Meldungen (`useVideoCamera.ts:89-92`, `useVideoDrive.ts:80-83`, Tests `useVideoCamera.test.ts:373`, `useVideoDrive.test.ts:311`).
- [!] Authentication, Authorization, Injection gegen Endpoints, Rate Limiting, Brute Force/Enumeration, API-Responses, Credentials in der URL: NOT VERIFIED, nicht anwendbar (kein Login, kein Backend, keine Endpoints). Keine `[user]`-Tasks (`tasks.md`).
- [!] Release-Bundle nach Secrets durchsuchen: NOT VERIFIED, in diesem Lauf nicht gebaut.

**Security-Zusammenfassung:** 3 Prüfungen mit Beleg (alle PASS), 8 NOT VERIFIED (7 nicht anwendbar, Release-Bundle nicht gebaut).

### Regression

- [x] Suite 347/347 grün (`scratchpad/suite-run-4.log`), darunter die Suites von PROJ-1, 2, 4, 5 und 6.
- [x] PROJ-5: nutzt `useCameraDevice('back')` (`useCameraCapture.ts:55`), weder `availableLenses` noch `useVideoCamera`. Dateien nicht im Diff.
- [x] PROJ-1, PROJ-2, PROJ-6: einzige Berührung ist der Meldungstext bei einem BLE-Fehler beim Fahrt-Start (`useVideoDrive.ts:298`). Verbindungs-, Jog- und Schutz-Stopp-Pfade unverändert.
- [x] PROJ-4: keine Kopplung an Objektiv oder Video-Einstellungen (EC-8 oben).
- [x] Einziger Laufzeit-Verbraucher der geänderten Hooks: `RootScreen.tsx:72`.
- [!] Laufzeit der Deployed-Features: NOT VERIFIED, no way to run and probe this project was recorded.

### Step 6: Unit-Tests

- Keine neuen Tests vom Owner. Die Fixes bringen eigene Tests mit, und die Lane hat per Einzeldatei bewiesen, dass sie rot werden können:
  - `videoFormats.ts` auf `ce63f1e` zurückgesetzt → `videoFormats.test.ts`: 6 failed (`:44`, 4× `:70`, `:79`).
  - `useVideoDrive.ts` zurückgesetzt → `useVideoDrive.test.ts`: 1 failed (`:311`).
  - `useVideoCamera.ts` zurückgesetzt → `useVideoCamera.test.ts`: 3 failed (`:356`, `:373`, `:391`). Mutation „Abbruch-Guard entfernt“: nur `:356` rot. Mutation „Abräumen bei Erfolg entfernt“: nur `:391` rot.
  - Danach zurückgesetzt, `git status --short` leer.
- Die Lücken der Tests (Auto während einer laufenden Messung, erste Zeile mit Klassen-Präfix, abgebrochene Messung wegen inaktiver Kamera) sind die neuen Bugs unten. Tests dafür gehören zum Fix in `/build`.

### E2E Tests

- Status: **not run** (run `/e2e-tests` for critical flows)

### Not Verified In This Run

- [!] Alle Laufzeitprüfungen (AC-15, 17, 18, 22 bis 26 am Gerät, BUG-68 am Nord CE, BUG-70 am S24): no way to run and probe this project was recorded.
- [!] Ob das OnePlus Nord CE eine logische Multi-Kamera meldet und dort jetzt eine andere Kamera als „Weitwinkel“ gilt. Prüfbar per `adb shell dumpsys media.camera`. Davon hängt ab, ob der Gerätetest vom 2026-10-02 für AC-22 bis AC-25 dort noch gilt.
- [!] Formate und Stabilisierung der logischen Kamera des S24 (AC-22, AC-24), stabiler Verbleib auf der Hauptlinse (AC-23).
- [!] Format der JS-Fehlermeldung von Nitro (Klassen-Präfix): abgeleitet aus dem Screenshot zu BUG-68, in der C++-Quelle nicht gefunden.
- [!] Layer `firmware`: no test command recorded.
- [!] Security: siehe oben.

### Neue Bugs

#### BUG-72: Ein Tipp bei nicht aktiver Kamera wird still verschluckt, ohne Sperre und ohne Hinweis (AC-25)
- **Severity:** Low
- **Beleg:** Der Regex in `useVideoCamera.ts:98-100` trifft jede `OperationCanceledException`, nicht nur abgelöste Messungen. CameraX wirft dieselbe Klasse auch mit „Camera is not active.“ und „Focus/metering operation cancelled.“ (`FocusMeteringControl.class`, `javap`). Lane-Probe P3/P3b: keine Meldung, keine Sperre. Vor dem Fix erschien eine Meldung. Ein echter Fehler mit einem `Caused by: …OperationCanceledException`-Frame würde ebenfalls verschluckt, weil die ganze Message geprüft wird.
- **Steps to Reproduce (nicht ausgeführt):** „Video aufnehmen“ an, direkt nach einem Objektiv- oder Formatwechsel in die Vorschau tippen. Erwartet: Sperre oder Hinweis. Möglich: nichts passiert, eine alte Sperr-Markierung bleibt stehen.
- **Priority:** Nice to have. Nur die zwei Abbruch-Texte für abgelöste Messungen erkennen statt der ganzen Klasse.

#### BUG-73: „Fokus-Sperre wird von diesem Objektiv nicht unterstützt“ bleibt nach einer gelungenen Sperre auf einem anderen Objektiv stehen (AC-25)
- **Severity:** Low
- **Beleg:** Der Erfolgszweig räumt nur Meldungen mit `FOCUS_FAILED_PREFIX` ab (`useVideoCamera.ts:237`, Konstante `:86`), nicht `FOCUS_UNSUPPORTED_NOTICE` (`:84`, gesetzt in `:227`). Lane-Probe P7: Schloss und „nicht unterstützt“ gleichzeitig sichtbar. Erst durch den BUG-70-Fix erreichbar, weil auf dem S24 jetzt ein Objektiv ohne AF wählbar ist. Gleiche Familie wie BUG-61.
- **Steps to Reproduce:** Galaxy S24 → „Ultraweitwinkel“ → tippen → „Weitwinkel“ → tippen.
- **Priority:** Fix in next sprint, zusammen mit BUG-69.

#### BUG-74: Fehlermeldung verliert den Grund, wenn die erste Zeile der nativen Message leer ist (AC-18)
- **Severity:** Low (theoretisch, kein solcher Fehler bekannt)
- **Beleg:** `useVideoCamera.ts:90-91`, `useVideoDrive.ts:81-82` nehmen `split('\n')[0]`. Lane-Probe P1: `'\nCamera is not ready'` wird zu „Unbekannter Fehler“. AC-18 verlangt eine Meldung „mit dem Grund“.
- **Steps to Reproduce:** nur per Unit-Test nachstellbar (Rejection mit führendem Zeilenumbruch).
- **Priority:** Nice to have. Erste nicht leere Zeile nehmen.

#### BUG-75: „Logische Multi-Kamera = Weitwinkel, Tele nur per Zoom wird nicht angeboten“ steht nur in `design.md`, nicht in der Spec (AC-23, Doku-Drift)
- **Severity:** Low
- **Beleg:** Der Decision Log in `design.md` hält die Entscheidung fest. `spec.md` ist im Diff unverändert, AC-23 nennt weiter „Tele“ als Beispiel. Auf dem S24 (drei Linsen) bietet die App zwei an. Der letzte Report hatte dafür `/refine PROJ-3` (AC-23) angekündigt. Ebenfalls nicht in der Spec: dass eine einzelne Weitwinkel-Kamera neben einer logischen nicht mehr angeboten wird.
- **Priority:** Fix in next sprint, per `/refine PROJ-3`.

### Gerätetest (recorded human test, offen)

Der Diff ändert Laufzeitverhalten von AC-18, AC-22 bis AC-26. Der Gerätetest vom 2026-10-02 lief vor dem Fix und kann diese AC für den neuen Stand nicht belegen. Offen sind:

1. **Nord CE, BUG-68:** „Video aufnehmen“ an, einmal in die Vorschau tippen. Erscheint das Schloss ohne Fehlermeldung?
2. **Nord CE, AC-23/AC-22:** Welche Objektive bietet die App jetzt an, gleich wie vorher? Nimmt „Weitwinkel“ mit 1080p/30 auf, wie vorher?
3. **Nord CE, AC-25:** Tippen, „Auto“, erneut tippen, dann eine Fahrt mit Video. Halten Fokus und Helligkeit?
4. **Galaxy S24, BUG-70/AC-23:** „Video aufnehmen“ an. Gibt es eine Auswahl Weitwinkel/Ultraweitwinkel? Zeigt die Vorschau jeweils das richtige Objektiv?
5. **Galaxy S24, AC-25:** Auf „Weitwinkel“ tippen. Erscheint das Schloss, ohne Meldung?
6. **Galaxy S24, AC-22/AC-24:** Wird 1080p/30 angeboten? Erscheint der Schalter „Stabilisierung“?
7. **Beide, AC-26:** Objektiv wählen, App neu starten. Ist es noch gewählt?

Optional für die Diagnose: `adb shell dumpsys media.camera` am Nord CE, damit klar ist, ob es eine logische Multi-Kamera meldet.

### Summary (Re-Verifikation 4)

- **BUG-68:** im Code geschlossen (Rot-Beweis per Revert), Gerät offen.
- **BUG-70:** im Code geschlossen für das S24 (Rot-Beweis per Revert), Gerät offen. Nebenwirkung auf Geräten mit einzelner und logischer Weitwinkel-Kamera.
- **BUG-69:** offen (Low, Spec-Frage).
- **Neue Bugs:** 4 Low (BUG-72 bis BUG-75). 0 Critical, 0 High, 0 Medium.
- **Security:** 3 mit Beleg (alle PASS), 8 NOT VERIFIED.
- **Regression:** keine gefunden (347/347, keine Kopplung an Deployed-Features außer Meldungstexten).
- **Production Ready:** **NOT READY — not verified.** Es gibt keine Critical-, High- oder Medium-Bugs mehr. Die geänderten Laufzeit-ACs (AC-18, AC-22 bis AC-26) sind aber seit dem Fix nicht ausgeführt worden, und der einzige Weg zu READY ist hier ein protokollierter Gerätetest (Liste oben). Der Status in `features/INDEX.md` bleibt **In Review**.

### Nachtrag Gerätetest (2026-10-04)

**Galaxy S24 (SM-S921B):** Der Nutzer meldet „alles ok, nur das Ultraweitwinkel unterstützt keine Fokussperre“. Installationsstand: Beim adb-Check am 2026-10-02 lief noch der Build von 12:56, also vor den Fixes. Beim Test war das Gerät nicht mehr angeschlossen, `lastUpdateTime` ist deshalb nicht neu ausgelesen. Dass die Objektivwahl erscheint, gibt es aber erst seit dem Fix `2465c41`. Damit lief beim Test ein Build mit dem Fix.

- [x] Punkt 4, **BUG-70/AC-23** (Auswahl Weitwinkel/Ultraweitwinkel, Vorschau zeigt das richtige Objektiv): verified by the user on Galaxy S24 (SM-S921B), 2026-10-04. **BUG-70 ist damit am Gerät geschlossen.**
- [x] Punkt 5, **AC-25** (Tippen auf „Weitwinkel“: Schloss ohne Meldung): verified by the user on Galaxy S24 (SM-S921B), 2026-10-04.
- [x] Punkt 6, **AC-22/AC-24** (1080p/30 angeboten, Schalter „Stabilisierung“ erscheint): verified by the user on Galaxy S24 (SM-S921B), 2026-10-04.
- [x] Punkt 7, **AC-26** (Objektiv über einen Neustart gemerkt): verified by the user on Galaxy S24 (SM-S921B), 2026-10-04.
- [ ] **BUG-69 am Gerät bestätigt:** Auf „Ultraweitwinkel“ gibt es keine Fokus-Sperre, also auch keine Belichtungssperre. Das entspricht dem erwarteten Verhalten aus BUG-69 (Low, Spec-Frage offen). Ob der Hinweis danach auf „Weitwinkel“ neben dem Schloss stehen bleibt (BUG-73), wurde nicht abgefragt.

**OnePlus Nord CE (EB2103):** Diagnose per `adb -s 345ef3cb shell dumpsys media.camera` (Ausgabe `scratchpad/nordce-camera.txt`).

- [x] **Nebenwirkung von BUG-70 betrifft das Nord CE nicht.** „Number of camera devices: 7“, davon „Number of normal camera devices: 3“. Normale Kameras: 0 (hinten, 4,73 mm, AF), 1 (vorne), 2 (hinten, 1,66 mm, ohne AF). Die Kameras mit `LOGICAL_MULTI_CAMERA` tragen alle zusätzlich `SYSTEM_CAMERA` (Zeilen 5068, 6694, 8304). Solche Kameras sind für normale Apps nicht sichtbar. Damit bleibt die Zuordnung dort Weitwinkel = Kamera 0 und Ultraweitwinkel = Kamera 2, wie im Gerätetest vom 2026-10-02.
- [!] Punkt 1, **BUG-68** (ein Tipp ohne Fehlermeldung) und Punkt 3, **AC-25** (Sperre hält während der Fahrt): noch nicht getestet. Die installierte App stammt von 2026-10-02 13:51:45 (`dumpsys package com.camerasliderapp`). Das ist nach `2465c41` (13:50), aber **vor** `00fd14b` (13:54), dem Fix für BUG-68. Für den Test muss erst die aktuelle Release-APK installiert werden.
- Punkt 2 (gleiche Objektive, gleiches Format): durch die Diagnose oben gedeckt, die Zuordnung ist unverändert. Am Gerät nicht neu abgefragt.

**Stand des Urteils:** weiterhin **NOT READY — not verified**. BUG-68 wurde am Nord CE beobachtet und muss dort mit dem aktuellen Build bestätigt werden (Punkte 1 und 3). `features/INDEX.md` bleibt **In Review**.

**Nord CE mit aktuellem Build (2026-10-04):** Die aktuelle Release-APK ist installiert (`adb -s 345ef3cb install -r …` → „Success“, `lastUpdateTime=2026-10-04 12:08:50`).

- [ ] **Punkt 3, AC-25: BUG.** Der Nutzer meldet: Nur die Helligkeit bleibt fest, der Fokus bleibt trotz Schloss auf Auto. Siehe **BUG-76**.
- [!] Punkt 1, **BUG-68** (Tipp ohne Fehlermeldung): noch nicht beantwortet.

#### BUG-76: Am Nord CE bleibt der Fokus trotz Schloss auf Dauer-Autofokus, nur die Belichtung ist gesperrt (AC-25)
- **Severity:** High. AC-25 ist auf dem Hauptgerät nicht erfüllt, denn der Fokus wird nicht festgehalten und kann während der Fahrt pumpen. Das Schloss zeigt eine Sperre an, die es für den Fokus nicht gibt. In der App gibt es keinen Workaround.
- **Beleg (live am Gerät, `adb -s 345ef3cb shell dumpsys media.camera`, 6 Stichproben hintereinander, alle gleich, Rohdaten `scratchpad/nordce-live.txt`):**
  - „Last request sent“ (das, was die App über CameraX anfordert): `afMode=AUTO`, `afTrigger=IDLE`, `aeLock=ON`. Das ist die Fokus-Sperre, wie CameraX sie umsetzt: Messung am Tipp-Punkt (`afRegions` 2241/926–2933/1446), danach AF-Modus AUTO ohne neuen Trigger, also ein fester Fokus.
  - „Latest received frame“ (was die Kamera tatsächlich macht): `afMode=CONTINUOUS_VIDEO`, `afState=PASSIVE_FOCUSED`, `aeLock=ON`, `aeState=LOCKED`.
  - Die Kamera-HAL des OnePlus übernimmt also die Belichtungssperre, ersetzt den angeforderten AF-Modus AUTO aber durch Dauer-Autofokus. `captureIntent` ist dabei `VIDEO_RECORD`.
  - App und Bibliothek fordern die Sperre korrekt an: `useVideoCamera.ts:234` (`adaptiveness: 'locked'`, `autoResetAfter: null`) → `HybridCameraController.kt:150-169` (`setLockingMode`, `disableAutoCancel`). Der Fehler liegt zwischen CameraX und der Hersteller-HAL. Im Diff dieses Laufs ist dieser Pfad nicht geändert.
  - `awbLock=OFF`: Der Weißabgleich wird nur über Regionen gemessen, nicht gesperrt. Er ist nicht Teil von AC-25, das nur Fokus und Belichtung verlangt.
- **Verhältnis zum Gerätetest vom 2026-10-02:** Dort hatte der Nutzer „Fokus und Helligkeit halten“ gemeldet. Der Fokus-Pfad ist seitdem unverändert. Der damalige Haken für AC-25 am Nord CE gilt damit als widerlegt, nicht als Regression des Fixes.
- **Steps to Reproduce:** Nord CE, „Video aufnehmen“ an, auf ein nahes Motiv tippen (Schloss erscheint), dann die Kamera auf ein fernes Motiv richten. Erwartet: Der Fokus bleibt auf der nahen Distanz. Tatsächlich: Er stellt neu scharf.
- **Mögliche Richtung (für `/architecture`, nicht geprüft):** Nach dem Messen die gemessene Fokus-Distanz auslesen und manuell fest setzen (`AF_MODE_OFF` + `LENS_FOCUS_DISTANCE`, per Camera2-Interop). Ob VisionCamera dafür einen Weg bietet, ist offen. Gerät hat `MANUAL_SENSOR`.
- **Priority:** Fix before deployment.

**Urteil nach diesem Nachtrag:** **NOT READY.** Es gibt einen offenen High-Bug (BUG-76). `features/INDEX.md` bleibt **In Review**.

---

## Re-Verifikation 3 (2026-10-02, nach `859b83a`)

**Scope:** Gezielte Re-Verifikation. Diff-Befehl: `git diff --stat debd2a5..HEAD` → nur `spec.md` (+2/−1: erste Zeile der Technical Requirements, neue Zeile im Decision Log). Kein Produktionscode geändert (`git diff --quiet debd2a5..HEAD -- src firmware docs/stacks`, exit 0). Geprüft wurden BUG-4, der Spec-Teil von BUG-23, AC-6, AC-11 und AC-12 gegen den neuen Text, dazu Security und Regression des Diffs. Release-Build: `skipped — unchanged since 2026-10-02`.

### Automatisierte Tests (Step 5)

- [x] `npm test` (einmal vom Owner vor der Lane, Log `scratchpad/suite-run-3.log`): 22 Suites, **337 passed, 0 failed**.
- [!] Layer `firmware`: NOT VERIFIED, no test command recorded for layer firmware. `firmware/` ist im Diff unverändert.
- E2E-Suite: keine vorhanden, nicht ausgeführt.

### BUG-4 (Low, AC-6)

- [x] **Geschlossen im Code.**
  - Die Meldung „erlaubt: min–max“ rundet die Untergrenze auf und die Obergrenze ab: `AutoDriveControls.tsx:617-620` (`ceilToDeciseconds`/`floorToDeciseconds`, `:168-170`/`:177-179`).
  - Die App prüft den auf 0,1 s gerundeten Wert, den auch die Firmware bekommt (`:336-348`, `roundToDeciseconds` `:138-140`).
  - Damit ist die Ursache aus BUG-4 (Anzeige ungerundet, Prüfung gerundet) beseitigt. Behoben wurde sie zusammen mit BUG-16.
- [x] **Gegenprobe der Lane** (`scratchpad/probe3/zzProbe3.test.ts` mit den echten Exporten aus `AutoDriveControls.tsx`, Firmware-Rechnung in float32 mit und ohne FMA nachgebaut, alle Distanzen 1–300000 Steps):
  - Das Report-Beispiel 50100 Steps zeigt heute „7.3–250.5 s“. Beide Grenzen nehmen App und Firmware an, 7.2 und 250.6 lehnt die App ab.
  - Bei Distanzen ab 35 Steps zeigt die App in 0 Fällen eine Grenze an, die sie selbst ablehnt, und in 0 Fällen lehnt die Firmware einen Wert ab, den die App annimmt.
  - Trennschärfe: Mit der alten `toFixed(1)`-Anzeige wären es 174436 von 299966 Distanzen gewesen.
- [x] Abgesichert durch den bestehenden Test „BUG-16: the range shown in the error message consists of drivable bounds“ (`AutoDriveControls.test.ts:199`), grün im Suite-Lauf.
- Abgrenzung: BUG-17 (Low) bleibt offen. Bei 28 Distanzen (1–14 und 21–34 Steps) gibt es im 0,1-s-Raster gar keine gültige Dauer. Das ist ein eigenes Problem, kein Rundungsfehler wie bei BUG-4.

### BUG-23 (Low, Doku-Drift)

- [x] **Spec-Teil geschlossen:** `spec.md:81` stimmt mit App und Firmware überein:
  - Formel `Dauer = Distanz/v + v/Beschleunigung`: App `AutoDriveControls.tsx:73-95`, Firmware `motor.cpp:478-496`, beide mit der kleineren Wurzel. Probe: d/v + v/a ergibt die Dauer exakt zurück.
  - Gleiche Beschleunigung wie beim Jog: der einzige Aufruf `setAcceleration(kAcceleration)` (`motor.cpp:236`, `:28` = 8000), Spiegelwert `AutoDriveControls.tsx:49`.
  - Grenzen 200–8000 für die Reisegeschwindigkeit: App `:41-42`, `:347-348`, Firmware `motor.cpp:32-33`, `:497-498`.
  - Mindestdauer bei kurzen Strecken `2·√(d/a)`: App `:106-114`, Firmware lehnt bei negativer Diskriminante ab (`motor.cpp:481`).
- [x] Stack-Pack-Teil `setDirectionPin` ohne Polarität: inzwischen geschlossen (`docs/stacks/firmware-esp32-tmc2209.md:79` mit `dirHighCountsUp=false`).
- [ ] **Weiter offen**, BUG-23 bleibt deshalb Low und offen:
  - Kommentar „= 2000 steps“ in `AutoDriveControls.tsx:101` (richtig wäre 8000)
  - `design.md:67-70` beschreibt den Status mit 5 Byte, tatsächlich sind es 10 (`ble.cpp:44`, `client.ts:456-465`)
  - `docs/stacks/firmware-esp32-tmc2209.md:113-114` „Weitere Opcodes … noch NICHT festgelegt“
  - `parseDurationSeconds` nimmt Hex und Exponent an (`Number()`, `AutoDriveControls.tsx:148-155`, Probe: „0x10“ → 16)
  - die Dauer wird still auf uint16 geklemmt (`client.ts:318-321`, physisch unerreichbar)

### Acceptance Criteria (gegen den neuen Spec-Text)

- [x] **AC-6**: Kein Widerspruch. „Unter 200 Steps/s“ meint jetzt eindeutig die Reisegeschwindigkeit nach der Rampenformel (`showDurationError`, `AutoDriveControls.tsx:357-361`). Eine zu lange Dauer bleibt stehen (`:213-217`). BUG-20 (Meldung schon beim Tippen) bleibt unverändert offen.
- [x] **AC-11**: Kein Widerspruch. Leer, unlesbar, ohne Lösung oder v > 8000 führt zum Eintragen der Mindestdauer (`:199-218`). Der Wert ist gleich der angezeigten Untergrenze (Probe, alle 300000 Distanzen) und gültig außer bei den 28 Distanzen aus BUG-17.
- [x] **AC-12**: Kein Widerspruch. Das Spec-Beispiel „Minimum 13.5 s“ passt jetzt zur Formel (d = 100000 → 100000/8000 + 1 = 13,5, Probe). Mit der alten Formel wären es 12,5 gewesen. Der neue Text beseitigt also einen bisherigen Widerspruch zwischen AC-12 und den Technical Requirements.
- [!] AC-3/AC-4 (Ankunft nach Dauer, Rampe am echten Motor): NOT VERIFIED, no way to run and probe this project was recorded. Zuletzt im Gerätetest vom 2026-10-02 bestätigt.
- Alle anderen AC und EC: unverändert seit Re-Verifikation 2 und dem Gerätetest vom 2026-10-02, in diesem Lauf nicht neu geprüft (der Diff berührt keinen Code).

### Security (Diff-Bereich)

- [x] Keine Secrets im Diff: `git diff debd2a5..HEAD` enthält nur zwei Spec-Zeilen.
- [x] Keine neue Eingabestrecke: Code unverändert (`git diff --quiet … -- src firmware`, exit 0). Die Firmware prüft unabhängig von der App (`motor.cpp:428-429`, `:481`, `:497-498`). Probe: 0 Fälle „App nimmt an, Firmware lehnt ab“.
- [!] Authentication, Authorization, Rate Limiting, Brute Force/Enumeration, API-Responses, Credentials in der URL: NOT VERIFIED, nicht anwendbar (kein Login, kein Backend, keine Endpoints, Diff nur Doku).
- [!] Release-Bundle nach Secrets durchsuchen: NOT VERIFIED, in diesem Lauf nicht gebaut (Code unverändert).

**Security-Zusammenfassung:** 2 Prüfungen mit Beleg (beide PASS), 7 NOT VERIFIED (6 nicht anwendbar, Release-Bundle nicht gebaut).

### Regression

- [x] Kein Code geändert (`git diff --stat debd2a5..HEAD`: nur `spec.md`). Suite grün (337/337), darunter `AutoDriveControls.test.ts` und `.render.test.ts` sowie die Suites der Deployed-Features PROJ-1, 2, 4, 5 und 6.
- [!] Laufzeit der Deployed-Features: NOT VERIFIED, no way to run and probe this project was recorded.

### Step 6: Unit-Tests (Owner)

- Keine neuen Tests: Der Diff enthält keine Logik. Die Garantie hinter BUG-4 ist durch den bestehenden Test `AutoDriveControls.test.ts:199` abgedeckt. Die Gegenprobe der Lane war eine Wegwerf-Probe und liegt nicht im Repo.

### E2E Tests

- Status: **not run** (run `/e2e-tests` for critical flows)

### Not Verified In This Run

- [!] Ankunft nach eingegebener Dauer und Rampe am echten Motor, Darstellung der Meldungen: no way to run and probe this project was recorded.
- [!] Layer `firmware`: no test command recorded.
- [!] FMA-Verhalten des echten ESP32-Compilers: beide Varianten simuliert (0 Abweichungen), am Chip nicht geprüft.
- [!] Security: siehe oben (nicht anwendbar bzw. Bundle nicht gebaut).

### Neuer Bug

#### BUG-71: Spec verspricht „genau“ die Dauer, der Motor bekommt die Geschwindigkeit auf ganze Hz gerundet (AC-3/AC-4, Technical Requirements)
- **Severity:** Low (bekannte, akzeptierte Abweichung, im Gerätetest unauffällig. Neu ist nur der strengere Wortlaut der Spec.)
- **Beleg:** `spec.md:81` sagt, Beschleunigen, Fahren und Bremsen ergeben „zusammen **genau** die Dauer“. Die Firmware rechnet v exakt, setzt aber `setSpeedInHz(static_cast<uint32_t>(speedHz + 0.5f))` (`motor.cpp:506`). Probe: höchstens 0,25 % Abweichung, schlimmster Fall 300000 Steps / 1496,3 s → 200 Hz statt 200,498 → Ankunft ca. 3,7 s zu spät. Dazu kommt die Rundung der Eingabe auf 0,1 s (`client.ts:318-321`).
- **Steps to Reproduce:** Strecke von 300000 Steps, Dauer 1496.3 s. Rechnerische Fahrzeit 1500,0 s.
- **Priority:** Nice to have. Entweder die Toleranz in der Spec nennen (`/refine PROJ-3`) oder `setSpeedInMilliHz()` verwenden (`/build`).

### Summary (Re-Verifikation 3)

- **BUG-4:** geschlossen, im Code belegt durch eine Gegenprobe über 300000 Distanzen mit Trennschärfe gegen die alte Anzeige.
- **BUG-23:** Spec-Teil und Stack-Pack-Polarität geschlossen. Fünf kleine Doku-Reste offen, Low.
- **AC-6, AC-11, AC-12:** kein Widerspruch zum neuen Spec-Text. AC-12 ist dadurch sogar widerspruchsfrei geworden.
- **Neue Bugs:** 1 Low (BUG-71). 0 Critical, 0 High, 0 Medium neu.
- **Security:** 2/9 mit Beleg (beide PASS), 7 NOT VERIFIED.
- **Regression:** keine (kein Code geändert, Suite 337/337).
- **Production Ready:** **READY** (unverändert). Keine Critical- oder High-Bugs. Die Laufzeit-ACs sind zuletzt im protokollierten Gerätetest vom 2026-10-02 ausgeführt, seitdem hat sich kein Code geändert. Offen und nicht verifiziert in diesem Lauf: Ankunft nach Dauer am Motor, Firmware-Tests, das FMA-Verhalten auf dem Chip. Der Status in `features/INDEX.md` bleibt **Deployed**: Das Feature ist live, dieser Lauf hat nur Bug-Status und Spec-Text bestätigt.

---

## Re-Verifikation 2 (2026-10-02, nach `90987bf`)

**Tested (dieser Lauf):** 2026-10-02 (Re-Verifikation 2 nach dem Fix-Commit `90987bf`, dazu der protokollierte Gerätetest auf dem OnePlus Nord CE)
**App URL:** hier nicht ausführbar (`probe.kind: none`, sowohl App-Ebene als auch Layer `firmware`). Die Laufzeit-ACs hat der Nutzer im protokollierten Gerätetest (Abschnitt „Gerätetest“ in Re-Verifikation 2) am Gerät bestätigt.
**Tester:** QA Engineer (AI). Eine unabhängige `qa-engineer`-Lane ohne Build-Kontext mit allen drei Scopes in der Reihenfolge Step 2 → 3 → 4, zusammengeführt vom Owner. Diese Session hat den Fix gebaut. Deshalb hat sie selbst nichts verifiziert, nur die Unit-Tests aus Step 6 ergänzt.
**Scope:** **Re-Verifikation.** Der letzte Report kam aus `fbfce85`. Diff-Befehl: `git diff --stat fbfce85..HEAD`, HEAD `90987bf` auf `feat/PROJ-3-videoaufnahme`. Geänderte Produktionsdatei:
- `src/components/useVideoDrive.ts` (+6/−4): Im `.then` von `startRecording` kommt die runId-Prüfung jetzt vor dem Löschen des Start-Wächters (BUG-58).

Sonst sind nur Tests (`useVideoDrive.test.ts`, `cacheFiles.test.ts`, letzterer nur Typisierung) und eine Notiz in `design.md` geändert. Eine Produktionsdatei, kein geteilter Code → eine Lane.


### Automatisierte Tests (Step 5)

- [x] `npm test` (einmal vom Owner vor der Lane, Log `scratchpad/suite-run-2.log`): 22 Suites, **336 passed, 0 failed**.
- [x] `npx tsc --noEmit`: exit 0. `npm run lint`: 0 Errors, 67 Warnings (wie vorher, keine in den geänderten Dateien).
- [x] Release-Build `cd android && ./gradlew assembleRelease`: exit 0 (`scratchpad/build-2.log`).
- [!] Layer `firmware`: NOT VERIFIED, no test command recorded for layer firmware. `firmware/` ist im Diff unverändert (`git diff --stat fbfce85..HEAD -- firmware` leer).
- E2E-Suite: keine vorhanden, nicht ausgeführt.

### BUG-58 (High, AC-17/AC-27)

- [x] **Geschlossen im Code.**
  - `useVideoDrive.ts:340-343` prüft zuerst `runIdRef.current !== myRunId`. Ein veralteter Lauf stoppt dann nur seine eigene Aufnahme. Erst danach wird der Start-Wächter gelöscht (`:344-347`).
  - Der Wächter gehört immer dem aktuellen Lauf, weil `runIdRef` sich nur in `finish` (`:145`, direkt gefolgt von `clearAllTimers`) und in `start` (`:315`, nur aus „bereit“) ändert.
- [x] **Gegenproben der Lane** (`scratchpad/probe2/qaprobe2.test.ts`):
  - P1 ist der Ablauf aus dem Report. Lauf 2 steht bei 4999 ms noch in `starting` und ist bei 5000 ms `ready` mit Meldung. `activate` und `deactivate` laufen je 2×, gespeichert wird nichts, die späte Datei wird aus dem Cache gelöscht.
  - P3 ist die Stopp-Variante: `ready`, 2× `deactivate`.
  - P7 hat drei Läufe mit zwei späten Starts: 3× `deactivate`.
  - Gegen die Vorversion `fbfce85` schlagen alle drei fehl (`starting`, `saving` bzw. `starting`).

### Acceptance Criteria (Diff-Bereich: Umsetzung in `useVideoDrive.ts`)

Alle Punkte sind im Code und in Jest geprüft. Laufzeit: `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

- [x] **AC-14**: Kette `start` `:302-370` → Vorlauf `:354-359` → AUTO_DRIVE `:295` → Nachlauf `:400-403` → `saveTake`. Test „records, waits the pre-roll, drives, waits the post-roll…“. Probe P2: Nach einem späten Start von Lauf 1 läuft Lauf 2 komplett durch und wird gespeichert.
- [x] **AC-15**: `saveTake` `:209-220` (unverändert), die Cache-Kopie wird im `finally` gelöscht.
- [x] **AC-17**: STOP in der Fahrt `:378-380`, sofortiges Ende `:176`/`:184`, Stopp in „Startet“ `:179-183` → `:349-352`, begrenzt durch den Wächter `:324-330`. **Folge-Lauf jetzt erfüllt** (P3). P6: Läuft ein aktueller Start nach einem Stopp noch ein, endet er sauber.
- [x] **AC-18**: `.catch` `:361-367` (runId-geschützt), Recorder-Fehler `:264-276`, Hintergrund `:418-425`. P5: Eine späte Ablehnung von Lauf 1 wird während Lauf 2 ignoriert.
- [x] **AC-19**: `:411-415` (unverändert). BUG-52 (Low) weiter offen.
- [x] **AC-27**: Jeder Ausgang endet in `finish` → `deactivate` `:150` (Wächter `:328`, `.catch` `:366`, Finalize `:159`, `saveTake` `:216`, `endUnexpectedly` `:239`, Unmount `:436`). **Folge-Lauf jetzt erfüllt** (P1, P3, P7). Einschränkung: BUG-59 (Low) bleibt offen.
- [x] **AC-28**: `busy = phase !== 'ready'` `:443`, die Verbraucher sind unverändert. BUG-51 (Low) weiter offen.
- [x] **EC-5** (Timing-Garantie aus `design.md:238`): synchrone Ref-Prüfung `phaseRef.current !== 'ready'` `:306`, `setPhase` schreibt `phaseRef` synchron (`:111-114`). Die Firmware-Sperre ist unverändert. Test „ignores a second start while a take is running“.
- [x] **EC-6**: `:404-407` (unverändert), Test „a stop on the way…“.
- [x] **EC-7**: Hintergrund im Vorlauf → `fail` → `clearTimer` `:176`. Tests „…background during the pre-roll…“ und „…ends on its own during the pre-roll…“.
- Alle anderen AC und EC: unverändert seit Re-Verifikation 1 (2026-10-02), in diesem Lauf nicht neu geprüft. Der Diff berührt nur `useVideoDrive.ts:337-347`.

### Neue Befunde aus dem Fix

- Keine. Die Lane hat jeden Pfad geprüft, über den ein veralteter Lauf geteilte Refs oder Timer des aktuellen Laufs anfassen könnte:
  - `.then` `:340`, `.catch` `:362`
  - `onFinished`/`onError` `:247`/`:266` (Probe P4)
  - Finalize-Timer, Tick-Intervall, `recordingRef`
  - `timerRef`-Callbacks `:280`/`:292`/`:173`
  
  Alle sind runId-geschützt.
- **BUG-59 bis BUG-66 und BUG-49 bis BUG-57:** durch den Diff nicht berührt. Ihre Stellen liegen außerhalb von `:337-347` bzw. in Dateien ohne Änderung (`git diff --stat` leer). Keiner ist geschlossen, keiner verschlimmert.

### Security (Diff-Bereich)

- [x] Keine Secrets im Diff: `git diff fbfce85..HEAD -U0 | grep -iE "api[_-]?key|secret|token|passw|bearer|BEGIN .*KEY|AKIA|sk_live|ghp_"` → 0 Treffer.
- [x] Keine Secrets im Release-Bundle: `strings …/index.android.bundle | grep -ciE …` → 0.
- [x] Keine neuen Logs und keine Netzwerkzugriffe im Diff (grep auf `+`-Zeilen → 0).
- [x] Abhängigkeiten, natives Modul und Manifest unverändert (`git diff --name-only` ohne `package.json`, Lockfile und `android/`).
- [x] Ein verspätet gestarteter veralteter Recorder wird sofort gestoppt, Kamera und Mikrofon bleiben nicht offen (P1: `stop` 1×, P7: 1× je Lauf).
- [x] Die Datei eines veralteten Laufs landet nicht in der Galerie und wird aus dem Cache gelöscht (P1: `save` 0×, `deleteCacheFile` 1×).
- [!] Authentication, Authorization, Input Injection, Rate Limiting, Brute Force/Enumeration, API-Responses, Credentials in der URL: NOT VERIFIED, nicht anwendbar (kein Login, kein Backend, keine Endpoints, keine Web-Formulare, keine `[user]`-Tasks, `tasks.md:76`).
- [!] Firmware-Fuzzing: NOT VERIFIED (layer firmware: nothing to probe, unverändert).

**Security-Zusammenfassung:** 6 Prüfungen mit Beleg (6 PASS, 0 FAIL), 8 NOT VERIFIED (7 nicht anwendbare Web-Checks, Firmware-Fuzzing).

### Regression (Deployed-Features)

- [x] Der Diff ändert weder Exporte noch `VideoDriveApi` noch `VideoRecorderPort`. Der einzige Laufzeit-Import von `useVideoDrive` steht in `RootScreen.tsx:17`.
- [x] Nachbarpfade unverändert: `git diff --stat fbfce85..HEAD -- firmware src/ble src/connection src/screens AutoDriveControls.tsx TimelapseControls.tsx useTimelapseSequence.ts useKeepAwake.ts useCameraCapture.ts useVideoCamera.ts VideoPanel.tsx videoFormats.ts cacheFiles.ts android package.json package-lock.json docs/data-model.md` ist leer.
- [x] **PROJ-1**: Verbindungsabbruch `:411-415` unverändert. **PROJ-4**: kein Bezug. **PROJ-6**: Schutz-Stopp `:404-407` unverändert.
- [x] **PROJ-2**: Die Jog-Sperre hängt an `video.drive.busy` (`RootScreen.tsx:161`). Das dauerhafte Sperren durch BUG-58 ist behoben (P1/P3: `busy=false` nach dem Timeout).
- [x] **PROJ-5**: Die gemeinsame Wach-Sperre (`useKeepAwake.ts`, unverändert) bleibt pro Lauf 1:1 (P1: 2:2, P7: 3:3).
- [x] Suites der Deployed-Nachbarn grün (Suite-Lauf, siehe oben).
- [!] Laufzeit aller Deployed-Features: NOT VERIFIED, no way to run and probe this project was recorded.

### Step 6: Unit-Tests (Owner)

- [x] Neu in `src/components/useVideoDrive.test.ts`: „Stopp in the next run still ends after its own timeout when an aborted start arrives late (BUG-58)“. Er schließt die Testlücke, die die Lane gemeldet hat (Stopp-Variante, genaue 5-s-Grenze). `npx jest src/components/useVideoDrive.test.ts` → 27/27 grün.
- [x] Rot-Prüfung: `useVideoDrive.ts` gegen die Vorversion (`git show fbfce85:…`) getauscht. Beide BUG-58-Tests wurden rot (`Received: "starting"` bzw. `"saving"`). Danach wiederhergestellt (`git diff` leer), wieder 27/27 grün, `tsc` exit 0.

### E2E Tests

- Status: **not run** (run `/e2e-tests` for critical flows)

### Not Verified In This Run

- [!] Laufzeit durch die AI: no way to run and probe this project was recorded (`probe.kind: none`). Abgedeckt durch den protokollierten Gerätetest unten, mit Ausnahme von EC-1 bis EC-3.
- [!] Layer `firmware`: no test command recorded (unverändert).
- [!] Ursache von BUG-68 (woher der abgebrochene Fokus-Aufruf kommt): ohne `adb logcat` nicht geklärt.
- [!] Zweites Handy des Nutzers: nur AC-23/AC-25 gemeldet, Modell nicht erfasst, Ursache von BUG-70 nicht diagnostiziert.

### Neuer Bug (bestehendes Verhalten, erstmals dokumentiert)

#### BUG-67: Ein Kamerastart, der erst nach dem Unmount ankommt, startet noch eine Fahrt
- **Severity:** Low (selten, Verhalten identisch an `fbfce85`, also nicht durch den Fix entstanden)
- **Beleg:** Der Unmount löscht die Timer (`useVideoDrive.ts:433-439`), erhöht aber `runIdRef` nicht. Das späte `.then` läuft deshalb als aktueller Lauf weiter: Es setzt Tick und Vorlauf und sendet nach 2 s AUTO_DRIVE an das zuletzt bekannte Gerät. Die Aufnahme wird nie gestoppt. Lane-Probe P8: `autoDrive 1, stop 0, timers 3` nach dem Unmount.
- **Steps to Reproduce (nicht am Gerät):** Fahrt mit Video auslösen und in „Startet“ die App per Zurück-Taste verlassen, während die JS-Runtime weiterläuft. Die Kamera antwortet danach noch.
- **Priority:** Nice to have

### Gerätetest (recorded human test, 2026-10-02)

**Gerät:** OnePlus Nord CE (EB2103), Android 13. Beleg dafür: `adb devices -l` und `adb shell getprop ro.build.version.release`. Die installierte App stammt von 12:53 (`dumpsys package com.camerasliderapp`, `lastUpdateTime`) und ist damit jünger als die APK aus `90987bf` (11:37). **Firmware:** nicht neu geflasht, denn sie ist seit v1.4.0 (`9629317`) unverändert (`git diff --stat 9629317..HEAD -- firmware` leer). Der Nutzer hat die 24 Punkte der Liste durchgegangen und gemeldet: „alles ok“, außer beim Tippen in die Vorschau (AC-25). Dazu kommt ein Screenshot per `adb exec-out screencap`, und auf Nachfrage hat er die Angaben zu AC-25 präzisiert.

- [x] AC-1/AC-2 (Punkte setzen): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-3/AC-4 (Fahrt in beide Richtungen, Dauer): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-5 (Stopp): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-6/AC-11/AC-12 (Dauer-Validierung, Minimum übernehmen): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-7/AC-8/AC-9 (Sperren ohne Punkte und während der Fahrt): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-10/AC-19 (Bluetooth-Abbruch während einer Fahrt mit Video, Video in der Galerie): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] EC-4 (Fahrt ohne Video läuft im Hintergrund weiter): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-13 (Schalter zeigt Vorschau und Einstellungen): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-14/AC-16/AC-29 (Vor-/Nachlauf, REC-Anzeige, Videolänge): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-15/BUG-48 („Video gespeichert“, Galerie, Cache wächst nicht mit). Damit ist auch belegt, dass `NativeModules.CacheFiles` unter der New Architecture auflöst: verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-17 (Stopp in Vorlauf, Fahrt und Nachlauf, Teil-Takes): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-18/EC-7 (Hintergrund in Vorlauf und Fahrt, fremde Kamera-App): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-20 (Mikrofon bzw. Kamera verweigert: Hinweis, keine Fahrt): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-21 (Ton an/aus): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-22/AC-23/AC-24 (Formate, Objektive, Stabilisierungs-Schalter): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] **AC-25** (Fokus- und Belichtungssperre): Die Sperre greift. Das Schloss erscheint, Fokus und Helligkeit halten während der Fahrt, „Auto“ hebt die Sperre auf. verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02. **Aber:** Schon ein einzelner Tipp zeigt zusätzlich eine Fehlermeldung mit nativem Stacktrace, siehe **BUG-68**. Auf einem zweiten Handy (Modell nicht erfasst, laut Nutzer drei Rückkamera-Objektive, die App bietet aber keine Objektivwahl an) kommt „Fokus-Sperre wird von diesem Objektiv nicht unterstützt“, siehe **BUG-69**. Dass dort nur ein Objektiv angeboten wird, steht in **BUG-70**.
- [x] AC-26 (Einstellungen über Neustart, Fokus-Sperre weg): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-27 (Bildschirm bleibt an, danach normal aus): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] AC-28 (während der Fahrt nur Stopp bedienbar): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] EC-5 (Doppel-Tipp ergibt eine Fahrt und ein Video): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] EC-6 (Schutz-Stopp beendet und speichert die Aufnahme): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] EC-8 (Preset laden ändert die Video-Einstellungen nicht): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] EC-9/EC-10 (Zeitraffer gesperrt bei Video an, Zeitraffer mit 3 Fotos bei Video aus): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [x] BUG-58/AC-27 (erneut auslösen nach „Kamera reagiert nicht“): verified by the user on OnePlus Nord CE (EB2103, Android 13), 2026-10-02
- [!] EC-1, EC-2, EC-3 (Distanz 0, AUTO_DRIVE während einer Fahrt, Punkte nach einem Reset): im Gerätetest dieses Laufs nicht abgefragt. Zuletzt am Gerät bestätigt im Archiv-Lauf vom 2026-09-30 (Nachtrag 9). Firmware und `AutoDriveControls.tsx` sind seitdem für diese Pfade unverändert.

### Neue Bugs aus dem Gerätetest

#### BUG-68: Einzelner Tipp in die Vorschau zeigt eine Fehlermeldung mit Stacktrace, obwohl die Sperre greift (AC-25)
- **Severity:** Medium. Die Funktion arbeitet, aber die App meldet bei jeder Bedienung einen Fehler, der keiner ist, und füllt die Anzeige mit einem nativen Stacktrace.
- **Beleg:**
  - Screenshot vom OnePlus Nord CE: „Fokus konnte nicht gesperrt werden: androidx.camera.core.CameraControl$OperationCanceledException: Cancelled by another startFocusAndMetering()“, gefolgt von etwa 10 Stackframes.
  - Die Meldung entsteht in `useVideoCamera.ts:224`. `describeError` gibt `err.message` ungekürzt weiter (`:86-88`), und diese Message enthält bei Nitro auf Android den nativen Stacktrace.
  - Laut VisionCamera bricht jeder neue `focusTo` einen laufenden ab (`CameraController.nitro.ts:220-221`). Nativ landet das als `startFocusAndMetering` (`HybridCameraController.kt:140-170`).
  - Bei einem einzelnen Tipp gibt es also einen zweiten, erfolgreichen Fokus-Aufruf. Das Schloss erscheint ja. Woher der erste, abgebrochene Aufruf kommt, ist nicht geklärt: aus der App selbst (`lockAt`, `:208-227`) oder intern aus CameraX/VisionCamera. Für die Ursache braucht es ein `adb logcat` beim Tippen.
  - Weil die Meldung über `setNotice` läuft, bleibt sie stehen. Gleiche Familie wie BUG-61.
- **Steps to Reproduce:** OnePlus Nord CE, „Video aufnehmen“ an, einmal in die Vorschau tippen. Erwartet: Schloss, keine Fehlermeldung. Tatsächlich: Schloss und Fehlermeldung mit Stacktrace.
- **Priority:** Fix in next sprint. Ein abgebrochener Fokus-Aufruf ist kein Fehler für den Nutzer, und ein roher Stacktrace gehört nicht in die Oberfläche.

#### BUG-69: Fokus-Sperre wird komplett verweigert, wenn das Objektiv keinen Autofokus messen kann, obwohl Belichtung sperrbar wäre (AC-25)
- **Severity:** Low (Geräteeinschränkung, das Hauptgerät ist nicht betroffen)
- **Beleg:**
  - `lockAt` prüft nur `supportsFocusMetering` (`useVideoCamera.ts:214-217`). Das entspricht nur AF (`HybridCameraDevice.kt:121-122`, `FLAG_AF`).
  - Belichtung und Weißabgleich (`supportsExposureMetering`/`supportsWhiteBalanceMetering`, `:123-126`) werden nicht berücksichtigt. `focusTo` würde ohne `modes` alle unterstützten Messarten nutzen (`HybridCameraController.kt:150`, `getAllSupportedMeteringModes`).
  - AC-25 verlangt, Fokus **und** Belichtung zu sperren. Was bei fehlendem AF gelten soll, regelt die Spec nicht.
- **Steps to Reproduce:** Zweites Handy des Nutzers (Modell nicht erfasst; die App bietet dort nur ein Objektiv an, siehe BUG-70), in die Vorschau tippen. Es erscheint „Fokus-Sperre wird von diesem Objektiv nicht unterstützt“, und es wird keine Sperre gesetzt.
- **Priority:** Nice to have. Ob eine reine Belichtungssperre gewünscht ist, ist eine Spec-Frage (`/refine PROJ-3`).

#### BUG-70: Handy mit drei Rückkamera-Objektiven bietet keine Objektivwahl an (AC-23)
- **Severity:** Medium (vorläufig, Diagnose am Gerät offen). Das Hauptgerät ist nicht betroffen, dort wurden die Objektive angeboten.
- **Beleg:**
  - Der Nutzer meldet für das zweite Handy drei Rückkamera-Objektive, die App zeigt aber keine Objektivwahl.
  - `availableLenses` (`videoFormats.ts:59-75`) wertet nur die einzeln gemeldeten Kameras aus `useCameraDevices()` (`useVideoCamera.ts:97`, `:105`) nach `device.type` aus (`videoFormats.ts:44-48`: `wide-angle`/`ultra-wide-angle`/`telephoto`).
  - Zwei Ursachen sind möglich, am Gerät ist keine belegt:
    1. Der Hersteller meldet die Objektive als **eine logische Multi-Kamera**. VisionCamera liefert die einzelnen Linsen dann als `physicalDevices` (`HybridCameraDevice.kt:100-102`, `isVirtualDevice` `:104-105`), und die App wertet die nicht aus.
    2. Die einzeln gemeldeten Kameras haben einen anderen `type`, der nicht in der Zuordnung steht, und werden deshalb verworfen.
  - Hängt vermutlich mit BUG-69 zusammen: Die eine angebotene Kamera meldet keine AF-Messung, was zu einer logischen oder Fixfokus-Kamera passen würde.
  - AC-23 knüpft an „das Gerät stellt der App mehrere Rückkamera-Objektive zur Verfügung“ an. Ob Unterkameras einer logischen Kamera darunter fallen, ist zusammen mit der Open Question `spec.md:91` zu klären.
- **Steps to Reproduce:** Zweites Handy, „Video aufnehmen“ an. Erwartet: Auswahl Weitwinkel/Ultraweitwinkel/Tele. Tatsächlich: keine Auswahl.
- **Diagnose:** Handy per USB anschließen und `adb shell dumpsys media.camera` auslesen (Kamera-IDs, logische Multi-Kamera, Brennweiten, AF-Modi). Modell notieren.
- **Priority:** Fix in next sprint, nach der Diagnose. Ist das Hardware-Verhalten des Herstellers, wird `/refine PROJ-3` (AC-23) nötig.

### Summary (Re-Verifikation 2)

- **BUG-58 (High):** geschlossen im Code (Gegenprobe mit Trennschärfe gegen die Vorversion) und am Gerät bestätigt.
- **Acceptance Criteria:** Alle 29 AC und EC-4 bis EC-10 hat der Nutzer am OnePlus Nord CE am 2026-10-02 bestätigt. AC-25 ist funktional erfüllt, mit dem Medium-Befund BUG-68. EC-1 bis EC-3 sind in diesem Gerätetest nicht abgefragt worden, zuletzt am Gerät bestätigt am 2026-09-30, die Pfade sind seitdem unverändert.
- **Bugs:** 0 Critical, 0 High. **2 Medium: BUG-68, BUG-70 (vorläufig).** Low: BUG-49, 50, 51, 52, 54 (teilweise), 55, 56, 57, 59 bis 67 und neu BUG-69.
- **Security:** 6/14 mit Beleg (alle PASS), 8 NOT VERIFIED (nicht anwendbar bzw. Firmware).
- **Regression:** keine, im Code und im Gerätetest (Zeitraffer mit 3 Fotos, Jog, Presets).
- **Production Ready:** **READY.** Es gibt keine Critical- oder High-Bugs, und die Laufzeit-ACs sind per protokolliertem Gerätetest ausgeführt. Weiter offen und **nicht verifiziert** sind: EC-1 bis EC-3 in diesem Lauf (siehe oben), die Firmware-Tests (kein Testbefehl für den Layer), das Firmware-Fuzzing und das zweite Handy, auf dem nur AC-23/AC-25 gemeldet wurden (BUG-69, BUG-70; Diagnose per `adb shell dumpsys media.camera` offen).

---

## Re-Verifikation 1 (2026-10-02, nach `cbdc596`)

**Scope dieses Laufs:** **Re-Verifikation.** Der letzte Report kam aus `44ec214`. Diff-Befehl: `git diff --stat 44ec214..HEAD`, HEAD `cbdc596` auf `feat/PROJ-3-videoaufnahme`. Geänderte Produktionsdateien:
- `src/components/useVideoDrive.ts`: Start-Wächter, prepare(), Fehler-/Unerwartet-Ende-Pfade, Cache-Löschen
- `src/components/useVideoCamera.ts`: prepare() mit Berechtigungen, Format-Abfrage, Stabilisierung `'standard'`, fps-Sicherheitsnetz
- `src/components/videoFormats.ts`: `probeFormats`, `STABILIZATION_MODE`
- `src/components/cacheFiles.ts` (neu): JS-Seite des nativen Moduls
- `src/components/VideoPanel.tsx`: +1 Zeile, `onSessionConfigSelected`
- `android/.../CacheFilesModule.kt`, `CacheFilesPackage.kt` (neu) und `MainApplication.kt`: natives Lösch-Modul samt Registrierung

Weil der Diff natives App-Shell-Code (`MainApplication.kt`) berührt und mehr als drei Produktionsdateien umfasst, lief der volle Fan-out in voller Breite. Unverändert sind `firmware/`, `src/ble/`, `src/connection/`, `src/screens/`, `AutoDriveControls.tsx`, `TimelapseControls.tsx`, `package.json`, Lockfile und `AndroidManifest.xml` (`git diff --stat 44ec214..HEAD -- <Pfade>` leer).

### Automatisierte Tests (Step 5)

- [x] `npm test` (einmal vom Owner vor dem Fan-out, Log `scratchpad/suite-run.log`): 21 Suites, **332 passed, 0 failed**. Darin die Suites der Deployed-Nachbarn PROJ-1, 2, 4, 5 und 6.
- [x] `npx tsc --noEmit`: exit 0.
- [x] `npm run lint`: 0 Errors, 67 Warnings (wie vorher).
- [x] Release-Build `cd android && ./gradlew assembleRelease`: BUILD SUCCESSFUL. Das neue Kotlin-Modul kompiliert (`android/app/build/tmp/kotlin-classes/release/com/camerasliderapp/CacheFilesModule.class`).
- [!] Layer `firmware`: NOT VERIFIED, no test command recorded for layer firmware. `firmware/` ist im Diff unverändert.
- E2E-Suite: keine vorhanden, nicht ausgeführt.

### Status der Bugs aus Lauf 1

| Bug | Severity | Status | Beleg |
|-----|----------|--------|-------|
| BUG-42 (AC-20) | High | [x] **geschlossen** im Code | `useVideoDrive.ts:309-314` ruft vor jedem Start `port.prepare()` auf. Bei einem Hinweis gibt es kein `activate` und keinen Phasenwechsel. Die Prüfreihenfolge Kamera → Mikrofon (nur bei Ton an) → Objektiv steht in `useVideoCamera.ts:249-268`. Testblock `prepare — may a take start? (AC-20, BUG-42)`. |
| BUG-43 (AC-27/17) | High | [x] **geschlossen für einen einzelnen Lauf**, aber siehe **BUG-58** | 5-s-Wächter mit `finish()` → `deactivate()` (`useVideoDrive.ts:324-330`, `:140-153`). Tests „ends the run after the start timeout…“ und „Stopp while starting does not hang…“. |
| BUG-44 (AC-18) | Medium | [x] **geschlossen** | `onError(err, filePath)` (`useVideoCamera.ts:273-276`) führt zu `saveTake` (`useVideoDrive.ts:264-276`). Der Fake bildet jetzt die Bibliothek ab: kein `onFinished` nach einem Fehler, `stop()` wirft (gegen `HybridVideoRecorder.kt:88-114` abgeglichen). Der falsch-grüne Test ist ersetzt. |
| BUG-45 (AC-18) | Medium | [x] **geschlossen** | `onFinished` außerhalb von „saving“ führt zu `endUnexpectedly`, mit STOP in der Fahrt und einer Meldung (`useVideoDrive.ts:252-256`, `:226-243`). Gegenprobe „onFinished vor Start-Auflösung“: Phase `ready`, Meldung, 1× gespeichert, 1× `deactivate`. |
| BUG-46 (AC-24) | Medium | [x] **geschlossen** | `supportsVideoStabilizationMode('standard')` (`videoFormats.ts:159-163`) entspricht `isStabilizationSupported` (`HybridCameraDevice.kt:227`). Der Constraint `'standard'` setzt `setVideoStabilizationEnabled(true)` (`HybridVideoOutput.kt:123-126`). Rest siehe BUG-62. |
| BUG-47 (AC-22) | Medium | [x] **geschlossen** im Code | `probeFormats` über `VisionCamera.resolveConstraints`, also denselben Resolver wie die echte Sitzung (`useVideoCamera.ts:117-151`, `ConstraintResolver.kt:112-129`). Dazu das Sicherheitsnetz `onSessionConfigSelected`. Der Nebenbefund `formats[0]` ist jetzt eigenständig BUG-66. |
| BUG-48 (AC-15/18) | Medium | [x] **geschlossen im Code**, [!] am Gerät offen | Löschen in `.finally` nach `CameraRoll.save` (`useVideoDrive.ts:209-220`). Aufräumen beim Start nur für `VisionCamera_*.mp4` im Cache-Root (`CacheFilesModule.kt:46-56`). **Offen:** ob `NativeModules.CacheFiles` unter `newArchEnabled=true` (RN 0.87.1) erreichbar ist. Wenn nicht, ist das Aufräumen still ein No-op. Siehe Gerätetest. |
| BUG-53 | Low | [x] **geschlossen** | `fail()` ignoriert „saving“ (`useVideoDrive.ts:192-195`). Test „…background while the take is being saved is no error (BUG-53)“. |
| BUG-54 | Low | [ ] **teilweise**: Eine spät eintreffende Datei wird jetzt gelöscht statt liegen gelassen (`useVideoDrive.ts:247-250`), der Take selbst ist aber weiter verloren. | Test „removes a file that arrives after the finalize timeout“ (`mockSave` 0×). |
| BUG-49, 50, 51, 52, 55, 56, 57 | Low | [ ] **weiter offen** (laut `design.md` bewusst nicht Teil des Fixes) | BUG-49 `VideoPanel.tsx:88`, BUG-50 `useVideoCamera.ts:182-192`, BUG-51 `VideoPanel.tsx:192-216`, BUG-52 `AutoDriveControls.tsx:309-315`, BUG-55 `useVideoCamera.ts:176-178`, BUG-56 `useVideoCamera.ts:95` und `useCameraCapture.ts:54`, BUG-57: nur `requestBlePermissions.ts` nutzt `PermissionsAndroid`. Seit dem Fix wird die Cache-Kopie auch nach einem gescheiterten Speichern gelöscht, auf Android ≤ 9 ist der Take dann endgültig weg (laut `design.md` gewollt). |

### Acceptance Criteria (Diff-Bereich AC-13 bis AC-29)

Alle Punkte sind im Code, in den Bibliotheksquellen und in den Tests geprüft. Laufzeit: `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

- [x] **AC-13**: `useVideoSettings.ts:40` (Standard aus), Panel nur bei eingeschaltetem Schalter (`AutoDriveControls.tsx:666-675`, nicht im Diff).
- [x] **AC-14**: Ablauf Vorlauf `useVideoDrive.ts:356-357` → AUTO_DRIVE `:295` → Nachlauf und Stopp `:398-401`. Test „records, waits the pre-roll, drives, waits the post-roll…“.
- [x] **AC-15**: `useVideoDrive.ts:211-212`, Toast `AutoDriveControls.tsx:310-315`, Cache-Räumung siehe BUG-48.
- [x] **AC-16**: `useVideoDrive.ts:352-355`, `VideoPanel.tsx:109-115`.
- [ ] **AC-17**: Im Einzel-Lauf in jeder Phase erfüllt (Startet `:179-183`, `:347-350`, Wächter `:324-330`, Vor- und Nachlauf `:176`, Fahrt `:376-378`). **FAIL im Folge-Lauf: BUG-58 (High).**
- [x] **AC-18**: Startfehler `:359-365`, Fehler oder unerwartetes Ende `:226-276`, Hintergrund `:416-423`.
- [x] **AC-19**: `useVideoDrive.ts:409-413`, Firmware unverändert. BUG-52 (Low) weiter offen.
- [x] **AC-20**: Auslöse-Pfad siehe BUG-42. Teilbefund BUG-63 (Low, Auslegungssache).
- [x] **AC-21**: `enableAudio = soundEnabled && micGranted` (`useVideoCamera.ts:159`). Bei Ton an ohne Mikrofon blockiert `prepare` (`:257-263`).
- [x] **AC-22**: siehe BUG-47. Teilbefunde BUG-60, BUG-61 und BUG-66 (Low).
- [x] **AC-23**: `videoFormats.ts:59-74`, unverändert.
- [x] **AC-24**: siehe BUG-46. Teilbefund BUG-62 (Low).
- [x] **AC-25**: `useVideoCamera.ts:208-232`. BUG-55 offen, dazu BUG-64 (Low).
- [x] **AC-26**: Fallback ohne Überschreiben (`useVideoCamera.ts:150-151`, `videoFormats.ts:141-152`).
- [ ] **AC-27**: Jeder Ausgang eines Einzel-Laufs endet in `finish()` → `deactivate()` (`useVideoDrive.ts:150`, `:328`, `:364`, `:157-160`, `:214-217`, `:239`, `:431-437`). **FAIL im Folge-Lauf: BUG-58 (High).** Dazu kommt der unbegrenzte Zustand „Speichert“, BUG-59 (Low).
- [x] **AC-28**: `busy`-Sperren unverändert (`VideoPanel.tsx:78/119/149/160/173/184`). BUG-51 offen.
- [x] **AC-29**: `AutoDriveControls.tsx:661-665`, unverändert.

### Edge Cases (Diff-Bereich)

- [x] **EC-5** (Timing-Garantie): Die synchrone Ref-Prüfung `phaseRef.current !== 'ready'` (`useVideoDrive.ts:306`) steht vor `prepare()`, dazu die Firmware-Sperre (unverändert). Test „ignores a second start while a take is running“.
- [x] **EC-6**: `useVideoDrive.ts:402-405`, unverändert.
- [x] **EC-7**: Hintergrund im Vorlauf → `fail` → `clearTimer` (`:176`). Das Restrisiko aus Lauf 1 („`onFinished` vor AppState, ohne Meldung“) ist durch `:252-256` geschlossen. Tests „…background during the pre-roll…“ und „…ends on its own during the pre-roll…“.
- [x] **EC-10**: `TimelapseControls.tsx:86-96` unverändert. Die neue Format-Abfrage bindet keine Kamera (nur `isSessionConfigSupported`, `ConstraintResolver.kt:60-88`).
- EC-1 bis EC-4, EC-8 und EC-9: unverändert seit Lauf 1 (2026-10-02), in diesem Lauf nicht neu geprüft (der Diff berührt `AutoDriveControls.tsx`, Firmware und Presets nicht).

### Bestand AC-1 bis AC-12 (Fahrt ohne Video)

- [x] Der Pfad ist unberührt: `AutoDriveControls.tsx`, `src/ble/` und `firmware/` sind nicht im Diff. Bei ausgeschaltetem Video läuft `sendAutoDriveCommand` direkt (`AutoDriveControls.tsx:489-491`). `AutoDriveControls.test.ts` und `.render.test.ts` sind grün (Suite-Lauf).
- Einschränkung zu AC-5 und AC-9: Hängt ein früherer Video-Take in „Startet“ oder „Speichert“ (BUG-58, BUG-59), bleiben Jog und Fahrt gesperrt.
- [!] Laufzeit: NOT VERIFIED, no way to run and probe this project was recorded.

### Security Audit (Diff-Bereich)

- [x] **Natives Modul, Path-Traversal und absolute Pfade:** Vergleich der `canonicalPath` mit dem kanonischen Cache-Pfad plus Separator, dazu `isFile` (`CacheFilesModule.kt:24-37`). Gegenprobe als zeilengetreue JVM-Portierung (`scratchpad/cacheprobe/Probe.java`): `../../outside/victim.txt`, ein absoluter Fremdpfad und beides mit `file://`-Präfix ergeben false, die Opferdatei bleibt erhalten.
- [x] **Symlinks:** Ein Link im Cache nach draußen ergibt false, das Ziel bleibt (Probe). Das Aufräumen löscht nur den Link, nicht das Ziel.
- [x] **Präfix-Geschwister und Sonderfälle:** `cache2/…`, die Cache-Wurzel, `""`, relative Pfade, Verzeichnisse, `content://` und URL-kodierte Pfade ergeben alle false (Probe).
- [x] **Aufräumen beim Start nur eigene Videos:** Es werden nur `VisionCamera_*.mp4` im Cache-Root gelöscht (`CacheFilesModule.kt:49-52`). Zeitraffer-Fotos (`VisionCamera_*.jpg`), fremde `.mp4` und Unterordner bleiben (Probe).
- [x] **Exceptions und Threading:** `catch (Exception)` → Reject `E_CACHE_FILES` (`CacheFilesModule.kt:35-37`, `:54-56`), JS schluckt das (`cacheFiles.ts:25`, `:32`). Die `@ReactMethod`s sind asynchron.
- [x] **Registrierung:** `MainApplication.kt:19-20`, kein gleichnamiges Modul in `node_modules` oder der autolinkten `PackageList`.
- [x] **Keine neue Angriffsfläche nach außen:** Manifest unverändert, keine exportierte Komponente.
- [x] **Cache-Kopie wird erst nach der fertigen Galerie-Kopie gelöscht:** `.finally` nach `CameraRoll.save` (`useVideoDrive.ts:209-216`). CameraRoll löst erst nach `FileUtils.copy` auf (`CameraRollModule.java:197-205`).
- [x] **Kein Take ohne Kamera-Berechtigung, Mikrofon nie offen bei Ton aus oder ohne Berechtigung:** `useVideoDrive.ts:309-314`, `useVideoCamera.ts:159`. Die Format-Abfrage läuft mit `enableAudio: false` (`:127`) und öffnet die Kamera nicht.
- [x] **`Linking.openSettings()`** ohne Parameter (`useVideoCamera.ts:293-295`).
- [x] **Keine Secrets:** `git diff 44ec214..HEAD -U0 | grep -iE "api[_-]?key|secret|token|passw|bearer|BEGIN .*KEY|AKIA|sk_live|ghp_"` liefert 0 Treffer. `strings index.android.bundle | grep …` liefert ebenfalls 0 Treffer.
- [x] **Keine Logs mit Pfaden:** kein neues `console.*`/`Log.*` im Diff.
- [x] **Abhängigkeiten unverändert:** `package.json` und Lockfile sind nicht im Diff.
- [ ] BUG-49 (Low) weiter offen: Die Vorschau bleibt im Hintergrund aktiv.
- [ ] BUG-65 (Low, theoretisch): Das Aufräumen beim Remount nach einer Activity-Neuerstellung könnte einen gerade gespeicherten Take treffen.
- [!] Ob das native Modul unter der New Architecture zur Laufzeit erreichbar ist: NOT VERIFIED, nur am Gerät prüfbar.
- [!] Authentication, Authorization, HTTP-Injection, Rate Limiting, Brute Force/Enumeration, API-Responses, Credentials in der URL: NOT VERIFIED, nicht anwendbar (kein Login, kein Backend, keine Endpoints, keine Web-Formulare; `tasks.md` hat keine `[user]`-Tasks).
- [!] Firmware-Fuzzing: NOT VERIFIED (layer firmware: nothing to probe, Firmware zudem unverändert).

**Security-Zusammenfassung:** 15 Prüfungen mit Beleg (13 PASS, 2 FAIL Low: BUG-49 offen, BUG-65 neu), 9 NOT VERIFIED (7 nicht anwendbare Web-Checks, Modul-Erreichbarkeit unter der New Architecture, Firmware-Fuzzing).

### Regression (Deployed-Features)

- [x] **PROJ-1**: Bei Verbindungsabbruch läuft `stopRecording` (`useVideoDrive.ts:409-413`). Das Aufräumen beim Start blockiert nicht (fire-and-forget, `cacheFiles.ts:23-33`). Die PROJ-1-Suites sind grün.
- [ ] **PROJ-2**: Die Sperre ist unverändert (`RootScreen.tsx:157-162`). Neu ist aber, dass Jog gesperrt bleibt, solange BUG-58 oder BUG-59 den Video-Lauf festhalten. Die PROJ-2-Suite ist grün.
- [x] **PROJ-4**: `usePresets.ts` und `AutoDriveControls.tsx` sind unverändert. `usePresets.test.ts` ist grün.
- [x] **PROJ-5**: Das Aufräumen löscht keine Zeitraffer-Fotos: Es filtert auf `.mp4`, Fotos haben `.jpg/.heic/…` (`HybridPhotoOutput.kt:244`). Die Format-Abfrage bindet keine Kamera (`HybridCameraFactory.kt:70-82`). Der Kamera-Besitz (EC-10) ist unverändert (`RootScreen.tsx:188`). Die PROJ-5-Suites sind grün.
- [x] **PROJ-6**: Akku-Rückfrage (`AutoDriveControls.tsx:485`) und Schutz-Stopp (`useVideoDrive.ts:395-405`) sind unverändert. Die PROJ-6-Suites sind grün.
- [x] **Verträge:** `VideoDriveApi` ist unverändert (`useVideoDrive.ts:439-447`). `VideoRecorderPort.prepare`/`onError(err, filePath)` haben nur einen Implementierer und einen Verbraucher.
- [!] Laufzeit aller Deployed-Features: NOT VERIFIED, no way to run and probe this project was recorded.

### Step 6: Unit-Tests (Owner)

- [x] Neu: `src/components/cacheFiles.test.ts`, 3 Tests (AC-15, BUG-48):
  - leitet Pfad und Start-Aufräumen an das native Modul weiter
  - schluckt abgelehnte native Aufrufe ohne Unhandled Rejection
  - ist ein No-op ohne natives Modul
  
  Befehl: `npx jest src/components/cacheFiles.test.ts` → 3/3 grün.
- [x] Rot-Prüfung in einer Runde: `cacheFiles.ts` gebrochen (falscher Pfad, `.catch` entfernt, `?.` entfernt) → 3/3 rot. Danach wiederhergestellt (`git diff` leer) → 3/3 grün.
- `probeFormats` und `STABILIZATION_MODE` sind durch die Bestandstests in `videoFormats.test.ts` abgedeckt (Blöcke `probeFormats (AC-22, BUG-47)` und BUG-46).
- [x] Gegenprobe BUG-58 vom Owner nachgefahren: Die Wegwerf-Probe der Akzeptanz-Lane (`scratchpad/probe/race2.test.ts`) lief kurz im Repo und wurde danach wieder entfernt. Ausgabe: `P6 phase after 100 s: starting busy true deactivate calls 0` und `P6 after Stopp + 100 s: saving busy true deactivate calls 0`.

### E2E Tests

- Status: **not run** (run `/e2e-tests` for critical flows)

### Not Verified In This Run

- [!] Alle Laufzeit-ACs und -ECs am Gerät: no way to run and probe this project was recorded (`probe.kind: none`).
- [!] Ob `NativeModules.CacheFiles` unter der New Architecture auflöst. Wenn nicht, ist BUG-48 am Gerät faktisch offen.
- [!] Welche Formate die Abfrage am konkreten Handy liefert, und ob die echte Bildrate `selectedFPS` entspricht.
- [!] Layer `firmware`: no test command recorded (unverändert).
- [!] Darstellung des Video-Panels: kein Gerät, kein Viewport.
- [!] BUG-59 bis BUG-66 sind aus Code und Bibliotheksquellen abgeleitet, keiner ist am Gerät reproduziert. BUG-58 ist per Jest-Gegenprobe belegt.
- EC-1 bis EC-4, EC-8, EC-9 und AC-1 bis AC-12 (Laufzeit): unverändert seit Lauf 1, nicht neu geprüft.

### Neue Bugs aus dem Fix

- BUG-58 (High) — behoben in `90987bf`, siehe „Previously Fixed“ in Lauf 1 unten.

#### BUG-59: Zustand „Speichert“ hat keine Obergrenze mehr
- **Severity:** Low
- **Beleg:** `handleFinished` und `endUnexpectedly` löschen alle Timer vor `saveTake` (`useVideoDrive.ts:233`, `:237`, `:258-259`), damit auch den 10-s-Finalize-Wächter. Löst `CameraRoll.save` nie auf, bleibt „Speichert“ stehen: Jog, Fahrt und Wach-Sperre bleiben aktiv, Stopp kehrt bei „saving“ sofort zurück (`:372-373`). Nach den CameraRoll-Quellen ist das unwahrscheinlich.
- **Priority:** Fix in next sprint

#### BUG-60: Format-Wechsel mitten in der Aufnahme, wenn die Format-Abfrage erst nach dem Fahrt-Start antwortet (AC-22)
- **Severity:** Low
- **Beleg:** Bis die Abfrage antwortet, gilt das gemerkte Format aus den Kandidaten (`useVideoCamera.ts:147-151`), und die Fahrt-Buttons sind frei. Verwirft die Abfrage das Format danach, wird die Sitzung mitten in der Aufnahme neu konfiguriert (`:157-171`). Folge: Pfad des unerwarteten Endes (STOP und Meldung). Das Fenster ist kurz (App-Start, Objektiv- oder Stabilisierungswechsel).
- **Priority:** Fix in next sprint

#### BUG-61: fps-Hinweis des Sicherheitsnetzes wird nie gelöscht (AC-22)
- **Severity:** Low
- **Beleg:** `setNotice(…fps nicht verfügbar…)` steht in `useVideoCamera.ts:202`. Für diesen Hinweis gibt es kein `setNotice(null)`, er bleibt also auch nach einem Wechsel auf ein passendes Format stehen.
- **Priority:** Nice to have

#### BUG-62: Stabilisierung kann von der Bibliothek still abgeschaltet werden (AC-24)
- **Severity:** Low
- **Beleg:** `ConstraintResolver.kt:91-100` stuft Constraints still herunter. Das Sicherheitsnetz vergleicht nur `selectedFPS` (`useVideoCamera.ts:198-206`), nicht `selectedVideoStabilizationMode`.
- **Priority:** Nice to have

#### BUG-63: Beim Einschalten von „Video aufnehmen“ fragt die App die Berechtigung nicht selbst an (AC-20, Auslegungssache)
- **Severity:** Low
- **Beleg:** Es gibt nur einen Hinweis mit Button (`VideoPanel.tsx:64-71`), keinen Request beim Umschalten (`AutoDriveControls.tsx:656`). Die Spec sagt „zeigt einen Hinweis und fragt die Berechtigung an“. Spätestens beim Fahrt-Start fragt `prepare()` an.
- **Priority:** Nice to have, mit dem Nutzer klären

#### BUG-64: Fokus-Sperre geht nativ verloren, wenn die Mikrofon-Berechtigung neu erteilt wird, die Markierung bleibt (AC-25)
- **Severity:** Low
- **Beleg:** Nach dem Erteilen durch `prepare()` kippt `enableAudio`, ein neuer Video-Output entsteht (`useVideoCamera.ts:157-160`). Der Reset-Effekt der Sperre hängt aber nur an `soundEnabled` (`:176-178`). Gleiche Familie wie BUG-55.
- **Priority:** Nice to have

#### BUG-65: Aufräumen beim Remount könnte einen gerade gespeicherten Take löschen (AC-15/AC-18)
- **Severity:** Low (theoretisch)
- **Beleg:** `deleteLeftoverVideos` läuft bei jedem Mount von `useVideoDrive` (`useVideoDrive.ts:425-428`). Eine Activity-Neuerstellung durch eine Konfigurationsänderung, die nicht in `configChanges` steht (`AndroidManifest.xml:35`, z. B. Schriftgröße), mountet neu. Fällt das in das Fenster zwischen Finalize und dem Kopieren durch CameraRoll, geht der Take verloren.
- **Steps to Reproduce (nicht ausgeführt):** Take starten → Home → in den Android-Einstellungen sofort die Schriftgröße ändern → zurück zur App. Ist das Video in der Galerie?
- **Priority:** Nice to have

#### BUG-66: Ist 1080p/30 nicht verfügbar, wird die niedrigste Kombination statt des Gerätestandards genommen (AC-22/AC-26)
- **Severity:** Low (aus Lauf 1 als Nebenbefund von BUG-47, jetzt eigenständig geführt)
- **Beleg:** `videoFormats.ts:147-150` nimmt `formats[0]`. AC-22 verlangt sonst den Standard des Geräts.
- **Priority:** Nice to have

### Summary (Re-Verifikation 1)

- **Bugs aus Lauf 1:** 8 adressiert. Geschlossen im Code sind BUG-42, 44, 45, 46, 47, 48 und 53. BUG-43 ist für den Einzel-Lauf geschlossen, kehrt aber als BUG-58 zurück. BUG-54 ist teilweise geschlossen. BUG-49, 50, 51, 52, 55, 56 und 57 (alle Low) sind weiter offen.
- **Acceptance Criteria (Diff-Bereich):** 17 AC und 4 EC im Code geprüft, 15 AC und 4 EC PASS. **FAIL: AC-17 und AC-27 (BUG-58).** 0 am Gerät ausgeführt.
- **Neue Bugs:** 9 (0 Critical, **1 High: BUG-58**, 0 Medium, 8 Low: BUG-59 bis BUG-66).
- **Security:** 15 Prüfungen mit Beleg (13 PASS, 2 FAIL Low), 9 NOT VERIFIED.
- **Regression:** keine Regression an den Deployed-Features. Die Suites sind grün (332/332), der Release-Build läuft durch. Einschränkung: Jog bleibt gesperrt, solange BUG-58 oder BUG-59 greifen.
- **Production Ready:** **NO.** Grund ist BUG-58 (High). Selbst ohne ihn wäre das Urteil nur „NOT READY — not verified“, solange der Gerätetest fehlt.
- **Recommendation:** BUG-58 per `/build` fixen: den Start-Wächter erst nach der runId-Prüfung löschen bzw. pro Lauf führen. Sinnvoll zusammen mit BUG-59 (Obergrenze für „Speichert“). Danach `/qa` als Re-Verifikation und den Gerätetest.
- **Priorisierung durch den Nutzer (2026-10-02):** Zuerst nur BUG-58 fixen. BUG-59 bis BUG-66 und die übrigen offenen Low-Bugs bleiben vorerst offen.

### Gerätetest (recorded human test, offen)

Es gilt die Liste aus Lauf 1 unten (Abschnitt „Gerätetest“). Geändert bzw. neu nach dem Fix:

- **AC-20** (ersetzt den Schritt aus Lauf 1): Mikrofon in Android verweigern, Ton an, Fahrt auslösen. Erscheint ein Hinweis bzw. der Systemdialog, und startet **keine** Fahrt? Dann Kamera verweigern und Fahrt auslösen: Hinweis, keine Fahrt, die App bleibt bedienbar?
- **AC-15/BUG-48**: Drei Takes aufnehmen, dann unter Einstellungen → Apps → Camera Slider → Speicher prüfen. Wächst der Cache pro Take nicht mehr um die Videogröße? (Damit ist auch geklärt, ob das native Modul unter der New Architecture läuft.)
- **AC-22**: Werden nur Formate angeboten, die das Handy wirklich kann? Stimmen Auflösung und fps in den Video-Details?
- **AC-24**: Erscheint der Stabilisierungs-Schalter nur auf einem Objektiv mit Stabilisierung?
- **AC-18**: Während einer Fahrt mit Video eine andere Kamera-App öffnen. Hält der Schlitten, kommt eine Meldung, liegt der Teil-Take in der Galerie?

---

# Lauf 1: erster `/qa` nach `/refine` (2026-10-02, HEAD `701a737`)

> Die Befunde dieses Laufs sind der Ausgangspunkt der Re-Verifikation oben. Status der Bugs: siehe Tabelle „Status der Bugs aus Lauf 1“.

_**Tested:** 2026-10-02_
_**App URL:** nicht ausführbar hier (`probe.kind: none`, App-Ebene und Layer `firmware`). Jedes Laufzeit-AC ist unten `[!] NOT VERIFIED`, bis ein Mensch es am Gerät testet._
_**Tester:** QA Engineer (AI). Drei unabhängige `qa-engineer`-Lanes (Akzeptanz, Security, Regression) ohne Build-Kontext, zusammengeführt vom Owner._
_**Scope:** `full`, erster `/qa`-Lauf nach `/refine` (Videoaufnahme, `35c737d`). Kein Re-Verifikationslauf, denn der Vertrag hat sich geändert. HEAD `701a737` auf `feat/PROJ-3-videoaufnahme`. Code-Umfang: `git diff --stat 35c737d..HEAD`. Neu sind `useVideoSettings.ts`, `videoFormats.ts`, `useVideoCamera.ts`, `useVideoDrive.ts` und `VideoPanel.tsx`. Geändert sind `AutoDriveControls.tsx`, `TimelapseControls.tsx`, `RootScreen.tsx` und `AndroidManifest.xml`. Firmware, `src/ble/` und `package.json` sind unverändert._

### Automatisierte Tests (Step 5)

- [x] `npm test` (einmal vom Owner vor dem Fan-out): 21 Suites, **306 passed, 0 failed**. Alle Nachbar-Suites sind grün (PROJ-1: `client`, `connectionReducer`, `ConnectionProvider`, `App`; PROJ-2: `useJogState`; PROJ-4: `usePresets`; PROJ-5: `useCameraCapture`, `useTimelapseSequence`, `TimelapseControls`, `useKeepAwake`; PROJ-6: `battery`, `BatteryLockBanner`, `BatteryIndicator`).
- [x] `npx tsc --noEmit`: keine Fehler.
- [x] `npm run lint`: 0 Errors, 67 Warnings. Neu durch den Diff sind nur 2× `no-void` in `VideoPanel.tsx:69` und `:138`.
- [!] Layer `firmware`: NOT VERIFIED, kein Testbefehl erfasst. Der Diff berührt `firmware/` nicht (`git diff --stat 35c737d..HEAD -- firmware` ist leer).
- E2E-Suite: keine vorhanden, nicht ausgeführt.
- **Vorsicht:** Ein bestehender Unit-Test ist **falsch grün**. „…saves the part recorded“ in `useVideoDrive.test.ts` nutzt einen Fake-Recorder, der nach einem Fehler trotzdem `onFinished` liefert (`useVideoDrive.test.ts:57-59`). VisionCamera tut das nicht (siehe BUG-44).

### Acceptance Criteria Status

#### Videoaufnahme (AC-13 bis AC-29), erster Lauf

##### AC-13: Schalter „Video aufnehmen“ zeigt Vorschau und Einstellungen
- [x] Standard ist aus (`useVideoSettings.ts:39-46`). Das Panel erscheint nur bei eingeschaltetem Schalter (`AutoDriveControls.tsx:666-675`), es werden nur Rückkameras berücksichtigt (`videoFormats.ts:60`). Bei ausgeschaltetem Schalter gilt der alte Weg (`AutoDriveControls.tsx:486-491`). Belegt durch die Render-Tests „AC-13: the switch turns video on…“ und „with video off… drives as before“.
- [!] NOT VERIFIED am Gerät: no way to run and probe this project was recorded.

##### AC-14: Aufnahme → 2 s Vorlauf → Fahrt → 2 s Nachlauf → automatisch beendet
- [x] `useVideoDrive.ts:261-266` (Vorlauf-Timer nach dem Aufnahmestart), `:223` (AUTO_DRIVE), `:304-307` (Ankunft, Nachlauf, Stopp). Die Firmware meldet `driving=false` und `atEnd` im selben Notify (`motor.cpp:526-540`). Test: „records, waits the pre-roll, drives, waits the post-roll…“.
- [!] NOT VERIFIED am Gerät (tatsächliches Timing).

##### AC-15: Video in der Galerie, Meldung „Video gespeichert“
- [x] `CameraRoll.save('file://'+path, {type:'video'})` (`useVideoDrive.ts:198`). Ab Android 10 landet die Datei in MediaStore Movies (`CameraRollModule.java:181-201`). Der Toast steht in `AutoDriveControls.tsx:309-315`.
- [ ] BUG-48 (Medium): Die Temp-Datei im App-Cache wird nie gelöscht.
- [!] NOT VERIFIED am Gerät.

##### AC-16: REC-Anzeige mit Dauer und Phase
- [x] `VideoPanel.tsx:108-114` (Phasen-Labels `:25-32`). Die Uhr startet beim Start-Event (`useVideoDrive.ts:261-264`). Test: „shows REC with the recorded time and the phase“.
- [!] NOT VERIFIED am Gerät (sichtbar in der ScrollView?).

##### AC-17: Stopp in jeder Phase → Motor hält, Aufnahme endet, Teil-Take gespeichert
- [x] Prüfung je Phase:
  - Startet: `useVideoDrive.ts:165-168` und `:256-259`.
  - Vorlauf und Nachlauf: `clearTimer`, `:162`.
  - Fahrt: STOP plus Aufnahme-Stopp, `:282-285`.
  - Tests decken Fahrt und Vorlauf ab. Startet und Nachlauf sind nur im Code geprüft.
- [ ] BUG-43 (High): Löst der Aufnahmestart nie auf, endet Stopp in „Startet“ nie.
- [!] NOT VERIFIED am Gerät.

##### AC-18: Aufnahme startet nicht oder bricht ab → kein Losfahren bzw. sofortiger Halt, Fehlermeldung, Teil speichern
- [x] Ein Startfehler führt zu einer Meldung, und die Fahrt startet nicht (`useVideoDrive.ts:268-271`, Test). Ein Fehler während der Fahrt sendet STOP und zeigt eine Meldung (`:176-189`). Der Wechsel in den Hintergrund wird über AppState erkannt (`:322-329`).
- [ ] BUG-44 (Medium): Ein Teil-Take nach einem Aufnahmefehler wird nie gespeichert.
- [ ] BUG-45 (Medium): Endet die Aufnahme unerwartet „regulär“ (`SOURCE_INACTIVE`), gilt der Lauf als Erfolg und der Motor fährt weiter.
- [!] NOT VERIFIED am Gerät.

##### AC-19: BLE-Abbruch während einer Fahrt mit Video
- [x] Ist `device === null`, wird die Aufnahme beendet und gespeichert (`useVideoDrive.ts:315-319`, Test „a lost connection ends and saves…“). Die Firmware stoppt (`ble.cpp:138-140`).
- [ ] BUG-52 (Low): Der Toast „Video gespeichert“ fehlt nach dem Remount.
- [!] NOT VERIFIED am Gerät. Beim Wechsel auf `reconnecting` hängt RootScreen auch die `<Camera>` aus (`RootScreen.tsx:192-200`). Laut Bibliothek wird die Aufnahme trotzdem gespeichert, am Gerät ist das nicht belegt.

##### AC-20: Fehlende Berechtigung → Hinweis, Anfrage bzw. Einstellungen, keine Fahrt mit Video
- [x] Die Hinweise samt „Zugriff erlauben“, „Einstellungen öffnen“ und „oder Ton ausschalten“ sind vorhanden (`VideoPanel.tsx:64-71`, `:133-141`, Render-Tests im Block „permissions (AC-20)“).
- [ ] **BUG-42 (High)**: Eine Fahrt mit Video startet trotz fehlender Berechtigung.

##### AC-21: Ton an/aus
- [x] `enableAudio: soundEnabled && micGranted` (`useVideoCamera.ts:105-108`). Der Video-Output wird bei einer Änderung neu erzeugt (VisionCamera `useVideoOutput`, deps). Test: „records audio only when sound is on and the microphone is granted“.
- [ ] Zusammen mit BUG-42: Bei Ton an ohne Mikrofon wird still ohne Ton aufgenommen, statt zu sperren.
- [!] NOT VERIFIED am Gerät.

##### AC-22: Nur verfügbare Auflösung/Bildrate, Standard 1080p/30
- [x] Standard 1080p/30 (`videoFormats.ts:21-23`), wirksames Format `:115-126`. Tests: `videoFormats.test.ts` (AC-22).
- [ ] BUG-47 (Medium): Es werden Kombinationen angeboten, die das Gerät nicht kann, und die Bildrate wird still angepasst.
- [!] NOT VERIFIED am Gerät (welche Formate das konkrete Handy meldet).

##### AC-23: Objektivwahl
- [x] `videoFormats.ts:60-74`. Die Auswahl erscheint nur bei mehr als einem Objektiv (`VideoPanel.tsx:165`). Tests: `availableLenses (AC-23)` und VideoPanel „hides the lens choice with a single lens…“.
- [!] NOT VERIFIED am Gerät (ob der Hersteller UW/Tele einzeln freigibt).

##### AC-24: Stabilisierung, Schalter nur bei Unterstützung
- [ ] **BUG-46 (Medium)**: Der Schalter wird auf Android immer angezeigt, und „an“ hat keine garantierte Wirkung.

##### AC-25: Tippen sperrt Fokus und Belichtung, „Auto“ hebt auf, Sperre hält während der Fahrt
- [x] `focusTo(point, {adaptiveness:'locked', autoResetAfter:null})` (`useVideoCamera.ts:156-159`), „Auto“ ruft `resetFocus` auf. Tippen und „Auto“ sind während einer Aufnahme gesperrt (`VideoPanel.tsx:78`, `:118`). Bei einer Neukonfiguration wird die Sperre zurückgesetzt (`useVideoCamera.ts:124-126`). Tests: AC-25-Block in `useVideoCamera.test.ts` und `VideoPanel.render.test.ts`.
- [ ] BUG-55 (Low, nicht am Gerät belegt): Nach Hintergrund und Rückkehr kann die native Sperre weg sein, die Markierung bleibt aber stehen.
- [!] NOT VERIFIED am Gerät (ob CameraX AE/AWB auf dem Objektiv wirklich sperrt).

##### AC-26: Einstellungen über einen Neustart gemerkt, Sperre nur pro Sitzung, Fallback bei nicht verfügbarem Wert
- [x] Ein Datensatz unter `camera-slider.video-settings` mit feldweisem Fallback (`useVideoSettings.ts:61-82`). Objektiv- und Format-Fallback greifen, ohne den gemerkten Wert zu überschreiben (`videoFormats.ts:81-126`). Die Sperre ist nur Sitzungs-State (`useVideoCamera.ts:89`). Tests: `useVideoSettings.test.ts` (inkl. der neuen QA-Tests, siehe Step 6) und `videoFormats.test.ts`.
- [!] NOT VERIFIED am Gerät (echter App-Neustart).

##### AC-27: Bildschirm bleibt während der Fahrt mit Video an, Sperre wird danach freigegeben
- [x] `activate()` beim Start (`useVideoDrive.ts:243`), `deactivate()` in `finish()` (`:136`) und beim Unmount (`:332-338`).
- [ ] **BUG-43 (High)**: Die Freigabe ist nicht garantiert. Bleibt „Startet“ hängen, bleibt die Wach-Sperre dauerhaft an.

##### AC-28: Während einer Fahrt mit Video ist nur Stopp bedienbar
- [x] `lockedByOtherMode` enthält `videoBusy` (`AutoDriveControls.tsx:426`). Gesperrt sind damit Schalter (`:655`), Dauer (`:612`), Punkte, Presets und Panel (`busy`, `VideoPanel.tsx:78/118/148/159/172/183`), Jog über `RootScreen.tsx:157-162`. Das gilt in allen Phasen außer „bereit“, auch in „Startet“ und „Speichert“ (`useVideoDrive.ts:342`). Test: „AC-17/AC-28: during a take only Stopp is usable“.
- [ ] BUG-51 (Low): Die Berechtigungs-Buttons im Panel bleiben bedienbar.

##### AC-29: Erwartete Videolänge = Dauer + 4 s
- [x] `AutoDriveControls.tsx:661-665` mit `VIDEO_EXTRA_SECONDS = (PREROLL_MS + POSTROLL_MS)/1000` (`:34`). Test: „AC-29: shows the expected video length“.

#### Bestand (AC-1 bis AC-12): Regression gegen die Video-Änderungen

Firmware und BLE-Client sind unverändert. In `AutoDriveControls.tsx` kamen nur `videoBusy` in den Sperren und Verzweigungen in `handleDrive`/`handleStop` dazu. Die Gerätetests vom 2026-09-24 bis 2026-09-30 (siehe Archiv unten) gelten für die Fahrlogik weiter. Weil die Datei geändert wurde, ist hier unten nur der Code-Stand neu geprüft.

- [x] AC-1/AC-2: `AutoDriveControls.tsx:457-478`, unverändert.
- [x] AC-3/AC-4: ohne Video `:490` → `sendAutoDriveCommand`. Render-Test „with video off… drives as before“.
- [x] AC-5: `:495-501` → STOP, Firmware `forceStop` (`motor.cpp:329-345`).
- [x] AC-6: `:357-361` und `:617-622`. Tests in `AutoDriveControls.test.ts` grün.
- [x] AC-11: `:386-391`. Render-Test „AC-11 still corrects on blur“.
- [x] AC-12: `:372-384` und `:623-641`. Render-Tests im AC-12-Block.
- [x] AC-7/AC-8: `:397-409`.
- [x] AC-9: `motionLocked` `:428`, Jog-Sperre `RootScreen.tsx:157-162`.
- [x] AC-10: `ble.cpp:138-140`, unverändert.
- [!] Laufzeit für AC-1 bis AC-12 auf diesem Branch: NOT VERIFIED, no way to run and probe this project was recorded. Siehe Gerätetest-Liste.

### Edge Cases Status

- [x] **EC-1**: `AutoDriveControls.tsx:395` und `:642-644`, die Firmware prüft Distanz 0 (unverändert).
- [x] **EC-2** (Timing-Garantie): `motor.cpp:428-431` lehnt AUTO_DRIVE während `autoDriving` ab (unverändert).
- [x] **EC-3**: `ble.cpp:101` `motorClearPoints`, useSliderStatus setzt zurück, wenn `device` null ist. Bekannter Low-Restfall BUG-18 siehe Archiv.
- [x] **EC-4**: Die Watchdog-Ausnahme `motor.cpp:373` ist unverändert. Der AppState-Listener des Video-Hooks greift in „bereit“ nicht (`useVideoDrive.ts:178`), eine Fahrt ohne Video läuft im Hintergrund also weiter.
- [x] **EC-5** (Timing-Garantie): Die synchrone Ref-Prüfung `phaseRef.current !== 'ready'` (`useVideoDrive.ts:233-236`) und zusätzlich die Firmware-Sperre (`motor.cpp:428`) sorgen dafür, dass ein zweiter Start ignoriert wird. Test: „ignores a second start while a take is running“.
- [x] **EC-6**: Der Schutz-Stopp läuft `motorLockout` → `motorStop` → `autoDriving=false` (`motor.cpp:668-674`, `:361`). Steht der Schlitten dabei nicht am Ziel, beendet die App die Aufnahme sofort (`useVideoDrive.ts:308-311`). Test: „a stop on the way…“.
- [x] **EC-7**: Hintergrund im Vorlauf → `fail` → `clearTimer`, und AUTO_DRIVE wird nie gesendet (`useVideoDrive.ts:322-329`, `:162`). Test: „the app going to the background during the pre-roll“. Restrisiko siehe BUG-45: Kommt `onFinished` vor dem AppState-Event, fährt der Schlitten zwar ebenfalls nicht, eine Fehlermeldung bleibt aber aus.
- [x] **EC-8**: `handleLoadPreset` setzt nur Preset und Dauer (`AutoDriveControls.tsx:506-512`). Test „EC-8: loading a preset leaves the video settings untouched“. Getrennte Speicher-Keys: `useVideoSettings.ts:27` und `usePresets.ts:25`.
- [x] **EC-9**: Während eines Zeitraffers ist der Video-Schalter gesperrt (`AutoDriveControls.tsx:426`, `:655`). Bei eingeschaltetem Video ist der Zeitraffer-Start gesperrt (`RootScreen.tsx:188`, `TimelapseControls.tsx:90-91`, `:180`). Test „EC-9: the video switch is locked while a timelapse runs“.
- [x] **EC-10**: Statt der Vorschau erscheint ein Hinweis, es wird keine Zeitraffer-`<Camera>` gerendert, und der Start ist gesperrt (`TimelapseControls.tsx:207-210`, `:180`). Test `timelapseCameraState (PROJ-3 EC-10)`. Bei ausgeschaltetem Video verhält sich der Zeitraffer unverändert (Test „behaves as before when "Video aufnehmen" is off“).
- [!] Laufzeit für alle EC: NOT VERIFIED, no way to run and probe this project was recorded.

### Security Audit Results

_Stack: Android-App ohne Backend und ohne HTTP-API, Firmware per BLE. Die Web-Checks der Vorlage sind deshalb „nicht anwendbar“. Dafür kommen stack-spezifische Prüfungen dazu._

- [!] Authentication (Login/HTTP): NOT VERIFIED, nicht anwendbar (kein Login, keine Routen). Das BLE-Gegenstück ist im Code geprüft: `WRITE_ENC` (`ble.cpp:391-392`), Just-Works-Bonding, ein Bond-Slot (`platformio.ini:32`). Das Restrisiko „erstes Gerät bei leerem Bond-Slot koppelt“ ist eine bewusste Entscheidung aus PROJ-1/PROJ-2 und nicht neu.
- [!] Authorization (Nutzer X/Y): NOT VERIFIED, nicht anwendbar (Einzelnutzer, kein Backend).
- [x] Eingabevalidierung App → Firmware (AUTO_DRIVE): Die Dauer wird gerundet und auf 0…65535 begrenzt (`client.ts:318-321`), die Richtung kommt aus einer festen Map (`client.ts:41-44`). Unverändert.
- [x] Firmware-Parsing kaputter Writes: Leere Writes werden ignoriert (`ble.cpp:156-158`), jeder Opcode prüft seine exakte Länge (`ble.cpp:164-225`), `motorAutoDrive` prüft erneut (`motor.cpp:428-501`). Unverändert. Fuzzing am ESP32: NOT VERIFIED (layer firmware: nothing to probe).
- [x] Status-Parsing in der App gegen kurze oder kaputte Notifies: `?? 0` plus Längen-Guards (`client.ts:440-479`). Unverändert.
- [x] AsyncStorage gegen feindliches oder kaputtes JSON (`camera-slider.video-settings`): Whitelist-`pick` und `typeof boolean` pro Feld, try/catch (`useVideoSettings.ts:48-82`). Neue QA-Tests, rot-geprüft (siehe Step 6).
- [!] Rate Limiting: NOT VERIFIED, nicht implementiert und nicht anwendbar (keine Endpoints). Eine Flut von BLE-Befehlen startet keine zweite Fahrt (`motor.cpp:428`).
- [!] Brute Force: NOT VERIFIED, nicht anwendbar (PROJ-3 prüft keine Credentials). `tasks.md` hat keine `[user]`-Tasks (`tasks.md:76`).
- [!] Account-Enumeration und Credentials in der URL: NOT VERIFIED, nicht anwendbar (keine Konten, keine Web-Formulare). Einzige URL-Aktion ist `Linking.openSettings()` ohne Parameter (`useVideoCamera.ts:181`).
- [x] Keine Secrets im Code und im Bundle: `git grep` nach Key-, Token- und Passwort-Mustern in `src`, `firmware/src`, `android/app/src` und den Gradle-Dateien ohne Treffer. Das aktuelle Hermes-Release-Bundle (`android/app/build/generated/assets/react/release/index.android.bundle`) ist ebenfalls ohne Treffer. `.gitignore` deckt Keystores und `.env*` ab. `npm audit --omit=dev`: 0 Schwachstellen.
- [x] Keine sensiblen Daten in Logs: kein `console.*` in den neuen Dateien.
- [x] Manifest-Berechtigungen minimal: `RECORD_AUDIO` ist neu und begründet (AC-20/21, `AndroidManifest.xml:16-19`). `WRITE_EXTERNAL_STORAGE` hat `maxSdkVersion="28"`. Kein `READ_MEDIA_*` (Quell- und gemergtes Release-Manifest).
- [x] Manifest-Härtung: `allowBackup="false"`, `usesCleartextTraffic="false"` im Release. Exportiert sind nur die Launcher-Activity und der AndroidX-`ProfileInstallReceiver` (mit `DUMP` geschützt).
- [x] Mikrofon bei „Ton aus“ nie offen: `enableAudio` (`useVideoCamera.ts:107`). Nativ wird `withAudioEnabled()` erst beim Aufnahmestart aufgerufen (VisionCamera `HybridVideoOutput.kt:179-181`). Laufzeit: NOT VERIFIED.
- [x] Aufnahme wird bei Hintergrund, Disconnect und Stopp beendet: `useVideoDrive.ts:322-329`, `:315-319`, `:276-286`.
- [x] Keine neuen Abhängigkeiten: `package.json` und `package-lock.json` sind unverändert.
- [ ] BUG-48 (Medium): Temp-Videos bleiben dauerhaft im App-Cache liegen.
- [ ] BUG-49 (Low): Die Kamera-Vorschau bleibt im Hintergrund aktiv.

**Security-Zusammenfassung:** 12 Prüfungen mit Beleg (10 PASS, 2 FAIL: BUG-48 Medium, BUG-49 Low), 6 NOT VERIFIED (Authentication, Authorization, Rate Limiting, Brute Force, Enumeration/URL als nicht anwendbar, Firmware-Fuzzing ohne Hardware).

_Vorbestehend und nicht PROJ-3, nur zur Kenntnis:_
- Der Release wird mit dem eingecheckten `debug.keystore` signiert (`android/app/build.gradle:88-104`).
- `react-native-ble-plx` bringt Location-Berechtigungen ohne `maxSdkVersion` ins gemergte Manifest.
- `INTERNET` ist deklariert, wird aber nicht genutzt.

### Regression (Deployed-Features)

- [x] **PROJ-1**: Die Nicht-`connected`-Zweige von `RootScreen` sind unverändert (`RootScreen.tsx:105-118`, `:192-200`). Die neuen Hooks werden ohne Bedingung vor dem switch aufgerufen (`:71-73`), die Rules of Hooks sind also eingehalten. `ConnectionProvider` ist unverändert.
- [x] **PROJ-2**: `JogControls.tsx` ist unverändert. Die Sperre bekommt nur `|| video.drive.busy` dazu (`RootScreen.tsx:157-162`). `busy` ist nur außerhalb von „bereit“ wahr, ohne Video bleibt Jog also wie bisher bedienbar.
- [x] **PROJ-4**: `usePresets.ts` ist unverändert, eigener Speicher-Key. Laden und Löschen sind auch während Vorlauf, Nachlauf und Speichern gesperrt (`AutoDriveControls.tsx:745`, `:759`), die Sperre ist also eher schärfer geworden.
- [x] **PROJ-5**: Bei ausgeschaltetem Video ist `timelapseCameraState` gleich der alten Bedingung (`TimelapseControls.tsx:87-96`, Test grün). Video- und Zeitraffer-`<Camera>` hängen am selben State und sind nie gleichzeitig gemountet. `useTimelapseSequence` und `useCameraCapture` sind unverändert.
- [x] **PROJ-6**: `confirmIfBatteryCritical` umschließt beide Fahrtwege (`AutoDriveControls.tsx:485`). Die Akku-Sperre bleibt in `autoDriveBaseEnabled`/`motionLocked` (`:428`). Ein Schutz-Stopp beendet die Aufnahme (EC-6).
- [x] Native Abhängigkeiten: VisionCamera vorher und nachher 5.2.3. Das Manifest hat nur den `RECORD_AUDIO`-Hunk dazubekommen.
- [ ] BUG-56 (Low): Getrennte `useCameraPermission()`-Instanzen in PROJ-5 und Video können einen veralteten Berechtigungshinweis zeigen.
- [!] NOT VERIFIED am Gerät: native Kamera-Übergabe Zeitraffer ↔ Video (Sitzung wird freigegeben, `photoOutput` wird wieder angehängt). Gerätetest: Video an → aus → Zeitraffer mit 3 Bildern, und umgekehrt.

### Step 6: Unit-Tests (Owner)

- [x] `src/components/useVideoSettings.test.ts` um 3 Tests erweitert (AC-26, Robustheit des gespeicherten Datensatzes):
  - gültiges JSON, das kein Objekt ist (`null`, Zahl, String, leer)
  - Werte mit falschem Typ (`"true"`, `"60"`, `1`, `30.0001`)
  - Array-Datensatz und `__proto__`-Schlüssel (sauberes Settings-Objekt)
  
  `npx jest src/components/useVideoSettings.test.ts` → 9/9 grün.
- [x] Rot-Prüfung für diese Datei in zwei Runden, die Implementierung danach wiederhergestellt (`git diff` leer) und wieder 9/9 grün:
  - Runde 1 (lockere Typprüfung in `pick`/`pickBoolean`): Der Typ-Test wurde rot.
  - Runde 2 (Objekt/null-Prüfung entfernt, gespeicherter Datensatz ungefiltert durchgereicht): Der Nicht-Objekt-Test, der Array/`__proto__`-Test und zwei Bestandstests wurden rot.
- Weitere reine Logik (`videoFormats`, `formatRecordingTime`, Dauerberechnung) ist durch Bestandstests abgedeckt. Den falsch-grünen Bestandstest zu AC-18 (BUG-44) korrigiert `/build` zusammen mit dem Fix.

### E2E Tests

- Status: **not run** (run `/e2e-tests` for critical flows)

### Not Verified In This Run

- [!] Alle Laufzeit-ACs und -ECs (AC-1 bis AC-29, EC-1 bis EC-10) am Gerät: no way to run and probe this project was recorded (`probe.kind: none`). Weg: der Gerätetest unten.
- [!] Layer `firmware`: no test command recorded for layer firmware. Firmware ist in diesem Diff unverändert.
- [!] Native Kamera-Übergabe Zeitraffer ↔ Video, die tatsächliche Wirkung der Fokus-/Belichtungssperre, die real angebotenen Formate und Objektive des Handys.
- [!] Darstellung und Layout des Video-Panels in der ScrollView: kein Gerät, kein Viewport.
- [!] Fuzzing der BLE-Characteristic am echten ESP32: keine Hardware.
- [!] BUG-42, 43, 45, 46, 47 und 49 sind aus Code, Bibliotheksquellen (VisionCamera 5.2.3, camera-roll 7.10.2) und einer Gegenprobe im Scratchpad abgeleitet. Am Gerät reproduziert ist keiner.

### Gerätetest (recorded human test, offen)

Ein Schritt je Laufzeit-AC. Antworten werden hier als `[x] … verified by the user on <Gerät>, <Datum>` oder als Bug eingetragen.

- AC-1/2: Zum Startpunkt jogen, „Als Start setzen“, zum Endpunkt jogen, „Als Ende setzen“. Steht „Bereit“ da? Lässt sich ein Punkt überschreiben?
- AC-3/4: Am Start 10 s eingeben, „Start → Ende“. Kommt der Schlitten nach etwa 10 s am Ende an? Danach dasselbe mit „Ende → Start“.
- AC-5: Während der Fahrt Stopp drücken. Hält der Motor sofort?
- AC-6/11/12: Eine viel zu lange Dauer eingeben: erscheint eine Meldung, und der Wert bleibt stehen? Das Feld leer verlassen: wird die Mindestdauer eingetragen? Lange Strecke mit 10 s: erscheint der Hinweis mit „Minimum übernehmen“?
- AC-7/8/9: Ohne Punkte bzw. neben dem Startpunkt: sind die Fahrt-Buttons grau? Während der Fahrt: reagieren nur noch Stopp, aber nicht Jog und Setzen?
- AC-10/AC-19: Während einer Fahrt mit Video Bluetooth am Handy ausschalten. Stoppt der Slider? Liegt das Video in der Galerie?
- EC-4: Eine Fahrt ohne Video starten und Home drücken. Fährt der Slider bis zum Ziel?
- AC-13: „Video aufnehmen“ ein- und ausschalten. Erscheinen bzw. verschwinden Vorschau und Einstellungen?
- AC-14/16/29: Fahrt mit Video bei 10 s Dauer. Steht vorher „Videolänge ca. 14.0 s“ da? Sind „● REC“, die Zeit und die Phasen sichtbar? Läuft die Aufnahme etwa 2 s vor und 2 s nach der Fahrt?
- AC-15: Erscheint „Video gespeichert“? Ist das Video in der Galerie abspielbar?
- AC-17: Je einmal Stopp im Vorlauf, in der Fahrt und im Nachlauf. Hält der Motor bzw. fährt er gar nicht erst los? Ist jedes Teil-Video in der Galerie?
- AC-18/EC-7: Während einer Fahrt mit Video Home drücken, einmal im Vorlauf und einmal in der Fahrt. Hält der Schlitten bzw. fährt er nicht los? Kommt beim Zurückkehren eine Fehlermeldung? Liegt der Teil-Take in der Galerie?
- AC-20: Mikrofon in den Android-Einstellungen verweigern, Ton an lassen, Fahrt auslösen. Startet sie (erwartet ist laut BUG-42: ja, ohne Ton)? Dann Kamera verweigern, Fahrt auslösen, Stopp. Bleibt die App in „Speichert“ hängen (BUG-43)?
- AC-21: Je ein Take mit Ton an und mit Ton aus. Hat das Video Ton bzw. keinen?
- AC-22: Jedes angebotene Format kurz aufnehmen. Stimmen Auflösung und fps in den Video-Details mit der Wahl überein?
- AC-23: Andere Objektive wählen. Wechselt die Vorschau, und nutzt das Video dieses Objektiv?
- AC-24: Ist der Stabilisierungs-Schalter sichtbar? Unterscheidet sich ein Take mit an und aus sichtbar im Bildausschnitt?
- AC-25: In die Vorschau tippen. Erscheint das Schloss? Bleiben Fokus und Helligkeit konstant, wenn man während der Fahrt eine Lampe ins Bild hält? Hebt „Auto“ die Sperre auf?
- AC-26: Alle Video-Einstellungen ändern und die App komplett neu starten. Ist alles wie eingestellt, die Fokus-Sperre aber weg?
- AC-27: Bildschirm-Timeout auf 15 s stellen, Fahrt mit Video von 30 s. Bleibt der Bildschirm an und geht er danach wieder normal aus?
- AC-28: Während der Fahrt mit Video Schalter, Ton, Format und Vorschau antippen. Reagiert nichts außer Stopp?
- EC-5: „Start → Ende“ doppelt antippen. Gibt es genau eine Fahrt und ein Video?
- EC-6: Am Labornetzteil die Spannung während einer Fahrt mit Video unter die Schutzschwelle senken. Endet die Aufnahme und wird das Video gespeichert?
- EC-8: Mit eingeschaltetem Video ein Preset laden. Bleiben die Video-Einstellungen gleich?
- EC-9/10: Mit eingeschaltetem Video: Steht im Zeitraffer der Hinweis und ist dessen Start grau? Während eines Zeitraffers: ist „Video aufnehmen“ grau? Danach Video aus und einen Zeitraffer mit 3 Bildern machen. Landen die Fotos in der Galerie?

### Bugs Found

#### Previously Fixed

Behoben in `cbdc596` bzw. `90987bf`, re-verifiziert in Re-Verifikation 1 und 2 und im Gerätetest vom 2026-10-02.

- **BUG-42** — Fahrt mit Video startet ohne Kamera- bzw. Mikrofon-Berechtigung (AC-20) — Severity: High
- **BUG-43** — Phase „Startet“ ohne Zeitlimit, App hängt dauerhaft, Wach-Sperre bleibt an (AC-27, AC-17) — Severity: High
- **BUG-44** — Teil-Take nach einem Aufnahmefehler wird nie gespeichert (AC-18) — Severity: Medium
- **BUG-45** — Unerwartetes „reguläres“ Aufnahme-Ende gilt als Erfolg, Motor fährt weiter (AC-18) — Severity: Medium
- **BUG-46** — Stabilisierungs-Schalter immer sichtbar und ohne garantierte Wirkung (AC-24) — Severity: Medium
- **BUG-47** — Format-Liste bietet nicht unterstützte Auflösung/fps-Kombinationen an (AC-22) — Severity: Medium
- **BUG-48** — Temp-Videodateien bleiben dauerhaft im App-Cache liegen (AC-15/AC-18) — Severity: Medium
- **BUG-53** — Hintergrund während „Speichert“ meldet fälschlich „Aufnahme abgebrochen“ — Severity: Low
- **BUG-58** — Verspäteter Start eines abgebrochenen Laufs schaltet den Start-Wächter des nächsten Laufs ab (AC-27, AC-17) — Severity: High

##### BUG-49: Kamera-Vorschau bleibt im Hintergrund aktiv
- **Severity:** Low
- **Beleg:** `isActive` ist fest auf `true` gesetzt (`VideoPanel.tsx:88`), nicht an AppState gekoppelt (zum Vergleich PROJ-5: `TimelapseControls.tsx:221`). VisionCamera hält die Kamera bei `onHostPause` im Zustand STARTED (`CustomLifecycle.kt:66-83`).
- **Steps to Reproduce:** „Video aufnehmen“ an, Home drücken. Der Kamera-Indikator in der Statusleiste bleibt sichtbar, Akkuverbrauch.
- **Priority:** Fix in next sprint

##### BUG-50: Jeder Kamerafehler wird als „Format nicht verfügbar“ gedeutet
- **Severity:** Low
- **Beleg:** `onCameraError` setzt bei jedem Fehler `formatRejected` und fällt auf 1080p/30 zurück (`useVideoCamera.ts:130-140`). Das passiert auch, wenn 1080p/30 schon gewählt war oder die Ursache eine belegte Kamera ist. Gleichzeitig ist das ein Auslöser für BUG-45.
- **Priority:** Fix in next sprint (zusammen mit BUG-45)

##### BUG-51: Berechtigungs-Buttons im Video-Panel während der Aufnahme bedienbar (AC-28)
- **Severity:** Low
- **Beleg:** Die Buttons in `VideoPanel.tsx:64-71` und `:133-141` haben kein `busy`. Ein Tipp öffnet einen Systemdialog, AppState wechselt auf `background`, und die Aufnahme bricht ab.
- **Priority:** Fix in next sprint

##### BUG-52: Kein „Video gespeichert“ nach einem Verbindungsabbruch (AC-19)
- **Severity:** Low
- **Beleg:** Beim Wechsel auf `reconnecting` wird `AutoDriveControls` ausgehängt, und `lastSavedCountRef` wird beim Remount neu initialisiert (`AutoDriveControls.tsx:309-315`). Das Video wird trotzdem gespeichert, nur die Bestätigung fehlt.
- **Priority:** Nice to have

##### BUG-54: Finalize-Timeout verwirft eine später eintreffende Datei
- **Severity:** Low
- **Beleg:** Feuert der 10-s-Timer (`useVideoDrive.ts:143-146`) vor `onFinished`, erhöht `finish()` die runId. Die danach eintreffende Datei wird verworfen (`:195-197`) und bleibt im Cache liegen (siehe BUG-48).
- **Priority:** Nice to have

##### BUG-55: Fokus-Sperre nach einer Rückkehr aus dem Hintergrund evtl. weg, Markierung bleibt (AC-25)
- **Severity:** Low (nicht am Gerät belegt)
- **Beleg:** CameraX bindet nach der Rückkehr neu. Der State `focusLock` (`useVideoCamera.ts:89`) wird dabei nicht zurückgesetzt.
- **Priority:** Nice to have, zuerst am Gerät prüfen

##### BUG-56: Veralteter Berechtigungshinweis zwischen Zeitraffer und Video
- **Severity:** Low (nicht am Gerät belegt)
- **Beleg:** `useCameraCapture` (PROJ-5) und `useVideoCamera` haben je eine eigene `useCameraPermission()`-Instanz mit eigenem State. Wird die Berechtigung in der einen erteilt, kann die andere bis zum nächsten AppState-Wechsel noch „Kamera-Zugriff benötigt“ zeigen.
- **Priority:** Nice to have

##### BUG-57: Android 7–9: Speichern in die Galerie ohne Laufzeit-Anfrage von `WRITE_EXTERNAL_STORAGE`
- **Severity:** Low (nur relevant, wenn das Handy älter als Android 10 ist)
- **Beleg:** Die Berechtigung steht im Manifest (`maxSdkVersion="28"`), wird aber nie zur Laufzeit angefragt. `CameraRoll.save` schlägt auf diesen Versionen fehl.
- **Priority:** Nice to have

### Summary

- **Acceptance Criteria:** 29 AC und 10 EC im Code geprüft. 0 davon am Gerät ausgeführt, alle Laufzeit-ACs sind NOT VERIFIED. Im Code fehlerhaft: AC-20 und AC-27 (High), AC-18, AC-22, AC-24 und AC-15 (BUG-48) (Medium), Teilbefunde Low bei AC-19, AC-25 und AC-28.
- **Bugs Found:** 16 neu (0 Critical, 2 High, 5 Medium, 9 Low).
- **Security:** 12/18 Prüfungen mit Beleg (2 davon FAIL), 6 NOT VERIFIED (Authentication, Authorization, Rate Limiting, Brute Force, Enumeration/URL als nicht anwendbar, Firmware-Fuzzing ohne Hardware).
- **Production Ready:** **NO**
- **Recommendation:** Erst BUG-42 und BUG-43 (High) fixen, sinnvollerweise zusammen mit BUG-44, 45, 46, 47 und 48 (Medium). Danach `/qa` als Re-Verifikation und anschließend den Gerätetest oben.

> „Production Ready: YES“ hieße nur „keine Critical/High-Bugs“, nicht „alles geprüft“. Auch nach den Fixes bleibt jeder Laufzeit-Punkt offen, bis der Gerätetest erfasst ist.

---

# Archiv: frühere QA-Läufe (AC-1 bis AC-12, 2026-09-24 bis 2026-09-30)

> Die folgenden Abschnitte stammen aus den Läufen vor dem `/refine` zur Videoaufnahme. Ihre BUG-Nummern (bis BUG-41) und Gerätetests bleiben als Historie stehen. Für den aktuellen Stand gilt der Bericht oben.

## Lauf 2026-09-24 ff.

**Tested:** 2026-09-24
**App URL:** nicht ausführbar hier (`probe.kind: none`, App-Ebene und Layer `firmware`) — jedes Laufzeit-AC ist unten `[!] NOT VERIFIED`, bis ein Mensch es testet
**Tester:** QA Engineer (AI) — drei unabhängige `qa-engineer`-Lanes (Akzeptanz, Security, Regression), zusammengeführt vom Owner
**Scope:** `full` (erster `/qa`-Lauf für PROJ-3, HEAD `d3a37a4` auf `feat/PROJ-3-start-endpunkt-auto-fahrt`)

> Legende: `[x]` in diesem Lauf verifiziert (Beleg nötig) · `[ ] BUG` als kaputt verifiziert · `[!] NOT VERIFIED` in diesem Lauf nicht prüfbar (Grund nötig)

### Vorbemerkung zur Methode

`probe.kind: none` gilt sowohl auf App-Ebene als auch im Layer `firmware` — es gab nichts zu starten und nichts live abzufragen. Alle Befunde stammen aus Quellcode-Inspektion (inkl. der vendorten Bibliotheken `firmware/.pio/libdeps/esp32dev/{FastAccelStepper,NimBLE-Arduino}`), aus dem einmaligen Suite-Lauf des Owners und aus einer Nachrechnung der Dauer-/Geschwindigkeitsformeln. Die App-Suite lief einmal vor dem Fan-out (6 Suites/92 Tests, siehe unten) und wurde vom Owner nach dem Hinzufügen eines neuen Testfiles ein zweites Mal komplett wiederholt (7 Suites/109 Tests) — beide Läufe sind unten zitiert. Die drei Lanes selbst haben keine Suite erneut ausgeführt, nur einzelne Dateien gelesen.

### Automatisierte Tests (Step 5)

- **App-Suite** (`npm test`) — PASS — erster Lauf vor dem Fan-out: 6 Suites, 92 Tests, 0 fehlgeschlagen (`ConnectionProvider.test.tsx`, `connectionReducer.test.ts`, `useJogState.test.ts`, `client.test.ts`, `useSliderStatus.test.ts`, `App.test.tsx`). Zweiter Lauf nach Ergänzung von `AutoDriveControls.test.ts` (Owner, Step 6): 7 Suites, **109 Tests, 0 fehlgeschlagen**.
- **Firmware-Layer** — `[!] NOT VERIFIED — no test command recorded for layer firmware` (`commands.test: null` in `.ai-eng-kit`). Ersatzweise: `pio run -e esp32dev` → `[SUCCESS]` (RAM 12,6 %, Flash 48,9 %) — belegt nur, dass die Firmware baut, nicht ihr Verhalten.
- **E2E-Suite** — nicht vorhanden, übersprungen (kein früherer `/e2e-tests`-Lauf).

### Acceptance Criteria Status

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

### Edge Cases Status

#### EC-1: Start = Ende (0 Steps) → Auslöser deaktiviert
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Logik PASS (Code): Hinweistext (`AutoDriveControls.tsx:106,187-189`), Auslöser gesperrt über `distanceSteps > 0` (`:113`), Firmware lehnt unabhängig ab (`motor.cpp:275-278`).

#### EC-2: Zweite Auslöse-Anfrage während laufender Fahrt wird ignoriert
- [x] PASS (Garantie im Code bestätigt) — `motor.cpp:251` lehnt bei `autoDriving || stepper->isRunning()` ab, gesetzt in `motor.cpp:303-305`. Alle Command-Writes laufen seriell im einen NimBLE-Host-Task (`NimBLEDevice.cpp:884,1009` der vendorten Bibliothek) — kein Check-then-Set-Race zwischen zwei AUTO_DRIVE-Anfragen möglich, auch nicht über mehrere Verbindungen hinweg. Die App selbst entprellt einen Doppel-Tap nicht (`AutoDriveControls.tsx:131-136`), die Firmware fängt es aber zuverlässig ab.

#### EC-3: App-Neustart/Reconnect → Start/Ende nicht mehr gesetzt
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Garantien PASS (Code): Firmware `onConnect` → `motorClearPoints()` (`ble.cpp:74` → `motor.cpp:245-248`); App `useSliderStatus` setzt bei `device === null` zurück (`useSliderStatus.ts:48-56`, Tests `useSliderStatus.test.ts:108,139`, im Suite-Lauf bestanden).
- Zusatzbefund BUG-6 (Medium, siehe unten) — dieselbe Firmware-Logik löscht die Punkte bei **jedem** neuen Connect, nicht nur bei einem Reconnect der eigenen App.

#### EC-4: Auto-Fahrt läuft weiter, wenn App in den Hintergrund geht/abstürzt
- [!] NOT VERIFIED — no way to run and probe this project was recorded. Garantie PASS (Code): Watchdog kehrt bei `autoDriving` sofort zurück (`motor.cpp:208-215`), App sendet beim Hintergrund-Wechsel nichts Eigenes (`ConnectionProvider.tsx:240-258` reagiert nur auf `active`). Beobachtung (kein Bug): ein echter App-Absturz schließt auf Android meist die GATT-Verbindung, dann greift eher AC-10 als EC-4.

### Nicht dokumentierte Befunde

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

### Security Audit Results

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

### E2E Tests
- Status: **not run** (run `/e2e-tests` for critical flows)

### Step 6 — Unit-Tests (Owner)

Neu geschrieben: `src/components/AutoDriveControls.test.ts` (17 Tests) für die drei reinen, bis dahin ungetesteten Hilfsfunktionen aus `AutoDriveControls.tsx` (`parseDurationSeconds`, `formatSeconds`, `statusLabelFor` — dafür `export` ergänzt, keine Verhaltensänderung). Abdeckung: Komma-/Punkt-Dezimaltrennzeichen, leere/nicht-numerische/negative/unendliche Eingabe, Rundung, alle drei Statuszeilen-Fälle.

Rot-Probe durchgeführt: alle drei Funktionen in der Quelldatei gezielt kaputt gemacht (Komma-Ersetzung entfernt, Null-/Negativ-/Unendlich-Filter entfernt, Rundung auf 3 statt 1 Dezimalstelle, Reihenfolge der `statusLabelFor`-Zweige vertauscht + Fallback-Text geändert), Testdatei erneut laufen lassen: **12 von 17 Tests wurden rot**, jeweils mit der erwarteten Diskrepanz (z. B. „Expected: null, Received: NaN" / „Expected: Bereit, Received: kaputt"); die verbleibenden 5 grünen Tests betreffen Eingaben, die von der jeweils kaputt gemachten Regel nicht berührt waren. Danach Quelldatei zurückgesetzt, Testdatei erneut grün (17/17). Kein Blindgänger-Test in der Datei.

Gesamte Suite nach der Ergänzung erneut komplett gelaufen (Owner, Step 5-Nachtrag): `npm test` → 7 Suites, 109 Tests, 0 fehlgeschlagen.

### Not Verified In This Run

- [!] Laufzeitverhalten der gesamten App und Firmware auf echter Hardware — AC-1, AC-2, AC-5, AC-7, AC-8, EC-1, EC-3, EC-4 vollständig; der physische/UI-Teil von AC-3, AC-4, AC-6, AC-9, AC-10 — Grund: `no way to run and probe this project was recorded` (`probe.kind: none`, App-Ebene und Layer `firmware`).
- [!] Firmware-eigene Tests — kein `commands.test` für den Layer `firmware` hinterlegt (`null`); nur der Compile-Nachweis (`pio run` → SUCCESS) liegt vor.
- [!] Komponententest für `AutoDriveControls` als Ganzes (Rendering, Button-Enablement-Kette end-to-end) — nur die extrahierten reinen Hilfsfunktionen sind unit-getestet (Step 6); kein Render-Test in der Suite.
- [!] Zwei parallele `monitorCharacteristicForService`-Aufrufe auf dieselbe Status-Characteristic (`RootScreen.tsx:34` und `AutoDriveControls.tsx:73`, je über `useSliderStatus`) — ob `react-native-ble-plx` das auf Android als eine gemeinsame native Subscription führt oder als zwei, ist ungeprüft.
- [!] Rate Limiting auf BLE-Writes — nicht implementiert, für ein MVP dieser Art optional, keine Web-Analogie anwendbar.
- [!] Verhalten von Android nach Verlust des Bonds (BUG-7) — ob automatisch neu gepaart wird — nur auf echter Hardware prüfbar.
- [!] Cross-Browser/Responsive/DevTools — entfällt vollständig, mobile App ohne Browser-Oberfläche.

### Bugs Found

### Previously Fixed
- **BUG-1** — JOG während laufender Auto-Fahrt hebelt Watchdog UND Auto-Fahrt-Ankunftserkennung aus — Severity: High
- **BUG-2** — Auto-Fahrt kommt wegen ignorierter Beschleunigungsrampe später an als die eingegebene Dauer — Severity: Medium
- **BUG-3** — App validiert die Dauer ungerundet, Firmware gerundet — Grenzwerte scheitern stillschweigend — Severity: Medium
- **BUG-5** — Disconnect-Stopp-Garantie (AC-10) durch unbeteiligtes Zweitgerät aushebelbar — Severity: Medium
- **BUG-6** — Jeder BLE-Connect löscht Start-/Endpunkt, nicht nur ein Reconnect der eigenen App — Severity: Medium
- **BUG-7** — Bond-Verdrängung (Just Works, max. 3 Bonds) kann die App aussperren, auch für STOP — Severity: Medium
- **BUG-15** — DIR-Umkehr dreht die physische Richtung gespeicherter Presets (Regression PROJ-4) — Severity: High
- **BUG-19** — Zu kurze Dauer ohne Verlassen des Felds sperrt die Auslöser stumm — Severity: Medium
- **BUG-24** — Dauer eines geladenen Presets wird durch eine Zwischen-Distanz still überschrieben — Severity: High
- **BUG-25** — Richtungs-Migration erkennt „alte Polarität“ nur am fehlenden `dirVersion` — Severity: Medium (erledigt: laut Nutzer keine betroffenen Presets, 2026-09-30)
- **BUG-26** — Doku-Drift: `dirVersion`/Migration und AC-12 fehlten in Design und Datenmodell — Severity: Low
- **BUG-27** — Restpfad von BUG-24: nur Endpunkt gesetzt, Preset-Dauer überschrieben — Severity: High
- **BUG-28** — Teil-Regression von BUG-19: wachsende Distanz sperrt die Auslöser ohne Meldung — Severity: Medium
- **BUG-29** — Von Hand geänderte Dauer bleibt nach dem Anwenden eines Presets zu kurz — Severity: Medium
- **BUG-30** — Ende der Preset-Schutzphase per Timer/Fehler bewertet die Distanz nicht neu — Severity: Medium
- **BUG-31** — Alter Timer von Preset A beendet die Schutzphase von Preset B — Severity: Low
- **BUG-32** — 3-s-Timer der Schutzphase wird nie aufgeräumt — Severity: Low
- **BUG-33** — Verwaister Schutzphasen-Timer überschreibt die Dauer eines neu geladenen Presets — Severity: High (entfallen mit `df41c8c`, Mechanismus ausgebaut)
- **BUG-34** — Doppel-Tap auf „Als Start setzen“ hinterlässt verwaisten Timer — Severity: Low (entfallen mit `df41c8c`)
- **BUG-35** — Korrektur im Fehlerpfad nutzt veraltete Distanz — Severity: Low (entfallen mit `df41c8c`)
- **BUG-36** — Timer entsteht nach dem Unmount und wird nie abgebrochen — Severity: Low (entfallen mit `df41c8c`)
- **BUG-37** — Timer-Korrektur greift während des Tippens — Severity: Low (entfallen mit `df41c8c`)

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

### Summary (Erstlauf, 2026-09-24 — inzwischen überholt, siehe Re-Verifikation unten)
- **Acceptance Criteria:** 0/10 als voll bestätigt verifizierbar (kein Probe möglich), 4 AC mit einem im Code bestätigten Bug (AC-3, AC-4, AC-6, AC-9), 1 AC mit bedingtem Bug (AC-10), 5 AC mit intakter Code-Kette aber `NOT VERIFIED` (AC-1, AC-2, AC-5, AC-7, AC-8); EC-2 PASS (Garantie im Code bestätigt), EC-1/EC-3/EC-4 `NOT VERIFIED` mit intakter Code-Kette
- **Bugs Found:** 14 total (0 Critical, 1 High, 5 Medium, 8 Low)
- **Security:** 6/10 Checks verifiziert, 4 NOT VERIFIED (3× not applicable, 1× not implemented/optional) — siehe Security-Zusammenfassung oben
- **Production Ready:** NO (Stand Erstlauf)
- **Empfehlung (Erstlauf):** Vor allem BUG-1 (High) fixen — das ist der Kern-Bug, den alle drei Lanes unabhängig gefunden haben und der die zentrale Sicherheitsgarantie von AC-9 in der Firmware aushebelt. Die Medium-Bugs (BUG-2,3,5,6,7) sollten im selben Durchgang mit, da sie alle dieselbe Interaktion (Firmware verlässt sich zu sehr auf die App bzw. auf "es verbindet sich schon niemand Fremdes") betreffen. Danach `/qa` erneut — als Re-Verifikation im Umfang des Diffs.

---

### Re-Verifikation (2026-09-24, mehrere Runden)

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

### Summary (nach Re-Verifikation)
- **High/Medium-Bugs:** 6/6 geschlossen (BUG-1, 2, 3, 5, 6, 7), jeweils unabhängig re-verifiziert
- **Offen (bewusst, Low):** BUG-4, 8–14 sowie die drei oben genannten neuen Low-Restbefunde
- **Production Ready (Stand vor dem Hardware-Test):** NOT READY — not verified (kein Critical/High-Bug mehr offen, aber `probe.kind: none` — kein einziges Laufzeit-AC wurde tatsächlich ausgeführt)
- **Empfehlung (Stand vor dem Hardware-Test):** Human-Hardware-Test wie bei PROJ-1/PROJ-2 — insbesondere: normale Jog-/Auto-Fahrt-Regression, JOG während einer laufenden Auto-Fahrt (BUG-1), Trennen der App-Verbindung während einer Fahrt (BUG-5).

### Aufgezeichneter Human-Hardware-Test (2026-09-24)

Nach dem Re-Verifikations-Zyklus (Firmware neu geflasht ab Commit `f188420`) hat der Nutzer den geforderten fokussierten Test am echten Slider durchgeführt und bestätigt ("hardwaretest ok"):

- [x] **AC-1/AC-2/AC-3/AC-4/AC-5/AC-7/AC-8** — normale Jog-/Auto-Fahrt-Regression (Start/Ende setzen, beide Fahrtrichtungen, Stopp, Button-Freischaltung) — verified by user on real hardware, 2026-09-24
- [x] **AC-9 (BUG-1-Fix)** — Jog-Taste während einer laufenden Auto-Fahrt zeigt keine Wirkung mehr (kein unkontrollierter Dauerlauf) — verified by user on real hardware, 2026-09-24
- [x] **AC-10 (BUG-5-Fix)** — Trennen der App-Verbindung während einer laufenden Fahrt stoppt den Motor weiterhin zuverlässig — verified by user on real hardware, 2026-09-24
- [!] NOT VERIFIED — AC-6s Rand-Toleranz (0,01 Steps/s) auf exakten Grenzwerten, EC-1/EC-3/EC-4 im Detail, sowie die Mehrgeräte-BLE-Szenarien (BUG-6/BUG-7/BOOT-Taster-Reset) — nicht Teil dieses fokussierten Tests, keine bekannten Probleme aus dem Code-Review

**Production Ready: JA** — kein Critical/High-Bug offen, die sicherheitskritischen Fixes (BUG-1, BUG-5) sind auf echter Hardware bestätigt.

### Nachtrag: Re-Verifikation nach 8000 Steps/s, BUG-18-Fix, DIR-Umkehr (2026-09-29)

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
- BUG-15 (High) — behoben, siehe „Previously Fixed“ oben.
- BUG-19 (Medium) — behoben, siehe „Previously Fixed“ oben.
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

### Nachtrag 2: Re-Verifikation der Fixes BUG-15/16/19 (2026-09-30)

**Scope (Re-Verifikation):** `git diff 442c552..HEAD -- src features/PROJ-3-start-endpunkt-auto-fahrt/spec.md` (Commits `a6b837d`, `c44e0e8`): `usePresets.ts`, `AutoDriveControls.tsx` (jeweils + Test), `spec.md` (neues AC-12). Ein `qa-engineer`-Lauf mit allen drei Scopes (2 → 3 → 4), eingegrenzt auf den Diff und die offenen Bugs. Alles andere aus dem Nachtrag vom 2026-09-29 gilt weiter — _unverändert seit 2026-09-29, in diesem Lauf nicht neu geprüft (Diff berührt AC-1, AC-2, AC-5, AC-7..AC-10, EC-1..EC-4 nicht)_. `probe.kind: none` — Laufzeit/Hardware ist `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 12 Suites, 199 Tests, 0 Fehler (`suite4.log`). Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

### Fix-Status
- [x] **BUG-19 geschlossen** — Render-Probe: Standardwert „10", dann Distanz 160000 → „21.0", „Start → Ende" aktiv, 2 Renders, keine Schleife (`AutoDriveControls.tsx:321-327`). Eine zu lange Dauer wird nicht überschrieben (Probe: „900" bleibt nach Distanzwechsel).
- [x] **BUG-16 geschlossen (Distanzen ≥ 35 Steps)** — `AutoDriveControls.tsx:168-170, 542-543`; Simulation über 1–160000 Steps: angezeigte Grenzen sind in 0 Fällen in der App ungültig und in 0 Fällen in der Firmware (float32) abgelehnt. Rest: BUG-17 (jetzt Anzeige „0.1–0.0 s"/„0.2–0.1 s" bei 1–34 Steps, weiterhin Low, höchstens ~0,2 mm).
- [x] **BUG-15 geschlossen auf Code-Ebene** — `migrateDirection` (`usePresets.ts:53-67`), Best-Effort-Schreiben (`:78-94`), Stempel `dirVersion: 2` (`:166`); idempotent, bei fehlgeschlagenem Schreiben kein Doppel-Flip (Probe), Vorzeichen passt zu `motor.cpp:216, 380-389`. PROJ-5 nutzt keine Presets. Bedingung siehe BUG-25. Physische Richtung nach dem Laden eines alten Presets: `[!]` Hardware.
- [x] **AC-12** — Probe: leer → „12.3" (Distanz 90000), „abc" → „11.0" (80000); Distanz ändert sich nicht → getippte Zeit bleibt.

### Neue Bugs
- BUG-24 (High) — behoben, siehe „Previously Fixed“ oben.
- BUG-25 (Medium) — erledigt, siehe „Previously Fixed“ oben.
- BUG-26 (Low) — behoben, siehe „Previously Fixed“ oben.
- [ ] Low, vorbestehend: `durationSeconds` als String im Speicher lässt `formatSeconds` werfen (`AutoDriveControls.tsx:624`, nur mit Zugriff auf den privaten App-Speicher); eine korrupte Preset-Liste (`[null, …]`) blockiert Speichern/Löschen (Toast statt Datenverlust).

### Security / Regression
- [x] Manipulierte AsyncStorage-Daten (NaN, negativ, Bruchzahl, falscher Bool) erreichen die Firmware nur innerhalb ihrer Grenzen: `client.ts:333-343`, `motor.cpp:381-382, 450-470`. Keine neuen Secrets im Diff. Restliche Punkte not applicable / not implemented (Rate Limiting) / `[!]`.
- [x] PROJ-4 AC-1, AC-3, AC-6, AC-9 (Probe + Suite); PROJ-5 unberührt (kein Preset-Zugriff, `useTimelapseSequence.ts:28, 475-476`). PROJ-4 AC-4+AC-5 zusammen und EC-2: FAIL → BUG-24.

### Nicht verifiziert
- [!] Alle Laufzeit-/Hardware-Ergebnisse: Ankunft nach Dauer, physische Richtung migrierter Presets, echte Notify-Reihenfolge (no way to run and probe this project was recorded)
- [!] Ob Presets aus dem Zeitfenster von BUG-25 existieren; Release-Bundle nicht neu gebaut; Optik/Layout

**Production-Ready: NEIN** — BUG-24 (High, Regression) ist offen; BUG-15/16/19 sind geschlossen. Status: **In Review**.

### Nachtrag 3: Re-Verifikation des BUG-24-Fixes (2026-09-30)

**Scope (Re-Verifikation):** `git diff d105b00..HEAD -- src features/PROJ-3-start-endpunkt-auto-fahrt/spec.md` (Commit `fd34882`): `AutoDriveControls.tsx` (+Test), `spec.md` (AC-12 präzisiert). Ein `qa-engineer`-Lauf mit allen drei Scopes. Alles andere: _unverändert seit 2026-09-29/30, in diesem Lauf nicht neu geprüft (AC-1..5, AC-7..10, EC-1..4 — Diff berührt sie nicht)_. `probe.kind: none` — Laufzeit/Hardware `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 12 Suites, 200 Tests, 0 Fehler (`suite5.log`). `npx eslint` auf die geänderten Dateien: exit 0. Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

### Ergebnis
- [x] **BUG-24, Hauptpfad geschlossen** — Render-Probe: Bereich 100000 → Preset „Schnell" (20000 Steps, 3.5 s) → „Als Start setzen" bei 50000 → Zwischen-Notify → bleibt „3.5"; gesendet wird `setStart`, `endFromDist(true, 20000)`, `auto(startToEnd, 3.5)` (`AutoDriveControls.tsx:172-177, 340-348`). Auch: Zwischen-Distanz 0, Preset ohne vorhandenen Endpunkt, React StrictMode (Doppel-Effekt idempotent).
- [x] **BUG-19/AC-12, erste Distanz** — Standardwert „10" + Distanz 160000 → „21.0", Auslöser aktiv; leer → „12.3" (90000); „abc" → „11.0" (80000); lange Dauer „900" bleibt (Probe, `:340-348`).
- [x] **AC-6, AC-11 unverändert korrekt** — „600" bleibt, Meldung „13.5–500.0 s"; „1" → „13.5" nach Blur; Distanz 1414 + leer → „0.9" (`:159-161, 184-186, 224`).
- [x] **PROJ-5** — `useTimelapseSequence.ts:28` importiert nur das unveränderte `minAutoDriveDurationSeconds`; mit `disabled=true` bleibt das Feld gesperrt (`RootScreen.tsx:122`, Probe).
- [x] **Security** — Diff fügt nur `useRef` und eine reine Funktion hinzu, keine neuen Eingabepfade/Secrets (`git diff d105b00..HEAD`).

### Offene / neue Bugs
- BUG-27 (High) — behoben, siehe „Previously Fixed“ oben.
- BUG-28 (Medium) — behoben, siehe „Previously Fixed“ oben.
- Weiterhin offen aus Nachtrag 2: **BUG-25** (Medium, bedingt: Presets aus dem Zeitfenster 2026-09-29 20:26 – 2026-09-30 00:18 würden von der Migration gedreht — der Nutzer muss klären, ob es solche gibt), BUG-17, BUG-20..23.
- Beobachtung (harmlos): Wird die Distanz bekannt → null → wieder bekannt, läuft die Korrektur erneut (Probe F); ein Disconnect läuft nicht über diesen Weg, weil `RootScreen.tsx:93-122` die Komponente außerhalb von `connected` aushängt.

### Nicht verifiziert
- [!] Echte Notify-Reihenfolge SET_START → Zwischen-Distanz → SET_END_FROM_DISTANCE auf dem ESP32, Ankunft nach Dauer, physisches Verhalten (no way to run and probe this project was recorded); PROJ-4 EC-2 nicht geprüft; Release-Bundle nicht gebaut; Optik/Layout; Firmware-Tests; Rate Limiting (not implemented).

**Production-Ready: NEIN** — BUG-27 (High, Regression PROJ-4) ist offen, dazu BUG-28 (Medium) und BUG-25 (Medium, bedingt). Status: **In Review**.

### Nachtrag 4: Fixes BUG-27/28, Nutzer-Test am Gerät (2026-09-30)

- **Fixes seit Nachtrag 3:** `b5c92da` (BUG-27/BUG-28: Auto-Korrektur bei jeder Änderung der bekannten Distanz, außer während ein Preset angewendet wird; `presetTargetDistanceRef`, `shouldAutoCorrectOnDistanceChange` mit drei Parametern), `3bccc04` (BUG-26: Design-Doku, PROJ-4 `dirVersion`, `docs/data-model.md`). 207 Tests grün, davon 7 neue Render-Tests in `AutoDriveControls.render.test.ts` (Preset-Ablauf komplett, Red-Check: ohne Guard 3 rot, ohne Änderungs-Regel 3 rot).
- [x] **BUG-25 erledigt — vom Nutzer bestätigt (2026-09-30):** im Zeitfenster 2026-09-29 20:26 – 2026-09-30 00:18 wurde kein Preset gespeichert, es gibt keine Presets mit falsch gedrehter Richtung; auf dem Gerät existierte vor dem Update kein altes Preset.
- [x] **BUG-26 geschlossen** — `design.md` (PROJ-3, PROJ-4) und `docs/data-model.md` aktualisiert (`3bccc04`).
- [x] **Nutzer-Test am Gerät („alles ok", 2026-09-30, Android EB2103, Debug-Build über Metro):** geprüft wurden das Laden eines Presets mit anschließendem „Als Start setzen" (Dauer bleibt) und die automatische Korrektur der Dauer bei langen Strecken. Umfang und Anzahl der Durchläufe nicht protokolliert.
- **Nicht durch einen unabhängigen `/qa`-Lauf verifiziert:** BUG-27 und BUG-28 (die Fixes `b5c92da`/`3bccc04` liegen nach dem letzten QA-Lauf). Status bleibt **In Review** bis zu einem weiteren `/qa PROJ-3` im Umfang dieser Commits.

### Nachtrag 5: Re-Verifikation der Fixes BUG-27/28 (2026-09-30)

**Scope (Re-Verifikation):** `git diff a9a30a7..HEAD -- src features/PROJ-3-start-endpunkt-auto-fahrt/spec.md` (Commits `b5c92da`, `3bccc04`, `dbf4001`, `0cd291b`): `AutoDriveControls.tsx` (+ Test, neue `AutoDriveControls.render.test.ts`), `TimelapseControls.tsx` (Kamera-Wrapper, PROJ-5-Datei im selben Screen), `spec.md` (AC-12 neu gefasst). Ein `qa-engineer`-Lauf mit allen drei Scopes, 25 eigene Render-Proben. Alles andere: _unverändert seit 2026-09-29/30, in diesem Lauf nicht neu geprüft (AC-1, AC-2, AC-4, AC-5, AC-7..AC-10, EC-1..EC-4, PROJ-1, PROJ-2)_. `probe.kind: none` — Laufzeit/Hardware `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 13 Suites, 207 Tests, 0 Fehler (`suite6.log`); `npx tsc --noEmit` exit 0; `npx eslint` auf die geänderten Dateien: 0 Fehler. Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

### Geschlossen
- [x] **BUG-27 geschlossen** — Probe: nur Endpunkt vorher, „Schnell" (20000 Steps / 3.5 s) → „Als Start setzen" → Zwischen-Notify 50000 → End-Notify 20000: Dauer bleibt „3.5", gesendet wird `auto(startToEnd, 3.5)`; „Kurz" (2000 / 1.0) mit Zwischen-Distanz 150000 bleibt „1.0", Auslöser aktiv (`AutoDriveControls.tsx:354-370, 440-444`). Auch: nur Start / beide / keiner vorher, Zwischen-Distanz 0, zwei überlappend angewendete Presets, „Als Ende setzen" oder Schreibfehler während der Apply-Phase (Guard wird gelöscht, danach korrigiert die Distanz wieder).
- [x] **BUG-28 geschlossen** — Distanz 50000 mit „10" bleibt „10", nach Vergrößerung auf 160000 wird „21.0" (`:185-189`); StrictMode idempotent.
- [x] **BUG-19, AC-6, AC-11** — leer bei 90000 → „12.3", „abc" bei 80000 → „11.0", „900" bleibt, „600" bleibt mit Meldung „11.0–400.0 s", „1" nach Blur → „11.0". Schrumpfende Distanz lässt eine zu lange Dauer stehen (Meldung wie AC-6), wie spezifiziert.
- [x] **PROJ-5 `TimelapseControls`** — Probe (3/3): Kamera mit `implementationMode: "compatible"`, `StyleSheet.absoluteFill`, Wrapper-View `height 200, overflow: 'hidden', borderRadius 12`; Permission-Zweig und „kein Gerät"-Zweig unverändert; Prop gültig für `react-native-vision-camera` 5.2.3 (`lib/specs/views/PreviewView.nitro.d.ts:18`). Optik `[!]` (Nutzer-Test am Gerät „alles ok", siehe Nachtrag 4).
- [x] **PROJ-4 AC-4, AC-5 (App-seitig), EC-2 (mit Einschränkung BUG-29), EC-3**; Security-Diff: keine neuen Eingabepfade/Secrets (`git diff a9a30a7..HEAD -- src`).

### Neue Bugs (durch den neuen Preset-Guard)
- BUG-29 (Medium) — behoben, siehe „Previously Fixed“ oben.
- BUG-30 (Medium) — behoben, siehe „Previously Fixed“ oben.
- BUG-31 (Low) — behoben, siehe „Previously Fixed“ oben.
- BUG-32 (Low) — behoben, siehe „Previously Fixed“ oben.

### Weiterhin offen (unverändert seit Nachtrag 2/3)
BUG-17, BUG-20..23 (Low). Beobachtung (Spec-konform): die App erhöht die Dauer bei langer Strecke selbst; verkürzt der Nutzer danach die Strecke, erscheint die AC-6-Meldung für einen Wert, den er nie eingegeben hat.

### Nicht verifiziert
- [!] Ankunft nach Dauer (AC-3/AC-4), echte Notify-Reihenfolge und ob die Firmware SET_END_FROM_DISTANCE verwirft, Stopp/Disconnect, Kamera-Optik, Release-Bundle-Secrets, Firmware-Tests, Rate Limiting (not implemented), Auth/Brute-Force/Credentials-in-URL (not applicable) — Laufzeit: no way to run and probe this project was recorded

**Production-Ready: NEIN** — BUG-29 und BUG-30 (Medium) verletzen AC-12; kein Critical/High offen. Nach Behebung genügt eine Re-Verifikation im Umfang dieser Fixes. Status: **In Review**.

### Nachtrag 6: Re-Verifikation der Fixes BUG-29..32 (2026-09-30)

**Scope (Re-Verifikation):** `git diff 76f0599..HEAD -- src features/PROJ-3-start-endpunkt-auto-fahrt/spec.md` (Commit `aa1ce58`): `AutoDriveControls.tsx`, `AutoDriveControls.render.test.ts`, `spec.md` (AC-12 ergänzt), eine Zeile `design.md`. Ein `qa-engineer`-Lauf mit allen drei Scopes, 45 eigene Render-Proben (`probe8/`). Alles andere: _unverändert seit 2026-09-30, in diesem Lauf nicht neu geprüft (AC-1, AC-2, AC-4, AC-5, AC-7..AC-10, EC-1..EC-4, PROJ-1, PROJ-2)_. `probe.kind: none` — Laufzeit/Hardware `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 13 Suites, 211 Tests, 0 Fehler, keine „did not exit"-Zeile (`suite7.log`); `npx tsc --noEmit` und `npx eslint` auf die geänderten Dateien: exit 0.

### Geschlossen
- [x] **BUG-29** — Probe: keine Punkte, „Schnell" laden, „2" tippen, anwenden → beim Eintreffen von 20000 „3.5", Auslöser aktiv; ebenso „3" mit Zwischen-Distanz und leeres Feld (`AutoDriveControls.tsx:374-389`).
- [x] **BUG-30, Hauptpfade** — Distanz kommt nie an → bei 2,9 s „1.0", bei 3,1 s „7.3"; gar kein Notify → „13.5"; Fehler bei SET_START → sofort „13.5"; Fehler bei SET_END_FROM_DISTANCE nach Re-Render → „7.3" (`:485, 490-492`).
- [x] **BUG-31, Hauptpfad** — zweite Anwendung nach 2,8 s ersetzt den Guard, Zwischen-Distanz lässt „1.0" stehen (`:472, 357-363`).
- [x] **BUG-32, Jest-Symptom** — keine „did not exit"-Zeile; Unmount räumt den laufenden Timer ab (`:380`).
- [x] **AC-6, AC-11, AC-12 Kernfälle, PROJ-4 AC-5 (App-seitig), EC-2, EC-3** — u. a. Preset-eigene Dauer bleibt für „Schnell" 3.5, „Kurz" 1.0 (exaktes Minimum), „Lang" 40.0, 16000/3.0, 12345/2.6, 1414/0.9; lange Dauern werden nie überschrieben; StrictMode idempotent. PROJ-5 unverändert (Diff leer), Suite grün.

### Neue Bugs (durch `aa1ce58`)
- BUG-33 (High) — entfallen mit `df41c8c`, siehe „Previously Fixed“ oben.
- BUG-34 (Low) — entfallen mit `df41c8c`, siehe „Previously Fixed“ oben.
- BUG-35 (Low) — entfallen mit `df41c8c`, siehe „Previously Fixed“ oben.
- BUG-36 (Low) — entfallen mit `df41c8c`, siehe „Previously Fixed“ oben.
- BUG-37 (Low) — entfallen mit `df41c8c`, siehe „Previously Fixed“ oben.
- Außerhalb Scope bemerkt (nicht neu): ein geladenes Preset bleibt nach dem Anwenden aktiv, jedes weitere „Als Start setzen" wendet es erneut an; ein kurzes Preset ist bei bekannter größerer Distanz bis zum Anwenden stumm gesperrt.

### Nicht verifiziert
- [!] Echte Notify-Reihenfolge relativ zur Write-Antwort (entscheidet, wie oft BUG-33 vorkommt), Batching in React Native (BUG-35), Ankunft nach Dauer, Stopp/Disconnect, Optik, Release-Bundle-Secrets, Firmware-Tests — no way to run and probe this project was recorded; Rate Limiting not implemented; Auth/Brute-Force/Credentials-in-URL not applicable.

**Production-Ready: NEIN** — BUG-33 (High, Regression PROJ-4 AC-4). Status: **In Review**.

### Nachtrag 7: AC-12 neu umgesetzt, Nutzer-Test am Gerät (2026-09-30)

- **Umbau `df41c8c`:** automatische Korrektur bei Distanzänderung samt Preset-Schutzphase und 3-s-Timer entfernt. Ist die Dauer zu kurz, leer oder unlesbar, zeigt die App „Zu kurz für diese Strecke — Minimum X s" bzw. „Keine gültige Dauer — Minimum X s" mit Button „Minimum übernehmen"; die Dauer wird außerhalb von AC-11 nie selbst geändert. AC-12 in `spec.md` neu gefasst, `design.md` ersetzt die drei früheren AC-12-Einträge. Damit entfallen die Mechanismen hinter BUG-33 bis BUG-37. 210 Tests grün; Red-Check der Render-Tests: ohne Hinweis 4 rot, mit der alten Auto-Korrektur 8 rot.
- [x] **Nutzer-Test am Gerät („alles ok", 2026-09-30, Android EB2103, Debug-Build über Metro):** neue Dauer-Anzeige mit „Minimum übernehmen" und Preset-Ablauf (Dauer bleibt). Umfang und Anzahl der Durchläufe nicht protokolliert.
- **Nicht durch einen unabhängigen `/qa`-Lauf verifiziert:** `df41c8c`. Status bleibt **In Review**.

### Nachtrag 8: Re-Verifikation nach AC-12-Neufassung — voller Fan-out (2026-09-30)

**Scope:** Vertragswechsel (AC-12 neu gefasst, `df41c8c`) → volle Breite mit drei `qa-engineer`-Lanes (Acceptance, Security, Regression). Diff seit dem letzten QA-Lauf: `git diff 69cd64f..HEAD -- src` → `AutoDriveControls.tsx` (+ Tests), `TimelapseControls.tsx` (PROJ-5, `b7de19b`). Firmware, `src/ble`, `src/connection`, `src/screens`, `usePresets.ts` unverändert (`git diff --quiet`, exit 0). `probe.kind: none` — Laufzeit/Hardware `[!] NOT VERIFIED — no way to run and probe this project was recorded`.

**Test-Suite (einmalig, Owner):** `npm test` → 13 Suites, 210 Tests, 0 Fehler, keine „did not exit"-Zeile (`suite8.log`); `npx tsc --noEmit` exit 0; `npx eslint` auf die geänderten Dateien 0 Fehler (eine ältere `no-void`-Warnung in `TimelapseControls.tsx:161`, nicht aus dem Diff). Layer `firmware`: `[!] NOT VERIFIED — no test command recorded for layer firmware`.

### Acceptance Criteria (eigene Render-Probe mit 9 Szenarien, ~230 Zustände; Numerik-Simulation d = 1–160000)
- [x] **AC-1, AC-2** — Code: `AutoDriveControls.tsx:407-428`, `motor.cpp:361-378`; physisch `[!]`
- [x] **AC-3, AC-4** — Code + Probe: nach „Minimum übernehmen" wird `auto startToEnd 21` gesendet; Richtungen `atStart`/`atEnd` (`:360-361`, `motor.cpp:409-411`). Bekannte Hz-Rundung quantifiziert: schlimmster Fall 160000 Steps / 798 s → Ankunft ~1,95 s zu früh (−0,245 %). Ankunft nach Dauer `[!]`
- [x] **AC-5** — Stopp nur bei `driving` (`:608-620`), Firmware `motor.cpp:311-336`; „sofort" `[!]`
- [x] **AC-6** — „900" bleibt, „erlaubt: 13.5–500.0 s"; angezeigte Grenzen in 0 Fällen ungültig (d ≥ 35). BUG-20 (Meldung schon beim Tippen) unverändert
- [x] **AC-7, AC-8, EC-1** — Probe: ohne/mit einem Punkt beide Auslöser aus + „Kein Start-/Endpunkt gesetzt"; Distanz 0 → EC-1-Meldung; `atEnd` → nur „Ende → Start" aktiv
- [x] **AC-9** — alle Bedienelemente an `lockedByOtherMode` (`:378, 516, 527, 549, 568, 627, 648, 662`), Jog `RootScreen.tsx:119`, Firmware `motor.cpp:239, 365, 373, 381`; physisch `[!]`
- [x] **AC-10, EC-2, EC-4** — Garantien im Code (`ble.cpp:125-127`, `motor.cpp:342-350, 397-398`, serielle Writes); Laufzeit `[!]`
- [x] **AC-11** — „1", leer, „abc", „13.44" → „13.5" nach Blur (d = 100000); eingetragener Wert nie größer als nötig. Rest BUG-17 (28 Distanzen ≤ 34 Steps)
- [x] **AC-12** — Hinweis exakt („Zu kurz für diese Strecke — Minimum 21.0 s" / „Keine gültige Dauer — Minimum 13.5 s"), Mindestwert aufgerundet (d=1414 → 0.9), Button trägt ein und gibt frei, bei Fahrt/Zeitraffer gesperrt; 160 Kombinationen: 0× beide Meldungen, 0× gesperrt ohne Meldung (bei `atStart`); die App ändert die Dauer nie selbst (4 Schreiber, kein `useEffect`/`setTimeout`; „4.2" bleibt über 12 Distanz-Notifies); Preset-Dauer bleibt für „Schnell" 3.5, „Lang" 90.0 (Rückrichtung), „Mini" 1414/0.9, Zwischen-Distanz 0
- [x] **EC-3** — Code `ble.cpp:87-89`, `useSliderStatus.ts:50-53`; Restfall BUG-18 unverändert

### Security
- [x] Keine neuen Bugs, keine Verschlechterung. „Minimum übernehmen" setzt nur State, sendet nichts (`:326-338`); gesendet wird nur bei `durationValid`. Simulation: übernommener Mindestwert 0× zu kurz, 0× von der Firmware abgelehnt, wenn die App ihn gültig findet. Manipulierte Preset-Daten und gefälschte Status-Distanz bleiben in den Firmware-Grenzen. Alle Timer/Effekte entfernt → keine State-Updates nach Unmount. Keine Secrets im Diff/Quelltext (`git grep`).
- **Zusammenfassung:** 8 Checks verifiziert, 5 NOT VERIFIED (Laufzeit; Authorization/Brute Force/Enumeration/Credentials in URL nicht anwendbar; Rate Limiting not implemented; Release-Bundle vom 27.09. veraltet, nicht neu gebaut).

### Regression
- [x] **PROJ-4** (eigene Probe, 8/8): AC-1..AC-9, EC-2..EC-5, Migration `dirVersion` unverändert; Preset-Dauer während der Anwendung bleibt („3.5").
- [x] **PROJ-5** (eigene Probe, 4/4): Kamera-Wrapper ohne `implementationMode`, Permission-Zweig, „kein Gerät"-Zweig; `useTimelapseSequence` nutzt `minAutoDriveDurationSeconds` unverändert.
- [x] **PROJ-1, PROJ-2**: Dateien unverändert, zugehörige Tests grün.
- [x] Keine verwaisten Referenzen auf entfernte Symbole im Code.

### Neue Befunde (alle Low)
- [ ] **BUG-38 (Low, UX):** nach dem Laden eines Presets bezieht sich der Zu-kurz-Hinweis bis zum Eintreffen der Preset-Distanz auf die alte bzw. Zwischen-Distanz; tippt der Nutzer genau dann „Minimum übernehmen", geht die Preset-Dauer verloren (Probe: „Mini" 0.9 → „8.5" → danach „erlaubt: 0.9–7.0 s"). Nur per Nutzeraktion, Workaround: Preset neu laden. Spec-konform im Wortlaut.
- [ ] **BUG-39 (Low, UX):** ein langes Preset zeigt bis zum Anwenden die AC-6-Meldung „Ungültige Dauer" für die alte Distanz.
- [ ] **BUG-40 (Low):** steht der Schlitten an keinem der beiden Punkte (nach jedem Jog weg), sind beide Auslöser gesperrt, die Statuszeile zeigt „Bereit" — kein sichtbarer Grund. AC-8 verlangt nur die Sperre; verwandt mit BUG-10.
- [ ] **BUG-41 (Low, Doku-Drift):** Kommentar `AutoDriveControls.tsx:304-310` („no longer shows an error at all") ist seit `df41c8c` falsch; `design.md:121-124` beschreiben den entfernten Mechanismus noch im Präsens (Zeile 125 markiert sie als ersetzt).
- Weiterhin offen: BUG-17, BUG-20..23 (Low).

### Nicht verifiziert
- [!] Alle Laufzeit-/Hardware-Aussagen (physisches Setzen, Ankunft nach Dauer, Sofort-Stopp, Tastensperre, Disconnect-Stopp, Doppel-Tap, Reconnect, Hintergrund, Notify-Reihenfolge) — no way to run and probe this project was recorded
- [!] ScrollView bei offener Tastatur (erster Tipp schließt evtl. nur die Tastatur), Optik der Hinweiszeile, Kamera-Clipping beim Scrollen ohne TextureView — nur am Gerät prüfbar

**Production-Ready: NOT READY — not verified.** Keine Critical/High/Medium-Bugs offen. Die Laufzeit-ACs sind in diesem Lauf nicht ausgeführt; der protokollierte Hardware-Test vom 2026-09-24 liegt vor der Firmware-Änderung (8000 Steps/s, DIR-Umkehr, BUG-16-Fix). Freigabe nur über einen neu protokollierten Nutzer-Test (Checkliste an den Nutzer übergeben). Status: **In Review**.

### Nachtrag 9: Protokollierter Nutzer-Test am Gerät — Freigabe (2026-09-30)

Checkliste an den Nutzer übergeben, Antwort „alles ok" für alle Punkte. Gerät: Android EB2103 (Debug-Build über Metro), Firmware-Stand `5feb442` (8000 Steps/s, DIR-Umkehr, BUG-16-Fix), App-Stand `b7de19b`/`df41c8c`.

- [x] **AC-1, AC-2** — Start- und Endpunkt nach Jog gesetzt — vom Nutzer am Gerät bestätigt, 2026-09-30
- [x] **AC-3** — „Start → Ende" mit 10 s kommt nach etwa dieser Zeit am Ende an — vom Nutzer am Gerät bestätigt, 2026-09-30
- [x] **AC-4** — „Ende → Start" mit derselben Dauer — vom Nutzer am Gerät bestätigt, 2026-09-30
- [x] **AC-5** — „Stopp" während der Fahrt hält sofort an — vom Nutzer am Gerät bestätigt, 2026-09-30
- [x] **AC-9** — Jog-Tasten und „Als Start setzen" reagieren während der Fahrt nicht — vom Nutzer am Gerät bestätigt, 2026-09-30
- [x] **AC-10** — Bluetooth am Handy aus während der Fahrt → Slider stoppt eigenständig — vom Nutzer am Gerät bestätigt, 2026-09-30
- [x] **AC-12** — Hinweis bei zu kurzer Dauer, „Minimum übernehmen" gibt die Fahrt frei — vom Nutzer am Gerät bestätigt, 2026-09-30

Einschränkung: Genauigkeit der Ankunftszeit nur „etwa" (keine Stoppuhr-Messung protokolliert); Anzahl der Durchläufe nicht protokolliert. Nicht im Nutzer-Test: EC-2 (Doppel-Tap), EC-3 (Reconnect), EC-4 (Hintergrund) — Garantien im Code bestätigt (Nachtrag 8).

**Production-Ready: JA.** Keine Critical/High/Medium-Bugs offen; die Laufzeit-ACs sind durch den protokollierten Nutzer-Test ausgeführt. Offen bleiben nur Low-Bugs (BUG-17, BUG-20..23, BUG-38..41). Status: **Approved**.
