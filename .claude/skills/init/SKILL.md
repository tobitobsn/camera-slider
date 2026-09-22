---
name: init
description: Initialize a project for the kit. In a new project, interviews the user and creates the PRD and a prioritized feature map. In a project the kit was added to, skips the interview, reads the codebase map from /map, records how the project runs and confirms the features it already has. Run once at the start. If a PRD is empty (raw template structure) use this skill to plan out the project together with the user.
argument-hint: "description of what you want to build"
user-invocable: true
---

# Project Initializer

## Goal
Help the user turn a raw idea into a clear product vision and a prioritized feature map — before any code is written. Get there through a relentless, one-question-at-a-time interview (see The Discovery Interview below), because a vague PRD now turns into the wrong features later.

## The Discovery Interview
Interview the user relentlessly until you reach a **complete shared understanding** of the project. Follow these rules strictly:

- **One question at a time** — never list multiple questions
- **Always provide a recommended answer** — the user confirms or corrects it
- **Follow the conversation** — open new branches based on answers, don't follow a fixed script
- **Explore before asking** — if a question can be answered by reading existing files, read them first
- **No fixed question limit** — stop when you truly understand the project, not after N questions

### End every turn with a question — then STOP (critical)
This is the single most important rule of this skill. The user can only see what you write, and they only know it's their turn when you **end on a clear question**.

- **Every turn in the interview and at every review checkpoint MUST end with exactly one question as the very last line** — never on a statement, a summary, or a status note like "I've captured the key points."
- **The question is the last thing in the message.** Put any context first, the question last, so it can't get buried.
- After asking, **stop and wait.** Do not keep working, do not assume the answer, do not move to the next phase until the user has replied.
- If you ever finish a chunk of work and are unsure what to do next, that is itself the signal to **ask the user a question** — never end your turn silently.

### If the user pasted a full briefing
When the argument is already a rich briefing (not a one-line idea), do **not** mechanically interview point by point as if you knew nothing. Instead:
1. Read the briefing and silently note what it already answers.
2. Identify only the **genuine gaps and contradictions** that still block a solid PRD (especially the two Mandatory decisions below).
3. Work through those gaps **one question at a time**, each turn ending on a question (per the rule above).
4. When no blocking gaps remain, go straight to the PRD draft and its review checkpoint — don't invent filler questions.

## Before Starting
0. Read `.ai-eng-kit` → `mode`. If it is `existing`, the kit was **added to a project that already runs** — skip the Discovery Interview entirely and follow "Existing Project" below instead. A missing key means `new`.
1. Read `docs/PRD.md` — check if it's still the empty template
2. Read `features/INDEX.md` — check if features already exist
3. Read the **working language** from the canonical memory file → Key Conventions (`.ai-eng-kit` → `memory` names it: <!-- emit:verbatim -->`CLAUDE.md` in a Claude-Code-only project, `AGENTS.md` once more than one agent is in play<!-- /emit:verbatim --> — never a pointer file; the user chose it at setup). **Run the entire interview in it** — every question, recommendation, and review checkpoint — and write every document you create in it. This skill is written in English because it instructs *you*; it is not the language you speak. See `.claude/rules/general.md` → Working Language. If the line is missing (older project), ask the user once, then add it to that file under Key Conventions before you write anything.

**The scaffolded documents ship with English headings.** You are their first author, so when the project language is not English, translate the headings and the guiding prose as you fill them in — `docs/PRD.md`, `docs/data-model.md`, and `docs/app-shell.md` must not end up as English skeletons with content in another language. Leave the HTML comments and the file names alone.

**If the project is already initialized** (PRD is filled out and not the empty template):
→ In `mode: new`: tell the user "This project is already initialized. Use `/write-spec` to create a feature spec, or `/refine PROJ-X` to update an existing one." and stop here.
→ In `mode: existing`: this is a **re-entry, not a stop.** `/verify-setup` (5b), `/qa` and the security rules send the user here whenever `.ai-eng-kit` still holds a `null` that the first run could not fill — the person who knew the start command was not in the room. Read `.ai-eng-kit` and list what is still open: `platform`, `commands.dev`, `probe.kind`, any `stack.*` the first run left `null`, every `null` inside a `layers[]` entry, question 5 once when `layers` is `[]` and the map's *Language and runtime* or a second manifest in its own folder names a second runtime (a project updated into the layers feature was never asked), question 6 when the entries in `features/` carry a different prefix than `featurePrefix` records, and `law` where the PRD says the product holds personal data. Ask **only** those, one per turn, proposing the answer the map or the project's own files give (the rules under "Existing Project" → *The four questions* apply unchanged), record what the user confirms, mirror it into the memory file → How This Project Runs. Then, with a map: any feature in `docs/codebase/features.md` that has no row in `features/INDEX.md` (a `/map --refresh` found it) is proposed as a `Mapped` row exactly the way the first run did (→ *Confirm the feature map*) — new rows only, existing rows untouched. Then stop. Do not re-ask what already has an answer, do not touch the PRD or the feature map. If nothing is open, say so — "Everything `/init` records is on file" — and hand off as above.

## Existing Project (`mode: existing`)

