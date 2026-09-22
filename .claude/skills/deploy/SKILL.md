---
name: deploy
description: Take features to production safely - pre-flight checks, database promotion, the merge to main, post-deploy verification, error tracking and security headers. Ships step-by-step procedures for Vercel and Hostinger and asks for any other target. Pass a feature (e.g. PROJ-2) to ship just that one, or run it with no argument to launch all ready features together as one release.
argument-hint: "optional: feature to deploy (e.g. PROJ-2) — omit to launch all ready features"
user-invocable: true
---

# DevOps Engineer

## Goal
Get features to production safely — environment setup, pre-deploy readiness checks, error tracking, and security headers — and don't ship until production is actually wired. A broken deploy hurts users more than a delayed one. Works for shipping **one** feature or **launching all ready features together** as a single release.

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

This is the skill that diverges most, so check before you read any further:

- **`platform` is not `web`** → read this one first, because it decides whether the hosting question is
  even meaningful. Step 2 and the HTTP checks in Step 4 assume an app that lives behind a URL, and that is
  not what going live means here: a **mobile** app is built and submitted to a store, where someone else
  reviews it before users see it; a **desktop** app is signed and usually notarized, then shipped either through a
  store or through its own update mechanism; an **mcp** server or a **cli** is published to a package registry; a browser **extension** is packaged and submitted to its store (Chrome Web Store, AMO), where it is reviewed as well. The kit
  ships no procedure for any of them — **ask how a release reaches users in this project and follow that**, and
  treat the review or approval wait as part of the process (see the human-gated bullet below).
  **Record their answer in `stack.deploy`** the same way Step 2 does for a web host (`eas`, `fastlane`,
  `npm`, whatever they name it), so the next deploy already knows and nobody is asked twice.
  Everything else in this skill applies unchanged, and it is most of it: resolving the launch set, the QA
  gate, the branch stock-take, the merge, the release tag, and `features/INDEX.md` as the single record of
  what went live.
- **`platform: web` and `stack.deploy` is `null`** → nobody has chosen a host yet. Before the first deploy
  that is the normal state, not a fault: settle it with the user in Step 2 and **record it in
  `.ai-eng-kit`**, so no later deploy has to ask again.
- **`stack.deploy` names a host with no `docs/stacks/deploy-<value>.md`** → the kit has no procedure for it.
  Ask how this project goes live and follow *that* path. Do not translate another host's steps into a guess
  about theirs.
- **`stack.backend` is `null` or has no `docs/stacks/backend-<value>.md`** → you have no promotion procedure.
  The principle in Step 2b still holds in full — the production database must carry the schema you built and
  tested, previewed in plain language and promoted deliberately. Ask how they promote schema and follow it.
- **A human-gated release** (app store review, a change window, an approval) → treat the wait as part of the
  process and hand it off. Never report a release as done while it is queued for someone else's approval.
- **Nothing recorded about deployment at all** → stop here. Tell the user you do not know how this project
  goes live and ask. This is the one skill where improvising touches production.

What applies in **every** project: the pre-flight checks pass before anything ships, `features/INDEX.md` is
the single record of what went live, and writing to real data is confirmed by the user first — every time.

## Resolve the Scope (single feature vs. launch all)
Before anything else, decide **what** is being deployed. Never silently mass-deploy.

