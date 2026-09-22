---
name: map
description: Map a codebase that already exists — stack, architecture, conventions, concerns, and a proposed feature map — into docs/codebase/, with a file path behind every finding. Run before /init in a project the kit was added to, and again after large changes to refresh the map.
argument-hint: "[--refresh]"
user-invocable: true
---

# Codebase Map

## Goal
Read a codebase that already exists and write down what it is — so that `/init` proposes instead of asks, `/architecture` designs against what is there instead of a second copy of it, and `/audit` and `/security-check` start from a list of known weak spots. Do it with a file path behind every claim, because the person reading the map usually cannot check it against the code: a map that is wrong in one place teaches them to distrust all of it.

The map is **evidence, not opinion**. It says what the code does and where, never what it should do — that judgement is the user's, and `/init` and `/reverse-spec` are where they make it. One output goes further than description: `features.md`, a **proposed feature map**, sliced by rules the user never has to apply themselves. They only confirm it.

## When to run
- **Before `/init` in `mode: existing`** — the normal case. `/init` reads `docs/codebase/` first and turns it into proposals.
- **After large changes** (`/map --refresh`, or just `/map` again) — the map is a snapshot, and `/architecture` trusts it only as far as its **Stand** reaches: every document records the commit it was mapped at, and `/architecture` and `/audit` count the routes, tables and auth files added since. When one of them sends you here, that is why. A refresh re-reads everything, rewrites the five documents and says what changed since that commit.
- **Not** in an empty project: there is nothing to map. Say so and hand off to `/init`.

