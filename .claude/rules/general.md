# General Project Rules

## Working Language (MANDATORY)
The user chose one language for this project at setup. It is recorded in **the canonical memory file → Key Conventions → Working language** (`.ai-eng-kit` → `memory` names that file; a pointer file never carries it) and in `.ai-eng-kit` (`language`). Read it at the start of every session; if both are missing, ask the user once and record the answer in that file rather than guessing.

**This is the language you talk in, not just the language you write files in.** Everything the user reads comes in it:

- **The conversation itself** — every reply, question, interview turn, summary, approval checkpoint, hand-off instruction, status report, error explanation, and the "next step" suggestion at the end of a skill. If the working language is Deutsch, you answer in Deutsch, even when the user's own message is in English, even when the skill you are running is written in English, and even when you are only reporting a command's output. The skills are written in English because they are instructions **to you** — they are not a template for how you speak.
- `docs/PRD.md`, `docs/data-model.md`, `docs/app-shell.md`, `docs/privacy.md`, `docs/tech-debt.md`
- every feature artifact: `spec.md` (including **acceptance criteria and edge cases**), `design.md`, `tasks.md`, `qa-report.md`
- the feature names and descriptions in `features/INDEX.md`

The user can override it for a single reply just by asking ("answer in English this once"). That does not change the setting, and the next reply goes back to the working language. Only an explicit "from now on, use X" changes it — then update the line in the canonical memory file and `.ai-eng-kit`.

**The hand-off lines in the skills are examples of content, not scripts to read out.** Every skill ends with a quoted "next step" — those quotes are written in English because the kit is; say them in the working language. Both forms, so the shape is clear:
- English: "Design is ready. Next step: run `/tasks` to break it into an ordered task list."
- Deutsch: „Das Design steht. Nächster Schritt: `/tasks` ausführen, um daraus eine geordnete Aufgabenliste zu machen."

Half-translated output is the failure mode to avoid: a German spec with English acceptance criteria, English task lists under German designs, or a German conversation that switches to English the moment a skill starts running. One language, every document, every section, every message — including the templates' headings, which you translate as you fill them in.

**Stays English regardless of the setting** — these are code or kit-authored files, identical for every project:
- code: identifiers, types, database columns, API routes, file and folder names (`features/PROJ-3-user-login/`)
- commit messages (`feat(PROJ-X): ...`) and git branch names
- the kit's own files: `.claude/skills/*`, `.claude/rules/*`, `docs/production/*`, `features/README.md`

Established technical terms are not translated into either language — *Acceptance Criteria*, *Edge Case*, *Deploy*, *Row Level Security*, *Bug*, *Severity* stay as they are. In German documents, legal terms keep both forms where `/dsgvo` says so (Auftragsverarbeitungsvertrag / DPA).

**Changing the language later** changes only what is written from then on. Never mass-translate existing documents on your own: AC- and EC-IDs and the AC → Task → Test chain must survive, so a retranslation is a deliberate job the user asks for explicitly.

## New Project Detection (MANDATORY)
Before starting ANY work, check if the project has been initialized:
1. Read `docs/PRD.md` - if it still contains placeholder text like "_Describe what you are building_", the project is NOT initialized
2. Read `features/INDEX.md` - if the features table is empty, no features have been defined

**If the project is not initialized:**
- Do NOT write any code or create any components
- Do NOT skip ahead to implementation
- Instead, tell the user — according to `mode` in `.ai-eng-kit`:
  - `new`: "This project hasn't been set up yet. Let's start by defining what you want to build. Run `/init` with a description of your idea (e.g. `/init I want to build a task management app`)."
  - `existing`: "The kit is installed, but it does not know yet how this project runs. Run `/map`, then `/init` — the map reads the project, `/init` proposes the answers and the features it already has, and you confirm them. No product pitch needed; the product already exists."
- If the user already described their idea in the current message, run `/init` automatically with their description

**If the project is initialized but the user requests a feature not yet in INDEX.md:**
- Guide them to run `/write-spec` first to create the feature spec before any implementation

## Change Routing (where every change goes)
Every change to app behavior belongs to a feature, so the docs never drift. Route by type:
- **New capability** (not in INDEX yet) → run `/write-spec` first. Never build straight from a chat request.
- **Change to an existing feature's behavior or scope** → `/refine PROJ-X` to update its spec, then re-run the downstream skills that are affected. **Extending a feature is this case** — a filter, a column, one more option on a screen that has a spec. A new ID is only for what could ship and be tested alone; a follow-up spec per change spreads one feature over contradicting files.
- **Bug in a feature that already has a spec** → the feature isn't meeting its contract. Reopen it: set its INDEX status back to **In Review**, fix it via `/build`, then `/qa` again (a re-verification, scoped to the diff). If the bug exists because a requirement was never written down, `/refine PROJ-X` to add the missing AC/EC first, then build.
- **Trivial, behavior-neutral change** (copy/typo fix, dependency bump, formatting) → make it directly and commit with a clear `chore:`/`fix:` message. No spec needed.

Avoid the drift trap: a conversational "just fix/add this" that changes behavior **without** routing through a skill leaves INDEX, `spec.md`, and `qa-report.md` stale. When unsure whether the docs still match reality, run `/audit`.

