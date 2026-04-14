# Ivy — Portable Development Harness

## Goal

A single project that provides a reusable, agentic coding environment for any codebase. Install with one command, uninstall cleanly, connect via MCP or Claude Code skills. Ships a curated set of skills, scripts, hooks, and MCP servers that orchestrate development tasks across models.

## Architecture

```
                           /opt/ed/ivy
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         parts/            cycle/           mcps/
    (installed into      (referenced,      (referenced,
     target .claude/)    not copied)       not copied)
              │                │                │
              ▼                ▼                ▼
     ┌────────────────┐  ┌──────────┐   ┌──────────┐
     │ skills/        │  │ cli.ts   │   │ glm/     │
     │  commit/       │  │ runner   │   │  server  │
     │  dry/          │  │ plan     │   │  provider│
     │  flow/         │  │ prompts/ │   └──────────┘
     │  brainstorm/   │  └──────────┘
     │  capture/      │
     │  research/     │
     │  cycle/        │  ← skill.md only, points to cycle/
     │ scripts/       │
     │  safe-bash.sh  │
     │ sounds/        │
     │  sonar-deep.mp3│
     └────────────────┘

Target project after install:
    myproject/
    ├── .claude/
    │   ├── skills/
    │   │   ├── commit/skill.md      (symlink → ivy/parts/skills/commit/skill.md)
    │   │   ├── dry/skill.md         (symlink)
    │   │   └── ...
    │   ├── scripts/
    │   │   └── safe-bash.sh         (symlink)
    │   └── .ivy-manifest.json       (tracks what ivy installed + hashes)
    ├── .mcp.json                    (glm server entry injected if selected)
    └── ...
```

**Key principle**: files in `parts/` get **symlinked** into the target project (like dotfiles). Code in `cycle/` and `mcps/` stays in ivy and is **referenced by path**. This means updating ivy updates all connected projects automatically.

## Parts Registry

Each installable unit is called a **part**. Parts have a type, a default on/off state, and optional requirements.

### Skills

| Part | Type | Model | Default | Description |
|------|------|-------|---------|-------------|
| `commit` | skill | `sonnet` | on | Structured git commits with sea-themed emojis |
| `dry` | skill | `opus` | on | Code critic — review uncommitted changes |
| `flow` | skill | `sonnet` | on | Research and visualize system flows with diagrams |
| `brainstorm` | skill | `opus` | on | Interactive planning — generate plan files in `docs/plans/` |
| `capture` | skill | — | off | Screenshot capture via Playwright |
| `research` | skill | — | on | Web research via Grok AI |
| `cycle` | skill | — | on | Developer-Critic loop orchestrator (ralph-loop) |

### Scripts

| Part | Type | Default | Description |
|------|------|---------|-------------|
| `safe-bash` | script | on | Pre-execution hook blocking destructive bash commands |
| `sounds` | script | on | Sonar notification on session end |

### MCPs

| Part | Type | Default | Description |
|------|------|---------|-------------|
| `glm` | mcp | off | GLM model proxy via z.ai for delegating dev tasks |

### Environment Variables

| Part | Variable | Where to set | How to get |
|------|----------|-------------|------------|
| `research` | `XAI_API_KEY` | `.env` or shell | https://console.x.ai |
| `glm` | `GLM_API_KEY` | `.env` or shell | https://open.bigmodel.cn |

### Settings Hooks

| Part | Hook Type | Matcher | Effect |
|------|-----------|---------|--------|
| `safe-bash` | `PreToolUse` | `Bash` | Runs safe-bash.sh before every Bash tool call |
| `sounds` | `Stop` | `*` | Plays sonar-deep.mp3 when session ends |

## CLI Design

### Commands

```
ivy install [path]       Install parts to a project (default: cwd)
ivy uninstall [path]     Remove parts from a project (default: cwd)
ivy status [path]        Show what's installed (default: cwd)
ivy cycle [plan]         Run the developer-critic cycle on a plan
```

### Parameters

#### `ivy install [path]`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | positional | `process.cwd()` | Target project directory |

