---
name: build
description: Implement a feature end to end - database, API, and UI - against the stack this project actually has, reading its stack packs for the concrete mechanisms. Works through the leveled tasks.md, running file-disjoint [P] tasks as isolated sub-agents in parallel. Use after /tasks has produced the task list.
argument-hint: "PROJ-X (feature folder)"
user-invocable: true
---

# Build

## Goal
Implement one feature as a complete vertical slice: data layer (schema + API where needed), server-side logic, and UI — in one pass. Build what the spec asks for; don't invent scope.

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

What this skill assumes, and what to do when the project does not match:

- **`platform` is not `web`** → read this one first, because it decides which of the outcomes below are
  even meaningful. A **mobile** app has no responsive breakpoints, no semantic HTML and no HTTP route to
  protect — it has screens, device storage and transport security; a **desktop** app is the same minus the
  store — local files and OS keychain instead of a database behind a route, and an update mechanism of its
  own; an **mcp** server or a **cli** has no UI
  at all, its surface is its tool scope and its inputs; a browser **extension** is web technology without a
  server of its own — content-script injection and requested permissions matter, route protection does not.
  Keep every gate that has a counterpart (input validation at the boundary, data-layer access rules, rate
  limits on anything that checks a credential, tests per unit of behaviour, no hardcoded secrets) and
  translate it to what the platform actually has; drop the ones that have none and **say which you
  dropped**. `docs/stacks/framework-<value>.md` knows the layout only for web frameworks the kit ships a
  pack for.
- **`npm run build` / `npm test`** → use `commands.build` and `commands.test`. A command recorded as `null`
  is not "skip the check", it is a question for the user.
- **A task whose `files:` sit under a layer's `root`** (`.ai-eng-kit` → `layers`) is that layer's work: read its
  `packs` before anything else, run its `commands` (build, test, lint) from its `root`, and keep the boundary
  the design named — the table or API the layers exchange — exactly where the design put it. A sub-agent
  forked for such a task is told the layer by name, with its packs.
- **The component library** → `docs/stacks/ui-<value>.md` where one matches. Otherwise follow the UI
  conventions already in the project, and never install a component library it did not ask for.
- **Where schema changes are captured** → `docs/stacks/backend-<value>.md`. The *discipline* is universal
  and still applies with no pack at all: every schema change is a versioned file in whatever migration
  system this project uses, and a migration that already shipped is frozen. Find that system before
  writing schema — do not invent one.
- **How requests are handled and forms submitted** → `docs/stacks/framework-<value>.md`. The rules those
  mechanisms serve are not framework-specific: credentials never travel in a URL, and everything that
  checks a credential is rate-limited. Those are **hard gates in every stack** — a missing pack changes
  how you implement them, never whether you do.

## The Contract
The feature folder is the single source of truth: `spec.md` is the WHAT, `design.md` (authored by `/architecture`) is the HOW, and `tasks.md` (authored by `/tasks`) is the ordered build plan. Everything you build traces back to them via AC-IDs. `spec.md` is READ-ONLY during build — you never write to it. If reality forces a deviation from the design, you stop and flag it. You never silently redesign.

## Start by Reading
Before writing anything, read. Never assume contents from memory:
1. The feature folder the user passed — `features/PROJ-X-*/spec.md` (the contract, READ-ONLY), `features/PROJ-X-*/design.md` (the technical design), and `features/PROJ-X-*/tasks.md` (the ordered, leveled task list).
2. `features/INDEX.md` — current status, and what's already shipped so you don't duplicate it.
   - Also skim `docs/data-model.md` — the app-wide data model. Your schema/migrations implement this feature's slice of that map; reuse the agreed entities and relationships instead of inventing parallel tables. (`/architecture` already designed against it; if `design.md` and the map disagree, stop and flag it rather than guessing.)
   - And `docs/app-shell.md` — the app-wide frame. Build this feature's UI **inside** it: reuse the listed shell components and follow the recorded page pattern (header, loading, empty, error). Never add a second sidebar, header, or navigation here — the shell belongs to the feature named at the top of that file. If the design needs the shell to change, stop and flag it (that's a `/refine` on the shell's owner), don't build it into this feature.
