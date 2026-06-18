# Ivy

**Portable development harness compatible with Claude Code.**

- Ivy manages an extendable set of Claude Code skills, tools, fixtures, MCPs and best practices for fast and reliable AI-driven agentic development.
- Run `bun start` to install Ivy into any project run with Claude Code.
- Update all connected projects by updating Ivy centrally.
- Uninstalls cleanly.

![Ivy status view](docs/ivy-screenshot.png)

## How it works

Ivy **symlinks** its `parts` into your project's `.claude/` directory. This means:

- Updating Ivy instantly updates all connected projects
- No copied files to drift out of sync
- Clean uninstallation removes only what Ivy added
- Manifest with SHA-256 hashes detects local modifications

## Parts

Curated list of parts to start with:

| Part          | Type     | Model   | Description                                         |
|---------------|----------|---------|-----------------------------------------------------|
| `@Critic`     | agent    | opus    | Sub-agent that reviews uncommitted changes          |
| `/brainstorm` | skill    | opus    | Interactive planning, generates plan files          |
| `/cycle`      | tool     | —       | Developer-critic-fixer ralph loop over plan files   |
| `/research`   | tool     | —       | Deep web research via Grok AI                       |
| `/flow`       | skill    | sonnet  | Research and visualize system flows                 |
| `/commit`     | skill    | sonnet  | Structured git commits                              |
| `/capture`    | tool     | —       | Screenshot capture via Playwright                   |
| `safe-bash`   | fixture  | —       | Block destructive bash commands                     |
| `sounds`      | fixture  | —       | Sound notification on Claude session end            |
| `glm`         | mcp      | —       | GLM model proxy (z.ai)                              |

### Part types

| Type        | Prefix | What it is                                                                        |
|-------------|--------|-----------------------------------------------------------------------------------|
| **agent**   | `@`    | Sub-agent with its own context, tools, and model — invoked as `@name`             |
| **skill**   | `/`    | Prompt template with model directive — invoked as `/name` in Claude Code          |
| **tool**    | `/`    | Skill with supporting scripts or runtime — invoked as `/name`                     |
| **fixture** | —      | Project configuration: hooks, scripts, assets (not a command)                     |
| **mcp**     | —      | MCP server entry injected into `.mcp.json`                                        |

The key difference between agents and skills: a **skill** runs inside your current session (sharing context), while an **agent** runs in its own isolated context window. Use agents for work where a fresh perspective matters — code review, research, audits.

## Setup

**Prerequisites**: [Bun](https://bun.sh) runtime.

```bash
git clone git@github.com:jdanilov/ivy.git && cd ivy && bun install
```

## Usage

```bash
# Interactive mode — pick command and project
bun start

# Direct commands
bun src/cli.ts install /path/to/project         # Adds / removes / reviews parts
bun src/cli.ts uninstall /path/to/project
bun src/cli.ts status /path/to/project
bun src/cli.ts cycle /path/to/project           # Runs cycle ralph loop
```

## Development workflow

Ivy is built around a tight **code → review → commit** loop:

### Day-to-day coding

Work with Claude Code normally. Use `/brainstorm` to plan before starting anything non-trivial — it asks clarifying questions and produces a plan file with tasks and acceptance criteria in `docs/plans/`.

When you've made meaningful changes (a feature, a fix, a refactor), run the critic before committing:

```
@Critic
```

Claude delegates to the `@Critic` sub-agent, which opens its own fresh context window, collects the git diff, and reviews the changes independently — without the bias of having written the code. It returns ranked findings:

- **■ major** — bugs, security issues, data loss risk
- **● minor** — code quality problems
- **◇ suggestion** — improvements worth considering
- **△ testing** — missing coverage

Pick which findings to address, fix them, then commit:

```
/commit
```

### Autonomous loop with cycle

For larger tasks, use the full `cycle` loop instead of coding manually. After brainstorming produces a plan:

```bash
bun src/cli.ts cycle dark-mode-support
```

Cycle runs autonomously: Developer implements tasks → Critic reviews changes → Fixer addresses findings → Committer creates structured commits. Repeats until all tasks are complete. If the Developer needs input, it adds "Ask User" items to the plan and cycle pauses for your answer.

### Research

Use `/research` for fact-checked, cited research via Grok AI before making architectural decisions:

```
/research best approach for rate limiting a Node.js API
```

Results are saved to `docs/research/` for reference.

## Adding a new part

**Skill** (prompt template):

1. Create `parts/skills/<name>/skill.md` with YAML frontmatter (`name`, `model`, `description`) and your prompt. Use `$ARGUMENTS` for user input.
2. Register in `src/core/registry.ts` with `type: 'skill'`.

**Agent** (isolated sub-agent):

1. Create `parts/agents/<name>.md` with frontmatter (`name`, `description`, `tools`, `model`) and the system prompt.
2. Register in `src/core/registry.ts` with `type: 'agent'`, targeting `.claude/agents/<name>.md`.

Then run `ivy install` on your project to symlink it in.

## Environment variables

Some parts require API keys. Ivy checks both `process.env` and the target project's `.env` file.

| Part        | Variable      | Where to get             |
|-------------|---------------|--------------------------|
| `/research` | `XAI_API_KEY` | https://console.x.ai     |
| `glm`       | `GLM_API_KEY` | https://open.bigmodel.cn |

## License

MIT
