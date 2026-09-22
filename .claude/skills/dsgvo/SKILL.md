---
name: dsgvo
description: Assess the project or a feature spec for data-protection risk before it gets built — under the EU GDPR / German DSGVO, the Swiss DSG, or both, as recorded for this project — which personal data it touches, on what legal basis, what has to be built in, and what needs a lawyer. Turns findings into acceptance criteria, not legal prose. Pass a feature (e.g. PROJ-2) or run with no argument for the whole project. Never a compliance verdict.
argument-hint: "optional: feature to assess (e.g. PROJ-2) — omit for the whole project"
user-invocable: true
---

# Data Protection Assessment (DSGVO / GDPR · Swiss DSG)

## Goal
Find the data-protection problems in a product idea **while they are still cheap to fix** — at spec and design time, not after launch. Work from what the project already documents (`docs/PRD.md`, `docs/data-model.md`, the feature specs) rather than from grepping code: at that altitude you can still change what gets stored, where it lives, and who can see it. Output concrete, buildable acceptance criteria and a short list of things that genuinely need a human lawyer — never a compliance verdict.

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

The *structure* of the legal reasoning is stack-neutral and applies unchanged — what changes is where you look for the answers:

- **Where the data physically lives** (the region question) comes from this project's actual backend, not
  from a Supabase dashboard that may not exist. Read `stack.backend`, and ask when it does not tell you.
- **Which third parties receive data** is answered by this project's dependencies and configuration, not by
  the kit's default stack.
- **Never state a hosting region, a processor, or a retention period you have not verified.** Being wrong in
  a data-protection document is worse than leaving it open, because the user may act on it.

## What you are NOT
**You do not give legal advice and you never certify compliance.** You have no license, no view of the user's contracts, and no knowledge of their company. Say what the risk is, what the law expects, and what to build or ask — then route the judgment call to a lawyer or Datenschutzbeauftragter (data protection officer).

Words you must never use about the user's app: *compliant*, *GDPR-compliant*, *DSGVO-konform*, *legally safe*, *rechtssicher*, *you're covered*. Say instead: "this covers the usual expectation for X — a lawyer should confirm it for your case."

If the user pushes for a yes/no verdict, say plainly that you can't give one and that it would be worthless if you did, then give them the sharpest version of what you *can* say: the specific risk, the specific question, and who answers it.

## Which law applies — read it, or ask once

The duties have the same shape everywhere: inform people, collect no more than needed, let them see
and correct and delete, secure it, contract your processors, mind where the data goes, assess the big
risks. **What each duty concretely requires, and what it is called, differs by law** — and a Swiss
product is not a German one with a different currency: the DSG has no legal-basis requirement, no
consent-before-loading rule for cookies, no 72-hour breach clock, and it fines the person rather than
the company.

Read `law` from `.ai-eng-kit` (mirrored as `Data protection law:` in `docs/PRD.md` → Constraints). It is
a **list**, because one product often falls under more than one:

- `gdpr` → read `docs/law/gdpr.md` — EU GDPR with Germany's BDSG / TDDDG / DDG additions
- `dsg` → read `docs/law/dsg.md` — the Swiss revDSG
- `ai-act` → read `docs/law/ai-act.md` — the EU AI Act; it rides **on top of** the data-protection law,
  never instead of it, and it keys off functionality: check it for every feature that calls or ships a
  model. Its order matters — prohibited practices first (a hit is a stop), then the Annex III high-risk
  check (a hit is a blocking Open Question for counsel, not a task), then the Art. 50 transparency
  duties, which become ordinary acceptance criteria. **If `law` lacks `ai-act` but the product clearly
  ships AI features to EU users, say so once and recommend recording it** — do not silently assess
  against a law the stamp does not name.
- **both** → read both and, for every duty, apply the **stricter form** (consent-before-loading satisfies
  the Swiss opt-out rule; the 72-hour clock satisfies "as soon as possible"; naming export countries in
  the privacy policy costs nothing under the GDPR). Say which law each finding comes from.
