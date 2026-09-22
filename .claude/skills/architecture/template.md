<!-- Write this design in the project's working language (memory file → Key Conventions). Both readers — the PM and /build — read that language. -->
# PROJ-X — Tech Design

> This is the technical design (the HOW) for the feature. Two readers: the PM (must approve) and `/build` (implements against it). No code — but implementation-grade precise: name every field with its type and constraints, state ownership/access, define states explicitly. Plain language, never vague.
> Owner: `/architecture`. The contract (WHAT) lives in `spec.md`; the task list lives in `tasks.md`.
> No status or date fields here — the feature's status lives ONLY in `features/INDEX.md`.

## Component Structure

Show which UI parts are needed as a visual tree:

```
Main Page
+-- Input Area (add item)
+-- Board
|   +-- "To Do" Column
|   |   +-- Task Cards (draggable)
|   +-- "Done" Column
|       +-- Task Cards (draggable)
+-- Empty State Message
```

## Data Model

Describe what information is stored, in plain language (no SQL, no code) — but name every field with its type and constraints, and state who owns each record:

```
Each task has:
- Unique ID
- Title (text, max 200 characters, required)
- Status (one of: To Do, Done)
- Created timestamp
- Belongs to: one user (the creator)

Access: users can only see and change their own tasks.
Stored in: Browser localStorage (no server needed)
```

## Behaviors & Access

_Backend features only — delete this section for frontend-only features._

Spell out the operations and their access rules in plain language. This is the contract `/build` builds the API against:

```
Operations:
- Create a task — any logged-in user; Title required, max 200 chars
- List tasks — returns only the current user's tasks
- Update a task's status — only the task's owner
- Delete a task — only the task's owner

Rejected when: not logged in, or acting on someone else's task.
```

## Dependencies

List only package names with a brief purpose:

- `package-name` — what it does and why we need it

## Settings the user makes

Measures this design relies on that live in a provider's dashboard, not in code — nothing `/build` can
write, everything the user has to click. One row each: `/tasks` turns them into `[user]` tasks. **When** is
`now` or `go-live`: `now` means the test environment can already hold it, so it is made before `/qa` and
`/deploy` will not ship while it is open; `go-live` means it needs the production URL or the host itself —
a payment webhook endpoint and its signing secret, an OAuth redirect URI, an allowed origin, a DNS record —
so nobody can make it before `/deploy` Step 2, and it never blocks `/qa` or Approved. Write "none" if the
design needs none.

| Setting | Where | When | Value | Why | → AC |
| --- | --- | --- | --- | --- | --- |
| _CAPTCHA on sign-in / sign-up_ | _Supabase → Authentication → Attack Protection_ | _now_ | _Turnstile, enabled_ | _removes automated signup_ | _AC-5_ |
| _Payment webhook endpoint + signing secret_ | _Stripe → Developers → Webhooks; secret into the host's environment variables_ | _go-live_ | _`https://<production-url>/api/webhooks/stripe`_ | _the provider has to reach production; tested locally with the CLI forwarding test events_ | _AC-3_ |

## Technical Decisions

Log every meaningful technical choice and WHY, in plain language a PM can follow —
reasoning, not implementation detail. This is the technical half of the Decision Log
(product decisions live in `spec.md`).

| Decision | Rationale | Alternative considered | Trade-off | Date |
| --- | --- | --- | --- | --- |
| localStorage over Supabase | No user accounts needed; data is device-local | Supabase Postgres | No cross-device sync; data lost if browser storage is cleared | YYYY-MM-DD |

## Open Questions

- [ ] Open technical question that came up during design and still needs an answer
