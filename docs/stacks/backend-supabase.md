# Supabase — the concrete procedures

> **Applies when `.ai-eng-kit` → `stack.backend` is `supabase`.**
> If it is not, this file does not describe this project and nothing in it should be followed.
> It is not general advice — it is one backend's commands, and the skills that need them point
> here at the moment they need them.

The principles behind these steps live in the skills themselves and hold in every stack. What
follows is only *how Supabase does it*.

---

## Where migrations live, and the pre-flight check

_Reached from `/deploy`, step 1, and from `/architecture` and `/audit` when they measure the codebase
map's age._

Schema changes are versioned `.sql` files in **`supabase/migrations/`**, one per change — and because
Row Level Security policies, database functions and auth triggers are written as migrations too, a
new file there is the one signal that the schema *or* the access rules changed since a codebase map
was taken: "added since the map's commit" is filtered to `supabase/migrations/*.sql` in this backend.
That path is also what `/deploy`'s pre-flight checks mean by "the migrations path":

```bash
git log -- supabase/migrations/
```

Changes to a migration that went live in an earlier release show up here — and they should only ever
show up when something went wrong. A shipped migration is frozen; corrections are new files.

---

## Authoring a schema change

_Reached from `/build`, "Schema Changes Are Versioned Files"._

Write schema through the CLI so the change lands as a file rather than only in a database:

```bash
supabase migration new add_tasks_table     # creates supabase/migrations/<timestamp>_add_tasks_table.sql
# write the SQL: CREATE TABLE, RLS policies, indexes, columns
supabase db reset                          # replays every migration locally, from scratch
# or: supabase migration up                # applies only what is pending
```

The file that lands — e.g. `supabase/migrations/0002_add_tasks_table.sql` — is the portable record of
the change, and it is exactly what `/deploy` later pushes to production. **Never apply schema only by
clicking in Studio with no file in the repo:** the database will be right and the next environment
will not, and nothing tells you.

`db reset` is destructive by design — it drops and rebuilds the local database. That is fine on the
local stack and never something to run against anything shared.

**Which environment this applies to depends on the Environment strategy:** with `local` it is the
Docker stack on this machine; with `two-projects` the dev project; with `branching` the staging
branch; with `single` it is production, which is why that strategy carries a warning. Either way,
promotion to production is `/deploy`'s job — see below.

---

## Promoting the database to production

_Reached from `/deploy`, step 2b._

**How** depends on the **Environment strategy** recorded in `docs/PRD.md` → Constraints. Read it
before running anything.

> **Launching several features at once:** promote **once for the whole set**. `supabase db push`
> applies all pending migrations in order; for `two-projects` hand over the full set of
> not-yet-applied SQL; for `branching` give one combined plain-language diff covering every
> feature's schema change before the single Merge.

### `local` — local Supabase (Docker) → hosted production

Development ran against a local Supabase stack; production is a **hosted** project that the schema
is now migrated into. Two of these steps are interactive and belong to the user — they open a
browser or prompt for a password.

*First deploy only — the user does these, you wait:*

- [ ] Create the hosted project at supabase.com (free tier is fine). For an EU audience pick
      **`eu-central-1` (Frankfurt)** — the region **cannot be changed later**.
- [ ] 👤 `supabase login` — opens the browser for authentication. Without it, `link` fails.
- [ ] 👤 `supabase link --project-ref <ref>` — the ref is in the project's dashboard URL. **This
      asks for the database password** (set when the project was created). Say so up front so the
      prompt isn't a surprise; if it's lost, it resets under Settings → Database.

*Then you take over:*

- [ ] `supabase migration list` — local migrations against what production has already applied.
      This is the inventory: everything with no remote entry is about to run.
- [ ] `supabase db push --dry-run` — prints exactly which migrations *would* be applied, without
      touching anything. This is the evidence behind the plain-language preview.
- [ ] `supabase db push` — applies the pending migrations, in order. This writes to real data.
- [ ] `supabase migration list` again — every local migration should now show a remote timestamp.
      That is the confirmation, not a hunch.

Production keys for the host's panel come from the **hosted** project (Settings → API), not the
local instance.

### Why `db push` won't run a migration twice

Supabase records every applied migration in a table on the **remote** database,
`supabase_migrations.schema_migrations`. `db push` compares the local `supabase/migrations/*.sql`
against that table and runs only what is missing, in timestamp order. Re-running `/deploy`, or
deploying a second feature later, never re-executes an earlier migration.

Git tracks the *files*; the database tracks which of them *ran* — two ledgers, and only the second
one decides. That is also why an edited migration goes wrong silently: production skips the file on
its recorded timestamp no matter what is now inside it, while `supabase db reset` replays the edited
version locally.