- **a value with no `docs/law/<value>.md`**, or **`null`** → the structure below still applies in full,
  but the specifics — articles, deadlines, which authority — are a hand-off: name them as open questions
  for a lawyer in that jurisdiction, and never fill them from the GDPR because that is the one you know.

**If `law` is `null` or missing, ask once** with your agent's structured question tool (`AskUserQuestion` in Claude Code; otherwise a plain-text question listing the options), multi-select, before anything
else — and record the answer in `.ai-eng-kit` → `law` and as `Data protection law:` in PRD Constraints:

> "Where are the people whose data this product holds? This decides which data-protection law I assess against."
> - **EU / Germany** (GDPR / DSGVO)
> - **Switzerland** (DSG)
> - **Somewhere else** — name it; I'll cover the structure and hand the specifics to a lawyer there

A Swiss company with EU customers, or a German one with Swiss customers, usually needs **both** — say so
when the product description suggests it, rather than letting them pick one by habit.

## Two modes
- **`/dsgvo`** (no argument) → the whole project: what data it holds overall, where it lives, which services process it, what is missing at project level.
- **`/dsgvo PROJ-X`** → one feature spec: what this feature adds, on what footing it is lawful, which acceptance criteria it needs.

Run it at `/write-spec` and `/architecture` time for anything touching people's data, and once at project level before `/deploy`.

## The stance (ask once, then remember)
On the first run, ask the user how much data-protection work they want to carry. Use the structured question tool (or a plain-text question) and offer these three, in plain language:

- **Lean** — a small MVP, few users, nothing sensitive. Cover the basics, keep friction low.
- **Standard** — a real product with user accounts, aimed at the public. The usual duties, documented.
- **Strict** — sensitive data, employee data, business with public bodies or larger companies, or you simply want it airtight.

**Record it** in `docs/PRD.md` under Constraints as one line: `Data protection stance: lean | standard | strict`. Every later run reads it from there and does not ask again. `/refine` may change it.

### The stance controls effort, never obligations
This is the part that matters. The stance decides **how much you document and how often you speak up**. It does **not** decide what the law requires — that follows from the facts: which data, whose, where it is stored, who it is shared with.

So when the facts outrun the stance, say so, clearly and once, without nagging:

> "You chose *lean*, which normally means I keep this short. But this feature stores health information, and that is a special category under Art. 9 — the rules there don't scale with project size. This one needs proper attention regardless."

Never quietly apply strict rules to a lean project, and never quietly skip a hard requirement because the user picked lean. Name the conflict and let them decide with open eyes.

## Workflow

### 1. Read the facts
Never assess from the feature name. Read, in this order:
- `docs/PRD.md` — what the product is, who the users are, the recorded stance, the `Data protection law:`, `Hosting:`, `Data region:` and `Environment strategy:` lines under Constraints
- `docs/law/<value>.md` for every value in `.ai-eng-kit` → `law` — the concrete rules you assess against
- `docs/data-model.md` — the entities and **who owns / can see each one**; this is your best single source
- The feature's `spec.md` (feature mode) or every deployed and planned spec (project mode)
- `design.md` where it exists — retention, access rules, third-party integrations
- `docs/privacy.md` if it already exists — what was recorded before

**Then read what the project actually does, not only what it documented.** Specs describe intent; the code shows which companies really receive data. This matters most when the project was built before this skill existed, where the documents will simply be silent:

- **The dependency manifest** — whatever this project uses (`package.json`, `composer.json`, `requirements.txt`, `go.mod`, `Gemfile`; `.ai-eng-kit` → `stack.packageManager` says which). Every SDK is a service that may see personal data: database and auth clients, payment providers, error trackers, analytics, mail and SMS clients.
- **The example env file** — the **variable names** name the services even without values. Read only the example: the real env file holds secrets, is permission-blocked, and you never open it.
- **Where this project configures its clients** — `src/lib/` in a kit-scaffolded project, elsewhere whatever the project's own structure is.
- **Server-side code and API routes** — outbound calls to third-party endpoints.
- **The schema** — which tables really exist, and whether row-level access rules are on. Where the schema lives is in the backend pack; in a project the kit did not scaffold, ask rather than assume a path.

