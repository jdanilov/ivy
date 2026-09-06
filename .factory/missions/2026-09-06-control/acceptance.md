# Acceptance: Mission Control wiring

One assertion per line: `id | kind | claim | check | owner`. `verify` is checked by the Verifier
from code and CLI runs against scratch repos with `HOME=$(mktemp -d)`; `validate` by the Validator
driving `factory --frames` and the CLI the same way. Assertions state invariants, not counts of
the fixture. Every id ends pass, fail or unchecked in `findings.md`.

## Sources

- A-SRC-1 | validate | `factory --frames D` in a scratch HOME with two registered projects, one open mission with a running step and one stub, writes frames whose PROJECTS pane lists both projects, the mission with its step and the stub dim, and exits 0 without a tty | scratch HOME, `mission new` twice, `--frames`, read the frames | W1
- A-SRC-2 | validate | An open gate in a mission's `state.json` appears in MESSAGES with its file name and body; answering it through the CLI removes it on the next frame | `gate open`, `--frames`, `gate answer`, `--frames` | W1
- A-SRC-3 | validate | A registered project whose path is gone is absent from the frames and causes no error | dead path in `~/.factory/projects` | W1
- A-SRC-4 | verify | A session appears as unbound under its project only when its events file has a line under 24h old, its cwd is inside the project, and no mission's `state.session` names it | scratch events files, read `live.ts` | W1
- A-SRC-5 | verify | `mission.caffeinate` is true only when `~/.factory/caffeinate/<session>.pid` names a live pid | scratch pid file with a dead pid, read `live.ts` | W1
- A-SRC-6 | verify | Parts rows come from `scanProject`, not a second scan, and match `factory status` for the same project | run both on a scratch project | W1

## Transcript

- A-TRX-1 | verify | The tail reader keeps a byte offset per file and never re-parses a line it has seen; the first read of a file over 2 MB starts at the last 2 MB | read `transcript.ts`, feed a growing scratch jsonl | W1
- A-TRX-2 | validate | A scratch transcript with one Bash `tool_use`, one Edit, one Agent, one AskUserQuestion and one text block renders five ACTIVITY rows with verbs `Bash`, `Edit`, `Agent`, `Ask`, `Text` in timestamp order, sidechain lines excluded | scratch jsonl under `~/.claude/projects/<slug>/`, `--frames` | W1
- A-TRX-3 | verify | Mission tokens are the sum of every assistant `usage` in the transcript, sidechain included; a step's tokens are the lines between its `startedAt` and `endedAt` | scratch jsonl with known usage, read the snapshot | W1
- A-TRX-4 | validate | A session whose last event is `Stop` and whose last assistant text is non-empty appears in MESSAGES as a question with that text; after a `UserPromptSubmit` event it is gone | scratch events and transcript, `--frames` twice | W1

## Refresh

- A-RFR-1 | verify | Watchers cover `~/.factory/events`, `~/.factory/caffeinate`, every project's `.factory/missions` and the transcripts on screen; a rebuild is debounced to one per 200 ms; a 2 s poll runs regardless | read `watch.ts` | W1
- A-RFR-2 | verify | `render()` still destroys old rows rather than removing them, and a rebuild every 2 s for 5 minutes under the test renderer holds RSS flat within 20% | headless loop, `process.memoryUsage()` | W1

## Actions

