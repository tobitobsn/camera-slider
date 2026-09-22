---
name: architecture
description: Design PM-friendly technical architecture for features. No code, only high-level design decisions.
argument-hint: "feature-spec-path"
user-invocable: true
---

# Solution Architect

## Goal
Translate a feature spec into a high-level architecture plan a non-technical stakeholder (PM, founder) can read and approve — component structure, data model, and tech decisions justified in plain language. Focus on WHAT gets built and WHY, never HOW-level code, so the user can actually follow and sign off on the design.

## CRITICAL Rule
NEVER write code or show implementation details:
- No SQL queries
- No TypeScript/JavaScript code
- No API implementation snippets
- Focus: WHAT gets built and WHY, not HOW in detail

## Precision Bar (no code ≠ vague)
`design.md` has two readers: the PM, who must understand and approve it, and `/build`, which implements directly against it. Serve both — code-free, but **implementation-grade precise**. Plain language that an engineer could build without guessing:
- Name every field, its type, and its constraints (e.g. "Title — text, max 200 chars, required").
- State the states/enums explicitly (e.g. "Status is one of: To Do, Done").
- Make access and ownership explicit (who can see/do what) — this is the RLS intent, and if it's missing `/build` will invent it.
- Define error and empty behaviors where they affect the design.

"Plain language" means no SQL or TypeScript — it does **not** mean "somewhere", "etc.", or hand-waving. If the user doesn't need a detail to approve the design but `/build` needs it to implement, write it anyway: vagueness here becomes divergence at build time.

## Does this project match what this skill assumes?

Read `platform`, then `mode` and `stack` from `.ai-eng-kit` before anything else.

- **`platform` is not `web`** → read this one first, because it decides which of the design decisions below are
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
- **The feature spans a layer** (`.ai-eng-kit` → `layers`: a pipeline, a CLI, a worker beside the app) → say
  which component lives in which layer, read that layer's `packs` for its procedures and conventions, and
  put the **boundary** into the design as a named thing — the table the pipeline writes and the app reads,
  the API one calls on the other — because that boundary is what `/qa` verifies from both sides.
- **`stack.backend` / `stack.framework` with no matching `docs/stacks/*.md`** → the design still names
  every decision (access rules, throttle limits, where validation happens) — it only stops naming the
  kit's mechanism for it. Use what the project already has; where you cannot tell, ask as described
  in the shared rule: look first, offer the find, record a hand-off if neither side knows.

## Before Starting
1. Read `features/INDEX.md` to understand project context
2. Read `docs/data-model.md` — the app-wide data model (entities + relationships) that `/init` established. This feature's data design must fit that map, and you keep the map current (see "Align with the App-Wide Data Model" below).
3. Read `docs/app-shell.md` — the app-wide frame (navigation, layout regions, page pattern). This feature's UI sits **inside** that frame and reuses its components; you keep that map current too (see "Align with the App Shell" below).
4. Verify the feature has a full spec — check that:
   - The feature's status in INDEX.md is **"Planned"** (not "Roadmap") — or **"Spec'd"**, a feature `/reverse-spec` confirmed: then this design describes what already exists (read `docs/codebase/` for its parts) and the status afterwards **stays Spec'd** — the feature is live, not ready to build
   - A spec file `features/PROJ-X-*/spec.md` actually exists on disk (inside the feature folder)
5. Check what the project already has. In a project the kit scaffolded: `git ls-files src/components/` and `git ls-files src/app/api/`. In any other project **those paths do not exist and will return nothing without telling you so** — read `.ai-eng-kit` → `stack` / `commands` and look where *this* project actually keeps its code (`app/`, `lib/`, `packages/`, `internal/`, a `frontend/` workspace …). An empty result you did not verify is not evidence that nothing is there.
6. Read the feature spec the user references

### Unmapped is not empty (`mode: existing`)
Read `mode` from `.ai-eng-kit` first. **If `docs/codebase/` exists, read `architecture.md` (routes, tables, server functions, auth, shell) and `conventions.md` before anything else** — that is the map of what is there, with a path behind every row, and designing against it is the whole point of this section. A `docs/data-model.md` that opens with a `_Source: …_` line was filled from one schema source by `/init` and can be trusted to that source.

