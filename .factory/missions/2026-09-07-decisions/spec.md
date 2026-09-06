# Spec: decisions, autonomy and the shaped graph

Four Workers, serial. Each one runs `bun x tsc --noEmit`, `bun scripts/test.ts` and `bash scripts/e2e.sh`
before its handoff, and updates the docs its change touches: `AGENTS.md`, README, `docs/terminology.md`,
`docs/design.md`. Every scratch run has `HOME` under `mktemp -d`; nothing runs `mission`, `step` or
`gate` inside `/opt/ed/ivy` except the Orchestrator.

| Worker | Ground                                                                    | Size  |
|--------|---------------------------------------------------------------------------|-------|
| W1     | workflows, shape, autonomy replacing attention, step add pointer, `failed` | ~120k |
| W2     | decisions: core, CLI, hook filing and injection, step start refusal, prompts | ~150k |
| W3     | global parts, archive, lazy HOME, sandbox, the remaining roadmap bugs      | ~200k |
| W4     | Mission Control: decisions foot, mission pane, keys, parts, archive, global | ~200k |

## W1 The graph

### Workflows

```yaml
# workflows/intent.yaml — every mission starts here unless --workflow or --quick says otherwise
name: intent
steps:
  - intent: { gate: human }
```

| Preset     | Steps                                                                                       |
|------------|---------------------------------------------------------------------------------------------|
| `story`    | intent (gate) → research (investigator) → spec → implement (worker) → review (parallel verify, validate; loop back implement max 3) → merge (gate) |
| `fix`      | intent (gate) → implement (worker) → verify (verifier, loop back implement max 2) → merge   |
| `chore`    | intent (gate) → implement (worker) → merge                                                  |
| `research` | intent (gate) → investigate (investigator, parallel sources, transcripts) → report          |
| `quick`    | work                                                                                        |

`grill`, `accept`, `condense` and `loop.human_from` disappear from the YAML, the parser, the dumper
and `WorkflowStep`. The Summarizer runs inside `merge`, before the gate opens: its handoff lands as
`merge-Summarizer.md`.

`stepRole(step)` in `workflow.ts` is the one place a runner is named: the explicit `role`, else
`verify → verifier`, `validate → validator`, else `orchestrator`. `ROLE_MODEL` beside it maps
worker and validator to opus, verifier, investigator and summarizer to sonnet, orchestrator to
fable. The TUI and `mission status` read both; the mission skill's table stays prose.

### Autonomy

`Attention` and `MissionState.attention` go. `MissionState.autonomy: 'full' | 'partial' | 'none'`,
default `partial`; `readState` fills it when the file lacks it, so old missions load. `mission new`
takes `--autonomy L`, `factory mission autonomy L` sets it with a `deviations` entry, `--attention`
is an unknown flag. `grep -rn attention src parts presets workflows docs README.md AGENTS.md` ends
empty; `retro.md` files of closed missions are history and stay.

### Shape

- `mission new <name>` without `--workflow` copies `intent.yaml`. `--quick` is `--workflow quick`.
  `--workflow W` stays for scripts and people who know.
- `factory mission shape <preset> [--autonomy L]`: refuses when the mission's workflow has any step
  after `intent` (`already shaped as story`) or when the preset does not start with `intent`
  (`quick has no intent step`). Appends the preset's steps after `intent` to `workflow.yaml`, adds
  pending `steps` entries, sets `state.workflow` to the preset name. When `intent` is done and the
  pointer sits on it, the pointer moves to the first appended step. Idempotent for the same preset.
- The pointer rule is one helper shared with `step add`: after an insert, when the step before the
  new one is done or skipped and the pointer stands on it or on the step that used to follow it,
  the pointer moves to the new step. This closes the `step add --after` roadmap line.
- `failed` leaves `StepStatus` and `RunState`.

### Prompts and scripts