A greenfield interview is the wrong instrument here. The product already exists, the stack decisions were made long ago, and the code is the source of truth — inventing a vision for something that already ships is how a PRD ends up describing a product nobody built.

Your job is narrower and more useful: **record how this project runs, and confirm what it already does**, so every later skill stops guessing. One question per turn, each ending the turn (the rule above applies unchanged). The user never slices, prioritises or judges granularity — the map proposes, they confirm.

### Read the map first
`/map` writes `docs/codebase/` — `stack.md`, `architecture.md`, `conventions.md`, `concerns.md` and `features.md`, every finding with a file path, *stated* kept apart from *inferred*. **If it exists, every proposal below comes from it.** Do not re-read the codebase for what the map already says; if the map is missing something, the map is what gets fixed (`/map` again).

**If `docs/codebase/` is missing**, say so before the first question and recommend running `/map` first — it is what turns the questions below into confirmations. If the user prefers to go on without it, continue with the fallback in the next paragraph; record that the feature map was *not* proposed (the INDEX then holds only what comes next), and say at the end that `/map` can still be run later.

**Propose, don't interrogate.** `.ai-eng-kit` already holds what the project's own files stated at install — `stack` (incl. `stack.packageManager`), `commands`, `platform`. Read it first and put those values *into* your questions as the recommended answer. A `null` means it could not be read from a file, not that it is absent. With the map, `stack.md` → *How it runs* and *How it goes live* are the proposals; without it, read the project's own files — the README, a `Makefile`, a `Procfile`, `composer.json` / `pyproject.toml` / `Gemfile` scripts, a `bin/` folder, a `Dockerfile`, CI config. "Your README says `php artisan serve` starts it on port 8000 — shall I record that?" is a question a product manager can answer.

**Propose from what a file states; record only what the user confirms.** Never *write* a field from a reading alone: the user confirms, then you record. And never upgrade a look into a fact — the map marks those `(inferred)`, and "this looks like it deploys to Vercel" is a guess `/deploy` would act on. Ask.

**When the user cannot answer, say so without pressure** — most people running this never wrote the project. Record `null` for that field and give them one short message to forward to whoever did ("we need the command that starts the app locally and the address it answers on; it goes into `.ai-eng-kit` → `commands.dev` and `probe.baseUrl`"). A `null` with a named owner is a real answer and keeps every later skill honest; a guess is not. When the owner has answered, `/init` is simply run again: it sees the PRD is filled, asks only the fields still `null`, and records them (see *If the project is already initialized* above).

### The four questions
1. **What is this, and who is it for?** One or two sentences. Read the README, the memory file and `features.md` first and offer what you found as the answer to confirm.
2. **How is it started and how do you check it works?** The one that matters most. You need the start command and, concretely, how a claim gets verified against a running instance — an HTTP base URL, a stdio/JSON-RPC client, a simulator, or honestly nothing automatable. Record this as `probe`: `kind` is one of `http`, `stdio-jsonrpc`, `simulator`, `none`, and `baseUrl` where a URL applies.
3. **What is the stack?** Confirm or correct what was detected: framework, backend/database, test runner, package manager. Fill only what the user confirms.
4. **How does it go live?** Hosting and the deploy path, including anything human-gated (a review, an approval, a release window). If there is no deploy path yet, record that — it is a real answer.
5. **Is there a second runtime in this repo?** A folder with its own manifest and entry point — a `python/` pipeline that fills the database the web app reads, a CLI beside the API, a worker. Propose from what `add` printed ("a second runtime in python/ …") and from the map's *Language and runtime* and *Layers and entry points*; the user confirms or corrects. For each one: a short `name`, its `root`, what it is (`pipeline`, `service`, `cli`, `worker`, `library`), how it is started, tested and linted, how a claim against it is checked (`probe`, same values as question 2 — `none` is honest for a batch job), and which packs under `docs/stacks/` describe it — the user's own file, if they wrote one. `null` where nobody knows. "No second runtime" is a real answer: `layers: []`.
6. **Which prefix do the feature IDs carry?** Only when `features/` already has entries: propose `featurePrefix` from `.ai-eng-kit` (`add` read it from the folder — `APP` for `features/APP-1-…`), the user confirms or corrects. With an empty `features/`, do not ask: the recorded value (default `PROJ`) stands. Every `PROJ-` in the kit's skills stands for this prefix; the IDs themselves are never renamed by the kit.

