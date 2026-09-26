# PROJ-5 — Tech Design

> Plattform: **mobile** (Android, React Native) — wie bei PROJ-1/2/3/4.
> Ein Handy übernimmt beide Rollen: es steuert den Slider per BLE (wie bisher) **und** macht mit seiner eigenen Kamera die Zeitraffer-Aufnahmen (spec.md Decision Log).
> Das Feature spannt zwei Layer: die **App** (React Native, neuer Abschnitt neben `AutoDriveControls`) und die **Firmware** (Layer `firmware`, ESP32/PlatformIO). Die Grenze ist eine additive Erweiterung des BLE-Kommandoprotokolls um einen neuen Opcode und ein zusätzliches Bit in der Status-Characteristic — dieselbe Erweiterungsart wie schon bei PROJ-4.
> Erfordert PROJ-3 (Deployed) — nutzt dessen Start-/Endpunkt-Konzept unverändert weiter, führt aber eine eigene, neue Bewegungsart in der Firmware ein (siehe unten, Begründung).

## Component Structure

```
RootScreen (PROJ-1, unverändert)
+-- ConnectionHeader (PROJ-1, unverändert)
+-- ContentArea (Zustand `connected`)
    +-- JogControls (PROJ-2/3, erweitert: zusätzlicher `disabled`-Zustand während Zeitraffer läuft)
    +-- AutoDriveControls (PROJ-3/4, erweitert: zusätzlicher `disabled`-Zustand während Zeitraffer läuft; Presets-Bereich darin ebenfalls gesperrt)
    +-- TimelapseControls (NEU) — eigener Abschnitt für PROJ-5, sichtbar wie AutoDriveControls immer im verbundenen Zustand
        +-- CameraPreview (NEU) — Live-Kamerabild zum Ausrichten des Schlitten-Handys, sichtbar sobald Kamera-Berechtigung erteilt ist
        +-- ShotCountInput / IntervalInput (NEU) — Eingabe Anzahl Aufnahmen (2–999) und Intervall in Sekunden (1–3600)
        +-- ComputedDurationLine (NEU) — errechnete Gesamtdauer, nur Anzeige
        +-- StartTimelapseButton (NEU) — aktiv, wenn Start+Ende gesetzt, Schlitten exakt am Startpunkt steht, Kamera-Berechtigung erteilt ist und keine andere Fahrt (Auto-Fahrt/Zeitraffer) läuft
        +-- TimelapseProgress (NEU) — "Aufnahme X von Y" + verbleibende Zeit, sichtbar nur während laufender Sequenz
        +-- StopTimelapseButton (NEU) — sichtbar nur während laufender Sequenz, hält Bewegung und Sequenz sofort an
        +-- PermissionHint (NEU) — Hinweistext + Aktion, wenn Kamera-Berechtigung fehlt (AC-5)
```

`ShotCountInput`, `IntervalInput`, `TimelapseProgress`, `StopTimelapseButton`, `PermissionHint` werden direkt in `TimelapseControls` ergänzt — kein separates Eltern-Kind-Verhältnis, gleiches Strukturmuster wie PROJ-4s `AutoDriveControls`-Erweiterung.

## Datenmodell

Keine neue persistierte Entität — `docs/data-model.md` bleibt unverändert. Anzahl Aufnahmen, Intervall und der Sequenz-Fortschritt sind reiner, flüchtiger UI-Zustand in `TimelapseControls`, nichts davon wird gespeichert (spec.md → Out of Scope: keine Zeitraffer-Presets). Aufgenommene Fotos werden nicht von der App verwaltet, sondern landen direkt in der geräteeigenen Foto-Galerie (Verantwortung des Betriebssystems, nicht der App).

## Warum eine neue Bewegungsart in der Firmware nötig ist