Fix forward instead: `supabase migration new fix_<what>` with the corrective SQL.

### When local and remote genuinely disagree

Usually because someone clicked schema changes directly in the production Studio, or applied a
migration by hand:

- **Schema exists on production but is in no local file** → `supabase db pull` writes it into a
  migration file so the repo matches reality again.
- **The tracking table is wrong** (the SQL ran but isn't recorded, or the reverse) →
  `supabase migration repair --status applied <timestamp>` / `--status reverted <timestamp>`.
  This corrects the ledger only; it executes and reverts nothing.
- **Never "fix" a mismatch by pushing harder.** Show the user the `migration list` output, explain
  in plain language which side has what, and agree on the fix before running either command.

### `single` — one project (test == live)

- There is no promotion: the project developed against *is* production. Confirm every `.sql` file
  in `supabase/migrations/` has been applied to it.
- ⚠️ Remind the user this is live data — there is no safety net. They can move to `two-projects`
  or `branching` later.

### `two-projects` — dev + prod

- The schema lives in `supabase/migrations/*.sql`, already applied to the **dev** project. Now
  apply it to **prod**.
- ⚠️ **Nothing tracks what prod already has.** Pasting SQL into the SQL Editor leaves no migration
  ledger, so the "runs each migration exactly once" guarantee does **not** apply — that safety net
  is yours to hold. Establish the boundary first: read `features/INDEX.md` for the last deployed
  feature and its date, list the migration files newer than that, and **show the user that list for
  confirmation** ("prod should already have 0001–0003; I'd hand you 0004 and 0005 — correct?"). If
  they're unsure, have them check the actual tables in the prod dashboard rather than guessing.
- Re-running a migration is not harmless: `CREATE TABLE` fails loudly (annoying but safe), while an
  `INSERT` or a backfill silently duplicates rows. Never say "just run it again to be sure."
- Hand off in plain language: "Open your **prod** Supabase project → SQL Editor → paste and run
  this SQL." Give the exact files, in order, and say what they do before they run.
- Production keys for the host's panel come from the **prod** project (Settings → API).
- Record in `features/INDEX.md` which migrations went live with this release — that record is the
  only thing the next `/deploy` can rely on.

### `branching` — Pro project, staging → production by Merge

- Production is promoted with the Supabase **Merge**, not by hand. Before the click:
  1. Read the `supabase/migrations/*.sql` not yet in production and summarize in plain words what
     will change on the live database.
  2. Flag anything destructive, plus the known branching caveat that **database functions get
     overwritten on merge**. If a risk can't be ruled out, say so.
  3. Only after confirmation: Supabase dashboard → the staging branch → **Merge** to production,
     reviewing the diff Supabase shows there too.
- Production keys come from the **production** branch, not the staging branch.

### Confirming it worked

For `local`, the second `supabase migration list`. For the other strategies, a look at the tables
in the production dashboard.

---

## Rolling a schema change back

There is no "un-push". A code rollback puts the old code back and leaves the new schema in place.

- The old code now runs against the **new** schema. Usually fine (added tables and columns are
  ignored by code that doesn't know them), usually broken if the migration **removed or renamed**
  something the old code still reads.
- Never undo it by editing or deleting the migration file — production's ledger has already
  recorded it. If the schema genuinely has to go back, that is a **new** corrective migration
  (`supabase migration new revert_<what>`), tested locally and pushed like any other. Reverting
  schema can destroy data, so it needs the same plain-language preview and go-ahead as the
  original push.

---

## Database connection errors after deploy

- Verify the Supabase URL and anon key in the host's environment variables.
- Check RLS policies allow the operations being attempted.
- Verify the Supabase project is not paused (the free tier pauses after inactivity).

---

## What Supabase Auth rate-limits for you, and what it does not

_Reached from the project security rules, `/architecture` and `/security-check`._

Supabase Auth throttles its **own** endpoints — that means a login going through
`signInWithPassword`, `signUp` or `resetPasswordForEmail`, and nothing else. Two groups behave
differently:

- **Not customizable:** token requests (`/auth/v1/token` — password sign-in) and verification
  requests (`/auth/v1/verify`) are limited **per IP address**, and you cannot change those limits.
- **Customizable:** the email-, OTP-, signup-confirmation- and password-reset-related limits.
  Hosted, they sit under **Authentication → Rate Limits**; locally, in `supabase/config.toml` under
  `[auth.rate_limit]`.

What that leaves uncovered, and therefore what the design has to decide:

- **A patient or distributed attack on one account.** Per-IP limits do not stop an attacker rotating
  IPs, and they do not stop credential stuffing — one common password against many accounts.
- **Anything you wrote yourself.** A custom login route, a server-side handler checking an invite code
  or a password-protected share link gets no Supabase limit at all. That needs an app-level throttle
  keyed per IP **and** per account — in practice a second counter alongside the IP one,
  `ratelimit.limit("login:" + email)`, so an attacker cannot spread attempts across IPs against a
  single account. Setup: with `stack.framework: nextjs`, `docs/stacks/framework-nextjs.md` → *App-level
  rate limiting* → step 5b carries the two-counter handler; with any other framework, the same two
  counters go into its request handler, and `docs/production/rate-limiting.md` says what and why.

**CAPTCHA** is the strongest lever against automated guessing on the built-in endpoints: hCaptcha
and Cloudflare Turnstile, under **Authentication → Attack Protection**, locally `[auth.captcha]`.
Recommend it for any public signup.

**Leaked-password protection** checks new passwords against HaveIBeenPwned. Note that it is a
paid-plan feature, so the user decides rather than discovering it later.

## Settings made in the dashboard, not in code

_Reached from `/architecture` (Settings the user makes), `/tasks` (`[user]` tasks) and `/build` (the hand-off)._

Some of the auth protection a design relies on is not something the app can write — it is switched on
in the Supabase dashboard, by the user. **Decide the values, then hand them over with the exact path;
do not ask the user how they would like to configure it.** The usual set for a feature with a login:

| Setting | Where (hosted) | What to propose | Local mirror |
|---|---|---|---|
| CAPTCHA on sign-in / sign-up / password reset | **Authentication → Attack Protection** → Enable Captcha (Cloudflare Turnstile or hCaptcha) | on, for any public signup. The site key goes into the form (`NEXT_PUBLIC_…`), the secret stays in the dashboard | `[auth.captcha]` in `supabase/config.toml` |
| Sign-in / sign-up and OTP, email and password-reset limits | **Authentication → Rate Limits** | keep the defaults unless the spec's AC names tighter values — the dashboard shows the current numbers; the per-IP token limit itself is fixed | `[auth.rate_limit]` in `supabase/config.toml` |
| Leaked-password protection, minimum length, required character classes | **Authentication → Attack Protection** / **Sign In / Providers → Email** | minimum length ≥ 8 and leaked-password protection on — note that the latter is a **paid-plan** feature, so the user decides | `[auth]` in `supabase/config.toml` (`minimum_password_length`, `password_requirements`) |

Set the **local mirror** yourself so `/qa`'s attempt-loop and the CAPTCHA check work against the local
stack — and say out loud that the hosted project does not read `config.toml` by itself.

**Can this be a built task instead?** Newer Supabase CLI versions can push the `[auth]` sections of
`config.toml` to the linked hosted project: check `supabase config push --help`. If it exists, the
setting becomes a normal task (edit `config.toml`) plus a one-line hand-off — the user runs
`supabase config push` after `supabase link`, because it prompts and touches the live project — and the
`[user]` task is only the confirmation that they ran it. If the command is not available, the rows
above are `[user]` tasks with the dashboard path, ticked by the user.

## Row Level Security

_Reached from the project security rules, `/build`, `/qa` and `/security-check`._

RLS is this project's data-layer enforcement — the second, independent check behind the one in
application code. Every table a feature creates has RLS **enabled**, with policies covering exactly
the operations that feature uses.

The failure mode worth knowing: the anon key is public by design — it is baked into the deployed
JavaScript and sent to every browser. Without RLS, anyone holding it can read the table directly.
That is the single most common real-world Supabase vulnerability, and it looks like nothing is wrong
until someone tries it.

### Checking RLS from outside

_Reached from `/security-check` step 5._

The question is whether the database answers a stranger. You need two public values, both of which
every browser already has — never read them from an env file; take them from the live bundle or ask
the user to paste them:

- the project URL (`https://<ref>.supabase.co`), and
- the **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY` in a kit-scaffolded project — the `sb_publishable_…`
  or `eyJ…` value that ships in the deployed JavaScript).

Then, as an anonymous visitor, try to read a table that should belong to one user:

```bash
curl -s "https://<ref>.supabase.co/rest/v1/<table>?select=*&limit=5" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
```

- `[]` or a `401`/`permission denied` → RLS is doing its job.
- Rows belonging to other users → ⚠️ **CRITICAL.** Either RLS is not enabled on the table or a policy
  is too wide. The fix is `ALTER TABLE … ENABLE ROW LEVEL SECURITY` plus an owner-only policy, as a
  new migration, routed through `/build`.

**Read only.** `GET` on `/rest/v1/` is the whole test — never `POST`, `PATCH` or `DELETE` against a
live project, and never use the `service_role` key here: it bypasses RLS by design, so it proves
nothing and it is a server secret that should not be in your hands at all.

---

## Region and data processing

_Reached from `/dsgvo` §5, `/deploy` step 5 and `/init`._

- **The region is chosen when the hosted project is created and cannot be changed afterwards** —
  moving means a new project and a full migration. For an EU audience choose **`eu-central-1`
  (Frankfurt)**; the current region is visible under **Project Settings → General**. This applies
  to every strategy that has a hosted project (`local` at first deploy, `two-projects` for *both*
  projects, `single`, `branching`), not only to the local one.
- **The data processing agreement (AVV / DPA, Art. 28 GDPR)** is accepted per organisation under
  **Organization Settings → Legal Documents**. The user does this, once, before personal data goes
  live; `/dsgvo` lists it among the processors in `docs/privacy.md`.
- **Supabase Auth stores** email addresses, hashed passwords, sign-in timestamps and IP addresses in
  `auth.users` and the audit log — personal data by definition, which is why the region question is
  not optional for an app with a login.

---

## Standing up the local development stack

_Reached from `/init` (first time) and `/verify-setup` check 6b (re-check and repair)._

**Only for `Environment strategy: local`.** The cloud strategies (`two-projects`, `single`,
`branching`) have nothing to start on the machine — no Docker, no local stack. Skip this whole
section for them.

Work top to bottom and hand off only what needs a human:

- **Docker running** — `docker info` succeeds. Not installed or not running → ⚠️ hand off: "Local
  Supabase runs inside Docker. Install **Docker Desktop** and start it, then run `/verify-setup`
  again." Do not try to install it.
- **Supabase CLI available** — `supabase --version` works (or `npx supabase --version`). Missing →
  hand off the install command for their OS (e.g. `brew install supabase/tap/supabase`), or note it
  can run through `npx supabase`.
- **Project initialized** — no `supabase/config.toml` → run `supabase init`. Safe; it only writes
  config.
- **Stack running** — not up → run `supabase start`. **Warn first:** the first run downloads several
  GB of Docker images and takes a few minutes. When it finishes it prints the local API URL and anon
  key.
- **Clients wired** — the Supabase client code is in place so features can import it. In a
  kit-scaffolded project that is `src/lib/supabase/server.ts` (Server Components, Server Actions,
  Route Handlers — one client per request, session from cookies) and `src/lib/supabase/client.ts`
  (Client Components), both on `@supabase/ssr` and shipped active: they read the two `NEXT_PUBLIC_`
  values at call time, so nothing breaks before the keys exist. What is **not** shipped is the
  session refresh — add it with the first feature that has a login (below). In any other project,
  wherever it creates its Supabase client — find it, do not add a second one.
- **Session refresh** (`stack.framework: nextjs`, with the first auth feature, never before the
  keys are in the env file — it runs on every request): `src/proxy.ts` refreshes the session before
  Server Components read it, or an expired token logs the user out at random. Next.js 15 and
  earlier name the file `middleware.ts` and the export `middleware`; the body is the same.

  ```typescript
  // src/proxy.ts
  import { createServerClient } from '@supabase/ssr'
  import { NextRequest, NextResponse } from 'next/server'

  export async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request })
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          },
        },
      }
    )
    await supabase.auth.getClaims() // refreshes an expired session and writes the new cookies
    return response
  }

  export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
  }
  ```

  Confirm the current shape against the `supabase` domain skill or a live-docs source — this API has
  moved before (`getUser` → `getClaims`).
- **Local keys in the env file** — tell the user which values from `supabase start` go where. You do
  not read or write that file; these keys are local-only and safe, but they are still theirs to
  paste.

In a project the kit did not scaffold, **never stand a stack up without asking.** A second database
running beside the one the team already uses is not setup, it is damage.

---

## The login and signup flow

_Reached from `/build`'s "What Done Means", and from `/architecture` when it designs an auth feature._

The principle is backend-wide: **use the auth library's own server-side flow, never a hand-rolled
client form** — a hand-rolled form is one missing `preventDefault()` away from putting the password
in the address bar.

The concrete shape is a framework question. With `stack.framework: nextjs` it is the `@supabase/ssr`
Server Action pattern: a `'use server'` `login` / `signup` action that reads `formData`, calls
`supabase.auth.signInWithPassword` or `signUp`, and then `redirect()`s. It POSTs by design, which is
what keeps credentials out of the URL. For any other framework, `@supabase/ssr` ships an adapter
per framework — same principle, that framework's server-side submit path; `docs/stacks/framework-*.md`
names it where the kit has one, otherwise the project's own auth code is the pattern to follow.

The API surface moves; confirm the current shape against the `supabase` domain skill or a live-docs
MCP before writing it, rather than from memory.

The **rate limiting** that has to sit in front of this flow is a separate question — see "What
Supabase Auth rate-limits for you, and what it does not" above.
