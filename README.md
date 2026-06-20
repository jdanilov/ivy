# ♻ Ivy

**Minimalistic portable agent harness for Claude Code.**

- Ivy manages an extendable set of `skills`, `tools`, `hooks`, `MCPs` for fast and practical SDLC with Claude Code.
- Run `bun start` to install Ivy into any project run with Claude Code.
- Update all connected projects by updating Ivy centrally.
- Uninstalls cleanly.

![Ivy status view](docs/ivy-screenshot.png)

## Setup

**Prerequisites**: [Bun](https://bun.sh) or [NodeJS](https://nodejs.org/) runtime.

```bash
git clone git@github.com:jdanilov/ivy.git && cd ivy && bun install
```

Then:

```bash
# Interactive mode — pick command and project
bun start

# Direct commands
bun src/cli.ts install /path/to/project         # Manage installed parts
bun src/cli.ts uninstall /path/to/project
bun src/cli.ts status /path/to/project
bun src/cli.ts cycle /path/to/project           # Runs cycle ralph loop
```

Enter a path to your project and pick which parts to install.  Ivy **symlinks** its `parts` into your project's `.claude/` directory. This means:

- Updating Ivy instantly updates all connected projects
- No copied files to drift out of sync
- Clean uninstallation removes only what Ivy added
- Manifest with SHA-256 hashes detects local modifications

## Parts

Ivy is extendable, and comes with a curated list of parts to start with:

| Part             | Type     | Model  | Description                                               |
|------------------|----------|--------|-----------------------------------------------------------|
| `/brainstorm`    | skill    | opus   | Generates plan files interactively                        |
| `/cycle`         | tool     | —      | Developer-critic-fixer Ralph loop over brainstormed plans |
| `/critic`        | skill    | opus   | Reviews uncommitted changes and works through findings    |
| `/commit`        | skill    | sonnet | Structured git commits                                    |
| `/research`      | tool     | grok   | Deep web research via Grok AI to replace Googling         |
| `/flow`          | skill    | sonnet | Explains and visualizes system flows                      |
| `/capture`       | tool     | —      | Screenshot capture via Playwright                         |
| `hook-safe-bash` | fixture  | —      | Block destructive bash commands                           |
| `hook-sounds`    | fixture  | —      | Sound notification on Claude session end                  |
| `glm`            | mcp      | —      | GLM model proxy (z.ai)                                    |

### Part types

| Type        | Prefix | What it is                                                                        |
|-------------|--------|-----------------------------------------------------------------------------------|
| **skill**   | `/`    | Prompt template with model directive — invoked as `/name` in Claude Code          |
| **tool**    | `/`    | Skill with supporting scripts or runtime — invoked as `/name`                     |
| **fixture** | —      | Project configuration: hooks, scripts, assets (not a command)                     |
| **mcp**     | —      | MCP server entry injected into `.mcp.json`                                        |

## How to Use

Ivy is built around **code → review → commit** loop:

### Day-to-day coding

- Use `/brainstorm` to plan before starting anything non-trivial — it asks clarifying questions and produces a plan file with tasks and acceptance criteria in `docs/plans/`.
- Use `/critic` before committing or when you've made meaningful changes (a feature, a fix, a refactor).
- Use `/commit` to make structured.

### Autonomous loop with cycle

- For larger tasks, use the full `/cycle` loop instead of coding manually.
- After brainstorming produces a plan, run `bun src/cli.ts cycle dark-mode-support`

Cycle runs autonomously: Developer implements tasks → Critic reviews changes → Fixer addresses findings → Committer creates structured commits. Repeats until all tasks are complete. If the Developer needs input, it adds "Ask User" items to the plan and cycle pauses for your answer.

### Research

- Use `/research <question>` for fact-checked, cited research via Grok AI before making architectural decisions. Results are saved to `docs/research/` for reference.
- Use `/flow <feature>` to explain a data flow for a feature, bug, sub-system.

## Extending Ivy

**Adding Skills**:

1. Create `parts/skills/<name>/skill.md` with YAML frontmatter (`name`, `model`, `description`) and your prompt. Use `$ARGUMENTS` for user input.
2. Register in `src/core/registry.ts` with `type: 'skill'`.

Then run `ivy install` on your project to symlink it in.

## Environment variables

Some parts require API keys. Ivy checks both `process.env` and the target project's `.env` file.

| Part        | Variable      | Where to get             |
|-------------|---------------|--------------------------|
| `/research` | `XAI_API_KEY` | https://console.x.ai     |
| `glm`       | `GLM_API_KEY` | https://open.bigmodel.cn |

## License

MIT
