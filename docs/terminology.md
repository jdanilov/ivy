# Terminology

Single source of names for the Factory. Agents and humans use these words and no synonyms.
The rules behind each name live in `docs/parts.md`, `docs/missions.md` and `docs/design.md`.

## Things you install

| Term      | Meaning                                                                                              |
|-----------|------------------------------------------------------------------------------------------------------|
| Factory   | This repo and its CLI. Installs parts, tracks missions across projects, runs Mission Control.        |
| Project   | A git repo registered with the Factory. Owns `.factory/` and an optional `factory.yaml`.             |
| Part      | One installable unit, copied in and tracked in a manifest. Type skill, tool, fixture or mcp; scope `project` (into `.claude/`) or `global` (into `~/.claude/`), what `part.yaml` recommends until `~/.factory/config.yaml` says otherwise — `off` is a scope too. |
| Preset    | Spawn-time bundle for a session: prompt file, settings overlay, MCP list, model, effort.             |
| Workflow  | An ordered YAML list of steps that says how a mission is run. Every mission starts on `intent`; `mission shape <preset>` appends the rest. |
| Step      | One node in a workflow. Has a role, optional `parallel` group, `gate`, `loop`.                       |
| Gate      | A step that blocks until a decision. `human` gates are answered by `factory gate answer`, `orchestrator` gates by a recorded decision with a reason. |
| Loop      | A step that returns to an earlier step while findings are accepted. `max` caps the rounds.          |
| Round     | One pass through a loop: gatekeepers check, orchestrator triages, human accepts or amends, implement resumes. |
| Decision  | One fork an agent took that a reviewer might have taken differently: a row in `decisions.md` with a confidence and its reason. `auto`, `waiting`, then `accepted` or `overruled`. A round's fix-or-skip plan is one decision, never one per finding. |
| Autonomy  | Mission-level dial: `full`, `partial`, `none`. Decides which decisions wait on the human.            |
| Recipe    | A project command list in `factory.yaml`: `verify`, `e2e`, `deliver`.                                |
| Manifest  | `.factory/daemons.yaml`, a project's committed list of what it runs in the background: one entry per Daemon or Service. Whether an entry runs on this machine is not in it — that is `~/.factory/config.yaml`. The parts' own record, `.factory-manifest.json`, is always named in full. |
| Claim     | `.factory/claim` naming the mission that owns the main checkout. Other missions are offered a worktree. |
| Snippet   | One line a part owns in the project's `AGENTS.md`, under a section the part names.                  |
| Roadmap   | `docs/roadmap.md`, decided and unstarted work in the order to do it, written for the human choosing the next mission. `/retro` appends under `## Unsorted`, a human orders and prunes. |

## Things that run

| Term         | Meaning                                                                                           |
|--------------|---------------------------------------------------------------------------------------------------|
| Session      | One Claude Code process: in a Warp tab, or under `claude --bg` with a tab attached to it, or started by hand. Known to the Factory through hook events. |
| Mission      | One unit of tracked work. Folder `.factory/missions/<YYYY-MM-DD-name>/`, ignored by git, branch `mission/<name>`. One workflow, one session. |
| Stub         | A mission with an intent and no branch. `mission open` promotes it.                               |
| Archive      | `.factory/archive/<dir>`, where `mission archive` moves a closed mission's folder. Only `mission list --all` reads it. |
| Daemon       | A periodic command a project declares in its Manifest: `every`, optional `atMost` and `when`, run by the Supervisor. Exit 0 is ok, exit 0 with a last stdout line `{"skip":…}` is skip, non-zero is fail. Glyph `↻`. |
| Service      | A long-running command a project declares in its Manifest: `detached` or in a `tab`, with a `restart` policy. Runs while it is enabled; `restart` acts only while it is. Glyph `▶`. |
| Supervisor   | The one Factory process per machine that runs every enabled Daemon and Service. `factory supervisor start`, a liveness-checked pid file under `~/.factory/supervisor/` as its lock; `install` writes the one OS unit that keeps it alive at login. |
| Orchestrator | The interactive Fable session bound to a mission. Plans, delegates, asks, triages, records steps. Never implements. Never merges by hand. |
| Worker       | Opus sub-agent that implements one step with clean context. Serial, one at a time per mission.    |
| Gatekeeper   | Verifier or Validator. Checks work it did not produce against `acceptance.md`. Never edits code. |
| Verifier     | Opus gatekeeper. DRY, KISS, YAGNI, SoC, slop baseline plus the contract. Runs the `verify` recipe. |
| Validator    | Opus gatekeeper. Drives the running system as a user. Runs the `e2e` recipe. `browse` by default. |
| Investigator | Sonnet read-only sub-agent for code search, codegraph, web and transcript research. Runs in parallel. |
| Summarizer   | Headless Sonnet run over a whole mission. Condenses artefacts, writes `retro.md`, proposes memories. |
| Question     | A sub-agent request for human input, raised by returning blocked with the question. The Orchestrator asks and re-spawns with the answer. |
| Retro sweep  | `/retro` over every closed mission's `retro.md`: one item at a time, applied, stubbed, roadmapped or dropped. |

