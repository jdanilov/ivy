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
├── core/      Business logic — registry, scanner, manifest, linker, env, projects
├── ui/        Presentation — theme, prompts, formatters
├── commands/  Command handlers — install, uninstall, status, update
└── types.ts   Shared type definitions

parts/<name>/  One folder per part: part.yaml plus the files it installs
~/.factory/    Home dir: projects list, later missions state and events
```

### Key principle

Files under `parts/<name>/` get **symlinked** into the target `.claude/`. Updating the Factory updates every connected project.

### part.yaml

```yaml
type: skill          # skill | tool | fixture | mcp
description: one line
default: true        # preselected in the install menu
files:
  - source: skill.md         # relative to the part folder
  - source: agents/Critic.md
hooks:               # optional, merged into .claude/settings.local.json
  - { event: PreToolUse, matcher: Bash, command: ... }
mcp:                 # optional, written to .mcp.json
envVars:             # optional, checked against process.env and the project .env
```

Target defaults for `skill` and `tool`: `agents/X.md` → `.claude/agents/X.md`, everything else → `.claude/skills/<name>/X`. Fixtures and mcp parts give each file an explicit `target`.

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
4. Create symlinks, inject hooks into settings.local.json, inject MCP into .mcp.json
5. Write `.claude/.factory-manifest.json` with SHA-256 hashes (an old `.ivy-manifest.json` is read once, then replaced)
6. Check env vars (process.env + target's .env file)

`update <project>` is the non-interactive version: relink installed parts, unlink parts the registry dropped, rewrite hooks and manifest. It never removes a target that is not a live symlink into the Factory.

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
- **Cancel handling**: prompts throw `CancelError`, caught in `cli.ts`
- **JSON file I/O**: `readJson()` helper in `linker.ts` for read-parse-or-default pattern

### Testing

- `bun src/cli.ts status <path>` — parts detection
- `bun src/cli.ts install|update|uninstall <path>` — the full flow
- `bun x tsc --noEmit` — typecheck

### What not to do

- Don't add a folder under `parts/` without a `part.yaml` — it will not be seen
- Don't use 2-space indent for console output — always use `I` from theme
- Don't call `process.exit()` from commands or prompts — throw `CancelError` instead
- Don't read files synchronously in `src/` — use `node:fs/promises`