- **Argument given (`/deploy PROJ-X`)** → the **launch set** is exactly that one feature. Proceed.
- **No argument (`/deploy`)** → read `features/INDEX.md` and find every feature with status **Approved** (passed `/qa`, no Critical/High bugs) that isn't already **Deployed**. Then use the **AskUserQuestion tool** — never decide for the user:
  - **0 ready** → tell them nothing is ready to deploy (what's still in progress / needs `/qa`), and stop.
  - **exactly 1 ready** → confirm: "Deploy **PROJ-X – [name]** to production?"
  - **2+ ready** → offer: "**Launch all N together** as one release (PROJ-A, PROJ-B, …), or **pick one**?" If they pick one, the set is that single feature.
- If the user names features that are **not** Approved (still In Progress/In Review, or with open Critical/High bugs), **stop and list them** — let them choose: fix those first, or launch only the Approved subset. Never launch an unverified feature.

Everything below operates on **the launch set** — one or many. Where a step says "the feature," apply it to every feature in the set. The differences for a multi-feature launch are called out inline (one combined DB promotion, merge every branch, **one** release tag).

## Before Starting
1. Read `features/INDEX.md` to know what is being deployed (the launch set from "Resolve the Scope")
2. For **every** feature in the launch set, check QA status in its `features/PROJ-X-*/qa-report.md`
3. Verify no Critical/High bugs exist in any of those QA results
4. If a feature in the set hasn't been through QA, tell the user: "Run `/qa` on PROJ-X first before deploying" — and drop it from the set or stop, per their choice
5. **If the project has a database**, find out how its test and live environments are separated — it changes how the schema goes live (see "Promote the Database" below). In a kit-scaffolded project that is the `Environment strategy:` line in `docs/PRD.md` → Constraints, and `docs/stacks/backend-<value>.md` explains what each value means. No database → skip every database step in this skill.
6. **Web only:** read the **host** from `.ai-eng-kit` → `stack.deploy`. A `null` means it has not been chosen yet — you settle it in Step 2 and record it there. (A project deployed before this field was used may still carry a `Hosting:` line in `docs/PRD.md` → Constraints. If `stack.deploy` is `null` and that line exists, take the answer from there and record it — don't ask a question the user already answered.)

## Workflow

### 1. Pre-Deployment Checks
Run these with the project's own commands, from `.ai-eng-kit` → `commands`. A `null` there means nobody recorded that command — ask for it rather than skipping the check or guessing at `npm run build`.

- [ ] The project builds — `commands.build`
- [ ] Linting passes, where the project has it — `commands.lint`
- [ ] QA Engineer has approved every feature in the set (check each `features/PROJ-X-*/qa-report.md`)
- [ ] No Critical/High bugs in those reports
- [ ] **Every `[user]` task in each feature's `tasks.md` is ticked.** Those are settings in a provider's dashboard — a rate limit, a CAPTCHA, a sending limit — and they exist only where someone made them: a throttle set in the local `config.toml` does not reach the hosted project by itself. An open one is a stop, not a note; list it with its `where:` and wait. A feature with no `tasks.md` at all — reconstructed from code, or migrated from the Starter Kit — has nothing to tick here: skip it, and never report the missing file as a blocker. **`[user go-live]` tasks are the one exception:** they need the production URL or the host, so they are open here by design — Step 2 makes them, Step 4 verifies them. Collect them now; this pre-flight does not stop on them
- [ ] Every environment variable the release needs is documented, with dummy values, in the project's example env file (`.env.local.example` in a kit-scaffolded project)
- [ ] No secrets committed to git
- [ ] **If the project has a database:** the test environment's schema is up to date and captured as versioned migration files — wherever this project keeps them (`docs/stacks/backend-<value>.md` names the path). Promotion to production is Step 2b.
- [ ] **If the project has a database:** no already-shipped migration was edited after the fact. `git log -- <the migrations path>` shows changes to migrations that went live in an earlier release only if something went wrong — a shipped migration is frozen, and corrections are new files.
- [ ] All code committed and pushed to remote

### 2. Hosting Setup (first deployment only — `platform: web`)
> Not a web app? Skip this step. Read the `platform` bullet at the top and ask how a release reaches users here.
Three things have to exist at the host before anything can go live, whichever host it is. Confirm all three — a deploy that builds but has no configuration fails in production, not in the build log, which is the worst place to find out.

- [ ] **A build pipeline.** The host has to know how to build this project and when. Usually that means connecting the git repository once, so a push to `main` triggers a build and deploy.
- [ ] **Production configuration.** Every variable from the project's example env file, set at the host, with **production** values — never the test values from the local env file. Which of them are safe to expose to the browser is a framework question, not a host one: check `docs/stacks/framework-<value>.md` before pasting, because getting it wrong in this direction publishes a secret to every visitor.
- [ ] **A domain.** The host's default subdomain is fine to start with.
- [ ] **Production callbacks — every `[user go-live]` task in the launch set** (this one applies on every deploy that carries such a task, not only the first). Now the production URL exists, so what could not be made before can: register the webhook endpoint at the provider with the production URL, put the signing secret it returns into the host's environment as a **production** value (never the test one from the local env file), add the production redirect URI or allowed origin. Hand each over with its `where:` and wait; tick nothing yet — the box is Step 4's, once the callback was seen to arrive.
- [ ] **Layers** (`.ai-eng-kit` → `layers`): how a pipeline, worker or CLI beside the app goes live — a schedule, a job runner, a container, a package — is not something the hosting packs describe. Ask how this layer reaches production today, record the answer as a hand-off with its `where:`, and never guess a release path for it.

**Which host?** `stack.deploy` in `.ai-eng-kit` (see Before Starting). If it is still `null`, ask the user which host they use — the kit ships procedures for **Vercel** and **Hostinger**, and any other answer is fine too; it just means you follow their path instead of a pack. Then **write that answer into `stack.deploy`**, keeping the JSON valid and changing nothing else. It gets recorded once, by the step that asks for it, so every later deploy already knows.

**The concrete steps:** if `docs/stacks/deploy-<value>.md` exists, follow it — it carries this host's panel paths, its build settings and its quirks. If there is none, **walk the user through the three points above in their host's own interface** and ask where each lives. Do not translate another host's menu names into a guess about theirs; a wrong path in a dashboard wastes their time and teaches them not to trust the next instruction.

### 2b. Promote the Database
The code is going live, so the production database must carry the same schema you built and tested. **Skip this step entirely if no feature in the set touches a database.**

**Promote once for the whole launch set**, not per feature — one promotion covering every schema change the set introduced.

Four things hold no matter what database this project uses, and they are the reason this step exists at all:

- **Preview before you touch production.** Establish exactly which changes are pending, then say in plain language what they do to the live database ("adds a `tasks` table with an owner-only access policy; nothing existing is deleted"). Flag anything destructive — dropped columns or tables, type changes, backfills. Both halves are required: the technical diff is the evidence, the plain-language summary is what the user actually consents to.
- **The go-ahead is explicit, and it is the last stop before real data changes.** Ask, and wait for a clear yes. Some agents also gate the command themselves; never rely on that gate being configured.
- **A migration that has already shipped is frozen.** Corrections are new migrations, never edits to an old one. Production has recorded that the old file ran, so an edited version is skipped there and applied locally — and the two drift apart with nothing warning you.
- **Confirm afterwards.** Check that production really carries the tables and policies you expect. "It probably worked" is not a verification.

**Anything interactive belongs to the user.** Steps that open a browser or prompt for a password cannot be answered by you — hand them off and wait, rather than running them and leaving the user staring at a hanging terminal.

**The concrete procedure:** read `stack.backend` from `.ai-eng-kit`. If `docs/stacks/backend-<value>.md` exists, follow it — it carries this database's commands, its migration ledger, and the environment strategies. If there is none, **ask the user how schema reaches production in this project** and follow that. Never translate another stack's commands into a guess about theirs; a wrong command against a production database is not a mistake the user can see coming.

### 3. Merge to `main` & Deploy
Each feature was built and tested on its own branch (`feat/PROJ-X-name`). Merging into `main` is the **go-live moment** — your host auto-deploys whatever lands on `main`. You perform the merge(s), but only after the user confirms. **Push `main` only once, after all branches in the set are merged**, so the launch is a single build.

#### First: take stock of every branch
Do this **before** merging anything. The user has been branching per feature since `/build`, so branches accumulate — and a branch nobody looked at is the one place where finished-looking work quietly isn't live. List them and match each against `features/INDEX.md`:

```bash
git branch --list 'feat/*'                  # local feature branches
git branch -r --list 'origin/feat/*'        # and on the remote
git branch --no-merged main --list 'feat/*' # the ones carrying unmerged work
```

Classify every branch you find:

| Branch | INDEX says | What it means | What to do |
|---|---|---|---|
| unmerged | in the launch set | normal — this is what you're about to ship | merge it (below) |
| unmerged | In Progress / In Review / Approved | probably live work — but say so and ask | **list it and ask** |
| **unmerged** | **Deployed** | ⚠️ the feature counts as live but this branch never reached `main` | **stop and ask** |
| merged | Deployed | done and shipped | offer to delete it (Step 6) |
| merged | not yet Deployed | odd — reached `main` outside `/deploy` | flag it, check INDEX is right |
| any | no matching PROJ-X | leftover experiment or abandoned work | ask what it is |

**Show the user every open branch and ask — do not decide silently.** INDEX tells you what a feature's status is, not whether the user is at this moment working in that branch. A feature can sit at "Approved" while they are already building the next thing on top of it. Guessing here costs someone their unfinished work, so lay it out and let them answer:

> "Besides what we're shipping, these branches are still open:
> - `feat/PROJ-4-notifications` — PROJ-4 is In Progress, 12 commits. Still working on it?
> - `feat/PROJ-6-export` — PROJ-6 is Approved but not deployed, 3 commits. Ship it with this release, or leave it?
> - `feat/spike-charts` — no feature in INDEX matches this. What is it?
>
> Anything you're still using stays exactly as it is — I won't merge or delete it."

The default for every open branch is **keep it untouched**. Only a branch the user explicitly releases may be merged or deleted, and only in the steps below. Silence is not permission: if the user doesn't answer about a branch, it stays.

The bolded row is the one that needs a real answer. A feature marked **Deployed** with unmerged commits means one of two things, and only the user knows which:

> "`feat/PROJ-3-comments` still has 4 commits that never made it into `main`, but PROJ-3 is marked as deployed. Either something didn't actually go live back then, or this branch is abandoned work you decided against. Which is it? I won't merge it without you telling me."

Never merge such a branch on your own initiative — it may contain work that was deliberately dropped. Never delete it either.

If nothing is open beyond the launch set, say so in one line and move on.

1. Confirm readiness: every feature in the set passed QA (no Critical/High) and the database was promoted (Step 2b). If not, stop.
2. **Explain in plain language and get an explicit go-ahead** — this is the irreversible "it's live" step:
   > Single: "Merging `feat/PROJ-X-name` into `main` puts this feature live. Shall I go ahead?"
   > Multiple: "Merging all N branches into `main` and pushing once launches PROJ-A, PROJ-B, … together. Shall I go ahead?"
3. After the user confirms, merge **every** branch in the set into `main`, then push once:
   ```bash
   git checkout main
   git merge feat/PROJ-A-name        # repeat for each feature in the set
   git merge feat/PROJ-B-name
   git push origin main              # one push → host builds and deploys the whole app
   ```
   - If any merge reports **conflicts**, do NOT force it — stop, explain in plain language, resolve with the user, then continue with the remaining branches.
   - For features built directly on `main` (no branch), there's nothing to merge.
   - `git push` is confirmed with the user every single time. That confirmation is a second, independent gate next to the go-ahead in step 2, not a formality to click away — never work around it, and never assume your agent's own approval settings will stop you.
4. Some hosts also offer a manual deploy straight from the working tree instead of relying on the push. If `docs/stacks/deploy-<value>.md` names one, it is there — but the release the team can reason about later is the one that came from `main`.
5. Watch the build in the host's dashboard until it goes green.

### 4. Post-Deployment Verification
**What you can check yourself depends on `probe.kind`.** The list below is written for `http` — a running app behind a URL. On `simulator` or `none` you cannot verify a live release from here at all: say so plainly, hand the whole verification to the user, and record what they report. Never present "I couldn't check" as "verified".

You have **no browser**. Everything below is split by who can actually establish it — never tick a box in the second group yourself, and never report "verified" for something you asked the user about but got no answer to.

**What you verify yourself, over HTTP against the production URL:**
- [ ] The site responds: `curl -sSI https://<url>` → 200, and HTTPS (an http:// request redirects to https://)
- [ ] The deployed pages render server-side: fetch each new route and confirm the expected content is in the HTML, not an error page or an empty shell
- [ ] API routes answer: call each route the launch set added and check the status and JSON shape
- [ ] Protected routes actually protect: request them **without** a session and confirm a redirect to login or a 401 — a 200 here is a Critical finding, stop the release
- [ ] The database is reachable: a route that reads data returns data rather than a 500
- [ ] No obvious server error: no 500s across the routes you exercised

**What only the user can confirm** — ask for these explicitly, in plain language, and wait:
> "I've checked from the outside: the site is up, the pages render, the API answers and the protected routes stay protected. Three things I can't see from here — could you look?
> 1. Open the app and log in once. Does the whole flow work end to end?
> 2. Click through the new feature the way a user would.
> 3. Open your host's dashboard and check the deploy and runtime logs for errors."

Record their answer. If the user doesn't check, that is fine — but write it down as **not verified** rather than assuming it works. Anything they report as broken goes into the rollback decision below, not into a "we'll fix it later" note.

**When the launch set carries `[user go-live]` tasks**, add one line per task to that request: what to trigger from the provider's side (send a test event from the webhook dashboard, log in once through the production redirect) and what they should see (a 200 in the host's logs, the order marked paid). A go-live task is ticked in `tasks.md` only on their confirmed answer; one they cannot show arriving stays open and goes into the rollback decision below, not into a note.

> Want the login flow checked automatically next time? That is what `/e2e-tests` is for. Run it against a staging URL rather than production, though — a real browser test creates real accounts and real data.

### 5. Production-Ready Essentials

Five things belong in place before a product carries real users. The *reason* for each is universal; the setup guides below were written for the kit's own stack, so treat them as the concrete example and skip what the project does differently.

- **Error tracking** — you learn about breakage from your tooling, not from a user email. See [error-tracking.md](../../../docs/production/error-tracking.md).
- **Security headers** — served on every response. Where they are configured is a framework question (`docs/stacks/framework-<value>.md`); the header set itself is in [security-headers.md](../../../docs/production/security-headers.md). A host can strip them, so `/security-check` verifies them live rather than in the config.
- **A performance check** against the project's own target. See [performance.md](../../../docs/production/performance.md).
- **Database indexes and access patterns**, if the project has a database. See [database-optimization.md](../../../docs/production/database-optimization.md).
- **Rate limiting — required if the app has a login, optional otherwise.** If users can log in, confirm before going live that failed attempts are actually throttled and that automated signup is blocked. A live login with unlimited guesses is the cheapest way in that exists, and it looks exactly like a working login from the outside. Whatever the platform throttles for you is the floor, not the answer — anything you wrote yourself gets no protection from it. See [rate-limiting.md](../../../docs/production/rate-limiting.md).

**Before going live with personal data**, walk the user through these — they are legal obligations under the law(s) recorded in `.ai-eng-kit` → `law` (`docs/law/<value>.md` has the specifics; `null` → ask, `/init` records it), not nice-to-haves. Run `/dsgvo` (no argument) for the full picture; the minimum to check here:

- [ ] **Privacy policy (Datenschutzerklärung)** reachable from every page — required as soon as any personal data is processed, which includes server logs
- [ ] **Legal notice** — Germany's **Impressum** (DDG) is its own obligation, independent of data protection, for commercial sites; Switzerland requires identity and contact details for e-commerce (UWG). The law pack says which applies
- [ ] **AVV / DPA signed** with every processor — every third party that touches user data on the project's behalf: the database provider, the host, error tracking, anything else in `stack`. Usually a checkbox or download in the provider's dashboard. List the ones *this* project actually uses and have the user do it
- [ ] **Non-essential tracking handled the way the applicable law requires** — under the GDPR / TDDDG consent *before* anything non-essential loads (loading the tracker on page view and asking afterwards is the most common finding in German audits); under the Swiss DSG information plus opt-out; both recorded → consent first
- [ ] **Error tracking scrubs personal data** before sending — see `error-tracking.md`
- [ ] **Data region** matches what's in PRD Constraints. For an EU audience the data belongs in the EU, and with most providers the region is fixed when the project is created and **cannot be moved later** — so this is checked before launch, not after

State the boundary when you present this: it is an engineering checklist, not legal clearance — a lawyer or Datenschutzbeauftragter confirms the rest.

Once the headers and tracking are in place, run **`/security-check`** against the live URL — a non-destructive check that the deployed app is actually secure: HTTPS, headers live, protected routes require login, no server secret reached the browser, and the database's own access rules hold. Re-run it after any later change that touches auth, data access, or headers.

### 6. Post-Deployment Bookkeeping
- Update `features/INDEX.md` — the **single** record of deployment: set **every** feature in the launch set to **Deployed**, and add one line under `## Deployments` (create the section if an older INDEX lacks it): the release tag · today's date · the production URL · the feature IDs. Do **not** copy any of this into `spec.md`: the contract carries no status or deployment metadata, and a second copy only drifts.
- Create **one** git tag for the launch and push it:
  - Single feature: `git tag -a v1.X.0-PROJ-X -m "Deploy PROJ-X: [Feature Name]"`
  - Multiple features (one release): a release tag covering them all, e.g. `git tag -a v1.0.0 -m "Launch: PROJ-A, PROJ-B, … "`
  - `git push origin <tag>`
- **Tidy up the branches that are now done.** Every branch in the launch set is merged and live, so it has no reason to exist any more — and a shrinking branch list is what keeps the next deploy readable. Offer it, never assume:
  > "PROJ-2 and PROJ-5 are live and their branches are fully merged. Shall I delete `feat/PROJ-2-…` and `feat/PROJ-5-…`? The work stays in `main` — only the labels go."
  - Only after the user agrees: `git branch -d feat/PROJ-X-name` (lower-case `-d` refuses to delete anything unmerged — never use `-D`), then `git push origin --delete feat/PROJ-X-name` for the remote copy.
  - **Never touch** branches outside the launch set, unmerged branches, anything the user said they are still working on in Step 3, or anything they did not answer about. Only what they explicitly released.
- Suggest `/cleanup` for the features that just shipped — now that they're live, their open questions are closed and their fixed bugs are history. It proposes everything before touching a file.

## Common Issues
Every one of these is host- or stack-specific, so the answer lives in the matching pack rather than
here: `docs/stacks/deploy-<value>.md` for anything about the host, `docs/stacks/backend-<value>.md`
for anything about the database. Read the failing build's own log first — the host's error message
beats any remembered checklist.

- **Builds on your machine, fails at the host** — usually a Node/runtime version difference, or a
  build-time dependency sitting in the dev-only section of the manifest.
- **Environment variables not available at runtime** — usually set in the wrong environment at the
  host, missing the framework's public prefix, or simply not redeployed. Env changes almost never
  apply to an existing deployment retroactively.
- **The app can't reach its database** — credentials in the host's panel, access rules, or a
  provider that pauses idle projects.

If neither pack covers it, say what the log says and ask — do not work through another stack's
checklist in the hope that one item transfers.

## Rollback Instructions
If production is broken:
1. **Immediate — put the last good release back.** Nearly every host keeps previous deployments and
   can promote one of them; `docs/stacks/deploy-<value>.md` names how. Where there is no pack, ask —
   this is not a step to improvise while production is down.
2. **Fix locally:** debug it, build (`commands.build`), commit, push.
3. The host deploys the fix the same way it deployed the break.

⚠️ **The rollback puts the old code back — it does not put the old database back.** Migrations applied in Step 2b stay applied; there is no "un-push." Say this out loud instead of letting the user assume the app is fully restored:
- The old code now runs against the **new** schema. That is usually fine (added tables and columns are ignored by code that doesn't know them) and usually broken if the migration **removed or renamed** something the old code still reads.
- Never try to undo it by editing or deleting the migration file — production has already recorded that it ran. If the schema genuinely has to go back, that is a **new** corrective migration, written deliberately, tested against the test environment, and promoted like any other. Reverting schema can destroy data, so it needs the same plain-language preview and go-ahead as the original promotion. `docs/stacks/backend-<value>.md` has the commands.
- This is why the order in Step 2b matters: destructive schema changes are the ones you cannot walk back, so flag them *before* the push, not after.

## Full Deployment Checklist
_Say the report and the next step in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._

- [ ] Scope resolved (one feature, or all ready features) and confirmed with the user — never a silent mass-deploy
- [ ] Every feature in the launch set passed `/qa` (no Critical/High); unverified features excluded
- [ ] Pre-deployment checks all pass — `[user]` tasks all ticked; `[user go-live]` tasks collected, not stopped on
- [ ] **Database (skip if the project has none):** promoted once for the whole launch set, per the procedure in `docs/stacks/backend-<value>.md` — or, with no pack, per what the user said their process is
- [ ] The pending change was previewed **in plain language** and explicitly confirmed before production was touched; anything destructive was named
- [ ] Every interactive step (a browser login, a password prompt) was handed to the user, not run at them
- [ ] Production was checked **afterwards** and really carries the change
- [ ] No shipped migration was edited or deleted to "fix" anything; corrections went in as new files
- [ ] Branch stock-take done before merging: every `feat/*` branch matched against INDEX, **every open one shown to the user and asked about** — nothing merged or deleted that they didn't explicitly release, and no answer treated as "keep"
- [ ] Any unmerged branch on an already-**Deployed** feature raised with the user and resolved by them
- [ ] All feature branches in the set merged into `main` after explicit user go-ahead; pushed once; no unresolved merge conflicts
- [ ] Branches of the launched features offered for deletion (merged only, `-d` never `-D`), local and remote
- [ ] The release actually shipped — the host's build went green, or the platform's equivalent completed
- [ ] **`probe.kind: http`:** production verified over HTTP (200, HTTPS, pages return their content, API answers, protected routes still protected, no 500s)
- [ ] **Any other `probe.kind`:** what you could not check from here was said plainly and handed to the user — never recorded as verified
- [ ] The browser- and dashboard-only checks were **asked of the user**; their answer recorded — or written down as not verified if they didn't check
- [ ] Every `[user go-live]` task made in Step 2 with production values and confirmed arriving in Step 4, then ticked — none ticked on faith
- [ ] Error tracking set up
- [ ] Security headers configured, where the framework configures them (`docs/stacks/framework-<value>.md`)
- [ ] `/security-check` run against the live URL — no critical findings
- [ ] Performance checked against the project's own target
- [ ] `features/INDEX.md`: every launched feature set to Deployed, and one line under `## Deployments` (tag · date · URL · features) — the single record; nothing copied into `spec.md`
- [ ] One release tag created and pushed (covers the whole launch set)
- [ ] User has verified production deployment

## Git Commit
Single feature:
```
deploy(PROJ-X): Deploy [feature name] to production

- Production URL: https://your-production-url
- Deployed: YYYY-MM-DD
```
Launching multiple features as one release:
```
deploy: Launch [v1.0.0] — PROJ-A, PROJ-B, … to production

- Production URL: https://your-production-url
- Deployed: YYYY-MM-DD
```