## Docs a mission produces

Agent-facing except `intent.md`. Short, reasoning-first, format in `docs-format`.

| File          | Written by   | Content                                                                          |
|---------------|--------------|----------------------------------------------------------------------------------|
| intent.md     | Human        | Goal, done criteria, extra (guardrails, start from). The one file the human reads; the intent form writes it. |
| spec.md       | Orchestrator | Steps for workers, files touched, decisions, risks, recovery per step.           |
| acceptance.md | Orchestrator | Contract: one assertion per line — id, kind (verify or validate), claim, check, owning step. |
| findings.md   | Gatekeepers  | Findings by assertion id with blast radius, effort, confidence. One round each.  |
| decisions.md  | Hook and CLI | One decision per row: `id`, `step`, `by`, `confidence`, `summary`, `status`, `note`. |
| handoffs/     | Sub-agents   | Final-message handoff saved by hook: step, done, acceptance, then decisions, undone, commands, issues, deviations, faster ways. |
| retro.md      | Summarizer   | Feedback from agents to the human: tools, context bloat, wrong memories, workflow defaults. |
| workflow.yaml | Factory CLI  | The mission's own copy of the workflow. Orchestrator edits with reasons.         |
| state.json    | Factory CLI  | Current step, round, session id, gates, deviations, worktree, wall time and tokens per step. |

## Runtime

| Term            | Meaning                                                                                         |
|-----------------|-------------------------------------------------------------------------------------------------|
| Events          | `~/.factory/events/<session>.jsonl`, one line per hook event. The bus. No broker: every surface reads the files. |
| Mission Control | The Factory TUI, `factory` with no arguments. Reads the files the CLI writes, writes through the CLI's own functions. |
| Inbox           | Every open gate, waiting decision, waiting question and daemon Alert across all projects. Each names the command that answers it. |
| Alert           | A Daemon's failed run or a Service's death, held in its `state.json` and drawn as one Inbox row; a death no `restart` policy will retry turns the row off beside it. Answered by `factory daemon log <key>`, or `A` on the row, which draws the same log in the Foot: reading the log is the acknowledgement, and a next success clears it too. |
| Messages        | The right pane over the Inbox: the selected item's body and its answering command. Read-only.   |
| Foot            | The bottom pane: ACTIVITY by default, DECISIONS on `D`, a daemon or service row's log on `A`, for whatever the left column has selected. The drawn tab's own key sizes it: a third of the body, the whole screen, the tab row alone. |
| Message box     | Under the foot on `↵`: a message to the selected row's session, posted to its inbox socket. One draft per row, kept until sent. |
| Caffeinate      | Whether the Mac is held awake: `auto` per turn, `on` per session, `off` never. Key `caffeinate` in `~/.factory/config.yaml`. |
| Changes         | Warp's own diff panel. The Factory does not render diffs.                                       |
| Tab config      | Warp TOML in `~/.warp/tab_configs/`. The Factory writes one per mission and opens it by URI.    |