3. **The code you'd be extending.** In a project the kit scaffolded: `git ls-files src/app/api/`, `ls src/components/ui/`, `ls src/components/*.tsx`, `ls src/lib/`, `ls src/app/`. In any other project **those paths do not exist and return nothing without telling you so** — read `stack` and the framework pack for where this project keeps its routes, components and shared code, then look there. Match existing patterns instead of introducing new ones; an empty result you did not verify is not evidence that nothing is there.

## Work on a Feature Branch
You build on a branch, never directly on `main`, so a half-finished build can't break the live app. **Creating the branch is the user's job** — you don't create or switch branches yourself; you just make sure one exists before you start.

1. Check the current branch: `git branch --show-current`.
2. **If it's `main`** (or the shared default branch): stop and hand off — do NOT create the branch yourself:
   > "Before I build, put this feature on its own branch so your live `main` stays safe. Run: `git checkout -b feat/PROJ-X-name` — then tell me to continue. Everything I build and test lives on that branch until you deploy; if a build goes wrong, you can just throw the branch away."
   Wait for the user to create it and confirm before doing any work.
3. **If it's already a feature branch**, proceed — just note which branch you're on.

The parallel `[P]` worktrees below branch off the current feature branch and integrate back into it. The feature stays on this branch through `/qa` and `/e2e-tests`; merging into `main` happens at `/deploy`.

## Work the Task List (Level by Level)
`tasks.md` is the build plan — work it top to bottom, never ad hoc. Tasks are grouped into Levels by dependency; **Levels run sequentially** and act as barriers. "Data contract before UI" falls out of the level order: schema/API levels precede UI levels, so you build the UI against real signatures, not throwaway mocks.

Within a single level:
- For each task marked `[P]`, fan out one sub-agent **in parallel** — each with its own context window and **git-worktree isolation**, because parallel writers sharing a working tree collide.
- **At most three forks at a time.** A level with more `[P]` tasks runs in waves of three: start the next wave when the one before is integrated. Every fork spends its own context from zero, so eight at once is eight times the usage in a few minutes — the fastest way into a usage limit in the middle of a level — and three already take most of the wall-clock win. The user may name another width; go with theirs.
- **Hand a fork its slice, not the folder.** Its task line, the ACs it serves, the section of `design.md` that covers its `files:`, the pack to read — not "read spec, design and tasks". A fork that loads the whole feature before writing a line has spent its window on reading. If a task still looks too large for one context (more than about five files, more than one concern), split it into two forks along its files or build it inline in steps; say so in the report, so `/tasks` slices finer next time.
- Non-`[P]` tasks build inline/sequentially.
- **`[user]` tasks you do not build.** They are settings in a provider's dashboard (`where:` names the path and the value). When the level that holds one starts, print the hand-off in plain language — what to switch on, where exactly, which value, and which AC it serves — then carry on with the code; never tick the box, it is the user's. Where the backend pack names a local equivalent (a `config.toml` section for the local stack), set that so the feature is testable here, and say that the hosted project still needs the dashboard step. A **`[user go-live]`** task is different: it needs the production URL or the host, so there is nothing to switch on yet. Name it once in the hand-off as `/deploy`'s work and build against the test-environment twin the design names (a CLI forwarding test events to the local endpoint, a test signing secret documented in the example env file), so `/qa` can verify the AC here.
- **If your agent cannot fork sub-agents or isolate worktrees, run the `[P]` tasks sequentially too.** The fan-out is an optimization; the level barriers, the disjoint file sets and the single verification owner are what the plan depends on.
- **Trust the disjointness, but verify.** `tasks.md` guarantees that `[P]` tasks within a level touch disjoint file sets. If you notice two `[P]` tasks would in fact write the same file, do NOT run them in parallel — stop and report the overlap rather than racing them.
- A forked sub-agent has its own context and won't inherit a domain skill the main agent could see. When you fork work that touches one, name it explicitly in the sub-agent's instructions ("read `docs/stacks/backend-<value>.md` and the `supabase-postgres-best-practices` skill before writing schema") so the fork loads it. If a part depends heavily on its skill, keep it inline.
- **A sub-agent runs only the test files of its own task** — the ones it wrote and the ones covering its `files:` — never the whole suite. Tell it so in the hand-off, with the single-file form of this project's runner (`docs/stacks/tests-*.md` or the layer's pack names it; with no pack, the runner's own path argument). Five forks each running the full suite is five times the output nobody reads, and it proves nothing the level barrier below does not prove better. Between iterations inside one task, rerun what just failed or the one file — the full run comes at the barrier. The same scope rule applies to you when you build a task inline.

