# Security Rules

These hold in every project, whatever it is built with. Where a rule needs a concrete mechanism — a
validator, a throttle, a place to configure headers — the matching guide in `docs/stacks/` carries
it. **A missing pack is never a reason to skip a rule.** It is a reason to ask how this project does
it, and to say so plainly rather than inventing an answer.

## Secrets Management
- NEVER commit secrets, API keys, or credentials to git.
- Real secrets live in the project's local environment file, which is git-ignored.
- Every variable the project needs is documented, with a dummy value, in its example env file.
- **Know which values reach the browser.** Most frameworks expose an environment variable to
  client-side code only when its name follows a particular convention — `docs/stacks/framework-*.md`
  names the one this project uses. A server secret that accidentally follows that convention is
  baked into the deployed JavaScript and served to every visitor from the first page load. Check the
  name before you set the value, not after.

## Handling the real env file (don't fight the permissions)
- **Never read, edit, or create the project's real environment file** (`.env.local`, or whatever it
  is called here) — it holds the user's private keys and is permission-blocked. If a write is
  denied, do **not** retry it; that is by design.
- **The example env file is the one you may read and write.** When a feature needs a new variable,
  add a **placeholder** line there with a dummy value, so it is documented.
- **To put a real value into the real env file, ask the user in chat** — state the exact key and
  where to get the value ("add `X=…` — it's the API URL from your provider's dashboard"). The user
  pastes it themselves. Never try to write the real value yourself.

## Input Validation
- Validate ALL user input **on the server**, against a schema, at the boundary where it arrives
  (Zod in a kit-scaffolded project; otherwise whatever the project already uses).
- Never trust client-side validation alone — it is a convenience for the user, not a control.
- Sanitize data before it reaches the database.

## Authentication
- Always verify authentication before processing a request, in the request path itself — not only
  in the UI that leads there.
- **Enforce access at the data layer as well**, not only in application code: row-level policies,
  scoped queries, whatever this database offers. Two independent checks, because sooner or later one
  of them gets bypassed.
- **Rate-limit anything that checks a credential — login, signup, password reset, magic link, OTP,
  invite codes.** An unlimited login is a working login that anyone can guess their way into, so this
  is part of building auth, never a later hardening step.
  - Whatever the platform throttles for you is **the floor, not the answer.** Those limits are
    typically per IP: they do not stop a distributed attack or credential stuffing, and they cover
    nothing you wrote yourself.
  - Your own throttle is keyed per **IP and per account**, with a CAPTCHA on public forms.
  - The concrete mechanism lives in the stack packs (`docs/stacks/`) and in
    `docs/production/rate-limiting.md`. If neither covers this project, ask — never quietly skip it.
- **Never reveal whether an account exists** — the same message for an unknown address and for a
  wrong password, and comparable response times where it matters. Enumeration is what turns a
  brute-force attempt into an efficient one.
- **Auth forms must submit via POST, never GET.** A form left to submit natively puts every field in
  the URL. How a framework does a POST submit differs (`docs/stacks/framework-*.md`); that it must be
  one does not.

## Sensitive Data in URLs
- NEVER put credentials, tokens, session IDs, or PII in a URL or query string — they leak into
  browser history, server logs, and `Referer` headers.
- Forms carrying sensitive fields (password, email + password, tokens) must POST, never GET.
- A URL like `/login?email=…&password=…` is always a bug: it means a form submitted as a native GET
  instead of through the framework's POST path.

## Security Headers
These are HTTP, not framework-specific — every web project serves them, only the place they are
configured differs (`docs/stacks/framework-*.md`, and `docs/production/security-headers.md` for what
each one does):

- `X-Frame-Options: DENY` (or a CSP `frame-ancestors` directive)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: origin-when-cross-origin`
- `Strict-Transport-Security` with `includeSubDomains`

A host can strip or override headers, so they are verified against the live URL, not against the
config file.

## Code Review Triggers
- Any change to **data-access rules** (row-level policies, permission checks, scoped queries)
  requires explicit user approval.
- Any change to the **authentication flow** requires explicit user approval.
- Any **new environment variable** must be documented in the example env file.