### Record the answers
- Write them into `.ai-eng-kit`: `platform` (`web`, `mobile`, `desktop`, `mcp`, `cli`, `extension`, `other` — **`desktop` is a native app the user installs**, a Mac or Windows app, not a web app in a wrapper), the confirmed `stack`, `commands`, and `probe`. Keep the JSON valid and change nothing else in the file — `law` (next bullet), `stack.deploy` (the bullet after), `layers` (question 5) and `featurePrefix` (question 6) are the only other keys this skill writes.
- **If the project holds personal data, ask which law applies** — the multi-select question from "Data Protection Law and Stance" below — and record it in `.ai-eng-kit` → `law` and as `Data protection law:` in PRD Constraints, so `/dsgvo` does not have to ask.
- **Question 4 is recorded too, not just asked:** the host or release path as one word into `stack.deploy` (`vercel`, `hostinger`, `heroku`, `eas`, `fastlane`, `docker`, … — `null` if there is none yet), and a `Hosting:` line plus a `Data region:` line under `docs/PRD.md` → Constraints. `/deploy` and `/dsgvo` read exactly those, so the user is not asked the same thing twice.
- **Question 5 is recorded as `layers`:** one entry per confirmed runtime — `name`, `root`, `kind`, `language`, `framework`, `commands` (`dev`/`test`/`lint`), `probe` (`kind`/`baseUrl`), `packs` (paths under `docs/stacks/`, **existing files only** — a pack the user names that is not there is a hand-off for whoever writes it, never a file you create). The primary stack stays in `stack`; `layers` lists only the additional runtimes. Every skill that touches files under a layer's `root` reads that layer's `packs` and runs its `commands` (`.claude/rules/general.md` → Layers).
- Mirror the same values into the memory file's **How This Project Runs** section, so an agent that never opens `.ai-eng-kit` still reads them. That section is generated from the answers — do not invent extra prose around it.

### Confirm the feature map (only with `docs/codebase/features.md`)
The map proposes the features the product **already has**, sliced by rules the user never sees. Put the list to them as a whole, names and one sentence each — never the slicing:

> "From the code, these are the 9 things your app does: … Is that right — is anything missing, or named wrong?"

- A feature they know that is not on the list: search `architecture.md` for it by route and by table — it may be there under another name; merge or rename. If it is genuinely not in the code, it is **planned, not built**: it goes to INDEX as `Roadmap` like any new feature, never as `Mapped`.
- A feature they do not recognise: keep it, say what evidence it rests on (the routes), and mark it *to check* in the Description. Code that nobody remembers is exactly the kind that needs a spec.
- The **Unassigned** list: read it out once. It is the honest remainder, and `/audit` will keep asking about it until it is assigned or deliberately left.
- **The order** — with the map's recommendation as the default; `Enter` is an answer. Say what it costs: "Feature 1 has about 15 behaviour rules; confirming them one by one takes around 20 minutes. You do not have to do them all at once."

Then **one narrative question**, because code cannot show what the app is *meant* to do:
> "Walk me through a typical day with the app — what do you do first, then what?"

What they tell that is not on the map is a gap → `Roadmap`, via `/write-spec` later. What is on the map and never comes up is an edge feature → last in the order. Do not interrogate the story; one pass, then move on.

**Record it:** every confirmed feature becomes a row in `features/INDEX.md` with status **`Mapped`** — Feature cell is the name only, Description its own cell (with *to check* where it applies), Spec cell empty (no folder yet; `/reverse-spec` creates it). The confirmed order goes into the **Build order** line; `Next Available ID` moves past them. Names and descriptions in the working language.

### Then write a short PRD — and fill what the map can fill
`docs/PRD.md`, describing the product **as it is**, not as you would design it: what it does, who for, the constraints that already hold (stack, hosting, compliance, anything the user named as fixed). Keep it short. It exists so `/write-spec` and `/architecture` have an anchor — it is not a rewrite of the product's history. Add a section **What already exists** listing the confirmed features with their evidence in one line each, marked *read from the code, not verified* — `/reverse-spec` is what verifies.

Skip everything a greenfield project decides and this one already has: the Backend Decision, the Design System question, the app-shell sketch as a *design*. They are settled in the code. What the map can state, write down **from the map, with the source named** — and where it cannot, leave the template empty rather than filling it from a skim (an inaccurate map is worse than a missing one, because `/architecture` treats it as true):

- **`docs/data-model.md`** — the question is **not how many schema sources there are, it is whether one of them states the whole model.** Counting files gets this wrong in both directions: an ORM schema beside three hand-written index migrations is "several" and yet perfectly mappable, while five sources that each hold a piece are not. Three outcomes:
  1. **One source states the whole model** → fill it. Entities, relationships and ownership from `architecture.md` → *Data*, at product altitude (no column types, no indexes), with `_Source: <path>, read by /init on <date>_` as the first line.
  2. **One *leading* source plus subordinate ones** (an ORM schema plus migrations that only add indexes; a schema file plus a frozen legacy chain) → fill from the leading one, and put **the boundary in the header, not in a footnote** — which part of the system this map covers and which part it does not. The next skill reads the table, not the small print.
  3. **No source states the whole model** — several services each owning a piece, or a schema generated at runtime from metadata rather than written down → **leave it empty and say why**, naming each source with its path and where the entities can actually be read (`architecture.md` lists them). Then say that the map grows per feature from here, which is what `/architecture` does. An inaccurate map is worse than a missing one, because `/architecture` treats it as true.
- **A reading of a *running* database is corroboration, never the source.** It shows one instance at one moment — with seed data, experiments and orphaned columns — and none of it is reproducible from the repository, which is the whole reason this kit detects from files. Use it to confirm what the files said (that is genuinely valuable: a count that matches is the best evidence a map is accurate). It becomes the source only when **nothing in the repo states the schema at all** — the "hosted only" case — and then the `_Source:_` line says so: which database, read when, and that it is an instance rather than a definition.
- **`docs/design-system.md`** — from `architecture.md` → *Design system*: tokens, component directory and library, styling approach. This is read better than asked; write it with its sources and tell the user it is theirs to correct.
- **`docs/app-shell.md`** — **routes, navigation entries and the auth-state split only**, from *Shared shell*. Never the *why*, never a redesign. Owner: the `Mapped` feature that owns the shell files — there always is one.

