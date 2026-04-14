# Ivy — Portable Development Harness

## Goal

A single project that manages a curated set of skills, tools, fixtures, and MCP servers for Claude Code. Install into any project with one command via symlinks. Uninstall cleanly. Updating ivy updates all connected projects.

## Architecture

```
/opt/ed/ivy/
├── src/              CLI (install, uninstall, status, cycle dispatch)
├── parts/            Installable content (symlinked into target .claude/)
│   ├── skills/       skill.md files + optional scripts
│   ├── scripts/      Hook scripts (safe-bash)
│   └── sounds/       Audio assets
├── cycle/            Developer-Critic loop (referenced by path, not copied)
└── mcps/             MCP servers (referenced by path, not copied)
    └── glm/          GLM model proxy via z.ai

Target project after install:
    myproject/
    ├── .claude/
    │   ├── skills/commit/skill.md    → symlink to ivy/parts/skills/commit/skill.md
    │   ├── scripts/safe-bash.sh      → symlink
    │   ├── sounds/sonar-deep.mp3     → symlink
    │   └── .ivy-manifest.json        tracks installed parts + SHA-256 hashes
    ├── .mcp.json                     glm server entry injected if selected
    └── ...
```

**Key principle**: `parts/` content gets **symlinked** into the target. `cycle/` and `mcps/` stay in ivy and are **referenced by absolute path**.

## Part Types

| Type        | Prefix | What it is                                                 |
|-------------|--------|------------------------------------------------------------|
| **skill**   | `/`    | Single `skill.md` with model directive, invoked as `/name` |
| **tool**    | `/`    | Skill with supporting scripts/runtime, invoked as `/name`  |
| **fixture** | —      | Project configuration: hooks, scripts, assets              |
| **mcp**     | —      | MCP server entry injected into `.mcp.json`                 |

## Parts

| Part          | Type    | Model  | Default | Description                       |
|---------------|---------|--------|---------|-----------------------------------|
| `/brainstorm` | skill   | opus   | on      | Interactive planning, plan files  |
| `/flow`       | skill   | sonnet | on      | System flow diagrams              |
| `/dry`        | skill   | opus   | on      | Code critic review                |
| `/commit`     | skill   | sonnet | on      | Structured git commits            |
| `/research`   | tool    | —      | on      | Web research via Grok AI          |
| `/capture`    | tool    | —      | off     | Screenshot capture via Playwright |
| `/cycle`      | tool    | —      | on      | Developer ↔ Critic ↔ Fixer loop   |
| `safe-bash`   | fixture | —      | on      | Block destructive bash commands   |
| `sounds`      | fixture | —      | on      | Sonar notification on session end |
| `glm`         | mcp     | —      | off     | GLM model proxy (z.ai)            |

### Environment Variables

| Part        | Variable      | Source                   |
|-------------|---------------|--------------------------|
| `/research` | `XAI_API_KEY` | https://console.x.ai     |
| `glm`       | `GLM_API_KEY` | https://open.bigmodel.cn |

Checked in both `process.env` and target project's `.env` file.

### Hooks

| Part        | Event      | Matcher | Effect                                   |
|-------------|------------|---------|------------------------------------------|
| `safe-bash` | PreToolUse | Bash    | Runs safe-bash.sh before Bash tool calls |
| `sounds`    | Stop       | *       | Plays sonar-deep.mp3 on session end      |

## CLI

```
bun src/cli.ts                        Interactive mode
bun src/cli.ts install <path>         Install parts via symlinks
bun src/cli.ts uninstall <path>       Remove parts cleanly
bun src/cli.ts status <path>          Show installation status
bun src/cli.ts cycle <path> [plan]    Run developer-critic loop on a plan
```

Header: `Ivy — portable development harness`

### Install Flow

1. Validate target is a git repo
2. Scan `.claude/` for existing parts via manifest + file hashes
3. Show status matrix (Part / Type / Status columns)
4. Multiselect menu with defaults pre-checked
5. Detect conflicts (file exists but not from ivy) — prompt to overwrite
6. Warn about modified parts — prompt to continue
7. Install: symlink files, inject hooks into `settings.local.json`, inject MCP into `.mcp.json`
8. Write `.claude/.ivy-manifest.json`
9. Warn about missing env vars