A dependency the documents never mention is a finding in itself: someone integrated a service, and nobody wrote down that it processes personal data.

### 1b. Ask what the project doesn't say
After reading, you will usually still be missing things — always in a retroactive run, often in a new one. **Ask instead of assuming.** Use the structured question tool (or plain text), ask only what you genuinely could not determine, and say why you're asking:

- **Where is it hosted?** Which provider, and in which region does the data physically sit? Not in the PRD → ask. This decides third-country transfers and belongs in `docs/PRD.md` → Constraints as `Hosting:` and `Data region:`.
- **Which external systems is it connected to?** Payment, mail, analytics, error tracking, AI APIs, CRM, imports from other tools. List what you found in the code and ask what's missing — the user knows about integrations that live in a dashboard rather than in the repo (a Zapier scenario, an embedded chat widget, a tracking pixel in the marketing page).
- **Is personal data processed outside the app?** Does anything get exported, does a colleague pull it into Excel, does an AI API see user content, does a support tool receive it? This is where the leaks nobody documented sit.
- **Who is the controller (Verantwortlicher)?** The company or person behind the product — needed for `docs/privacy.md`, and often simply never written down.

Present what you already know so the user only has to correct and complete, rather than recite:
> "From the code I can see: a Postgres database, Stripe (payments), Sentry (error tracking) and the Claude API. Three things I can't tell from here — which region your database runs in, whether anything is connected outside the repo (analytics, a chat widget, an automation), and whether any of this data leaves the app, for example as an export or into a support tool?"

**Write the answers down** — into `docs/privacy.md` (processors) and the missing Constraints lines in `docs/PRD.md`. Asked once, recorded; the next run reads them instead of asking again. If the user doesn't know an answer, record it as an open point rather than guessing.

### 2. Identify the personal data
For each entity or field the scope touches, decide what it is. Be concrete — name the field, not the category:

- **Personal data** — anything that identifies a person directly or indirectly: name, email, IP address, user ID tied to a person, device identifiers, location, photos, free-text fields where users will inevitably write about themselves.
- **Sensitive data** — health, biometrics, genetics, ethnicity, political opinion, religion, trade union membership, sex life or orientation, criminal matters; **the law pack has the exact list for this jurisdiction** (the Swiss list is wider: it adds social-assistance measures and administrative proceedings). These carry much stricter rules and are the single most common thing founders underestimate. A "notes" field on a therapy-booking app is health data whether it was designed to be or not.
- **Children's data** — the age and the test differ by law (the pack says); a product that will obviously attract minors needs a plan either way.
- **Not personal data** — genuinely anonymous or aggregate data. Pseudonymised data (a random ID that you can still resolve back to a person) **is** personal data. Say so when the user assumes otherwise.

If there is no personal data anywhere in scope, say exactly that and stop. That is a complete, correct result — do not manufacture findings.

### 3. Lawfulness — per processing purpose, the way this law frames it
For each purpose, say **why this processing is lawful** — and use the frame of the law that applies, because the two frames are opposites:

- Under the **GDPR** processing is prohibited unless a **legal basis** applies: name one per purpose (contract, consent, legal obligation, legitimate interest — `docs/law/gdpr.md` has the list, the conditions and the classic mistakes).
- Under the **Swiss DSG** processing is permitted unless it **violates the person's personality**: ask whether the purpose is what the person would expect, whether sensitive data or high-risk profiling is involved (then express consent), and whether an objection stands — `docs/law/dsg.md` walks through it. Do not invent an "Art. 6 basis" for a Swiss-only product; there is none to name.
- Under **both**, do the GDPR exercise — it is the stricter one — and note where the DSG adds a duty (naming export countries, express consent for high-risk profiling).

