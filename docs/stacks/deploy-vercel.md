# Vercel — the concrete procedures

> **Applies when `.ai-eng-kit` → `stack.deploy` is `vercel`.**
> If it is not, this file does not describe this project and nothing in it should be followed.
> The principles behind these steps live in `/deploy` itself and hold with any host; this is only
> how Vercel does it.

---

## First-time setup

_Reached from `/deploy`, step 2._

- Create the project with `npx vercel`, or at vercel.com → **Import** the GitHub repository.
- Vercel auto-detects the framework, so there is normally nothing to choose.
- Environment variables live under **Project → Settings → Environment Variables**. Set the
  **production** values here, not the test values from the local env file.
- The default domain is `*.vercel.app`; a custom domain is added under Project → Settings → Domains.

Once the repository is connected, every push to `main` triggers a build and deploy.

## Deploying without a push

`npx vercel --prod` deploys the current working tree straight to production. It is a convenience,
not the normal path — the release the team can reason about is the one that came from `main`.

## Rolling back

Dashboard → **Deployments** → the "…" menu on the last working deployment → **Promote to Production**.
This puts the old *code* back. It does not touch the database — see `/deploy`'s rollback section.

## When the build fails on Vercel but works locally

- Check the Node.js version — Vercel may use a different one. Pin it under Project → Settings →
  General, or with an `engines.node` field.
- Anything needed at build time must be in `dependencies`, not `devDependencies`.
- Read the build log in the dashboard for the actual error before changing anything.

## When environment variables aren't available at runtime

- Confirm they are set under Project → Settings → Environment Variables, for the **Production**
  environment specifically.
- **Redeploy after adding or changing them** — they do not apply to an existing deployment
  retroactively.
- Values that need to reach the browser must carry the framework's public prefix; check the
  framework pack for which one.
