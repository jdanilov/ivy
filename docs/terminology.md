# Terminology

Single source of names for the Factory. Agents and humans use these words and no synonyms. Draft, 2026-09-04.

## Things you install

| Term      | Meaning                                                                                                   |
|-----------|-----------------------------------------------------------------------------------------------------------|
| Factory   | This repo and its CLI. Installs parts, tracks missions across projects, runs Mission Control.            |
| Project   | A git repo registered with the Factory. Owns `.factory/` and an optional `factory.yaml`.                  |
| Part      | One installable unit, symlinked and tracked in a manifest. Its type is skill, tool, fixture, mcp or plugin; its scope is `project`, installed into the project's `.claude/`, or `global`, installed into `~/.claude/` by `factory install --global` and shared by every session on the machine. |
| Plugin    | A Claude Code plugin shipped by the Factory. `factory` holds the function hooks and the `ask` tool.       |
| Preset    | Spawn-time bundle for a session: prompt file, settings overlay, MCP list, model, effort.                  |
| Workflow  | An ordered YAML list of steps that says how a mission is run. Order is the sequence. A mission starts on `intent` and `mission shape <preset>` appends a preset behind that step. |
| Step      | One node in a workflow. Has a role, optional `parallel` group, `gate`, `loop`.                            |
| Gate      | A step that blocks until a decision. `human` gates are asked in the session and recorded by `factory gate answer`. `orchestrator` gates are recorded decisions with a reason. `factory step` refuses to pass a gate unanswered. |
| Loop      | A step that returns to an earlier step while findings are accepted. `max` caps the rounds.               |
| Round     | One pass through a loop: gatekeepers check, orchestrator triages, human accepts or amends, implement resumes. |
| Decision  | One fork an agent took that a reviewer might have taken differently: a row in `decisions.md` with a confidence and its reason. `auto` when the mission's autonomy leaves it to the agent, `waiting` when the human owes an answer, then `accepted` or `overruled` with a note. A round's fix-or-skip plan over findings is one decision, never one per finding. |
| Autonomy  | Mission-level dial: `full`, `partial`, `none`. Decides which decisions wait on the human. Set at shape time, moved with `mission autonomy L`. |
| Recipe    | A project command list in `factory.yaml`: `verify`, `e2e`, `deliver`.                                     |
| Claim     | `.factory/claim` naming the mission that owns the main checkout. Other missions are offered a worktree.   |
| Snippet   | One line a part owns in the project's `AGENTS.md`, under a section the part names. Installed and removed with the part's files. |
| Roadmap   | `docs/roadmap.md`, a plain checklist of decided and unstarted work. `/retro` appends, a human prunes.     |

## Things that run

| Term         | Meaning                                                                                                  |
|--------------|----------------------------------------------------------------------------------------------------------|
| Session      | One Claude Code process in a Warp tab. Known to the Factory through hook events, spawned or adopted.     |
| Mission      | One unit of tracked work. Folder `.factory/missions/<YYYY-MM-DD-name>/` in the main checkout, branch `mission/<name>`. One workflow, one session. |
| Stub         | A mission with an intent and no branch: folder, workflow copy, `status: stub`, no claim. `mission open` promotes it. |
| Archive      | `.factory/archive/<dir>`, where `mission archive` git-moves a closed mission's folder so the history follows it. Only `mission list --all` reads it; `mission unarchive` puts the folder back. |
| Orchestrator | The interactive Fable session bound to a mission. Plans, delegates, asks, triages, records steps, amends the workflow. Never implements. Never merges by hand. |
| Worker       | Opus sub-agent that implements one step with clean context. Serial, one at a time per mission.           |
| Gatekeeper   | Verifier or Validator. Checks work it did not produce against `acceptance.md`. Never edits code.        |
| Verifier     | Sonnet gatekeeper. DRY, KISS, YAGNI, SoC, slop baseline plus the contract. Runs the `verify` recipe.      |
| Validator    | Opus gatekeeper. Drives the running system as a user. Runs the `e2e` recipe. `browse` by default, dev-bridge where present. Recommends missing tooling. |
| Investigator | Sonnet read-only sub-agent for code search, codegraph, web and transcript research, recovery design. Runs in parallel. |
| Summarizer   | Headless Sonnet run over a whole mission. Condenses artefacts, writes suggestions, proposes memories. At close or on demand. |
| Question     | A sub-agent request for human input, raised by returning blocked with the question. The Orchestrator asks the human and re-spawns the sub-agent with the answer. |
| Retro sweep  | `/retro` over every closed mission's `retro.md` in the project: one actionable item at a time, applied, stubbed, roadmapped or dropped, then pruned. |

