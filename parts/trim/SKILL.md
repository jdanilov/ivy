---
name: trim
description: ⌬ Architecture review that proposes cuts: simpler domain model, less coupling, fewer patches, same behavior. Pick cuts, then they are applied and checked
---

# Trim

`/check` asks "is this change correct?". `/trim` asks "what can go while every feature and fix
stays?". Run it after a feature lands, before commit, or on any area that grew patch by patch.

## 1. Scope

- `$ARGUMENTS` names files, a folder, a commit range or a plan dir: review that.
- Otherwise the branch: `git diff $(git merge-base HEAD <main>)` plus uncommitted and untracked
  files. On the main branch with a clean tree, ask what to review.
- Context: a few sentences on the task's goal. Read the plan or spec under `docs/plans/` when one
  matches the branch, so behaviors that must survive are known.

## 2. Review

Spawn one `@Trimmer` with the scope and the context. Do not review the code yourself.

## 3. Present

Relay terse, no preamble:

- The domain model, current → proposed, as the agent drew it, plus the term changes.
- The numbered cuts, worst tangle first, each with its `safe|check|risky` tag and line estimate.
- `Σ` line. Your own pick: which cuts you would take and which you would skip, one reason each.

When there are 5+ cuts or the domain model changes, offer an HTML report in one line. Build it
only when asked: one self-contained file in `$TMPDIR`, a before/after diagram per cut (use the
`archify` skill when installed), then `open` it and print the path.

Stop. Wait for the pick: numbers (`1,3,5`), `safe`, or `all`.

## 4. Apply

One cut at a time, `safe` first:

- Follow the project's agent file rules (migrations for persisted shapes, generated dirs, style).
- Update every caller, test and fixture the cut touches. Cut obsolete tests, keep behavior tests.
- After each cut run the project's checks: the commands its agent file names, else the
  `typecheck`, `lint` and `test` scripts in `package.json`. Red: fix it or undo that cut's own
  edits. Never `git checkout`, `stash` or `reset`: the tree may hold the user's uncommitted work.
- A cut that turns out wrong once you are in the code: undo it, say why, move on.

## 5. Terms

Write the agreed terms to the project terminology: `docs/terminology.md`, else `GLOSSARY.md`. One
section per feature or area, one bullet per term: `**term**: what it is. _Avoid_: synonyms.` Terms
only, no implementation notes. Neither file exists: ask before creating `docs/terminology.md`, open
it with a line saying it is maintained ad hoc (sections added as features settle, not a full
glossary), fill only the reviewed area, and link it from the agent file's `## Important Files`.

## 6. Report

Per cut `✓` applied, `✗` undone with the reason, `○` skipped. Net line delta before vs after
(`git diff --shortstat` plus `wc -l` of untracked files). Checks status. Anything left for the
user to verify by hand. Never commit.

A problem the user or another agent reports later that this review should have caught: add it to
the Factory's `parts/trim/` (one line, project-agnostic), then refresh the copies with `factory update`.

$ARGUMENTS
