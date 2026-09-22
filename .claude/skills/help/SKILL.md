---
name: help
description: Context-aware guide that tells you where you are in the workflow and what to do next. Use anytime you're unsure.
argument-hint: "optional question"
user-invocable: true
---

# Project Help Guide

## Goal
Analyze the current project state and tell the user exactly where they are in the workflow and what to do next — in plain, actionable language.

## When Invoked

### Step 1: Analyze Current State

Read these files to understand where the project stands:

0. **Check which agent this project is installed for:** read `.ai-eng-kit` → `agents`.
   It decides how you write every command you hand the user. The skills are the same
   everywhere, the way you call them is not:

   | agent in `.ai-eng-kit` | how a skill is called |
   |---|---|
   | `claude`, `cursor`, `copilot`, `antigravity`, `grok` | `/build` |
   | `codex` | `$build`, or pick it from the `/skills` menu |
   | `kimi` | `/skill:build` |

   Use the syntax of the agent you are running in. If the project lists several and you
   cannot tell which one you are, use `/…` and add one line: "on Codex these are written
   `$build`, on Kimi Code `/skill:build`." Never print a command in a syntax this project has no agent for.

1. **Check PRD:** Read `docs/PRD.md`
   - Is it still the empty template? → Project not initialized yet
   - Is it filled out? → Project has been set up

2. **Check Feature Index:** Read `features/INDEX.md`
   - No features listed? → No features created yet
   - Features exist? → Check their statuses

3. **Check Feature Folders:** Each feature is a folder `features/PROJ-X-name/`. For each feature in INDEX.md, check which files exist:
   - `features/PROJ-X-name/spec.md` exists (created by /write-spec) → specified
   - `features/PROJ-X-name/design.md` exists (created by /architecture) → architected
   - `features/PROJ-X-name/tasks.md` exists (created by /tasks) → tasked
   - `features/PROJ-X-name/qa-report.md` exists (created by /qa) → tested
   - Deployment recorded in INDEX.md (added by /deploy)

4. **Check Codebase:** Quick scan of what's been built
   - In a kit-scaffolded project: `ls src/components/*.tsx 2>/dev/null` → custom components, `ls src/app/api/ 2>/dev/null` → API routes, `ls src/components/ui/` → installed shadcn components
   - In any other project: the paths the framework pack (`docs/stacks/framework-*.md`) or the code itself gives you — an empty `ls` on a path that does not exist is not evidence of an empty project

### Step 2: Determine Next Action

_Say every suggestion below in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._


Based on the state analysis, determine what the user should do next:

**First read `mode` from `.ai-eng-kit`** — it decides what "not initialized" means here.

**If PRD is empty template and `mode: new`:**
> Your project hasn't been initialized yet.
> Run `/init` with a description of what you want to build.
> Example: `/init I want to build a task management app for small teams`

**If PRD is empty template and `mode: existing`:**
> The kit was added to a project that already exists, so there is nothing to pitch.
> Run `/map` first — it reads your code and writes down what it is built with, how it is put together,
> and which features it already has, with a file path behind every finding (`docs/codebase/`).
> Then `/init` — it takes those findings as proposals, asks you to confirm the feature map, and records
> how the project runs (start command, stack, how to check it works, how it goes live). Run
> `/verify-setup` first if you have not yet.

(If `docs/codebase/` already exists, skip the `/map` line and recommend `/init` directly.)

**If features exist with status "Mapped" (a row, no folder):**
> Feature PROJ-X already runs in your app but has no spec yet, so nothing can check that a change keeps it working.
> Run `/reverse-spec` — it reads the criteria off the code and you confirm them block by block; you can stop and resume anytime. Or `/write-spec` for something new.

**If features exist with status "Spec'd" (spec.md confirmed, no qa-report.md):**
> Feature PROJ-X runs in production and its criteria are confirmed — but not yet verified against the running app.
> Run `/qa` — it tests the app against those criteria; any deviation you flagged during `/reverse-spec` will show up there as a failure to act on.

**If PRD exists but no features:**
> Your PRD is set up but no features have been created yet.
> Run `/write-spec` to create your first feature specification.

**If features exist with status "Planned" (spec.md only, no design.md):**
> Feature PROJ-X is ready for architecture design.
> Run `/architecture` to create the technical design at `features/PROJ-X-name/design.md`