**The map is a snapshot — measure its age before you trust it (hard gate).** The line under the title of `architecture.md` names the commit it was mapped at (`_Mapped by /map on <date> at commit <sha>._`). Nothing in the kit maintains the map between two `/map` runs, so a stale one does not fail — it produces a design against routes and tables that no longer look like that, silently. So:
1. List what was **added** since the Stand, in the places where routes, schema and auth live: `git log --diff-filter=A --name-only --format= <sha>..HEAD`, filtered to the paths `architecture.md` itself names for routes, schema source and auth — or the concrete ones the packs name (`docs/stacks/framework-<value>.md` → "Where the app's routes and layout live", `docs/stacks/backend-<value>.md` → "Where migrations live"). An old map with a date but no commit is measured by date: `git log --since=<date> --diff-filter=A …`.
2. For every new file, check whether a feature already accounts for it: grep `features/*/design.md` (and `tasks.md`) for its path. Files the kit's own workflow added are in there — `/build` adds routes and migrations with every feature, and that is not staleness, it is the map lagging behind documents that exist.
3. **Every new file is accounted for** → go on. Write one line at the top of this feature's `design.md` Technical Decisions: "Codebase map at `<sha>`, N routes/migrations newer than it, all described in PROJ-…" — so the next reader knows what the map did not know.
4. **A new route, migration or auth file that no feature describes** → **stop.** Say which files, and: "`docs/codebase/` predates these and no feature describes them. Run `/map --refresh` first — designing against a map that does not know them is how a duplicate table or a second auth path gets built." Do not read those files yourself and carry on as if the map covered them: the map is what `/write-spec` and `/reverse-spec` also read, and a design that silently knows more than the map leaves the documents disagreeing about what exists.
5. **No `docs/codebase/` at all** in `mode: existing` → the paragraph below applies unchanged; say once that `/map` would give this design a map to check against. Otherwise: when `mode` is `existing`, `docs/data-model.md` and `docs/app-shell.md` are very likely still the empty templates — **`/init` leaves them empty on purpose** rather than filling them from a skim of the repo. That means *not mapped yet*, **never** *nothing exists*, and the difference decides whether this design is usable:

- **Do not design as if the field were clear.** A project with a working login has a users table whether or not any document names it. Designing "the users table" into it produces a duplicate, and the first person to notice is whoever debugs the data.
- **Look before you design.** Read the schema where this project keeps it — migrations, models, an ORM directory. The running database may be read too where `probe` says how to reach it, but treat it as **corroboration, not the source**: it is one instance at one moment, seed rows and abandoned columns included, and nothing in it is reproducible from the repository. Where the files and the database disagree, that is a finding to raise, not a tie to break silently. Base the design on what you actually read, and say which it was.
- **Where you cannot confirm it, ask.** One question to the user beats an assumption that silently ships: "Does something like *X* already exist in your data model, or is this new?"
- **Never write a one-feature map into `docs/data-model.md` and call it the app-wide model.** Record only the entities you verified, and say in the document that it covers what has been mapped so far, not the whole system. A partial map presented as complete is worse than an empty one, because the next feature designs against it and trusts it.

The same holds for `docs/app-shell.md`: an existing product has navigation and a page pattern already, in code. Reuse what is there; do not invent a second frame beside it.

**If the feature status is "Roadmap" or no `spec.md` exists:**
> "This feature doesn't have a spec yet. Run `/write-spec PROJ-X` first — the architecture design needs user stories and acceptance criteria to work from."
→ Stop here.

## Use Available Domain Skills (for design decisions)
When a feature integrates a domain that has a vetted skill installed, consult that skill **here, at design time** — not just at build time. Best practices for these services are mostly **architectural** (integration pattern, auth/RLS model, data model, webhook/idempotency strategy), not mere implementation details. If the design ignores them, `/build` is forced to either deviate from your approved design or implement a worse one.

- **Start with this project's stack packs.** Read `stack` from `.ai-eng-kit` and load the matching `docs/stacks/*.md` — they carry what this project's own database, framework and host actually give you, which is what a design has to build on rather than around.
- Then any **vetted domain skill** installed for the services this feature touches (in a kit-scaffolded project that means `supabase` for Auth/SSR/RLS, `supabase-postgres-best-practices` for schema and query design, `stripe-best-practices` for payments). Load it before you settle the approach for that part — memorized API knowledge goes stale.
- Use it at **design altitude**: let it shape the *decision* (e.g. Stripe Checkout Session vs. Payment Intent, webhook-driven fulfillment, owner-only RLS), then state that decision in plain language. Do NOT pull code or SQL into `design.md` — the Precision Bar and CRITICAL Rule still hold.
- Record the chosen approach in the **Technical Decisions** log with the best practice as its rationale, so `/build` inherits a best-practice-aligned design instead of discovering the constraint late.
- If a live-docs MCP (e.g. **Context7**) is connected, consult it for a library's *current* API surface before relying on memory — especially when no vetted skill covers that library. Not connected → proceed; it's optional, never a blocker.
- No relevant skill installed → design from the spec as normal; don't block.

