# ⌬ Factory

**A portable harness for running Agentic work through Claude Code with Missions.**

Factory is a CLI that reduces drifts in agent sessions. It maintains one curated set of skills across
all projects, runs each unit of work as a **mission** - one branch, one session, an ordered workflow
of steps with intent capture, spec, implementation, validator and verifier gates, and it puts every
mission across every project on one screen.

Factory is an opinionated personal tool, shared as-is.

## Whats inside

**Parts.** Skills, tools, fixtures and MCP entries, one folder for each under `parts/`. `factory
install` copies the ones you pick into a project's `.claude/`, records them in a manifest, and
`factory uninstall` takes back exactly what it added.

**Missions.** `factory mission new <name>` makes a folder under `.factory/missions/`, a branch
`mission/<name>`, and a copy of the workflow that will run it. Orchestrator agent runs a mission
through engineered graph of steps from intent capture towards completion. Mission folder holds
the intent, the spec, the contract, every sub-agent's handoff and the retro session.

**Mission Control.** `factory` with no arguments launches a TUI. Every project, mission and live
session in the left column; the selected one's graph, parts or intent form on the right; every
open gate and waiting decision in one inbox, each naming the command that answers it.

**Decisions.** Sub-agents log decisions made during development in the handoff documents, surfaced
through orchestrator and the TUI for review. Less surprises from sub-agent black boxes.

![Factory status view](docs/factory-screenshot.png)

## Why it is built this way

- **Copies, not symlinks.** A project's `.claude/` can be committed and read on a machine that
  never heard of the Factory. The cost is a refresh step: a Factory change reaches a project when
  `update` runs there, and `factory update --all` runs it everywhere in one go.
- **The manifest is the only link back.** `.claude/.factory-manifest.json` records a SHA-256 per
  file, so `status` can tell an untouched copy from one you edited, `update` restores it and says
  it did, and `uninstall` leaves anything the project wrote itself.
- **One agent per job, and none of them do two.** The Orchestrator plans, delegates and records;
  it never implements and never merges by hand. Workers implement one step each with clean
  context, serially. Gatekeepers check work they did not produce and never edit code. Splitting
  the roles is what keeps a mission's context from becoming one long conversation with itself.
- **Decisions are written down.** Every fork a reviewer might have taken differently is a row in
  `decisions.md` with a confidence and a reason. The autonomy dial decides which of them stop and
  wait for you — that is the one knob between "tell me everything" and "just go".
- **Gates are human by construction.** A gate is a step that does not pass until you answer it.
  First answer wins; a conflicting second one is refused, not overwritten.

## Requirements

Factory is made for Claude Code, Bun, Warp and macOS. It is free to be picked apart and ported to
your environment. 

| What                | Needed for                                       | Note                             |
|---------------------|--------------------------------------------------|----------------------------------|
| Bun, recent         | everything: the CLI, Mission Control, every hook |                                  |
| git                 | branches, worktrees, the merge on close          |                                  |
| Claude Code         | the sessions the Factory drives                  | pinned to its hooks              |
| macOS               | `caffeinate`, `afplay`, `open`                   | elsewhere these throw            |
| Warp                | `mission open` tabs, desktop notifications       | designed to launch Warp sessions |
| Node                | the `codegraph` MCP, through `npx`. opt-in       | opt-in part only                 |
| `XAI_API_KEY`       | `/research`                                      | opt-in part only                 |
| `agent-browser`     | `/browse`                                        | opt-in part only                 |

Linux runs the CLI, the missions and Mission Control; only the macOS calls above are missing.

## Setup

```bash
git clone git@github.com:jdanilov/ivy.git factory
cd factory
bun install
bun link           # puts `factory` on PATH via ~/.bun/bin; skip it and use `bun src/cli.ts` instead
```

Then point it at a project and pick what to install:

```bash
factory install ~/src/myproject    # menu of parts, then copies them into .claude/
factory status  ~/src/myproject    # what is installed, modified, in conflict, plus open missions
factory install --global           # the parts that are yours, not a project's, into ~/.claude/
factory update --all               # every registered project, then the home dir, in one run
factory                            # Mission Control
```

`install` registers the project in `~/.factory/projects`. After that the path is optional: the four
project commands act on the current directory when it is registered, and open a picker otherwise.
Without `bun link`, every command here is `bun src/cli.ts <command>`, and `bun start` is the bare one.

## How a mission runs

```
◇ intent gate → ≋ spec.md + acceptance.md → ● implement → ↻ review → ⊘ merge gate → close
```

Every mission starts unshaped: one gated `intent` step and nothing behind it. You write the goal,
the Orchestrator grills it until the Why is sharp, and once you answer the gate `factory mission
shape <preset>` appends the rest of the graph.