- `parts/mission/skill.md`, still under 120 lines: the loop line becomes `◇ intent gate → ≋ spec →
  ● implement → ↻ review → ⊘ merge gate → close`; the Attention section becomes Autonomy (table
  above, in `decisions` terms once W2 lands); a Graph section of six lines: the presets, when each
  fits, that an unshaped mission is one whose `workflow.yaml` has nothing after `intent`, that the
  Orchestrator proposes shape and autonomy under `## Shape` in `intent.md` and runs `mission shape`
  after the gate; `merge` spawns the Summarizer first, then opens the gate.
- `presets/orchestrator/prompt.md` line 20 names autonomy instead of attention modes.
- `scripts/test.ts` and `scripts/e2e.sh` answer the intent gate where they walked `grill`; one new
  case: `mission new` unshaped, `mission shape story`, six steps, pointer on `research`;
  `mission new --quick` has one step.

## W2 Decisions

### The file

`decisions.md` in the mission folder, written temp plus rename:

```
# Decisions

| id | step | by | confidence | summary | status | note |
|----|------|----|------------|---------|--------|------|
| D1 | implement | worker | LOW | Do not implement auth, KISS and YAGNI | waiting | |
| D2 | implement | worker | HIGH | Reuse readJson for the manifest | auto | |
| D3 | review | orchestrator | MEDIUM | Triage r1: fix F1 F3, skip F2 cosmetic | overruled | fix F2 too |
```

A summary never holds `|`; the writer swaps it for `/`. Rows are parsed by splitting on `|` and
taking rows whose first cell starts with `D`. Ids are `D` plus the next integer.

`src/core/decision.ts`: `Decision`, `readDecisions(dir)`, `fileDecisions(dir, state, items)`,
`answerDecision(dir, id, verdict, note)`, `waitingDecisions(dir)`, `waits(autonomy, confidence)`.
Status at filing: `waiting` when `waits`, else `auto`. First answer wins: the same verdict again is
a no-op, a different one a refusal.

| Autonomy  | `waits` for                 |
|-----------|-----------------------------|
| `full`    | nothing                     |
| `partial` | `LOW`                       |
| `none`    | `LOW`, `MEDIUM`, `HIGH`     |

### CLI

```
factory decision add "<summary>" --confidence HIGH|MEDIUM|LOW [--step S] [--by R]   # defaults: current step, orchestrator
factory decision answer <id> accept|overrule [--note N]
factory decision list [--waiting]
```

`step start` refuses while `waitingDecisions` is non-empty: `✗ 2 decisions wait on the human: D1,
D4 — answer them with: factory decision answer D1 accept|overrule`. `step done` does not.

### Hook

`hook-factory.ts` is standalone and stays so: it appends rows itself with the same ten-line format
above, reading `state.autonomy` for the status. Two additions:

- On `SubagentStop`, after the handoff logic and regardless of whether a handoff was saved: parse a
  `Decisions:` block from the final text, lines `- HIGH|MEDIUM|LOW: summary` until a blank line or
  the next `Word:` header, `by` the lowercased `agent_type`, `step` the mission's current step.
- On `PostToolUse` with matcher `Agent`, and on `UserPromptSubmit`: when the mission has waiting
  decisions, emit them. `UserPromptSubmit` prints plain text. `PostToolUse` prints
  `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…"}}`. The text:
  `Decisions waiting on the human (autonomy partial): D1 LOW Do not implement auth, KISS and YAGNI.
  Surface each in the chat, record with factory decision answer <id> accept|overrule --note N, then
  continue.` Nothing is printed when nothing waits. `PostToolUse` is not logged to the events file.

`parts/hook-factory/part.yaml` gains `{ event: PostToolUse, matcher: Agent, command: … }` next to
the `events:` entry. Every project with the part picks it up through `update`.

### Prompts

- Every handoff template's optional-fields line names `Decisions`, with the format in one line:
  `Decisions: one line each, - HIGH|MEDIUM|LOW: what you chose and why in one sentence, only forks
  a reviewer might have taken differently`. Line caps hold: Worker 40, others 80.
