# Factory — Portable Development Harness

Factory is a CLI that copies a curated set of Claude Code skills, scripts and hooks into any
project, and runs missions across those projects. Install, update, uninstall, tracked in a manifest.

## Important Files
- Terminology: @docs/terminology.md
- Docs format: @.claude/docs-format.md
- Code format: @.claude/code-format.md
- Parts: `docs/parts.md` — part.yaml, targets, scope, `${name}`, manifest, the install family
- Missions: `docs/missions.md` — the mission family's grammar and invariants
- Design: `docs/design.md` — palette, layout, keys, glyphs, formats for Mission Control
- Roadmap: `docs/roadmap.md`
- Memories: `docs/memories.md` — what closed missions learned, the seed corpus for the `mem` MCP

Read the doc for the subsystem you touch before editing it; the invariants there are the tests.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict, ES modules)
- **UI**: @clack/prompts for interactive menus

## Architecture

```
src/           CLI source (entry: src/cli.ts)
├── core/      Business logic — registry, scanner, manifest, linker, parts (removal), env, peer
│              (a session's inbox socket, and posting to it),
│              projects (home and factoryHome read at call time, scopeOf), config (vars, the
│              parts: scope block, caffeinate), recipes, args, workflow (YAML load + transitions,
│              stepRole, ROLE_MODEL), mission (folder, state, claim, branch, autonomy, insert pointer,
│              archive), decision (decisions.md table, waits, first answer wins),
│              spawn (preset, the mission's settings overlay, the Warp tab: `claude` in it, or `claude --bg` and attach)
├── ui/        Presentation — theme, prompts, formatters
├── tui/       Mission Control — model (Snapshot), live (snapshot from disk), transcript (tail,
│              activity, tokens), watch (fs.watch + poll), screen (chrome + render + run), keys
│              (what a keypress does), panes/ (pane scaffolding plus left, messages, mission,
│              parts, foot, compose, help — one file each, none over 400 lines), actions (what a key
│              writes, through the CLI's own functions), notify, frames, format, theme
├── commands/  install, uninstall, status, update, mission, step, gate, decision, handoff, control
└── types.ts   Shared type definitions

parts/<name>/  One folder per part: part.yaml plus the files it installs
scripts/test.ts In-process: the same walk plus worktree pairs, one line per case
scripts/e2e.sh One throwaway repo: install --yes, a chore mission end to end, uninstall --yes
scripts/tui-keys.ts     Mission Control headless: keys through `onKey`, every frame checked
scripts/hook-inject.ts  hook-factory's decision paths as a child, or its own scratch self-check
scripts/tui-snapshot.ts The fixture screen as plain text, for a look review with no tty
scripts/spawn.ts        The one real model run behind `e2e.spawn`: a @Worker's decision injected back
.factory/factory.yaml   the project's own recipes: verify, e2e.ready, e2e.run, e2e.spawn — a
               nested recipe reads back under its dotted path
workflows/     intent, story, chore, research, quick — the shipped workflow YAML: every mission
               starts on intent, `mission shape` appends a preset behind that step and `--verify`
               puts a verifier loop behind a chore's implement
presets/<name>/ preset.yaml, prompt.md, settings.json, mcp.json — one spawn bundle per preset
~/.factory/    Home dir: projects list, config.yaml (var overrides, a `parts:` block choosing
               `project`, `global` or `off` per part over the scope its part.yaml recommends, plus
               `caffeinate: auto|on|off`, which the hook reads per event and Mission Control's `c`
               rewrites, `launch: fg|bg`, how `mission open` runs claude, and an `order:` block
               Mission Control's `⇧↑↓` keeps), events/<session>.jsonl
               (the hook's lines plus Mission Control's one `Rename`), caffeinate/<session>.pid and
               control.pid
~/.claude/     Where `scope: global` parts install: the same copies, `.factory-manifest.json` and
               one `settings.json` holding both the hooks and the allow list
.factory/archive/<dir>  a closed mission's folder, renamed there by `mission archive`. Both it
               and `.factory/missions/` are ignored: a run's record belongs to the machine that
               ran it, not to the history of the code
~/.warp/tab_configs/factory-<mission>.toml   written by `mission open`, opened by URI
```

### Key principle

Files under `parts/<name>/` get **copied** into the target `.claude/`, so the project stands on its
own and the manifest is the only link back. A Factory change reaches a project through `update`
there, and `update --all` runs it on every registered project and then the home dir. A file marked
`skipIfExists` is copied in as a template only when the project has nothing there.

Roles ship as parts: `/mission` carries the Orchestrator's manual plus `Worker`, `Investigator`
and `Summarizer`; `/verify` carries `Verifier`; `/validate` carries `Validator`; `/retro` sweeps
closed missions' retros back into work. Shared context reaches every agent through the
`## Important Files` snippets, never through a sentence repeated in each prompt. The `mission`
skill stays under 120 lines, `Worker` under 40, `/retro` under 60, every other prompt under 80.

### Two command families

`install | uninstall | status | update [project]` act on a project: the argument, else the cwd when it is registered, else the picker;
`--global` stands where the project path would. `mission | step | gate | decision | handoff <sub>`
act on the checkout you are standing in, never prompt, and exit 1 with a one-line `✗ …` on a
refusal. Grammar and rules in `docs/parts.md` and `docs/missions.md`.

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
- `bun scripts/test.ts` — the whole walk in one process, one line per case
- `bash scripts/e2e.sh` — the same ground as a black box, through the CLI
- `bun scripts/tui-keys.ts --fixture --quiet <keys>` — the screen under keys, frames checked
- A script importing `src/tui/*` runs from inside the repo — from `/tmp` Bun resolves a second
  `@opentui/core` out of its global cache and every `instanceof` fails silently
- `bun scripts/hook-inject.ts` — a handoff's decisions filed and injected, scratch HOME and all
- `bun x tsc --noEmit` — typecheck

`e2e.run` is `scripts/e2e.sh` plus those two drivers, `e2e.spawn` is `scripts/spawn.ts` alone because
it spends a real model run; `verify` is `tsc`, `scripts/test.ts` and `status`.

### What not to do

- Don't add a folder under `parts/` without a `part.yaml` — it will not be seen
- Don't use 2-space indent for console output — always use `I` from theme
- Don't call `process.exit()` from commands or prompts — throw `CancelError` or `Refusal` instead
- Don't read files synchronously in `src/` — use `node:fs/promises`
