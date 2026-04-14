# Ivy

**Portable development harness for Claude Code.**
       
Allows managing a curated set of skills, scripts, tools, hooks, and MCP servers into any Clade Code project with one command. Uninstall cleanly. Update all connected projects by updating ivy.

![Ivy status view](docs/ivy-screenshot.png)

## How it works

Ivy **symlinks** its `parts` into your project's `.claude/` directory. This means:

- Updating ivy instantly updates all connected projects
- No copied files to drift out of sync
- Clean uninstall removes only what ivy added
- Manifest with SHA-256 hashes detects local modifications

## Parts

| Part          | Type    | Model  | Description                                |
|---------------|---------|--------|--------------------------------------------|
| `/brainstorm` | skill   | opus   | Interactive planning — generate plan files |
| `/dry`        | skill   | opus   | Code critic — review uncommitted changes   |
| `/flow`       | skill   | sonnet | Research and visualize system flows        |
| `/commit`     | skill   | sonnet | Structured git commits                     |
| `/research`   | tool    | —      | Web research via Grok AI                   |
| `/capture`    | tool    | —      | Screenshot capture via Playwright          |
| `/cycle`      | tool    | —      | Developer-critic-fixer ralph loop          |
| `safe-bash`   | fixture | —      | Block destructive bash commands            |
| `sounds`      | fixture | —      | Sonar notification on Claude session end   |
| `glm`         | mcp     | —      | GLM model proxy (z.ai)                     |

## Setup

**Prerequisites**: [Bun](https://bun.sh) runtime.

```bash
git clone git@github.com:jdanilov/ivy.git
cd ivy
bun install
```

## Usage

```bash
# Interactive mode — pick command and project
bun src/cli.ts

# Direct commands
bun src/cli.ts install /path/to/project
bun src/cli.ts uninstall /path/to/project
bun src/cli.ts status /path/to/project
bun src/cli.ts cycle /path/to/project           # Runs cycle ralph loop
```

## Workflow: brainstorm + cycle

The `/brainstorm` and `/cycle` parts work together as a plan-and-execute workflow:

1. **Plan** — inside Claude Code, run `/brainstorm add dark mode support`. Opus asks clarifying questions, then generates a plan file at `docs/plans/dark-mode-support.md` with tasks and acceptance criteria.

2. **Execute** — in your terminal, run cycle from the project directory:
   ```bash
   bun .claude/skills/cycle/index.ts dark-mode-support
   ```
   Cycle picks up the plan and runs an autonomous loop: Developer implements tasks, Critic reviews changes, Fixer addresses findings, Committer creates structured commits. Repeats until all tasks are done.

3. **Iterate** — if the Developer needs input, it adds "Ask User" items to the plan. Cycle pauses and prompts you for answers before continuing.

## Creating a new skill

1. Create `parts/skills/<name>/skill.md`:
   ```markdown
   ---
   name: my-skill
   model: sonnet
   description: What this skill does
   ---

   # My Skill

   Your prompt here. $ARGUMENTS contains what the user typed after /my-skill.
   ```

2. Register in `src/core/registry.ts`:
   ```typescript
   {
     name: 'my-skill',
     type: 'skill',
     description: 'what it does (model)',
     default: true,
     files: [
       { source: 'parts/skills/my-skill/skill.md', target: '.claude/skills/my-skill/skill.md' },
     ],
   },
   ```

3. Run `ivy install` on your project to symlink the new skill.

## Environment variables

Some parts require API keys. Ivy checks both `process.env` and the target project's `.env` file.

| Part        | Variable      | Where to get             |
|-------------|---------------|--------------------------|
| `/research` | `XAI_API_KEY` | https://console.x.ai     |
| `glm`       | `GLM_API_KEY` | https://open.bigmodel.cn |

## License

MIT
