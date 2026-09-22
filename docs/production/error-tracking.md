# Error Tracking

Track production errors automatically, so you learn about breakage from your tooling rather than
from a user's email.

> **Where the concrete setup lives.** The step-by-step wiring for this project's stack is in
> `docs/stacks/` — `framework-*.md` for anything that belongs to the framework, `backend-*.md`
> for anything that belongs to the database. This guide is the part that holds either way: what
> to do and why. If no pack matches this project, the *what* still applies — ask how this
> project does it rather than skipping it.

## What You Get
- Automatic error capture (client + server)
- Stack traces with source maps
- Error grouping and deduplication
- Email alerts for new errors
- Performance monitoring (optional)

## Before You Ship: Don't Let Errors Leak Personal Data

Error tracking is the most common accidental data leak in a web app. A crash report carries whatever was in scope at the time — the email in the URL, the contents of the form the user just submitted, their IP address, their session. That data leaves your app and lands on a third party's servers. Under GDPR that makes the tracker (Sentry in the kit's own stack) a processor of personal data, and it needs to be set up deliberately.

**1. Turn off sending personal data by default.** Every tracker has a switch for attaching IP addresses, cookies and request headers, and a hook to scrub an event before it leaves the app — in Sentry `sendDefaultPii: false` plus a `beforeSend` that drops form bodies, cookies and the `Authorization` header. Set both explicitly rather than trusting the default; the concrete config is in `docs/stacks/framework-*.md`.

**2. Choose the EU region.** Sentry lets you pick where your data is stored when you create the organisation (`https://sentry.io` → EU data residency, giving you a `.de.sentry.io` ingest domain). Like the database region, this is decided at creation time and is painful to change afterwards.

**3. Sign the AVV (data processing agreement).** Sentry provides one in the organisation settings under Legal & Compliance. Same for your host. This is a legal requirement under Art. 28 GDPR, not an optional formality.

**4. Set a retention period.** The default keeps error data for 90 days. Shorten it if you have no reason to keep it that long — retaining less is always the easier position to defend.

**5. Mention it in your privacy policy.** Sentry belongs in the list of processors, alongside your host and database. `docs/privacy.md` tracks these; `/dsgvo` keeps it current.

> If you'd rather avoid a third-party processor entirely, the Vercel option below keeps error data with the host you already use — one processor instead of two.

## Alternative
**Vercel Error Tracking** - Built-in, simpler, but fewer features. Available in Vercel Dashboard under "Monitoring".
