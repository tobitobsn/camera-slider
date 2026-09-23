# Feature Index

> Central tracking for all features. Updated by skills automatically.

## Status Legend
- **Roadmap** - `/init` done, feature identified in feature map, no spec file yet
- **Mapped** - already built before the kit arrived; proposed by `/map`, confirmed at `/init`, no spec folder yet — `/reverse-spec` writes it
- **Spec'd** - `/reverse-spec` done: runs in production, criteria confirmed, not yet verified — `/qa` closes that gap
- **Planned** - `/write-spec` done, full spec written, architecture not yet designed
- **Architected** - `/architecture` done, tech design approved, ready to build
- **Tasked** - `/tasks` done, tasks.md approved, ready to build
- **In Progress** - `/build` active or completed, not yet in QA
- **In Review** - `/qa` active, testing in progress
- **Approved** - `/qa` passed, no critical/high bugs, ready to deploy
- **Deployed** - `/deploy` done, live in production
- **Merged** - spec folded into another feature by `/refine`; the Spec cell names it, the folder lies in `features/archive/`

## Features

> The **Spec** column links to the feature **folder** (`features/PROJ-X-name/`), not a single file. Each folder contains `spec.md`, `design.md`, `tasks.md`, and `qa-report.md`.
>
> **A row is never a log.** This file is loaded into every session. What was built, fixed, measured or decided goes into the feature's folder (`design.md`, `qa-report.md`) and the commit — here only the status changes.
>
> **Feature** is the name only — two to four words, the way you would say it ("User accounts & login", "Kanban board"). **Description** is one sentence of what it does. Priority and dependencies are not columns: they are the **build order** line under the table, and it is the only place they live — there is no second roadmap table anywhere else.

| ID | Feature | Description | Status | Spec | Created |
|----|---------|-------------|--------|------|---------|
| PROJ-1 | BLE-Verbindung & Pairing | App verbindet sich per Bluetooth mit dem ESP32 und zeigt den Verbindungsstatus | Deployed | [features/PROJ-1-ble-verbindung-pairing/](PROJ-1-ble-verbindung-pairing/) | 2026-09-22 |
| PROJ-2 | Manuelle Steuerung (Jog) | Slider per App manuell in beide Richtungen fahren, mit einstellbarer Geschwindigkeit | Deployed | [features/PROJ-2-manuelle-steuerung-jog/](PROJ-2-manuelle-steuerung-jog/) | 2026-09-22 |
| PROJ-3 | Start-/Endpunkt & Auto-Fahrt | Start- und Endpunkt setzen und automatische Fahrt dazwischen mit einstellbarer Geschwindigkeit/Dauer auslösen | Roadmap | — | 2026-09-22 |
| PROJ-4 | Presets verwalten | Mehrere benannte Fahrt-Profile lokal speichern, laden und löschen | Roadmap | — | 2026-09-22 |
| PROJ-5 | Zeitraffer-Modus | Schrittweise Fahrt mit automatischer Kameraauslösung für Zeitraffer-Aufnahmen | Roadmap | — | 2026-09-22 |

**Build order:** _P0 (MVP): PROJ-1 → PROJ-2 → PROJ-3 · P1: PROJ-4 (needs PROJ-3), PROJ-5 (needs PROJ-3)_

<!-- Add features above this line -->

## Deployments

> One line per release, written by `/deploy` — **the single deployment record**: tag · date · production URL · the features it shipped. `/security-check` reads the production URL here, `/audit` expects every Deployed feature on one line. A feature that was live before the kit arrived (reconstructed from code) gets its line from `/qa`: `live before the kit — verified by /qa on <date> · PROJ-X`.

- _v1.0.0 · 2026-09-23 · lokaler Release-Build (APK), kein Hosting/Play-Store — `android/app/build/outputs/apk/release/app-release.apk` · PROJ-1, PROJ-2_

_(Die vorherige Zeile hier — `v1.0.0 · 2026-01-31 · https://app.example.com` — war ein nie bereinigter Kit-Platzhalter aus dem Scaffolding, kein echter Release; siehe BUG-11 in PROJ-1s `qa-report.md`. Ersetzt durch die echte erste Deployment-Zeile oben.)_

## Next Available ID: PROJ-6