### Review checkpoint — STOP here
Present what you recorded and end your turn with a clear approval question, e.g.:
> "Here's how I understood your project, what it already does, and how I'll check my own work against it. Does that match — and is there anything about running or deploying it I got wrong?"

Only after approval, save the files. Then hand off.

## Interview Phase

*(New projects only. For `mode: existing`, use the section above.)*

Start the conversation based on the argument the user provided. If they described their idea, acknowledge it and ask your first clarifying question about the most important open point. If no argument was given, ask:

> "What do you want to build, and what problem does it solve?"
> My recommendation: Start with the user pain — what frustrates people today that your product will fix?

Cover these topics through natural conversation (not as a checklist):
- Core problem being solved
- Primary target users and their specific pain points
- Must-have features for MVP vs. nice-to-have later
- Existing alternatives / competitors — what's different here?
- Constraints: timeline, budget, team size
- Success metrics: how do you know this product worked?
- Non-goals: what are you explicitly NOT building in this version?

### Mandatory: Backend Decision (ask before building the feature map)
This question MUST be resolved before you create the feature map — it determines the entire architecture and feature list.

Ask:
> "Does the app need to store data persistently or sync between users/devices?"
> My recommendation: Yes — most apps need at least local persistence. If multiple users or cross-device sync is needed, a backend is required.

**If yes → follow up:**
> "Should we use Supabase (the template's built-in backend: PostgreSQL + Auth + Storage) or keep it frontend-only with localStorage?"
> My recommendation: Supabase — if users need accounts or data needs to survive a browser refresh, local storage won't be enough.

**If Supabase is chosen:**
- **Do NOT create a "Supabase Infrastructure Setup" feature.** Getting Supabase running (local stack, `.env.local`, client wiring) is **project setup, not a feature** — it has no user-facing behavior and no real user story. `/init` stands it up right after the PRD is approved (→ *Get the Backend Ready* below); `/verify-setup` re-checks and repairs it on every later run.
- **Accounts/auth ARE a feature.** If the app needs user accounts, make the **first feature a real "User Accounts & Auth" feature** — signup/login *together with* its data foundation (the `profiles` table, the per-user RLS pattern, the signup→profile trigger). Frame it with genuine user stories ("As a user I want to sign up and be sure only I can see my data"). That feature establishes the per-user RLS pattern every later feature copies; `docs/data-model.md` is the shared map.
- Features that need per-user data depend on the **Accounts & Auth** feature (not on an infra feature).
- Then resolve the **Environment Strategy** sub-question below before building the feature map.

**If frontend-only (localStorage):**
- No infrastructure feature needed
- Note "No backend — localStorage only" in the PRD Constraints section
- Skip the Environment Strategy question — it only applies to Supabase.

#### Mandatory sub-question: Environment Strategy (only if Supabase is chosen)
This decides whether the user has a separate place to test before touching live data. Use your agent's structured question tool (`AskUserQuestion` in Claude Code; where there is none, one plain-text question, then wait) so the choice is an unmissable prompt, not buried text. Ask:

> "How do you want to handle test vs. live data? You can always change this later."
> - **Local (recommended) — free, fully isolated** — Supabase runs on your own machine via Docker while you build; when you deploy, your database is migrated to a live hosted project. Best isolation, $0. Needs **Docker** and the **Supabase CLI** installed (the setup check helps with this).
> - **Two projects — free** — a separate hosted "dev" project to test in and a "prod" project for real users. Free tier covers both. No Docker needed.
> - **No test environment (single project)** — one hosted Supabase project, you work directly against it. Simplest. ⚠️ Your dev work touches the same data your live app uses.
> - **Branching (Pro setup) — ~$35/mo** — one project with an always-on "staging" branch; promote to live with a Merge click. Needs Supabase Pro.

My recommendation: **Local** — it's free, your dev work can never touch live data, and it's the official Supabase dev workflow. If the user can't run Docker, **Two projects** is the best no-Docker alternative.

**Record the choice** as a single line in `docs/PRD.md` under Constraints — every later skill reads it from there:
- `Environment strategy: local` — local Supabase (Docker) for dev, migrated to a hosted project at `/deploy`.
- `Environment strategy: two-projects` — dev + prod hosted projects.
- `Environment strategy: single` — one hosted Supabase project (test == live).
- `Environment strategy: branching` — one Pro project, persistent "staging" branch promoted to production by Merge.

**What each strategy means operationally** — the local stack, which keys go where, and how production is promoted — is in `docs/stacks/backend-supabase.md`. Read it rather than restating it here, so the setup story and the deploy story cannot drift apart. What matters at this point in the interview: all four are *setup and deploy plumbing*, handled by `/verify-setup` and `/deploy`, and **none of them is a feature**.

Record only the `Environment strategy:` line in PRD Constraints — there is no infra feature to scope.

##### Region: pick the EU one, and say why (only if Supabase is chosen)
Whenever a **hosted** Supabase project gets created — here, at `/verify-setup`, or at `/deploy` — the region must be chosen deliberately. For a German or EU audience that is **`eu-central-1` (Frankfurt)**.