## Align with the App-Wide Data Model
`docs/data-model.md` is the shared map of entities and relationships, created by `/init`. This feature's data design is not invented in isolation — it **fits that map**, and you are the one who keeps the map accurate.

- **Design against it:** the tables/data this feature needs should reuse the existing entities and respect their relationships. If you find yourself inventing an entity that overlaps one already on the map, reconcile them — don't create a parallel, mismatched version.
- **Update it (living document):** if this feature introduces a new entity, adds a relationship, or changes ownership, **edit `docs/data-model.md` to match — at product altitude** (entity + relationship + ownership only, still no column types/indexes). Do this so the *next* feature designs against an accurate picture.
- **Detailed schema still goes in `design.md`:** column types, indexes, and exact foreign keys are this feature's technical *how* — they live in the Data Model section of `design.md`, not in the app-wide map.
- If the spec reveals the app-wide model was wrong or incomplete in a way that affects other features, flag it to the user rather than silently diverging.

## Design Brute-Force Protection into Auth Features
If the feature checks a credential — login, signup, password reset, magic link, OTP, or a custom API route that verifies anything — the design must say **how** attempts are limited, with numbers. The spec states the behavior; you pick the mechanism and write it into `design.md` like any other decision. Never leave this to `/build`: unstated, it gets skipped, and a login that silently accepts unlimited guesses looks exactly like a working one.

**Find out what the platform already gives you, and say so instead of rebuilding it.** Most auth providers throttle their own endpoints; `docs/stacks/backend-<value>.md` records what this project's does, down to which limits are customizable and where. No pack for this backend → ask the user what their auth layer already enforces. Designing a throttle on top of one that exists is waste; assuming one exists when it doesn't is the expensive direction.

**What a platform limit does not cover** — and therefore what your design has to decide, in every stack:
- **A patient or distributed attack on one account.** Per-IP limits don't stop an attacker rotating IPs, and they don't stop credential stuffing (one common password against many accounts).
- **Anything you wrote yourself.** A custom login route, a server action checking an invite code or a password-protected share link gets no platform limit at all — it needs an app-level throttle keyed per IP **and** per account (`docs/production/rate-limiting.md` for when and how much, the framework pack for the wiring).

**Decide and record these, with values:**
- **CAPTCHA** on sign-in / sign-up / password-reset forms — the strongest available lever against automated guessing, and worth recommending for any public signup. Whether the auth provider offers one built in, or it has to be added, is in the backend pack.
- **The throttle values** the spec's ACs promised (e.g. 5 failed attempts per account per 15 minutes → locked for 15 minutes), and **where** they are enforced.
- **Password policy** — minimum length (≥ 8, longer is better), required character classes, and **leaked-password protection** (a check against known-breached passwords). Whether the provider has it built in, and at what price, is in the backend pack — name the cost so the user decides rather than discovering it later.
- **No account enumeration** — the same message for "unknown email" and "wrong password", and the same response time where it matters.
- **MFA** if the product holds anything worth stealing — name it as an option with its cost, don't silently skip it.

**Decide — never ask the user how to configure it — and split *built* from *configured*.** You choose the values and the mechanism; the user approves the design, not a questionnaire. Then sort every measure into one of two bins:

- **Built** — app code: the throttle on a custom route, the identical error messages, the CAPTCHA widget in the form. Normal tasks for `/build`.
- **Configured by the user** — settings that live in a provider's dashboard and that no code can make (Supabase's *Authentication → Rate Limits* and *Attack Protection*, a host's WAF rule, a mail provider's sending limit). These go into `design.md` → **Settings the user makes**: the exact path, the value you propose, why, and the AC they serve. `/tasks` turns each into a `[user]` task, `/build` hands it over instead of building it, `/deploy` refuses to ship while one is unticked. **Mark each row `now` or `go-live`.** `now`: the test environment can already hold it (a rate limit, a CAPTCHA), so it is made before `/qa`. `go-live`: it needs the production URL or the host itself — a payment webhook endpoint and its signing secret, an OAuth redirect URI, an allowed origin, a DNS record — so nobody can make it before `/deploy` Step 2. A go-live row never blocks `/qa` or Approved: the feature is verified against its test-environment twin (a CLI forwarding test events to the local endpoint, a test secret in the example env file), and name that twin in the design so `/build` and `/qa` know what to use. Getting this wrong is a feature that can never be Approved, because the only thing keeping it out is a step that needs the deploy it is blocking. The backend pack (`docs/stacks/backend-<value>.md`) lists which settings exist and, where the provider can push them from a config file, how to make the setting a built task after all.

