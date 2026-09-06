# Spec: Mission Control wiring

The prototype (`src/tui/`, four review rounds, frames in `prototype/`) is the screen. This spec
replaces its fixture with real files and makes its actions real. Nothing in the layout changes
unless an assertion below says so. Reasoning first, then the work per Worker.

## Sources

Every field the `Snapshot` in `src/tui/model.ts` needs already exists on disk. No daemon, no new
hook event. `~/.factory` is `FACTORY_HOME` from `src/core/projects.ts`.

| Snapshot field            | Source                                                                                   |
|---------------------------|------------------------------------------------------------------------------------------|
| projects                  | `existingProjects()`; name is the basename                                               |
| project.missions          | `listMissions(path)` + `readState`; `state` from `missionRowState`; steps from `missionWorkflow` and `state.steps`; `wall` from step timestamps; `deviations.length` |
| mission.caffeinate        | `~/.factory/caffeinate/<session>.pid` exists and the pid is alive                        |
| mission.tokens            | transcript usage, see below                                                              |
| project.sessions          | `~/.factory/events/*.jsonl` whose last line is under 24h old, `cwd` inside the project, id not bound to any mission; `idleSince` is the last event's `at`; `preset` from the `SessionStart` detail or `quick` |
| session.question          | last assistant `text` block of the transcript when the session's last event is `Stop` or `Notification` |
| project.parts             | `scanProject(path)` → name, type, status, files                                          |
| inbox                     | every `state.json` gate with `status: open` → kind `gate`, or `triage` when the step is `accept` (body from `findings.md`); every session or bound mission whose last event is `Stop`/`Notification` and whose question is non-empty → kind `question`, `tab` is `factory-<mission>` or the session's preset |
| activity                  | transcript lines, see below                                                              |
| caffeinate                | `~/.factory/config.yaml` key `caffeinate`, default `auto`                                 |

### Transcript

Claude Code writes `~/.claude/projects/<slug>/<session>.jsonl` live, where `<slug>` is the cwd
with every `/` turned into `-`. One JSON object per line: `type` (`assistant`, `user`, …),
`timestamp`, `sessionId`, `isSidechain` (true for sub-agent lines), `message.content[]` blocks of
`text`, `thinking`, `tool_use { name, input }`, `tool_result`, and `message.usage` on assistant
lines with `input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`,
`output_tokens`. Read only the tail: keep a byte offset per file, parse new lines, never re-read.

Activity rows from it, non-sidechain lines only, newest last:

| Block                        | verb    | text                                                 |
|------------------------------|---------|------------------------------------------------------|
| `tool_use` Bash              | `Bash`  | `input.command` first line                            |
| `tool_use` Edit / Write      | `Edit`  | `input.file_path` relative to cwd                     |
| `tool_use` Read / Glob / Grep| `Read`  | path or pattern                                       |
| `tool_use` Agent             | `Agent` | `input.subagent_type` + description                   |
| `tool_use` AskUserQuestion   | `Ask`   | first question text                                   |
| `tool_use` other             | `Tool`  | the tool name                                         |
| `text` on an assistant line  | `Text`  | first sentence                                        |
| hook `Stop` event            | `Stop`  | empty                                                 |

Tokens: sum usage over all lines (sidechain included, that is the real spend) for the mission
total; per step, the lines whose timestamp falls between `startedAt` and `endedAt`. Shown as
`In · Cached · Out` where `Cached` is `cache_read + cache_creation`. This closes the roadmap line
"tokens per step" without touching `state.json`.

### Refresh

`fs.watch` on `~/.factory/events`, `~/.factory/caffeinate`, each project's `.factory/missions`
(recursive, macOS supports it) and the transcript of every session on screen. Any event schedules
one rebuild, debounced 200 ms. A 2 s poll rebuilds regardless, so a missed event costs two seconds.
A rebuild reads everything but transcripts from scratch; transcripts read from their offsets.

### Arrival

After each rebuild, an inbox item whose key (`project/origin/kind`) was not in the previous snapshot
goes through `notify()` in `src/tui/notify.ts`: bell, Warp's `\x1b]777;notify;Factory;<label>\x07`,
and the macOS notification. Not on the first snapshot.

## Actions

| Key   | Where          | Does                                                                                  |
|-------|----------------|---------------------------------------------------------------------------------------|
| `↵`   | MESSAGES gate  | `accept` records through `gate()` in `src/commands/gate.ts` with `cwd` = the project; `amend` and `reject` first take a one-line note in an OpenTUI input at the answer row, `esc` cancels |
| `o`   | mission row    | no live session: `openSession()` as `mission open` does; live: toast naming the tab     |
| `x`   | mission or session row | `SIGTERM` to the claude process whose argv holds `--session-id <id>`, found with `pgrep -f`; toast the outcome; a second `x` within 5 s sends `SIGKILL` |
| `y`   | PARTS confirm  | the install and uninstall paths the CLI uses: install goes through the `--parts` sequence for the added names with the installed set kept, uninstall through the same removal `uninstall` runs, scoped to the dropped names. If `uninstall` has no per-part path, add `removeParts(project, names)` to `src/core` and make `uninstall` use it too |
| `c`   | anywhere       | writes `caffeinate: on|off|auto` to `~/.factory/config.yaml`, keeping `vars`. `on`: spawn `caffeinate -i` and record `~/.factory/caffeinate/control.pid`. `off`: kill every pid in that folder. `auto`: kill `control.pid` only |
| `t`   | mission row    | `readState`, set `attention`, `deviate(state, …, 'set from Mission Control')`, `writeState` |
| `z` `f` `?` `n` | as prototype | `n` is removed                                                                 |