- Mission skill: a Decisions section of eight lines. What a decision is, `decision add` for its own
  forks, triage filed as one decision per round with a confidence, the waiting rule: when the hook
  or `step start` names waiting decisions, ask the human in the chat, record every answer, go no
  further. An overrule is a signal: a new Worker with the note, a spec edit, or nothing.
- `presets/orchestrator/prompt.md`: one line on decisions.

### Tests

`scripts/test.ts`: file two decisions under `partial`, LOW waits, `step start` refuses, `answer`
clears it, `step start` passes; conflicting second answer refused; the hook as a child with a fake
`SubagentStop` input whose text carries a `Decisions:` block lands rows; a fake `PostToolUse` prints
the JSON with the waiting id and prints nothing once answered; the events file has no PostToolUse line.

## W3 Global parts, archive, roadmap bugs

### Global parts

- `Part.scope: 'project' | 'global'`, default project. `scope: global` in the five part.yaml files:
  `hook-safe-bash`, `permissions`, `commit`, `explain`, `research`. A global part with a `snippet`
  or `recipes` is a registry error: nothing global has a project root to run in.
- Built-in var `${root}`: `$CLAUDE_PROJECT_DIR` for a project, `$HOME` for global. `hook-safe-bash`
  and `hook-factory` commands use it. Resolved when the manifest entry is built, like every var.
- Global target dir is the home dir: files land in `~/.claude/…` through the same `linkPart`,
  manifest at `~/.claude/.factory-manifest.json`, settings and hooks both in `~/.claude/settings.json`
  (there is no `settings.local.json` at user level). One `scopeOf(targetDir)` or a flag threaded
  through `install`, `uninstall`, `status`, `update` decides the hooks file.
- `install|uninstall|status|update --global` act on the home dir with the registry filtered to
  `scope: global`. The project commands filter to `scope: project`; a global part is never listed
  for a project. `update <project>` unlinks a linked part whose scope is now global, the same path
  as a part the registry dropped. `install --parts commit <project>` refuses: `commit is a global
  part — factory install --global`.
- `install --global` refuses while any registered project's manifest lists one of the parts to
  install: `✗ commit is installed in /opt/ed/ivy, /opt/ed/igs — run factory update on each first`.
- `~/.factory/projects` does not list the home dir. `status --global` prints the usual table.

### Archive

- `factory mission archive <name>`: refuses unless `closed`; `git mv .factory/missions/<dir>
  .factory/archive/<dir>`; commits `🗄️ chore: archive mission <name>` when the tree is otherwise
  clean, else leaves the move staged and says so. `unarchive` is the reverse. Idempotent.
- `listArchived(cwd)` beside `listMissions`; `mission list --all` shows archived rows dim after the
  closed ones. Everything else ignores the archive folder.

### Roadmap bugs

- `FACTORY_HOME` becomes `factoryHome()` reading `process.env.HOME` at call time, `homedir()` as
  fallback; `home()` in `projects.ts` replaces every other `homedir()` in `src/`. `scripts/test.ts`
  aborts with a one-line `✗` before its first write unless `factoryHome()` starts with its temp dir.
- `resolveMission`, `listMissions` and `createMission` refuse when the main checkout's realpath is
  not in `loadProjects()`: `✗ /x is not a registered project — run: factory install /x`. The
  test and e2e scripts register their repos first. The hook is unaffected, it binds by claim.
- `mission open --dry-run` on a stub prints what it would do and writes nothing. `mission open` on a
  closed mission refuses: `✗ mission refit is closed`.
- `mission new` on a claimed checkout with no tty refuses: `✗ checkout claimed by mission X — add
  --worktree`.
- `status` without a manifest counts a `skipIfExists` file that exists as present, so a project
  seeded with templates shows them installed, not missing.
- `uninstall` removes `docs/` when it is empty afterwards. `rmdir` on a non-empty dir is a no-op.
- `files[] - source: sounds/` with a trailing slash, or a source that is a directory, expands at
  registry load to every file under it, targets `<target>/<relative>`, default target rules apply
  to the folder. The manifest holds the expanded list.
