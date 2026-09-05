# ♻ Factory

**Minimalistic portable agent harness for Claude Code.**

- Factory manages an extendable set of `skills`, `tools`, `hooks` and `MCPs` for a fast, practical SDLC with Claude Code.
- One command installs them into any project, one updates, one removes.
- Parts are symlinked, so updating the Factory updates every connected project.

![Factory status view](docs/factory-screenshot.png)

## Setup

**Prerequisites**: [Bun](https://bun.sh).

```bash
git clone git@github.com:jdanilov/ivy.git factory && cd factory && bun install
```

```bash
bun start                                     # interactive: pick a command and a project

bun src/cli.ts install   /path/to/project     # pick parts to install
bun src/cli.ts update    /path/to/project     # relink installed parts, add new defaults, drop retired ones
bun src/cli.ts status    /path/to/project     # what is installed
bun src/cli.ts uninstall /path/to/project     # pick parts to remove
```

Parts are symlinked into the project's `.claude/`. `.claude/.factory-manifest.json` records SHA-256 hashes, so local modifications are visible and uninstall removes only what the Factory added. Recent projects live in `~/.factory/projects`.

## Parts

| Part             | Type    | Model  | Description                                                  |
|------------------|---------|--------|---------------------------------------------------------------|
| `/mission`       | skill   | fable  | Orchestrator's manual: workflow, steps, gates, triage, close  |
| `/verify`        | skill   | sonnet | Verifier over the diff, the `verify` recipe and the contract  |
| `/validate`      | skill   | opus   | Validator drives the running system, evidence per assertion   |
| `/critic`        | skill   | sonnet | Verifier over the uncommitted diff, no contract               |
| `/commit`        | skill   | sonnet | Structured git commits                                        |
| `/explain`       | skill   | sonnet | Explains and visualizes system flows                          |
| `/research`      | tool    | sonnet | Cited web research via Grok, saved to `docs/research/`        |
| `/browse`        | tool    | sonnet | Drives a real or headless browser through `agent-browser`     |
| `docs-format`    | fixture | —      | How agent-facing docs are written, referenced by every agent  |
| `terminology`    | fixture | —      | Template `docs/terminology.md`, seeded only when absent       |
| `permissions`    | fixture | —      | Baseline tool allow list merged into `.claude/settings.json`  |
| `hook-factory`   | fixture | —      | Reports session events to `~/.factory/events`                 |
| `hook-safe-bash` | fixture | —      | Blocks destructive bash commands                              |

Agents ship beside the skill that spawns them: `Worker`, `Investigator`, `Summarizer` with
`/mission`, `Verifier` with `/verify`, `Validator` with `/validate`, `Commit` with `/commit`.

| Type        | Prefix | What it is                                                       |
|-------------|--------|-------------------------------------------------------------------|
| **skill**   | `/`    | Prompt with a model directive — invoked as `/name` in Claude Code |
| **tool**    | `/`    | Skill with supporting scripts or runtime                          |
| **fixture** | —      | Project configuration: hooks, scripts, assets                     |
| **mcp**     | —      | MCP server entry injected into `.mcp.json`                        |

## Adding a part

1. Create `parts/<name>/part.yaml` (`type`, `description`, `default`, `files`, optional `hooks`, `mcp`, `settings`, `envVars`).
2. Put the files it installs beside it — `skill.md`, `agents/<Agent>.md`, `scripts/…`.
3. Run `bun src/cli.ts install <project>`.

See `CLAUDE.md` for the target rules and `docs/terminology.md` for the names.

## Environment variables

Checked against `process.env` and the target project's `.env`.

| Part        | Variable      | Where to get         |
|-------------|---------------|----------------------|
| `/research` | `XAI_API_KEY` | https://console.x.ai |

## License

MIT
