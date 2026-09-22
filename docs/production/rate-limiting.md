# Rate Limiting

Prevent abuse, credential guessing, and excessive API usage.

> **Where the concrete setup lives.** The step-by-step wiring for this project's stack is in
> `docs/stacks/` — `framework-*.md` for anything that belongs to the framework, `backend-*.md`
> for anything that belongs to the database. This guide is the part that holds either way: what
> to do and why. If no pack matches this project, the *what* still applies — ask how this
> project does it rather than skipping it.

## When to Add Rate Limiting
- **Anything that checks a credential — login, signup, password reset, invite codes: from the start, MVP included.** An unlimited login can be guessed at machine speed, and every attempt looks like a normal request in your logs. This one isn't a "later, when we have users" item; by then you have accounts worth stealing.
- **MVP, everything else:** optional — focus on features first.
- **Public-facing APIs:** required.

## Recommended Limits

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Login/Register | 5 requests | 1 minute |
| Password Reset | 3 requests | 5 minutes |
| General API | 30 requests | 10 seconds |
| File Upload | 5 requests | 1 minute |

## Where rate limiting can live (two layers)

Rate limiting can happen at two different layers — they complement each other, they don't replace each other:

- **Application layer (in your code — Upstash in the kit's own stack, wired up in `docs/stacks/framework-*.md`).** Runs inside your code, so it knows *who* and *what*: "5 login attempts per user", "30 API calls per IP". Fine-grained, per-route, per-user. **Works on any host** (Vercel *and* Hostinger) because it's just code + a Redis call.
- **Edge / network layer (Cloudflare, host firewall).** Runs *in front of* your app, so it blocks abuse before it ever reaches your server — including volumetric DDoS that app-layer limiting can't stop (the request still hit your server to be counted).

### Alternatives to Upstash
- **Cloudflare (recommended if you want broad protection with little code).** Put your domain behind Cloudflare's free plan: you get DDoS protection and bot mitigation automatically, plus **Rate Limiting Rules** you configure in the dashboard (no code) — e.g. "block an IP that hits `/api/login` more than 5×/min". Host-agnostic. Best for coarse, IP-based protection. It does *not* know your app's user IDs, so for per-user business rules you still want Upstash.
- **Vercel WAF / Firewall** (Vercel only) — dashboard-configured rate-limiting rules at the edge. Good if you're on Vercel and don't want an external service, but doesn't help on Hostinger.

**Rule of thumb:** Cloudflare in front (free, stops the crude attacks) **+** Upstash in the app (for "5 login tries per account" type rules) is the belt-and-suspenders setup for a real SaaS. For an MVP, either one alone is already a big step up from nothing.
