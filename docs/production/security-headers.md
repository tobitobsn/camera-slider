# Security Headers

Protect against XSS, clickjacking, MIME sniffing, and other common web attacks. Every web
project serves these; only the place they are configured differs.

> **Where the concrete setup lives.** The step-by-step wiring for this project's stack is in
> `docs/stacks/` — `framework-*.md` for anything that belongs to the framework, `backend-*.md`
> for anything that belongs to the database. This guide is the part that holds either way: what
> to do and why. If no pack matches this project, the *what* still applies — ask how this
> project does it rather than skipping it.

## What Each Header Does

| Header | Protection |
|--------|-----------|
| X-Frame-Options: DENY | Prevents your site from being embedded in iframes (clickjacking) |
| X-Content-Type-Options: nosniff | Prevents browsers from guessing content types (MIME sniffing) |
| Referrer-Policy | Controls how much URL info is sent to other sites |
| Strict-Transport-Security | Forces HTTPS connections |

## Verify After Deployment
1. Open Chrome DevTools
2. Go to Network tab
3. Click on any request to your site
4. Check Response Headers section
5. Verify all 4 headers are present

## Content-Security-Policy

CSP is the most powerful header against XSS and the easiest to get wrong. It is not in the set
above because it needs per-app testing — add it once the rest is live.

> ⚠️ **Never ship `script-src 'self' 'unsafe-inline'`.** `'unsafe-inline'` permits exactly the
> injected inline `<script>` that CSP exists to stop: it looks like protection while giving away
> most of it. It is a very common copy-paste from tutorials — treat it as broken wherever you
> find it.

The safe alternative is a **nonce**: a random token generated per request and attached to the
scripts your app legitimately renders, so anything injected by an attacker lacks the token and is
blocked. How a framework generates and threads that token is framework-specific — see
`docs/stacks/framework-*.md`.

**Roll it out safely, whatever the stack:**
1. Ship it as `Content-Security-Policy-Report-Only` first — the browser reports violations without
   breaking anything.
2. Click through the app, watch the console for violation reports, and fix what is genuinely yours.
3. Only then switch the header name to `Content-Security-Policy`.
