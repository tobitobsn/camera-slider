---
name: refine
description: Always use when the user wants to discuss, change or extend an existing feature or specification - small fixes and large extensions alike. Open an existing feature spec to improve, extend, or fundamentally challenge it, or to fold several follow-up specs of one feature into a single current one. Pass the feature ID as argument (e.g. /refine PROJ-2).
argument-hint: "PROJ-X"
user-invocable: true
---

# Feature Spec Refiner

## Goal
Improve, extend, or fundamentally challenge an existing, live spec based on what the user tells you. Push back where the spec is weak, vague, or contradictory — refining means making the spec genuinely better, not rubber-stamping it.

## Before Starting
1. Read the feature spec `features/PROJ-X-*/spec.md` — understand the full current state. If `features/PROJ-X-*/design.md` and `features/PROJ-X-*/tasks.md` exist, skim them too — refining scope or design may invalidate them.
2. Read `features/INDEX.md` — understand dependencies, status, and context
3. Read `docs/PRD.md` — keep the project vision in mind

**If no argument was provided** (no PROJ-X ID given):
> "Which feature spec would you like to refine?" — list all existing features from INDEX.md.

**If the PROJ-X ID doesn't exist**: tell the user and list existing features.

## Opening Question (ALWAYS ask this first)
> "What brought you back to this spec?"

This answer determines everything. Listen carefully — it will tell you which of the five paths to take.

## Five Paths

### Path 1: Something Changed
*Trigger: "scope changed", "we got user feedback", "business logic is different", "stakeholder changed the requirements"*

Run a targeted interview on the affected areas only:
- What specifically changed?
- Which user stories are affected?
- Which acceptance criteria need to be updated or removed?
- Do any edge cases change?
- Do dependencies change?
- Does the Out of Scope section need updating? (something previously excluded is now included, or vice versa)

### Path 2: The Feature Grows
*Trigger: "add a filter to the list", "users should be able to hide columns", "one more export format", "also for admins"*

This is the ordinary life of a feature and it belongs **here, in this spec** — not in a new one. A feature that gets a follow-up spec for every addition ends up spread over five files that contradict each other, and nobody can say any more what it does today. `spec.md` is the feature's current state; git is its history.

- What should the feature do that it does not do today? Who needs it, and what for?
- Which new acceptance criteria does that make — appended with the next free AC-IDs?
- Which existing criteria or edge cases does it touch (a new filter changes what "empty state" means)?
- Does it bring new data, a new role, a new screen? Then `docs/data-model.md` / `docs/app-shell.md` move too.

Size is not the test — a large extension is still an extension. The test for a **new feature ID** is whether the thing could ship and be tested on its own, with its own user story, and would still make sense if this feature did not exist. If yes: say so and hand off to `/write-spec`. If no: it is an AC here, however much work it is.

### Path 3: Implementation Revealed Gaps
*Trigger: "during implementation we found...", "the backend doesn't support...", "we didn't think about X scenario"*

Focus on making the spec tighter:
- What specific scenario was missing?
- Should this become a new acceptance criterion or edge case?
- Does this change any existing criteria?
- Are there related gaps we should close now while we're here?

### Path 4: Fundamental Challenge
*Trigger: "I'm not sure this feature is right", "maybe we should rethink this", "this might actually be two features"*

Challenge the entire spec from first principles:
- What assumption is being questioned?
- Is the user story still the right framing?
- Should this feature be split? If so, what are the two features?
- Should it be merged with another feature?
- What would the absolute minimal version of this feature look like?
- What moves to Out of Scope as a result of this challenge?

If the feature should be split: create the new feature folder (`features/PROJ-X-*/spec.md`) using the `/write-spec` workflow, and update `features/INDEX.md` accordingly. If it should be merged with another: that is Path 5.

### Path 5: One Feature, Several Specs — Consolidate
*Trigger: "PROJ-44 and PROJ-80 changed this later", "I can't see the whole feature any more", "the specs contradict each other", a project that came from a one-spec-per-change habit*

Fold the follow-up specs into this one, so that `features/PROJ-X-*/spec.md` says what the feature does **today**. Work in this order, and stop for approval where it says so:

