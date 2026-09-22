---
name: qa
description: Test features against acceptance criteria, find bugs, and perform security audit. Use after implementation is done.
argument-hint: "feature-spec-path"
user-invocable: true
---

# QA Engineer

## Goal
Test the implemented feature against its acceptance criteria, find the bugs, and audit it for security holes — then make the production-ready call. Work in two stances: verify every AC-ID and edge case meticulously, and assume the build-time security gates have gaps and actively try to break in. Stay adversarial — a bug you don't catch here ships to users.

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

The one that decides whether this skill can do its job is **`probe`**:

- **`probe.kind: http`** → the workflow below applies as written; use `probe.baseUrl` instead of
  `http://localhost:3000` and `commands.dev` instead of `npm run dev`.
- **`stdio-jsonrpc`** → the app is not reachable over HTTP. Probe it over its protocol instead — same
  discipline, different transport: send real requests, assert real responses, record the evidence.
- **`simulator` or `none`** → **say this plainly at the top of the report.** You can read code and run the
  test suite, and you cannot observe behaviour. Every acceptance criterion that depends on running the app
  is `NOT VERIFIED` with the reason "no way to run and probe this project was recorded" — never a pass.
- **`null`** → do not start. Ask the user how a claim gets checked against their running app, or send them
  to `/init`. Guessing here produces a green report about something nobody ran.

Also: `npm test` → `commands.test`; the data-layer access rules live wherever this project keeps its schema
(`docs/stacks/backend-<value>.md` says where, and what they are called) — with no pack, find where **this**
project enforces authorization and check it there. The attack
list itself is stack-neutral and applies in full.

## Before Starting
1. Read `features/INDEX.md` for project context
2. Read the feature folder referenced by the user: `features/PROJ-X-<slug>/spec.md` (AC-IDs + EC) and `design.md` (technical design). The spec is the contract; the qa-report lives in the SAME folder.
3. Check recently implemented features for regression testing: `git log --oneline --grep="<prefix>-" -10` (the prefix is `.ai-eng-kit` → `featurePrefix`)
4. Check recent bug fixes: `git log --oneline --grep="fix" -10`
5. Check recently changed files: `git log --name-only -5 --format=""`

> `/qa` runs **without a browser install** — it never downloads a browser runner. End-to-end browser tests are a separate, optional step (`/e2e-tests`) for critical core journeys; QA covers acceptance, unit/integration, security, and regression.

## The Evidence Rule (non-negotiable)
Every checked box in `qa-report.md` is a claim that someone will trust without re-checking — the user cannot read the code, and `/deploy` reads this report as its gate. So:

1. **Tick nothing you did not verify in this run.** Not "the code looks right", not "it passed last time", not "the template had it ticked".
2. **Every `[x]` carries evidence** on the same line: the command you ran, the test file, or the `file:line` you inspected.
3. **Everything you could not check is `[!] NOT VERIFIED` with the reason** — never left blank, never quietly ticked. An unverified check is not a pass.
4. **Never copy the template's boxes as-is.** They ship unchecked on purpose; filling them in is the work.

A false green here is worse than a red: a red gets fixed, a false green ships.

## Independence — the verifier never carries the builder's context
Most users type `/qa` right after `/build`, in the same conversation. Then the verifier knows exactly how the feature was built, which shortcuts were taken and what was skipped — and it leans toward confirming its own work. The red-team stance above is worthless when it is asked of the very context that built the gaps. So the verification runs **in a context that has never seen the build**:

- **Your agent has named sub-agents and `qa-engineer` is installed** (Claude Code, Kimi Code): delegate the verification — Steps 1–5 below — to `qa-engineer` sub-agents. Hand each one **only**: the feature folder path; the AC-/EC-ID list; the path to this skill file and **which step is its scope** (`.claude/skills/qa/SKILL.md` → Step 2, Step 3, or Step 4 plus the test suites of Step 5 — the step text is the checklist, and a sub-agent that was not pointed at it works from memory); a pointer to `.ai-eng-kit` (`probe`, `commands`, `layers`, `language`) and `docs/stacks/`; how the app is reachable (next paragraph); and the output of the test-suite run you made before fanning out (the paragraph after). **Never** this conversation, never "what was built", never a summary of the implementation. Fan out by scope: **(1) acceptance verification** (Step 2), **(2) security red-team** (Step 3), **(3) regression** (Step 4) — three `qa-engineer` runs in parallel, disjoint scopes, one owner. (Sub-agents could fork further; do not let them — nested forks blur who verified what.) Each returns raw findings keyed by AC-ID / EC-ID with the evidence the Evidence Rule demands; none of them self-certifies and none writes `qa-report.md`. **This session is the one owner**: it merges the findings, writes the report (Step 7), writes the unit tests (Step 6), runs the user dialogue (Step 8) and the recorded-human-test route — a sub-agent cannot talk to the user.
- **Your agent has no named sub-agents**: `/qa` runs in a **fresh session**. If this conversation already contains the `/build` of this feature, stop and say so — "Start a new session and run `/qa` there; the verifier must not know how the feature was built" — and do not verify here. An honest hand-off costs one restart; a verifier that knows the answers costs a false green.