PROJ-3s `motorAutoDrive()` fährt ausschließlich zwischen den beiden **registrierten** Punkten `startPosition`/`endPosition` und verlangt dafür, dass der Schlitten exakt an einem der beiden physisch steht — er kennt keine Zwischenpunkte. Eine Zeitraffer-Sequenz mit `N` Aufnahmen braucht aber `N-1` Fahrten zu `N-1` verschiedenen Zwischenpunkten zwischen Start und Ende. Das bestehende `SET_END_FROM_DISTANCE` (PROJ-4) böte zwar eine Möglichkeit, `endPosition` bei jedem Schritt auf den nächsten Zwischenpunkt umzubiegen — das würde aber den vom Nutzer gesetzten, echten Endpunkt bei jedem Zwischenschritt überschreiben und am Ende der Sequenz verloren gehen lassen (u. a. gebraucht für die automatische Rückfahrt zum Start, AC-2). Deshalb bekommt die Firmware eine eigene, neue, rein additive Bewegungsart, die `startPosition`/`endPosition` gar nicht anfasst — siehe „Grenze zur Firmware" unten.

## Grenze zur Firmware (Erweiterung des BLE-Kommandoprotokolls)

**Command-Characteristic** (`6e400002-…`) bekommt einen neuen Opcode neben den bestehenden (JOG `0x01`, SET_START `0x02`, SET_END `0x03`, AUTO_DRIVE `0x04`, STOP `0x05`, SET_END_FROM_DISTANCE `0x06`):

| Opcode | Name | Payload | Übertragungsart | Bedeutung |
|---|---|---|---|---|
| `0x07` | TIMELAPSE_MOVE | 1 Byte Richtung (`0x00` = in Richtung steigender Schritte vom Start, `0x01` = fallend) + 4 Byte Distanz **vom Startpunkt** in Steps (uint32, little-endian) | Write mit Antwort | Fährt direkt zur absoluten Position `startPosition ± Distanz` — verändert weder `startPosition` noch `endPosition` noch `hasEnd`; unabhängige, eigene Bewegungsart neben Auto-Fahrt |

Gleiches Verschlüsselungs-/Antwortmuster wie alle bisherigen sicherheitsrelevanten Opcodes: Write **mit** Antwort, verlangt weiterhin die bestehende `WRITE_ENC`-Absicherung der Characteristic (PROJ-2) — kein neuer, ungesicherter Pfad.

**Verhalten/Schutzmechanismen** (analog zu `motorAutoDrive()`/`motorSetEndFromDistance()`):
- Verlangt `hasStart` (ohne registrierten Startpunkt gibt es keine Referenz)
- Verweigert, wenn der Motor bereits läuft, eine Auto-Fahrt läuft, oder bereits eine Zeitraffer-Bewegung läuft
- Verweigert, wenn die Distanz die bestehende Plausibilitätsgrenze überschreitet (dieselbe Konstante wie PROJ-4s BUG-1-Fix, `kMaxPlausibleDistanceSteps`, aktuell 76800 Steps) — dieselbe Schutzlogik, kein zweiter Wert zum Pflegen
- Bewegungsgeschwindigkeit: fester technischer Wert, die bestehende `kJogSpeedMaxHz`-Konstante (4000 Steps/s) — kein neues Tuning, keine neue Nutzer-Einstellung

**Umgekehrter Schutz:** `motorAutoDrive()` bekommt eine zusätzliche Verweigerungsbedingung (`!timelapseMoving`), `motorWatchdogCheck()`s bestehender Früh-Ausstieg wird um `timelapseMoving` erweitert (dieselbe Begründung wie für `autoDriving`: kein Jog-Herzschlag-Muster während einer laufenden Zeitraffer-Bewegung nötig) — genau dieselben Absicherungen, die PROJ-3 schon für Auto-Fahrt eingeführt hat, jetzt symmetrisch auf die neue Bewegungsart angewendet.

**STOP** (`0x05`) hält zusätzlich zu Jog/Auto-Fahrt jetzt auch eine laufende Zeitraffer-Bewegung sofort an (`motorStop()` setzt `timelapseMoving = false` zusätzlich zu `autoDriving = false`).

**Status-Characteristic** (`6e400003-…`) bleibt bei 6 Byte — reine Bit-Erweiterung, kein neues Byte nötig:

| Byte | Inhalt |
|---|---|
| 0 | Flags-Bitfeld — unverändert Bit 0–4 (`hasStart`, `hasEnd`, `atStart`, `atEnd`, `driving`), **NEU Bit 5**: `timelapseMoving` (true, solange die aktuelle Zeitraffer-Bewegung noch läuft) |
| 1–5 | unverändert (Distanz + Endpunkt-Richtung, PROJ-3/4) |

Bit 5 war bisher unbenutzt (nur Bit 0–4 belegt) — rein additiv, keine bestehende Auswertung betroffen.

## App-seitige Sequenzsteuerung

Ein neuer Hook `useTimelapseSequence(device)` besitzt die Ablaufsteuerung (kein neuer BLE-Zustand in `useSliderStatus` nötig, der Hook nutzt dessen Status-Stream mit):

```
start(shotCount, intervalSeconds):
  Aufnahme 1 sofort am aktuellen (Start-)Punkt
  für Schritt i = 2 bis shotCount:
    Zielposition (vom Start aus) = runde(Gesamtdistanz * (i-1) / (shotCount-1))
      -> für i = shotCount ergibt das exakt die volle Distanz (= endPosition), keine
         Rundungsabweichung am letzten Schritt (wichtig für die exakte Rückfahrt, AC-2)
    TIMELAPSE_MOVE(Zielposition) senden
    warten, bis die Status-Meldung "timelapseMoving = true" bestätigt (die Bewegung
      wurde tatsächlich angenommen) — bleibt das aus, gilt der Schritt als fehlgeschlagen (AC-6)
    warten, bis die Status-Meldung "timelapseMoving = false" meldet (angekommen)
    feste Settle-Pause abwarten
    Foto auslösen, in Galerie speichern
    Rest des Intervalls (Intervall - bisher verstrichene Zeit für diesen Schritt) abwarten,
      mindestens 0
  nach der letzten Aufnahme: bestehenden AUTO_DRIVE (Richtung Ende->Start) senden, um zum
    Startpunkt zurückzufahren (AC-2) — reine Wiederverwendung, keine neue Bewegungsart nötig,
    da der Schlitten nach dem letzten Schritt exakt am registrierten Endpunkt steht

stop(): STOP-Kommando senden, Sequenz sofort als beendet markieren, keine Rückfahrt (AC-4)
```

