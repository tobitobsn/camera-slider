# Mapper brief

You map **one focus area** of a codebase that already exists and write **one document** under `docs/codebase/`. You are one of four; the others write the other documents. You do not know what they found, and you do not need to.

## Rules that hold for every focus
- **A file path behind every finding.** `src/services/invoice.ts` is a finding; "the invoice logic" is not. Line numbers where it costs nothing. A reader who cannot read code still needs to be able to point someone who can at the exact place.
- **State what a file states; mark what you infer.** `package.json` → `"dev": "vite"` is *stated*. "Probably deploys to Vercel because there is a `vercel.json`" is *inferred* — write `(inferred)` after it. Never let the two blur: `/init` records stated facts and asks about inferred ones, and it can only do that if you kept them apart.
- **Never read `.env*` files, key files (`*.pem`, `*.key`), `secrets/`, `.ssh/`, or the output of a secret manager. Never quote a secret, a token or an API key — not partially, not masked.** Where a service is configured, name the file and the variable *name*; that is all the map needs.
- **Never invent a finding.** If you did not open the file, you do not know what is in it. A section with nothing to report says *none found* and what you searched — never a plausible guess.
- **Skip generated folders** (`node_modules`, `vendor`, `.next`, `dist`, `build`, `__pycache__`, anything `.gitignore` lists). A map of a dependency is a map of someone else's code.
- **The line under the title carries the date and the commit** the orchestrator gave you (`git rev-parse --short HEAD`, taken once for all four documents). It is the map's *Stand*: `/architecture` and `/audit` measure the map's age against it, so it is the one line that must never be paraphrased away — keep the shape `_Mapped by \`/map\` on <date> at commit \`<short sha>\`. …_` exactly, translating only the prose after it.
- **Write the document directly**, in the project's working language (read `.ai-eng-kit` → `language`). Route paths, table names, file paths and identifiers stay as they are in the code. Keep every section of the template, in order — the skills that read this document look for the headings.
- **Return a confirmation only** — at most ten lines: focus, file written, line count, number of findings per section, anything you could not determine. Not the document. The orchestrator verifies the file itself.

## Focus `tech` → `docs/codebase/stack.md`

```markdown
# Stack

_Mapped by `/map` on <date> at commit `<short sha>`. Stated = written in a file; inferred = my reading, to be confirmed._

## Language and runtime
<language(s), version where a file pins it (`.nvmrc`, `.python-version`, `composer.json` → `php`), with the file. **One bullet per runtime.** A second runtime in its own folder — `python/` with `pyproject.toml`, `cli/` with `go.mod` — is a **layer**: its root, language, how it is started and tested (stated / inferred, with the file), and what it exchanges with the app (a table it writes, an API it calls). `.ai-eng-kit` → `layers` lists the ones already confirmed; report those and any you find>

## Framework
<app framework and version, from the manifest; for a polyglot repo, which one is the app and which the backend, with the file>

## Backend and data
<database / BaaS, and **where the schema lives** — migrations folder, ORM schema file, a hosted dashboard with no file at all. State the path. This is what `/init` needs to decide whether `docs/data-model.md` can be filled from one source>

## Package manager and scripts
<lockfile → package manager. Every script from the manifest, verbatim: name → command. Mark which ones start, build, test, lint — stated by the name, or inferred from the command>

## How it runs (proposal for `/init`)
- **Start:** <command> — stated / inferred, <file>
- **Base URL / probe:** <what a running instance answers on — port from the config, a health route, a stdio protocol; or "nothing automatable found">
- **Build:** … · **Test:** … · **Lint:** …

## Integrations and external services
| Service | Used for | Configured in (file, variable **names** only) |
|---|---|---|

## How it goes live
<CI workflows, `vercel.json`, `Dockerfile`, `Procfile`, `fly.toml`, deploy scripts — each with the file, each marked stated / inferred. Anything human-gated you can see (required reviews, release branches)>

## Could not determine
<what you looked for and did not find — so `/init` asks the user instead of guessing>
```

## Focus `arch` → `docs/codebase/architecture.md`

The feature map is built from this document alone, so the route, table and server-function lists are **complete** and in the shape below — one row each, nothing summarised as "and others".