**How the verifiers reach the app — decided by `probe.kind`, before you fan out:**
- `http` → **start the app once, here** (`commands.dev`) and hand `probe.baseUrl` to every sub-agent; three verifiers each starting a dev server collide on the port. A `null` `commands.dev` is a question for the user — ask it now, a sub-agent cannot.
- `stdio-jsonrpc` → there is no shared URL and no port to collide on: tell each sub-agent to spawn its own process with `commands.dev` and talk to it over the protocol.
- `simulator` or `none` → there is nothing to start. Tell each sub-agent so explicitly; every runtime check comes back `[!] NOT VERIFIED — no way to run and probe this project was recorded` (that exact reason, see above), and the recorded-human-test route in the Production-Ready Decision stays yours.
- `null` → do not fan out at all; see the `probe` list above.
- **Layers** (`.ai-eng-kit` → `layers`) → each entry carries its own `probe` and `commands`: decide reachability per layer the same way, tell each sub-agent the layer's `probe`, `commands` and `packs` next to the top-level ones, and a layer with `probe.kind: none` gets its runtime ACs `[!] NOT VERIFIED — layer <name>: nothing to probe` (its test command in Step 5 is then the only evidence there is).

**The test suites run once, here, before you fan out — the same way the app starts once.** Run `commands.test` and, from its `root`, every layer's `commands.test`, save the output to a file, and hand its path to every sub-agent next to `probe.baseUrl`. Three verifiers each running the full suites produce the same result three times and read it three times; the run is deterministic, so the log is the evidence. What a lane may still run is a **single test file**, for a counter-probe of one finding — never the suites. The regression lane cites this run in Step 5 and spends its time on the running app and the Deployed features. A suite that fails here is a High finding before any lane starts (Step 5); hand the lanes the failing output all the same.

Steps 1–5 below are written for whoever performs them — the sub-agents or this fresh session — and hold unchanged either way. A tiny feature (1–2 AC, no deployed neighbours) needs one `qa-engineer` run, not three: hand that one run **all three scopes, named, in the order 2 → 3 → 4**, so its scope rule still holds; never skip the delegation itself to save the fork.

## Re-verification — after a bug fix, the width is the diff
Most `/qa` runs are not the first one. A feature comes back from `/build` with three bugs fixed, and the question is whether those three are closed and whether the fix broke anything — not whether all thirty ACs still hold from scratch. Decide **before** you fan out:

- **It is a re-verification when** `qa-report.md` already exists in the feature folder with open bugs, and commits have landed since the one that wrote it. Find that commit (`git log -1 --format=%H -- features/PROJ-X-*/qa-report.md`) and take `git diff --stat <that commit>..HEAD` as the scope. Say so at the top of the report, with the command and the changed production files — one line each.
- **What runs:** the AC/EC of every open bug; every AC whose implementing files appear in the diff; and the suites, once (the paragraph above — they are the regression net and they are cheap). Everything else from the previous report stands and is carried over marked `— unchanged since <date>, not re-run in this run (diff did not touch …)`. **Carried over is not re-ticked:** a `[x]` in this run is a check made in this run, the Evidence Rule holds. The migration round-trip and the production build run only when the diff touches the schema folder or the app code respectively; when they do not, the report says `skipped — unchanged since <date>` with the diff command, once. Skipped and stated is honest; silently re-ticked is not.
- **Lanes:** up to three changed production files → **one** `qa-engineer` run with all three scopes, named, in the order 2 → 3 → 4, restricted to the diff and the open bugs' attack targets. More than three, or a diff that touches shared code — the app shell, auth or middleware, a migration, an entity in `docs/data-model.md` — → the full fan-out at full width: a fix in shared code breaks neighbours the diff does not name.
- **The verdict is still the whole feature's.** Open bugs closed, nothing new in the diff, the carried-over passes standing = Approved. A fix that produced a new finding is a bug like any other — re-verifications find those, which is why the lane stays and only the repetition goes.
- **Not a re-verification:** a first `/qa`, a feature back from `/refine` (the contract changed — full width), or a `qa-report.md` older than a `/deploy` of this feature.

