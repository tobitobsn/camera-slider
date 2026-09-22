---
name: cleanup
description: Tidy the documentation of finished features — remove resolved questions, compact the decision logs, drop fixed bugs from QA reports, and archive deployed features in INDEX. Meaning-preserving and proposal-based; run after /deploy. Pass a feature (e.g. PROJ-2) or run with no argument to sweep the whole project.
argument-hint: "optional: feature to tidy (e.g. PROJ-2) — omit to sweep every deployed feature"
user-invocable: true
---

# Cleanup

## Goal
Keep the project's documents lean and truthful once features are finished. Over a long build, specs, designs, and QA reports accumulate content that was useful in the moment and is now noise: questions that have long been answered, decisions that a later decision overruled, bugs that were fixed three releases ago. Noise is not harmless — it makes documents longer than anyone will read, and stale entries actively contradict the current truth. Remove what no longer carries information, keep every bit that does.

**You remove noise, never meaning.** If deleting something would change what the app is supposed to do, you are in the wrong skill — that is `/refine`.

## When to run
- After `/deploy`, on the feature(s) that just went live.
- Periodically over the whole project as it grows.

Never on a feature that is still being worked on. `spec.md` is the contract and is read-only during `/build` — a feature in **In Progress** or **In Review** is skipped, always, no exceptions.

## Two modes
- **`/cleanup PROJ-X`** → tidy that one feature's folder.
- **`/cleanup`** (no argument) → read `features/INDEX.md` and sweep **every** feature with status **Deployed**, plus the project-level files. Report per feature so the user can approve selectively.

Features with any other status are listed as skipped, with the reason, and left untouched.

## The invariants (read before touching a file)

These are not guidelines. Breaking one of them does more damage than the mess you are cleaning.

1. **Meaning-preserving.** Every removal must leave the documents saying exactly what they said about the product. You compact and delete; you never rewrite an intent, soften a requirement, or "improve" wording.
2. **The AC → Task → Test chain is untouchable.** Never remove, renumber, or reword an `AC-ID` or `EC-ID` in `spec.md`, never remove a task's AC references in `tasks.md`, never remove an AC's result row in `qa-report.md`. That chain is how the project proves what was built and verified. Cleanup that breaks traceability is worse than no cleanup.
3. **Never invent work.** If a document is already clean, say so and move on. A run that finds nothing is a successful run — do not manufacture findings to look useful, and do not lower your bar to fill a report.
4. **When unsure, flag — don't decide.** Anything you are not confident about goes to the user as an explicit question with your recommendation. Uncertainty is a reason to ask, never a reason to delete.
5. **Propose before you touch anything.** Nothing is written until the user approves.

## Workflow

### 1. Determine the scope
Read `features/INDEX.md`. Resolve the argument (one feature) or collect every **Deployed** feature (sweep). List what you will examine and what you are skipping and why:

> "PROJ-2 and PROJ-5 are deployed — I'll look at those. PROJ-7 is still In Review, so I'm leaving it alone."

If nothing is eligible, say exactly that and stop. That is a complete, successful run.

### 2. Read before judging
For each in-scope feature, read the whole folder — `spec.md`, `design.md`, `tasks.md`, `qa-report.md` — plus `features/INDEX.md`. You cannot judge whether a question is resolved without seeing what the rest of the documents now say. Never propose a removal based on a section read in isolation.

### 3. Find the candidates
Look for exactly these. This list is exhaustive — do not extend it on your own initiative:

**`spec.md`**
- **Open Questions that are resolved.** A question is resolved when its answer is visible elsewhere: an AC now covers it, a decision records it, or the shipped feature plainly answers it. Remove the question. If the answer is *only* in the question, fold it into the relevant AC or decision **first**, then remove — losing the answer is not cleanup.
- **Product Decisions that a later decision overruled.** Remove the superseded entry; keep the one that won.
- **Nothing else.** ACs, edge cases, user stories, Out of Scope, and dependencies all stay.

**`design.md`**
- **Open Questions that are resolved** — same test as above.
- **The Technical Decisions table.** Compact it, do not empty it: keep **Decision** and **Rationale** for every entry, drop the **Alternative considered**, **Trade-off**, and **Date** columns once the feature is live and the alternative is no longer a live option. The *what* and the *why* always survive.
- **Superseded technical decisions** — remove outright; these are the ones that actively mislead, and removing them is the most valuable thing this skill does.
- Never touch the component structure, data model, or access rules — `/build` and future features read those.

**`qa-report.md`**
- **Bugs that were found, fixed, and re-verified.** Remove the full reproduction block; keep one line per bug under a `### Previously Fixed` heading: ID, title, severity. That line is cheap and tells a future reader which areas proved fragile.
- **Bugs whose fix you cannot confirm stay in full.** Confirm via a later QA run, the git history, or the AC results — never by assuming.
- **Never touch** the AC/EC result rows, the security section, or the **Not Verified In This Run** section. An unverified item stays unverified until someone verifies it; removing it would turn "not checked" into "fine", which is exactly the failure this project guards against.

**`tasks.md`**
- Leave it alone. A fully checked task list of a shipped feature is the *T* in AC → Task → Test.

**`docs/tech-debt.md`** (sweep mode only)
- Move **Resolved** rows into the `## Archive (Resolved)` section at the bottom, one line each: ID, path, what, resolving commit. Nothing else moves — `Open`, `Planned` and `Accepted` rows and the reasons the user wrote stay exactly as written.