Tell the user this once, plainly, because it is the one setting they cannot walk back:

> "When you create the Supabase project, pick the region **Frankfurt (eu-central-1)**. It keeps your users' data in the EU, which is what EU and Swiss data-protection law expect for an EU or Swiss audience — and unlike almost everything else, **the region can't be changed later** without migrating the whole database."

Record it in PRD Constraints: `Data region: eu-central-1 (Frankfurt)` — or whichever region the user actually chose, so `/dsgvo` and `/deploy` can see it.

##### Record the decision in `.ai-eng-kit`
Once the user has decided, set `stack.backend` to `supabase` or `localstorage`. The scaffolder leaves it `null` on purpose — it ships the Supabase client, but whether the product uses it is this decision, not a property of the template. `/build`, `/qa` and `/deploy` read that field to know whether there is a database to migrate, RLS to check, and schema to promote at all. Keep the JSON valid and change nothing else.

### Mandatory: Data Protection Law and Stance (ask before building the feature map)
Only ask when the product will hold **personal data** — user accounts, contact details, uploads, free-text fields, anything a person types about themselves. A frontend-only tool with no accounts and no user input can skip this entirely; say so and move on.

**First, which law.** Use your agent's structured question tool (`AskUserQuestion` in Claude Code; otherwise a plain-text question listing the options), multi-select — one product often falls under more than one, and the answer changes real requirements (the Swiss DSG has no consent-before-loading rule and no legal-basis requirement; the GDPR has both):

> "Where are the people whose data this product will hold? This decides which data-protection law `/dsgvo` assesses against."
> - **EU / Germany** (GDPR / DSGVO)
> - **Switzerland** (DSG)
> - **Somewhere else** — name it; the structure is covered, the specifics go to a lawyer there