Log the choice in **Technical Decisions** with its trade-off (e.g. "CAPTCHA on signup — small friction for real users, removes the entire automated-signup class"). If the user declines a measure, that is their call: record it as a decision with the risk stated, don't quietly drop it.

## Align with the App Shell
`docs/app-shell.md` is the shared frame — navigation, layout regions, and the page pattern every feature repeats — created by `/init`. This feature's UI is designed **inside** that frame, and you keep the frame accurate. Do this for the same reason you do it for the data model: a shell that each feature quietly extends in its own `design.md` ends up owned by nobody, and by the time someone wants to change it there is no spec to change.

- **Design against it:** place this feature in an existing top-level area, follow the recorded page pattern (header, loading, empty, error), and **reuse the shell components listed there** instead of building a second sidebar, header, or nav.
- **Update it (living document):** if this feature adds a nav entry, introduces a layout region, changes what an auth state sees, or establishes a new shared page pattern, **edit `docs/app-shell.md` to match — at product altitude** (areas, regions, pattern; still no colors or component code). Do it before you finish the design, so the *next* feature sees an accurate frame.
- **The shell's behavior belongs to its owning feature.** Read the owner at the top of `docs/app-shell.md`. If this design would *change* how the shell behaves — not just add an entry to it — that is a change to another feature's contract: say so and route it to **`/refine <owner>`**, rather than writing shell behavior into this feature's `design.md`. Silently growing the shell here is exactly the drift this map exists to prevent.
- **If `docs/app-shell.md` doesn't exist** (a project started before this map, or one that skipped it) — and the platform *has* a shell; an `mcp` server or a `cli` has none, so skip this and say so: create it now from what the app already is — read the app's root layout (the framework pack names where it lives; in `mode: existing` follow the project's own structure), the existing nav/sidebar components, and the other features' `design.md` files, and write down the shell **as it stands**. Then tell the user plainly that the shell has no owning feature yet and that a single small feature (e.g. "App Shell & Navigation") would give it acceptance criteria, so future changes to it are testable. Recording reality is enough here — do not redesign the shell inside a feature's design.

## Workflow

### 1. Read Feature Spec
- Read `features/PROJ-X-*/spec.md`
- Understand user stories + acceptance criteria (note the AC-IDs / EC-IDs — the design must cover every AC)
- Determine: Do we need backend? Or frontend-only?

### 2. Ask Clarifying Questions (if needed)
Use your agent's structured question tool (`AskUserQuestion` in Claude Code; otherwise one plain-text question at a time) for:
- Do we need login/user accounts?
- Should data sync across devices? (localStorage vs database)
- Are there multiple user roles?
- Any third-party integrations?

### 3. Create High-Level Design

#### A) Component Structure (Visual Tree)
Show which UI parts are needed:
```
Main Page
+-- Input Area (add item)
+-- Board
|   +-- "To Do" Column
|   |   +-- Task Cards (draggable)
|   +-- "Done" Column
|       +-- Task Cards (draggable)
+-- Empty State Message
```

#### B) Data Model (plain language)
Describe what information is stored — every field with its type and constraints, and who owns each record (see the Precision Bar):
```
Each task has:
- Unique ID
- Title (text, max 200 characters, required)
- Status (one of: To Do, Done)
- Created timestamp
- Belongs to: one user (the creator)

Access: users can only see and change their own tasks.
Stored in: Browser localStorage (no server needed)
Kept until: the user deletes the task (no automatic expiry)
```

#### C) Behaviors & Access (backend features only)
When the feature has a backend, spell out the operations and their access rules in plain language — this is the contract `/build` builds the API against. Skip this section for frontend-only features.
```
Operations:
- Create a task — any logged-in user; Title required, max 200 chars
- List tasks — returns only the current user's tasks
- Update a task's status — only the task's owner
- Delete a task — only the task's owner

Rejected when: not logged in, or acting on someone else's task.
```

**Name the guarantee behind every timing EC.** Where the spec carries an edge case about two users acting at once, a status move that must never happen, or the same external message arriving twice, the design has to say *what makes the promised behavior hold* — a unique constraint, a transaction covering both steps, a conditional update, an idempotency key on the handler. State it in plain language ("only one booking can exist per slot; the database refuses the second one") and log it as a Technical Decision. Leave it out and `/build` implements the obvious version, which works perfectly until two people click in the same second — and then loses data in a way no single-user test ever caught.

#### D) Dependencies (packages to install)
List only package names with brief purpose.

#### E) Technical Decisions (justified for PM)
Explain WHY specific tools/approaches are chosen, in plain language — see Step 5; there is exactly **one** decisions table in `design.md`.

### 4. Write the Design File
Write the design to its **own file** `features/PROJ-X-*/design.md` (a sibling of `spec.md` in the feature folder — do NOT append a "Tech Design" section to the spec; the spec stays the contract). Use the `template.md` in this skill folder as the structure.

### 5. Log Technical Decisions
For every meaningful technical choice made during this session, add an entry to the **Technical Decisions** table in `design.md`:
- Storage approach (localStorage vs. database, and why)
- Package choices (why this library over alternatives)
- Data model decisions (key names, structure, constraints)
- API design choices (REST vs. server action, auth strategy)
- Third-party integration approach (e.g. Stripe/Supabase pattern), with the consulted domain skill's best practice as the rationale
- Any decision that a future developer might otherwise question

The Technical Decisions table now carries an **alternative considered** and a **trade-off** for each choice:

**Format:**
```
| Decision | Rationale | Alternative considered | Trade-off | Date |
| localStorage over Supabase | No user accounts needed; data is device-local | Supabase Postgres | No cross-device sync; data lost if browser storage cleared | 2026-05-19 |
```

(Product Decisions stay in `spec.md`; only Technical Decisions live here in `design.md`.)

If any questions came up during the design that couldn't be resolved, add them to the **Open Questions** section of `spec.md` as `- [ ]` items.

### 6. User Review
- Present the design for review
- Ask: "Does this design make sense? Any questions?"
- Wait for approval before suggesting handoff

## Checklist Before Completion
- [ ] Checked existing architecture via git
- [ ] Where `docs/codebase/` exists: its age measured against the Stand commit; every route, migration and auth file added since is described by a feature, or the design stopped at `/map --refresh` — never designed against a map that does not know them
- [ ] Feature spec read and understood
- [ ] Component structure documented (visual tree, PM-readable)
- [ ] Feature's data design fits `docs/data-model.md`; the map was updated (at product altitude) if this feature added/changed an entity, relationship, or ownership
- [ ] If the feature checks a credential: brute-force protection designed with concrete values (throttle limits + where enforced, CAPTCHA decision, password policy, no account enumeration) — and every measure the user has to set in a dashboard recorded under **Settings the user makes** with path, value and AC, never asked as "how do you want to configure this?" — whatever the auth platform already enforces named as what it does and does not cover; any auth route written in-house given its own throttle
- [ ] Feature's UI fits `docs/app-shell.md` (existing area, recorded page pattern, shell components reused — no second nav/header); the map was updated if this feature added a nav entry, region, auth-state difference, or new shared pattern
- [ ] Anything that would *change* the shell's behavior routed to `/refine <shell owner>` instead of being written into this feature's `design.md`
- [ ] Data model described to the Precision Bar (every field with type + constraints, ownership/access stated) — plain language, no code
- [ ] Every timing EC in the spec (concurrency, status transitions, repeated delivery) has a named guarantee in the Technical Decisions log
- [ ] Every entity holding personal data has a stated **retention rule** ("kept until …"), not an implicit forever; fields nobody needs were challenged and dropped (data minimisation is the cheapest privacy measure there is)
- [ ] Backend need clarified (localStorage vs database)
- [ ] Behaviors & Access documented for backend features (operations + who-can-do-what); skipped for frontend-only
- [ ] Tech decisions justified (WHY, not HOW)
- [ ] The project's stack packs were read before the approach was settled; for third-party integrations, the matching domain skill was consulted and its best practices shaped the decisions
- [ ] Dependencies listed
- [ ] Design written to `features/PROJ-X-*/design.md` (own file, not appended to spec)
- [ ] Technical Decisions logged in `design.md` (with alternative considered + trade-off)
- [ ] Any new Open Questions added to `spec.md`
- [ ] User has reviewed and approved
- [ ] `features/INDEX.md` status updated to "Architected" (a Spec'd feature keeps "Spec'd")

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
After approval, tell the user:
> "Design is ready! Next step: Run `/tasks` to break this design into an ordered, parallelizable task list."

## Git Commit
```
docs(PROJ-X): Add technical design for [feature name]
```
