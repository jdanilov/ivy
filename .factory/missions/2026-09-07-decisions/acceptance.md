# Acceptance: decisions, autonomy and the shaped graph

One assertion per line, `id | kind | claim | check | owner`. `verify` from code and in-process runs,
`validate` by driving the CLI or the screen. Every run has `HOME=$(mktemp -d)` and its repo under that
temp dir; no mission, step or gate command runs in `/opt/ed/ivy`. Every id ends pass, fail or unchecked.

## Graph

- A-GRF-1 | verify | The five workflows carry no `grill`, `accept`, `condense` or `human_from`, and `story` is intent, research, spec, implement, review, merge with review looping to implement | read `workflows/`, `grep -rn human_from src workflows` empty | W1
- A-GRF-2 | validate | `mission new x` without `--workflow` has one step `intent` gated human; `mission shape story --autonomy partial` appends the rest, `state.workflow` is `story`, and a second `shape story` changes nothing | temp repo, `mission status`, `cat state.json` | W1
- A-GRF-3 | validate | With `intent` done, `mission shape story` moves the pointer to `research`; `mission shape quick` refuses; `mission new y --quick` has the single step `work` | temp repo, exit codes, `state.json` | W1
- A-GRF-4 | validate | `step add x --after intent` when intent is done and the pointer sits on research moves the pointer to `x` | temp repo | W1
- A-GRF-5 | verify | `attention` appears nowhere in `src`, `parts`, `presets`, `workflows`, `docs/*.md`, README, AGENTS.md; `autonomy` defaults to `partial` when `state.json` lacks it; `mission autonomy none` writes it with a deviation | grep, run | W1
- A-GRF-6 | verify | `failed` is gone from `StepStatus` and `RunState`; `stepRole` and `ROLE_MODEL` are the only place runners and models are named in `src/` | read, grep `opus` in `src/` | W1
- A-GRF-7 | verify | Mission skill under 120 lines with Graph, Autonomy and Decisions sections; the Summarizer runs in `merge` before the gate | `wc -l`, read | W1, W2

## Decisions

- A-DEC-1 | validate | `decision add "Do not implement auth" --confidence LOW` under `partial` lands a `waiting` row with id `D1`; a HIGH one lands `auto`; under `none` a HIGH one waits; under `full` a LOW one is `auto` | temp repo, `decision list`, `cat decisions.md` | W2
- A-DEC-2 | validate | `step start <next>` refuses while a decision waits, naming the ids; `decision answer D1 overrule --note "do it"` records status and note; `step start` then passes; `decision answer D1 accept` after that is refused, `overrule` again is a no-op | temp repo, exit codes | W2
- A-DEC-3 | validate | The hook run as a child with a `SubagentStop` input whose final text carries `Decisions:` with two lines appends two rows with `by` from `agent_type` and `step` from the mission | scratch mission, run `hook-factory.ts SubagentStop` with a fake input | W2
- A-DEC-4 | validate | The hook on `PostToolUse` prints the `hookSpecificOutput` JSON naming the waiting id, prints nothing once it is answered, and on `UserPromptSubmit` prints the same text plain; no `PostToolUse` line lands in the events file | scratch mission, fake inputs, `cat events` | W2
- A-DEC-5 | verify | `hook-factory` part.yaml carries a `PostToolUse` hook with matcher `Agent`; `update` on a project with the part rewrites `settings.local.json` with it | read, temp repo | W2
- A-DEC-6 | verify | Every handoff template names `Decisions` with the `- HIGH|MEDIUM|LOW: summary` format; Worker under 40 lines, every other prompt under 80 | grep, `wc -l` | W2
- A-DEC-7 | verify | A summary holding `|` is stored with `/` and `readDecisions` returns it whole; `decisions.md` is written by temp plus rename in both writers | read, run | W2
- A-DEC-8 | validate | A real `@Worker` spawned on a one-line task in a scratch mission with a LOW decision in its handoff: the Orchestrator's transcript shows the `additionalContext` after the Agent tool result | one spawn from a scratch session, read the transcript | Validator

## Global parts

- A-GLB-1 | validate | `install --global --yes` with a scratch HOME links `hook-safe-bash`, `permissions`, `commit`, `explain`, `research` into `$HOME/.claude/`, writes `$HOME/.claude/.factory-manifest.json` and the hook plus allow list into `$HOME/.claude/settings.json`; `status --global` shows them installed; `uninstall --global --yes` leaves `$HOME/.claude` without them | scratch HOME, `ls`, `cat` | W3
- A-GLB-2 | validate | `install --global` refuses naming the project while a registered project's manifest lists `commit`; after `update` on that project drops `commit`, it succeeds | scratch HOME with one registered temp project | W3
- A-GLB-3 | validate | `install --parts commit <project>` refuses as global; `install --yes <project>` and `status <project>` never list a global part | temp repo | W3
- A-GLB-4 | verify | Global hook commands resolve `${root}` to `$HOME` and project ones to `$CLAUDE_PROJECT_DIR`; a global part with a snippet or recipes is a registry error | read manifests, scratch part | W3