**And one follow-up when the product will ship AI features** (an LLM API, generation, a model that
decides or recommends) **and the EU is among the markets**: record `ai-act` in the same list. The EU
AI Act attaches to the *functionality*, not the jurisdiction alone — it travels with `gdpr`, never
instead of it. If AI features are merely likely later, say one sentence now ("if you add AI features
later, tell `/dsgvo` — the AI Act then applies on top") instead of recording it on speculation.

A Swiss company with EU customers, or a German one with Swiss customers, usually needs **both** — say so when the description suggests it. Record the answer twice: in `.ai-eng-kit` → `law` as a list (`["gdpr"]`, `["dsg"]`, `["gdpr","dsg"]`, `["gdpr","ai-act"]`, or the name they gave), keeping the JSON valid, and in PRD Constraints as `Data protection law: GDPR (EU/DE), DSG (CH)`. `docs/law/<value>.md` holds the rules for each.

**Then, how much work.** Use the structured question tool again (or a plain-text question):

> "How much data-protection work do you want to carry? This sets how deeply I'll look at it — it doesn't change what the law requires."
> - **Lean** — small MVP, few users, nothing sensitive. Cover the basics, keep friction low.
> - **Standard (recommended)** — a real product with user accounts, aimed at the public. The usual duties, documented.
> - **Strict** — sensitive data, employee data, business with public bodies or larger companies, or you simply want it airtight.

Record it in PRD Constraints: `Data protection stance: lean | standard | strict`.

Then say the boundary once, so the expectation is set from the start:

> "I'll flag data-protection risks as we go and turn them into requirements we can actually build. I'm not a lawyer and I won't tell you that you're compliant — for that you need one, or a data protection officer / advisor."

If the product will obviously hold **special category data** (health, biometrics, ethnicity, religion, sexual orientation) or **children's data**, name that now, not later — it changes the shape of the whole product and it is far cheaper to know at the feature-map stage.

### Mandatory: Design System (ask before building the feature map)
Ask:
> "Do you have an existing design system, brand guidelines, or UI reference I should follow?"
> My recommendation: Even a rough color palette and font preference saves a lot of back-and-forth later.

**Three ways the user can answer:**
1. **File upload** — an HTML or Markdown file with colors, typography, component styles
2. **Manual input** — the user describes it directly (e.g. "dark theme, Inter font, blue primary #2563EB")
3. **None** — the common case, and the one that decides how the app will look

**`docs/design-system.md` gets written either way.** Answer 3 means *you* propose one, not that the question is dropped — five later steps read this file, and "no answer" used to leave it missing, which is how an app ends up looking like an untouched component library. Ask two quick questions to anchor the proposal (what the product is, and one adjective for the feel — "calm and professional", "bold and playful"), then write the file and show it for approval like every other artifact.

**What the file contains** — concrete values, never adjectives alone, because `/build` has to apply it without asking again:
- **Colors:** primary, secondary, accent, destructive, plus background/foreground for light *and* dark. Give actual values in the token format the stack uses.
- **Typography:** font family, the size scale, and which weights are used for headings vs. body.
- **Radius, spacing, elevation:** the base radius, the spacing rhythm, and whether the product uses shadows or borders to separate surfaces.
- **Component conventions:** default button size and variant, form field height, how empty and loading states look.

**Non-negotiable defaults** — put these in the file unless the user's own system contradicts them. They are what separates a product from a demo, and no acceptance criterion will ever ask for them:
- **Light and dark are both defined from the start.** Retrofitting dark mode means touching every component twice.
- **Never pure `#000` or `#fff`** for background or text — near-black and near-white read as designed, pure values read as unstyled.
- **Never a flat, unmodulated brand color** across large surfaces; give it a hover, an active, and a subtle-background variant.
- **Every interactive element has a visible hover *and* focus state.** Focus is an accessibility requirement, not a nicety — keyboard users have nothing else.
- **One radius decision, applied everywhere.** Mixed corner radii are the most common tell of an assembled-not-designed UI.
- **Text sits on a contrast ratio of at least 4.5:1** against its own background, in both themes.

Then:
- Add a note in `docs/PRD.md` under Constraints: "Design system: see `docs/design-system.md`"
- `/build` reads this file when implementing every feature

## After the Interview: Create the PRD

Once you have a complete understanding, write `docs/PRD.md` with:
- **Vision:** 2-3 sentences — what it is and why it matters
- **Target Users:** Who they are, their specific needs and pain points
- **Core Features (Roadmap):** two or three sentences — what the MVP must do, what deliberately comes later. **No feature table here**: the feature map lives in `features/INDEX.md` and only there, so nothing has to be kept in sync
- **Success Metrics:** Measurable outcomes
- **Constraints:** Timeline, team, budget, technical limitations
- **Non-Goals:** What will NOT be built in this version

**Review checkpoint — STOP here.** Present the draft PRD in the chat (do not save it yet) and end your turn with a clear approval question, e.g.:
> "Here's the draft PRD. Does this capture it correctly, or what should I change before I save it?"

Wait for the user's reply. Only after they approve, save `docs/PRD.md` and apply any feedback first.

## After PRD: Create the Feature Map

Apply Single Responsibility to break the roadmap into individual features:
- Each feature = ONE testable, deployable unit
- Identify dependencies between features
- Assign recommended build order (respecting dependencies)
- Assign priority: P0 = MVP, P1 = next, P2 = later

**The app shell IS a feature — when there is enough of it.** The frame around every page (logo, sidebar or top nav, the mobile burger, the page-header pattern) belongs to *no* feature by default, so it grows by accretion: each feature adds a nav entry and a header variant inside its own `design.md`, and nobody owns the whole. Rebuilding it later is then painful — there is no spec to `/refine`, because no acceptance criterion ever said what the shell should do.

- **More than two top-level areas**, or a frame that genuinely differs by auth state beyond "login page vs. the app" (role-based navigation, a signed-out marketing shell next to a signed-in product shell) → propose **"App Shell & Navigation"** as its own early feature, right after Accounts & Auth. Accounts alone do not trigger it: a login page plus one screen with a header is the single-screen case below. Its ACs are real and testable: which nav entries exist per auth state, the active-state marking, the mobile behavior below `md`, the shared page-header pattern.
- **A single-screen tool or a two-page MVP** → do **not** create it. The shell is a header and it fits in the one feature that owns the screen. Say so and move on; a mandatory shell feature would just be ceremony.
- Later features **depend on** the shell feature and reuse its components instead of adding their own navigation.

**What goes into `features/INDEX.md`, and where:**
- One table row per feature: **ID** (`<prefix>-1`, `<prefix>-2`, … — the prefix is `.ai-eng-kit` → `featurePrefix`, `PROJ` unless the project chose another at install) · **Feature** — the **name only**, two to four words, the way you would say it ("Benutzerkonto & Login", "Kanban-Board"); never the description, the priority or the dependencies in this cell · **Description** — one sentence of what it does · **Status** Roadmap · Spec `—` · Created today
- Priority and dependencies go into the **Build order** line under the table, once, in the form the template shows (`P0 (MVP): PROJ-1 → PROJ-2 · P1: PROJ-3 (needs PROJ-2) …`). They are not columns and not in the PRD — `INDEX.md` is the one place, so nothing drifts.
- In a project whose `INDEX.md` predates the Description column (five columns), add the column when you add rows — the existing rows keep an empty cell; never rebuild the table

**Review checkpoint — STOP here.** Present the feature map in the chat and end your turn with a clear approval question, e.g.:
> "I've identified X features — here's the breakdown and recommended build order: […]. Does this look right, or should I split, merge, or re-prioritize anything before I save it?"

Wait for the user's reply. Only after they approve, apply any feedback, then update `features/INDEX.md` and the "Next Available ID" line.

## After the Feature Map: Sketch the App-Wide Data Model
Now that the whole feature set is known, sketch the **data the product manages, once and holistically** — before any single feature invents its tables in isolation. This is what keeps the data coherent: get the entities and their relationships right up front, so later features build against a shared map instead of bolting on mismatched tables and painful foreign keys.

**Stay at product altitude — this is modeling, not schema design:**
- Capture **entities** (the real-world nouns the app stores: `profiles`, `credit_ledger`, `feedback_items`, …), their one-line purpose, and **who owns/sees each**.
- Capture the **relationships** between them in plain language (a profile has many X; each X belongs to one Y).
- Do **NOT** specify column types, indexes, or exact foreign keys — that is technical *how*, decided per feature in `/architecture` (`design.md`). Entities + relationships + ownership only.

This applies **even to localStorage / frontend-only apps** — they still have data shapes worth mapping; they just won't become database tables.

Write it to `docs/data-model.md` using the template already there. It's a **living blueprint**: `/architecture` refines it as each feature is designed.

**Review checkpoint — STOP here.** Present the data-model sketch in the chat and end your turn with a clear approval question, e.g.:
> "Here's the app-wide data model — the entities and how they relate. Does this match how you picture the data, or is anything missing or connected wrong?"

Wait for the user's reply. Only after they approve, save `docs/data-model.md`.

## After the Data Model: Sketch the App Shell
Same move as the data model, for the UI: now that the whole feature set is known, decide **once** what frame the features live inside — before each one invents its own navigation. `docs/data-model.md` keeps the data coherent; `docs/app-shell.md` keeps the app *feeling* like one product.

You already know enough for this the moment the feature map exists: the top-level areas usually **are** the P0 features.

**Stay at product altitude — structure, not styling:**
- The **top-level areas** a user can navigate to, who sees each (signed out / signed in / per role), and which feature owns each.
- The **layout regions**: sidebar or top nav, header, content, and what happens on mobile.
- The **page pattern** every feature repeats: page header with title and primary action, loading, empty, and error states.
- Do **NOT** specify colors, fonts, or component styling — that is `docs/design-system.md`. Do **NOT** design a single feature's page internals — that belongs in that feature's `design.md`.

Write it to `docs/app-shell.md` using the template already there, and record the **owning feature** at the top. **The owner is always a feature, never "none":** the App Shell feature if you created one, otherwise the feature that builds the screen the frame sits on (in a one-screen app with a login, that is the screen feature — not the accounts feature, whose page has no frame). `/architecture` routes every later change to the frame through `/refine <owner>`, and `/audit` flags a frame nobody owns — an ownerless trivial shell is exactly the gap both exist to close. It's a **living blueprint**: `/architecture` refines it as each feature is designed.

For a genuinely single-screen app, keep this short — a filled-in Page Pattern and `Owner: PROJ-2 (the board screen carries the header)` is a complete answer. Don't manufacture navigation that the product doesn't have.

**Review checkpoint — STOP here.** Present the shell sketch in the chat and end your turn with a clear approval question, e.g.:
> "Here's the app shell — the areas in the navigation and the frame every page sits in. Does that match how you picture moving around the app, or is something missing?"

Wait for the user's reply. Only after they approve, save `docs/app-shell.md`.

## After Approval: Get the Backend Ready (no bounce — new projects only)

> **`mode: existing`: skip this section entirely.** The project already has whatever backend it has, running the way its team runs it. Standing a second stack up beside it is not setup, it is damage.

Once the PRD, feature map, and data model are approved, finish the project setup **right here** — don't send the user back to `/verify-setup`. What you do depends on the Environment strategy you recorded:

- **`local` (default):** stand the local stack up now, in this session — follow **"Standing up the local development stack"** in `docs/stacks/backend-supabase.md`, top to bottom, handing off anything that needs a human. That is the same procedure `/verify-setup` re-checks later, which is why it lives in one place. When it is up, the first feature can build against a real database immediately.
- **`two-projects` / `single` / `branching` (cloud):** there's nothing to start locally. Hand off in plain language what the user must do (create the hosted project(s), paste the test keys into `.env.local`) and point out that production is wired at `/deploy`.

This is project setup, not a feature — but it belongs to initialization, so it happens now rather than as a separate round-trip. If Docker/CLI is missing for `local`, hand off the one fix and let the user re-run `/verify-setup` (the repair path) — but in the normal case, no second visit is needed.

## What NOT to do
- Do NOT create feature folders or spec files (`features/PROJ-X-*/spec.md`) — that is `/write-spec`'s job, and `/reverse-spec`'s for a `Mapped` feature
- Do NOT write code or make technical decisions. (The app-wide data model and the app shell are exceptions **only** at product altitude — entities/relationships/ownership, and areas/regions/page pattern. Column types, indexes, foreign keys, component trees, and styling are NOT yours here; they belong to `/architecture` and `docs/design-system.md`.)
- Do NOT ask multiple questions at once
- Do NOT end a turn on a statement or summary — every turn ends on a question, then you stop and wait
- Do NOT save the PRD or feature map before the user has approved it at its review checkpoint
- Do NOT stop early — keep going until you have full clarity on the project
- In `mode: existing`: do NOT rewrite, restructure or "tidy" anything that was already there, do NOT stand up a backend or a local stack, and do NOT record `platform`, `stack`, `commands` or `probe` from what the repo looks like — propose from what a file states, record only what the user confirmed

## Checklist Before Completion — `mode: existing`
- [ ] `docs/codebase/` was read first; if missing, `/map` was recommended before the first question
- [ ] `platform` recorded, and `stack` reflects what the user confirmed (not what was detected, where the two differed)
- [ ] `commands` recorded, and every command named actually exists
- [ ] `probe.kind` recorded — including `none` where nothing can be automated; an unanswered probe leaves `/qa` unable to verify anything
- [ ] `stack.deploy` recorded (or `null` as a real answer), and `Hosting:` / `Data region:` present in `docs/PRD.md` → Constraints
- [ ] If the project holds personal data: `law` recorded in `.ai-eng-kit` and `Data protection law:` in PRD Constraints
- [ ] Every field the user could not answer is `null` **and** named in a hand-off message they can forward — never filled by a guess
- [ ] The same values mirrored into the memory file's **How This Project Runs**
- [ ] `.ai-eng-kit` still parses as JSON, and nothing outside `platform`, `stack`, `commands`, `probe`, `layers`, `featurePrefix` and `law` was changed
- [ ] `layers` recorded — `[]` when the user confirmed there is no second runtime; every `packs` path in it exists
- [ ] `featurePrefix` matches what the entries in `features/` actually carry
- [ ] Short PRD describes the product **as it is**, with the constraints that already hold, and **What already exists** lists the confirmed features with evidence
- [ ] With a map: the feature map was confirmed as a whole, the narrative question asked once, and every confirmed feature is in `features/INDEX.md` as `Mapped` with an empty Spec cell; planned-but-unbuilt ones are `Roadmap`; the Unassigned list was read out
- [ ] `docs/data-model.md` filled only from **one** named schema source (source line first), otherwise left empty with the reason; `docs/design-system.md` and the routes in `docs/app-shell.md` written from the map with sources, or left empty — never from a skim
- [ ] No feature was reconstructed as a spec — `Mapped` is a row, not a folder; `/reverse-spec` writes the spec
- [ ] Nothing existing was rewritten, restructured, installed or stood up
- [ ] On a re-entry (PRD already filled): only fields that were `null` were asked and written; PRD, INDEX and everything else untouched
- [ ] User has reviewed and approved

## Checklist Before Completion — new projects
- [ ] PRD fully filled out (Vision, Target Users, Roadmap, Metrics, Constraints, Non-Goals)
- [ ] Backend decision resolved (Supabase vs. localStorage) **and written to `.ai-eng-kit` → `stack.backend`**
- [ ] If Supabase: NO "Supabase Infrastructure Setup" feature created — setup is owned by `/verify-setup`, not a spec
- [ ] If Supabase + accounts needed: first feature is a real "User Accounts & Auth" feature (signup/login + profiles + per-user RLS + signup→profile trigger), with user-facing stories; per-user-data features depend on it
- [ ] If Supabase: Environment strategy chosen (local / two-projects / single / branching) and written to PRD Constraints
- [ ] If Supabase: EU region (`eu-central-1`) named to the user as unchangeable, and the chosen `Data region:` written to PRD Constraints
- [ ] If the product holds personal data: `law` recorded in `.ai-eng-kit` and `Data protection law:` in PRD Constraints; `Data protection stance:` chosen and written to PRD Constraints; the "not legal advice" boundary stated once
- [ ] If frontend-only: noted in PRD Constraints
- [ ] Design system decision resolved
- [ ] `docs/design-system.md` written (from the user's system, or proposed by you and approved) and referenced in PRD
- [ ] Every feature respects Single Responsibility
- [ ] Dependencies between features documented
- [ ] All features added to `features/INDEX.md` with status "Roadmap" — Feature cell is the name only, Description its own cell, priority and dependencies in the Build order line
- [ ] "Next Available ID" updated in INDEX.md
- [ ] App-wide data model sketched to `docs/data-model.md` (entities + relationships + ownership; NO column types/indexes/FKs) and approved by the user
- [ ] App shell decided: more than two top-level areas (or signed-out ≠ signed-in) → an "App Shell & Navigation" feature exists in INDEX; a single-screen tool → deliberately none
- [ ] App shell sketched to `docs/app-shell.md` (areas + layout regions + page pattern + owning feature; NO colors/fonts) and approved by the user
- [ ] If Supabase + `local`: local stack set up in this session (Docker/CLI checked, `supabase start` run, clients wired, local keys handed off) — no bounce to `/verify-setup`. If cloud: the user's setup action handed off clearly
- [ ] Build order recommended
- [ ] User has reviewed and approved PRD and feature map

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
After user approval:

> "Project setup complete. Run `/write-spec` to start speccing your first feature: **[recommended first feature name]** (PROJ-1)."

For `mode: existing`, say what you recorded and what it buys them — they came in with a working project and should hear what changed and what did not:

> "I've recorded how your project runs, so I check my work against it instead of guessing. Nothing in your code was touched. Run `/write-spec` when you want to plan your next feature: **[name]** (PROJ-X)."

With a confirmed feature map, name the other path too:
> "The 9 features your app already has are in `features/INDEX.md` as `Mapped`. Run `/reverse-spec` to turn them into specs one at a time, starting with **[first in order]** (PROJ-1) — each confirmed criterion becomes something `/qa` can check, so a fix stops breaking the last one. Or `/write-spec` for something new."

If the project uses Supabase **local** and you set the stack up above, confirm it rather than sending them back:
> "Your local Supabase is running and `.env.local` is wired, so the first feature can build against a real database right away."

If the strategy is cloud (or Docker/CLI was missing so setup couldn't finish), point to the one remaining action instead.

## Git Commit
```
feat: Initialize project — PRD and feature map

- Created docs/PRD.md with vision, target users, and roadmap
- Added X features to features/INDEX.md
```