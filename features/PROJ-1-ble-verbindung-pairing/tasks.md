# PROJ-1 Tasks

> Erzeugt von `/tasks` aus `spec.md` + `design.md`. Der geordnete, nachvollziehbare Build-Plan — die Brücke zwischen dem Vertrag (WAS) und dem Bau (WIE).
> `[P]` = parallelisierbar: die Dateien des Tasks sind disjunkt von jedem anderen `[P]`-Task derselben Ebene, `/build` kann ihn an einen eigenen Subagenten geben.
> Ebenen laufen **sequenziell** (jede ist eine Barriere). Tasks **innerhalb** einer Ebene laufen parallel, wo mit `[P]` markiert. Jeder Task referenziert die AC-IDs aus `spec.md`, die er erfüllt — das ist die AC → Task → Test-Kette.
> Owner: `/tasks` erstellt diese Datei; `/build` hakt die Boxen ab.
> Kein Status-Feld hier — der Feature-Status lebt ausschließlich in `features/INDEX.md`.

## Level 1 — Projekt-Grundgerüst

<!-- Fundament für App und Firmware. Beide Bereiche sind komplett disjunkt (App-Root vs. firmware/) → beide [P]. -->

- [ ] T1 [P]  React-Native-Projekt "CameraSliderApp" (TypeScript-Template) initialisieren  · files: package.json, App.tsx, tsconfig.json  · → AC-1–AC-9 (Voraussetzung)
- [ ] T2 [P]  PlatformIO-Firmware-Projekt in `firmware/` anlegen (platformio.ini, main.cpp-Grundgerüst)  · files: firmware/platformio.ini, firmware/src/main.cpp  · → AC-1–AC-9 (Voraussetzung)

## Level 2 — BLE-Grundbausteine

<!-- Firmware-Advertising, App-BLE-Client und App-Berechtigungen sind drei disjunkte Bereiche → alle drei [P]. -->

- [ ] T3 [P]  Firmware: NimBLE-Server mit SERVICE_UUID + Gerätename, Advertising starten, kein Bonding/Verschlüsselung, onConnect/onDisconnect-Callbacks  · files: firmware/src/ble.h, firmware/src/ble.cpp, firmware/src/main.cpp  · → AC-2, AC-3, AC-9
- [ ] T4 [P]  `react-native-ble-plx` einbinden; BLE-Client-Singleton mit Scan gefiltert nach SERVICE_UUID, verbindet automatisch zum ersten Treffer  · files: package.json, src/ble/client.ts  · → AC-2, AC-9
- [ ] T5 [P]  Android-Manifest-Berechtigungen (BLUETOOTH_SCAN/CONNECT, ACCESS_FINE_LOCATION maxSdk 30) + Laufzeit-Request-Funktion mit Versions-Weiche (Android 12+ vs. ≤11)  · files: android/app/src/main/AndroidManifest.xml, src/permissions/requestBlePermissions.ts  · → AC-1, AC-6

## Level 3 — Zustandslogik

<!-- Reine Funktion, unabhängig testbar. Baut auf keinem der vorherigen Tasks inhaltlich auf, folgt aber erst nach den Grundbausteinen. -->

- [ ] T6  `connectionReducer.ts`: Zustands-Enum (`checking_permissions` … `not_found`) + alle Übergänge als reine, testbare Funktion  · files: src/connection/connectionReducer.ts, src/connection/connectionReducer.test.ts  · → AC-3, AC-4, AC-5, AC-7, AC-8, EC-1, EC-4, EC-5

## Level 4 — Verbindungs-Orchestrierung

<!-- Seiteneffekte, die den Reducer aus Level 3 ansteuern. -->

- [ ] T7  `ConnectionProvider.tsx`: Permission-Check, Scan/Reconnect-Timer (3s-Intervall, 30s-Limit), Bluetooth-Adapter-Listener (Auto-Resume bei Wiedereinschalten), Foreground-Re-Check  · files: src/connection/ConnectionProvider.tsx  · → AC-1, AC-2, AC-5, AC-6, EC-1, EC-3, EC-4

## Level 5 — UI-Komponenten

<!-- Disjunkte Komponenten-Dateien → beide [P]. -->

- [ ] T8 [P]  `ConnectionHeader.tsx`: Status-Badge, Gerätename, "Erneut suchen"-Button (je Zustand gesperrt/aktiv)  · files: src/components/ConnectionHeader.tsx  · → AC-3, AC-7, EC-5
- [ ] T9 [P]  Zustands-Hinweis-Komponenten: PermissionDeniedNotice, BluetoothOffNotice, ScanningIndicator, NotFoundNotice, ReconnectingBanner  · files: src/components/PermissionDeniedNotice.tsx, src/components/BluetoothOffNotice.tsx, src/components/ScanningIndicator.tsx, src/components/NotFoundNotice.tsx, src/components/ReconnectingBanner.tsx  · → AC-1, AC-4, AC-5, AC-6, AC-7, AC-8

## Level 6 — Verdrahtung

- [ ] T10  `RootScreen.tsx` + `App.tsx`: ConnectionHeader oben, zustandsabhängiges Rendering der Notice-Komponenten, Design-Tokens aus `docs/design-system.md` angewendet, ConnectionProvider eingebunden  · files: src/screens/RootScreen.tsx, App.tsx  · → AC-1, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9

## Parallelisierung

- **Ebenen sind Barrieren.** Eine Ebene startet erst, wenn die vorherige vollständig integriert und gegen ihre AC-IDs verifiziert ist.
- **`[P]` setzt disjunkte Dateien voraus.** Zwei `[P]`-Tasks derselben Ebene teilen sich nie einen Pfad unter `files:`.
- **EC-2** (Firmware stoppt den Motor bei Verbindungsabbruch während einer Fahrt) braucht in PROJ-1 keinen eigenen Task — es gibt hier noch keine Motor-Befehle; die Aussage aus `design.md` ("Firmware-Verantwortung") gilt bereits trivial und wird erst mit PROJ-2/PROJ-3 real getestet.
- Während `/build` läuft jeder `[P]`-Task einer aktiven Ebene in einem eigenen Subagenten mit isoliertem Git-Worktree; danach integriert der Haupt-Agent, verifiziert gegen die AC-IDs der Ebene und hakt die Boxen hier ab.
