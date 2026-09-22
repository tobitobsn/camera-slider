---
name: tasks
description: Break an approved feature design into an ordered, traceable, parallelizable task list (tasks.md). Run after /architecture, before /build.
argument-hint: "PROJ-X"
user-invocable: true
---

# Task Planner

## Goal
Break the approved feature design into an ordered, traceable task list that `/build` works through — sequentially or in parallel. You produce the parallelization plan; you do NOT write code. The task list (`tasks.md`) is the bridge between the WHAT (`spec.md`), the HOW (`design.md`), and the actual build.

## Before Starting
1. Read `features/PROJ-X-*/spec.md` — you need the **AC-IDs** (AC-1, AC-2, …) and **EC-IDs** (EC-1, EC-2, …); these are the traceability backbone.
2. Read `features/PROJ-X-*/design.md` — the Component Tree, Data Model, and API design you'll derive tasks from.
3. Read `features/INDEX.md` — current status and what's already shipped.
4. Verify: the feature's status in INDEX.md is **"Architected"** AND `design.md` exists on disk.

**If the status is not "Architected" or `design.md` does not exist:**
> "This feature has no approved design yet. Run `/architecture PROJ-X` first."
→ Stop here.

## Workflow

### 1. Derive Tasks from Design + Spec
Walk the `design.md` Component Tree, Data Model, and API design, and turn each into the concrete work steps needed to build it. Map every step to the **AC-ID(s)** it satisfies.

**Coverage check:** every AC in `spec.md` must be covered by at least one task. An AC with no task is a hole in the plan — add a task or explain the gap before continuing.

### 2. Group Tasks into Dependency LEVELS
Group tasks into levels by dependency, so each level only depends on levels before it. Typical shape:
- **Level 1 — Data / Schema** (tables, migrations, data-access rules, types)
- **Level 2 — API** (routes, server actions, validation)
- **Level 3 — UI** (components, pages, wiring to real endpoints)
- **Level 4 — Polish** (states, responsiveness, a11y, integration tests)

Levels run **sequentially** — they are barriers. This is what preserves "data contract before UI": the schema/API levels finish before the UI level starts. Not every feature needs all four levels; collapse or drop empty ones.

### 3. Assign [P] — Strictly by the Disjointness Rule
Within a single level, mark a task **[P]** only when it can run in parallel with the other [P]-tasks of that level. The rule is hard:

> A task may be **[P]** only if its `files:` set is **DISJOINT** from every other [P]-task in the same level. If two tasks touch the same file, they are NOT both [P] — sequence them (drop [P] from one) or merge them into one task.

Tasks in different levels are never parallel with each other (the level barrier handles ordering). [P] is purely about parallelism *within* one level. When in doubt, leave [P] off — a false [P] causes parallel writers to collide in `/build`.

### 4. Give Each Task `files:` + AC-Refs
Every task line carries: an ID, optional `[P]`, a short action, `files:` with the explicit path(s) it writes, and `→` the AC-ID(s) it satisfies. The `files:` list is what the disjointness rule is checked against, so make it accurate.

**`[user]` tasks — work only the user can do.** `design.md` → **Settings the user makes** lists measures that live in a provider's dashboard (a rate limit, a CAPTCHA switch, a sending limit). Each becomes one task marked `[user]` instead of `[P]`, with `where:` in place of `files:` — the exact path and the value:

```
- [ ] T6 [user]  Supabase: enable CAPTCHA (Turnstile) on sign-in / sign-up · where: Dashboard → Authentication → Attack Protection · → AC-5
- [ ] T12 [user go-live]  Stripe: register the production webhook endpoint and put its signing secret into the host's environment · where: Stripe → Developers → Webhooks → `https://<production-url>/api/webhooks/stripe`; host → Environment Variables → `STRIPE_WEBHOOK_SECRET` · → AC-3
```

Rules for them: never `[P]` and exempt from the disjointness rule (they touch no file); placed in the level whose code depends on them (the throttle before the API that relies on it); **ticked by the user, never by `/build`**; and they count — a feature with an open `[user]` task is not done, because a setting that exists only in the plan protects nobody.

**A row the design marks `go-live` becomes `[user go-live]`** — same shape, but it needs the production URL or the host, so nobody can make it before `/deploy` Step 2. It does **not** count against done: `/build` names it in the hand-off as deploy work and builds against the test-environment twin the design names, `/qa` verifies the AC against that twin and records the production wiring as NOT VERIFIED, `/deploy` makes it once production exists and ticks it only after the callback was seen to arrive. Put it in the last level, after everything it depends on. A `[user go-live]` box ticked before `/deploy` is a lie; a `[user go-live]` marker on a setting the test environment could already hold is a `[user]` task dodging `/qa`. Where the backend pack says the provider can push the setting from a config file in the repo, it is a normal built task plus a one-line hand-off, not a `[user]` task.

Keep tasks **coarse-grained** — meaningful checkpoints, roughly **5–20 per feature**, not micro-steps. "Create todos table + RLS + types" is one task; do not split it into "add column", "add policy", "add type".

**And a task has a ceiling: it must fit one sub-agent's context.** `/build` hands a `[P]` task to a fork that starts cold — it reads its part of the design, the stack pack, the files it touches, writes the code and the tests, and iterates until they are green, all in one context window. A task that outgrows the window does not finish, and what it had done is paid for twice. So: **one concern per task, and roughly five files in `files:` at most** (tests included). Past that, split along a seam the design already has — per entity, per route, per screen — and keep the halves file-disjoint so both can stay `[P]`. "Build the whole API" is not a task; "orders endpoints + validation + tests" is. A large feature legitimately lands above 20 tasks this way: the ceiling wins over the count.

### 5. Present the Plan and Get Approval (Human-in-the-Loop)
Show the user the full leveled task list — this is the **parallelization plan** that `/build` will fan out against. Walk them through the levels, what runs in parallel, and the AC coverage. Apply feedback. Do not write the file or advance status until the user approves the plan.

### 6. Write tasks.md
Using [template.md](template.md), write the approved task list to `features/PROJ-X-*/tasks.md` (same folder as `spec.md` and `design.md`).

### 7. Update Tracking
Set the feature's status in `features/INDEX.md` to **"Tasked"**.

## Important
- **The disjointness rule is non-negotiable.** [P] is a promise that parallel `/build` agents won't touch the same file. A wrong [P] corrupts the build. Verify every `files:` set against its siblings before marking [P].
- **No micro-tasks, no giant ones.** Coarse, checkpoint-sized tasks (~5–20): past ~20 on an ordinary feature you're slicing too thin. But a task with more than about five files or more than one concern will not fit a sub-agent's context — split it, even if that takes the count past 20.
- **Every task traces to an AC.** A task with no `→ AC-x` is scope you can't justify — drop it or find the AC it serves.
- **A dashboard setting is a task, not a question.** If the design needs one, it is a `[user]` task with the path and the value written out — the user ticks it, nobody asks them how they would like to configure it.
- You write the plan, not the code. `/build` implements; you only decide the order and the parallelism.

## Checklist Before Completion
- [ ] Read `spec.md` (AC-IDs), `design.md`, and `features/INDEX.md`
- [ ] Status was "Architected" and `design.md` existed
- [ ] AC coverage complete — every AC mapped to at least one task
- [ ] Tasks grouped into levels in dependency order (data → API → UI → polish)
- [ ] [P] assigned strictly by the disjointness rule — no two [P] tasks in a level share a file
- [ ] Every task has explicit `files:` and `→` AC-Refs — or, for `[user]` tasks, `where:` with path and value
- [ ] Every row of `design.md` → Settings the user makes is a `[user]` task, placed before the code that relies on it — or a `[user go-live]` task in the last level where the row says `go-live`
- [ ] Tasks coarse-grained (~5–20), no micro-steps — and none above one concern / ~5 files
- [ ] User has reviewed and approved `tasks.md` (the parallelization plan)
- [ ] `tasks.md` saved to `features/PROJ-X-*/tasks.md`
- [ ] `features/INDEX.md` status updated to "Tasked"

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
> "Task breakdown ready and approved. Run `/build` to implement PROJ-X — independent tasks run in parallel."

## Git Commit
```
docs(PROJ-X): Add task breakdown for [feature name]
```
