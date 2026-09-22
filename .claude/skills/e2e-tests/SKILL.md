---
name: e2e-tests
description: Write end-to-end browser tests for the most critical core user journeys of a feature. Optional, run after /qa when you want to lock in the flows that must never break. Installs the browser runner on first use. Ships procedures for Playwright.
argument-hint: "feature-spec-path"
user-invocable: true
---

# E2E Test Engineer

## Goal
Write end-to-end browser tests for the **most critical core user journeys** of a feature — the flows that must never silently break (e.g. sign-in, checkout, the feature's primary create/read/update path). Be deliberately selective: E2E tests are slow and expensive to maintain, so the testing pyramid says write few of them, only for what truly matters. Unit and integration tests (owned by `/build` and `/qa`) already carry the bulk of acceptance-criteria coverage; you add a thin, high-value E2E layer on top.

This skill is **optional** and runs **after `/qa`**. A feature can be production-ready from `/qa` alone — E2E is the extra safety net for the flows you cannot afford to regress.

## Does this project match what this skill assumes?

Read `mode` and `stack` from `.ai-eng-kit` before anything else. `new` means the kit scaffolded this
project and everything below applies as written. `existing` means the kit was added to a project that
already ran, and parts of this skill may describe a stack it does not have.

**Where they differ, say so and hand off — never improvise the equivalent.** A confident instruction
for the wrong stack costs more than an honest "I don't know how this project does that", because the
user cannot tell the two apart from the outside. Use `commands` for anything you run and `probe` for
anything you verify; a `null` there means unknown, and the answer is to ask, not to guess.

**Asking is the last step, not the first — and it has to work for someone who is not a developer.**
Before you ask, look in the project itself for the answer (its README, its auth and middleware code,
its migrations folder, its CI and deploy config) and offer what you found as the recommended answer:
"it looks like X — correct?" is a question a product manager can answer; "how does your database
enforce per-user access?" is not. If neither you nor the user can answer, **do not wave the gate
through**: record it as an open hand-off for their developer — what is needed, why, and where you
looked — mark the affected check `NOT VERIFIED`, and carry on with everything that does not depend
on it.

- **Playwright** → only when `stack.e2e` is `playwright`. Where the project has a different runner
  (Cypress, Detox, Maestro, its own harness), write the tests for **that** one, in the place it keeps them.
- **A project with no E2E runner at all** → this is a hand-off, not a fix. Say what an E2E layer would buy
  them and let them decide; adding a test framework to someone's project is a dependency decision that is
  theirs, not yours.
- **`probe.kind` other than `http`** → there may be no browser journey to test. An MCP server has no UI;
  say so and hand back rather than inventing one.

## Before Starting
1. Read `features/INDEX.md` for project context
2. Read the feature folder referenced by the user: `features/PROJ-X-<slug>/spec.md` (AC-IDs + EC) and `design.md` (technical design)
3. Read `features/PROJ-X-<slug>/qa-report.md` — only ACs that **passed** `/qa` are candidates for E2E (don't write E2E for a flow with open Critical/High bugs)

### Get a browser runner ready (one-time per machine)
E2E tests drive a real browser, so its binary has to be present before the first run. Read `stack.e2e` from `.ai-eng-kit`:

- **A runner is recorded and `docs/stacks/tests-*.md` covers it** → follow that file for the check and the install command.
- **A runner is recorded with no pack** → ask the user how it is installed in this project, and follow that.
- **`stack.e2e` is `null`** → this project has no E2E runner. Say so and stop: **adding one is a dependency decision and it is the user's**, not something to slip in as setup. Offer it, name the cost, and let them answer.

Whatever the runner, two things hold: **tell the user before you download anything** — these binaries are typically a few hundred megabytes — and do the install **only here**. `/qa` and `/verify-setup` never trigger it, which is what keeps setup and the ordinary test loop fast.

## Workflow

### 1. Identify the Critical Journeys
Don't write an E2E test for every AC. Select only the **critical core journeys** — typically P0 flows:
- The feature's primary happy path (the one a user came for)
- Authentication / authorization gates protecting it
- Anything where a silent regression means data loss, lost revenue, or a locked-out user

Map each chosen journey back to the AC-IDs it exercises (a single journey often covers several ACs). Present the shortlist to the user and confirm before writing — keep it tight.

**Skip E2E for:** secondary edge cases, cosmetic/responsive details, and logic already fully covered by unit/integration tests. Those belong in `/qa`, not here.

**Prove each journey test can fail.** E2E tests are the worst offenders for permanent green: a selector that matches anything, a wait that swallows the error, an assertion on the page title while the flow underneath is broken. For every journey, make it fail once on purpose — assert a wrong text, or take the step out of order — and confirm the failure names the broken step, not a timeout three lines later. Then restore. A journey test whose failure you have never seen is one you cannot trust to report a regression.

### 2. Fan Out Parallel E2E Lanes (Subagents)
The chosen journeys are independent, so write them as parallel **subagents via your agent's own sub-agent tool** (NOT a workflow tool, NO special keyword). Each lane writes a **DISJOINT** test file — `tests/PROJ-X-<slug>.spec.ts` in a kit-scaffolded project, otherwise wherever this project keeps its E2E specs — so parallel writers never collide.

**If your agent has no sub-agents, write the lanes one after another.** The parallelism is an optimization; the disjoint files are the part that must hold.

- One lane per critical journey
- One `test()` per journey, referencing the AC-IDs it covers in the test title
- Tests describe the user journey in plain language (open page → act → assert outcome)

For a single critical journey, just write it inline — don't fork for its own sake.

### 3. Run the Suite
```bash
npm run test:e2e      # or this project's own E2E script — `commands` has no e2e key, so take it from the project's scripts or ask
```
All tests must pass. A failing E2E test against a flow `/qa` marked as passing is a **regression** — report it as a High bug (do NOT fix it here; that's `/build`'s job) and key it to its AC-ID.

These tests become the permanent **critical-path regression suite** for this feature — they run on every later `/qa` and in CI.

### 4. Record Results in the QA Report
Update the **existing** `features/PROJ-X-<slug>/qa-report.md` — fill in its **E2E Tests** section (do not create a separate file). For each journey: list the AC-IDs covered, the test file, and pass/fail. If the section still says "not run", replace it.

### 5. User Review
Present a short summary:
- Critical journeys covered: N (list them with their AC-IDs)
- E2E result: all passing / failures found (with severity)
- Any regression surfaced against a previously-passing AC

## Context Recovery
If your context was compacted mid-task:
1. Re-read the feature folder: `spec.md` + `design.md` + `qa-report.md`
2. Check which E2E spec files already exist for this feature and what they cover
3. Run `git diff` to see what you've already written
4. Continue from where you left off — don't rewrite journeys already covered

## Important
- E2E is **selective by design** — a handful of critical journeys, not one-per-AC
- NEVER fix bugs yourself — a failing E2E test is a finding for `/build`
- Only write E2E for ACs that already **passed** `/qa`
- Keep tests readable: a non-coder should recognize the user journey from the test title

## Checklist
- [ ] `spec.md`, `design.md`, and `qa-report.md` read
- [ ] The browser runner is installed (one-time), and the user was told before anything was downloaded
- [ ] Critical core journeys identified and confirmed with the user (not one-per-AC)
- [ ] One E2E test per journey, AC-IDs referenced in the title, disjoint files
- [ ] The E2E suite passes — run it with this project's own command (or failures reported as High bugs, keyed to AC-IDs)
- [ ] `qa-report.md` **E2E Tests** section filled in (keyed by AC-ID)
- [ ] User has reviewed the covered journeys and results

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
> "E2E tests written for [N] critical journeys — [list]. They're now your permanent critical-path regression suite. Next step: Run `/deploy` to ship this feature to production."

If an E2E test failed against a previously-passing flow:
> "Heads up: [N] critical flow(s) regressed. Status should stay **In Review** — run `/build` to fix, then `/qa` and `/e2e-tests` again."

## Git Commit
```
test(PROJ-X): Add E2E tests for [feature name] critical journeys
```
