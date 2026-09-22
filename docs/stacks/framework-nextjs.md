# Next.js — the concrete procedures

> **Applies when `.ai-eng-kit` → `stack.framework` is `nextjs`.**
> If it is not, this file does not describe this project and nothing in it should be followed.
> The principles behind these rules live in the skills themselves and hold in any framework; this
> is only how Next.js expresses them.

---

## Which values reach the browser

_Reached from `/deploy` (step 2, host configuration) and `/security-check`._

Next.js exposes an environment variable to client-side code **only** when its name starts with
`NEXT_PUBLIC_`. Everything else stays on the server.

Two consequences, and they pull in opposite directions:

- A value the browser genuinely needs — a public API URL, a publishable key — must carry the prefix,
  or it is simply `undefined` in the browser and the failure looks like a bug elsewhere.
- A value that must **not** reach the browser must never carry it. A prefixed secret is baked into
  the deployed JavaScript and served to every visitor. That is not a leak that shows up in a log;
  it is public from the first page load.

When setting variables in a host's panel, check each name against that rule before pasting.

## Where the app's routes and layout live

_Reached from `/build` and `/audit` when they map the real code surface, and from `/architecture` and
`/audit` when they measure the codebase map's age._

With the App Router, pages live under `src/app/`, API routes are `route.ts` files under
`src/app/api/`, and the app-wide frame is `src/app/layout.tsx`. Projects that predate `src/` keep
the same tree at the repository root.

**The files that make a codebase map stale** — what "added since the map's commit" is filtered to
in this framework: `src/app/**/page.tsx` and `src/app/**/route.ts` (a new screen or endpoint),
`src/middleware.ts` or `src/proxy.ts` (the auth boundary), and `src/app/**/layout.tsx` (the shell).
A new component under `src/components/` is not a route and does not count.

## Submitting a form that carries credentials

_Reached from the project security rules, `/build`, `/qa` and `/security-check`._

A `<form>` left to submit natively sends every field in the URL (`?email=…&password=…`), which
leaks it into browser history, server logs and `Referer` headers. Next.js gives two correct paths:

- A **Server Action** — `<button formAction={action}>` with a `'use server'` handler. It POSTs by
  design, which is why this is the default for auth forms.
- In a client component, an `onSubmit` handler that calls `e.preventDefault()` before doing the
  call itself.

A credential-carrying form with neither — no `method="post"`, no Server Action, no
`preventDefault()` — is a bug, not a style preference.

## Security headers

_Reached from `/deploy` step 5 and `/security-check`._

Headers are configured in `next.config.*` via the `headers()` function and served on every
response. What each header does, and the CSP rollout rule, is in `docs/production/security-headers.md`;
this is the block to copy:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ]
  },
}

export default nextConfig
```

A host can still strip or override them, which is why `/security-check` verifies them against the
live URL rather than against the config file.

---

## App-level rate limiting with Upstash Redis

_Reached from the project security rules, `/architecture`, `/build` and `docs/production/rate-limiting.md` — the throttle keyed per IP and per account that the platform's own limits do not give you._

### 1. Install Dependencies
```bash
npm install @upstash/ratelimit @upstash/redis
```

### 2. Create Upstash Account
- Go to [upstash.com](https://upstash.com) (free tier: 10k requests/day)
- Create a Redis database
- Copy REST URL and token

### 3. Add Environment Variables
Document the names in the example env file; the user puts the real values into `.env.local` — you never write that file (security rules → the real env file).
```bash
# .env.local.example
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

### 4. Create Rate Limiter
```typescript
// src/lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
  prefix: 'rl:api',
})

// Credential routes get their own, stricter limiter — and are keyed twice, see step 5b.
export const credentialLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'), // docs/production/rate-limiting.md → Recommended Limits
  prefix: 'rl:credential',
})
```

### 5. Use in API Routes
```typescript
// src/app/api/example/route.ts
import { ratelimit } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'anonymous'
  const { success, limit, remaining } = await ratelimit.limit(ip)

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
        },
      }
    )
  }

  // Process request normally...
}
```

### 5b. Credential routes — key by IP **and** by account
This is the hard gate from the security rules and `/build`: anything that checks a credential — login,
signup, password reset, an invite code, a share-link password — is throttled on **two** counters. The IP
counter stops one host hammering many accounts; the account counter stops an attacker rotating IPs
against one account. One counter alone leaves the other attack unlimited, and a per-IP throttle on a login
route is what makes the gate look satisfied while credential stuffing walks through.

```typescript
// src/app/api/login/route.ts — or the Server Action that checks the credential
import { credentialLimit } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
  const account = String(email ?? '').trim().toLowerCase()

  const [byIp, byAccount] = await Promise.all([
    credentialLimit.limit(`ip:${ip}`),
    credentialLimit.limit(`account:${account}`),
  ])
  if (!byIp.success || !byAccount.success) {
    // Same message for both, and the same message the failed login itself returns — a different
    // answer for "account throttled" tells the attacker which accounts exist.
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  // Check the credential normally...
}
```

