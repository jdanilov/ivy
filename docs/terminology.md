# Terminology

Single source of names for the Factory. Agents and humans use these words and no synonyms. Draft, 2026-09-04.

## Things you install

| Term      | Meaning                                                                                                   |
|-----------|-----------------------------------------------------------------------------------------------------------|
| Factory   | This repo and its CLI. Installs parts, tracks missions across projects, runs Mission Control.            |
| Project   | A git repo registered with the Factory. Owns `.factory/` and an optional `factory.yaml`.                  |
| Part      | One installable unit: skill, tool, fixture, mcp, plugin, or global. Symlinked, tracked in a manifest.     |
| Plugin    | A Claude Code plugin shipped by the Factory. `factory` holds the function hooks and the `ask` tool.       |
| Preset    | Spawn-time bundle for a session: prompt file, settings overlay, MCP list, model, effort.                  |
| Workflow  | An ordered YAML list of steps that says how a mission is run. Order is the sequence.                     |
| Step      | One node in a workflow. Has a role, optional `parallel` group, `gate`, `loop`.                            |
| Gate      | A step that blocks until a decision. `human` gates are asked in the session and recorded by `factory gate answer`. `orchestrator` gates are recorded decisions with a reason. `factory step` refuses to pass a gate unanswered. |
| Loop      | A step that returns to an earlier step while findings are accepted. `max` caps rounds, `human_from` names the first round the human sees. |
| Round     | One pass through a loop: gatekeepers check, orchestrator triages, human accepts or amends, implement resumes. |
| Attention | Mission-level mode: `full`, `light`, `unattended`. Decides which gates and rounds reach the human.        |
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
| Orchestrator | The interactive Fable session bound to a mission. Plans, delegates, asks, triages, records steps, amends the workflow. Never implements. Never merges by hand. |
| Worker       | Opus sub-agent that implements one step with clean context. Serial, one at a time per mission.           |
| Gatekeeper   | Verifier or Validator. Checks work it did not produce against `acceptance.md`. Never edits code.        |
| Verifier     | Sonnet gatekeeper. DRY, KISS, YAGNI, SoC, slop baseline plus the contract. Runs the `verify` recipe.      |
| Validator    | Opus gatekeeper. Drives the running system as a user. Runs the `e2e` recipe. `browse` by default, dev-bridge where present. Recommends missing tooling. |
| Investigator | Sonnet read-only sub-agent for code search, codegraph, web and transcript research, recovery design. Runs in parallel. |
| Summarizer   | Headless Sonnet run over a whole mission. Condenses artefacts, writes suggestions, proposes memories. At close or on demand. |
| Question     | A sub-agent request for human input, raised by returning blocked with the question. The Orchestrator asks the human and re-spawns the sub-agent with the answer. |
| Triage       | Orchestrator's fix-or-skip plan over findings, one Inbox item per round. Human accepts or amends.        |
| Retro sweep  | `/retro` over every closed mission's `retro.md` in the project: one actionable item at a time, applied, stubbed, roadmapped or dropped, then pruned. |

## Docs a mission produces

Agent-facing except intent.md. Short, reasoning-first. Format in the `docs-format` fixture.

| File          | Written by   | When                | Content                                                                 |
|---------------|--------------|---------------------|-------------------------------------------------------------------------|
| intent.md     | Orchestrator | After grilling      | Why, goal, done criteria, guardrails. The one file the human reads.     |
| spec.md       | Orchestrator | After review        | Steps for workers, files touched, decisions, risks, recovery per step.  |
| acceptance.md | Orchestrator | With the spec       | Contract: one assertion per line, id, kind (verify or validate), claim, check, owning step. Every assertion ends pass, fail or unchecked. |
| findings.md   | Gatekeepers  | Each round          | Findings by assertion id with blast radius, effort, confidence. Triage recorded here. |
| handoffs/     | Sub-agents   | End of each step    | Final-message handoff saved by hook: step, done, acceptance, then undone, commands, issues, deviations, faster ways. A field is present only when it has content. |
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
| Mission Control | The Factory TUI on OpenTUI in a Warp tab. One screen: projects and missions left, Inbox or Parts right. |
| Inbox           | Open questions, gates and triage plans from all sessions. Plugin-drawn items answerable in place, orchestrator text jumps to the tab. |
| Changes         | Warp's own diff panel. The Factory does not render diffs.                                      |
| Tab config      | Warp TOML in `~/.warp/tab_configs/`. The Factory writes one per mission and opens it by URI.   |
