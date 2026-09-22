<!-- Write this report in the project's working language (memory file → Key Conventions). It is read by the product team. -->
# QA Test Results Template

This is the content of the standalone file `features/PROJ-X-*/qa-report.md` (a regenerated test report, no longer appended to the spec):

> **Filling this in:** every box starts **unchecked**. A box is a claim about reality — never tick one you did not actually verify in this run. Each `[x]` MUST carry evidence on the same line (the command you ran, the test file, the file:line you inspected). Anything you could not verify is `[!] NOT VERIFIED` **with the reason** — never leave it blank and never tick it "because it looks right". An unverified check is not a pass.

```markdown
# QA Test Results

**Tested:** YYYY-MM-DD
**App URL:** [`probe.baseUrl` from `.ai-eng-kit` — or "not runnable here (`probe.kind`: …)", in which case every runtime AC below is `[!] NOT VERIFIED` until a human test is recorded]
**Tester:** QA Engineer (AI)
**Scope:** [`full` on a first run · `re-verification — git diff --stat <commit>..HEAD: <changed production files>` after a bug fix; carried-over results below are marked `unchanged since <date>, not re-run`]

> Legend: `[x]` verified in this run (evidence required) · `[ ] BUG` verified as broken · `[!] NOT VERIFIED` not checkable in this run (reason required)

### Acceptance Criteria Status

#### AC-1: [Criterion Name]
- [ ] Sub-criterion passed — evidence: [test file / command / file:line]
- [ ] BUG: Sub-criterion failed (describe what went wrong)

#### AC-2: [Criterion Name]
- [ ] All sub-criteria passed — evidence: [test file / command / file:line]

### Edge Cases Status

#### EC-1: [Edge Case Name]
- [ ] Handled correctly — evidence: [test file / command / file:line]

#### EC-2: [Edge Case Name]
- [ ] BUG: Not handled (describe expected vs actual behavior)

### Security Audit Results

_Each line needs evidence or a NOT VERIFIED reason. `/qa` has no browser — anything that requires DevTools, real rendering, or a second browser engine is NOT VERIFIED here by definition._

- [ ] Authentication: Cannot access without login — evidence: [curl of the protected route / middleware file:line]
- [ ] Authorization: Users cannot access other users' data — evidence: [cross-user request / RLS policy file:line]
- [ ] Input validation: XSS / injection attempts blocked — evidence: [payload sent + response / validation file:line]
- [ ] Rate limiting: Excessive requests handled — evidence: [repeated-request run] · mark `[!] NOT VERIFIED — not implemented (optional for MVP)` if there is none
- [ ] Brute force (features with a login/signup/password reset): repeated wrong passwords against one account get refused — evidence: [attempts fired + where it started refusing] · **no throttling at all is a High BUG here, not a NOT VERIFIED**
- [ ] No account enumeration: unknown email and wrong password give the same message — evidence: [both responses]
- [ ] Credentials never appear in the URL after form submit — evidence: [form file:line, method + handler]
- [ ] No secrets in the client bundle — evidence: [grep over the build output for server-side values; the framework pack names which prefix marks a public one]
- [ ] BUG: [Security issue description]

### E2E Tests
_Optional layer — written by `/e2e-tests` for critical core journeys only._

- Status: **not run** (run `/e2e-tests` for critical flows)

<!-- When /e2e-tests has run, replace the line above with one entry per journey, e.g.:
- [x] Sign-in → dashboard (covers AC-1, AC-3) — `tests/PROJ-1-auth.spec.ts` — passing
-->

### Not Verified In This Run

_Everything marked `[!]` above, collected — so nobody mistakes "not checked" for "fine". Delete the ones that don't apply; if the list is genuinely empty, write "none"._

- [!] Cross-browser rendering (Chrome / Firefox / Safari) — `/qa` runs without a browser; covered only by `/e2e-tests`
- [!] Responsive layout at 375px / 768px / 1440px — needs a real viewport
- [!] Browser console / network tab inspection — needs DevTools
- [!] [each `[user go-live]` task — the production webhook endpoint, redirect URI or host secret — made and verified by `/deploy`; the AC was verified against the test-environment twin above]
- [!] [anything else you could not check, with the reason]

### Bugs Found

#### BUG-1: [Bug Title]
- **Severity:** Critical | High | Medium | Low
- **Steps to Reproduce:**
  1. Go to [page]
  2. Do [action]
  3. Expected: [what should happen]
  4. Actual: [what actually happens]
- **Screenshot:** [if visual bug]
- **Priority:** Fix before deployment | Fix in next sprint | Nice to have

### Summary
- **Acceptance Criteria:** X/Y passed, Z not verified
- **Bugs Found:** N total (C critical, H high, M medium, L low)
- **Security:** X/Y checks verified, Z NOT VERIFIED — [list the unverified ones]
- **Production Ready:** YES / NO
- **Recommendation:** [Deploy / Fix bugs first]

> "Production Ready: YES" means *no Critical/High bugs* — it does **not** mean everything was checked.
> Any NOT VERIFIED item above is still open and needs a human or `/e2e-tests`.
```