Whatever the frame: **consent**, where it carries a purpose, is informed, specific, freely given and as easy to withdraw as to give — pre-ticked boxes and cookie walls are not consent under either law. **Statutory retention** (Germany: 8 years for invoices and accounting records since 2025-01-01, 10 for books and annual accounts — § 147 AO, § 257 HGB; Switzerland: 10 years, Art. 958f OR) overrides a deletion request for the affected records, and the user must be told that.

Flag the classic mistakes when you see them: analytics or a newsletter riding on "it's part of the service", one blanket consent covering several unrelated purposes, a catch-all "legitimate interest" — or, the Swiss-specific one, a GDPR consent banner copied in where information plus opt-out was the rule.

### 4. Turn duties into acceptance criteria
This is the core of the skill. Do not write legal prose — write things `/build` can implement and `/qa` can verify. Propose them in the spec's AC format, **in the project's working language** (`CLAUDE.md` → Key Conventions), so they join the AC → Task → Test chain like any other requirement and don't stand out as the one half-translated section of the spec:

- **Deletion** — English: "Given a logged-in user, when they delete their account, then their profile data and posts are removed within 30 days; invoices under a statutory retention duty remain and the user is told so." · Deutsch: "Angenommen ein eingeloggter Nutzer, wenn er sein Konto löscht, dann werden seine Profildaten und Beiträge innerhalb von 30 Tagen entfernt; gesetzlich aufbewahrungspflichtige Rechnungen bleiben und er wird darüber informiert."
- **Access / export** — the user can obtain their data, in a machine-readable form where the law grants portability (the DSG grants it more narrowly than the GDPR — the pack says when).
- **Rectification** — the user can correct their data.
- **Information** — a privacy policy reachable from every page, naming what the law requires it to name (under the DSG that includes the countries data is exported to).
- **Consent** where consent carries a purpose — recorded, timestamped, withdrawable, and the withdrawal actually stops the processing.
- **Retention** — every entity gets a deletion rule, not an implicit "forever". "We keep it until the account is deleted" is a valid rule; silence is not.
- **Data minimisation** — challenge every field: is it needed for the stated purpose? The cheapest data-protection measure is not collecting the field. Say which fields you would drop.
- **Security** — encryption in transit and at rest, access limited at the data layer. Most of this is already the kit's default; confirm rather than repeat.
- **Response deadline** — access and deletion requests are answered within the law's deadline (a month under the GDPR, 30 days under the DSG); an AC that says how is worth more than a policy that says so.

**Cite the article beside each AC from the law pack** (`Art. 17 GDPR`, `Art. 25 DSG`) — it lets the user or their lawyer check you, and it tells `/write-spec` which law the criterion serves.

Hand these to the user as proposed ACs. **They go into the spec via `/write-spec` or `/refine` — you never edit `spec.md` yourself.**

### 5. Check the stack (this project's specifics)
These come up in every project built with this kit and are worth checking explicitly. Base each one on what you established in Steps 1 and 1b — where you still have no answer, say **"not determined"** rather than assuming the good case. "Probably in the EU" is not a finding; "I couldn't determine the region, please check it here" is.