`hook-factory` reads `caffeinate` from `~/.factory/config.yaml` at run time: `off` never starts,
`on` starts on `SessionStart` and never stops, `auto` is today's start-on-prompt, stop-on-Stop.

## Workers

Serial, one at a time. Each commits on `mission/control` with `git commit -- <paths>` and hands
off in the Worker format.

### W1, read side

`src/tui/live.ts` builds a `Snapshot` from the sources above; `src/tui/transcript.ts` holds the
tail reader, activity mapping and token sums; `src/tui/watch.ts` the watchers and poll. `factory`
without `--fixture` runs live; `--fixture` stays for look reviews. `factory --frames <dir>` renders
the live snapshot to text frames the way `scripts/tui-snapshot.ts` does and exits, so a gatekeeper
can check live data without a tty. Owns A-SRC-*, A-TRX-*, A-RFR-*.

### W2, write side and docs

Actions, arrival notify, the hook's caffeinate mode, `removeParts` if needed. Docs: `docs/design.md`
gains the pane grid, the semantic step colours (gate `#d7af5f`, implement `#6b8fd9`, gatekeeper
`#5fb0b0`), rule colour `#3a3a3a`, and the key bar; `docs/terminology.md` rows Mission Control,
Inbox, Activity, Caffeinate; README command table (`factory`, `factory menu`, keys); AGENTS.md
architecture block (`src/tui/`) and the `config.yaml` sentence; `docs/roadmap.md` drops the three
Mission Control lines and the tokens line. Owns A-ACT-*, A-NTF-*, A-DOC-*.

## Decisions

- Transcript over hook events for activity and tokens: richer, already written, no new hook.
- Triage is not a third mechanism: a gate on the `accept` step renders as triage.
- The fixture stays: the four-round review loop was worth more than the 226 lines.
- Budget: `src/tui/` plus `src/commands/control.ts` under 1700 lines with the fixture, up from the
  intent's 800. Four review rounds added activity, help, attention, hidden closed, notify.
- `n` simulate goes; `--frames` replaces it as the tty-less check.

## Risks

- `fs.watch` recursive on a folder that appears later (a project's first mission) is missed until
  the poll. Accepted, two seconds.
- A transcript can be 10 MB. The offset reader never re-reads, but the first read on start parses
  the whole file once per visible session. Cap at the last 2 MB for the first read.
- `pgrep -f --session-id` matches the Mission Control process if it ever carries that flag. It does
  not, and the pattern includes the id.

## Handoff

`Step`, `Done`, `Acceptance` with each owned id as pass, fail or unchecked and the evidence, then
only fields with content: `Undone`, `Commands`, `Issues`, `Deviations`, `Faster ways`.

## Added after the prototype closed

The human's notes on the fourth round, folded in before implement finished.

### W3, screen and prompts

- Step colours by kind, simpler than the prototype's: `human` (grill, intent) green `#a8a968`;
  `gatekeeper` (accept, verify, validate) amber `#d7af5f`; `agent` (implement, research, any
  worker or investigator step) blue `#6b8fd9`; `technical` (spec, condense, merge) dim `#6e6e6e`.
  Kind comes from the workflow step's role and gate: role `worker`/`investigator` → agent,
  `verify`/`validate`/`accept` → gatekeeper, `grill`/`intent` or `gate: human` on the first half
  → human, else technical. The glyph keeps the lifecycle colour. Agent prompt colours follow:
  Worker blue, Investigator cyan, Verifier and Validator yellow, Summarizer stays magenta because
  Claude Code has no grey.
- `?` is a right-side panel at full height, replacing the right pane while open: `KEYS` grouped
  as before, then a rule, then `HOW FACTORY WORKS` in under twelve lines: a mission is one unit
  of work on its own branch with a workflow copied in as its graph; the Orchestrator session
  grills, writes intent, and runs the steps; gates stop for the human; gatekeepers check work
  they did not write; `mission close` merges. Last line: what to do next, `factory mission new
  <name>` in a project, or `/mission` inside a session. `?` or `esc` closes it.
- `f` full activity hides the header and status bar too, the key bar stays; `↑↓` scroll the
  activity while it is full, `↵`, `f` or `esc` restore.
- Git line counts per mission on the left: `+120 −34` after the tokens, green and red, from
  `git diff --shortstat <trunk>...<branch>` run in the mission's checkout, open missions only,
  refreshed on the 2 s poll, never blocking the render (last value shown until the next result).
- `parts/validate/agents/Validator.md`: the Validator writes and maintains short reusable scripts
  under `.factory/validator/` (bun or node) that drive the UI or CLI straight to the thing under
  test, keeps an index in `.factory/validator/scripts.md` with one line per script (what it
  reaches, when written), reuses them on the next round, and prunes broken or obsolete ones. The
  file stays under 80 lines. Owns A-UI-*, A-VAL-1.

### Out of this mission, tracked

- Processes per project: `factory.yaml` `processes:` map, a PROCESSES block on the project's right
  pane, `↵` starts and stops, output to `.factory/logs/<name>.log` shown in the activity pane.
  Stub mission `processes`, right after this one closes.
- Creating a mission from the screen: name, workflow, opens the tab. Same stub, second item.
