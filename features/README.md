# Feature Specifications

This folder holds one **folder per feature**, containing the artifacts from the whole lifecycle (Requirements → Design → Tasks → QA).

> This file is kit reference material and stays English in every project. What Claude *says and writes* — the conversation, plus specs, designs, task lists and QA reports — comes in your project's working language (`CLAUDE.md` → Key Conventions → Working language).

## Naming Convention
`PROJ-X-feature-name/` (a kebab-case folder, not a single file)

Examples:
- `PROJ-1-user-authentication/`
- `PROJ-2-kanban-board/`
- `PROJ-3-file-attachments/`

Folder names stay English and kebab-case regardless of the working language — they are paths, and paths appear in code, branches, and commits.

In `INDEX.md` the "Spec" column points to the folder. The "Feature" column is the **name only**; the one-line summary has its own "Description" column, and priority and dependencies live in the **Build order** line under the table — `INDEX.md` is the one place the feature map is kept, the PRD holds no copy.

## The four files in a feature folder

Every feature folder holds exactly these files, each with one owning skill:

- **`spec.md`** — the CONTRACT (WHAT). Owner: `/write-spec` (creates), `/refine` (updates). READ-ONLY during `/build`. Holds user stories, acceptance criteria (with AC-IDs), edge cases, and the Product Decision Log.
- **`design.md`** — the technical design (HOW). Owner: `/architecture`. Holds the component and architecture decisions plus the Technical Decision Log (with alternative & trade-off).
- **`tasks.md`** — the ordered, traceable task list. Owner: `/tasks` (creates), `/build` (checks off). Tasks are grouped into levels and reference the AC-IDs they fulfill.
- **`qa-report.md`** — the regenerated test report as its own file (never appended to the spec). Owner: `/qa`. Reports per AC-ID.

Example: `features/PROJ-3-login/spec.md`

## AC-IDs as the traceability backbone

In `spec.md` every acceptance criterion gets a stable ID `AC-1`, `AC-2`, …; every edge case gets `EC-1`, `EC-2`, …

Tasks in `tasks.md` reference the AC-IDs they fulfill; `qa-report.md` reports per AC-ID. That produces one unbroken chain: **AC → Task → Test**.

IDs are stable and never renumbered — not when the spec is refined, and not when the working language changes.

## What belongs in a feature spec (`spec.md`)?

### 1. User Stories
Describe what the user wants to do:
```markdown
As a [user type], I want to [action] so that [goal]
```

### 2. Acceptance Criteria (with AC-IDs)
Concrete, testable criteria in Given/When/Then form, each with a stable ID. Use your project's working language — `Angenommen …, wenn …, dann …` in German, `Given …, when …, then …` in English — and use the same one for every criterion in the file:

```markdown
- [ ] **AC-1** — Given a new user is on the signup page, when they enter email + password, then an account is created
- [ ] **AC-2** — Given a password has fewer than 8 characters, when the user submits, then a validation message appears
- [ ] **AC-3** — Given signup succeeded, when the account was created, then the user is logged in automatically
```

### 3. Edge Cases (with EC-IDs)
What happens in unexpected situations:
```markdown
- **EC-1** — What happens with a duplicate email?
- **EC-2** — What happens on a network error?
- **EC-3** — What happens on concurrent edits?
```

> The technical design (data model, component architecture) does NOT belong in the spec — it goes into `design.md`, in plain language and without code. The spec stays the contract about the WHAT, free of implementation detail.

## What belongs in `tasks.md`?

An ordered task list, grouped into **levels** by dependency (e.g. Level 1 data/schema, Level 2 API, Level 3 UI). Levels run sequentially (barriers); within a level, tasks marked `[P]` run in parallel — but only when their file sets are disjoint. Every task line references the AC-ID(s) it fulfills via `→`.

## What belongs in `qa-report.md`?

A standalone test report, keyed by AC-ID. Per AC-ID a status (passed / bug), plus any bugs found with severity, steps to reproduce, expected/actual:

```markdown
## QA Report — PROJ-1

**Tested:** 2026-01-12
**App URL:** http://localhost:3000

### Acceptance Criteria Status
- [x] AC-1: User can enter email + password
- [x] AC-2: Password at least 8 characters
- [ ] ❌ AC-? BUG: Duplicate email is not rejected (see EC-1)

### Bugs Found
**BUG-1: Duplicate email signup**
- **Severity:** High
- **Steps to Reproduce:** 1. Register with email, 2. Try again with same email
- **Expected:** Error message
- **Actual:** Silent failure
```

## Workflow

The handoff graph: `/init` → `/write-spec` → `/architecture` → `/tasks` → `/build` → `/qa` → `/deploy` (`/refine` anytime).

1. `/write-spec` creates `spec.md` (including AC-IDs)
2. You review the spec and give feedback (`/refine` anytime)
3. `/architecture` creates `design.md`
4. `/tasks` creates `tasks.md` (levels + `[P]` markers)
5. You approve `tasks.md` — the parallelization plan → status **Tasked**
6. `/build` implements the feature level by level (documented via git commits, checks off `tasks.md`)
7. `/qa` tests and writes `qa-report.md` (its own file, per AC-ID)
8. `/deploy` ships it

## Status tracking

A feature's status is tracked in `INDEX.md`, along this flow:
```
Roadmap → Planned → Architected → Tasked → In Progress → In Review → Approved → Deployed
```

**What each status means:**
- 🗺️ **Roadmap** – identified in the feature map by `/init`, no spec yet
- 🔵 **Planned** – spec is written, ready for design
- 📐 **Architected** – `design.md` is in place
- 🧩 **Tasked** – `/tasks` done, `tasks.md` approved by you, ready to build
- 🟡 **In Progress** – being built (`/build`)
- 🔍 **In Review** – built, `/qa` running
- ✔️ **Approved** – QA passed, no critical/high bugs
- ✅ **Deployed** – live in production

`INDEX.md` is the **only** place a status lives. The feature artifacts carry no status field — a second copy only ever drifts, and `spec.md` is read-only during `/build`, precisely when the status would have to change.

**Git is the single source of truth for implementation detail:**
- All implementation detail lives in the git commits
- `git log --grep="PROJ-1"` shows every change for that feature
- No separate FEATURE_CHANGELOG.md needed