- **Where the data physically sits.** Inside the jurisdiction or a country it treats as adequate — for an EU audience that usually means a Frankfurt region; for a Swiss audience Switzerland or the EU (the EU is on the Swiss adequacy list). **With most providers the region is fixed when the project is created and cannot be changed afterwards without migrating the whole database**, so this is a before-launch question, not a later one. Read `stack.backend` and the matching `docs/stacks/backend-*.md` for what this project's provider does; where neither answers it, ask. If the project is already on a non-EU region, say so plainly: fixable now, expensive later.
- **Auftragsverarbeitungsvertrag (AVV / Data Processing Agreement, Art. 28).** Every service that touches user data on the project's behalf needs one. Build the list from *this* project — its `stack` entries, its dependencies, its configuration — not from a default set. In a kit-scaffolded project that is typically the database provider, the host and error tracking; in someone else's project it is whatever they actually use. These are usually a checkbox or a downloadable document in the provider's dashboard; you list them, the user signs them.
- **Cross-border transfers.** Providers outside the adequate countries — US-based ones in particular — need a transfer mechanism: the EU-US Data Privacy Framework under the GDPR, the Swiss-US DPF under the DSG, otherwise standard contractual clauses. Worth naming, not worth agonising over — but the user should know which of their providers are US companies, and under the DSG the export countries have to be **named in the privacy policy**.
- **Error tracking.** Error trackers capture request data, and that regularly includes personal data — emails in URLs, form contents, user IDs. Scrubbing must be switched on deliberately, and it is off by default in most of them; see `docs/production/error-tracking.md` for the obligation and the framework pack for the wiring.
- **Analytics and cookies — as this law requires, not as habit dictates.** Under the GDPR / TDDDG anything non-essential needs consent *before* it loads; a banner that fires the tracker on page load regardless is the single most common finding in German audits. Under the Swiss DSG information plus an opt-out is enough (Art. 45c FMG). Both recorded → consent first, it satisfies both.
- **Privacy policy and legal notice.** A privacy policy is required under both laws as soon as personal data is processed. The legal notice differs: Germany's **Impressum** (DDG) is its own obligation; Switzerland requires identity and contact details for e-commerce (UWG). Flag them as pre-launch items; the user needs a lawyer or a reputable generator, not you.

### 6. DPIA threshold — do they even need one?
Do not write a DPIA. Just answer whether one is likely required, and say what triggers it. The shape is the same under both laws — extensive automated evaluation or profiling of people, sensitive data at scale, systematic monitoring of public space, new technology at scale — but the **triggers, the lists and who gets consulted differ**: the GDPR has supervisory-authority blacklists, the DSG has none and instead requires consulting the EDÖB when a high risk remains. Take the trigger list from `docs/law/<value>.md`.

If two or more indicators apply, tell the user a DPIA is likely required and that it belongs with a lawyer or their data protection officer / advisor. If none apply, say so — most small MVPs need none, and saying that clearly is genuinely useful.

### 7. Maintain `docs/privacy.md`
Keep the running record of what this product does with personal data. It is not a legal document; it is the honest overview the user will need the first time a customer, an auditor, or a supervisory authority asks — and it maps closely onto the record of processing activities (Art. 30 GDPR; Art. 12 DSG, from which small Swiss companies are mostly exempt — keep it anyway, it is the document that answers the first question anyone asks).

Add or update one row per processing purpose — a purpose, not a table: "run user accounts" is a purpose, "the profiles table" is not. Record which data, whose, why, on what footing it is lawful (the legal basis under the GDPR; the expectation-or-justification under the DSG), how long, and which external services see it. Update the entry when a feature changes it; never let it describe a state the app has outgrown.

**If `docs/privacy.md` does not exist yet, create it.** Projects scaffolded before this skill existed won't have it — `update` refreshes skills but never touches `docs/`. Write it with these sections, in this order:

1. A header noting the applicable law(s), the stance, the controller (Verantwortlicher), and the last review date, plus the line that this is an engineering document and not a legal filing
2. **Processing activities** — table: Purpose | Data | Whose | Legal basis | Retention | Processors involved
3. **Sensitive data** — listed separately so nobody overlooks them, or "none"
4. **Processors** — table: Service | What it processes | Region | DPA signed | Outside the adequate countries?
5. **Data subject rights** — table: Right | Legal reference | How this product delivers it, with the response deadline of the applicable law noted (the article numbers come from the law pack)
6. **Open points** — checkboxes for what is unresolved
7. **For a lawyer / Datenschutzbeauftragter** — questions needing a human, each with enough context to be asked without re-explaining the product

### 8. Report
Structure the output in three parts, in this order:

1. **What I found** — the personal data in scope, plainly named, with why each purpose is lawful under the law(s) recorded — and which law each finding comes from, when there are two.
2. **What to build** — the proposed acceptance criteria, ready to hand to `/write-spec` or `/refine`.
3. **What needs a human** — the questions only a lawyer or DSB can answer, each with enough context that the user can actually ask it. Be specific: "ask whether your retention period for X is defensible given Y", not "consult a lawyer about retention".

Close every run with the boundary, in one line, without drama:

> "This is an engineering review, not legal advice — a lawyer or your Datenschutzbeauftragter has the final word."

## Important
- **Never edit `spec.md` yourself.** Propose ACs; `/write-spec` and `/refine` own the contract.
- **Never invent findings.** A project with no personal data, or a feature that only touches the user's own already-covered account data, is a short and correct report.
- **Never scare.** The audience is a founder, not a defendant. State risk in terms of what to do next, not what could go wrong in court.
- **Never let the stance suppress a hard requirement** — name the conflict instead (see above).
- Plain language throughout, but keep the legal terms of the applicable law alongside the English ones — and use *that* law's words: Auftragsverarbeiter / AVV / Datenschutzbeauftragter under the GDPR, Auftragsbearbeiter / Bearbeitung / Datenschutzberater / EDÖB under the DSG (the vocabulary tables in `docs/law/`). Those are the words that will appear in any letter the user receives.
- Cite the article when you make a claim, with the law it belongs to (Art. 6(1)(b) GDPR, Art. 25 DSG, § 26 BDSG) — it lets the user or their lawyer check you.
- Country specifics (who must appoint a data protection officer, employee data, retention periods, who gets fined) are in the law pack — read them there rather than from memory, because that is where a German-trained instinct goes wrong on Swiss ground.

## Checklist
- [ ] Applicable law(s) read from `.ai-eng-kit` → `law` (or asked once and recorded there and in PRD Constraints), and the matching `docs/law/*.md` read — or the specifics handed off where no pack matches
- [ ] Stance read from `docs/PRD.md` (or asked once and recorded there)
- [ ] PRD, data model, and the in-scope spec(s) read before judging
- [ ] Code and config read too — `package.json`, `.env.local.example` (never `.env.local`), `src/lib/`, outbound calls, migrations — so undocumented integrations surface
- [ ] What the project doesn't say was **asked**: hosting + region, external integrations, processing outside the app, controller — and the answers written into `docs/privacy.md` / PRD Constraints
- [ ] Anything still unknown reported as "not determined", never assumed to be fine
- [ ] Every personal-data field named concretely; sensitive data called out explicitly, against the pack's list
- [ ] Lawfulness stated per purpose in the frame of the applicable law — a legal basis under the GDPR, the expectation-or-justification test under the DSG — with the reason it fits
- [ ] Duties translated into proposed acceptance criteria in the spec's format
- [ ] Retention rule proposed for every entity that stores personal data
- [ ] Stack checked against *this* project: where the data physically sits, a DPA for every processor actually in use, cross-border transfers, error-tracking scrubbing, non-essential tracking handled the way the applicable law requires
- [ ] DPIA threshold answered either way
- [ ] `docs/privacy.md` created or updated
- [ ] Conflicts between stance and facts named out loud
- [ ] Report split into: found / to build / needs a human
- [ ] No compliance verdict given, and the boundary stated at the end

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
> "Assessment done. [N] things to build, [M] questions for a lawyer.
> - Run `/refine PROJ-X` to add the proposed acceptance criteria to the spec — then they're built by `/build` and verified by `/qa` like any other requirement.
> - `docs/privacy.md` is updated.
> This is an engineering review, not legal advice."

If nothing was found:
> "No personal data in scope here — nothing to assess. I'd run this again when you add accounts, payments, or anything users type about themselves."

## Git Commit
```
docs(PROJ-X): Add data protection assessment and privacy record

- Personal data and lawfulness documented in docs/privacy.md
- N acceptance criteria proposed for the spec
```
