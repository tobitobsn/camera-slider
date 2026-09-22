---
name: refactor
description: Split one oversized, mixed-responsibility file into modules — behaviour-preserving, proven by the same tests and QA criteria that were green before. Only for code whose features have confirmed, verified specs. Run after /map named the candidates and /qa produced a green baseline.
argument-hint: "[file path — omit to take the top candidate from docs/tech-debt.md]"
user-invocable: true
---

# Refactor

## Goal
Split one file that has grown too large and mixed its responsibilities — so that agents and people can change one thing without reading everything, and so the next feature lands in a structure instead of on a pile. **Behaviour-preserving is the whole contract**: after this skill, the app does exactly what it did before, and the proof is the same evidence that was green before — the test suite and the confirmed acceptance criteria. Refactoring without that proof is the bug loop under another name: every "cleanup" is one more unverifiable change.

That is why this skill is gated, single-file, and boring on purpose. The interesting decisions (what the code *should* do) belong to `/reverse-spec` and `/refine`; this skill only moves code that provably keeps doing what it does.

## Hard gates — check all four before touching anything
1. **A target with a reason.** No argument → take the top `Planned` row of `docs/tech-debt.md`, then its top `Open` row that is an oversized or mixed-responsibility file; with no tracker, the top entry of `docs/codebase/concerns.md` → *Oversized files and mixed responsibilities*. An argument names the file directly — but it still needs a stated reason (size, mixed responsibilities); "make it nicer" is not one. If `docs/codebase/` is missing, run `/map` first — the candidates and the feature ownership below come from it.
2. **Every feature the file serves has a verified contract.** Find the file's owners in `docs/codebase/features.md` and in the feature folders. For each owning feature: `spec.md` exists (confirmed — reconstructed or written) **and** `qa-report.md` shows its ACs verified (status `Deployed` or `Approved`). One owner still `Mapped` → **stop**: `/reverse-spec` first, then `/qa`, then back here. The file appears under *Unassigned* or its owner is unclear → **stop**: nobody can say which behaviour must survive, so nothing can prove it did.
3. **The baseline is green, and you ran it now.** Run `commands.test` — the owning layer's, from its `root`, when the file sits under one (`.ai-eng-kit` → `layers`) — and `commands.lint` where it exists, before the first edit and record the result in the session. A red baseline → **stop**: fixing and moving in one change makes the diff unreviewable and the cause unattributable. Fix through the normal chain first.
4. **The behaviour is provable here.** There is a test suite covering the file's behaviour, or `probe` allows exercising the owning features' runtime ACs, or the user commits to a recorded manual pass (the `/qa` route). None of the three → **stop and say so**: "I can split this file, but nothing here can prove the app still behaves the same afterwards — that is a risk I won't take silently." Offer the way in: `/qa` with a recorded human test first.

## Method — facade first, one responsibility per step
Work on a branch: `refactor/<file-stem>`. Then:

1. **Name the responsibilities** you found in the file (data access, business rules, form/state logic, UI, helpers) — the same split `concerns.md` recorded. Present the plan in one short block: which new modules, what moves where, what the file becomes. Wait for the user's go.
2. **Extract one responsibility at a time**, smallest first. After each extraction the code compiles and the tests run — run them; never stack two unverified steps.
3. **The original file becomes a facade**: it keeps its path and re-exports what moved, so **no caller changes in this session**. The public surface — export names, signatures, route paths — stays byte-for-byte identical. Rewiring the callers onto the new paths is a separate, later, mechanical session; doing both at once turns a safe move into a project-wide diff.
4. **Verify**: full `commands.test` + `commands.lint`, then the runtime ACs of the owning features the way `probe` allows — at minimum the ones whose evidence lines point into this file. New behaviour, changed message, lost state → that is a failure, see below.
5. **Red → revert, entirely.** `git checkout` the branch away or reset to the pre-step commit. Never ship a partial refactor with a note; never weaken or delete a test to get to green. Then report *what* broke — that finding is valuable even though the refactor didn't land.
6. Green → commit, set the row in `docs/tech-debt.md` to `Resolved` with the commit (append a row if the file was named by argument and has none), note it in `docs/codebase/concerns.md` (entry resolved, date) and, where structure moved, `architecture.md`'s file references. Offer the next candidate; **one file per session** unless the user explicitly asks for more.

