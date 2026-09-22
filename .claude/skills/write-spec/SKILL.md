---
name: write-spec
description: Write a full feature spec for a feature. Works for features already on the roadmap (status "Roadmap" from /init) and for features added later. Pass a feature name or PROJ-X ID as argument.
argument-hint: "feature name or PROJ-X ID"
user-invocable: true
---

# Feature Spec Writer

## Goal
Turn a feature idea into a complete, testable specification — user stories, acceptance criteria, and edge cases — precise enough that QA can later verify it line by line.

You produce ONLY the **contract** (`spec.md`) — the WHAT. The technical design (`design.md`) is owned by `/architecture`; the test report (`qa-report.md`) is owned by `/qa`. Do not pre-fill those files.

## A feature is a user-facing capability — setup is not a feature
Every feature must have a real user-facing outcome and genuine user stories. **Project/dev setup is not a feature** and must never become a spec:
- Standing up the local database or backend stack (in the kit's own stack `supabase init`/`start`), wiring clients, the env file, the migrations workflow → that's setup: **`/init`** stands it up once the PRD is approved, **`/verify-setup`** re-checks it. If the user asks to spec "infrastructure setup", redirect: "That's setup, not a feature — `/init` stood it up and `/verify-setup` checks it. Let's spec the first capability your users actually get."
- If a spec's user stories all start with "As a developer I want…" and describe environment plumbing, that's the smell of a non-feature. Stop and reframe.
- **Accounts/auth IS a real feature** — and it *includes its data foundation*. The "User Accounts & Auth" spec covers signup/login **plus** its data foundation — the user profile table, the per-user data-access rules, and the signup→profile hook (in the kit's own stack: `profiles`, RLS, a database trigger) — framed as user value ("As a user I want only I can see my data"). Don't split that data foundation into a separate backend-only spec.

## The Discovery Interview
Interview the user until you reach a **complete shared understanding** of the feature. Rules:

- **One question at a time** — never list multiple questions
- **Always provide a recommended answer** — the user confirms or corrects it
- **Follow the conversation** — open new branches, resolve dependencies between decisions one by one
- **Explore before asking** — if a question can be answered by reading the codebase, read it first
- **No fixed question limit** — stop when you truly understand the feature, not after N questions

## Before Starting
1. Read `docs/PRD.md` — understand the project vision and target users
2. Read `features/INDEX.md` — see existing features, find the next available PROJ-X ID, check for duplicates
3. Check what already exists, **in the layout this project actually uses**. For a project the kit scaffolded: `git ls-files src/components/` and `git ls-files src/app/api/`. For any other project those paths return nothing and say nothing about it — read `.ai-eng-kit` → `mode`, `stack` and `commands`, and look where this project keeps its code. An unverified empty result is not evidence of absence.
4. **In `mode: existing`, check whether the feature already exists.** The kit was added to a product that already does things, and the surest way to waste a build is to spec something that shipped last year. Search the code for the capability by name and by route, and skim `features/INDEX.md`. If it looks like it exists at least in part, say so before asking anything else — and let the user decide whether this is a new feature, a change to an existing one (`/refine`), or a spec written for something already built.

**If the project has not been initialized** (PRD is still the empty template):
> "The project hasn't been set up yet. Run `/init` first to define the project vision and feature map."
→ Stop here.

**If no argument was provided**, ask: "Which feature would you like to spec out?" and list all features with status "Roadmap" from INDEX.md. Rows with status "Mapped" are features that already run — name them separately and point at `/reverse-spec`, which reconstructs their spec from the code's evidence; this skill takes one only if the user asks for it explicitly.

**If the argument names a `Mapped` row**, the feature already exists: read its evidence in `docs/codebase/features.md` and `architecture.md` (routes, tables, files) before the first question, keep the ID and the name, and write the spec for **what it should do** — put every criterion you read off the code to the user as *intended / should be / missing*, never record the code's behaviour as the requirement. Add `> Reconstructed from code, confirmed <date>` under the title. Status moves `Mapped` → `Spec'd` (the feature runs; the spec is confirmed; `/qa` is what verifies it — `Planned` would claim it does not exist yet). `/reverse-spec` is the better instrument for this — it works from the map's evidence in confirmable blocks; use this path only when the user explicitly wants the full interview.

## Three Entry Points

### Entry Point A: Feature exists in INDEX.md with status "Roadmap"
The feature was identified during `/init`. Proceed directly to the Interview Phase.

### Entry Point B: Feature does NOT exist in INDEX.md yet
The feature was forgotten during `/init` or is being added later.

**First: is it a new feature at all, or does an existing one grow?** One spec per feature is the point of the whole structure — `spec.md` says what a feature does *today*. A request like "a status filter for the ticket list" or "let users hide columns" names a screen, an entity or a flow that a row in `features/INDEX.md` already owns; written as a new spec it becomes the second of five files that describe one feature and end up contradicting each other. So before anything else, hold the request against the INDEX rows (name and description — already read), and where one looks like the owner, skim that feature's `spec.md`.

The test is the one `/refine` uses: **could this ship and be tested on its own, with its own user story, and would it still make sense if that feature did not exist?** A filter without its list does not. If an existing feature is the owner, say so with your recommendation and let the user decide — in the working language:
> "This looks like an extension of **PROJ-12 Ticket list**, not a feature of its own: it changes what that screen does and cannot ship without it. I recommend `/refine PROJ-12` — the new behaviour becomes acceptance criteria there, and the spec keeps describing the whole feature. Or do you see it as separate?" · „Das sieht nach einer Erweiterung von **PROJ-12 Ticketliste** aus, nicht nach einem eigenen Feature: Es ändert, was dieser Screen tut, und lässt sich ohne ihn nicht ausliefern. Ich empfehle `/refine PROJ-12` — das neue Verhalten wird dort zu Acceptance Criteria, und die Spec beschreibt weiter das ganze Feature. Oder siehst du es als eigenständig?"

If they choose `/refine`: stop here, write nothing, hand off. If they say it is separate, take their word — size is not the test, and they know the product — and record the owning feature under Dependencies.

Otherwise, before the full interview, quickly clarify:
- What is the feature called?
- What priority? (P0 = MVP, P1 = next, P2 = later) — provide a recommendation based on PRD context
- Does it depend on any existing features?

Add it to `features/INDEX.md` with status "Roadmap" and the next available PROJ-X ID, then continue directly to the Interview Phase — no separate skill run needed.

### Entry Point C: Feature already has a spec (status "Planned" or higher)
> "This feature already has a spec. Use `/refine PROJ-X` to update it."
→ Stop here.

## Interview Phase

Start with what you know from `docs/PRD.md` and the feature entry in INDEX.md. Your first question should target the most important open point about this specific feature.

Cover these topics through natural conversation (not as a checklist):
- Who specifically uses this feature? (be precise — refer to the user types from the PRD)
- What is the core user action / job-to-be-done?
- What does success look like from the user's perspective?
- What are the must-have behaviors for MVP?
- What are the validation rules and constraints?
- Error states: what happens when things go wrong?
- Empty states: what does the user see before they have any data?
- Edge cases: concurrent edits, status transitions, the same message arriving twice (webhooks, retries, double submits), network failure, invalid input, permission boundaries
- Dependencies on other features (auth, data, etc.)?
- Performance or security requirements?

**For edge cases, always be concrete:**
- "What happens when the user submits an empty form?"
- "What if two users edit the same record simultaneously?"
- "What should happen if the API call times out?"

**Three shapes make the timing questions mandatory rather than optional.** Look for them in every feature; where one is present, ask the matching question and write the answer as an EC. These are the failures that pass every single-user test and only surface once real people use the app at the same time — so if nobody writes them down here, nobody builds for them:

- **A limited resource** (seats, stock, credits, one slot per day) → "Two people claim the last one in the same second. Who gets it, and what does the other one see?"
- **A status that moves through steps** (draft → paid → shipped) → "Which moves are allowed? Can it ever go backwards, and what must never happen?"
- **A trigger from outside** (payment webhook, import, scheduled job) → "The same message arrives twice, or the second one arrives first. What should happen then?"

The user decides *what should happen* — that is a product decision and belongs in the spec. *How* it is guaranteed (a database constraint, a transaction, a lock) is a technical decision and belongs to `/architecture`.

## After the Interview: Write the Spec

Use [template.md](template.md) to create the feature spec:
- Use the PROJ-X ID already in INDEX.md (or the one assigned in Entry Point B)
- Create the feature **folder** `features/PROJ-X-feature-name/` (kebab-case) and save the spec as `features/PROJ-X-feature-name/spec.md`
- Write ONLY `spec.md` (the contract). Do NOT create placeholder sections for Tech Design, QA, or Deployment in the spec — `design.md` is produced by `/architecture`, `qa-report.md` by `/qa`. In INDEX.md the "Spec" column points to the folder.

**Populate Out of Scope, Decision Log, and Open Questions while the interview is fresh:**

- **Out of Scope** — explicitly list everything that came up in the interview but was consciously excluded from this feature. Reference other features by ID where relevant (e.g. "Bulk delete — deferred to PROJ-5"). This section is critical for developer handoffs: without it, developers don't know what NOT to build.



- **Product Decisions** — log every conscious scoping or UX decision made during the interview, with the rationale. Examples: "Why limit to X items?", "Why this user role and not another?", "Why include/exclude this edge case?" Only **Product Decisions** (Decision | Rationale | Date) live in `spec.md`; **Technical Decisions** belong in `design.md` and are owned by `/architecture` — do not record them here.
- **Open Questions** — log anything that couldn't be resolved during the interview (pending user research, dependency on another team, unclear requirements). Mark as `- [ ]` so they're visible as unresolved.

Do not skip these sections — they are the memory of the spec interview.

**If this feature touches personal data, consult `/dsgvo` — and say that you are doing it.**
Personal data means anything about an identifiable person: accounts, contact details, uploads, location, or a free-text field users will inevitably fill with information about themselves.

Announce it in one line before you run it, so the user knows why the spec is about to grow:
> "This feature stores email addresses and uploaded files, so I'm running a data-protection check on it before I show you the spec — it usually adds a few requirements around deletion and data export."

Then run `/dsgvo PROJ-X` and fold what it proposes into this spec as **real acceptance criteria** with their own AC-IDs — deletion, data export, consent, retention. Treated as normal ACs they get built by `/build` and verified by `/qa` like everything else, instead of becoming a separate compliance track nobody maintains.

**Mark those criteria when you present the draft.** Never let them appear as if they came out of nowhere — the user has to be able to tell which requirements are their product decisions and which are legal obligations, because those two are negotiable in completely different ways:
> "AC-6 to AC-8 come from the data-protection check, not from our interview: account deletion, data export, and a retention rule for the uploads. Those aren't optional the way the rest of the spec is."

Do not paraphrase legal reasoning into the spec: the spec says what the app must do ("a user can delete their account and their data is gone within 30 days"), and `docs/privacy.md` holds the why. If `/dsgvo` raises something only a lawyer can answer, put it in **Open Questions**, not into an AC.

If the feature touches no personal data, say so in one line and move on — that is a valid outcome, not a skipped step.

**If this feature lets someone log in, sign up, or reset a password, abuse protection belongs in the contract.**
Any form that checks a credential can be hammered: an attacker tries thousands of passwords against one account, or one common password against thousands of accounts. Nobody notices, because every single request looks like a normal login. This is not a production-hardening detail to add later — it is part of what "the login works" *means*, so it goes into the spec as ordinary acceptance criteria and rides the AC → Task → Test chain like everything else.

Write them as normal, testable criteria — the user has to be able to approve the numbers, so name them. Write them in the project's working language like every other AC; the examples below show both:

*English project:*
- [ ] **AC-X** — Given 5 failed login attempts for the same email address within 15 minutes, when another attempt is made, then it is rejected and the user is told they can try again in X minutes
- [ ] **AC-X** — Given a login attempt fails, when the error message is shown, then it does not reveal whether the email address exists (the same message for an unknown address and a wrong password)
- [ ] **AC-X** — Given an automated script calls the signup form, when it tries to create accounts in bulk, then a CAPTCHA prevents it

*Deutsches Projekt:*
- [ ] **AC-X** — Angenommen es gab 5 fehlgeschlagene Login-Versuche für dieselbe E-Mail-Adresse innerhalb von 15 Minuten, wenn ein weiterer Versuch erfolgt, dann wird er abgelehnt und der Nutzer sieht, dass er es in X Minuten erneut versuchen kann
- [ ] **AC-X** — Angenommen ein Login-Versuch schlägt fehl, wenn die Fehlermeldung angezeigt wird, dann verrät sie nicht, ob die E-Mail-Adresse existiert (immer dieselbe Meldung für unbekannte Adresse und falsches Passwort)
- [ ] **AC-X** — Angenommen ein automatisiertes Skript ruft das Registrierungsformular auf, wenn es massenhaft Konten anlegen will, dann verhindert das ein CAPTCHA

Ask the user for the numbers rather than inventing them — "how many failed attempts before we throttle?" — and offer a sane default (5 attempts / 15 minutes). Then mark these criteria when you present the draft, the same way you mark the data-protection ones:
> "AC-7 to AC-9 didn't come out of our interview — they protect the login from automated guessing. Without them a login isn't finished."

`/architecture` decides *how* it's enforced (Supabase's own limits, CAPTCHA, an app-level throttle) — the spec only states the behavior. Password rules (minimum length, rejecting known-leaked passwords) belong here too when the feature has a password.

Present the draft spec to the user for review. Apply feedback, then save.

## After Saving: Update Tracking Files

Update `features/INDEX.md`:
- Change the feature's status from "Roadmap" to "Planned"
- If Entry Point B: also add the row — Feature is the **name only**, the one-line summary goes into the Description cell — place it in the Build order line, and update the "Next Available ID" line

`docs/PRD.md` is not touched: the feature map lives in `INDEX.md` only.

## Feature Granularity (Single Responsibility)
Each spec = ONE testable, deployable unit.

**Never combine:**
- Multiple independent functionalities
- CRUD for different entities
- User functions + admin functions
- Different UI screens or areas

**Split when:**
1. Can it be tested independently? → Own spec
2. Can it be deployed independently? → Own spec
3. Does it target a different user role? → Own spec
4. Is it a separate UI screen? → Own spec

**Document dependencies:**
```markdown
## Dependencies
- Requires: PROJ-1 (User Authentication) — for logged-in user checks
```

## Important
- NEVER write code — that is for the `/build` skill
- NEVER make technical decisions — that is for the Architecture skill
- Focus: WHAT the feature does (not HOW)

## Acceptance Criteria Format
Every acceptance criterion is one Given/When/Then sentence, written in **the project's working language** (`CLAUDE.md` → Key Conventions → Working language). The structure is identical in both languages; only the three keywords change:

| Language | Format |
|----------|--------|
| Deutsch  | `- [ ] **AC-1** — Angenommen [Vorbedingung], wenn [Aktion], dann [Ergebnis]` |
| English  | `- [ ] **AC-1** — Given [precondition], when [action], then [outcome]` |

Pick the row that matches the project and use it for **every** AC and EC in the spec — never mix the two, and never write the criteria in a different language than the rest of the document. This is the single most common place a spec ends up half-translated.

Each acceptance criterion gets a **stable ID** (`AC-1`, `AC-2`, …) and each edge case an ID (`EC-1`, `EC-2`, …). These IDs are the traceability backbone: tasks reference the AC-IDs they fulfill, and `qa-report.md` reports per AC-ID. The chain is AC → Task → Test.

Examples (German project):
- [ ] **AC-1** — Angenommen der Nutzer ist eingeloggt, wenn er ein leeres Formular abschickt, dann wird für jedes Pflichtfeld eine Validierungsfehlermeldung angezeigt
- [ ] **AC-2** — Angenommen eine Aufgabe existiert, wenn der Nutzer auf „Löschen" klickt, dann erscheint ein Bestätigungsdialog bevor die Aufgabe entfernt wird
- [ ] **EC-1** — Angenommen zwei Nutzer bearbeiten denselben Datensatz gleichzeitig, wenn beide speichern, dann …

Examples (English project):
- [ ] **AC-1** — Given the user is logged in, when they submit an empty form, then a validation message is shown for every required field
- [ ] **AC-2** — Given a task exists, when the user clicks "Delete", then a confirmation dialog appears before the task is removed
- [ ] **EC-1** — Given two users edit the same record at the same time, when both save, then …

AC- and EC-IDs are stable: once assigned, never renumber them — downstream tasks and tests reference them. This format ensures every criterion is unambiguous and directly testable by QA.

## If the feature integrates AI — three checks before the spec is done
When the feature calls a model (an LLM API, generation, scoring, recommendations) and `.ai-eng-kit` →
`law` includes `ai-act` — or the product ships to EU users, in which case recommend recording it
(`/init`'s law question):

1. **Not prohibited, not high-risk?** Skim `docs/law/ai-act.md` §1–2. Emotion recognition on employees,
   social scoring, or an Annex III use (hiring decisions, credit scoring, education assessment) → stop
   the spec at a blocking Open Question for counsel; do not design around it.
2. **Transparency as ACs** (§4): an AI the user talks to gets an AC that the UI discloses it; generated
   media gets an AC that it is marked as AI-generated. These are testable UI behaviour — `/qa` checks
   them like any other criterion.
3. **Personal data into the model?** Then the GDPR interface (§5) applies: name the model vendor as a
   processor in the spec's Technical Requirements (DPA, training-exclusion setting, EU transfer route)
   so `/architecture` and `/dsgvo` inherit it instead of rediscovering it.

## Checklist Before Completion
- [ ] At least 3–5 user stories defined
- [ ] Out of Scope filled in (everything discussed but excluded, with references to other features where applicable)
- [ ] Every acceptance criterion uses the Given/When/Then format in the project's working language and has a stable AC-ID (AC-1, AC-2, …)
- [ ] The whole spec is in that one language — headings, user stories, ACs, edge cases, decision log. Nothing half-translated
- [ ] Product Decisions logged with rationale (Technical Decisions deferred to `/architecture`)
- [ ] Personal data explicitly considered — either `/dsgvo PROJ-X` was run (announced beforehand, and its criteria pointed out by AC-ID when presenting the draft) or you stated in one line that the feature holds none
- [ ] If the feature checks a credential (login, signup, password reset): abuse-protection ACs written with **concrete numbers** the user approved — throttling after N failed attempts, no account-enumeration in the error message, bot protection on signup — and pointed out as non-negotiable when presenting the draft
- [ ] Open Questions logged for anything unresolved
- [ ] At least 3–5 edge cases documented, each with an EC-ID (EC-1, EC-2, …)
- [ ] Feature checked for a limited resource, a status flow, or an external trigger — where present, the matching timing edge case is written as an EC instead of left for `/build` to stumble on
- [ ] Feature ID assigned (PROJ-X)
- [ ] Spec saved to `features/PROJ-X-feature-name/spec.md` (feature folder created)
- [ ] Entry Point B: checked whether an existing feature owns this request — extension → handed off to `/refine`, nothing written
- [ ] `features/INDEX.md` updated (status: Roadmap → Planned; next ID updated if Entry Point B)
- [ ] `features/INDEX.md` row is name + description, not a description crammed into the name; Build order line covers the feature
- [ ] User has reviewed and approved the spec

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
> "Spec is ready. Run `/architecture` to design the technical approach for PROJ-X."

## Git Commit
```
feat(PROJ-X): Write feature specification for [feature name]
```
