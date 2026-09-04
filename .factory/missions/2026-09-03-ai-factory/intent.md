# Intent: AI Factory v1

Ivy evolves into the Factory: a harness around Claude Code that tracks missions across projects, runs each mission through a workflow with an interactive orchestrator and clean-context sub-agents, and installs its parts into any project in one command. Warp is the driver. Decisions come from grilling on 2026-09-03 and 2026-09-04 and the review on 2026-09-04. Names follow `docs/terminology.md`.

## Why

- Coding is 10x faster with agents. Planning, verification, review, merge and delivery are not. That gap sets throughput.
- Attention is the scarce resource. A mission may run longer and burn more tokens if it needs less of it. Priority order: quality, attention, wall clock, tokens.
- Today the Factory is simulated by hand: spawn Fable, grill, save, spec into a train of sub-agents, orchestrate, verify, and type at every seam. The typing at the seams is the first waste to remove.
- Working 1-5 missions in parallel is capped by attention per mission. In practice it is a backlog of Warp sessions waiting for input. Each mission must cost less attention: state at a glance, questions in one inbox, findings pre-triaged.
- The setup exists but is scattered across Ivy parts, igs-local skills and hooks, global ~/.claude config, and a dead cycle engine. Nothing installs it onto a new project or machine.
- Tests written after implementation confirm decisions. Acceptance must be defined before code and checked by agents that never saw the code.
- Agents fail when they must remember side tasks. Research, condensing, memory run as separate cheap agents, on demand or by workflow step.
- Confidence today: 90% in the code when the intent is captured, 80% in the orchestrator's decisions. The human steps in where there is entropy to remove or something to check by hand. Better models move that line.
- The best system does the job while staying invisible. Every part must earn its context tokens.

## Done looks like

- [ ] `factory` CLI replaces `ivy`. Install, uninstall, status, update for project and global parts from one manifest. Parts are data files.
- [ ] One command sets up a project. One command sets up ~/.claude on a new machine.
- [ ] A mission is created by `factory mission new` or by `/mission` in a running session. The orchestrator proposes a workflow, the human picks. Each way ends with a bound session and a folder in the main checkout.
- [ ] Workflows `story`, `fix`, `chore`, `research`, `quick` ship as YAML. `factory.yaml` per project replaces workflows by name and adds recipes. Any combination of steps, parallel groups, gates and loops is expressible.
- [ ] Steps are recorded by the orchestrator. Gates are drawn in the Warp session and mirrored in the Inbox, answerable in either. Gates cannot be passed unanswered. `factory mission close` performs the merge and refuses while a gate is open. Deviations are explicit edits with reasons. The orchestrator amends the mission's workflow mid-flight to cut waste.
- [ ] Acceptance loop: gatekeepers file findings against `acceptance.md`, the orchestrator triages them into fix and skip with reasons, the human accepts or amends from the Inbox, the mission returns to implement. Attention mode decides which rounds reach the human.
- [ ] Every assertion in `acceptance.md` names an owning step and ends the mission as pass, fail or unchecked.
- [ ] A sub-agent asks the human through the `ask` tool registered by the `factory` plugin. Verified inside sub-agents before anything depends on it. Fallback: the sub-agent returns blocked with the question, the orchestrator asks.
- [ ] Mission Control runs on OpenTUI in a Warp tab as one screen: projects and their missions with status on the left, Inbox or Parts on the right. Prototyped on fake data and reviewed before wiring.
- [ ] `state.json` records wall time and tokens per step. Mission Control shows them per mission.
- [ ] A mission claims the checkout. A second mission on a claimed project is offered a worktree. Work happens on a branch named after the mission and merges to main at close.
- [ ] `factory status` lists open missions with no live session. `factory mission resume` re-attaches. Breaking points and recovery are designed by a dedicated Investigator pass at the spec step.
- [ ] Sub-agent handoffs are captured from their final message by a hook. The Summarizer condenses the mission at close: drops mid-stage handoffs, writes `retro.md`, proposes memories.
- [ ] `mem` MCP: note files per project and global, recall line per prompt within a time budget, save from any agent, `/dream` with confirmation.
- [ ] The Factory caffeinates the Mac while any mission-bound session is mid-turn.
- [ ] igs runs on the Factory with no local generic skills and a clean manifest.

## Not in v1

