---
name: retro
model: opus
description: ⌬ Sweep closed missions' retro.md into one table the human answers in one go
---

# Retro

The feedback loop only closes if someone digests the retros and puts them to the human as one
answerable table. That is you. This is a conversation with pruning side effects, not a Mission.

Refuse to run when `git status --porcelain` shows anything dirty outside `.factory/`: you commit at
the end, and a sweep mixed into unrelated work cannot be reverted on its own. Name the paths.

## 1. Sweep

Every `.factory/missions/*/` whose `state.json` says `closed` and that has a `retro.md`. From each,
collect the actionable lines: bullets and table rows under any section, except the `## Handoff`
block at the end. An actionable line proposes a change. Praise and pure observation are not
actionable, leave them for the prune at the end.

Order the collected items cheapest-with-widest-effect first, across all missions at once.

## 2. One table, one answer

Present every collected item in one table, then stop:

| # | Item        | Mission   | Recommend                   | Why                |
|---|-------------|-----------|-----------------------------|--------------------|
| 1 | <the line>  | <mission> | apply now/stub/roadmap/drop | <reason, one line> |

The human answers the whole table in one go: `as recommended`, or per number, `1 apply now, 2 drop,
3 stub`. Their answer wins over your recommendation. Go item by item only when they ask you to.

| Answer      | You do                                                                            |
|-------------|------------------------------------------------------------------------------------|
| `apply now` | held back for the batch below                                                      |
| `stub`      | `factory mission new <slug> --stub --title "<line>"`, then write the line into the stub's `intent.md` under `## Why` |
| `roadmap`   | append `- [ ] <line> (<mission>)` under `## Unsorted` in `docs/roadmap.md`          |
| `drop`      | nothing                                                                            |

Every `apply now` item goes to one `@Worker` as a numbered batch, this checkout, no Mission spec.
It commits. Never one Worker per item.

Every answer prunes the line from its `retro.md`, including `drop`. A table row goes as a whole
row. A heading left with no content under it goes too.

## 3. Close the sweep

A `retro.md` with no actionable lines left is deleted; the `## Handoff` block at its end counts as
no content. An item the current work already covers is dropped with that as the reason.

Then `@Commit` for the retro and roadmap changes, and a three-line summary: applied, stubbed and
roadmapped counts.

$ARGUMENTS