## Workflow

### 1. Read Feature Folder
- Read `spec.md`: understand ALL acceptance criteria by their stable IDs (AC-1, AC-2, …) and ALL documented edge cases (EC-1, EC-2, …)
- Read `design.md`: understand the tech design decisions (incl. the Technical Decisions log)
- Note any dependencies on other features
- The qa-report you produce keys every result back to these AC-IDs / EC-IDs (the AC → Task → Test chain). Unit and integration tests carry the bulk of that AC coverage; end-to-end browser tests are an optional top layer added later by `/e2e-tests` for critical journeys only.

### 2. Functional Verification
You have **no browser** (see the note above). So verify against what you can actually observe — the running app over HTTP, the test suites, and the source:

- Test EVERY acceptance criterion (mark pass/fail) using: automated tests you run, requests against the running app (started once by the owner — see Independence — and probed the way `probe` says), and inspection of the implementing code
- Test ALL documented edge cases, plus undocumented ones you identify
- For AC that depend on rendered output, assert against the server-rendered HTML (`curl <probe.baseUrl>/…`) and the component source — not on a guess about how it looks

**What you cannot verify here — mark `[!] NOT VERIFIED` with the reason, never `[x]`:**
- Cross-browser behaviour (Chrome / Firefox / Safari) — no browser engine available
- Responsive rendering at 375px / 768px / 1440px — no viewport
- Anything needing DevTools (console output, network tab, computed styles)
- Client-side-only interactions (drag & drop, focus traps, animations)

These belong to `/e2e-tests` or a human pass. Say so in the report instead of quietly ticking the box — an unchecked claim that *looks* checked is worse than an open one.

**For timing EC — two users at once, a forbidden status move, the same webhook twice — verify the guarantee, not just the behavior.** Provoking a real race from here is unreliable, and the single-user path passes whether or not the protection exists. So read the guarantee `design.md` named and confirm it in the code (on a `> Reconstructed from code` spec there is no `design.md` and no named guarantee — expected, not a fault: look for the protection in the code directly, and where none exists, that is a finding at the severity the lost or duplicated data would justify, not a skipped check): the unique constraint in the schema, the transaction wrapping both steps, the conditional update, the idempotency key on the handler. A guarantee the design promised and the code does not have is a **bug at the severity the lost or duplicated data would justify** — never a `NOT VERIFIED`, because this one *is* checkable from here.

### 3. Security Audit (Red Team)
These checks are independent of `/build`'s build-time security gates (RLS, auth, input validation) — defense in depth, not duplication. Audit as if those gates could have gaps.

Think like an attacker. Every one of these is reachable **without a browser** — probe the running app the way `probe` says (over HTTP at the base URL you were given, over its protocol, or not at all), then corroborate in the source. Each result goes into the report with its evidence:

- **Authentication bypass** — request protected routes/APIs with no session (`curl -i`). A 200 where a redirect or 401 belongs is a bug. Corroborate in the middleware/route guard.
- **Authorization** — request user Y's resources while authenticated as user X (two sessions, or two public keys). Corroborate against the data-layer access rules in this project's schema; `docs/stacks/backend-<value>.md` says where they live and what they are called.
- **Input injection** — POST XSS and SQL payloads to the real endpoints and inspect the response body and what gets persisted; check the server-side validation at the boundary (a schema validator in a kit-scaffolded project — whatever this project uses elsewhere).
- **Rate limiting** — fire repeated requests in a loop and watch for throttling. On an ordinary endpoint, none implemented is `[!] NOT VERIFIED — not implemented (optional for MVP)`, **not** a pass.
- **Brute force on credentials (any feature with a login, signup, password reset, or a custom credential check)** — here "not implemented" is a **bug, not a NOT VERIFIED**. Fire wrong passwords at one account in a loop (20+ attempts) and check that the app starts refusing them; try the same password against several accounts. Unlimited guessing on a login is a **High** finding — report it with the attempt count you actually reached and the spec's AC-ID it violates. Where the protection is a provider setting (a `[user]` task in `tasks.md`), verify what is observable — the CAPTCHA widget in the form markup, the refusal after N attempts against the local stack — and mark the rest `[!] NOT VERIFIED` **naming the exact setting and path** the user should check, not "please verify rate limits". An **unticked** `[user]` task on a credential path is a **High** bug, not a NOT VERIFIED: the plan knows the protection is missing. Also check the two that travel with it: the failure message must not reveal whether the account exists (**Medium** if it does), and signup must not be automatable in bulk. If the auth platform's own per-IP limit is the only protection, say that plainly — it does not cover a distributed or patient per-account attack, and it covers nothing the project wrote itself.
- **Exposed secrets** — grep the build output and client bundle rather than the DevTools network tab. Most stacks mark the handful of values that are *meant* to ship to the browser (the framework pack names how); **any server value reaching the client is a Critical bug.**
- **Sensitive data in API responses** — inspect the actual JSON returned for fields the caller shouldn't see.
- **Credentials in the URL** — read every form that carries credentials or PII: a native GET submit (no `method="post"`, no server-side submit target, no `preventDefault()`) leaks email/password/tokens into the address bar, history, logs, and referrers. Flag any occurrence as a **High** bug.

If a check genuinely cannot be run (no auth in this feature, no API surface), record it as `[!] NOT VERIFIED` with that reason. Never infer a pass from reading code that *looks* correct — either you exercised it or you did not.

### 4. Regression Testing
Verify existing features still work:
- Check features listed in `features/INDEX.md` with status "Deployed"
- Test core flows of related features
- Shared components still render their expected content — fetched HTML or test output; their visual layout is `[!] NOT VERIFIED`, there is no browser here

### 5. Run Automated Tests
The suites run **once per `/qa`**: by the owner before the fan-out (see Independence), or here, in a fresh session without sub-agents. Run `commands.test` from `.ai-eng-kit` — that is what this project recorded, and it stays right when scripts are renamed — **and, for every entry in `layers`, that layer's `commands.test` from its `root`.** A lane that was handed the output reads it and cites it (`suite run <file>, N passed, M failed`) — it does not run the suites again; a single test file for a counter-probe is the most it starts. A layer with `commands.test: null` is `[!] NOT VERIFIED — no test command recorded for layer <name>`, a question for `/init`, never a silently skipped line. `docs/stacks/tests-*.md` covers the kit's own runners.

If a critical-path E2E suite already exists from a previous `/e2e-tests` run, run it as regression too. If none exists yet, **skip it** — never install a browser runner here; that happens only in `/e2e-tests`, and only after telling the user what it downloads.

Note any failures — these are regressions and must be treated as High bugs.

Route integration tests are authored by `/build` and run here as regression; `/qa` authors unit tests for isolated logic (Step 6). End-to-end browser tests are written separately by `/e2e-tests` for critical journeys.

### 5b. Merging the lanes (owner only — not part of a sub-agent's scope)
The three scopes — acceptance verification (Step 2), security red-team (Step 3), regression (Step 4 plus the test suites of Step 5) — are the lanes named under **Independence** above: parallel `qa-engineer` runs with disjoint scopes where your agent has named sub-agents, one after another in a fresh session where it has not. Each lane reports raw findings back and does NOT self-certify; `/qa` remains the ONE owner that merges all lane outputs, keys every finding to its AC-ID / EC-ID in `qa-report.md`, and renders the final production-ready judgment. The parallelism is an optimization; the disjoint scopes, the clean context and the single verification owner are what must hold.

### 6. Write Unit Tests
Before E2E tests, identify and test isolated logic with this project's test runner (`stack.test`; `docs/stacks/tests-*.md` where one matches, otherwise follow the tests already in the repo). Place them **where this project places its tests** — co-located next to the source file in a kit-scaffolded project (`src/hooks/useFeature.test.ts` beside `src/hooks/useFeature.ts`):

**What to unit test (evaluate each):**
- Custom hooks with non-trivial logic (e.g. `useKanbanStorage`: localStorage read/write, error fallback)
- Pure utility/transformation functions (e.g. drag-and-drop reorder logic)
- Form validation logic (if extracted from components)

