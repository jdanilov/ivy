# Factory — Portable Development Harness

## Overview

Factory is a CLI that installs a curated set of Claude Code skills, scripts and hooks into any project via symlinks. Install, update, uninstall, tracked in a manifest. Names follow `docs/terminology.md`.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict, ES modules)
- **UI**: @clack/prompts for interactive menus

## Architecture

```
src/           CLI source (entry: src/cli.ts)
├── core/      Business logic — registry, scanner, manifest, linker, env, projects,
│              args, workflow (YAML load + transitions), mission (folder, state, claim, branch),
│              spawn (preset, Warp tab config, claude command)
├── ui/        Presentation — theme, prompts, formatters
├── commands/  install, uninstall, status, update, mission, step, gate, handoff
└── types.ts   Shared type definitions

parts/<name>/  One folder per part: part.yaml plus the files it installs
workflows/     story, fix, chore, research, quick — the shipped workflow YAML
presets/<name>/ preset.yaml, prompt.md, settings.json, mcp.json — one spawn bundle per preset
plugins/factory/ function-hooks plugin: the ask and gate tools and the status line
~/.factory/    Home dir: projects list, events/<session>.jsonl, caffeinate/<session>.pid
~/.warp/tab_configs/factory-<mission>.toml   written by `mission open`, opened by URI
```

### Key principle

Files under `parts/<name>/` get **symlinked** into the target `.claude/`. Updating the Factory updates every connected project. A file marked `skipIfExists` is copied in as a template only when the project has nothing there.

Roles ship as parts: `/mission` carries the Orchestrator's manual plus `Worker`, `Investigator` and `Summarizer`; `/verify` carries `Verifier`; `/validate` carries `Validator`. Every agent prompt points at `.claude/docs-format.md` and uses `docs/terminology.md` names. The `mission` skill stays under 120 lines, every other prompt under 80.

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
settings:            # optional, merged into .claude/settings.json: lists union, scalars overwrite
  permissions: { allow: [...] }
mcp:                 # optional, written to .mcp.json
envVars:             # optional, checked against process.env and the project .env
```

Target defaults for `skill` and `tool`: `agents/X.md` → `.claude/agents/X.md`, everything else → `.claude/skills/<name>/X`. Fixtures and mcp parts give each file an explicit `target`, which may sit outside `.claude`.

### Part types

| Type    | Display  | Description                           |
|---------|----------|---------------------------------------|
| skill   | `/name`  | Single skill.md with model directive  |
| tool    | `/name`  | Skill + supporting scripts/runtime    |
| fixture | `name`   | Scripts/hooks/assets, no slash prefix |
| mcp     | `name`   | MCP server entry in .mcp.json         |

### Installation flow

1. Validate target is a git repo
2. Scan `.claude/` for existing parts (manifest + file hashes)
3. Show status matrix, present multiselect
4. Create symlinks, inject hooks into settings.local.json, settings into settings.json, MCP into .mcp.json
5. Write `.claude/.factory-manifest.json` with SHA-256 hashes (an old `.ivy-manifest.json` is read once, then replaced)
6. Check env vars (process.env + target's .env file)

`update <project>` is the non-interactive version: relink installed parts, install parts the registry added as `default`, unlink parts and files the registry dropped, rewrite hooks, settings and manifest. It only ever removes a symlink pointing into the Factory.

### Two command families

`install | uninstall | status | update [project] [--skip a,b]` act on a project and fall back to the
picker. `--skip` records the part in the manifest, so the project keeps its own copy for good.
`mission | step | gate | handoff <sub>` act on the checkout you are standing in, never prompt
(the one exception is the worktree offer in `mission new` on a claimed checkout) and exit 1 with a
one-line `✗ …` on a refusal.

```
factory mission new <name> [--workflow W] [--attention full|light|unattended] [--title T] [--worktree] [--no-open]
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