- Each closed line leaves `docs/roadmap.md`.

## W4 Mission Control

`src/tui/` stands at 2026 lines today, not the 1000 the intent named; the budget is 2200 after W4.

- `model.ts`: `Mission` gains `autonomy`, `archived`, `decisions: Decision[]`, loses `attention`
  and `caffeinate`; `StepRow` gains `role` and `model` through `stepRole` and `ROLE_MODEL`;
  `InboxItem.kind` is `gate | decision | question`; `Snapshot` gains `global: PartRow[]`;
  `Ui` gains `foot: 'decisions' | 'activity'` defaulting to decisions and `showArchived: false`.
- `live.ts` reads `decisions.md` per mission, `.factory/archive/*` as archived missions, and the
  global manifest through `scanProject(home())`. `stepKind` maps by role: gate human → human,
  verifier and validator → gatekeeper, worker and investigator → agent, else technical. Old names
  in closed missions' workflow copies (`accept`, `condense`, `grill`) still colour through the same
  rule by name.
- Left: a `~ global` row above the projects, opening PARTS on the home manifest; apply runs
  `install --global --parts` and `removeParts(home())`. Archived missions appear dim under their
  project only when `Z` has shown them. `Z` replaces hide-closed.
- Foot: DECISIONS for the selected scope, newest last, one row each:
  `D3  implement  worker  MEDIUM  summary…  ⊘ waiting` with `✓ accepted`, `✗ overruled: note`,
  and `auto` rows dim. `A` switches to ACTIVITY, `D` back, `F` full height for either with scroll.
- MISSION pane, two aligned columns:

  ```
  step         implement · worker · opus · round 2
  branch       mission/decisions · worktree —
  session      orchestrator · running 4m
  deviations   1 · skipped research: nothing to research
  ```

  `deviations` only when non-zero. Graph rows carry the runner: `orchestrator`, `worker · opus`.
  Colours: intent and merge human, research and implement agent, spec technical, review gatekeeper.
- MESSAGES: read-only. The answer row, note prompt, `record` and `ANSWERS` go. A gate row says
  `answer in the session: factory gate answer intent accept|amend|reject`, a decision row the same
  with `decision answer`. `notify` keeps ringing on a new key; a waiting decision is a new key.
- PARTS: description in place of the first file; `Y Confirm` and `N Cancel` capitalised; footer
  `↵ Apply · Esc Discard` while changes are pending.
- `T` cycles autonomy full → partial → none through `mission autonomy`. `H` archives or unarchives
  the selected closed mission through the CLI's function, a toast otherwise.
- KEYS: one key per line grouped by pane, then TERMS: mission, workflow, the four step kinds in
  their colours, gate, round, decision, autonomy. HOW FACTORY WORKS stays, one line on decisions.
- `fixture.ts`, `frames.ts` and `.factory/validator/keys.ts` follow; `factory --frames` stays green.
- `docs/design.md`: keys table, foot pane, step colour table by role. README keys. Terminology:
  `Decision`, `Autonomy`, `Archive` rows, `Attention` and `Triage` rows rewritten.

## Decisions

- The hook writes `decisions.md` itself rather than calling `factory`: a hook never fails, and a
  binary missing from PATH would lose decisions silently.
- `none` waits on HIGH too: three levels, monotonic, nothing to explain.
- Mission Control answers nothing. One answer path, the session, and the CLI records it.
- `mission new` requires a registered project. That is what makes a scratch HOME a sandbox.
- The `src/tui/` budget in the intent was wrong by half; 2200 is the real ceiling.

## Risks

- `PostToolUse additionalContext` reaches the model per the docs; the Validator drives a real
  Worker spawn once to see it in the Orchestrator's transcript.
- Closed missions carry `attention` and old step names; `readState` tolerates the field, the TUI
  colours by name.
- `install --global` on this machine touches `~/.claude/settings.json`: the Validator uses a scratch
  HOME, the human runs it for real after the merge.