- Telegram. Inbox is TUI-only. A bridge over the events files is v2.
- Daemon. The filesystem is the bus. A launchd agent arrives with Telegram.
- Diff rendering. Warp's Changes panel does that.
- tmux and Moshi. Phone access is Claude Code Remote Control on orchestrator sessions.
- Self-triggered compaction. autoCompactWindow per preset plus a PreCompact hook that injects mission focus.
- Container isolation. A mission records a sandbox mode, only `none` is implemented.
- Hormozi and headcount plugins. Presets carry a `plugins` list.
- Mission creation from Mission Control. Separate Sessions and Projects screens.
- `support` preset. Gmail and support are igs concerns.
- Branching `route` steps. Hard token budgets. Memory decay and duplicate merging.

## Decisions

| Topic         | Decision                                                                                              |
|---------------|-------------------------------------------------------------------------------------------------------|
| Repo          | Evolve Ivy in place. Linker, manifest, scanner, env check survive. Registry becomes one YAML per part.|
| Entities      | Mission plus Workflow. One mission type, many workflows.                                              |
| Workflow      | Ordered list of steps. Sequence is the order. A step may hold a `parallel` group, a `gate`, a `loop`. Schema below. |
| Fluidity      | Orchestrator proposes a workflow at mission start, human picks. Orchestrator edits the mission copy with reasons, guided by the priority order in the mission prompt. |
| Enforcement   | Recorded plus enforced gates. `factory step` refuses to pass an unanswered gate. `factory mission close` does the merge and refuses with an open gate. Orchestrator never merges by hand. |
| Measure       | Wall time and tokens per step in `state.json`, shown in Mission Control. Optimization data, not a limit. Attention is the target, not measured. |
| Loops         | Acceptance is a loop from day one. Gatekeepers find, orchestrator triages, human accepts or amends, mission returns to implement. `max` caps rounds. |
| Attention     | Mission-level mode. `full`: every gate reaches the human. `light`: first acceptance round at the orchestrator's discretion, human from round two. `unattended`: only merge reaches the human. |
| Triage        | Findings ranked by blast radius, effort, confidence, tied to assertion ids. Orchestrator proposes fix or skip per finding with a reason. One Inbox item per round, not per finding. Human accepts the plan or amends. |
| Tests         | Verifier runs the `verify` recipe. Without a Verifier in the workflow, the orchestrator runs it inline. Validator runs the `e2e` recipe and drives the app. Nothing runs them on every turn. |
| Substrate     | Warp tabs. Factory writes a tab config per mission and opens it by URI. One project tab config for servers and Mission Control. |
| Runtime       | No daemon. Hooks append to `~/.factory/events/`, missions live in folders, Mission Control watches.   |
| Discovery     | `hook-factory` command hooks report every session event. All sessions visible, spawned or adopted.   |
| Session       | One Claude session per mission, id fixed at spawn or adopt, resumed on restart.                       |
| Claim         | A mission claims the checkout in `.factory/claim`. A second mission on a claimed project is offered a worktree. One heavy mission per project, light ones in worktrees. |
| Branch        | Every mission works on `mission/<name>`. Merge to main is the last step, or the branch waits for the green light. |
| Recovery      | Spec step includes an Investigator pass listing breaking points and recovery per step. `factory status` shows open missions with no live session. |
| Roles         | Per workflow, not per Factory. Story: Orchestrator Fable, Worker Opus, Verifier Sonnet, Validator Opus, Investigator Sonnet, Summarizer Sonnet headless. `quick` is one session on any model. |
| Verifier      | Baseline DRY, KISS, YAGNI, SoC, slop check on every run, plus contract assertions. `/critic` aliases it on the diff. |
| Validator     | Project agnostic. Drives the app through the `browse` skill by default, dev-bridge where a project has one. Never starts the app, runs `e2e.ready` and asks if it fails. Evidence per assertion. Recommends a bridge or e2e suite when missing. |
| Contract      | `acceptance.md` written with the spec. One assertion per line: id, kind, claim, check, owning step. Coverage rule: every assertion owned, every assertion ends pass, fail or unchecked. |
| Handoffs      | Sub-agent ends with a handoff in its final message per template, or states why none is needed. A SubagentStop hook saves it to the mission folder. Not a side task. |
| Condense      | Summarizer step at close reads all artefacts and transcripts, drops mid-stage handoffs and dead ends, writes `retro.md`, proposes memories. |
| Self-improve  | Any agent that sees a faster or cheaper way logs it in its handoff. `retro.md` is the feedback channel from agents to the human: tools, context bloat, wrong memories, workflow defaults. Periodically spawns a chore mission. |
| Questions     | `ask` tool registered by the `factory` function-hooks plugin, backed by `$.ui.ask`. Drawn in the Warp session, mirrored in the Inbox, answered in either. Verified in sub-agents first. Fallback is blocked-return plus orchestrator ask. |
| Function hooks| Used for ask, gate, status line mission row, precompact focus, secret redactor, handoff capture. Event log stays command hooks. |
| Gates         | Plugin tool `gate`, same primitive as `ask`. Draws the gate in the Warp session and watches the Inbox file. First answer wins, the other prompt is dismissed. Never a blocking Bash call. `orchestrator` gates are recorded decisions. Fallback: native question plus `factory gate answer` by the orchestrator, Inbox read-only with jump. |
| Config        | Factory ships default workflows. `.factory/factory.yaml` replaces a workflow by name, adds recipes.   |
| Agent API     | `factory mission|step|handoff` CLI plus plugin tools `ask` and `gate`, documented in the `mission` skill. |
| Folders       | `.factory/missions/<name>/` in the main checkout, resolved through the worktree list. Committed on main at close. |
| Worktrees     | Offered when the checkout is claimed. Worktree holds code only, state.json records path and branch.  |
| TUI           | OpenTUI, one screen. Prototyped by a sub-agent on fake data, reviewed, then wired.                    |
| Deliver       | `factory mission close` merges `mission/<name>` to main locally. Release scripts stay project commands. |
| Presets       | Folder per preset: prompt, settings overlay, MCP list, model, effort, plugins. Full toolset everywhere.|
| SendMessage   | Enabled in orchestrator and worker presets only.                                                      |
| Compaction    | autoCompactWindow near 300k in the orchestrator preset. PreCompact hook injects mission focus.        |
| Caffeinate    | Inside `hook-factory`, keyed on mission binding. Global caffeinate part dropped.                      |
| Docs format   | `docs-format` fixture referenced by every agent prompt. intent.md is for humans, the rest for agents.  |
| Terminology   | `docs/terminology.md` in the Factory and a template part for projects, linked from agents.md.        |
| Memory        | `mem` MCP on Mnemosyne over note files. Integral to the Factory. Minimal design below.               |
| Research      | Grok primary plus a keyless YouTube transcript MCP.                                                   |
| Global        | ~/.claude config as global parts: skill overrides, deny list, statusline, keybindings, terse-visual, remote-control. |
| Diagrams      | Text symbol diagrams in terminal. Archify HTML on demand.                                             |

