---
name: reverse-spec
description: Turn one Mapped feature — something the app already does — into a confirmed spec: acceptance criteria read from the code and put to the user as intended / should be / missing. Run after /map and /init; the resulting spec is what /qa verifies, so a fix stops breaking the last one.
argument-hint: "[PROJ-X — omit to take the next Mapped feature in build order]"
user-invocable: true
---

# Reverse Spec

## Goal
Write the spec for a feature that already runs — so the product finally has a contract to check changes against. Without it, every bug fix is checked against nothing and the next fix breaks the last one; with it, `/qa` verifies confirmed criteria, which is the loop-breaker this skill exists for.

Two stances carry the whole skill. **The spec states the intended behaviour, never the code's behaviour as-is** — a spec read off the code documents its bugs as requirements, so every candidate criterion is put to the user and only what they confirm is written. And **the user never judges granularity**: you decide what is one criterion (one observable rule — a validation, a permission, a state change, an error case); they only answer whether it is right.

## Before Starting
1. Read `.ai-eng-kit` → `mode`, `platform`, `probe`, and the memory file → Key Conventions (working language).
2. Read `features/INDEX.md`. **No argument → take the first `Mapped` row in build order.** An argument names the row to jump to. No `Mapped` rows at all → nothing to reconstruct: say so and point at `/write-spec` (new features) or `/map` + `/init` (if the map was never confirmed).
3. Read the feature's evidence: its row in `docs/codebase/features.md` and the matching parts of `architecture.md` (routes, tables, server functions, files) and `conventions.md` (existing tests). If `docs/codebase/` is missing or does not list this feature, stop and say the map has to come first — candidates invented without evidence are the failure mode this workflow exists to prevent.
4. Check for an existing `features/PROJ-X-*/spec.md` carrying `> Reconstructed from code` and an unfinished-continuation note (see Resumability): if present, resume there instead of starting over — never re-ask a confirmed criterion.

## Build the candidate list
From the feature's routes, server functions, tables and existing tests, write one candidate per **observable rule**:
- validations (what input is refused, and with what message),
- permissions (who can do or see this, and what happens to everyone else),
- state changes (what a successful action changes, where it becomes visible),
- error cases (what the user sees when it fails),
- anything an existing test asserts — the cheapest candidates there are, already stated by the project.

Each candidate carries its **evidence** (`file:line` or the test name) and its **origin**, using the map's own split:
- **read** — the rule is stated in code or a test (a validation branch, a policy, an assertion);
- **inferred** — you concluded it from UI or flow, and nothing states it.

Phrase every candidate in the working language, at behaviour level, so a product manager can judge it without reading code: "Saving without a title shows an error and keeps the form" — not "the zod schema requires `title`".

## Confirm — blocks for what is read, one turn for what is inferred
The count is the enemy: a real feature yields 8–15 candidates, a real product 10+ features. One question per candidate is a skill nobody finishes, and an unfinished reverse spec is worse than none, because `/qa` then verifies a half-written contract. So:

- **Read candidates come in blocks of 5–7**, numbered, each with its one-line evidence, confirmed **by exception**: "These are stated in the code — which of them is *not* how it should be?" No exceptions → the block is confirmed. Never more than 7; a block nobody actually reads is a rubber stamp, and a rubber-stamped AC is a false contract with a checkmark on it.
- **Inferred candidates get their own turn** — one question, one recommended answer, like everywhere else in the kit. This is where being wrong is expensive, so it gets the attention.
- Every candidate, either way, resolves to one of **three answers**:
  - *intended* → confirmed as the AC.
  - *should be X* → **the AC states X** — what *should* hold — and the deviation becomes one line under the spec's Open Questions: "Code does Y (`file:line`); AC-n states X; found <date>." **No fix task.** `/qa` will find this as a real failure against a confirmed criterion, and that chain is the one that already gets acted on.
  - *missing* → a new AC, phrased by the user's answer, marked as having no evidence in code yet.
- After each block, say where things stand: *block 2 of 4 confirmed, 12 ACs so far*.

One question per turn, always with a recommendation, and the turn ends on the question — the kit's interview rules apply unchanged.

## Write the spec — after every block, not at the end
`/init` promised the user they need not do a feature in one sitting; this skill keeps that promise. After **every confirmed block**, write `features/PROJ-X-<slug>/spec.md` (create the folder on the first write):

- Under the title, the marker — keep this English sentence exactly, the explanation after it follows the working language:
  > Reconstructed from code, confirmed <date>. This feature was built before the kit's chain existed; there is no tasks.md and none is expected. The QA report is what verifies it.
- The confirmed ACs with stable IDs (`AC-1`, `AC-2`, …), each with its evidence where it has one.
- Deviations under **Open Questions** (the *should be X* lines).
- While unfinished, a continuation note as the last line: `_Continues at: <next block / remaining inferred candidates>. Run /reverse-spec PROJ-X to resume._` Remove it when done.

An abort after block 2 leaves a spec with 12 confirmed ACs and a note saying where it continues — not an empty file and not a lost hour. Everything else about the spec follows `/write-spec`'s format (user stories may be brief — one per confirmed flow; the ACs are the point here).

**This skill writes `spec.md` and the INDEX row. Nothing else.** No `design.md` — `/architecture` reads `docs/codebase/` and knows how to write down a design that exists, and it needs the contract first. No `tasks.md` — nothing is being built. No fix for any deviation — you found it, `/qa` proves it, `/build` fixes it.

## Update the INDEX
When the feature's candidates are all resolved: status `Mapped` → **`Spec'd`**, Spec cell links the folder. `Spec'd` means: runs in production, contract confirmed, **not yet verified** — `/qa` is what closes that gap, and until it does, the status must not claim more. Report progress across the map: *3 of 9 features specified, 27 ACs confirmed, 4 deviations found.*

## What NOT to do
- Do NOT write an AC the user did not confirm — not even an obviously-true one; the confirmation *is* the contract
- Do NOT record the code's behaviour as the requirement when the user said *should be X*
- Do NOT fix, or promise to fix, a deviation — and do NOT soften it: it goes under Open Questions verbatim
- Do NOT reconstruct `design.md`, `tasks.md`, or a QA report
- Do NOT touch the code, and do NOT re-slice the feature map — a feature that turns out too big goes back to `/map`/`/refine`, not into an ad-hoc split here
- Do NOT block on a candidate the user cannot answer: record it under Open Questions with a named owner ("needs whoever built the billing part") and move on

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/qa`), feature IDs and file paths stay as they are._

When a feature reaches `Spec'd`:
> "**[Feature]** (PROJ-X) now has a confirmed spec: N criteria, M deviations found (the code does something other than you intended — listed under Open Questions). Run `/qa` next: it verifies the app against these criteria, and the deviations will show up there as failures to act on. Or run `/reverse-spec` again for the next feature: **[next]** (PROJ-Y)."

When the user stops mid-feature:
> "Saved: N criteria confirmed so far in `features/PROJ-X-<slug>/spec.md`. Run `/reverse-spec PROJ-X` to continue where we stopped."

## Git Commit
After each session (complete or paused):
```
docs(PROJ-X): reconstruct spec from code — N ACs confirmed
```