**If features have design.md but no tasks.md (status "Architected"):**
> Feature PROJ-X has a tech design and is ready to be broken into tasks.
> Run `/tasks` to break the design into a leveled, traceable task list at `features/PROJ-X-name/tasks.md`.

**If features have tasks.md but no implementation (status "Tasked"):**
> Feature PROJ-X has an approved task list and is ready for implementation.
> Run `/build` to work through `features/PROJ-X-name/tasks.md` level by level (schema, API, then UI), fanning out parallel [P] tasks to subagents.

**If features are implemented but no qa-report.md:**
> Feature PROJ-X is implemented and ready for testing.
> Run `/qa` to test the feature against the acceptance criteria in `features/PROJ-X-name/spec.md` and write `features/PROJ-X-name/qa-report.md`.

**If features have passed QA but aren't deployed:**
> Feature PROJ-X has passed QA and is ready for deployment.
> Optional for critical features: run `/e2e-tests` first to add end-to-end browser tests for the most important user journeys (installs a browser runner once, and tells you before it downloads anything).
> Good habit before shipping: run `/audit` to confirm everything is documented and in sync.
> Then run `/deploy` to deploy to production.

**If all features are deployed:**
> All current features are deployed! You can:
> - Run `/security-check` to confirm the live app is secure (HTTPS, headers, protected routes, no exposed secrets, RLS)
> - Run `/cleanup` to tidy the documentation of the shipped features (resolved questions, fixed bugs, decision logs)
> - If `docs/tech-debt.md` (or, before the first map carried it, `docs/codebase/concerns.md`) lists an oversized file and every owning feature is verified: run `/refactor` to split the worst one behind an unchanged facade
> - Run `/write-spec` to spec out a new feature
> - Check `docs/PRD.md` for planned features not yet specified

### Step 3: Answer User Questions

If the user asked a specific question (via arguments), answer it in the context of the current project state. Common questions:

- "What skills are available?" → List all available skills with brief descriptions
- "How do I add a new feature?" → Explain `/write-spec` workflow (or `/init` if the project isn't set up yet)
- "How do I customize this template?" → Point to CLAUDE.md, rules/, skills/
- "What's the project structure?" → Explain the directory layout
- "How do I deploy?" → Explain `/deploy` workflow and prerequisites
- "What's the workflow / handoff order?" → `/init` → `/write-spec` → `/architecture` → `/tasks` → `/build` → `/qa` → `/deploy` (`/refine` & `/audit` anytime · `/dsgvo` when personal data is involved · `/e2e-tests` for critical flows · `/security-check` & `/cleanup` after `/deploy`). Status flow: Roadmap → Planned → Architected → Tasked → In Progress → In Review → Approved → Deployed. For features that predate the kit (`/map` → `/init`): Mapped → Spec'd (via `/reverse-spec`) → In Review → Deployed (via `/qa` — the feature is already live, so a green QA moves it straight to Deployed).
- "My documents are getting long / cluttered" or "Can we tidy this up?" → Run `/cleanup` — it removes resolved questions, compacts the decision logs, and condenses fixed bugs on features that are already live. It proposes everything first and never changes what the app does.
- "Is everything documented / in sync?" or "Did I miss anything?" → Run `/audit` — it reports any drift between INDEX, the feature folders, the AC→Task→Test chain, and code that has no spec.
- "Is my live app secure?" → Run `/security-check` — a non-destructive check of the deployed app (HTTPS, security headers, login-protected routes, no exposed secrets, and whether the database itself keeps private data private).
- "Is this allowed under GDPR/DSGVO or the Swiss DSG?", "Do I need a privacy policy?", "Can I store this data?" → Run `/dsgvo` (whole project) or `/dsgvo PROJ-X` (one feature). It names the personal data, the legal basis, and what to build — as acceptance criteria, not legal prose. It never certifies compliance; that needs a lawyer or a Datenschutzbeauftragter.

## Output Format

Always respond with this structure:

### Current Project Status
_Brief summary of where the project stands_

### Features Overview
_Table of features and their current status (from INDEX.md)_

### Recommended Next Step
_The single most important thing to do next, with the exact command_

### Other Available Actions
_Other things the user could do right now_

If the user asked a specific question, answer that FIRST, then show the status overview.

## Important
- Be concise and actionable
- Always give the exact command to run, in the calling syntax of the agent you are running in (Step 1.0)
- Reference specific file paths
- Don't explain the framework architecture in detail unless asked
- Focus on: "Here's where you are, here's what to do next"