## Workflow schema

```yaml
name: story
steps:
  - grill
  - intent:    { gate: human }
  - spec                                   # spec.md, acceptance.md, recovery pass
  - implement: { role: worker }
  - accept:
      parallel: [verify, validate]
      loop: { back: implement, max: 3, human_from: 2 }
  - condense:  { role: summarizer }
  - merge:     { gate: human }
```

- Order is the sequence. No `needs`.
- `parallel` runs sub-steps together and joins before the next step.
- `gate: human` blocks on the `gate` tool, answered in the session or the Inbox. `gate: orchestrator` is a recorded decision with a reason.
- `loop.back` names the step to return to when findings are accepted. `max` caps rounds. `human_from` is the first round that reaches the human; earlier rounds are at the orchestrator's discretion.
- Attention mode overrides `human_from` and gates: `full` sets `human_from: 1`, `unattended` makes every gate `orchestrator` except merge.
- The orchestrator edits the mission's copy: `factory step add|skip|loop --reason`. Skipping the second validate round when nothing user-facing changed is the expected case.
- Chain, diamond and loop fall out of this. Branching is v2.

## Workflows in v1

| Workflow | Steps                                                                                      | Gates            |
|----------|--------------------------------------------------------------------------------------------|------------------|
| story    | grill, intent, spec + acceptance.md, implement, accept loop (verify ‖ validate), condense, merge | intent, merge, accept rounds per attention mode |
| fix      | short grill, implement, verify loop (max 2, orchestrator), merge                           | none             |
| chore    | grill, implement, merge                                                                    | none             |
| research | grill, investigators parallel, report to docs/research                                     | none             |
| quick    | one session, no sub-agents, any model. Unbound by default, can adopt a mission.            | none             |

