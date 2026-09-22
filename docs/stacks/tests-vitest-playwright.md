# Vitest and Playwright — the concrete procedures

> **Applies when `.ai-eng-kit` → `stack.test` is `vitest` or `stack.e2e` is `playwright`.**
> If neither is, this file does not describe this project. Read `commands` for what this project
> actually runs, and never install a test framework into someone's project because this file
> describes one — that is a dependency decision, and it is theirs.

The principles live in `/qa` and `/e2e-tests`: what to test, what a passing test is worth, and that
an unverified check is never a pass. This is only how these two tools express them.

---

## Running the suites

_Reached from `/qa` step 5 and `/deploy`'s pre-flight._

```bash
npm test              # Vitest: unit and integration tests
npm run test:e2e      # Playwright: end-to-end browser tests
npm run test:all      # both
```

Prefer `commands.test` from `.ai-eng-kit` where it is set — it is what the project recorded, and it
stays right when the scripts are renamed.

**A single file** — what a build sub-agent, a red proof and a verification lane run instead of the
suite (`/build` → task list, `/qa` → Independence):

```bash
npx vitest run src/hooks/useFeature.test.ts     # one Vitest file
npx vitest run --changed                        # only files touched since the last commit
npx playwright test tests/PROJ-3-login.spec.ts  # one E2E spec
```

**Saving a run for the lanes** (`/qa` runs the suites once and hands the output over):
`npm test 2>&1 | tee /tmp/qa-suite.log` — the log is the evidence the lanes cite.

## Installing the Playwright browser (once per machine)

_Reached from `/e2e-tests`, before the first run._

E2E tests drive a real browser, so the binary has to be there. Check before installing:

```bash
npx playwright install --dry-run 2>&1 | head -5
```

If it is **not** installed, tell the user before you start:

> "E2E tests run in a real browser. I'll install the Playwright browser now — it's a ~300 MB
> one-time download per machine."

Then: `npx playwright install chromium`

**This install belongs here and nowhere else.** `/qa` and `/verify-setup` never trigger it, which is
what keeps setup and the ordinary test loop fast. After cloning the repo it runs once.

## Where tests live

_Reached from `/qa` step 6 and `/verify-setup` check 5._

- **Unit and integration tests are co-located** next to the source file they cover —
  `src/hooks/useFeature.test.ts` beside `src/hooks/useFeature.ts`. A test that sits next to its
  subject gets read when the subject changes; one in a distant folder does not.
- **E2E specs live in `tests/`** as `*.spec.ts`, one per critical journey. `vitest.config.mts` excludes
  that folder, so the two runners never collect each other's files — keep new E2E specs there.
- **Vitest globals are typed** by `src/test/vitest-globals.d.ts` (`describe`, `it`, `expect`, `vi` need no
  import). Keep that file: without it a globals-style test passes `npm test` and fails `npm run build`.

`package.json` carries the `test`, `test:e2e` and `test:all` scripts; `vitest.config.mts` and
`playwright.config.ts` carry the configuration. The E2E scripts pass with no tests on purpose, so
`test:all` is green on a fresh scaffold; `playwright-report/` and `test-results/` are gitignored.

**A scaffold from before kit 0.7.0 lacks that flag**, and `update` never rewrites `package.json`: there
`test:all` exits 1 as long as `tests/` does not exist, which fails `/deploy`'s pre-flight and every
suite run in `/qa`. `/verify-setup` reports it; the fix is two scripts:

```json
"test:e2e": "playwright test --pass-with-no-tests",
"test:all": "vitest run && playwright test --pass-with-no-tests"
```

## Writing a Vitest unit test

_Reached from `/qa` step 6._

- Mock only external dependencies — `localStorage`, `fetch`, the clock. Never mock the logic under
  test; a test that mocks its own subject passes for the wrong reason.
- Cover the happy path **and** the failure paths: corrupt input, empty state, a rejected promise.
- Run `npm test` to confirm they pass. "Should pass" is not "passes".