## Independent Verification
The verifier never carries the builder's context. `/qa` delegates verification to `qa-engineer` sub-agents that receive only the feature folder, the AC-IDs, the step of the skill that is their scope, `.ai-eng-kit` — or, where the agent has no named sub-agents, runs in a fresh session. A `/qa` typed into the conversation that built the feature is asked to move, not answered there.

## Test Runs
Full suites run only by `/build`'s main agent (per level, at the end) and `/qa`'s owner (once, before the fan-out). Sub-agents, lanes and red proofs run single files.

## Feature Tracking
- All features are tracked in `features/INDEX.md` - read it before starting any work
- Each feature lives in a folder `features/PROJ-X-feature-name/` with `spec.md` (contract), `design.md`, `tasks.md`, and `qa-report.md`
- Feature IDs: `<prefix>-<n>`, sequential (INDEX.md has the next). Prefix = `.ai-eng-kit` → `featurePrefix`, default `PROJ`; **every `PROJ-` in the kit's files stands for it**
- One feature per folder — never combine independent functionalities in one spec

## Git Conventions
- Commit format: `type(PROJ-X): description`
- Types: feat, fix, refactor, test, docs, deploy, chore
- **Feature branches:** each feature is built on its own branch `feat/PROJ-X-name`, never directly on `main`. The **user creates the branch** before `/build` — skills never create or switch branches on their own. The feature stays on that branch through `/build` → `/qa` → `/e2e-tests`. `/deploy` is the only skill that touches branch state: it takes stock of every `feat/*` branch against INDEX before shipping, merges the launch set into `main` after the user's go-ahead, and afterwards *offers* to delete the branches it just merged (`-d`, never `-D`). A branch that is unmerged, outside the launch set, or belongs to no known feature is **reported, never merged or deleted** — only the user knows whether it is unfinished work or something they dropped.
- Check existing features before creating new ones: `ls features/ | grep "<prefix>-"`
- Check existing components and APIs before building. In a kit-scaffolded project: `git ls-files src/components/` and `git ls-files src/app/api/`; in any other project the paths come from `docs/stacks/framework-*.md` or the code itself — never conclude "nothing exists" from a path that is not there

## Human-in-the-Loop
- Always ask for user approval before finalizing deliverables
- Present options using clear choices rather than open-ended questions
- Never proceed to the next workflow phase without user confirmation

## Status Updates (MANDATORY - Write-Then-Verify)
After completing work on any feature, you MUST update tracking files, in this sequence:

1. **Read** the feature files (`spec.md`, `design.md`, `tasks.md`) and `features/INDEX.md` BEFORE editing
2. **Write** your changes with the Edit tool — do NOT just describe them
3. **Re-read** the file to verify the changes are present; if they are missing, repeat step 2

**What to update per feature:**
- `features/INDEX.md` is the **single** place a feature's status lives — keep the status column current. `spec.md`, `design.md`, and `tasks.md` carry **no** status field on purpose: a second copy only ever drifts, and `spec.md` is read-only during `/build` precisely when the status would have to change. A status header found in one of them (older project): delete it, don't sync it.
- `spec.md` is the stable contract and stays **read-only during `/build`** — do not write implementation notes into it.
- Implementation notes (what was built, deviations from the design) go into `design.md` or the git commit; `/qa` writes results to `qa-report.md`.

**What to update in `features/INDEX.md`:**
- **Only the Status cell** (new row: name, one sentence, status, link). INDEX loads into every session — never write what you did into a row: no bug logs, measurements, decisions, notes. Those go into the commit message, `design.md`, `qa-report.md`.
- Valid statuses: Roadmap (after `/init`, no spec yet) → Planned (`/write-spec`) → Architected → Tasked → In Progress (`/build` starts) → In Review (`/qa` starts) → Approved (`/qa` passed, no critical/high bugs) → Deployed.
  - For features that predate the kit: **Mapped** (confirmed at `/init` from `/map`'s proposal, no spec folder yet) → **Spec'd** (after `/reverse-spec`: runs in production, not yet verified), joining the flow at `/qa`.
  - **Merged**: `/refine` folded this spec into another feature; the row names it, the folder is in `features/archive/`. Never build against it.

**NEVER:** claim an update without calling the Edit tool · summarize changes in chat instead of writing them · skip an update as "obvious" or "minor".

## File Handling
- ALWAYS read a file before modifying it - never assume contents from memory
- After context compaction, re-read files before continuing work
- When unsure about current project state, read `features/INDEX.md` first
- Run `git diff` to verify what has already been changed in this session
- Never guess at import paths, component names, or API routes - verify by reading

## Handoffs Between Skills
- After completing a skill, suggest the next skill to the user
- Format: "Next step: Run `/skillname` to [action]"
- Handoffs are always user-initiated, never automatic

## Layers (a repo with more than one runtime)
`.ai-eng-kit` → `layers` lists the runtimes this repo has beside the primary stack — a pipeline, a CLI, a worker — each with its `root`, its own `commands` and `probe`, and its `packs`. For any work under a layer's `root`: read that layer's `packs` (in order) **before** the stack packs, run its `commands` instead of the top level's, and verify against its `probe`. A layer's `null` is the same "ask, never guess" as at the top level. An empty list means one runtime, and nothing here applies.