The orchestrator may propose a different gatekeeper set at the spec step. The human decides.

## Acceptance loop

- Gatekeepers are the Verifier and the Validator. Both never edit code and never saw it before the round.
- Each writes to `findings.md`: assertion id, finding, blast radius, effort, confidence.
- The orchestrator triages: fix or skip per finding with a reason. Gatekeepers over-report and push toward over-engineering. Skipping is the default for anything outside the contract.
- One Inbox item per round carries the triage plan. The human accepts or amends in place, or is not asked when the attention mode allows.
- Accepted findings become the spec for the next implement round. The orchestrator drops gatekeepers that have nothing new to check in that round.
- Round `max` reached with open findings is a human gate regardless of mode.

## DX

The Warp session is the primary surface. Everything is answerable there. Mission Control mirrors and jumps.

| Waiting on          | Drawn by     | In Warp session | In Inbox                 |
|---------------------|--------------|-----------------|--------------------------|
| Orchestrator text   | Claude Code  | answer          | read, jump to tab        |
| Sub-agent `ask`     | plugin       | answer          | answer                   |
| Gate                | plugin       | answer          | answer                   |

Orchestrator free text is drawn by Claude Code, so the Factory only sees it through the Notification hook and cannot answer it from outside. Without function hooks every row becomes the first row.

Mission as experienced:

1. `/mission` in any session or `factory mission new`. Tab config written, tab opened, session bound, folder, branch and claim created. A claimed checkout offers a worktree here.
2. Orchestrator grills in the session, writes intent.md, proposes a workflow and attention mode. Intent gate in Warp, mirrored in the Inbox.
3. Spec and acceptance.md written. Investigator recovery pass runs in the background. No input.
4. Implement. Status line row: `story · implement · worker 14m · 310k`. Board shows the same. A worker question appears in the session and the Inbox.
5. Accept round. Gatekeepers in parallel, orchestrator triages. Light mode: round one decided and recorded, Board shows `round 1: 4 fixed, 3 skipped`. From round two the triage plan is a gate.
6. Condense, merge gate, `factory mission close`: merge, commit mission folder, release claim, drop worktree.

Three signals from one events file make the waiting-tab backlog readable: the Board flag, the status line row in each session, the Inbox text that says what is asked before switching tabs. Returning after hours you read the status line and the last triage plan, not the scrollback.

## Presets in v1

| Preset       | Model  | Use                                                    |
|--------------|--------|--------------------------------------------------------|
| orchestrator | Fable  | Bound to a mission. Runs the workflow.                 |
| quick        | Opus   | Unbound session for ad hoc work. Can adopt a mission.  |
| research     | Sonnet | Grok, browse lab, transcripts. Used by investigators.  |

Applied at spawn through `--append-system-prompt-file`, `--settings`, `--mcp-config`, `--strict-mcp-config`, `--model`, `--effort`, `--name`, `--session-id`, `--agents`, `--plugin-dir`.

## Mission Control

One screen. CLI commands are too much typing and menu shuffling for observability.

| Pane    | Shows                                                                        | Actions                              |
|---------|------------------------------------------------------------------------------|--------------------------------------|
| Left    | Projects, their missions, current step, waiting flag, age, wall time, tokens | open tab, adopt, kill                |
| Right   | Inbox: open questions and gates from all sessions, answerable in place      | answer                               |
| Right   | Parts: installed and available parts for the selected project              | space toggles a part, register       |

Sessions without a mission appear under their project as unbound.

## Memory

Minimal design. Files first, engine second.

- Notes are markdown files. `.factory/memory/` per project, committed. `~/.factory/memory/` global. Frontmatter: id, title, tags, source mission, date. Body: the reason, not the rule.
- Mnemosyne indexes both folders. The `mem` MCP exposes `recall`, `expand`, `save`.
- Recall runs from a UserPromptSubmit hook with a 300 ms budget. It prints titles and ids only: `Relevant memories. High (n): id title. Medium (n): id title. Low (n).` High auto-expands. Expanded ids are not offered again in the session. On a missed budget it prints nothing.
- Any agent calls `save` when it learns something it would otherwise rediscover: a project quirk, a decision, a dead end. The Summarizer proposes notes at condense. `/dream` runs the Summarizer over missions and transcripts and asks before saving.
- Project notes replace repeated agents.md edits across projects. Global notes hold preferences and reasons that apply everywhere.

