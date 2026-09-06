# Decisions, autonomy and the shaped graph

## Why

Agents make dozens of small decisions per mission and most are right. The wrong ones surface
weeks later in a code review, when undoing them costs more than the mission did. If each decision
is filed as one line with a confidence, the human can read them as they happen, overrule the few
that matter in the same Warp session, and tune how much reaches them with one dial. The same
mission cleans up what the Mission Control review found: an unexplained mission pane, a story
graph with two steps too many, a workflow picked before anyone knows the work, five parts that
belong to the user rather than a project, and the bugs the last two missions left on the roadmap.

## Goal

### Decisions

- `decisions.md` in the mission folder, one line per decision, agent-facing:
  `id | step | by | confidence | summary | status | note`. Status is `auto`, `waiting`, `accepted`
  or `overruled`. Note holds the human's words on an overrule. Nothing else is mandatory; the
  summary carries the reason (`Do not implement auth, KISS and YAGNI`).
- Sub-agents file through the handoff: a `Decisions` field, one line each, `HIGH|MEDIUM|LOW:
  summary`. The hook that saves the handoff appends them to `decisions.md`. The Orchestrator files
  mid-work with `factory decision add "<summary>" --confidence L`.
- Triage is a decision: the Orchestrator's fix-or-skip plan over a round's findings is filed as
  one decision with a confidence, so it waits or not under the same dial. No separate triage kind.
- Autonomy is per mission, `full | partial | none`, set at shape time, changed with
  `factory mission autonomy L` or `T` in Mission Control. It maps confidence to waiting:

  | Autonomy  | Waits on the human                        |
  |-----------|-------------------------------------------|
  | `full`    | nothing, every decision is `auto`         |
  | `partial` | `LOW`                                     |
  | `none`    | every decision, `HIGH` included           |

- Waiting is enforced twice. `factory step start` refuses while the mission has a `waiting`
  decision. And the hook injects the waiting list into the Orchestrator's context right after a
  sub-agent returns and on every prompt, the way codegraph injects code. The Orchestrator prompt
  gains one rule: surface waiting decisions to the human in the chat, record each answer with
  `factory decision answer D3 accept|overrule --note N`, go no further until none waits.
- An overrule is a signal, not a rollback. The Orchestrator decides what it changes: a new Worker
  with the note, a spec edit, or nothing. Nothing reopens a step by itself.
- Gates stay as they are, answered in the session. The Question kind stays as it is. Mission
  Control stops answering: MESSAGES becomes a read-only list of what waits, keyed by mission.

### The graph

- `story`: `intent` (gate) → `research` → `spec` → `implement` → `review` (verify and validate in
  parallel, loops back to implement, max 3) → `merge` (gate). Grill folds into intent, condense
  folds into merge: the Summarizer runs before the merge gate opens so the retro is part of what
  the human approves. `accept` is renamed `review`. `fix` and `chore` follow the same folding.
- Attention is retired everywhere: state, CLI, TUI, skill, docs. `human_from` goes with it. Who
  sees a round is decided by the triage decision's confidence and the mission's autonomy.
- Shape after grill. `mission new` without `--workflow` starts on the two-line `intent` workflow.
  At the intent gate the Orchestrator proposes a shape and an autonomy in `intent.md` under
  `## Shape`, the human accepts or amends, then `factory mission shape <preset> --autonomy L`
  appends that preset's steps after `intent`. The mission skill gets a short graph section: the
  presets, when each fits, how add, skip and loop customise one. Nothing to remove from the prompt
  for a quick mission: the rule applies only when `workflow.yaml` has no step after `intent`, and
  `mission new --quick` starts on the `quick` workflow, which has none.

### Mission Control

- Bottom pane shows DECISIONS by default: `D3 · implement · worker · MEDIUM · summary · ⊘ waiting`,
  answered rows carry `✓ accepted`, `✗ overruled: note`, auto rows dim. `A` switches to ACTIVITY,
  `D` back, `F` full height for either.