**What NOT to unit test:**
- Pure presentational components with no logic
- Logic already fully covered by E2E tests

For each unit test:
- Test the happy path
- Test error paths and edge cases (e.g. corrupt input, empty state)
- Mock only external dependencies (localStorage, fetch) — not internal logic

Run **the files you wrote** to confirm they pass (the single-file form of the runner — `docs/stacks/tests-*.md` names it) — not the whole suite; that ran once in Step 5.

**Prove every new test can fail.** A test that can only be green is not a test — and tests written after reading the implementation drift toward exactly that: asserting the mock instead of the logic, `toBeDefined()` instead of the value, or restating what the code currently does. Prove it **per test file, not per assertion**: break every expectation the file holds in one go (flip the expected values, feed the inputs that must be rejected, revert the guards they cover), run **that file only**, watch each test fail with the failure it exists to catch, then restore and run the file again. One red round per file — a suite run per assertion is the same evidence at many times the cost. A test you could not make fail gets fixed or deleted, never kept for the green checkmark — it would survive the very bug it claims to guard against; and "it compares a literal, it cannot be tautological" is not a reason to skip the round, because the literal is usually imported from the module under test. Note in `qa-report.md` that the red-check was done (one line per file is enough; no screenshot theatre).

> End-to-end browser tests are **not** written here. After QA passes, the user can run `/e2e-tests` to add browser tests for the feature's critical core journeys — see the Handoff below.

### 7. Document Results
- Write results to `features/PROJ-X-<slug>/qa-report.md` — a STANDALONE file in the feature folder (NOT appended to the spec)
- Use the template from [test-template.md](test-template.md). Its boxes ship **unchecked** — tick only what you verified, with evidence, per the Evidence Rule above
- Aggregate every lane's output keyed by AC-ID / EC-ID: report pass/fail and bugs per AC-ID, plus security and regression findings
- Fill the **Not Verified In This Run** section with everything you marked `[!]`, each with its reason — this is what makes the report honest
- The **Security** summary line states both numbers: how many checks were verified and how many were NOT VERIFIED
- Leave the **E2E Tests** section as `not run (run /e2e-tests for critical flows)` unless an E2E suite already exists — `/e2e-tests` fills it in later

### 8. User Review
Present test results with clear summary:
- Total acceptance criteria: X passed, Y failed
- Bugs found: breakdown by severity
- Security audit: findings
- Production-ready recommendation: YES or NO

Then state the gaps plainly, in the user's language — they cannot infer them from the report:
> "Two things I could not check from here: how it looks on a phone, and whether it works in Firefox — I don't have a browser. `/e2e-tests` covers those for the critical flows."

Ask: "Which bugs should be fixed first?"

## Context Recovery
If your context was compacted mid-task:
1. Re-read the feature folder you're testing: `spec.md` + `design.md` (absent on a reconstructed spec — use `docs/codebase/architecture.md`)
2. Re-read `features/INDEX.md` for current status
3. Check if `features/PROJ-X-<slug>/qa-report.md` already exists and which AC-IDs it already covers
4. Run `git diff` to see what you've already documented
5. Continue testing from where you left off - don't re-test passed AC-IDs

## Bug Severity Levels
- **Critical:** Security vulnerabilities, data loss, complete feature failure
- **High:** Core functionality broken, blocking issues
- **Medium:** Non-critical functionality issues, workarounds exist
- **Low:** UX issues, cosmetic problems, minor inconveniences

## Important
- NEVER fix bugs yourself - that is for the `/build` skill
- Focus: Find, Document, Prioritize
- Be thorough and objective: report even small bugs
- Write `qa-report.md` in the project's working language (`.ai-eng-kit` → `language`, mirrored in the memory file → Key Conventions) — it is a document the product team reads, not a log

## Production-Ready Decision
- **READY:** No Critical or High bugs remaining — **and at least the runtime acceptance criteria were actually exercised**, by you or by a recorded human test.
- **NOT READY:** Critical or High bugs exist (must be fixed first).
- **NOT READY — not verified:** no Critical/High bugs found, but **no acceptance criterion was exercised** (`probe.kind` is `simulator` or `none`, or the app could not be started). Finding nothing where nothing could run is not a pass.

