# Spec: Factory refit

Agent-facing. Orchestrator is the Fable session bound to this mission. Workers are Opus sub-agents, one at a time, clean context. Every Worker reads this file, `intent.md`, `acceptance.md` and the project `CLAUDE.md` (later `AGENTS.md`) before touching code. Every Worker ends with the handoff at the bottom.

## Ground rules for workers

- Bun, TypeScript strict, ES modules, `.js` import suffixes, `node:` builtins, `Bun.file`, `Bun.write`, `Bun.YAML`. No new dependencies.
- Console output through `I` from `src/ui/theme.ts`. Refusals throw `Refusal`, prompts throw `CancelError`. No `process.exit` outside `cli.ts`.
- Minimal code. No abstraction for one caller. No option nobody asked for. Delete what the step says to delete.
- No probing of the `claude` binary, no live sessions, no time spent on tooling you were not asked to build. If a check needs a fact you cannot read from disk, return blocked with the question.
- `bun x tsc --noEmit` and the step's checks pass before handing off. Commit on `mission/refit` with the `@Commit` format: `<emoji> <type>: <subject>`, no trailers.
- Do not touch `/opt/ed/igs` except in W5. Do not touch `~/.claude`. Do not touch `plugins/factory`.
- Do not edit `.factory/missions/2026-09-03-ai-factory/` or `docs/design.md`.
- A faster or cheaper way you saw and did not take goes in `Faster`. Do not implement it.

## Layout after this mission

```
parts/
  retro/skill.md                 new, /retro
  roadmap/{part.yaml,roadmap.md} new, template docs/roadmap.md
  codegraph/{part.yaml,gate.sh}  new, opt-in mcp part
  archify/{part.yaml,skill.md,bin/archify.mjs}  new, opt-in skill part, vendored
  critic/                        gone
src/core/linker.ts               + snippet inject/remove
src/core/recipes.ts              new, init and uninit runners, vars resolution
src/core/config.ts               new, ~/.factory/config.yaml
AGENTS.md                        was CLAUDE.md, trimmed
CLAUDE.md                        one line: @AGENTS.md
plugins/factory/                 untouched, unreferenced
```

## Train

Serial. Each step names the acceptance ids it owns.

### W1 Parts engine: snippet, recipes, vars

Files: `src/types.ts`, `src/core/registry.ts`, `src/core/linker.ts`, `src/core/recipes.ts` new, `src/core/config.ts` new, `src/commands/{install,uninstall,update,status}.ts`, `CLAUDE.md` part.yaml section.

part.yaml gains three optional keys:

```yaml
snippet:
  section: "## Important Files"     # required, an ATX heading line
  line: "- Terminology: @docs/terminology.md"   # required, one line
  file: AGENTS.md                   # optional, overrides the default resolution
recipes:
  init:   ["${codegraph} init"]     # run once, when the part becomes installed
  uninit: ["${codegraph} uninit --yes"]  # run once, when the part is uninstalled or dropped
vars:
  codegraph: "npx -y @colbymchenry/codegraph@1.6.0"   # default, overridable
```

Snippet:
- Target file resolution when `file` is absent: `AGENTS.md` if it exists, else `CLAUDE.md` if it exists, else create `AGENTS.md`. Resolved at install time and recorded in the manifest as `snippet: { file, section, line }`.
- Install and update: ensure the section heading exists (append `\n<section>\n` at end of file when missing), then append the line at the end of that section (before the next heading of the same or higher level, or EOF) unless the exact line is already present anywhere in the section. Idempotent.
- Uninstall and drop-by-update: remove the exact line from the recorded file. If the section then holds only blank lines, remove the heading too. Never touch anything else in the file. Use the manifest record, not a fresh resolution.
- `status` shows nothing new for snippets. `install` and `update` print one line per snippet written or removed, same style as hooks.

