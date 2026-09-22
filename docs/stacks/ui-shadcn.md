# shadcn/ui — the concrete procedures

> **Applies when `.ai-eng-kit` → `stack.ui` is `shadcn`.**
> If it is not, this file does not describe this project. **Never initialize a UI library in a
> project that already has one, or has none on purpose** — that is a dependency decision and it
> belongs to the user.

The principle lives in `/build`: use what the project already has before hand-rolling a component,
and apply the recorded design system rather than inventing a look per feature. This is only how
shadcn expresses it.

---

## Is it set up?

_Reached from `/verify-setup`, check 4._

`components.json` at the project root is the marker. In a project the kit scaffolded and where it is
missing, `npx shadcn@latest init` with the project defaults restores it.

In `mode: existing` this check is informational only: report what `stack.ui` records and move on.

## Adding a component

_Reached from `/build`._

Components are **copied into the project**, not imported from a package — that is the whole point of
shadcn, and it is why they live in `src/components/ui/` and are yours to edit.

```bash
npx shadcn@latest add <name> --yes
```

Two rules follow from that:

- **Look in `src/components/ui/` before building anything.** A second, hand-written version of a
  component that is already installed is the most common avoidable mess in a shadcn project.
- **Never recreate an installed component.** Custom components are compositions of the primitives
  that are already there.

## Applying the design system

_Reached from `/build` and `/architecture`._

`docs/design-system.md` is written by `/init` for every project, so treat it as binding rather than
optional: its colors, radius, typography and its hover/focus and light-dark rules apply to
everything built. shadcn takes its colors and radius from CSS variables, which is where those values
land.

Only ask for visual direction if that file is genuinely missing — a project that predates it.