1. Validates target is a git repo
2. Scans `.claude/` for existing ivy parts using manifest + file hashes
3. Shows status matrix
4. Presents multiselect menu with defaults pre-checked
5. Detects conflicts (file exists but wasn't installed by ivy)
6. Installs selected parts (symlink files, inject MCP/hook configs)
7. Writes/updates `.claude/.ivy-manifest.json`
8. Checks and warns about missing env vars

#### `ivy uninstall [path]`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | positional | `process.cwd()` | Target project directory |

1. Reads manifest to find installed parts
2. Shows installed parts with modification status
3. Presents multiselect menu (all off by default, user toggles what to remove)
4. Removes selected parts (delete symlinks, remove MCP/hook entries)
5. Updates manifest
6. If no parts remain, removes manifest file

#### `ivy status [path]`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | positional | `process.cwd()` | Target project directory |

Read-only scan. Shows the status matrix without modifying anything.

#### `ivy cycle [plan]`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `plan` | positional | — (interactive picker) | Plan name or path |

Runs the Developer → Critic → Fixer → Committer loop on a plan file from `docs/plans/`.

## Sample Output

### `ivy install`

```
Ivy

   Target   /opt/ed/myproject
   Claude   .claude/ exists

   Part          Status
   ────────────────────────────────────
   /commit       ○ not installed
   /dry          ○ not installed
   /flow         ○ not installed
   /brainstorm   ○ not installed
   /capture      ○ not installed
   /research     ○ not installed
   /cycle        ○ not installed
   safe-bash     ○ not installed
   sounds        ○ not installed
   glm           ○ not installed

   Select parts to install:
   ◉ /commit      structured git commits (sonnet)
   ◉ /dry         code critic review (opus)
   ◉ /flow        system flow diagrams (sonnet)
   ◉ /brainstorm  interactive planning (opus)
   ◌ /capture     screenshot capture
   ◉ /research    web research via Grok
   ◉ /cycle       develop ↔ critic ↔ fix loop
   ◉ safe-bash    block destructive commands
   ◉ sounds       sonar notification on session end
   ◌ glm          GLM model proxy

   Installing 9 parts...

   ✓ /commit      .claude/skills/commit/skill.md
   ✓ /dry         .claude/skills/dry/skill.md
   ✓ /flow        .claude/skills/flow/skill.md
   ✓ /brainstorm  .claude/skills/brainstorm/skill.md
   ✓ /research    .claude/skills/research/skill.md
                  .claude/skills/research/scripts/research.ts
   ✓ /cycle       .claude/skills/cycle/skill.md
   ✓ safe-bash    .claude/scripts/safe-bash.sh
                  .claude/settings.local.json → hook added
   ✓ sounds       .claude/sounds/sonar-deep.mp3
                  .claude/settings.local.json → hook added

   Done. 9 parts installed.
```

### `ivy install` (with existing parts)

```
Ivy

   Target   /opt/ed/myproject
   Claude   .claude/ exists

   Part          Status
   ────────────────────────────────────
   /commit       ● installed
   /dry          ▲ modified
   /flow         ● installed
   /brainstorm   ○ not installed
   safe-bash     ● installed
   glm           ○ not installed

   Select parts to install/update:
   ◉ /commit      structured git commits (sonnet) · no changes
   ◉ /dry         code critic review (opus) · will overwrite
   ◉ /flow        system flow diagrams (sonnet) · no changes
   ◉ /brainstorm  interactive planning (opus)
   ◌ /capture     screenshot capture
   ◉ /research    web research via Grok
   ◉ /cycle       develop ↔ critic ↔ fix loop
   ◉ safe-bash    block destructive commands · no changes
   ◌ glm          GLM model proxy

   ⚠ /dry has local changes that will be overwritten. Continue? (Y/n)

   Installing 2 parts...

   ✓ /dry         .claude/skills/dry/skill.md (updated)
   ✓ /brainstorm  .claude/skills/brainstorm/skill.md

   Done. 4 installed, 1 updated.
```

### `ivy install` (conflict — file exists, not from ivy)

```
  ⚠ Conflict: .claude/skills/commit/skill.md exists but was not installed by Ivy.
  Overwrite? (y/N)
```

### `ivy uninstall`

```
Ivy

   Target   /opt/ed/myproject

   Installed parts:
   ◌ /commit      .claude/skills/commit/skill.md
   ◌ /dry         .claude/skills/dry/skill.md · modified
   ◌ /brainstorm  .claude/skills/brainstorm/skill.md
   ◌ safe-bash    .claude/scripts/safe-bash.sh

   Select parts to uninstall: (space to toggle, enter to confirm)
   ◌ /commit
   ◉ /dry         ⚠ has local changes
   ◌ /brainstorm
   ◌ safe-bash

   Uninstalling 1 part...

   ✓ /dry         removed .claude/skills/dry/skill.md

   Done. 1 part removed. 3 remaining.
```

### `ivy status`

```
Ivy

   Target   /opt/ed/myproject

   Part          Status        Files
   ──────────────────────────────────────────────────
   /commit       ● installed   .claude/skills/commit/skill.md
   /dry          ▲ modified    .claude/skills/dry/skill.md
   /flow         ● installed   .claude/skills/flow/skill.md
   /brainstorm   ● installed   .claude/skills/brainstorm/skill.md
   /capture      ○ —
   /research     ○ —
   /cycle        ○ —
   safe-bash     ● installed   .claude/scripts/safe-bash.sh
   sounds        ● installed   .claude/sounds/sonar-deep.mp3
   glm           ○ —

   7 installed, 1 modified, 2 available
```

### `ivy install` (env var warning)

```
   Installing 2 parts...

   ✓ /research    .claude/skills/research/skill.md
                  .claude/skills/research/scripts/research.ts
   ✓ glm          .mcp.json → glm server added

   ⚠ Environment variables needed:

   /research    XAI_API_KEY   — https://console.x.ai
   glm          GLM_API_KEY   — https://open.bigmodel.cn

   Add to your project .env or export in shell.

   Done. 2 parts installed.
```

### `ivy cycle`

```
  Ivy Cycle

  Pick a plan:
  ❯ content-optimizer    3/7 done · 2h ago
    api-refactor         0/4 done · 1d ago
    auth-middleware      complete · 3d ago

  Start with:
  ❯ ▶ Developer    implement next tasks
    ⇄ Critic       review changes
    ⚒ Fixer        address findings
    ✦ Committer    create commits

  ──────── Iteration 1 ────────

  ▶ Developer · iteration 1
  ...
```

## Project Structure

```
/opt/ed/ivy/
├── src/                              # Ivy CLI
│   ├── cli.ts                        # Entry point: parse command, dispatch
│   ├── commands/
│   │   ├── install.ts                # Install flow
│   │   ├── uninstall.ts              # Uninstall flow
│   │   └── status.ts                 # Status display
│   ├── core/
│   │   ├── registry.ts               # Parts definitions (name, type, files, env, defaults)
│   │   ├── scanner.ts                # Scan target project, compute file hashes, diff
│   │   ├── manifest.ts               # Read/write .ivy-manifest.json
│   │   ├── linker.ts                 # Create/remove symlinks, inject/remove config entries
│   │   └── env.ts                    # Check environment variables, format warnings
│   ├── ui/
│   │   ├── prompts.ts                # @clack/prompts wrappers (multiselect, confirm)
│   │   └── theme.ts                  # Colors, symbols, formatting
│   └── types.ts                      # Shared type definitions
│
├── parts/                            # Installable content
│   ├── skills/
│   │   ├── commit/
│   │   │   └── skill.md              # model: sonnet
│   │   ├── dry/
│   │   │   └── skill.md              # model: opus
│   │   ├── flow/
│   │   │   └── skill.md              # model: sonnet
│   │   ├── brainstorm/
│   │   │   └── skill.md              # model: opus
│   │   ├── capture/
│   │   │   ├── skill.md
│   │   │   └── scripts/
│   │   │       └── capture.js        # Playwright screenshot script
│   │   ├── research/
│   │   │   ├── skill.md
│   │   │   └── scripts/
│   │   │       └── research.ts       # Grok AI web research script
│   │   └── cycle/
│   │       └── skill.md              # Points to: ivy cycle $ARGUMENTS
│   ├── scripts/
│   │   └── safe-bash.sh              # Destructive command guard
│   └── sounds/
│       └── sonar-deep.mp3            # Session end notification
│
├── cycle/                            # Developer-Critic loop (ralph-loop)
│   ├── index.ts                      # Cycle CLI entry (dispatched from main cli.ts)
│   ├── runner.ts                     # Spawn claude subprocess with model flags
│   ├── plan.ts                       # Parse/update plan markdown files
│   ├── formatter.ts                  # Format streaming claude output
│   ├── ui.ts                         # Plan picker, agent picker, ask-user prompts
│   ├── theme.ts                      # Cycle-specific symbols and colors
│   └── prompts/
│       ├── developer.md              # Developer agent prompt (project-agnostic)
│       ├── critic.md                 # Critic agent prompt (project-agnostic)
│       └── fixer.md                  # Fixer agent prompt (project-agnostic)
│
├── mcps/                             # MCP server implementations
│   └── glm/
│       ├── index.ts                  # MCP server entry (stdio)
│       ├── server.ts                 # MCP server setup + tool handlers
│       ├── provider.ts               # z.ai/GLM API calls
│       └── tools/                    # Tool definitions
│           ├── think.ts              # Planning/reasoning
│           ├── write-code.ts         # Code generation
│           └── review.ts             # Code review
│
├── package.json
├── tsconfig.json
├── .gitignore
└── CLAUDE.md
```

## Manifest File

Stored at `<target>/.claude/.ivy-manifest.json`. Tracks what was installed and file hashes for change detection.

```json
{
  "version": 1,
  "ivy": "/opt/ed/ivy",
  "installedAt": "2026-04-14T10:30:00Z",
  "updatedAt": "2026-04-14T10:30:00Z",
  "parts": {
    "commit": {
      "files": [".claude/skills/commit/skill.md"],
      "hashes": {
        ".claude/skills/commit/skill.md": "sha256:abc123..."
      }
    },
    "safe-bash": {
      "files": [".claude/scripts/safe-bash.sh"],
      "hashes": {
        ".claude/scripts/safe-bash.sh": "sha256:def456..."
      },
      "hooks": [
        {
          "event": "PreToolUse",
          "matcher": "Bash",
          "command": "$CLAUDE_PROJECT_DIR/.claude/scripts/safe-bash.sh"
        }
      ]
    },
    "glm": {
      "mcp": {
        "serverName": "glm",
        "config": {
          "command": "bun",
          "args": ["/opt/ed/ivy/mcps/glm/index.ts"]
        }
      }
    }
  }
}
```

## Parts — Porting Notes

### Already project-agnostic (port as-is)
- `commit/skill.md` — no project references, sea emojis preserved
- `dry/skill.md` — generic code review checklist
- `flow/skill.md` — generic system visualization
- `brainstorm/skill.md` — generic planning, uses `docs/plans/` convention
- `capture/` — generic screenshot tool, default URL configurable via args
- `safe-bash.sh` — generic destructive command guard

### Needs genericizing
- `research/` — port script as-is, but update `PROJECT_ROOT` resolution to use `process.cwd()` instead of relative path from script location

### Needs building from scratch
- `glm/` MCP server — minimal MCP server with 2-3 tools (think, write-code, review), reusing patterns from codeforge-mcp's harness (provider.ts, tool-factory.ts)
- `cycle/skill.md` — new skill.md pointing to `ivy cycle`

## Settings Injection

When a part requires hooks (like safe-bash), ivy needs to merge into `settings.local.json` without destroying existing entries.

**Strategy:**
1. Read existing `settings.local.json` (or `{}` if absent)
2. Deep-merge the hook entry into `hooks.PreToolUse[]`
3. Write back with formatting preserved
4. On uninstall, find and remove only the entries ivy added (matched by command path)

**Edge case:** if `settings.local.json` doesn't exist, create it with only the hook config. Do not add permissions — those are project-specific.

## MCP Injection

When an MCP part is selected, ivy adds an entry to `.mcp.json`.

**Strategy:**
1. Read existing `.mcp.json` (or `{ "mcpServers": {} }` if absent)
2. Add server entry under `mcpServers`
3. Write back
4. On uninstall, remove only the ivy-managed server entry

## Implementation Tasks

### Phase 1: Project scaffolding
- [x] Initialize package.json with bun, @clack/prompts dependency
- [x] Set up tsconfig.json
- [x] Create .gitignore
- [ ] Create CLAUDE.md with project conventions
- [x] Set up CLI entry point (src/cli.ts) with command routing

### Phase 2: Core infrastructure
- [x] Define Part type and registry (src/core/registry.ts, src/types.ts)
- [x] Implement file hashing with Bun.CryptoHasher (src/core/scanner.ts)
- [x] Implement manifest read/write (src/core/manifest.ts)
- [x] Implement symlink creation/removal (src/core/linker.ts)
- [x] Implement settings.local.json merge/unmerge (src/core/linker.ts)
- [x] Implement .mcp.json merge/unmerge (src/core/linker.ts)
- [x] Implement env var checking (src/core/env.ts)
- [x] Create theme with colors and symbols (src/ui/theme.ts)
- [x] Create @clack/prompts wrappers (src/ui/prompts.ts)
- [x] Implement project path persistence (src/core/projects.ts)

### Phase 3: Commands
- [x] Implement `ivy status` (src/commands/status.ts)
- [x] Implement `ivy install` (src/commands/install.ts)
- [x] Implement `ivy uninstall` (src/commands/uninstall.ts)
- [x] Implement `ivy cycle` dispatch (src/commands/cycle.ts)

### Phase 4: Port parts
- [x] Port commit skill (parts/skills/commit/skill.md) — model: sonnet
- [x] Port dry skill (parts/skills/dry/skill.md) — model: opus
- [x] Port flow skill (parts/skills/flow/skill.md) — model: sonnet
- [x] Port brainstorm skill (parts/skills/brainstorm/skill.md) — model: opus
- [x] Port capture skill + script (parts/skills/capture/)
- [x] Port research skill + script (parts/skills/research/)
- [x] Port safe-bash script (parts/scripts/safe-bash.sh)
- [x] Add sounds part (parts/sounds/sonar-deep.mp3) — Stop hook

### Phase 5: Cycle (ralph-loop)
- [x] Port and genericize developer.md prompt
- [x] Port and genericize critic.md prompt
- [x] Port and genericize fixer.md prompt
- [x] Port runner.ts (cycle/runner.ts)
- [x] Port plan.ts (cycle/plan.ts)
- [x] Port formatter.ts (cycle/formatter.ts)
- [x] Port ui.ts (cycle/ui.ts)
- [x] Port theme.ts (cycle/theme.ts)
- [x] Create cycle CLI entry (cycle/index.ts)
- [x] Create cycle skill.md (parts/skills/cycle/skill.md)
- [x] Wire `ivy cycle` subcommand in main CLI

### Phase 6: GLM MCP server
- [x] Create minimal MCP server scaffold (mcps/glm/index.ts, server.ts)
- [x] Implement z.ai/GLM provider (mcps/glm/provider.ts)
- [x] Add think tool
- [x] Add code tool
- [x] Add review tool
- [x] Register glm as MCP part in registry

### Phase 7: Polish
- [x] Create CLAUDE.md with project conventions
- [x] Create README.md with screenshot, description, setup, and parts list
- [x] Add MIT LICENSE
- [x] Test install/uninstall/status on a clean project
- [x] Test install on a project with existing .claude/
- [x] Test conflict detection and resolution
- [x] Test env var warnings
- [x] Verify symlinks update when ivy parts are edited
- [x] Initial git commit

## Open Questions

1. **Cycle agent models** — currently developer/critic/fixer all default to opus, committer to sonnet. Should these be configurable per-project (e.g., via a `.ivy-cycle.json` in the target project)? Or keep hardcoded defaults for v1? > Keep hardcoded please.

2. **Cycle validation gates** — the current critic/fixer prompts hardcode `npm run lint`, `npm test`. The genericized prompts will say "follow CLAUDE.md for testing conventions." Is this sufficient, or should we detect `package.json` scripts and inject specific gate commands into prompts? > Sufficient.

3. **commit skill and /commit command** — the cycle's committer agent currently runs `/commit` (a Claude Code command). After porting, this becomes the `/commit` skill. The committer agent spawns `claude -p` with just `/commit` as the prompt. Verify this works with skills (not just commands). > Needs verification during development.

4. **Symlink vs copy** — symlinks mean editing ivy updates all projects instantly. But if a project is shared (git), symlinks pointing to `/opt/ed/ivy` won't resolve on other machines. Is this acceptable? Alternative: copy files and use hashes to detect when ivy source has newer versions. > Let's use symlinks for now.

5. **GLM MCP scope** — how many tools should the GLM server expose? Minimal (think + write-code + review) or match all codeforge-mcp tools? Recommendation: start minimal, expand based on usage. > Minimal: think + write-code + review is enough.