Vars:
- `src/core/config.ts` reads `~/.factory/config.yaml`, shape `{ vars?: Record<string,string> }`. Missing file is `{}`.
- Resolution order per var: config `vars.<name>`, else the part's `vars.<name>`, else refuse with `✗ part <p> uses ${<name>} and nothing defines it`.
- `${name}` substitution applies to `mcp.config.command`, `mcp.config.args[]`, `hooks[].command` and both recipe lists. Substitution happens when the manifest entry is built, so the manifest and `.mcp.json` hold the resolved strings. `update` re-resolves, so changing the config and running `update` re-points a project.
- A var value is a command prefix and may contain spaces. Where it lands in `mcp.config.command` the first word is the command and the rest is prepended to `args`.

Recipes:
- `src/core/recipes.ts` runs each line with `Bun.spawn(["sh","-c",line])`, cwd the project root, inherit stdio. A non-zero exit refuses with `✗ <part> init: <line> -> <code>` and leaves the part linked, so the human can fix and rerun `update`. Record `initAt` in the manifest part on success; `update` runs `init` only when `initAt` is absent.
- `uninit` runs on `uninstall` and when `update` drops a part the registry no longer has. Failure prints `◈` and continues the unlink.
- Registry validates the new keys: `snippet.section` starts with `#`, `snippet.line` is one line, recipe lists are string arrays, vars is a string map.

Checks: a temp git repo with an `AGENTS.md` lacking the section, a fake part in a temp registry dir is out of scope, so test with the real `terminology` part after W3 lands the snippet, or with a scratch part.yaml you delete before committing. `install` then `uninstall` leaves `AGENTS.md` byte-identical. `install` twice adds one line. A repo with only `CLAUDE.md` gets the line in `CLAUDE.md`. A repo with neither gets `AGENTS.md` created.

Owns A-SNP-1..5, A-RCP-1..3, A-VAR-1..2.

### W2 Missions: stub, close, list

Files: `src/types.ts`, `src/core/mission.ts`, `src/commands/mission.ts`, `src/core/projects.ts`, `README.md` command table, `CLAUDE.md` command block.

- `MissionState.status` gains `stub`. `branch` becomes `string | null`.
- `factory mission new <name> --stub [--workflow W] [--title T]`: creates the folder, `workflow.yaml` copy, `handoffs/`, `state.json` with `status: stub`, `branch: null`, `step` the first step, and `intent.md` from a skeleton (`# Intent: <title>`, `## Why`, `## Done looks like`, `## Not in this mission`). No branch, no claim, no project registration change beyond what `new` already does, no `open`. Refuses when the folder exists.
- `factory mission open <name>` on a stub: refuses if the checkout has a claim for another open mission (same message as `new`, no worktree offer). Otherwise creates `mission/<name>` from HEAD, checks it out, writes the claim, sets `status: open`, `branch`, then proceeds exactly like `open` on an open mission. `mission new --stub` followed by `mission open <name>` ends in the same state as `mission new <name>`.
- `step start|done|skip|add|loop`, `gate open|answer`, `handoff save`, `mission adopt|resume|close` on a stub refuse with `✗ mission <name> is a stub, open it first`.
- `mission list` shows stubs with `○` and the word `stub` in the state column, sorted after open missions. `--all` unchanged.
- `mission list` and `gate list` skip a project whose path does not exist, silently. `loadProjects` is not pruned.
- `mission close`: before switching to trunk, if `git status --porcelain` shows only paths under the mission folder, commit them on the mission branch with subject `📦 chore: close mission <name>`. If anything else is dirty, refuse with the current message plus the dirty paths. Then the existing merge flow. Rerun after a crash still finishes.

Checks: temp repo, `new --stub`, `list`, `step start` refused, `open --dry-run` promotes and prints the command, `git branch` shows the branch, `state.json` open; a second temp repo runs a chore mission to the end with a dirty `state.json` and `close` succeeds without a manual commit.

Owns A-STB-1..4, A-CLS-1..2.

### W3 Parts content: roadmap, docs-format, critic, codegraph, archify, AGENTS.md

Files: `parts/roadmap/` new, `parts/terminology/part.yaml`, `parts/docs-format/{part.yaml,docs-format.md}`, `parts/critic/` deleted, `parts/codegraph/` new, `parts/archify/` new, `parts/permissions/part.yaml`, `docs/terminology.md`, `CLAUDE.md` → `AGENTS.md`, `README.md`, `docs/roadmap.md` in ivy.

