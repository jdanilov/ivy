# Factory — Portable Development Harness

Factory is a CLI that installs a curated set of Claude Code skills, scripts and hooks into any
project via symlinks, and runs missions across those projects. Install, update, uninstall, tracked
in a manifest.

## Important Files
- Docs format: @.claude/docs-format.md
- Terminology: @docs/terminology.md
- Roadmap: `docs/roadmap.md`
- Code format: @.claude/code-format.md

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict, ES modules)
- **UI**: @clack/prompts for interactive menus

## Architecture

```
src/           CLI source (entry: src/cli.ts)
├── core/      Business logic — registry, scanner, manifest, linker, env, projects, config,
│              recipes, args, workflow (YAML load + transitions), mission (folder, state,
│              claim, branch), spawn (preset, Warp tab config, claude command)
├── ui/        Presentation — theme, prompts, formatters
├── commands/  install, uninstall, status, update, mission, step, gate, handoff
└── types.ts   Shared type definitions

parts/<name>/  One folder per part: part.yaml plus the files it installs
scripts/e2e.sh One throwaway repo: install --yes, a chore mission end to end, uninstall --yes
.factory/factory.yaml   the project's own recipes: verify, e2e
workflows/     story, fix, chore, research, quick — the shipped workflow YAML
presets/<name>/ preset.yaml, prompt.md, settings.json, mcp.json — one spawn bundle per preset
~/.factory/    Home dir: projects list, config.yaml (var overrides), events/<session>.jsonl,
               caffeinate/<session>.pid
~/.warp/tab_configs/factory-<mission>.toml   written by `mission open`, opened by URI
```

### Key principle

Files under `parts/<name>/` get **symlinked** into the target `.claude/`. Updating the Factory
updates every connected project. A file marked `skipIfExists` is copied in as a template only when
the project has nothing there.

Roles ship as parts: `/mission` carries the Orchestrator's manual plus `Worker`, `Investigator`
and `Summarizer`; `/verify` carries `Verifier`; `/validate` carries `Validator`; `/retro` sweeps
closed missions' retros back into work. Shared context reaches every agent through the
`## Important Files` snippets, never through a sentence repeated in each prompt. The `mission`
skill stays under 120 lines, `Worker` under 40, `/retro` under 60, every other prompt under 80.

### part.yaml

```yaml
type: skill          # skill | tool | fixture | mcp
description: one line
default: true        # preselected in the install menu
files:
  - source: skill.md         # relative to the part folder
  - source: agents/Verifier.md
  - source: terminology.md   # a template
    target: docs/terminology.md
    skipIfExists: true       # seed it once, then it belongs to the project
hooks:               # optional, merged into .claude/settings.local.json
  - { event: PreToolUse, matcher: Bash, command: ... }   # matcher omitted where the event takes none
  - { events: [Stop, SessionEnd], command: ... }          # sugar: one entry per event, ${event} names it
settings:            # optional, merged into .claude/settings.json: lists union, scalars overwrite
  permissions: { allow: [...] }
mcp:                 # optional, written to .mcp.json
envVars:             # optional, checked against process.env and the project .env
snippet:             # optional, one line the part owns in the project's agent file
  section: "## Important Files"                  # an ATX heading, created at EOF when missing
  line: "- Terminology: @docs/terminology.md"    # appended at the end of that section, deduped
  file: AGENTS.md    # optional, overrides AGENTS.md → CLAUDE.md → create AGENTS.md
recipes:             # optional, shell lines run in the project root
  init:   ["${codegraph} init"]             # once, when the part becomes installed
  uninit: ["${codegraph} uninit --force"]   # once, when it is uninstalled or dropped
vars:                # optional, defaults for ${name}
  codegraph: "npx -y @colbymchenry/codegraph@1.6.0"
requires: [mission]  # optional, parts selected and installed with this one, never removable under it
```

Target defaults for `skill` and `tool`: `agents/X.md` → `.claude/agents/X.md`, everything else →
`.claude/skills/<name>/X`. Fixtures and mcp parts give each file an explicit `target`, which may
sit outside `.claude`.

`${name}` is substituted in `mcp.config.command`, `mcp.config.args`, `hooks[].command` and both recipe
lists: `~/.factory/config.yaml` `vars.<name>` wins over the part's `vars.<name>`, and nothing defining
it is a refusal. A value may carry arguments; in `mcp.config.command` the first word is the command and
the rest leads the args. Substitution happens as the manifest entry is built, so the manifest, `.mcp.json`
and the hooks hold resolved strings and `update` re-points a project after a config edit.

The manifest records each part's `snippet: { file, section, line }` and, after `recipes.init` succeeded,
`initAt`. A section that already carries a line naming the same path gets that line rewritten in place
instead of a second one appended, and the original is kept as `snippet.replaced`. Uninstall works from
those records, not from a fresh resolution: it puts a replaced line back, otherwise removes the recorded
line from the recorded file and drops the section when only blank lines are left. A settings or mcp file
the uninstall emptied is deleted. `init` runs when `initAt` is
absent and refuses on a non-zero exit with the part left linked, so a fix plus `update` retries. `uninit`
runs on uninstall and when `update` drops a part the registry no longer has; a failure prints `◈` and the
unlink continues.