## Parts

| Category | Parts                                                                                                                      |
|----------|----------------------------------------------------------------------------------------------------------------------------|
| skills   | mission, critic, commit, explain, research, browse, verify, validate, dream, archify, reasons, terminology                 |
| agents   | Worker, Verifier, Validator, Investigator, Summarizer, Commit, bundled into the skill that uses them                       |
| fixtures | hook-factory, hook-safe-bash, hook-codegraph-gate, permissions, docs-format                                                 |
| plugin   | factory: ask and gate tools, status line, precompact focus, secret redactor, handoff capture                                |
| mcp      | codegraph, mem, youtube-transcript                                                                                         |
| global   | skill-overrides, deny-list, statusline, keybindings, terse-visual, remote-control                                          |

Dropped: cycle, capture, glm, brainstorm, map, hook-sounds, caffeinate, support preset. Old skills get a brevity and reasons pass as a chore mission.

Stay in igs: nudge, support, analytics, doc-id-drift, release-audit, touch-file-hook, dev-bridge.

## Build order

1. Story loop as prompts and files on existing sub-agents, run on igs, with wall time and tokens recorded. Includes the acceptance loop and the coverage rule.
2. CLI rename, YAML parts, mission folder, state.json, gates, claim and worktrees, `mission/<name>` branches.
3. Events bus and Mission Control. Function-hook spike decides whether `ask` ships or the fallback does.
4. Memory, condense, `/dream`, global parts, research workflow.

## Context

- Factory (the company) Missions talk: orchestrator, serial workers, two validators, contract before code, handoffs, Mission Control. Transcript and screenshots in `docs/`.
- Graph engineering: chain, diamond, branch, loop. Weight test: does a step need the previous result. Transcript in `docs/`.
- Function hooks: present and gated in Claude Code 2.1.257 with `$.ui`, `$.model`, `$.http`, `$.store`, `$.fs`, `$.clock`, `$.session` and tool registration. Public proposal filed 2026-09-03. API may change.
- Warp tab configs: TOML, open as a tab in the active window by URI, params, no group API.
- Claude Code 2.1.257 verified: PreCompact, SubagentStart, SubagentStop, PermissionRequest, notification types, MCP_TOOL_TIMEOUT, autoCompactWindow. Sub-agents have no question tool.

## Open for the spec stage

- Final step schema and the prompt file per role. The orchestrator prompt states the priority order and when to amend the workflow.
- Events file schema and how Mission Control derives session state from it.
- Mnemosyne integration: what it indexes, note format, recall cost per prompt against the 300 ms budget.
- Function hooks: enable flag, whether a plugin tool is visible inside sub-agents, whether a `$.ui.ask` prompt can be raced against a file watch and dismissed when the Inbox answers first, fallback when the worker crashes.
- Recovery pass output format and what `resume` does per step.
- Findings ranking heuristics for blast radius, effort and confidence.
- Handoff template and the loose rule for skipping it.
- Memory and Inbox visibility from the phone via Remote Control.

## Review log 2026-09-04

Folded from the intent review.

- Added measure, attention modes, fluid workflows, build order.
- Added the acceptance loop to story and fix. Renamed `validate.md` to `acceptance.md`.
- Added contract coverage rule, test ownership, claim and worktree hybrid, `mission/<name>` branches, recovery pass, `resume`.
- Validator made project agnostic with `browse` default and tool recommendations. Self-improvement channel through handoffs and `retro.md`.
- Function-hook `ask` gated on a sub-agent spike with a fallback.
- Replaced the graph schema with an ordered list plus `parallel`, `gate`, `loop`. Dropped `needs`, `route`, deep-merge.
- Mission Control cut to one screen. Mission creation from it dropped. `support` preset dropped.
- Handoffs captured from final messages by hook, loose rule. Summarizer kept for condense and dream.
- Memory kept as integral with a minimal file-first design.
- Roles set per workflow, `quick` workflow added. Hard budgets rejected.
- Added DX section. Gate became a plugin tool racing the session prompt against the Inbox. Blocking `factory gate` call dropped. `suggestions.md` renamed `retro.md`.