- `parts/roadmap/part.yaml`: fixture, default true, file `roadmap.md` → `docs/roadmap.md`, `skipIfExists: true`, snippet `- Roadmap: @docs/roadmap.md` under `## Important Files`. Template: title, one sentence saying it is a plain checklist that `/retro` appends to, one `- [ ]` example line.
- `parts/terminology/part.yaml` snippet `- Terminology: @docs/terminology.md`. `parts/docs-format/part.yaml` snippet `- Docs format: @.claude/docs-format.md`. Both under `## Important Files`.
- `parts/docs-format/docs-format.md` rewritten. Ten lines or fewer of text plus the glyph table. Reasons before rules. Keep: agents read these docs, tokens are the cost, reasoning before conclusions, tables and glyph flows where they carry more than prose, `@path` references, terminology names. Drop: the example, "one idea per line", "never restate", em-dash and box-drawing bans as rules (fold them into one line on plain characters if at all). No line that an agent can violate while still serving the reader.
- `rm -r parts/critic`. Grep for `critic` in `parts`, `presets`, `README.md`, `CLAUDE.md`, remove every reference.
- `parts/codegraph/part.yaml`: type `mcp`, default false, description `code graph MCP plus prompt hook, per project index (codegraph)`. `vars: { codegraph: "npx -y @colbymchenry/codegraph@1.6.0" }`. `files: [{ source: gate.sh, target: .claude/scripts/codegraph-gate.sh }]`. `mcp: { serverName: codegraph, config: { command: "${codegraph}", args: [serve, --mcp] } }`. `hooks: [{ event: UserPromptSubmit, command: "CODEGRAPH=\"${codegraph}\" $CLAUDE_PROJECT_DIR/.claude/scripts/codegraph-gate.sh" }]`. `recipes: { init: ["${codegraph} init"], uninit: ["${codegraph} uninit"] }`. Confirm the `uninit` flags from `codegraph uninit --help` on this machine (it is installed) and pick the non-interactive form. `settings.permissions.allow` gets `mcp__codegraph__*`. `gate.sh` is `/opt/ed/igs/.claude/scripts/codegraph-gate.sh` with the binary replaced by `${CODEGRAPH:-codegraph}` and nothing else changed. `~/.factory/config.yaml` on this machine gets `vars: { codegraph: codegraph }` so the local fork on PATH is used here; say so in the handoff, do not commit that file.
- `parts/archify/part.yaml`: type `skill`, default false, description `architecture diagrams from a typed spec, html and svg (opus)`. Files `skill.md` and `bin/archify.mjs`, targets default. Fetch both from `https://github.com/tt-a1i/archify` (`SKILL.md` and `bin/archify.mjs`, find the default branch first via the GitHub API). Vendor unchanged except: frontmatter `name: archify`, add `model: opus`, replace any path that assumes `~/.claude/skills/archify` with `$CLAUDE_PROJECT_DIR/.claude/skills/archify`. Record the upstream commit sha as a comment on line one of part.yaml. If the repo is unreachable, hand off blocked with the URL tried.
- `git mv CLAUDE.md AGENTS.md`. Trim to what an agent needs: overview, stack, architecture tree, part.yaml reference with the new keys, command families, mission invariants, conventions, what not to do. Drop the installation flow narrative and the part-type table. Add `## Important Files` and run `bun src/cli.ts update /opt/ed/ivy` so the three snippets land there (roadmap is default, so it also creates `docs/roadmap.md`). Write `CLAUDE.md` with the single line `@AGENTS.md`. `docs/roadmap.md` in ivy starts with the carried items from `intent.md` Not in this mission: Mission Control, memory, global parts, Codex harness, tokens per step, one line each.
- `docs/terminology.md`: Gate row loses the plugin sentence, `human` gates are asked in the session and recorded by `factory gate answer`. Question row: raised by returning blocked with the question, the Orchestrator asks and re-spawns. handoffs/ row: fields present only when they have content. New rows: Stub (mission with intent and no branch), Snippet (a part's line in `AGENTS.md`), Roadmap (`docs/roadmap.md`, plain checklist), Retro sweep (`/retro` over closed missions).
- `README.md`: command table gains `--stub`, part list loses critic, gains roadmap, retro (placeholder row, W4 ships it), codegraph, archify. One paragraph on snippets and `~/.factory/config.yaml` vars.

Checks: `bun src/cli.ts status /opt/ed/ivy` lists the new parts and no critic. `AGENTS.md` has the three lines under `## Important Files`. `bun src/cli.ts install <tmp repo>` selecting codegraph in a small repo with a `.ts` file runs `codegraph init` and writes `.codegraph/`, `.mcp.json` command is the local `codegraph` because of the config; `uninstall` removes `.codegraph/`. `wc -l parts/docs-format/docs-format.md` under 25 including the table.

Owns A-PRT-1..7, A-CG-1..3, A-ARC-1..2, A-DOC-1..3.

### W4 Prompts: Worker, handoffs, function hooks unwired, /retro

Files: `parts/mission/{skill.md,agents/Worker.md,agents/Investigator.md,agents/Summarizer.md}`, `parts/verify/agents/Verifier.md`, `parts/verify/skill.md`, `parts/validate/agents/Validator.md`, `parts/validate/skill.md`, `parts/commit/agents/Commit.md`, `parts/explain/skill.md`, `parts/research/skill.md`, `parts/browse/skill.md`, `presets/*/{preset.yaml,prompt.md}`, `src/core/spawn.ts`, `src/types.ts`, `parts/retro/` new, `AGENTS.md` roles paragraph.

- Every prompt drops its docs-format and terminology sentences. Grep `docs-format`, `terminology` across `parts` and `presets`: zero hits after this step except `parts/docs-format/`, `parts/terminology/` and the retro skill's use of `retro.md`.
- Worker.md rewritten, under 40 lines. Frontmatter description states the goal: makes one step of a mission pass its assertions and hands off. Body order: the goal in one sentence, what to read (`AGENTS.md`, spec section, owned assertions, intent, prior handoffs), then three guardrails: stay in the step, minimal code, ask when the spec is silent by returning blocked with the question and three options. Then before hand off: run the checks and the `verify` recipe, commit with the `@Commit` format. Then the handoff template. Nothing else.
- Handoff template, in Worker.md, mission skill.md, Investigator.md, Summarizer.md, Verifier.md, Validator.md and the spec template line in mission skill.md:

  ```
  Step: <id>
  Done: <one line per item>
  Acceptance: <id pass|fail|unchecked>, one per owned id
  ```
  followed by `Undone`, `Commands`, `Issues`, `Deviations`, `Faster` only when they have content. `Commands` lists a command only when it failed or decided something, with its exit code. The word `none` is never written. The template block states this in one line under it.
- Function hooks unwired: `preset.yaml` loses `plugins`, `Preset.plugins` and the `--plugin-dir` loop in `spawn.ts` go. Every agent `tools:` list loses `mcp__factory__ask`. Mission skill.md: the Questions and gates section becomes three lines: human gates are asked natively in the session and recorded with `factory gate answer`; a sub-agent that needs a decision returns blocked with its question and three options, the Orchestrator asks and re-spawns it with the answer. `presets/orchestrator/prompt.md` says the same in one line. `grep -rn "mcp__factory\|plugin" parts presets src` returns nothing.
- Gatekeeper prompts (Verifier.md, Validator.md): one line each, CLI runs against temp repos export `HOME=$(mktemp -d)` so `~/.factory` stays clean. No `rm` of HOME anywhere.
- `parts/retro/part.yaml`: skill, default true, description `sweep closed missions' retro.md, one actionable item at a time (opus)`. `parts/retro/skill.md`, model opus, under 60 lines:
  - Sweep: every `.factory/missions/*/` whose `state.json` says `closed` and has a `retro.md`. Collect actionable lines: bullets and table rows under any section except the `## Handoff` block. Skip praise and pure observation.
  - Order: cheapest with widest effect first.
  - One item at a time, plain text: the line, its mission, one recommendation among `apply now`, `stub`, `roadmap`, `drop`, with a reason. The human answers in the session.
  - `apply now`: spawn `@Worker` with the item as the whole step, the current checkout, no mission spec; the Worker commits. `stub`: `factory mission new <slug> --stub --title "<line>"`, then write the line into the stub's `intent.md` Why. `roadmap`: append `- [ ] <line> (<mission>)` to `docs/roadmap.md`. `drop`: nothing. Every answer prunes the line from `retro.md`; a table row goes as a row, a heading left with no content goes too.
  - A `retro.md` with no actionable lines left is deleted. The Handoff block at its end counts as no content.
  - End: `@Commit` for the retro and roadmap changes, then a three-line summary: applied, stubbed, roadmapped counts.
  - Refuse to run with a dirty working tree outside `.factory/`, say why.
- `AGENTS.md` roles paragraph names `/retro` beside `/verify` and `/validate`.

Checks: `wc -l` every prompt within limits (mission 120, Worker 40, retro 60, others 80). The greps above return nothing. `bun x tsc --noEmit`. `bun src/cli.ts mission open refit --dry-run` prints a command without `--plugin-dir`.

Owns A-WRK-1..2, A-HND-1..2, A-FH-1..3, A-RET-1..3, A-PRT-8.

### W5 Dogfood on igs

Files: `/opt/ed/igs/.claude/**`, `/opt/ed/igs/AGENTS.md`, `/opt/ed/igs/.claude/settings.json`, `/opt/ed/igs/.mcp.json`, `/opt/ed/igs/docs/roadmap.md`.

- `bun src/cli.ts update /opt/ed/igs`. Expected: critic unlinked, retro and roadmap linked, three snippet lines under `## Important Files` in igs `AGENTS.md`, `docs/roadmap.md` created, no `modified` or `conflict` in `status`.
- igs already wires codegraph by hand (`.mcp.json`, `settings.json` hook and allow, `.claude/scripts/codegraph-gate.sh`). Do not install the codegraph part on igs in this step, do not remove the hand wiring. Handoff lists the exact diff between igs' hand wiring and what the part would write, so the human can switch later with `install`.
- Do not commit in igs. List igs' dirty files in the handoff.

Owns A-DOG-1..2.

### Orchestrator, after W5

- `/retro` dogfood on `.factory/missions/2026-09-03-ai-factory/retro.md` in this session with the human. Owns A-RET-4 through the human's answers. Items the refit already covers (close commits first, HOME scratch, projects skip) are dropped by the sweep with that reason.
- Accept round: `/verify` and `/validate` in parallel, triage, loop or merge gate.

## Decisions made in the spec

- Vars live in `~/.factory/config.yaml`, machine level, because a local fork is a machine fact. No per-project override until someone needs one.
- Default codegraph is `npx -y @colbymchenry/codegraph@1.6.0`, pinned, so a project without a global install still works. This machine overrides to the `codegraph` on PATH.
- `codegraph.json` stays hand-authored per project. No template until a second project wants the same excludes.
- archify is a `skill` part: no PATH binary, no daemon. The renderer rides along under `bin/`.
- `CLAUDE.md` survives as one line `@AGENTS.md`, because Claude Code reads `CLAUDE.md` for certain and the redirect costs nothing.
- Snippet default section is not hard-coded, every part names its section, so a part may later add a line under a different heading.
- `/retro` runs in the human's session, not as a mission. It is a conversation with pruning side effects.
- Uninit failure does not block uninstall. A stale `.codegraph/` is a nuisance, a part that cannot be removed is a bug.

## Risks

- `@path` lines in `AGENTS.md`: Claude Code imports `@path` from `CLAUDE.md`; whether it does so from `AGENTS.md` natively is not verified here. The `CLAUDE.md` redirect covers it either way.
- archify upstream layout may differ from the research (branch name, file paths). W3 fetches the tree first and hands off blocked if the two files are not found.
- `npx -y` cold start on the MCP command adds seconds to session start in projects without a global codegraph. The var override is the escape hatch.

## Handoff template

Final message of every Worker, plain text, nothing after it:

```
Step: <id>
Done: <one line per item>
Acceptance: <id pass|fail|unchecked>, one per owned id
```

Add `Undone`, `Commands`, `Issues`, `Deviations`, `Faster` only when they have content. Commands only when they failed or decided something, with exit code. Never write `none`.