### Two command families

`install | uninstall | status | update [project]` act on a project and fall back to the picker.
`install` and `uninstall` take `--yes`: the defaults plus what is already installed, no menu, no
confirm. `update` alone takes `--skip a,b`, which records the part in the manifest, so the project
keeps its own copy for good.

`update` is the non-interactive install: relink, add parts the registry marks `default`, drop parts
and files it no longer has, rewrite hooks, settings, snippets and manifest. It only ever removes a
symlink pointing into the Factory.

`mission | step | gate | handoff <sub>` act on the checkout you are standing in, never prompt
(the one exception is the worktree offer in `mission new` on a claimed checkout) and exit 1 with a
one-line `✗ …` on a refusal.

```
factory mission new <name> [--stub] [--workflow W] [--attention full|light|unattended] [--title T] [--worktree] [--no-open]
factory mission open [name] [--preset orchestrator|quick|research] [--dry-run]
factory mission list [--all] | status [name] | adopt <name> --session <id> | resume [name] | close [name]
factory step start|done|skip <step> [--reason R] | add <step> --after X [--role R] --reason R | loop <step>
factory gate open <step> --file F | answer <step> accept|amend|reject [--note N] | list
factory handoff save <step>            # reads the handoff from stdin
```

### Mission invariants

- `mission new` creates the branch and folder first and writes `state.json` last, so an interrupted
  run leaves an orphan branch the next run reuses, never state pointing at a branch that is not there.
- Every `state.json` write is a temp file plus rename. No partial JSON ever lands.
- `step start`, `gate open`, `gate answer`, `mission adopt`, `mission close` are idempotent. First
  answer wins on a gate; a conflicting second answer is refused, not overwritten.
- `mission close` checks its own postconditions, so a rerun after a crash finishes the remaining work.
- The mission folder always resolves through `git worktree list`, so worktrees find it in the main checkout.
- Any transition that disagrees with `workflow.yaml` appends a `deviations` entry with a reason.
- `mission open` writes the session id to `state.json` before the tab exists, so the first hook
  event the new session emits already finds a mission bound to it.
- `hook-factory` never fails a hook: every step is guarded and the script always exits 0.
- `mission new` and the promotion in `mission open` add `.factory/claim` to the project `.gitignore`
  when nothing ignores it yet, committing that line when the file is otherwise clean, and `mission
  close` never counts the claim as dirt: the Factory's own file cannot block the Factory.
- A stub is a mission with `status: stub` and `branch: null`: folder, workflow copy and an
  `intent.md` skeleton, no branch and no claim. Every command that needs a branch refuses with
  `mission <name> is a stub, open it first`; `mission open` promotes it and then proceeds as usual,
  landing in the same state `mission new` would have.
- `mission close` commits a dirty mission folder on the mission branch before it leaves the branch,
  and refuses when anything outside the folder is dirty, naming the paths.
- `mission list` and `gate list` skip a registered project whose path is gone. The projects file keeps it.

## Conventions

### Code style

- Use Bun APIs where available (`Bun.file`, `Bun.write`, `Bun.YAML`, `Bun.CryptoHasher`)
- Use `node:` prefix for Node.js builtins (`node:path`, `node:fs/promises`)
- All imports use ES module syntax with `.js` extensions
- 3-space indent constant `I` from `ui/theme.ts` for all console output (matches @clack/prompts gutter)
- Keep code minimal — no over-engineering, no premature abstractions

### Patterns

- **Display names**: skills prefixed with `/` (e.g. `/commit`), fixtures/mcp use bare names
- **Column width**: `setNameCol(parts)` once in `cli.ts`, read through `nameCol()`
- **Shared formatting**: `ui/format.ts` for `printPartResult`, `formatEnvWarnings`
- **Cancel handling**: prompts throw `CancelError`, refusals throw `Refusal`, both caught in `cli.ts`
- **JSON file I/O**: `readJson()` helper in `linker.ts` for read-parse-or-default pattern

### Testing

- `bun src/cli.ts status <path>` — parts detection plus the Missions block
- `bun src/cli.ts install|update|uninstall <path>` — the full flow
- `bun src/cli.ts mission new smoke --workflow chore` in a throwaway git repo, then walk it with
  `step start|done`, `gate open|answer` and `mission close` — the mission flow end to end
- `bun x tsc --noEmit` — typecheck

### What not to do

- Don't add a folder under `parts/` without a `part.yaml` — it will not be seen
- Don't use 2-space indent for console output — always use `I` from theme
- Don't call `process.exit()` from commands or prompts — throw `CancelError` or `Refusal` instead
- Don't read files synchronously in `src/` — use `node:fs/promises`
