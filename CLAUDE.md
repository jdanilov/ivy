# Ivy — Portable Development Harness

## Overview

Ivy is a CLI tool that installs a curated set of Claude Code skills, scripts, hooks, and MCP servers into any project via symlinks. One command to install, one to uninstall, clean tracking via manifest.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict, ES modules)
- **UI**: @clack/prompts for interactive menus
- **MCP SDK**: @modelcontextprotocol/sdk (for GLM server)

## Architecture

```
src/           CLI source (entry: src/cli.ts)
├── core/      Business logic — registry, scanner, manifest, linker, env
├── ui/        Presentation — theme, prompts, formatters
├── commands/  Command handlers — install, uninstall, status
└── types.ts   Shared type definitions

parts/         Installable content (symlinked into target projects)
├── skills/    Claude Code skills with model: frontmatter
├── scripts/   Hook scripts (safe-bash)
└── sounds/    Audio assets

cycle/         Developer-critic loop engine (referenced by path, not copied)
mcps/glm/      GLM MCP server (referenced by path, not copied)
```

### Key principle

Files in `parts/` get **symlinked** into the target `.claude/` directory. Code in `cycle/` and `mcps/` stays in ivy and is **referenced by absolute path**. Updating ivy updates all connected projects.

### Part types

| Type | Display | Description |
|------|---------|-------------|
| skill | `/name` | Single skill.md with model directive |
| tool | `/name` | Skill + supporting scripts/runtime |
| fixture | `name` | Scripts/hooks/assets, no slash prefix |
| mcp | `name` | MCP server entry in .mcp.json |

### Installation flow

1. Validate target is a git repo
2. Scan `.claude/` for existing parts (manifest + file hashes)
3. Show status matrix, present multiselect
4. Create symlinks, inject hooks into settings.local.json, inject MCP into .mcp.json
5. Write `.claude/.ivy-manifest.json` with SHA-256 hashes
6. Check env vars (process.env + target's .env file)

## Conventions

### Code style

- Use Bun APIs where available (`Bun.file`, `Bun.write`, `Bun.CryptoHasher`)
- Use `node:` prefix for Node.js builtins (`node:path`, `node:fs/promises`)
- All imports use ES module syntax with `.js` extensions
- 3-space indent constant `I` from `ui/theme.ts` for all console output (matches @clack/prompts gutter)
- Keep code minimal — no over-engineering, no premature abstractions

### Patterns

- **Display names**: skills prefixed with `/` (e.g. `/commit`), scripts/mcp use bare names
- **Shared formatting**: `ui/format.ts` for `printPartResult`, `formatEnvWarnings`
- **Cancel handling**: prompts throw `CancelError`, caught in `cli.ts`
- **JSON file I/O**: `readJson()` helper in `linker.ts` for read-parse-or-default pattern
- **Provider calls**: OpenAI-compatible `chat/completions` with retry logic in `mcps/glm/provider.ts`

### Testing

- Run `bun src/cli.ts status <path>` to verify parts detection
- Run `bun src/cli.ts install <path>` / `uninstall` to test the full flow
- MCP server: pipe JSON-RPC to `bun mcps/glm/index.ts` via stdin

### What not to do

- Don't add files to `parts/` without registering them in `src/core/registry.ts`
- Don't use 2-space indent for console output — always use `I` from theme
- Don't call `process.exit()` from commands or prompts — throw `CancelError` instead
- Don't read files synchronously in `src/` — use `node:fs/promises`