Der zweistufige Warte-Schritt („erst bestätigt gestartet, dann bestätigt angekommen") ist bewusst so gewählt: `AutoDriveControls`s `handleSetStart` verließ sich früher nur auf die BLE-Schreib-Antwort (reiner Protokoll-Ack) als Erfolgssignal und leitete daraus fälschlich einen Erfolg ab, obwohl die Firmware den Befehl intern still verwerfen konnte (`qa-report.md` PROJ-4, BUG-5, weiterhin offen) — ein früherer Versuch, das über ein einfaches "warte auf irgendeine passende Notify" zu lösen, scheiterte, weil die Firmware nur bei **geänderter** Payload benachrichtigt und ein bereits zutreffendes Feld gar keine neue Notify auslöst. Für `TIMELAPSE_MOVE` gilt das nicht: `timelapseMoving` kippt bei jedem echten Bewegungsschritt garantiert erst zu `true`, dann zu `false` (die Distanz ist bei jedem Schritt echt größer null), es gibt keinen "war schon so"-Fall — der zweistufige Warte-Ansatz ist hier also tatsächlich verlässlich, anders als beim PROJ-4-Fall.

## Kamera-Integration

- `react-native-vision-camera` — Live-Vorschau (`CameraPreview`) und Foto-Aufnahme. Aktuelle API (Context7, 2026-09-25): `useCameraPermission()`-Hook für die Berechtigungsprüfung/-anfrage (AC-5), `usePhotoOutput()` + `capturePhotoToFile()` für die Aufnahme selbst. Setzt React Natives New Architecture voraus (`react-native-vision-camera` ist auf Nitro Modules aufgebaut) — passt zu diesem Projekt, das bereits mit `newArchEnabled=true` baut (`android/gradle.properties`).
- `@react-native-camera-roll/camera-roll` — speichert die von `capturePhotoToFile()` gelieferte Datei in die normale Geräte-Galerie (AC-10); von `react-native-vision-camera`s eigener Dokumentation als Standardkombination empfohlen.
- Wakelock/Keep-Awake (AC-8): eine leichtgewichtige Keep-Awake-Bibliothek (Kandidat: `@sayem314/react-native-keep-awake`) — `/build` prüft vor der Installation gegen die vendorte Quelle, ob sie mit `newArchEnabled=true` baut, dieselbe Disziplin wie bei jeder anderen Bibliotheks-Einbindung in diesem Projekt.

## Dependencies

- `react-native-vision-camera` — Kamera-Vorschau + Foto-Aufnahme
- `react-native-nitro-modules`, `react-native-nitro-image` — Laufzeit-Voraussetzungen von `react-native-vision-camera` Core (nicht optional, während `/build` per Context7 gegen die aktuelle Installationsanleitung verifiziert — ohne sie lädt die Bibliothek nicht; ursprünglich nicht in diesem Entwurf genannt, hier nachgetragen)
- `@react-native-camera-roll/camera-roll` — Foto in die Geräte-Galerie speichern
- `@sayem314/react-native-keep-awake` — verhindert das Sperren des Bildschirms während einer laufenden Sequenz; während `/build` gegen die vendorte Quelle geprüft (`peerDependencies`/`codegenConfig`: explizit New-Architecture-only, passt zu diesem Projekt) — kein Wechsel auf eine Alternative nötig

## Settings the user makes

Keine — kein Backend, kein Provider-Dashboard betroffen. Die Kamera-Berechtigung ist eine App-Laufzeit-Berechtigung (AC-5), kein Dashboard-Setting.

## Technische Entscheidungen

| Decision | Rationale | Alternative considered | Trade-off | Date |
|---|---|---|---|---|
| Neuer Opcode TIMELAPSE_MOVE (`0x07`), der `startPosition`/`endPosition`/`hasEnd` unangetastet lässt | Zwischenpunkte einer Zeitraffer-Sequenz sind kein Ersatz für die vom Nutzer registrierten Start-/Endpunkte; die müssen für die automatische Rückfahrt (AC-2) und die Auto-Fahrt-Anzeige über die ganze Sequenz hinweg intakt bleiben | Zwischenpunkte über wiederholtes SET_START + SET_END_FROM_DISTANCE + AUTO_DRIVE "erschleichen" (kein neuer Opcode nötig) | Hätte den vom Nutzer gesetzten Start-/Endpunkt bei jedem Zwischenschritt überschrieben und am Ende der Sequenz verloren — Start-/Endpunkt-Anzeige in der UI wäre während der Sequenz irreführend gewesen | 2026-09-25 |
| TIMELAPSE_MOVE nutzt dieselbe Plausibilitätsgrenze (`kMaxPlausibleDistanceSteps`) wie PROJ-4s SET_END_FROM_DISTANCE | Beide Opcodes bewegen den Schlitten zu einer aus einer Distanz abgeleiteten Position ohne physische Bestätigung — dieselbe Sicherheitsüberlegung, eine einzige zu pflegende Konstante statt zwei | Eigene, neue Konstante für Zeitraffer-Bewegungen | Keiner nennenswerter — die Bewegungen einer Zeitraffer-Sequenz liegen ohnehin immer innerhalb der Start-Ende-Strecke, also weit unter der Grenze | 2026-09-25 |
| Letzter Zeitraffer-Schritt wird direkt als `Gesamtdistanz * (N-1)/(N-1)` berechnet, nicht inkrementell aus vorherigen Rundungen aufsummiert | Garantiert, dass der Schlitten nach dem letzten Schritt exakt an `endPosition` steht — Voraussetzung für die Wiederverwendung des bestehenden AUTO_DRIVE(Ende→Start) für die Rückfahrt (AC-2), das exakte Übereinstimmung verlangt | Feste Schrittweite (Gesamtdistanz/(N-1)) bei jedem Schritt gleichermaßen addieren | Rundungsfehler könnten sich über viele Schritte aufsummieren und den letzten Schritt leicht neben `endPosition` landen lassen, wodurch AUTO_DRIVE die Rückfahrt verweigert | 2026-09-25 |
| Rückfahrt zum Start nutzt das bestehende AUTO_DRIVE (Richtung Ende→Start) statt einer neuen Bewegungsart | Volle Wiederverwendung von PROJ-3 — der Schlitten steht nach dem letzten Schritt exakt am registrierten Endpunkt | Auch die Rückfahrt über TIMELAPSE_MOVE abwickeln | Hätte eine zweite, redundante Bewegungsart für denselben Zweck gebraucht | 2026-09-25 |
| Zweistufige Bestätigung (erst `timelapseMoving=true`, dann `=false`) statt reiner Zeit-Schätzung oder BLE-Schreib-Antwort als Erfolgssignal | Schließt für diesen neuen Opcode dieselbe Lücke, die in PROJ-4 als BUG-5 offen blieb (ein BLE-Write-Ack allein bestätigt nicht, dass die Firmware den Befehl tatsächlich angenommen hat) — hier sicher anwendbar, weil `timelapseMoving` bei jedem echten Bewegungsschritt garantiert kippt, anders als bei PROJ-4s SET_START-Fall | Feste Zeit abwarten (Distanz/Geschwindigkeit, clientseitig geschätzt), keine Firmware-Bestätigung | Eine falsche Zeitschätzung oder ein still verworfener Befehl (z. B. weil eine Bedingung nicht mehr zutrifft) würde unbemerkt zu einem Foto an der falschen Position führen | 2026-09-25 |
| Kamera: `react-native-vision-camera` + `@react-native-camera-roll/camera-roll` | Etablierteste, aktiv gepflegte Kombination für Foto-Aufnahme + Galerie-Speicherung in React Native; `react-native-vision-camera` unterstützt explizit die New Architecture, die dieses Projekt bereits nutzt | `react-native-camera` (unmaintained/deprecated), `expo-camera` (setzt Expo voraus, das dieses Projekt nicht nutzt) | Keiner nennenswerter für den ersten Kandidaten; `/build` verifiziert die exakte API-Version gegen die vendorte Quelle vor der Implementierung | 2026-09-25 |
| "Sequenz läuft"-Zustand lebt als eigener App-Zustand (nicht nur aus `timelapseMoving` abgeleitet) und wird an `JogControls`/`AutoDriveControls` als zusätzliche Sperre durchgereicht | `timelapseMoving` ist nur während der eigentlichen Bewegung true — zwischen den Schritten (Settle-Pause, Foto, Rest-Intervall-Wartezeit) ist die Firmware wieder im Leerlauf, obwohl aus Nutzersicht die ganze Sequenz noch läuft und andere Bedienelemente weiterhin gesperrt bleiben müssen (AC-9) | Sperren ausschließlich aus dem Firmware-Status (`driving`/`timelapseMoving`) ableiten | Hätte Jog/Auto-Fahrt/Presets zwischen den Zeitraffer-Schritten kurzzeitig wieder freigegeben — ein Nutzer könnte versehentlich mitten in der Sequenz eine Auto-Fahrt auslösen | 2026-09-25 |
| Bildschirm-Wachhalten via Keep-Awake-Bibliothek, aktiviert bei Sequenzstart, deaktiviert bei Abschluss/Abbruch/Fehler | Direkteste Umsetzung von AC-8, symmetrisch zum Sequenz-Lebenszyklus | Kein Wachhalten, nur Hinweistext an den Nutzer | Der Nutzer müsste den Bildschirm während der gesamten Sequenz manuell wach halten — widerspricht dem in spec.md festgehaltenen Produktentscheid | 2026-09-25 |

## Open Questions

- [ ] Aus spec.md übernommen: konkrete Kamera-Bibliothek und Wakelock-Mechanismus sind hier jetzt benannt (siehe Dependencies) — `/build` verifiziert beide vor der Installation gegen ihre vendorten Quellen, insbesondere die New-Architecture-Kompatibilität der Keep-Awake-Bibliothek, die hier nicht abschließend geprüft werden konnte
