---
name: audit
description: Check that the project's documentation still matches reality — INDEX status, feature folders, the AC→Task→Test chain, and code that has no spec. A read-only drift report in plain language. Run anytime, especially before /deploy or after quick ad-hoc changes.
argument-hint: "optional PROJ-X to audit a single feature"
user-invocable: true
---

# Project Audit

## Goal
Detect drift — verify the project's documentation still matches reality, so nothing rots silently as you build features, fix bugs, and make quick changes. Read every tracking file and the actual files and code on disk, then report, in plain language a non-coder can act on, exactly where they disagree and which skill closes each gap. This is **read-only**: it never edits specs, INDEX, or code. The fixes route through the proper skills so the AC → Task → Test chain stays intact.

## When to run
- Anytime you're unsure the docs reflect what was actually built.
- **Before `/deploy`** — ship from a known-consistent state.
- After a batch of quick fixes or conversational "just change this" requests that may have bypassed the skills.
- When returning to a project after a break.

## Before Starting
1. Read `features/INDEX.md` (the status source of truth) and `docs/PRD.md`.
2. For each `features/PROJ-X-*/` folder, note which of `spec.md`, `design.md`, `tasks.md`, `qa-report.md` exist.
3. Scan the real code surface — in a kit-scaffolded project: `git ls-files src/app/api/`, `ls src/app/`, `ls src/components/*.tsx`, `src/app/layout.tsx`; in any other project the route, component and layout paths the framework pack (`docs/stacks/framework-*.md`) or the code itself names — **an empty listing of a path that does not exist is not "nothing unowned"**, it is a scan that did not happen, and check 5 must say so. Then `git log --oneline -15`, `git status -s`.
4. Read `docs/app-shell.md` if it exists — the app-wide frame and, at its top, which feature owns it.
5. Read `docs/data-model.md` — the app-wide entity map — and note where this project keeps its schema source (migrations, models, an ORM directory; `docs/stacks/backend-*.md` → "Where migrations live" names it for the kit's backends, `docs/codebase/architecture.md` → "Data" for a mapped project).

If a `PROJ-X` argument was given, scope the audit to just that feature.

## Checks
Run each and classify ✅ (in sync) or ⚠️ (drift — always with the fix).

### 1. INDEX ↔ folders
- Every feature row in INDEX has a matching `features/PROJ-X-*/` folder, and every folder appears in INDEX. Flag orphans in both directions — **except rows with status `Mapped`**: they describe a feature that already runs and has no folder yet by design (`/reverse-spec` creates it). A `Mapped` row *with* a folder is the mismatch to flag. Same for **rows with status `Merged`**: `/refine` folded their spec into the feature the Spec cell names, and their folder lies in `features/archive/` on purpose. Flag a `Merged` row whose target does not exist, and one whose folder is still in `features/` next to the live ones. Nothing under `features/archive/` is checked by any step below.
- `Next Available ID` is higher than every used PROJ-X.

### 1b. Migrated and reconstructed features — read this before flagging anything
A `spec.md` whose first lines carry `> Migrated from the AI Coding Starter Kit` **or** `> Reconstructed from code` documents a feature that was **built before this kit's chain existed**. For those features, two of the checks below would fire on every single one and every one of those findings would be wrong:

- **A missing `tasks.md` is expected, not drift.** There was no `/tasks` step when the feature was built, and a task list written now would describe work that is already done.
- **An AC with no task is expected, not a finding.** Same reason. Do not report it, not even as low severity — a page of red on a feature that is live and working teaches the user to ignore the report.

**A `> Consolidated from PROJ-…` line** (written by `/refine` when it folds follow-up specs into one) is the same case for the criteria marked _(from PROJ-…)_ only: they were built under another spec, so they have no task here. The feature's own criteria are checked as usual.

What still counts, unchanged: **an AC with no result in `qa-report.md`**. That one is real — it says the criterion was never verified — and it is the reason to keep reading these features at all.

Say once in the report how many features are in this state, and that `/refine PROJ-X` is what brings one into the chain for real. Do not repeat it per feature.

### 1c. The codebase map, where one exists
If `docs/codebase/features.md` exists: its **Coverage** line and **Unassigned** list are a promise that every route and table belongs to one feature. Report the Unassigned list as one finding (low) until it is empty or the user has marked it *deliberately left*.

With `layers` in `.ai-eng-kit`, count Unassigned and the map's age **per layer**: a job or step under a layer's `root` that no feature and no `design.md` names is the same finding as an unowned route, and `git log --diff-filter=A` since the Stand is filtered to each layer's `root` as well.

If `docs/tech-debt.md` exists: every `Open` or `Planned` row whose **Path** no longer exists is one finding (low) — the debt moved or was resolved without the tracker hearing about it. A row in `concerns.md` with no tracker entry means the map predates the tracker: say so once and recommend `/map`.

**The map's age is measured, not guessed.** The line under the title of `docs/codebase/architecture.md` names the commit the map was taken at. List what was added since in the places where routes, schema and auth live — `git log --diff-filter=A --name-only --format= <sha>..HEAD`, filtered to the paths the framework and backend packs name for this (or the paths `architecture.md` itself lists); an old map with a date but no commit is measured by date. Every new file that no `features/*/design.md` describes is a route, table or auth rule the map and the feature documents both do not know: report them as one finding (**medium** — `/architecture` refuses to design while they exist) → `/map --refresh`. New files a `design.md` does describe are the map lagging behind the workflow, not drift; mention the count once, low, with the same fix. Do not re-map here.

### 1d. Features spread over several specs — only where the migration recorded them
If `.ai-eng-kit-backup/migration-report.md` exists and has a `## Spread over several specs` section, each line there (`PROJ-12 ← PROJ-44, PROJ-49, PROJ-80`) is a feature whose current state has to be pieced together from several files. Report each group **once, as low**, with the fix: `/refine PROJ-12` (consolidate). A group is done — and no longer reported — when its follow-up rows are `Merged` in INDEX; one that is partly merged is reported with what is left.

**No file, or no such section: skip this check silently.** Do not go looking for groups yourself — finding them means reading across every spec, which is the migration's inventory and `/refine`'s search, not an audit's.

### 1e. What every session loads — INDEX and the memory file
Both are read in full at every start, so their size is a cost every feature pays. Measure, do not read for content: `wc -l features/INDEX.md` and the memory file (`.ai-eng-kit` → `memory`), and `awk 'length > 400' features/INDEX.md | wc -l` for rows that carry more than a row.
- **An INDEX row longer than about 400 characters** (a full row — ID, name, one sentence, status, folder link, date — is around 250) holds something that is not a row — a bug log, measurements, a decision history. Low, one finding for all of them with the count and the worst three IDs. Fix: `/cleanup` (it moves the content into the feature's files, nothing is lost).
- **A memory file above 200 lines, or with the same heading more than once** — 200 is the agent vendors' own upper bound for a file that is loaded every time; the kit's scaffold is just under 100, and that is the size to aim for. Count the file itself, not what it imports (`grep -c` the headings). Low. Usually a session-log routine that appends instead of replacing. Fix: `/cleanup`, and the routine.

Healthy for orientation: a memory file of about 100 lines; an INDEX of about 40 fixed lines plus **one line per feature and one per release** — 50 features and 20 releases are some 110 lines. An INDEX far above that count has rows that broke into paragraphs.

### 2. Status ↔ artifacts
Each status promises certain files exist. Flag mismatches **either way** (except as set out in 1b):
- **Mapped** → no folder at all (see 1b/1c)
- **Spec'd** → `spec.md` only, carrying the `Reconstructed from code` marker; no `tasks.md` expected, and a `qa-report.md` is the *next* step, not drift
- **Planned** → `spec.md`
- **Architected** → + `design.md`
- **Tasked** → + `tasks.md`
- **In Progress** → `tasks.md` present, build underway
- **In Review / Approved** → `qa-report.md`
- **Deployed** → a line under INDEX's `## Deployments` names the feature (for a reconstructed feature: the `live before the kit` line `/qa` writes)

Typical drift: status says "Architected" but there is no `design.md`; a `qa-report.md` exists but status is still "Tasked"; a folder has every file but INDEX still says "Roadmap".

### 3. AC → Task → Test chain (the backbone)
For each feature that has a spec: every AC-ID in `spec.md` should be referenced by at least one task in `tasks.md` and reported on in `qa-report.md` (where those files exist for the feature's status). Flag ACs with **no task** (won't get built) or **no test** (won't get verified). Broken links here are the most important drift to surface — **except on a migrated feature (1b), where "no task" is expected and only "no test" counts.**

### 4. Contract integrity
`spec.md` should still be the clean WHAT. Flag it if it has grown implementation or tech-design sections that belong in `design.md` — the spec is read-only during build, so pollution means something wrote to the contract.

Also flag any **leftover status or date header** in `spec.md`, `design.md`, or `tasks.md` (`## Status: …`, `**Status:** …`, `**Created:** …`, `**Last Updated:** …`). Projects created before these were removed still carry them, and nothing updates them — so they show a status that was true once and has been wrong ever since. The fix is to delete the line, not to correct it: the feature's status lives only in `features/INDEX.md`.

### 5. Code without a spec (the ad-hoc drift)
Map the real code surface to features. Flag app code that no feature seems to own — an API route, page, or custom component with no corresponding spec/AC. This is the classic result of "just build/fix this" outside the flow. Say so plainly: the code may be fine, but it's undocumented — back-fill it with `/write-spec` (or `/refine` the owning feature), or remove it if it was a throwaway.

### 6. The app shell ↔ its owner (the cross-cutting drift)
Check 5 finds code that no feature owns. This one finds the special case that hides in plain sight, because it lives in *every* feature at once: the **app shell** — the frame around all pages (layout, sidebar or top nav, logo, mobile burger, the page-header pattern).

Read `docs/app-shell.md` (the app-wide map, if it exists), then look at what's really there: the app's root layout (`src/app/layout.tsx` in a kit-scaffolded project; elsewhere whatever the framework pack or the code names — an `mcp` or `cli` project has no shell, skip this check and say so), and components whose names or contents point at the frame (`*sidebar*`, `*nav*`, `*header*`, `*shell*`, `*layout*`). Flag:

- **A shell with no owning feature.** Real shell components exist, but no `spec.md` has acceptance criteria for them — `docs/app-shell.md` has no owner recorded, or names one that isn't in INDEX. This is the important finding: the shell works, but nothing defines what it must do, so any later rework has nothing to test against. → back-fill one small feature with `/write-spec` ("App Shell & Navigation"), describing the shell **as it is today** plus what should change; existing features only get a reference via a light `/refine`.
- **Shell grown by accretion.** Two or more features' `design.md` describe the same shell element (each adding its own nav entry, header variant, or mobile behavior). Name the features you found it in — that list *is* the evidence that it belongs to none of them.
- **Map missing or stale.** The app clearly has navigation but there is no `docs/app-shell.md` → `/architecture` writes it from what exists. Or the map lists areas the nav doesn't have (or the nav has areas the map never got) → the map drifted; say which entries disagree.
- **No shell to speak of** (a single-screen tool) → not drift. Don't manufacture a finding; the frame genuinely belongs to the one feature that owns the screen.

### 6b. The data model ↔ the schema (the other cross-cutting drift)
`docs/data-model.md` is the app-wide map of entities; the schema source (step 5 of Before Starting) is what actually exists. Both are written at different times by different skills, and nothing but this check puts them side by side. Compare the **Entities** table with the tables or models in the schema source — names only, at product altitude; column types are the feature's `design.md`'s business, not this map's. Skip the platform's own tables (an auth schema, a migrations ledger, framework bookkeeping) and say that you did. Flag:

- **A table with no entity.** It was built, but the map never learned of it — usually a feature whose `/architecture` skipped the "update it (living document)" step, or code that grew outside the workflow. Name the table and, where a `design.md` mentions it, the feature → `/architecture PROJ-X` brings the map up to date; where none does, this is check 5's finding too (code without a spec) → `/write-spec`.
- **An entity with no table.** Designed, never built, or renamed since — name it and the feature whose `design.md` introduced it → `/build` if the feature is open, `/refine` if the entity was dropped, or correct the map if it was renamed.
- **Still the empty template** in a project the kit was added to → not drift on its own: in `mode: existing`, `/init` fills it only when one schema source states the whole model (then it opens with `_Source: <path>_` — compare against exactly that source) and otherwise leaves it empty with the reason, and `/architecture` fills it one verified feature at a time. Say so once, low, and point at `/map` + `/reverse-spec` as the way the entities get in. In a kit-scaffolded project with Deployed features, an empty map *is* drift → `/architecture` of the first feature that has tables.
- **`platform` has no database** (`mcp`, `cli`, a tool with files only) → skip this check and say so.

### 7. Feature branches ↔ INDEX
Features are built on `feat/PROJ-X-name` branches, so branches pile up over a project's life. Compare them against INDEX:

```bash
git branch --list 'feat/*'
git branch --no-merged main --list 'feat/*'
```

- **Unmerged branch on a feature INDEX calls "Deployed"** — the most important finding here. The feature is recorded as live but some of its commits never reached `main`: either it isn't fully live, or the branch holds work that was dropped. Only the user knows which. → raise it, don't guess.
- **Merged branch on a Deployed feature** — done; harmless clutter. → `/deploy` offers to delete these after a launch.
- **Unmerged branch on a feature still In Progress / In Review / Approved** — normal, work in flight. **Not** drift; don't report it as one.
- **Branch with no matching PROJ-X** — an experiment or abandoned work. → ask the user what it is.
- **Approved feature with no branch at all** — it was built on `main`. Fine, but worth a line, since `/deploy` will find nothing to merge.

### 8. Working language consistency
The project has **one** working language (`CLAUDE.md` → Key Conventions → Working language). Half-translated documents are real drift: they make the AC → Task → Test chain harder to follow and they signal that some skill wrote without reading the setting.

- **The setting itself is missing** or still shows the raw `{{WORKING_LANGUAGE}}` placeholder → `/verify-setup` records it.
- **A document is in the wrong language** — the PRD is German but a `spec.md` is English, or vice versa. Name the file.
- **A document is half-translated** — the classic case, and the one worth looking for hardest: acceptance criteria in one language under headings in the other (`Angenommen/wenn/dann` in an otherwise English spec, or `Given/when/then` in a German one), or a German `design.md` whose `tasks.md` is English.

Do **not** flag as drift: code identifiers, file and folder names, commit messages, branch names, the kit's own files (`.claude/**`, `docs/production/**`, `features/README.md`), or established technical terms left untranslated (*Acceptance Criteria*, *Edge Case*, *Deploy*, *Row Level Security*, *Severity*).

The fix is never a bulk translation: route it to the owning skill (`/refine PROJ-X` for a spec, `/architecture` for a design) so AC- and EC-IDs survive. Say that explicitly when you report it.

### 9. Uncommitted / untagged work (light)
Note uncommitted changes (`git status -s`) and recent commits whose messages lack a `PROJ-X` tag — both can signal work that skipped the documented flow.

## Output
A plain-language report grouped by feature, each drift item with its one-line fix:

```
🔎 Project Audit

✅ In sync
   PROJ-1 Supabase Setup — Deployed, all files present, ACs traced
   PROJ-2 Task Board    — Approved, qa-report covers AC-1…AC-5

⚠️ Drift found (3)
   PROJ-3 Comments — INDEX says "Architected" but there is no design.md
      → Run /architecture PROJ-3  (or correct the status if it was a slip)
   PROJ-2 Task Board — AC-4 has no test in qa-report.md
      → Run /qa PROJ-2 to cover AC-4
   src/app/api/export/ — API route with no owning feature
      → Run /write-spec to back-fill a spec, or remove it if it was a throwaway
   feat/PROJ-1-auth — 4 commits never merged, but PROJ-1 is marked Deployed
      → Check with the user: unfinished work, or a branch you decided against?
   App shell (sidebar, logo, header) — no owning feature; grown across PROJ-1/2/3
      → Run /write-spec for "App Shell & Navigation" so it has acceptance criteria
   docs/data-model.md — table `invoice_items` exists in the schema but is not in the entity map
      → Run /architecture PROJ-4 (it introduced the table) to bring the map up to date
   docs/codebase/ — mapped at a1b2c3d; 2 routes and 1 migration added since that no feature describes
      → Run /map --refresh before the next /architecture

Summary: 2 in sync · 6 drift items · 0 critical
```

## Important
- **Read-only.** Never edit specs, INDEX, or code — report and route. Fixes belong to the owning skills so the AC → Task → Test chain stays intact.
- **Drift is not clutter.** You report documents that *disagree* with reality. Documents that are merely long — resolved questions, fixed bugs, sprawling decision logs — are `/cleanup`'s job, not a drift finding. Route them there instead of flagging them here.
- Plain language, no dev jargon — the audience is a non-coder.
- Distinguish real drift from the harmless: a deliberately deferred Open Question or a documented Out-of-Scope item is **not** drift.
- If everything is in sync, say so clearly and stop — never manufacture findings.

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
- All green:
  > "Everything's in sync. You're safe to keep building or run `/deploy`."
- Drift found: list the exact skills to run, **most important first** (broken AC → Task → Test chains before cosmetic status fixes), then:
  > "Fix these in order, then run `/audit` again to confirm you're back in sync."
