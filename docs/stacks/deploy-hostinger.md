# Hostinger — the concrete procedures

> **Applies when `.ai-eng-kit` → `stack.deploy` is `hostinger`.**
> If it is not, this file does not describe this project and nothing in it should be followed.
> The principles behind these steps live in `/deploy` itself and hold with any host; this is only
> how Hostinger does it.

---

## First-time setup

_Reached from `/deploy`, step 2._

- In **hPanel**, create the app and connect your GitHub account and repository for automatic
  Git-based deployment — build and publish on push.
- ⚠️ **Make sure it runs as a Node.js app.** The host has to run the framework's build and then its
  server (for Next.js: `next build`, then `next start`), not serve a static export. Any app with API
  routes, authentication, or server-side rendering needs a Node runtime; static-only hosting silently
  breaks exactly those features, and the build still goes green.
- Set the environment variables in Hostinger's panel with the **production** values, not the test
  values from the local env file.
- Exact menu names change with the panel — follow its own "connect repository" and "environment
  variables" sections rather than a remembered path.

## Rolling back

In the panel, redeploy the previous working commit, or roll back to the previous deployment. This
puts the old *code* back. It does not touch the database — see `/deploy`'s rollback section.

## When the build fails on Hostinger but works locally

- Check the Node.js version configured for the app — it may differ from the local one.
- Anything needed at build time must be in `dependencies`, not `devDependencies`.
- Read the host's build log for the actual error before changing anything.

## When environment variables aren't available at runtime

- Confirm they are set in the app's environment-variables section.
- **Redeploy after adding or changing them** — they do not apply retroactively.
- Values that need to reach the browser must carry the framework's public prefix; check the
  framework pack for which one.
