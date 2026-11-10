---
name: ux-check
description: ⌬ Runtime UX and design review of changed screens via @UxCheck (layout shift, themes, contrast, input, keyboard, density, consistency, polish). Small defects are fixed, design changes proposed to pick, then applied and re-checked
---

# UX Check

`/check` reads the diff. `/ux-check` looks at the screen: what only shows at runtime, and what a
designer would send back after every check passed. Run it after UI work, before commit.

## 1. Scope

- `$ARGUMENTS` names files, a commit range, a screen or a plan dir: review that.
- Otherwise uncommitted changes; a clean tree: the last commit.
- Context: a few sentences on what the change does and which screens it touches. Read the plan or
  spec under `docs/plans/` when one matches the branch.
- `docs/ux.md` holds the project's driver, screens, safety and design rules. Missing, or its Driver
  still `<…>`: say which fallback @UxCheck will take (`browse`, or a static design pass).

## 2. Review

Spawn one `@UxCheck` with the scope and the context. Do not review the screens yourself: the
screenshots and probe output stay in its context.

## 3. Fix

The agent never edits; you apply. Each `Fix` item, as written, without asking:

- Follow the project's agent file rules (generated dirs, migrations, style, formatter).
- After the batch run the project's checks: the commands its agent file names, else the
  `typecheck`, `lint` and `test` scripts in `package.json`. Red: fix it or undo that item's edits.
  Then reload the app as `docs/ux.md` says.
- An item that turns out to need a choice once you are in the code: undo it, move it to Propose.
- Never `git checkout`, `stash` or `reset`: the tree may hold the user's uncommitted work.

## 4. Propose

Relay terse, no preamble: the applied Fix items one line each, then the numbered `Propose` list as
the agent drew it, sketches included, then your own pick, one reason per item.

Proposals tagged `auto` go straight to step 5, listed as applied. Then `AskUserQuestion`, `multiSelect`: one option per proposal, label `N · title`, description the
saving and the `safe|check|risky` tag. Up to 4 options per question and 4 questions; more
proposals than that, ask for numbers instead (`1,3`, `safe`, `all`, `none`). Stop and wait.

## 5. Apply

The picked proposals one at a time, `safe` first, under the rules of step 3. A proposal that turns
out wrong in the code: undo it, say why, move on.

## 6. Re-check

Spawn `@UxCheck` once more with `re-check` and the applied items (Fix and picked), each with its
files. It checks those items and any new shift around them. A failed Fix item: one more fix. A
failed proposal: report it. No third round.

## 7. Report

Per item `✓` applied and re-checked, `✗` failed with the reason, `○` skipped. Then the agent's
`Unchecked` and `Restored` lines, checks status, and its verdict line. Never commit.

A problem the user or another agent reports later that a check here should have caught: add it to
the Factory's `parts/ux-check/` (one row or line, project-agnostic), then `factory update --all`.

$ARGUMENTS