## Edge cases — check each one explicitly, they are where this goes wrong
- **The file is generated.** Lockfiles, generated types/clients, build output, anything a tool rewrites. Never refactor it — the generator wins the next run. If `concerns.md` lists one, the fix is the generator's input or the map, and say so.
- **Migrations and schema files are out of scope entirely.** A migration chain is history, not structure; "splitting" it rewrites the past and breaks every environment that already ran it. Schema changes go through the normal chain (`/architecture` → `/tasks` → `/build`), never through this skill.
- **Splitting a UI component can change behaviour without changing a line of logic.** Extracting a component changes its element identity: the framework unmounts and remounts it, **state resets and effects refire**. Extract to module top level (never define a component inside another's render), keep the tree position stable, and afterwards exercise specifically the interactive ACs — a form that keeps its draft, a panel that stays open. A test suite of pure functions will not catch this; the runtime check is what does.
- **Client/server boundaries move with the file.** In frameworks that split by module (`'use client'`, server actions/loaders, route files), moving code across that line changes where it runs — secrets suddenly in the client bundle, hooks suddenly on the server. Keep every extracted module on the same side as the code it came from; route/entry files keep their framework-mandated location, and what leaves them is the logic, not the file. `docs/stacks/framework-*.md` names the boundaries for this project's stack.
- **Import cycles.** Splitting one file into three can create a cycle the bundler tolerates and the runtime resolves to `undefined` at load order's mercy. After extraction, check the imports among the new modules are a tree, not a loop; a shared type or constant that both sides need moves to its own small module instead.
- **Tests coupled to the file's path.** Mocks by module path, snapshot names, coverage thresholds per file — these fail on a pure move without any behaviour change. Update the test's *wiring* (the mock path), never its *assertion*. If a test fails and you cannot say with evidence whether it is wiring or behaviour, treat it as behaviour: revert.
- **You find a real bug mid-split.** Preserve it. A behaviour-preserving refactor preserves the bugs — that is what makes the diff trustworthy. Record it: on a reconstructed feature as a line under the spec's Open Questions, otherwise as a finding for `/qa`. Fixing it here would hide a behaviour change inside a "no behaviour change" commit — the one place nobody will look for it.
- **The urge to improve while you're in there.** Renames, "better" APIs, dead-code deletion, dependency bumps — all of it is scope creep that turns a provable move into an unprovable mixture. The facade rule makes this concrete: if the public surface changed, the session failed its own contract.
- **The file serves features whose ACs can't run here** (`probe.kind` `simulator`/`none`, and no tests reach the file). Gate 4 already refused this; if it surfaces mid-session (one owner's ACs turn out runtime-only), stop at the current green step, commit what is proven, and hand the rest to a recorded manual pass — never "the tests that exist all pass" as if it covered what they don't.
- **Two candidates share code or import each other.** Never refactor them in parallel or in one session — the second's baseline would be the first's unreviewed result. Strictly one after the other, each with its own verification.
- **A 2000-line file.** Do not one-shot it. Extract the smallest coherent responsibility, verify, commit — and end the session there if attention is running low; the facade means a half-done split is still a consistent, shippable state. The next session takes the next slice.

## What NOT to do
- Do NOT change any observable behaviour — including error messages, ordering, and timing where an AC or test names them
- Do NOT touch callers, rename exports, or change signatures — the facade keeps the surface identical
- Do NOT fix bugs, delete "dead" code, or bump dependencies in the same session
- Do NOT weaken, skip, or delete a test to reach green
- Do NOT refactor schema, migrations, or generated files
- Do NOT batch several files, and do NOT run while the baseline is red or unproven

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/qa`), feature IDs and file paths stay as they are._

On success:
> "`<file>` is split into N modules behind an unchanged facade — every caller, export and route is untouched, and the full test suite plus the owning features' criteria are green (same results as the baseline). `docs/tech-debt.md` marks TD-n Resolved. Next candidate: TD-m `<file>` — say the word."

On a refused gate, name the gate and the way in:
> "Not yet: **[feature]** (PROJ-X) owns part of this file and has no verified spec — a split can't prove that its behaviour survived. Run `/reverse-spec PROJ-X`, then `/qa`, then `/refactor` again."

## Git Commit
One commit per extracted responsibility, on the `refactor/<file-stem>` branch:
```
refactor(<area>): extract <responsibility> from <file> — behaviour-preserving, suite green
```
Merging the branch follows the project's normal flow after the user has seen the result.