1. **Find the group by searching, not by reading — propose it, STOP.** A project in this state has dozens or hundreds of specs; opening them one after the other to see which belong here spends the whole context before the work starts. Narrow it down from the outside:
   - `features/INDEX.md` is already read: rows whose name or description names the same screen, entity or the ID.
   - `grep -rl "PROJ-X\b" features/` (with this project's prefix) — every spec that mentions this feature, as a file list, not as content.
   - The routes, tables and component names from this feature's `design.md` (or, without one, from the code it owns): `grep -rl` for those in `features/*/design.md` and `features/*/spec.md`.
   - `git log --oneline -- <the feature's main files>` — commit messages carry the IDs that touched them (`feat(PROJ-44): …`).

   Of the candidates, read **only the title, the user stories and the Dependencies** — enough for one line each on what it changed. List them, recommend which belong in, and ask. A spec that could ship and be tested on its own stays its own feature — name those too and leave them. Never fold in a spec the user did not confirm.
2. **Read the confirmed ones in ID order, then read the code.** Later beats earlier; **the code beats both**, because it is what runs. For every point where two specs disagree, look at what the code does (routes, schema, components, tests — the way `/reverse-spec` reads them) and take that. Where the code cannot settle it — behaviour that is planned but not built, or code that contradicts every spec — it becomes an Open Question, never a guess.

   **More than about six specs in the group: do not read them all yourself.** Give each one to a sub-agent that returns only what the merge needs — its criteria and edge cases verbatim, its decisions, what it says it replaces, the files it names — and merge from those extracts; open a full spec only where two extracts contradict. Without sub-agents, do the same in rounds: extract one spec into a scratch note, drop it from mind, take the next. The `qa-report.md` and `tasks.md` of absorbed features are not read at all — nothing from them is carried over.
3. **Write the one spec.** Existing AC-/EC-IDs of `PROJ-X` stay as they are. Criteria taken over are appended with the next free IDs and carry their origin — `**AC-9** — … _(from PROJ-44)_`. A criterion a later spec replaced is removed, and the Decision Log gets the row: what it said, what replaced it, from which spec, today's date. User stories and Out of Scope are merged the same way; an Out of Scope line a later spec built anyway is deleted, not kept as a contradiction. Under the `# PROJ-X` heading, add the line (marker in English, the rest in the working language):

   > Consolidated from PROJ-44, PROJ-49, PROJ-80 on 2026-01-31. Criteria marked _(from …)_ were verified under their old spec, not under these IDs — the next `/qa` closes that.

4. **`design.md`:** merge the Technical Decisions tables (same rule: later wins, replaced ones named), and describe the structure the code has now. If the absorbed designs are too far apart to merge honestly, say so and hand off to `/architecture` instead of stitching.
5. **Nothing is ticked that was not tested.** Do not copy results from the absorbed `qa-report.md` files into this one. The status of `PROJ-X` stays what it was — a Deployed feature stays Deployed — and the hand-off names `/qa PROJ-X` as the step that verifies the criteria under their new IDs. The absorbed `tasks.md` files are history, not a plan: leave them where they are.
6. **Move the absorbed folders to `features/archive/`** — move, never delete; commits and old reports still point at those IDs. In `features/INDEX.md` their rows stay, with status **`Merged`** and the Spec cell `→ PROJ-X`. If this project's status legend has no `Merged` line (an INDEX from before this path existed), add it: _Merged — spec folded into another feature by `/refine`; folder in `features/archive/`_. "Next Available ID" does not change; a merged ID is never reused.

Show the user the consolidated spec next to the list of what was removed and why, before you write. One feature per run — a project with many scattered features consolidates each one when it is next touched, not all at once.

## The Discovery Interview
Same as in `/init` and `/write-spec`:
- **One question at a time** — never list multiple questions
- **Always provide a recommended answer** — the user confirms or corrects it
- **Follow the conversation** — don't follow a fixed script
- **Explore codebase first** if it can answer a question
- **Stop when you have full clarity** on what needs to change

## After the Interview: Update the Spec

Make the changes to `features/PROJ-X-*/spec.md`. After saving, re-read the file to verify the changes are present.

If acceptance criteria are added, removed, or reworded, keep the AC-ID / EC-ID scheme intact: append new criteria with the next free ID (AC-N, EC-N), and do NOT renumber existing IDs — downstream `tasks.md` and `qa-report.md` reference them by ID.

**If this refinement brings personal data into the feature, consult `/dsgvo` — and say that you are doing it.**
This is the moment that otherwise slips through. The original spec may have been harmless, and the refinement is what adds the comment box, the file upload, the contact field, or the free-text note users will fill with information about themselves. `/write-spec` only ever sees a feature once; every later change comes through here. If nobody looks now, nobody looks at all.

Announce it, run `/dsgvo PROJ-X`, and add what it proposes as **new acceptance criteria with the next free AC-IDs** — never by rewriting existing ones:
> "What you're adding here means the feature now stores what people write about themselves. I'm running a data-protection check before I update the spec — it usually adds requirements around deletion and data export."

When you present the updated spec, **point those criteria out by ID** and say where they came from, so the user can tell their own product decisions apart from legal obligations. Questions only a lawyer can answer go into Open Questions, not into an AC.

If the refinement changes nothing about personal data, skip it silently — do not perform a ritual check on a copy fix.

**If this refinement changes scope or technical design** (any path): flag that `design.md` and `tasks.md` may now be stale. Recommend re-running `/architecture` and then `/tasks`, since `tasks.md` is derived from the design and the AC-IDs. Set the feature status back to `Architected` (or `Planned`) in `features/INDEX.md` if it had already moved past that point.

### Maintain the Decision Log and Open Questions

**Close resolved Open Questions:**
For any `- [ ]` items in Open Questions that are now answered, mark them as `- [x]` and add a brief resolution note:
```
- [x] Should we support bulk delete? → No, deferred to P1 (2026-05-19)
```

**Log new decisions:**
Any decision made during this refinement session belongs in the Decision Log. Product decisions go in the Product Decisions table in `spec.md` (Decision | Rationale | Date). Technical decisions go in the Technical Decisions table in `design.md` (Decision | Rationale | Alternative considered | Trade-off | Date). Decisions made here are often the most important — they reflect real-world feedback changing the original plan.

**Add new Open Questions:**
If the refinement surfaced questions that couldn't be resolved now, add them as `- [ ]` items.

## Update Tracking Files
- Update `features/INDEX.md` if the description, the status, or the priority / dependencies (the Build order line) changed — it is the one place the feature map lives; `docs/PRD.md` carries no feature table
- Update `docs/data-model.md` if this refinement adds, removes, or reshapes an **entity, relationship, or ownership** — keep the app-wide map accurate at product altitude (no column types). If the data shape changed, this usually also means `/architecture` should re-run to redesign the feature's schema against the updated map.
- Update `docs/app-shell.md` if this refinement changes the **frame** — a new or removed top-level area, a different layout region, what an auth state sees, or a new shared page pattern. If you are refining the shell's *owning* feature, that map is the picture of what you just changed; keep them in step. If you are refining any other feature and find yourself changing the shell, that's the owner's contract — say so and refine there instead.

## Checklist Before Completion
- [ ] Opening question asked and path determined
- [ ] All interview questions resolved
- [ ] `spec.md` updated and verified (re-read after editing)
- [ ] AC-IDs / EC-IDs preserved (existing IDs not renumbered; new ones appended)
- [ ] Out of Scope updated if scope boundaries changed
- [ ] If the refinement brought personal data into the feature: `/dsgvo PROJ-X` run (announced beforehand), its criteria added as new AC-IDs and pointed out to the user as coming from the data-protection check
- [ ] Resolved Open Questions marked as `- [x]` with resolution note
- [ ] New decisions logged (Product → `spec.md`, Technical → `design.md`) with rationale
- [ ] If scope/design changed: flagged that `/architecture` and `/tasks` may need to re-run
- [ ] New Open Questions added if anything remains unresolved
- [ ] `features/INDEX.md` updated if status or dependencies changed
- [ ] `features/INDEX.md` updated if the description or the Build order changed
- [ ] `docs/data-model.md` updated if an entity/relationship/ownership changed
- [ ] `docs/app-shell.md` updated if the frame changed (area, region, auth state, page pattern) — or the change routed to the shell's owning feature
- [ ] Path 5 only: group confirmed by the user before anything was folded in; contradictions settled by the code or recorded as Open Questions; origin marked on every criterion taken over; no QA result copied; absorbed folders moved to `features/archive/`, rows set to `Merged`
- [ ] User has reviewed the changes

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
Depends on the path taken:
- Path 1, 2 or 3 (spec only, design unaffected): "Spec updated. Continue with the next step in your workflow."
- Path 1, 2 or 3 (scope/design changed): "Spec updated. The design and tasks may now be stale — run `/architecture`, then `/tasks` to regenerate them before building."
- Path 4 (split): "New spec created for PROJ-X. Run `/architecture` to design the technical approach."
- Path 5 (consolidated): "PROJ-X now holds the whole feature; PROJ-44, PROJ-49 and PROJ-80 are archived and marked Merged. From here on, changes to it go through `/refine PROJ-X`. Run `/qa PROJ-X` to verify the criteria that were taken over." · „PROJ-X enthält jetzt das ganze Feature; PROJ-44, PROJ-49 und PROJ-80 sind archiviert und als Merged markiert. Änderungen daran laufen ab jetzt über `/refine PROJ-X`. `/qa PROJ-X` prüft die übernommenen Kriterien."

## Git Commit
```
feat(PROJ-X): Refine feature specification — [brief reason]
```