## Archive and roadmap bugs

- A-ARC-1 | validate | `mission archive x` on a closed mission moves its folder under `.factory/archive/` and commits when the tree is clean; on an open mission it refuses; `unarchive` puts it back; `mission list --all` shows archived rows dim | temp repo | W3
- A-BUG-1 | verify | `factoryHome()` follows `process.env.HOME` at call time; no `homedir()` call remains in `src/` outside `projects.ts`; `scripts/test.ts` refuses before its first write when its home is not under its temp dir | read, run with `HOME` pointed at a read-only dir | W3
- A-BUG-2 | validate | `mission new`, `mission status` and `step start` refuse in a git repo not listed in `$HOME/.factory/projects`; `install --yes` there makes them pass | temp repo, scratch HOME | W3
- A-BUG-3 | validate | `mission open --dry-run` on a stub leaves `state.json`, `git branch` and `.factory/claim` unchanged; `mission open` on a closed mission refuses and `state.json` is byte-identical after | temp repo, `cmp` | W3
- A-BUG-4 | validate | `mission new b` on a checkout claimed by `a`, stdin not a tty, exits 1 naming `--worktree` and creates nothing | temp repo, plain pipe | W3
- A-BUG-5 | validate | `status` in a repo with no manifest and a hand-copied `docs/terminology.md` shows the terminology part present, not missing; `uninstall --yes` after a full install leaves no empty `docs/` | temp repo | W3
- A-BUG-6 | validate | A scratch part with `source: assets/` links every file under it with targets `<target>/<relative>` and the manifest lists each | scratch part in a copy of the registry, temp repo | W3
- A-BUG-7 | verify | `docs/roadmap.md` no longer carries the nine closed lines and still carries Memory, Codex and the `mem` MCP | read | W3

## Mission Control

- A-UI-1 | validate | The foot shows DECISIONS by default with one row per decision of the selected scope, status glyphs as specified and auto rows dim; `A` shows ACTIVITY, `D` returns, `F` fills the screen for either and `↑↓` scroll | keys driver on a fixture with waiting, auto, accepted and overruled rows | W4
- A-UI-2 | validate | MISSION pane has the four aligned rows, `deviations` absent at zero, every graph row names its runner and model, and colours follow role: intent and merge human, research and implement agent, spec technical, review gatekeeper | spans capture | W4
- A-UI-3 | validate | MESSAGES lists gates, waiting decisions and questions with the session command to answer each and no answer row; `←`, `→`, `↵` on a row change nothing in `state.json` | keys driver, `cmp` | W4
- A-UI-4 | validate | PARTS shows each part's description, `Y Confirm` and `N Cancel` in the key bar, and `↵ Apply · Esc Discard` only while a toggle is pending | keys driver | W4
- A-UI-5 | validate | `~ global` sits above the projects and opens PARTS on the scratch home manifest; toggling and applying there runs the global install path | keys driver with a scratch HOME | W4
- A-UI-6 | validate | `H` on a closed mission archives it and the row leaves the list; `Z` shows it dim; `H` again unarchives; `H` on an open mission is a toast | keys driver on a temp repo | W4
- A-UI-7 | validate | `T` cycles full → partial → none and `state.json` follows; KEYS lists one key per line by pane and a TERMS block with the four step kinds in their colours, gate, round, decision, autonomy | keys driver, spans | W4
- A-UI-8 | verify | `src/tui/` totals under 2200 lines; `factory --frames` exits 0 on main; `bun x tsc --noEmit` clean | `wc -l`, run | W4

## Docs

- A-DOC-1 | verify | `docs/terminology.md` has Decision, Autonomy and Archive rows and no Attention or Triage row; `docs/design.md` keys table and step colour table match the screen; README command table has `decision`, `mission shape|autonomy|archive|unarchive`, `--global`, `--quick` | read | W1, W2, W3, W4
- A-DOC-2 | verify | `AGENTS.md` architecture block names `decision.ts`, the `intent` workflow, `scope`, `${root}`, the archive folder, and the invariants list has the decision wait, the sandbox refusal and the shape pointer rule | read | W1, W2, W3, W4
