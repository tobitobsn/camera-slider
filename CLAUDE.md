# Camera slider

> The AI Engineering Kit is installed in this project — a spec-driven workflow.
> This file is the one place the project's context is maintained.

<!-- AI-ENG-KIT:START (managed — do not edit by hand; refreshed by /verify-setup) -->
## AI Engineering Workflow

This project uses the AI Engineering Kit — a spec-driven workflow. Development runs in phases, each driven by a skill:

`/init → /write-spec → /architecture → /tasks → /build → /qa → /deploy`   (`/refine` & `/audit` anytime · `/dsgvo` when personal data is involved · `/e2e-tests` for critical flows · `/security-check` & `/cleanup` after `/deploy`)

- **Feature specs** live in `features/PROJ-X-name/`: `spec.md` (the contract — WHAT), `design.md` (the technical design — HOW), `tasks.md` (the ordered build plan), `qa-report.md` (the test report).
- **Acceptance Criteria** carry stable IDs (`AC-1`, `AC-2`, …). The chain is **AC → Task → Test**.
- **Project status** is tracked in `features/INDEX.md`.
- `spec.md` is **read-only during `/build`** — it is the stable contract.
- **One working language** for the whole project — the conversation *and* every document the skills write, acceptance criteria included. It is recorded under Key Conventions below.

@.claude/rules/general.md
@.claude/rules/security.md
<!-- AI-ENG-KIT:END -->

## Key Conventions

- **Working language: Deutsch.** Talk to the user in Deutsch and write every project document in Deutsch — see `.claude/rules/general.md` → Working Language.
- **Feature IDs:** PROJ-1, PROJ-2, etc. (sequential)
- **Commits:** `feat(PROJ-X): description`, `fix(PROJ-X): description`
- **Single Responsibility:** One feature per folder
- **Feature branches:** you create a branch `feat/PROJ-X-name` before `/build`; work stays there through build/QA, and `/deploy` merges it in. The main branch always stays deployable.
- **Human-in-the-loop:** All workflows have user approval checkpoints.
- **Secrets / env files:** Never read, edit, or create env files — they hold private keys. When a real value is needed, ask the user in chat what to paste where; never write it yourself.
- **This project existed before the kit.** Its code, structure, and conventions are the source of truth — follow what is already there rather than the kit's defaults. Where the two disagree, the project wins.

## How This Project Runs

_Recorded by `/init`._

- **Platform:** mobile (Android) — steuert per Bluetooth (BLE) ein ESP32-basiertes Hardware-Gerät
- **Stack:** React Native + TypeScript, kein Backend (lokale Speicherung via AsyncStorage), Tests mit Jest, Package-Manager npm. Konkrete Verfahren: `docs/stacks/framework-react-native.md`
- **Start:** `npx react-native run-android`
- **Build (Release-APK):** `cd android && ./gradlew assembleRelease`
- **Verify:** kein automatisierter Probe (`none`) — verifiziert wird durch manuelles Testen der App gegen den echten Slider
- **Deploy:** lokaler Release-Build (APK), kein Play-Store-Eintrag
- **Layers:** `firmware` → Root `firmware/`, ESP32 mit Arduino-Framework via PlatformIO (C++), Start `pio run -e esp32dev -t upload`, kein automatisierter Test/Probe (Hardware). Konkrete Verfahren: `docs/stacks/firmware-esp32-tmc2209.md`
- **Codebase map:** `docs/codebase/` — written by `/map`, read before designing anything; `/map` again after large changes

## Product Context

@docs/PRD.md

## Data Model

@docs/data-model.md

## Feature Overview

@features/INDEX.md