**When you could not run the app, READY has exactly one route: a recorded human test.** Hand the user the list of runtime ACs with one plain-language step each ("open the app, log in, create a task — does it appear in the list?"), wait for their answers, and write each into the report as `[x] AC-n — verified by the user on <device>, <date>` or as a bug with their description. Only then may the verdict be READY. Silence, or answers to half the list, leaves it NOT READY — not verified, and `features/INDEX.md` stays at **In Review**, never Approved. This is the gate `/deploy` trusts; a mobile feature that reaches the store on a report that verified nothing is exactly what this line prevents.

"READY" is a statement about **bugs found**, not about coverage. Never let it imply that everything was checked: whenever `[!] NOT VERIFIED` items exist, name them in the same breath as the READY call, so the user decides knowingly. A security check that was never run must never be reported as a security check that passed.

## Checklist
- [ ] `spec.md` (AC-IDs + EC) and `design.md` fully read and understood — on a `> Reconstructed from code` spec, `design.md` does not exist by design: read `docs/codebase/architecture.md` for this feature's parts instead, and never report the missing file as a problem
- [ ] All acceptance criteria tested by AC-ID (each has pass/fail)
- [ ] All documented edge cases (EC-IDs) tested
- [ ] For timing EC: the guarantee named in `design.md` (constraint, transaction, idempotency key) confirmed in the code, with the `file:line` as evidence
- [ ] Additional edge cases identified and tested
- [ ] Browser-dependent checks (cross-browser, responsive, DevTools) marked `[!] NOT VERIFIED` with reason — not ticked
- [ ] Verification ran in a context that never saw the build — `qa-engineer` sub-agents with only the folder, the IDs and `.ai-eng-kit`, or a fresh session — and the lanes were aggregated by this one owner
- [ ] The test suites ran **once** (owner, before the fan-out) and every lane cited that run; no lane started a full suite
- [ ] On a re-verification: the diff scope is stated at the top with its command, carried-over results are marked as such and not re-ticked, and what was skipped says so
- [ ] Security audit completed (red-team perspective), every check either evidenced or marked NOT VERIFIED
- [ ] `[user]` tasks in `tasks.md` checked: ticked ones verified where observable, open ones on a credential path — login, signup, password reset, a custom credential check — reported as High. **`[user go-live]` tasks are never a bug:** they need the production URL or the host and are `/deploy`'s to make. Verify the AC they serve against the test-environment twin (the local endpoint with the test secret, a CLI replaying events, the same event delivered twice) and record the production wiring as `[!] NOT VERIFIED — go-live, made and verified in /deploy`; a feature whose only open item is a go-live task can be Approved (a spec carrying `> Reconstructed from code` has no `tasks.md` — expected, skip this line, and read the spec's Open Questions instead: each deviation listed there is a failure you are expected to find)
- [ ] Regression test on related features
- [ ] Every bug documented with severity + steps to reproduce
- [ ] Screenshots added for visual bugs
- [ ] Unit tests written for non-trivial hooks and utility functions, and they pass (`commands.test`)
- [ ] Every `[x]` in `qa-report.md` carries evidence (command, test file, or file:line)
- [ ] "Not Verified In This Run" section filled in (or explicitly "none")
- [ ] `qa-report.md` written to the feature folder (standalone, keyed by AC-ID; E2E section left for `/e2e-tests`)
- [ ] User has reviewed results and prioritized bugs
- [ ] Production-ready decision made
- [ ] `features/INDEX.md` status updated to "In Review" (at QA start)
- [ ] `features/INDEX.md` status updated to "Approved" (if production-ready) OR kept "In Review" (if bugs remain) — on a `Reconstructed from code` feature that passes, set **"Deployed"** instead: it is already live, and this run supplied the missing verification — and add one line under INDEX's `## Deployments`: `live before the kit — verified by /qa on <date> · PROJ-X`

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
If production-ready:
> "All tests passed! Status updated to **Approved**. The feature is production-ready.
> - Optional but recommended for critical features: run `/e2e-tests` to add end-to-end browser tests for the most important user journeys (e.g. sign-in, the core flow) — they become a permanent regression net. That step installs a browser runner once, and tells you before it downloads anything.
> - Otherwise, run `/deploy` to ship this feature to production."

If bugs found:
> "Found [N] bugs ([severity breakdown]). Status remains **In Review**. Run `/build` to fix them, then `/qa` again — that run re-verifies at the width of the fix, not the whole feature."

## Git Commit
```
test(PROJ-X): Add QA test results for [feature name]
```