**`features/INDEX.md`** (sweep mode only)
- **Slim every row that carries more than a row should** — in every status, not only Deployed. A row is the name, one sentence, the status and the link; INDEX is loaded into every session, so a bug log, a list of measurements or half a spec in a table cell is paid for at every start, by every feature, forever. **Move, never delete:** a bug and its fix go to that feature's `qa-report.md` (under `### Previously Fixed`, or in full if nobody re-verified it), a decision to the Decision Log in `spec.md` or `design.md`, anything else to the end of `design.md` under a heading that says where it came from. Write it there first, re-read it, and only then cut the row down to its sentence. Propose this per row like everything else — the user sees where each piece goes.
- Move **Deployed** features into a collapsed `## Archive (Deployed)` section at the bottom, keeping the same table columns. Nothing is deleted; the active table just stays readable as the project grows. Skip this if there are fewer than about ten deployed features — an archive with two rows in it is its own kind of clutter.

**The memory file** (`.ai-eng-kit` → `memory` names it; sweep mode only)
- The kit never writes into it outside its managed block, and neither do you — everything between the `AI-ENG-KIT` markers is the scaffolder's. But the file is loaded into every session like INDEX, and it grows from the outside: the agent's own "remember this" notes appended at the end, or a hand-off or session-log routine that appends its section instead of replacing it. Look for **the same heading more than once** and for dated session protocols. Propose keeping the latest of each and removing the older copies — git has them — and name the cause, so the user can fix the routine that stacks them: a working state belongs in a file of its own that nothing imports, replaced on every write. Never remove a convention, a command or anything that is not a repeated or dated block.

### 4. Propose, in plain language
Present everything as a list the user can decide on, grouped by file, each with the reason it is safe to remove. Never show a raw diff — the audience does not read code:

```
PROJ-2 — Task List
  spec.md
    · Remove open question "Should tasks be sortable?" — answered by AC-4, which
      specifies drag & drop.
    · Remove decision "Store as flat array" — overruled by "Store keyed by ID"
      two rows below.
  design.md
    · Compact 6 technical decisions to Decision + Rationale (removes the
      alternatives and trade-off columns; every decision and its why stays).
  qa-report.md
    · Condense 3 fixed bugs to one line each (BUG-1, BUG-2, BUG-4).

  ⚠️ Needs your call
    · Open question "Do we need an undo?" — I found no AC and no decision that
      answers this. It may still be genuinely open. Keep it?
```

Separate the two groups clearly: what you are confident about, and what you want the user to decide. Then ask for the go-ahead. **Nothing is written before that.**

### 5. Apply what was approved
Apply exactly what the user approved — not more, not less. If they say "yes but keep the undo question", keep it and do not revisit it.

### 6. Verify the chain
After writing, re-check the AC → Task → Test chain for every touched feature: every `AC-ID` in `spec.md` still has a task in `tasks.md` and a result in `qa-report.md`. If anything broke, **restore it immediately** and tell the user what happened. On a feature whose `spec.md` says `> Migrated from the AI Coding Starter Kit` or `> Reconstructed from code`, there is no `tasks.md` and never was — check only the `qa-report.md` half, and do not report the missing task half as damage you caused. The same holds for criteria marked _(from PROJ-…)_ under a `> Consolidated from` line. Leave `features/archive/` alone entirely — it is the record of what was merged, not documentation to tidy. `/audit` is the fuller version of this check — recommend it if you touched several features.

### 7. Report
Say plainly what changed, per file. If nothing was found in step 3:

> "I went through PROJ-2 and PROJ-5 — nothing to clean up. Both are already tidy."

That is a complete answer. Do not pad it.

## Important
- **Never delete an AC-ID, EC-ID, or a task's AC reference.** If a cleanup seems to require it, you have found a `/refine` job — stop and say so.
- **Never touch a feature that isn't Deployed** (or that the user named explicitly and confirmed).
- **Never rewrite for style.** Shorter is not the goal; less noise is. A long AC that carries meaning stays long.
- One git commit per run, listing what was removed — that commit is the archive. Nothing is written to a separate archive file; git already remembers, and a second copy of the removed content would defeat the purpose.
- Removed content is recoverable via `git revert` or `git show`. Tell the user this once, when they approve — it is what makes approving easy.

## Checklist
- [ ] Scope resolved; non-deployed features listed as skipped with reasons
- [ ] Every in-scope feature folder read in full before any judgment
- [ ] Only the candidate types above considered — no self-invented categories
- [ ] Answers folded into an AC or decision before the question carrying them was removed
- [ ] Technical decisions compacted (Decision + Rationale kept), not emptied
- [ ] Fixed bugs condensed to one line; unconfirmed fixes left in full
- [ ] "Not Verified In This Run" section untouched
- [ ] Uncertain items flagged for the user instead of decided
- [ ] Proposal presented and approved before any file was written
- [ ] AC → Task → Test chain re-verified after writing
- [ ] Result reported plainly — including "nothing to do" when that is the truth

## Handoff
_Say this in the project's working language. The quote is the **content**, not the wording — translate it; only command names (`/tasks`), feature IDs and file paths stay as they are. An English closing line under a German document is the half-translated output the working-language rule forbids._
> "Cleaned up [N] feature(s). The documents are shorter and nothing changed about what the app does.
> Everything removed is still in the git history if you ever need it.
> - Run `/audit` if you want a full check that all documentation is still in sync."

If nothing was found:
> "Nothing to clean up — your documents are already tidy."

## Git Commit
```
docs(PROJ-X): Clean up feature documentation

- Removed N resolved open questions
- Compacted N technical decisions
- Condensed N fixed bugs to summary lines
```
Sweep across several features:
```
docs: Clean up documentation for PROJ-A, PROJ-B, …

- Removed N resolved open questions across N features
- Compacted N technical decisions
- Archived N deployed features in INDEX.md
```
