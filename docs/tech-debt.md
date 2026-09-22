# Tech Debt — internal work with no visible behaviour

> The one list of work that changes no acceptance criterion: refactorings, test coverage, cleanup,
> and the "we know, later" decisions. Features live in `features/INDEX.md`; this file is for what is
> *not* a feature.
>
> - **Fed by `/map`:** every concern from `docs/codebase/concerns.md` lands here once, with the commit it
>   was found at, and is set to `Resolved` when a later map no longer finds it. `concerns.md` is the
>   snapshot; this is the history.
> - **Worked by `/refactor`:** with no argument it takes the top `Planned` row, then the top `Open` row
>   that is an oversized or mixed-responsibility file, and sets it `Resolved` when the split is green.
> - **Yours to edit:** change a status, add what you found yourself, write why something is `Accepted`.
>   The kit only appends rows and changes statuses — it never deletes a row or rewrites your text.
> - **Compacted by `/cleanup`** (Resolved rows move to the archive below), **checked by `/audit`** (rows
>   whose path no longer exists).

**Status:** `Open` — found, undecided · `Planned` — do next, in this order · `Accepted` — known,
deliberately left, with the reason · `Resolved` — gone, with the commit that removed it. A security
smell never becomes `Accepted`: it is a finding for `/security-check` or the owning feature's next
`/qa`, and this file only records that it is known.

| ID | Status | Path | What | Why it matters | Severity | Owning features | Found (commit) | Resolved (commit) |
|----|--------|------|------|----------------|----------|-----------------|----------------|-------------------|

## Archive (Resolved)
_Moved here by `/cleanup`, one line each: ID, path, what, resolving commit._