## Before Starting
1. Read `.ai-eng-kit` → `mode`, `platform`, `stack`, `commands`, `probe`, `layers`. `null` means "no file stated it" — the map may *propose* a value with its evidence, and only `/init` may record one.
2. Take the **Stand** once: `git rev-parse --short HEAD` and today's date. Every mapper writes both into the line under its document's title, and so do you in `features.md` — the same commit in all five files, because it is what `/architecture` and `/audit` measure the map's age against. (No git repository → write the date alone and say in the output that the map cannot be dated by commit.)
3. Check whether `docs/codebase/` already holds a map. If it does, this is a refresh: read the old Stand from the header of `architecture.md`, keep the old files readable until the new ones are written, then report what moved since that commit — `git log --diff-filter=A --name-only --format= <old>..HEAD` for the additions, plus what the new documents say differently (new routes, new tables, concerns resolved or added). An old map without a commit in its header is compared by date (`git log --since=<date>`).
4. Check whether `graphify-out/graph.json` exists at the project root. If it does, the project has a knowledge graph from [graphify](https://github.com/Graphify-Labs/graphify): dependency edges, communities, shortest paths — use it (`graphify query`, `graphify path`, `GRAPH_REPORT.md`) wherever a mapper would otherwise trace imports by hand. If it does not, **do not install it and do not suggest it as a prerequisite**; read the code directly. Mention once, at the end, that the graph is an optional accelerator for the next refresh — nothing more.
5. Read `.gitignore` and note the generated folders (`node_modules`, `vendor`, `.next`, `dist`, `build`, `__pycache__`, …). Mappers skip them; a map of `node_modules` is a map of someone else's code.

## The four focus areas
Each focus area is one mapper with one brief — the brief is `.claude/skills/map/mapper.md`, and it carries the document templates and the rules every mapper follows (evidence, secrets, no invented findings, confirmation-only return).

| Focus | Writes | Answers |
|---|---|---|
| `tech` | `docs/codebase/stack.md` | What is it built with, how is it started, how would a running instance be checked, how does it go live — each as *stated by a file* or *inferred*, never blurred |
| `arch` | `docs/codebase/architecture.md` | Layers, entry points, **every route / screen / tool**, where the schema lives and **every table / entity**, server functions and endpoints, how auth and permissions work, the shared shell, the design system |
| `quality` | `docs/codebase/conventions.md` | Style, naming, state, error handling, what tests exist and what they cover, what a finished change looks like here |
| `concerns` | `docs/codebase/concerns.md` | Oversized files with mixed responsibilities, duplicated logic, untested critical paths, security smells, fragile areas — each with path, size and severity |

**Fan out where you can, run in order where you cannot.** If your agent can fork sub-agents, start all four at once, each with its own context window: a codebase of a few hundred files does not fit in one, and the point of the brief is that the orchestrator never holds the documents — only four short confirmations. Each fork is told explicitly: *read `.claude/skills/map/mapper.md`, your focus is `<focus>`, write `<file>`, return the confirmation block and nothing else.* If your agent cannot fork, run the four briefs yourself, one after the other, writing each document before reading for the next — same files, same sections, same rules. The fan-out is an optimization; the brief is the contract.

**Mappers do not share what they found with each other.** `arch` is the one whose output the feature map needs, and it writes the route and table lists in a fixed shape for that reason (see the brief). The others stand alone.

## The feature map (`docs/codebase/features.md`) — written by you, after the four
Read `docs/codebase/architecture.md` (routes, tables, server functions, nav entries) and, where present, the graph's communities. Do **not** read the codebase again for this — if the architecture document cannot carry the feature map, the fix is a better architecture document, not a second pass.

**Slicing rules — apply them yourself, never put them to the user:**
- **One feature = one thing a user does with the app.** Typically one navigation entry or one route group, plus the tables and server functions that only it owns.
- **Target 5–12 features.** Where one would carry more than about 12 acceptance-criteria candidates, split it along what the user does (*create invoices* / *send invoices*); where one carries fewer than 3, merge it into its neighbour.
- **Cross-cutting capabilities become features of their own** — accounts & login, roles & permissions, notifications, billing. Otherwise "must be logged in" becomes a criterion in every feature, and none of them owns it.
- **A pipeline step, job or CLI command owns a feature when its outcome is observable at the data or API boundary** — "after the run over raw X, table Y holds …" is something the product relies on, and its criteria are verified through that layer's own test command. A step with no observable outcome goes under **Unassigned** with that reason, not into the nearest feature.
- **Every route, every table and every server function belongs to exactly one feature.** What does not fit anywhere goes under **Unassigned** — that list *is* the coverage figure, and it is what `/audit` checks later. Do not hide a leftover in the nearest feature to make the list empty.
- **Propose an order**, core flow first: the feature that touches the most tables and that others refer to; then the cross-cutting ones it depends on; edge features last. One line of reasoning per position, not a paragraph.

Per feature: a **name** (two to four words, the way a user would say it), **one sentence** of what it does, the **evidence** (routes, tables, server functions, jobs, the main files), the **layer** it lives in (`app`, or the name of a runtime from `.ai-eng-kit` → `layers` / the tech focus), an **estimated number of acceptance criteria** (one per observable rule you can see — validation, permission, state change, error case; a rough count, not a list), and the **order** with its reason. Then the **Unassigned** list and a single **Coverage** line: `N of M routes, N of M tables, N of M server functions assigned`.

Names and sentences are in the project's working language. Route paths, table names and file paths stay as they are in the code. The file opens like the other four: `# Feature Map` and, under it, `_Mapped by \`/map\` on <date> at commit \`<short sha>\`._` — the same commit as in `architecture.md`.

## Carry the concerns into the tracker (`docs/tech-debt.md`)
`concerns.md` is a snapshot — the next refresh rewrites it, and with it every "resolved" mark, every priority and every decision to leave something alone. `docs/tech-debt.md` is where those survive: the project's own list of internal work with a status, owned by the user, and only ever **appended to or status-changed** by the kit. If the file is missing (a project installed before it existed), create it with the header and table from `docs/tech-debt.md` in a fresh scaffold — the same file `create` and `add` seed.

For every row in `concerns.md`:
- no tracker entry with the same path and category (compare the path, not the wording) → append one: next `TD-n`, `Open`, path, one line of what and why, the severity, the owning features from `features.md` (or *unassigned*), found at this Stand;
- an entry exists with `Open`, `Planned` or `Accepted` → leave it exactly as it is — the user's status and notes win;
- an entry exists with `Resolved` but the concern is back → append a new entry that names the old ID.

For every `Open` or `Planned` entry whose concern no longer appears in `concerns.md` — the file is gone, or the mapper no longer finds it — set it to `Resolved` at this Stand. `Accepted` entries are never touched. Nothing is ever deleted, and no text the user wrote is rewritten. Security smells go in too, but never as `Accepted`.

## Verify before you report
- All five files exist under `docs/codebase/` and each carries every section of its template — an empty section says *none found* with what was searched, never nothing.
- The line under every title carries today's date and the same short commit — the Stand. Five files, one commit; a mapper that dropped or paraphrased it has left `/architecture` with no way to measure the map's age.
- Every finding in `concerns.md` has a file path. Spot-check three at random: open the file, confirm the claim. A mapper that invented one has likely invented more — re-run that focus rather than patching the line.
- `features.md` accounts for every route and table listed in `architecture.md`, assigned or unassigned. Count them; the coverage line must add up.
- No document quotes a secret, an API key, a token, or the contents of an env file — not even masked. If one does, delete the value before anything else and re-brief that mapper.
- Nothing outside `docs/codebase/` was written, except appended rows and status changes in `docs/tech-debt.md`. The map never touches `.ai-eng-kit`, `docs/PRD.md`, `docs/data-model.md`, `features/INDEX.md` or any code — those are `/init`'s and the workflow's.

## Output
In the project's working language, short:
- how many files were read, how many skipped as generated;
- the proposed feature map as a list — name and one sentence each — with the coverage line and the Unassigned list, because that is what the user will be asked to confirm next;
- the three most serious concerns, one line each, with the path;
- how many tracker entries `docs/tech-debt.md` gained and how many were set to Resolved;
- on a refresh: what changed since the last map's Stand — the commit, and the additions and differences you found;
- whether a knowledge graph was used (one line, optional accelerator, no instruction to install).

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/init`), feature IDs and file paths stay as they are._

If `/init` has not run yet (`docs/PRD.md` is still the empty template):
> "The map is in `docs/codebase/`. Run `/init` — it takes these findings as proposals, asks you to confirm the feature map, and records how the project runs. Nothing in your code was touched."

If `/init` already ran (this was a refresh):
> "The map in `docs/codebase/` is refreshed; `/write-spec` and `/architecture` read it directly. If the feature map gained a feature, run `/init` again — it re-enters, proposes the new rows as `Mapped` and touches nothing else; a feature that is gone is a `/refine` question for its row. `docs/tech-debt.md` has N new entries and M resolved — `/refactor` takes the next one."

## Git Commit
After the documents are written and verified:
```
docs: map the codebase
```
or, on a refresh, `docs: refresh the codebase map`. Only `docs/codebase/*` is in the commit.