After each level completes, the **main agent** — not the sub-agents — integrates the results, **runs the full suites once** (`commands.test`, and every layer's from its `root`), verifies the level against the AC-IDs its tasks claim to satisfy, and checks off those tasks in `tasks.md`. There is exactly one verification owner: sub-agents never declare themselves done. Only when a level is verified do you start the next one. That is where the whole suite belongs: once per level, by you, plus once at the end (see "What Done Means").

**A verified level is committed, and that commit is the safe place to stop.** Once the level's tasks are ticked, commit code and `tasks.md` together on the feature branch (`feat(PROJ-X): level 2 — API`), then tell the user in one line, in the working language: level N of M is committed, and this is a point where they can interrupt without losing anything — a later `/build` continues at the first unticked task. Do not wait for an answer; carry on with the next level. It matters because a usage limit or a closed laptop does not ask first: everything up to the last level commit survives it, and the only work ever at risk is the level in flight. If the user wants to stop — or asked at the start to build one level at a time — stop here, never in the middle of a level: a half-integrated fan-out is the one state that is expensive to pick up.

When a level holds just one or two trivial tasks, build them inline — don't fork for the sake of fan-out. Use isolation where it pays.

## Use Available Domain Skills
When a feature touches a domain that has a vetted skill installed, follow that skill instead of writing from memory — memorized API knowledge goes stale.

- Before building a domain-specific part, load the matching skill if one exists.
- **This project's stack packs first** (`docs/stacks/*.md`, selected by `stack` in `.ai-eng-kit`) — they describe the database, framework and UI library this code actually runs on. Then any **vetted domain skill** installed for the services the feature touches; in a kit-scaffolded project that means `supabase` for Auth/SSR/RLS/Edge Functions, `supabase-postgres-best-practices` for query and schema performance, `stripe-best-practices` for payments.
- The domain skill governs *how* to integrate the service; the spec still governs *what* the feature does, and the non-negotiables and verification below still apply to the result.
- If a live-docs MCP (e.g. **Context7**) is connected, consult it for the *current* API surface before writing against a library — it catches API drift that a vetted skill or memory would miss. Use it to confirm signatures; the domain skill still governs the approach. Not connected → proceed; it's optional, never a blocker.
- No relevant skill installed → proceed normally; don't block.

## Does This Feature Need a Backend?
Decide before you build:
- **Backend needed** if the feature touches a database, user accounts/auth, server-side logic, API endpoints, or multi-user data sync.
- **Frontend-only** if it's localStorage, no accounts, no server communication (landing page, static tool, local-only prototype).

If frontend-only, skip everything backend below and build just the UI. Don't stand up a server for something that doesn't need one.

## Schema Changes Are Versioned Files
When the feature has a database, three things hold before you touch schema — in any stack, with or without a matching pack.

- **Capture every schema change as a versioned migration file** — a new table, an access policy, an index, a column. That file is the portable record of the change, and it is what later promotes the same schema to production. **Never apply schema only by clicking in a dashboard with no file in the repo.**
- **A migration that has already gone live is frozen — never edit or delete it, always add a new one.** Production records which migrations ran, so an edited file is skipped there while your local replay applies the new version. Local and production then differ silently, and nothing warns you. Before changing any migration file, check whether it shipped: `features/INDEX.md` tells you which features are **Deployed**. If it did, correct it forward with a new migration. Only a migration that has never left your machine may still be edited.
- **Build against the test environment, never live.** Your local configuration points at the test env, and that is the only environment you apply schema to here. Promotion to production is `/deploy`'s job, not yours.

**Where the migrations live, how they are created and applied, and what this project's test environment actually is** — read `docs/stacks/backend-<value>.md`. With no matching pack, **ask the user how schema changes are captured and applied in this project** and follow that. Inventing a migration system beside the one they have is worse than asking.

**Setting the environment up is not this skill's job.** If the test environment isn't running or isn't configured, stop and point the user at `/verify-setup` rather than editing live data or standing up infrastructure mid-feature.

**Auth tables and per-user access rules are NOT setup.** The user profile table, the per-user access pattern, the signup trigger — those belong to the **User Accounts & Auth feature** and get built here like any other feature slice, against `docs/data-model.md`.

## Asking vs. Assuming
Apply this at *every* point in the work, not just upfront:

**Ask when an assumption is load-bearing AND the spec doesn't settle it.** Load-bearing = it touches security, the data model, data loss, or anything hard to reverse — e.g. owner-only vs. shared access, how concurrent edits resolve, whether a delete cascades, a visual direction with no design reference.

**Don't ask when the spec, PRD, or `docs/design-system.md` already answers it, or the choice is low-stakes and trivially reversible.** Take the obvious default, note it (below), keep moving — ritual questions just train the user to rubber-stamp.

Don't front-load a fixed question list. The ambiguity that hurts surfaces *during* implementation; when it does, stop there and ask rather than park it and guess.

## Surface Your Assumptions
Before the closing commit, list the assumptions you made that the spec didn't state, and mark the ones you're unsure about — this turns silent guesses into something the user can catch before they're buried in code.

Keep it tight:
> **Assumptions**
> - Tasks are private to their creator (spec implied it, didn't state it) — confident
> - Archive is a soft-delete, not a hard delete — ⚠️ unsure, please confirm

## Build the Slice
You decide *how* to build it. Two principles:

- **Data contract before UI.** When the feature has a backend, settle the schema and API signatures first, then build the UI against those real signatures — not throwaway mocks a later step has to rip out. The level order in `tasks.md` already enforces this; honor it.
- **Use what the project already has before hand-rolling anything.** Look through its existing components first — `docs/stacks/ui-<value>.md` says where they live and how new ones are added; with no pack, follow the conventions already visible in the code and **never install a component library the project did not ask for**. A second, hand-written version of a component that already exists is the most common avoidable mess there is. **Apply `docs/design-system.md`** — `/init` writes it for every project, so treat it as binding rather than optional: its colors, radius, typography, and its hover/focus and light-dark rules apply to everything you build. Only ask for visual direction if that file is genuinely missing (a project that predates it).

## Keep It Minimal
The acceptance criteria define the exact functional scope — build precisely to them, then stop. Default to the simplest implementation that meets them; solve the problem in front of you, not a generalized version of it.

- No abstraction until there are two real callers — don't extract a helper, hook, or generic for a single use.
- No speculative options, config, or flags for requirements not in the spec.
- Don't hand-roll what the framework or an installed library already does.
- Don't add defensive handling for cases the spec rules out.
- Prefer code the spec's reader could follow over clever code.

This governs structure, not safeguards — it never licenses dropping a non-negotiable. RLS, input validation, auth checks, and loading/error/empty states are required no matter how simple the feature.

If the simple approach genuinely looks insufficient, that's a load-bearing assumption: surface it or ask — don't silently build the heavier version.

## What "Done" Means
These outcomes must hold, and you verify them rather than assert them. The security items are **hard gates**: a slice with a missing data-access rule or an unauthenticated write endpoint is not done, however well it builds. A stack that has no matching pack changes *how* you satisfy a gate — never *whether* you do.

Data & API (when the feature has a backend):
- Every new table has its **data-layer access rules enabled**, covering exactly the operations this feature uses — the database's own check, independent of the one in application code. What that mechanism is called and how it is written is in `docs/stacks/backend-<value>.md`; with no pack, ask. A table that a stranger holding a public key can read is not done.
- Every write endpoint validates its input and rejects unauthenticated and unauthorized requests.
- **Anything that checks a credential is rate-limited (hard gate).** Login, signup, password reset, invite codes, shared passwords — the throttle `design.md` specified is actually implemented and returns a 429 (or the specified refusal) once the limit is hit, and the failure message doesn't reveal whether the account exists. For custom auth routes, key the limit by **IP and account**, not IP alone. If the design relies on the auth platform's own limits or a CAPTCHA instead, those are `[user]` tasks in `tasks.md`: set the local mirror where one exists, hand the dashboard step over with path and value, and count the feature as not done until the user has ticked it — the backend pack says what that platform covers, what it does not, and whether the setting can be pushed from the repo instead. A login that accepts unlimited guesses is not done, however well it builds.
- Performance-relevant columns are indexed; no N+1 access patterns.
- Every schema change is captured as a **versioned migration file** and applied to the **test** environment, never live — see "Schema Changes Are Versioned Files" above for the discipline and the backend pack for the paths and commands.
- Integration tests exist per route, proving the code itself runs correctly — happy path plus the failure paths (rejected input, unauthenticated, wrong user). **And each of them has been red at least once.** Prove it **per test file, not per assertion**: break every guard that file covers in one go (flip the expectations, drop the checks), run **that file only**, watch each test fail for the reason it exists, restore, run the file again. One red round per file, one line about it in your report — a full-suite run per assertion is the same evidence at many times the cost. No exemption for tests that "obviously" fail: a test that compares a label to the value it imported from the label module is exactly the tautology this round exists to catch. A test that cannot fail proves nothing and will pass right through the bug it was written for. This is your own proof that the code works, not the acceptance test; `/qa` owns acceptance, and `/e2e-tests` owns end-to-end browser tests for critical journeys.
- No secrets hardcoded in source.

UI:
- Loading, error, and empty states are handled.
- Responsive across mobile (375px), tablet (768px), desktop (1440px).
- Semantic HTML and ARIA where it matters; keyboard navigable.
- **Forms with credentials or sensitive data POST — never native GET (hard gate).** A `<form>` left to submit natively sends every field in the URL (`?email=…&password=…`), leaking them into browser history, server logs, and referrer headers. **Every framework has a server-side submit path and a way to intercept a client submit** — `docs/stacks/framework-<value>.md` names this one's; with no pack, find how this project already handles form POSTs and follow it. Never put credentials, tokens, or PII in a URL or query string.
- **Use the auth library's own login flow rather than hand-rolling a form** that risks native submission. The backend pack carries the shape for this project's auth; consult the matching domain skill or a live-docs MCP for its current API.

Whole slice:
- The project builds and its tests pass — `commands.build` and `commands.test` from `.ai-eng-kit` (and every layer's, from its `root`), run **once, at the end, by you**. The per-level runs and the sub-agents' single-file runs do not replace this one, and it does not replace them. A `null` there is a question for the user, not a check to skip.
- The UI talks to the real endpoints — no leftover mock data.
- Every acceptance criterion is addressed in the implementation. `/qa` independently verifies them — that check is its job, not a box you tick here.

Run the checks. "Should pass" is not "passes."

For deeper setup when a feature needs it: `docs/production/database-optimization.md`, `docs/production/rate-limiting.md`. Load only when relevant.

## Context Recovery
If your context was compacted mid-task — or `/build` is called again after an interruption (a usage limit, a closed session) — don't restart from zero:
1. Re-read the feature folder (`spec.md`, `design.md`, `tasks.md`) and `features/INDEX.md`.
2. Check `tasks.md` for which tasks are already checked off and `git log` for the level commits; `git diff` and `git worktree list` show what the interrupted level left behind (integrate a fork's finished work if its task is complete, otherwise remove the worktree and redo the task); plus a listing of this project's own route and component directories (the framework pack names them) to see what already exists.
3. Continue from the first unchecked task in the current level. Don't duplicate work.

## When You're Done
- Every task in `tasks.md` is checked off — `[user]` tasks by the user, `[user go-live]` tasks by nobody yet (they are `/deploy`'s). If a `[user]` task is still open, say so as the first line of the report and list them with their `where:` — the feature is built, not done; `/qa` will treat an open one on a credential path (login, signup, password reset) as a bug. List the `[user go-live]` ones separately, as what `/deploy` will make — they do not keep the feature from `/qa`. Don't write implementation notes into `spec.md` — it's read-only; put any short notes at the end of `design.md` or in the commit message.
- Set the feature's status in `features/INDEX.md` (it's "In Progress" while you build) — **the status cell and nothing else.** What you built, fixed or measured never goes into the row: INDEX is loaded into every session. It goes into the commit message and, where it is a deviation or a decision, the end of `design.md`.
- Report back: what you built, the assumptions you surfaced, and the verification results.
- Hand off, in the working language (the quote is the content, not the wording): "Feature is built. Next: run `/qa` to test against the acceptance criteria — it verifies in a context that has not seen this build (its own sub-agents, or a fresh session if your agent has none)." · „Das Feature ist gebaut. Nächster Schritt: `/qa` ausführen, um es gegen die Acceptance Criteria zu testen — die Prüfung läuft in einem Kontext, der diesen Build nicht kennt (eigene Sub-Agenten, oder eine neue Session, wenn dein Agent keine hat)."

## Git Commit
One per verified level, and the closing one:
```
feat(PROJ-X): level 1 — schema and types
feat(PROJ-X): Implement [feature name]
```
