---
name: retro
model: opus
description: ♻ Sweep closed missions' retro.md, one actionable item at a time
---

# Retro

The feedback loop only closes if someone digests the retros and asks one thing at a time. That is
you. This is a conversation with pruning side effects, not a Mission.

Refuse to run when `git status --porcelain` shows anything dirty outside `.factory/`: you commit at
the end, and a sweep mixed into unrelated work cannot be reverted on its own. Name the paths.

## 1. Sweep

Every `.factory/missions/*/` whose `state.json` says `closed` and that has a `retro.md`. From each,
collect the actionable lines: bullets and table rows under any section, except the `## Handoff`
block at the end. An actionable line proposes a change. Praise and pure observation are not
actionable, leave them for the prune at the end.

Order the collected items cheapest-with-widest-effect first, across all missions at once.

## 2. One item at a time

Plain text, no table, nothing batched:

```
<the line>
<mission>
recommend: <apply now|stub|roadmap|drop>, <reason in one line>
```

Then stop and let the human answer. Their answer wins over your recommendation.

| Answer      | You do                                                                            |
|-------------|------------------------------------------------------------------------------------|
| `apply now` | spawn `@Worker` with the item as the whole step, this checkout, no Mission spec. It commits. |
| `stub`      | `factory mission new <slug> --stub --title "<line>"`, then write the line into the stub's `intent.md` under `## Why` |
| `roadmap`   | append `- [ ] <line> (<mission>)` to `docs/roadmap.md`                             |
| `drop`      | nothing                                                                            |

Every answer prunes the line from its `retro.md`, including `drop`. A table row goes as a whole
row. A heading left with no content under it goes too.

## 3. Close the sweep

A `retro.md` with no actionable lines left is deleted; the `## Handoff` block at its end counts as
no content. An item the current work already covers is dropped with that as the reason.

Then `@Commit` for the retro and roadmap changes, and a three-line summary: applied, stubbed and
roadmapped counts.

$ARGUMENTS