- MISSION pane rows aligned in two columns: `step` with runner and model and round, `branch` with
  worktree, `session` with preset and state, `deviations` only when non-zero, with reasons.
  Caffeinate and attention rows go. Each step in the graph names its runner: `orchestrator`,
  `worker · opus`, `verifier · sonnet`.
- Colours by step: intent and merge green, research and implement blue, spec grey, review yellow.
- PARTS shows each part's description. `Y` and `N` capitalised, a footer `↵ Apply · Esc Discard`
  while changes are pending.
- KEYS uses the height: one key per line by pane, then TERMS: mission, workflow, step kinds in
  their colours, gate, round, decision, autonomy.
- Archive. `factory mission archive|unarchive <name>` moves a closed mission between
  `.factory/missions/` and `.factory/archive/` with `git mv`. `H` does it on the selected mission,
  `Z` shows or hides archived ones, hidden by default. Closed missions get no special treatment.

### Global parts

- `scope: global` in `part.yaml` for `hook-safe-bash`, `permissions`, `commit`, `explain`,
  `research`. They link into `~/.claude/` with a manifest, hooks and settings there.
- `factory install|uninstall|status|update --global`. Mission Control gets a `~ global` row
  above the projects that opens PARTS.
- A collision refuses: a global part named by a project manifest, or a project part asked for
  globally. `update <project>` drops a part whose scope moved, so the migration is `update` on each
  project, then `install --global`.

### Roadmap bugs

- `step add --after X` moves the pointer when X is done.
- `FACTORY_HOME` reads `HOME` lazily. `scripts/test.ts` aborts before its first write unless the
  resolved home sits under its own temp dir.
- `failed` leaves `RunState`, nothing sets it.
- `gate | step | mission` refuse when the resolved project is not in `$HOME/.factory/projects`.
- `mission open --dry-run` writes nothing. `mission open` on a closed mission refuses: yesterday
  it rewrote the closed refit's session, which was reverted by hand.
- `status` without a manifest counts a present `skipIfExists` template as installed.
- `mission new` on a claimed checkout without a tty refuses.
- `uninstall` removes a `docs/` it created and left empty.
- A directory `source` in `files[]` links every file under it.

## Done

- [ ] A Worker handoff with two decisions lands both in `decisions.md`; under `partial` the LOW
      one is `waiting`, `step start` refuses, the Orchestrator's next context names it, `decision
      answer` clears it and `step start` passes.
- [ ] `mission new x` then `mission shape story --autonomy partial` yields the six-step story with
      `intent` done, and `mission new x --quick` never asks for a shape.
- [ ] No `attention` anywhere in `src/`, `parts/`, `presets/`, `workflows/`, docs.
- [ ] `install --global --yes` links the five parts into `~/.claude/` and `status --global` reads
      them back. `install --global` refuses while a registered project still has one of them.
- [ ] Mission Control shows DECISIONS at the foot, the aligned mission pane, runner per step, part
      descriptions, the new KEYS and archive with `H` and `Z`.
- [ ] Each roadmap line above is closed and removed from `docs/roadmap.md`.
- [ ] `docs/terminology.md`, `docs/design.md`, `AGENTS.md`, README describe what changed.

## Guardrails

- The home directory is a live system. Anything under `~/.factory` and `~/.claude` may be edited,
  never removed wholesale, and no test or gatekeeper command may resolve to the real home: the
  test guard above ships first and every scratch run has `HOME` under `mktemp -d`.
- No new MCP. Decisions travel through the handoff, the hook and the CLI, like everything else.
- No confidence caps, no calibration mitigation. Prompting and measurement come later.
- `src/tui/` stays under 1000 lines.

## Out of scope

Processes per project, Memory, Codex harness, mission creation from the screen.

## Shape

`story`, autonomy `partial`. Research is one Investigator pass on the hook injection points.
