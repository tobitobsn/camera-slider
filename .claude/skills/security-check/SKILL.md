---
name: security-check
description: Non-destructive security check of your LIVE app - HTTPS, security headers, login-protected routes, no exposed secrets, and whether the database itself keeps private data private. Read-only and safe to run against production. Run after /deploy and periodically.
argument-hint: "optional production URL"
user-invocable: true
---

# Security Check

## Goal
Verify the deployed app's security posture without touching or harming it. Run a set of read-only, non-destructive checks against the live site — is it HTTPS-only, are the security headers actually live, do protected pages really require login, is anything secret leaking to the browser, and — the big one — can an anonymous visitor read data that should be private. Report in plain language with a clear severity and the exact fix. Safe to run against production, and worth repeating periodically — a live app's security isn't one-and-done.

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

- **HTTPS, security headers, protected routes, secrets in client bundles, credentials in URLs** → these are
  properties of any web app and apply unchanged, whatever built it.
- **The data-layer access check** → the concrete steps come from `docs/stacks/backend-<value>.md`. Where there is no pack for this backend, find how this project
  enforces per-user access and check *that*, read-only. Report "not checked, and here is why" rather than
  silently dropping the most important test in the list.
- **`platform` is not `web`** → most of this does not apply. An MCP server's surface is its tool scope,
  what its tool results can inject, and what secrets they leak; a mobile or desktop app's is storage and
  transport — plus, for desktop, what the installer and the updater trust (signing, the update URL).
  Say plainly which checks you skipped and why, and do not report a green result for a surface you never
  looked at.