```markdown
# Architecture

_Mapped by `/map` on <date> at commit `<short sha>`._

## Layers and entry points
<how the app is put together: client / server / shared, where requests enter, the root layout or main file — with paths. **One subsection per runtime**: the app, then every entry of `.ai-eng-kit` → `layers` and every second runtime the tech focus found — its root, its main file, where a run starts (a command, a schedule, a queue), and the boundary it shares with the app (the table, the API)>

## Routes, screens, or tools
<every one. Web: route → file → what it does, one row each, including API routes. Mobile: screens. MCP: tools and resources. CLI: commands. Pipelines and workers: each step or job → file → what it reads and writes. Group by directory if there are many, but list each — a layer's rows carry the layer's name>

| Route / screen / tool / job | Layer | File | What it does | Nav entry? |
|---|---|---|---|

## Data: schema source and entities
**Schema lives in:** <one path, or "several: …" — and when several, say **whether one of them leads** (the others only adding to it) or whether each holds a separate piece, because that is what decides if `/init` can map it. Or "hosted only — no file in the repo". A schema generated at runtime from metadata rather than written down is its own answer: say so and name where the generator reads from>

<Read files. A **running** database is corroboration, never a source here: it is one instance with seed data and orphaned columns in it, and nothing about it is reproducible from the repository. If you did read one, put the count beside the file count as a check — a match is strong evidence the map is right — and label it as a reading of that instance on that date.>

| Table / entity | Defined in | Owned by (route group / module) | Notes (relations, RLS/policies present?) |
|---|---|---|---|

## Server functions and endpoints
<server actions, RPC, edge functions, controllers, resolvers — one row each>

| Function / endpoint | File | Called from | Touches (tables) |
|---|---|---|---|

## Authentication and permissions
<mechanism (sessions, JWT, a provider), where it is enforced (middleware, guards, policies, RLS), roles if any — with paths. Say plainly where a route or function is reachable without a check, as a fact, not a verdict>

## Shared shell
<root layout, navigation component(s), the nav entries in order, header/sidebar, auth-state differences — with paths>

## Design system
<tokens / theme file, component directory and library (e.g. shadcn registry), styling approach, any documented system — with paths. Enough for `/init` to write `docs/design-system.md` from it>

## Could not determine
```

## Focus `quality` → `docs/codebase/conventions.md`

```markdown
# Conventions

_Mapped by `/map` on <date> at commit `<short sha>`. Describes what the code does consistently — not what it should do._

## Style and naming
<formatter / linter config present?, naming patterns actually used, file organisation — with paths>

## State, data fetching, errors
<how the app holds state, how it talks to the backend, how errors surface to the user — the dominant pattern and the exceptions, with paths>

## Tests
- **Runner:** <from the manifest> · **Count:** <files> · **Where:** <path>
- **What they cover:** <modules / routes with tests> · **What they do not:** <the critical paths without one — named, with paths>

## What a finished change looks like here
<what the repo itself enforces or expects before a change is done: lint, type-check, tests, a PR template, a CI gate — with paths. If nothing: say so>

## Could not determine
```

## Focus `concerns` → `docs/codebase/concerns.md`

This document is the input for `/audit`, `/security-check` and `/refactor`, and the orchestrator carries every row into `docs/tech-debt.md`, where it keeps a status across refreshes. It is read by someone who will act on it, so every row needs a path and a size. Severity is *high* when users or data can be harmed, *medium* when the next change is likely to break something, *low* otherwise.

```markdown
# Concerns

_Mapped by `/map` on <date> at commit `<short sha>`. Facts with locations; the decision what to do about them is the user's._

## Oversized files and mixed responsibilities
<the signal is **mixing, not length**: any file that holds more than one of data access, business rules, UI is a candidate at any size — every change to it reads everything. Length alone becomes a finding only from **~800 lines**, where a file stops fitting through a review or a context window in one piece. A 500-line file with one clean responsibility is fine; do not list it. Severity: mixed **and** long → high; mixed → medium; merely long → low. List the responsibilities you see in each>

| File | Lines | Responsibilities found | Severity |
|---|---|---|---|

## Duplicated logic
<the same rule or query implemented in more than one place — both paths>

## Untested critical paths
<auth, payments, data deletion, anything irreversible — without a test. Path of the code, and "no test found under <test dir>">

## Security smells
<trust of client input without server check, missing authorisation on a route or function, secrets committed in code (path and variable **name** only — never the value), permissive CORS, SQL built from strings, files served from user paths. Facts, with paths>

| Location | What | Severity |
|---|---|---|

## Performance and fragility
<unbounded queries, N+1 patterns, no pagination, very large client bundles, TODO/FIXME clusters — with paths>

## Could not determine
```