| Preset     | Steps after `intent`                                                                       |
|------------|--------------------------------------------------------------------------------------------|
| `story`    | research → spec → implement → review (verify ∥ validate, back to implement, max 3) → merge |
| `research` | investigate (sources ∥ transcripts) → report                                               |
| `train`    | plan → implement → check (the Orchestrator's own review, max 8) → merge                    |
| `chore`    | implement → merge; `--verify` adds a verify loop (max 2)                                   |
| `--quick`  | one `work` step, no intent gate                                                            |

The autonomy dial says which decisions stop for you. Gates reach you in every mode.

| Autonomy  | Waits on you       | The Orchestrator decides and records |
|-----------|--------------------|--------------------------------------|
| `full`    | nothing            | every decision                       |
| `partial` | `LOW` confidence   | `MEDIUM` and `HIGH`                  |
| `none`    | every decision     | nothing                              |

`factory mission close` refuses while a gate is open or a step is unfinished, merges the branch
`--no-ff` — the only merge path — marks the mission closed, clears the claim, drops the worktree
and deletes the branch. It commits nothing: the mission folder is ignored, and `status: closed` in
its own `state.json` is the record.

## Words

| Term       | Means                                                                                     |
|------------|-------------------------------------------------------------------------------------------|
| Project    | a git repo registered with the Factory; owns `.factory/` and an optional `factory.yaml`   |
| Part       | one installable unit — skill, tool, fixture or mcp — copied in and tracked in a manifest  |
| Mission    | one unit of tracked work: a folder, a workflow, a branch, a session                       |
| Stub       | a mission with an intent and no branch yet; `mission open` promotes it                    |
| Workflow   | the ordered list of steps that runs a mission                                             |
| Step       | one node in a workflow, with a role, an optional parallel group, gate or loop             |
| Gate       | a step that blocks until it is answered                                                   |
| Decision   | one fork an agent took, with a confidence and a reason, in `decisions.md`                 |
| Recipe     | a project command list in `factory.yaml`: `verify`, `e2e`                                 |
| Claim      | `.factory/claim`, naming the mission that owns the main checkout; others get a worktree   |

The full list, and the rule behind each name, is `docs/terminology.md`. Two docs about one thing
use one word; there are no synonyms anywhere in this repo on purpose.

## Commands

`install | uninstall | status | update` act on a project: the argument, else the current directory
when it is registered, else a picker. `--global` stands where the project path would.

| Command                                       | Does                                                                      |
|-----------------------------------------------|---------------------------------------------------------------------------|
| `factory` · `factory menu`                    | Mission Control · the interactive command-then-project picker             |
| `install [project]`                           | pick parts and copy them in; `--parts a,b` or `--yes` skip the menu       |
| `uninstall [project]`                         | take the copies, hooks and settings back out; `--yes` skips the menu      |
| `status [project]`                            | installed, modified, in conflict or skipped, plus open missions           |
| `update [project]`                            | rewrite the copies, add new defaults, drop retired parts; `--skip a,b`    |
| `update --all`                                | every registered project, then `~/.claude/`, one run                      |

`mission | step | gate | decision | handoff` act on the checkout you are standing in, never prompt,
and exit 1 with a one-line `✗ …` on a refusal.

| Command                                          | Does                                                                         |
|--------------------------------------------------|------------------------------------------------------------------------------|
| `mission new <name>`                             | folder, workflow copy, branch, claim, tab.                                   |
| `mission shape <preset>`                         | append a preset's steps behind `intent`, once. `--verify --autonomy L`       |
| `mission open [name]`                            | spawn the session in a Warp tab. `--preset P --dry-run`                      |
| `mission list [--all]` · `status` · `resume`     | every mission across projects · the graph one step per row · check out again |
| `mission autonomy L` · `adopt <name>`            | move the dial, with a recorded deviation · bind a running session            |
| `mission close [name] [--keep-branch]`           | merge, close, unclaim, delete the branch                                     |
| `mission archive \| unarchive <name>`            | move a closed mission's folder into `.factory/archive/`, or back             |
| `step start\|done\|skip\|loop <step>`            | move a step, or count a round and return to the loop target                  |
| `step add <step> --after X --reason R`           | insert a step the workflow does not have                                     |
| `gate open <step> --file F` · `answer`           | put a gate up · answer it once · every open gate across projects             |
| `decision add "<s>" --confidence L` · `answer`   | file a fork · accept or overrule it once · list, `--waiting`                 |
| `handoff save <step>`                            | write the handoff on stdin into the mission folder                           |

**Mission Control keys.** `↑↓` select, `⇧↑↓` reorder, `→` right pane (in MISSION it turns the
autonomy dial), `←` back, `↵` write to the row's session or open the selection, `Esc` back.
`O` open the mission's tab, `K` kill the session, `T` autonomy, `E` archive, `S` show archived,
`R` rename a session, `M` the intent form for a new stub. `L` launch `fg`/`bg`, `C` caffeinate,
`A` activity, `D` decisions — a second press gives the foot the whole screen. In PARTS, `Space`
toggles a part (on the global row it cycles the scope), `R` resets, `↵` asks and `Y` applies.
`?` help, `Q` quit. Gates and decisions are answered in the session that raised them; the screen
shows the command and records nothing itself.

## Parts

| Part             | Type    | Model  | Scope   | What it is                                                        |
|------------------|---------|--------|---------|-------------------------------------------------------------------|
| `/mission`       | skill   | fable  | project | run a mission through its workflow, gates and triage              |
| `/verify`        | skill   | opus   | project | verifier gatekeeper over the diff and the contract                |
| `/validate`      | skill   | opus   | project | validator gatekeeper driving the running system                   |
| `/retro`         | skill   | opus   | project | sweep closed missions' `retro.md` into one table you answer       |
| `/commit`        | skill   | sonnet | global  | structured git commits                                            |
| `/explain`       | skill   | sonnet | global  | visual code explanations and flow diagrams                        |
| `/research`      | tool    | sonnet | global  | web research via Grok, cited                                      |
| `/browse`        | tool    | sonnet | project | drive a real or headless browser through `agent-browser` (opt-in) |
| `/archify`       | skill   | —      | project | architecture diagrams, cloned per project (opt-in)                |
| `code-format`    | fixture | —      | project | how code is written                                               |
| `docs-format`    | fixture | —      | project | how agent-facing docs are written                                 |
| `terminology`    | fixture | —      | project | template `docs/terminology.md`, seeded only when absent           |
| `roadmap`        | fixture | —      | project | template `docs/roadmap.md`, seeded only when absent               |
| `permissions`    | fixture | —      | global  | baseline tool allow list merged into `settings.json`              |
| `hook-factory`   | fixture | —      | project | session events, decisions filed, rings when a session waits       |
| `hook-safe-bash` | fixture | —      | global  | blocks destructive bash commands                                  |
| `codegraph`      | mcp     | —      | project | code graph MCP plus prompt hook, per project index (opt-in)       |

A **skill** is a prompt with a model directive, invoked as `/name` in Claude Code; a **tool** is a
skill with scripts or a runtime behind it; a **fixture** is project configuration — hooks, formats,
allow lists, templates; an **mcp** part writes a server entry into `.mcp.json`. Sub-agents ship
beside the skill that spawns them: Worker, Investigator and Summarizer with `/mission`, Verifier
with `/verify`, Validator with `/validate`.

## Configuration

`part.yaml` says where a part *should* live; `~/.factory/config.yaml` is what this machine decides.

```yaml
vars:
  codegraph: codegraph          # a local build on PATH instead of the pinned npx default
  archify: ~/src/archify        # a local clone instead of the upstream GitHub URL
parts:
  commit: "project"             # the author recommends global; this machine wants it per project
  research: "off"               # installed nowhere, and update takes it back out
caffeinate: auto                # auto per turn · on per session · off never
launch: fg                      # fg: claude runs in the tab · bg: claude --bg, the tab attaches
```

A part may also own one line in the project's `AGENTS.md` — a **snippet** — appended under a heading
it names and removed on uninstall: that is how `terminology`, `docs-format` and `code-format` reach
every agent through one `@path` list instead of a sentence repeated in every prompt. And it may
declare `recipes.init` / `uninit`, shell lines run once in the project root when it arrives and
leaves; `/archify` is entirely that shape, cloning `${archify}` in and deleting it again.

To add one: write `parts/<name>/part.yaml` — `type`, `description`, `default`, `files`, optionally
`scope`, `hooks`, `mcp`, `settings`, `envVars`, `snippet`, `recipes`, `vars`, `requires` — put the
files it installs beside it, and run `factory install <project>`. A folder under `parts/` without a
`part.yaml` is not seen at all. `docs/parts.md` has the target and ownership rules.

## Docs

- `AGENTS.md` — the source tree, the conventions, what not to do
- `docs/terminology.md` — every name, and the rule behind it
- `docs/parts.md` — `part.yaml`, targets, scope, the manifest, the install family
- `docs/missions.md` — the mission command family and every invariant it keeps
- `docs/design.md` — palette, layout, keys and glyphs for Mission Control
- `docs/environment.md` — what the Factory depends on, and where it stops working
- `docs/roadmap.md` — what is next, in order

## License

MIT