- Count **before** the check, not only on failure — otherwise a slow correct guess never counts.
- With `stack.backend: supabase` and the browser calling `signInWithPassword` directly, the request never
  passes this route: either the credential check moves into a Server Action or route handler that calls
  Supabase server-side (then the code above applies), or the throttle is Supabase's own limits plus
  CAPTCHA — `docs/stacks/backend-supabase.md` → *What Supabase's limits leave uncovered* says which.
- `/qa` verifies this by firing 20+ wrong passwords at one account **and** one password at several
  accounts; both must start returning 429.

### 6. Use in the proxy (global)
Next.js 16 names the request boundary `src/proxy.ts` with `export function proxy`; Next.js 15 and earlier use `middleware.ts` / `export function middleware` — same body, and `npx @next/codemod@canary middleware-to-proxy .` renames an existing one.
```typescript
// src/proxy.ts
import { ratelimit } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  // Only rate limit API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous'
    const { success } = await ratelimit.limit(ip)

    if (!success) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
    }
  }
}

export const config = {
  matcher: '/api/:path*',
}
```


---

## Content-Security-Policy with a nonce

_Reached from `docs/production/security-headers.md` and `/security-check`._

**Content-Security-Policy (CSP)** — the most powerful header against XSS, and the easiest to get wrong. It is not part of the four above because it needs per-app testing; add it once the rest is live.

> ⚠️ **Never ship `script-src 'self' 'unsafe-inline'`.** `'unsafe-inline'` permits exactly the injected inline `<script>` that CSP exists to stop — it looks like protection while giving away most of it. If you find that value in a tutorial (it is a very common copy-paste), treat it as broken.

Next.js needs a **nonce** instead: a random token generated per request, attached to the scripts your app legitimately renders. Anything injected by an attacker lacks the token and is blocked. That means it belongs in the request boundary — `src/proxy.ts` in Next.js 16 (`middleware.ts` before), not in `next.config.ts`:

```typescript
// src/proxy.ts
import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
```

`'strict-dynamic'` lets scripts your nonced code loads run too, so you don't have to list every CDN. `'unsafe-eval'` is dev-only — React's fast refresh needs it; it must never reach production.

**Rolling it out safely:**
1. Ship it as `Content-Security-Policy-Report-Only` first — the browser reports violations without breaking anything
2. Click through the app, watch the console for violation reports, and fix what's genuinely yours
3. Only then switch the header name to `Content-Security-Policy`

**Caveats worth knowing before you start:**
- Nonces force **dynamic rendering** — a statically prerendered page has no per-request token. Pages that need one must opt in with `await connection()` from `next/server`.
- Third-party scripts (analytics, tag managers) need the nonce passed explicitly — read it with `(await headers()).get('x-nonce')`.

Reference: [Next.js — Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)

---

## Wiring up Sentry

_Reached from `/deploy` step 5, `/dsgvo` and `docs/production/error-tracking.md`. The five obligations before shipping (no PII, EU region, DPA, retention, privacy policy) are in that guide — this is only the Next.js wiring._

### 1. Create Sentry Account
- Go to [sentry.io](https://sentry.io) (free tier available for small apps)
- Create a new project and select "Next.js"

### 2. Install Next.js Integration
```bash
npx @sentry/wizard@latest -i nextjs
```
This automatically:
- Installs `@sentry/nextjs`
- Creates the config files (recent App Router versions use `instrumentation.ts` + `instrumentation-client.ts`; older ones `sentry.client.config.ts` / `sentry.server.config.ts`) — let the wizard decide, don't create them by hand
- Updates `next.config.ts` with the Sentry plugin

### 3. Add Environment Variables
Document the name in the example env file; the user puts the real value into `.env.local` (you never write that file) and into the host's environment variables for production:
```bash
# .env.local.example
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=sntrys_xxx  # For source maps upload
```

### 4. Verify Setup
Trigger a test error and check Sentry Dashboard:
```typescript
// Temporary test - remove after verification
throw new Error("Sentry test error")
```

### 5. Turn off sending personal data before the first real error

In the config files the wizard created (`instrumentation-client.ts` and the server config; older
setups `sentry.client.config.ts` / `sentry.server.config.ts`):

```typescript
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,        // don't attach IP addresses, cookies, or user headers
  beforeSend(event) {
    // Drop anything users typed — form bodies and query strings are the usual culprits
    if (event.request) {
      delete event.request.data
      delete event.request.cookies
      if (event.request.headers) delete event.request.headers['authorization']
    }
    return event
  },
})
```

`sendDefaultPii` defaults to sending IP addresses and request headers — set it explicitly rather
than relying on the default staying put. The EU region (`.de.sentry.io`), the DPA and the retention
period are decided in the Sentry organisation, not in code — `docs/production/error-tracking.md`.