## Safety rules (non-negotiable)
- **Read-only / non-destructive only.** Never write, delete, fuzz, brute-force, or load-test. No active attacks — those belong in `/qa` against the **test** environment, never against production. (Aggressive scanning of cloud-hosted apps can also violate your host's terms of service.)
- **Never read `.env*` files.** Everything you need is public: the production URL, and whatever key this stack designs to ship to the browser anyway. Get them from the user or the live site — never from secret files.
- **Smoke test, not a full audit.** This catches the common, high-impact misconfigurations — not everything. For a real adversarial test, use `/qa` against staging, or a professional pentest.

## Before Starting
1. Confirm the **production URL** (from `## Deployments` in `features/INDEX.md`, or ask).
2. Note whether the app has a **database** at all (skip the data-layer check if not) and which tables should be user-private — from `design.md`, and from the schema wherever this project keeps it (the backend pack names the path).
3. Identify which **routes/pages are meant to require login** (from the feature specs).

## Checks

### 1. HTTPS & transport
- The site loads over HTTPS, and plain HTTP redirects to HTTPS.
- `Strict-Transport-Security` (HSTS) header is present.

### 2. Security headers (verify on the LIVE url)
Fetch the live response headers and confirm the four `docs/production/security-headers.md` requires are actually present: `X-Frame-Options` (or a CSP `frame-ancestors` directive), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`. Flag any of those missing. Then note `Content-Security-Policy` and `Permissions-Policy` as an **observation**, not a finding: the guide treats CSP as a second step after launch, so its absence is a recommendation — but a CSP whose `script-src` carries `'unsafe-inline'` *is* a finding, because it looks like protection and is not. Flag any required header missing — hosts sometimes strip or override headers, so check the **live URL**, never the config file that is supposed to set them.

### 3. Login-protected routes
For each route that should require auth, request it **without a session** → it must redirect to login or return 401/403, never render the protected data. Flag any protected page that loads for an anonymous visitor.

### 4. No secrets in the browser
- Inspect the live client bundle and network responses for anything that looks like a **server** secret — a database service/admin key, a payment provider's secret key, or any private/`SECRET` value. A *public* key being visible is **expected and fine** — most stacks have one that is designed to ship to the browser, and the framework pack names how it is marked. A server secret being visible is **CRITICAL**.
- Check API responses don't leak sensitive fields (password hashes, other users' emails, internal data you didn't mean to expose).

### 5. Data-layer access rules (the big one)
The check: **as an anonymous visitor, can you read data that should be private?** Application code is one gate; this asks whether the database itself is the second one. It is the most valuable check here, because a database that answers a stranger directly does not care what the app's routes do.

How to run it depends on the backend — `docs/stacks/backend-<value>.md` has the concrete steps. Where there is no pack, look in the project's data layer first (ORM configuration, policies, query scopes) and only then ask — and do not guess a client library, a key name or an endpoint.

**Not every database is reachable from outside — and then this check does not apply.** A MySQL or Postgres behind Laravel, Rails, Django or Spring answers only the app server: there is no public key and nothing a visitor could query directly. Say so in those words — *not applicable, the database is not exposed* — instead of asking the user for a credential that does not exist. The same question is then answered by check 3 (do the app's own routes refuse a stranger?) and by `/qa`'s authorization test (user X requesting user Y's data).

The shape is the same everywhere:
- Use only a credential a visitor genuinely has (a public/publishable key from the live bundle, or an unauthenticated session). Ask the user to paste it if you need it — **never read it from an env file.**
- Try to read a table or collection that should belong to one user.
- Expected: 0 rows or permission denied — the data layer is doing its job.
- ⚠️ **CRITICAL** if it returns other users' rows: the access rules are missing or misconfigured, and the data is readable by anyone holding a key that is public by design.
- **Read only — never insert, update or delete.** Report the table and the exact fix, routed through `/build`.

### 6. Rate limiting / abuse (light, non-destructive)
Confirm sensitive endpoints (login, signup, password reset) appear to have some protection — but do **not** actually hammer them. A few normal requests at most; note if there's clearly no limit, don't try to trigger one.

Verify **presence**, not resistance — you check that the guards exist, `/qa` is where they get attacked (on test, never here):
- Is there a **CAPTCHA** on the live login/signup form? Read the markup for an hCaptcha or Turnstile widget.
- Does the app's own code throttle its auth routes? Look for the rate-limit call on the login/signup path, wherever this project keeps its server code — the live site can't show you this, the repo can.
- Does a failed login **reveal whether the account exists**? One deliberate attempt with an address that certainly doesn't exist, compared against the wording for a wrong password. Two requests, not a campaign.

If the only protection is the auth platform's built-in per-IP limit, say so as a finding, not a pass: it does not stop a distributed attack or credential stuffing, and it covers nothing the project wrote itself. Route the fix through `/refine` + `/build`, never fix it here.

### 7. No credentials in URLs (read-only)
Inspect the login/signup form markup on the live site (don't submit real credentials). A `<form method="get">` — or a form with no server-side submit target and no JS submit handler — would put `email`/`password` straight into the URL on submit (`/login?password=…`), leaking them to history, logs, and `Referer`. Flag a credential-carrying GET form as **CRITICAL**; the framework pack names this stack's correct POST path, and the fix is routed through `/build`.

## Write the Report
Persist the result to `docs/production/security-report.md` so there's a dated record, not just chat output. The file has two parts that behave differently:
- **Latest** — the full result of *this* run; **overwrite** it every time.
- **History** — one compact row per run; **append** a row, keeping all prior rows.

Steps:
1. Read `docs/production/security-report.md` if it exists, to preserve the History table. If it doesn't exist, create the file.
2. Replace the `## Latest` section with this run's full result (URL, date, passed checks, findings with severity + fix).
3. Append one row to the `## History` table: date · status · critical/medium/low counts. Never rewrite or drop existing history rows.
4. Use today's real date (run `date +%F` if unsure).

Structure to follow:
```markdown
# Security Check Report

_Last run: YYYY-MM-DD · <status emoji + one-line summary>_

## Latest — YYYY-MM-DD · <production URL>

✅ Passed: <short list of what passed>

### Findings
- 🔴 CRITICAL — <what> → <fix + which skill closes it>
- 🟡 MEDIUM — <what> → <fix>
<or: "No findings — no common misconfigurations detected.">

## History
| Date | Status | Critical | Medium | Low |
|------|--------|----------|--------|-----|
| YYYY-MM-DD | ⚠️ | 1 | 1 | 0 |
```
The History table is append-only: each run adds its row beneath the previous ones (newest at the bottom), so the file stays a slim, glanceable trail while `## Latest` always holds the current detail.

## Output
Present the same result in chat (and tell the user it was saved to `docs/production/security-report.md`) — grouped by severity, each finding with its fix and the skill that closes it:

```
🔒 Security Check — https://your-app…

✅ Passed
   HTTPS + HSTS · security headers present · /dashboard requires login · no secrets in bundle

⚠️ Findings (2)
   🔴 CRITICAL — RLS: an anonymous visitor can read the `profiles` table (12 rows)
      → Enable Row Level Security on `profiles` + add an owner-only policy. Fix via /build, then redeploy.
   🟡 MEDIUM — Missing header: Content-Security-Policy is not present on the live site
      → Add it per docs/production/security-headers.md, then redeploy.

Summary: 4 passed · 1 critical · 1 medium
```

## Important
- **Always save the dated report** to `docs/production/security-report.md` (Latest overwritten, History appended) — chat output alone isn't a record.
- **Read-only and non-destructive** — report and route fixes through the proper skills (RLS / headers / auth fixes go through `/build` → `/deploy` again).
- Plain language, no jargon — the audience is a non-coder. Explain in one sentence why each finding matters.
- A clean result means "no common misconfigurations found", **not** "provably secure" — say so.
- Never read secret files; never run active attacks against production.
- Cheap ongoing complement: remind the user that `npm audit` flags known vulnerabilities in their dependencies — worth running now and then.

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
Always mention the saved report (`docs/production/security-report.md`).
- All clear:
  > "No common security misconfigurations found on the live site — saved to `docs/production/security-report.md`. (This is a smoke test, not a full audit.) Re-run after any change that touches auth, data access, or headers."
- Findings:
  > List fixes most-severe first; note they're in the report. For code/RLS/header fixes: "Run `/build` to fix, then `/deploy` again, then `/security-check` to confirm."