### Uninstall Flow

1. Read manifest for installed parts
2. Show installed parts with modification status
3. Multiselect (all off, user toggles what to remove)
4. Warn about modified parts before removing
5. Remove symlinks, hook entries, MCP entries
6. Update manifest (delete if empty)

### Status Flow

Read-only scan. Shows Part / Type / Status / Files matrix.

## Project Structure

```
src/
├── cli.ts                    Entry point, command dispatch, CancelError catch
├── types.ts                  Part, PartFile, HookConfig, McpConfig, Manifest, etc.
├── commands/
│   ├── install.ts            Install flow with status matrix + multiselect
│   ├── uninstall.ts          Uninstall flow with modification warnings
│   ├── status.ts             Read-only status display
│   └── cycle.ts              Dispatch to cycle/index.ts
├── core/
│   ├── registry.ts           Parts definitions (PARTS array, IVY_ROOT)
│   ├── scanner.ts            Scan target, compute SHA-256 hashes, diff
│   ├── manifest.ts           Read/write .ivy-manifest.json
│   ├── linker.ts             Symlink create/remove, settings.json merge, .mcp.json merge
│   ├── env.ts                Check env vars (process.env + .env file), loadDotEnv()
│   └── projects.ts           Project path persistence (~/.ivy-projects)
└── ui/
    ├── theme.ts              Colors, symbols, statusColor/Symbol, displayName, typeLabel
    ├── prompts.ts            @clack/prompts wrappers, CancelError, unwrap()
    └── format.ts             Shared formatters: printPartResult, printHookInfo, formatEnvWarnings

cycle/
├── index.ts                  Cycle CLI entry
├── runner.ts                 Spawn claude subprocess with model flags
├── plan.ts                   Parse/update plan markdown files
├── formatter.ts              Format streaming claude output
├── ui.ts                     Plan picker, agent picker, ask-user prompts
├── theme.ts                  Cycle-specific symbols and colors
└── prompts/
    ├── developer.md          Developer agent prompt
    ├── critic.md             Critic agent prompt
    └── fixer.md              Fixer agent prompt

mcps/glm/
├── index.ts                  MCP stdio entry point
├── server.ts                 MCP server (ListTools + CallTool handlers)
├── provider.ts               z.ai API client (OpenAI-compatible, glm-5-turbo, retry)
└── tools.ts                  Tool definitions: think, code, review (system prompts + JSON schemas)
```

## Key Patterns

- **Symlinks over copies**: updating ivy updates all connected projects instantly
- **3-space indent** (`I`): matches @clack/prompts gutter alignment
- **CancelError**: prompts throw instead of `process.exit()`, caught in cli.ts for clean exit
- **`unwrap()`**: wraps @clack/prompts results, throws CancelError on cancel
- **`readJson()` helper**: in linker.ts, collapses repeated JSON read/parse/default pattern
- **Shared formatters**: `ui/format.ts` for `printPartResult`, `printHookInfo`, `formatEnvWarnings` — used by both install and uninstall
- **Display names**: skills and tools prefixed with `/` (e.g. `/commit`), fixtures and mcps use bare names
- **Env var checking**: reads both `process.env` and target project's `.env` file (async `loadDotEnv()`)
- **MCP server**: uses `@modelcontextprotocol/sdk` low-level `Server` class (stdio transport, JSON-RPC)

## Decisions

| Question               | Decision                                                                 |
|------------------------|--------------------------------------------------------------------------|
| Cycle agent models     | Hardcoded defaults (opus for dev/critic/fixer, sonnet for committer)     |
| Cycle validation gates | Follow CLAUDE.md conventions, no auto-detection                          |
| Symlink vs copy        | Symlinks — won't resolve on other machines, acceptable for v1            |
| GLM MCP scope          | Minimal: think, code, review                                             |
| Zod for MCP schemas    | Hand-written JSON schemas (zod v4 breaking changes, simpler for 3 tools) |

## Status

All phases complete. Project is functional and tested.
