---
name: retro
model: opus
description: ⌬ Review recent agent sessions and closed missions' retro.md: where time went, what went wrong, what to change in tools, instructions and how agents talk. One table you answer in one go
---

# Retro

Agents repeat a mistake until the harness around them changes: a tool, a rule, a doc, a hook, a
prompt. Find what the recent work wasted time on or got wrong, trace each to the gap that let it
happen, and put the fixes to the human as one answerable table. A conversation, not a Mission.

Refuse when `git status --porcelain` shows anything dirty outside `.factory/`: you commit at the end,
and a retro mixed into unrelated work cannot be reverted on its own. Name the paths.

## 1. Gather

- **Sessions.** From the project root: `bun <this skill's base dir>/scripts/digest.ts $ARGUMENTS
  --skip ${CLAUDE_SESSION_ID}`. No argument reviews every session since the last retro, `last` the
  latest, an id prefix that one. It prints an index, one line per session and per sub-agent: wall
  and active time, tool calls, `✗` errors, `⊘` denials, `⏸` interrupts, slow calls, agents, output
  tokens, context peak, and its digest file. A digest row is `U` user, `A` reply with its word
  count, `T` tool call with its duration and `✗` error, `↩` a background result; its header names
  reruns and churned files.
- **Mission retros.** Every `.factory/missions/*/` whose `state.json` says `closed` and that has a
  `retro.md`: its bullets and table rows, except the `## Handoff` block. Praise and pure
  observation are not actionable.
- **Harness.** The agent file and its `## Important Files`, `.claude/agents/`, `.claude/skills/`,
  the hooks in `.claude/settings*.json`. A file listed in a `.claude/.factory-manifest.json` (here
  or `~/.claude/`) is a copy: its source is under the manifest's `factory` checkout.

## 2. Analyse

Spawn one sub-agent per session worth it (user prompts plus any signal; skip one-prompt chats), in
parallel, each with its digest paths, the harness list and the lenses below. It reads the digests,
opens a sub-agent's digest when that row carries signals, greps the raw JSONL for one detail only,
and returns findings with evidence: `<session>:<HH:MM>` and a quote of one line.

| Lens         | Look for                                                                                   |
|--------------|--------------------------------------------------------------------------------------------|
| Time         | Long stretches between a prompt and its answer, slow calls, reruns of a failing command, churn on one file: what each bought |
| Wrong turns  | Work redone or reverted, approaches dropped, the user correcting or stopping the agent (`⏸`, "no", "I said"): the root cause is missing knowledge, a wrong or ambiguous rule, a misread or a skipped check |
| Tooling      | A manual step repeated that a script, endpoint or hook would do; a tool that failed, was slow or noisy; long output read for one line |
| Instructions | A rule broken → stricter, a hook or a test. A rule obeyed at a cost that bought nothing → loosen or scope it. A gotcha rediscovered → a knowledge doc. Context loaded and never used → trim |
| Talk         | The user asking what a reply meant (`/ww`), repeating a request, replies far longer than the question (word counts), questions the code answers, "done" claims the user then found broken |
| Delegation   | Sub-agents overspawned, duplicating work, briefed without the context they then searched for, returning bloated reports, on a heavier model than the job |
| Copying      | A hack copied from nearby code that the user or a reviewer then rejected                    |

A finding names the root cause, not the symptom, and one fix at the cheapest layer that would have
prevented it: a tool, then a hook or test, then a rule in the agent file, then a knowledge doc,
then prompt wording. Seen once is a hint, seen across sessions or agents a pattern: say how often.

## 3. One table, one answer

Merge the findings and mission retro lines, drop duplicates and what current work already covers,
order by time lost × frequency ÷ fix cost. Present them, then stop:

| # | Finding | Evidence | Fix | Where | Recommend |
|---|---------|----------|-----|-------|-----------|

`Where` is a path in this project, or `factory:parts/<part>/<file>` for a fix any project would want.
`Recommend` is `apply now`, `stub`, `roadmap` or `drop`, with a reason when it is not obvious.

The human answers the whole table in one go: `as recommended`, or per number, `1 apply now, 2 drop`.
Their answer wins. Go item by item only when they ask.

| Answer      | You do                                                                                    |
|-------------|-------------------------------------------------------------------------------------------|
| `apply now` | held back for the batch below                                                             |
| `stub`      | `factory mission new <slug> --stub` with the line under `## Goal` in its `intent.md`; no `/mission` here → `roadmap` |
| `roadmap`   | the roadmap the agent file names, in its format; a `factory:` item goes to the Factory's `docs/roadmap.md` under `## Unsorted` |
| `drop`      | nothing                                                                                   |

Every `apply now` item goes to one sub-agent per repo (`@Worker` when installed) as a numbered
batch. It follows that repo's agent file and commits with `@Commit`. Factory edits then reach the
copies by `factory update --all`; first `factory status` there: a `modified` copy is a local edit
the update would overwrite, ask the human.

Every answer prunes its line from the mission's `retro.md`, a table row as a whole row, a heading
left empty too. A `retro.md` left with only its `## Handoff` block is deleted.

## 4. Close

`bun <this skill's base dir>/scripts/digest.ts --mark`, so the next retro starts here. `@Commit`
the retro and roadmap changes. Three lines: applied, stubbed, roadmapped and dropped counts; the
change most worth watching at the next retro.