- A-ACT-1 | validate | Accepting a gate in MESSAGES writes the same `state.json` fields as `factory gate answer <step> accept` would, and a second answer is refused not overwritten | scratch mission, drive via the test renderer or `--frames` with a key script, diff `state.json` | W2
- A-ACT-2 | validate | `amend` and `reject` take a note before writing; `esc` at the note cancels with nothing written | same | W2
- A-ACT-3 | verify | `o` on a mission without a live session calls `openSession` with the mission's preset; with a live session it only toasts | read `screen.ts`, scratch run with `--dry-run` equivalent | W2
- A-ACT-4 | verify | `x` targets only a process whose argv contains `--session-id <that id>`; a second `x` within 5 s escalates to `SIGKILL`; no match toasts and touches nothing | read, scratch `sleep` process with a fake argv | W2
- A-ACT-5 | validate | `y` on a pending toggle set installs the added parts and removes the dropped ones through the CLI's own paths; `factory status` afterwards shows exactly the new set with `0 modified` | scratch project, `--frames` before and after | W2
- A-ACT-6 | verify | `c` writes `caffeinate` to `~/.factory/config.yaml` without losing `vars`; `on` leaves a live `caffeinate -i` recorded in `control.pid`, `off` kills every pid in the folder, `auto` kills only `control.pid` | scratch HOME, `pgrep caffeinate` | W2
- A-ACT-7 | verify | `hook-factory` under `caffeinate: off` starts nothing on `UserPromptSubmit`; under `on` it starts on `SessionStart` and does not stop on `Stop`; under `auto` behaviour is unchanged | scratch HOME, fake `caffeinate` on PATH like the sound test | W2
- A-ACT-8 | verify | `t` writes `attention` through `readState`/`writeState` with a deviation entry naming Mission Control | scratch mission, read `state.json` | W2

## Notify

- A-NTF-1 | verify | A new inbox key after a rebuild triggers `notify()` once; the first snapshot triggers nothing; an item that only changed age triggers nothing | headless: two snapshots, a spy on `notify` | W2
- A-NTF-2 | verify | `notify()` writes `\x07` and the Warp `777;notify` sequence to the tty and runs `osascript` only on darwin, never awaited | read `notify.ts` | W2

## Docs

- A-DOC-1 | verify | `docs/design.md` carries the pane grid, the three semantic step colours, the `#3a3a3a` rule and the key bar; `docs/terminology.md` has rows Mission Control, Inbox, Activity, Caffeinate that match the screen | read | W2
- A-DOC-2 | verify | README command table has `factory` and `factory menu`; AGENTS.md architecture block lists `src/tui/` and the `config.yaml` sentence names `caffeinate`; `docs/roadmap.md` no longer lists the Mission Control or tokens lines | read | W2
- A-DOC-3 | verify | `src/tui/` plus `src/commands/control.ts` under 2200 lines (raised from 1700 after W1: read side is 600 lines); `bun x tsc --noEmit` clean; `bun scripts/test.ts` and `bash scripts/e2e.sh` exit 0 | run | W2

## Screen and prompts

- A-UI-1 | validate | MISSION steps colour by kind: grill and intent green, accept, verify and validate amber, implement and research blue, spec, condense and merge dim; the glyph keeps the lifecycle colour | `--frames` with span capture on a story mission | W3
- A-UI-2 | validate | `?` replaces the right pane at full height with KEYS groups, a rule, HOW FACTORY WORKS under twelve lines ending in the next command; `?` and `esc` close it | `--frames` help frame, key script | W3
- A-UI-3 | validate | Full activity hides header and status bar, `↑↓` scroll it, `↵`, `f` and `esc` restore the columns | key script under the test renderer | W3
- A-UI-4 | verify | Each open mission row carries `+N −M` from `git diff --shortstat <trunk>...<branch>` in its checkout, refreshed on the poll and never awaited by the render | scratch mission with a committed change, read `live.ts` | W3
- A-VAL-1 | verify | Validator.md instructs writing, indexing in `.factory/validator/scripts.md`, reusing and pruning short scripts under `.factory/validator/`; file under 80 lines; the two colour rows in agent prompts match the spec | read | W3
- A-UI-5 | validate | An unbound session appears, and its question reaches MESSAGES, only while `sessionLive` says its process is alive; a session row and its inbox label carry the short id so two `quick` sessions in one project are told apart | scratch events for a dead and a live session, `--frames` | W3
