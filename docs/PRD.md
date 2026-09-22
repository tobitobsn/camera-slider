# Produktanforderungen (PRD)

## Vision
Ein selbstgebauter, motorisierter Kamera-Slider für glatte Kamerafahrten und (später) Zeitraffer-Aufnahmen — gesteuert per Android-App über Bluetooth, ohne Abo-Zwang oder Cloud-Abhängigkeit kommerzieller Systeme (Edelkrone, Syrp Genie & Co.).

## Zielnutzer
Ausschließlich der Erbauer selbst (Hobby-Videograf). Kein Mehrbenutzer- oder Nachbau-Anspruch in dieser Version.

## Kernfunktionen (Roadmap)
Der MVP deckt manuelle Steuerung des Sliders per App (Jog), das Setzen von Start-/Endpunkt sowie eine automatische Fahrt dazwischen mit einstellbarer Geschwindigkeit/Dauer ab. Presets-Verwaltung (mehrere gespeicherte Fahrten) und ein Zeitraffer-Modus (schrittweise Fahrt + Kameraauslösung) folgen danach. Die vollständige Feature-Liste mit Build-Reihenfolge lebt ausschließlich in `features/INDEX.md`.

## Erfolgsmetriken
- Slider fährt ruckel-/schrittverlustfrei über die volle Schienenlänge
- BLE-Verbindung App↔ESP32 bleibt während einer Fahrt stabil
- Wird tatsächlich bei echten Videodrehs eingesetzt

## Rahmenbedingungen (Constraints)
- Kein festes Datum, Hobby-Tempo (Feierabend/Wochenende); Hardware-Budget im niedrigen dreistelligen Bereich
- Hardware: Schrittmotor 42BYGHM809 (1,7 A/Phase, 0,9°/Schritt), BIGTREETECH TMC2209 V1.3 StepStick (UART + Step/Dir), ESP32
- Firmware: Arduino-Framework via PlatformIO
- App: React Native + TypeScript, Zielplattform Android
- Kein Backend — lokale Speicherung (AsyncStorage/SQLite) auf dem Handy
- Deploy: lokaler Release-Build (APK), kein Play-Store-Eintrag
- Design-System: siehe `docs/design-system.md` (dunkles Theme, kräftige Akzentfarbe)

## Nicht-Ziele (Non-Goals)
- Kein Pan/Tilt, nur lineare Achse
- Kein Cloud-Konto/Sync zwischen Geräten
- Keine Mehrbenutzer-/Nachbau-Dokumentation
- iOS-Version vorerst nicht (später möglich)
- Zeitraffer/Kameraauslösung nicht im MVP (P1)