## Docs a mission produces

Agent-facing except intent.md. Short, reasoning-first. Format in the `docs-format` fixture.

| File          | Written by   | When                | Content                                                                 |
|---------------|--------------|---------------------|-------------------------------------------------------------------------|
| intent.md     | Orchestrator | After grilling      | Why, goal, done criteria, guardrails. The one file the human reads.     |
| spec.md       | Orchestrator | After review        | Steps for workers, files touched, decisions, risks, recovery per step.  |
| acceptance.md | Orchestrator | With the spec       | Contract: one assertion per line, id, kind (verify or validate), claim, check, owning step. Every assertion ends pass, fail or unchecked. |
| findings.md   | Gatekeepers  | Each round          | Findings by assertion id with blast radius, effort, confidence.         |
| decisions.md  | Hook and CLI | As they happen      | One decision per row: `id`, `step`, `by`, `confidence`, `summary`, `status`, `note`. Sub-agents file theirs in the handoff, the Orchestrator with `factory decision add`. |
| handoffs/     | Sub-agents   | End of each step    | Final-message handoff saved by hook: step, done, acceptance, then decisions, undone, commands, issues, deviations, faster ways. A field is present only when it has content. |
| retro.md      | Summarizer   | Mission close       | Feedback from agents to the human: tools, context bloat, wrong memories, workflow defaults. Feeds a periodic chore mission. |
| workflow.yaml | Factory CLI  | At creation         | The mission's own copy of the workflow. Orchestrator edits with reasons.|
| state.json    | Factory CLI  | Every transition    | Current step, round, session id, gates, deviations, worktree, wall time and tokens per step. |

## Memory

| Term       | Meaning                                                                                              |
|------------|------------------------------------------------------------------------------------------------------|
| Memory     | Note files behind the `mem` MCP, indexed by Mnemosyne. `.factory/memory/` per project, `~/.factory/memory/` global. Titled notes with reasons. |
| Recall     | Prompt hook line within a 300 ms budget: `Relevant memories. High (n): id title. Medium (n): id title. Low (n).` High auto-expands. Expanded ids are not offered again in the session. Silent on miss. |
| Save       | Any agent stores a note it would otherwise rediscover.                                               |
| Dream      | User-triggered Summarizer pass that folds missions and transcripts into memory with confirmation.    |
| Terminology| This file. Projects keep `docs/terminology.md` for the domain model, linked from agents.md.           |

## Runtime

| Term            | Meaning                                                                                        |
|-----------------|------------------------------------------------------------------------------------------------|
| Events          | `~/.factory/events/<session>.jsonl`, one line per hook event. The bus. No daemon in v1.        |
| Mission Control | The Factory TUI on OpenTUI, `factory` with no arguments. One screen: the Inbox, `~ global`, projects, missions and unbound sessions left; Messages, Mission, Session or Parts right; the foot across the bottom. Reads the files the CLI writes and writes through the CLI's own functions. |
| Messages        | The right pane over the Inbox: the selected item's body and the command that answers it in the session. Read-only — Mission Control answers nothing. |
| Inbox           | Every open gate, waiting decision and waiting question across all projects, keyed `project/origin/label`. Each names the session command that answers it; a question names the tab that owns it. A key the last snapshot did not have rings the bell and raises a desktop notification. |
| Foot            | The pane along the bottom, DECISIONS by default and ACTIVITY on `A`, for whatever the left column has selected. Decisions are the mission's `decisions.md` rows; Activity is read from Claude Code's transcripts — `Bash`, `Edit`, `Read`, `Agent`, `Ask`, `Text`, `Tool` — plus the hook's `Stop`, newest last. `F` gives either the whole body. |
| Caffeinate      | Whether the Mac is held awake, `~/.factory/config.yaml` key `caffeinate`, cycled with `C`. `auto` holds it for the length of a turn, `on` from a session's start, `off` never. Pids live in `~/.factory/caffeinate/`, one per session plus Mission Control's own `control.pid`. |
| Changes         | Warp's own diff panel. The Factory does not render diffs.                                      |
| Tab config      | Warp TOML in `~/.warp/tab_configs/`. The Factory writes one per mission and opens it by URI.   |
