# Spec: AI Factory v1, build order 1 and 2

Agent-facing. Orchestrator is the Fable session bound to this mission. Workers are Opus sub-agents, one at a time, clean context. Every worker reads this file, `intent.md`, `acceptance.md`, `docs/terminology.md` and `CLAUDE.md` before touching code. Every worker ends with a handoff per the template at the bottom.

## Ground rules for workers

- Bun, TypeScript strict, ES modules, `.js` import suffixes, `node:` builtins, `Bun.file`, `Bun.write`, `Bun.YAML`. No new dependencies unless the step says so.
- Console output through `I` from `src/ui/theme.ts`. Prompts throw `CancelError`. No `process.exit` outside `cli.ts`.
- Minimal code. No abstractions for one caller. No options nobody asked for. Delete what the step says to delete.
- Prompts and skills are short, reasoning-first, symbol diagrams over prose. Reference `docs/terminology.md` names exactly.
- Run `bun x tsc --noEmit` and the step's checks before handing off. Commit on `mission/ai-factory` with the Commit agent format from `parts/commit/Commit.md` (no trailers).
- Do not touch `/opt/ed/igs` except in step W6. Do not touch `~/.claude`.
- Log any faster or cheaper way you see in the handoff `Faster` line. Do not implement it.

## Layout after this mission

```
src/
  cli.ts                 factory <command> [args]
  core/                  registry (YAML), scanner, linker, manifest, env, projects
  core/mission.ts        mission folder, state.json, claim, branch, worktree, close
  core/workflow.ts       workflow YAML load, override, step and gate transitions
  core/spawn.ts          preset assembly, Warp tab config, claude invocation
  commands/              install, uninstall, status, update, mission, step, gate, handoff
  ui/
parts/<name>/part.yaml   one part per folder, files beside it
workflows/*.yaml         story, fix, chore, research, quick
presets/<name>/          prompt.md, settings.json, mcp.json, preset.yaml
plugins/factory/         function-hooks plugin: ask, gate, statusline, precompact
docs/design.md           design language
docs/terminology.md
```

Removed: `cycle/`, `mcps/`, `parts/skills/{brainstorm,capture,cycle,map}`, `parts/sounds`, `src/commands/cycle.ts`, deps `@modelcontextprotocol/sdk`.

## Train

Serial. Each step names the acceptance ids it owns. Two Investigator passes run in parallel with W1 and produce `recovery.md` and `docs/design.md`.

### I1 Recovery pass (Investigator, Sonnet, read-only, parallel)

Produces `recovery.md` in the mission folder. For every step of the story workflow and every CLI transition in W2, one line: what can break, what state is left behind, how `factory mission resume` or `factory status` recovers it. Covers: worker crash mid-step, session killed, gate answered twice, claim left by a dead session, worktree left after close, close with unmerged branch, main moved under the mission branch. Owns A-REC-1.

### I2 Design language (Investigator, Sonnet, read-only, parallel)

Reads the seven screenshots in the mission folder and writes `docs/design.md`: palette as ANSI 256 and truecolor pairs, type scale (there is one), layout grid of Mission Control, the glyph set mapped to the terse-visual symbols already in `CLAUDE.md`, row states, timestamp and duration formats, key bar, and the rules for CLI output from `factory` so the CLI and the future TUI read as one product. Ends with a mapping table from Droid names to Factory names (feature to step, worker to role, credits to tokens). Owns A-DLS-1.

### W1 Parts as YAML, rename to factory, drop dead parts

Files: `package.json`, `src/cli.ts`, `src/core/registry.ts`, `src/core/manifest.ts`, `src/core/projects.ts`, `src/types.ts`, `src/ui/theme.ts`, `src/ui/prompts.ts`, `src/commands/update.ts` new, every `parts/` folder, `CLAUDE.md`, `README.md`.

- Move each surviving part to `parts/<name>/` with a `part.yaml`: `type`, `description`, `default`, `files`, optional `hooks`, `mcp`, `envVars`. `files` entries are `{ source, target }` relative to the part folder and the target project. Target defaults when omitted: skill and tool parts map `parts/<name>/X` to `.claude/skills/<name>/X`, `agents/X.md` to `.claude/agents/X.md`. Fixtures list targets explicitly.
- Surviving parts: critic, commit, explain, research, hook-safe-bash. Agents move beside their skill: `parts/critic/agents/Critic.md`, `parts/commit/agents/Commit.md`.
- `registry.ts` loads every `parts/*/part.yaml` with `Bun.YAML.parse` at startup, validates shape, exports `loadParts()`. `PARTS` constant is gone; `NAME_COL` is computed from the loaded list.
- Rename: bin `factory`, banner `Factory`, manifest path `.claude/.factory-manifest.json` reading `.ivy-manifest.json` as a fallback and renaming it on the next write, root constant `FACTORY_ROOT`, projects file `~/.factory/projects` seeded from the repo `.projects` file once, then `.projects` deleted. Home dir init refuses while `~/.factory/auth.v2.key` or `~/.factory/droids` exist, prints one line telling the human to move them.
- `factory update <project>`: non-interactive. Relinks every installed part, unlinks parts no longer in the registry, rewrites hooks and manifest, prints one line per change. Used by every later step.
- Delete the removed folders and `src/commands/cycle.ts`, drop `cycle` from prompts and CLI, remove `@modelcontextprotocol/sdk` from `package.json` and run `bun install`.
- `CLAUDE.md` and `README.md` updated to the new layout and name. Keep both short.
- Checks: `bun src/cli.ts status /opt/ed/ivy` lists the five parts from YAML. `bun src/cli.ts update /opt/ed/ivy` removes stale symlinks under `.claude/skills/{brainstorm,cycle}` and the sounds hook, leaves `critic-self`, `dry`, `fork-critic` untouched.
- Owns A-CLI-1, A-CLI-2, A-CLI-3, A-CLI-4, A-CLI-5.

### W2 Mission core

Files: `src/core/mission.ts`, `src/core/workflow.ts`, `src/commands/mission.ts`, `src/commands/step.ts`, `src/commands/gate.ts`, `src/commands/handoff.ts`, `src/cli.ts`, `workflows/*.yaml`, `src/types.ts`. Reads `recovery.md`.

- Workflow schema exactly as in `intent.md`. Loader: default from `workflows/<name>.yaml`, replaced by name from `<project>/.factory/factory.yaml` `workflows:` key, `recipes:` key kept on the side. Validate: unique step names, `loop.back` names an earlier step, `parallel` members unique.
- `factory mission new <name> [--workflow W] [--attention full|light|unattended] [--title T] [--worktree]`. Runs in a project checkout. Creates `.factory/missions/<YYYY-MM-DD>-<name>/` with `workflow.yaml` (the copy), `state.json`, `handoffs/`. Creates branch `mission/<name>` from current HEAD and checks it out. Writes `.factory/claim` `{ mission, session: null, at }`. If the claim names another open mission, prints it and offers a worktree at `../<repo>-<name>` on the same branch (`--worktree` skips the prompt). Registers the project in `~/.factory/projects`.
- `state.json`: `{ name, title, workflow, attention, status: open|closed, step, round, session, branch, worktree, gates: { [step]: { status: open|answered, answer, note, at } }, steps: { [step]: { status: pending|running|done|skipped, startedAt, endedAt, reason } }, deviations: [{ at, what, reason }], created, updated }`. Wall time per step derives from the timestamps. Tokens are deferred to the Mission Control mission.
- `factory step start|done|skip <step> [--reason R]`, `factory step add <step> --after X --role R --reason R`, `factory step loop <step>` records a round and moves `step` to `loop.back`. `done` on a gated step refuses unless the gate is answered; `done` on a step with an unanswered `parallel` member refuses. Every transition appends a deviation when it disagrees with `workflow.yaml`.
- `factory gate open <step> --file F` writes the gate content path and marks it open. `factory gate answer <step> accept|amend|reject --note N`. `factory gate list` across `~/.factory/projects`. This is the fallback path; the plugin in W4 calls the same core functions.
- `factory handoff save <step>` reads stdin into `handoffs/<step>.md`, or `handoffs/<step>-r<round>.md` inside a loop.
- `factory mission list` across projects, `factory mission status [name]` prints the workflow with glyphs per `docs/design.md`, `factory mission adopt <name> --session <id>` binds a session, `factory mission resume <name>` re-checks out the branch and prints the current step and open gates, `factory mission close <name>` refuses with an open gate or a non-final step, merges `mission/<name>` into `main` with `--no-ff`, commits the mission folder on `main`, clears the claim, removes the worktree, sets `status: closed`. Mission folder resolves through `git worktree list` when run from a worktree.
- `factory status <project>` gains a Missions block: open missions, step, round, whether the bound session appears in `~/.factory/events/` in the last ten minutes, else `no session`.
- Checks: a scripted run in a temp git repo through every story step with `light` attention, one loop round, close, and a second `mission new` on a claimed checkout with `--worktree`.
- Owns A-MIS-1 through A-MIS-9, A-REC-2.

### W3 Presets, spawn, hook-factory

Files: `presets/{orchestrator,quick,research}/`, `src/core/spawn.ts`, `src/commands/mission.ts` (`open`), `parts/hook-factory/`, `src/types.ts`.

- Preset folder: `preset.yaml` `{ model, effort, plugins, mcp, sendMessage }`, `prompt.md`, `settings.json` overlay, `mcp.json`. Orchestrator settings: `autoCompactWindow` near 300k, `SendMessage` allowed. Quick and research: `SendMessage` denied.
- `factory mission open <name>`: generates a session id, writes it to `state.json`, writes `~/.warp/tab_configs/factory-<name>.toml` per the format in the Warp docs (Investigator-level research inside the step, note the source URL in the handoff), and opens it by URI. The tab runs `claude` with `--session-id`, `--name`, `--model`, `--effort`, `--append-system-prompt-file`, `--settings`, `--mcp-config`, `--strict-mcp-config`, `--plugin-dir plugins/factory`, env `FACTORY_MISSION=<abs folder>`. `mission new` calls `open` at the end unless `--no-open`. If Warp is missing, print the command instead.
- `parts/hook-factory/`: fixture with one script `hook-factory.ts` run by command hooks on `SessionStart`, `UserPromptSubmit`, `Stop`, `SubagentStart`, `SubagentStop`, `Notification`, `PreCompact`. Appends one JSON line to `~/.factory/events/<session>.jsonl`: `{ at, event, session, cwd, mission, step, detail }`. Mission binding from `FACTORY_MISSION`, else `.factory/claim` whose `session` matches. `PreCompact` prints the mission title, current step and open gates to stdout as injected context. `UserPromptSubmit` starts `caffeinate -dims` keyed by session when mission-bound, `Stop` kills it. `SubagentStop` copies the sub-agent's final assistant text into `handoffs/<step>.md` when the transcript path is available in the hook input, else does nothing. Widen `HookConfig.event`.
- Global caffeinate hook in `~/.claude/settings.json` is left alone; note in the handoff that it becomes redundant.
- Checks: `factory mission open` on the test mission writes a TOML that opens a tab; events file grows on prompt and stop; `factory status` shows the session as live.
- Owns A-SPN-1 through A-SPN-4, A-EVT-1 through A-EVT-3.

### W4 Function-hooks plugin (spike plus build)

Files: `plugins/factory/`, `parts/mission/skill.md` section on tools.

- Enable with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Read the built-in `plugin-authoring` skill first; record the API surface actually present in 2.1.257 in the handoff.
- Tools: `ask({ question, options? })` draws `$.ui.ask` in the main session, writes `{ id, mission, step, question, options, at }` to `~/.factory/inbox/<id>.json`, resolves on the UI answer or on `answer` appearing in that file, whichever first, and deletes the file. `gate({ step, file })` reads the gate content, draws it the same way, on resolve calls `factory gate answer`. Status line row: `<workflow> · <step> r<round> · <state>` from `state.json`. `PreCompact` hook injects the same focus text as the command hook, so one of the two is removed in the handoff recommendation.
- Test script `plugins/factory/test.md`: the exact steps the human runs in one session and in one sub-agent to confirm the tool is visible in sub-agents, the prompt draws, the file answer dismisses the prompt. Prints pass or fail lines the human pastes back.
- Gate `hook-spike`: the orchestrator asks the human to run the test and paste the result. On fail, the plugin ships disabled and `parts/mission/skill.md` documents the fallback only.
- Owns A-HOOK-1 through A-HOOK-3.

### W5 Roles, skills, fixtures

Files: `parts/mission/`, `parts/verify/`, `parts/validate/`, `parts/critic/` (rewrite), `parts/docs-format/`, `parts/terminology/`, `parts/permissions/`, `parts/browse/` (copied from `/opt/ed/igs/.claude/skills/browse`, read only), `parts/research/` (touch-up), `presets/*/prompt.md` (final text).

- `parts/mission/skill.md`: the orchestrator's manual. Priority order quality, attention, wall clock, tokens. The CLI and plugin tools. When to amend the workflow. Attention mode behavior. Triage rules: fix or skip per finding, skip is the default outside the contract, one gate per round. Handoff template. Under 120 lines.
- Agents bundled into skills: `parts/mission/agents/{Worker,Investigator,Summarizer}.md`, `parts/verify/agents/Verifier.md`, `parts/validate/agents/Validator.md`. Verifier is the old Critic plus contract assertions and the `verify` recipe. Validator never edits, runs `e2e.ready`, drives through `browse`, writes evidence per assertion, recommends missing tooling. `parts/critic/` becomes a thin skill that runs Verifier on the diff without a contract.
- `parts/docs-format/docs-format.md` as a fixture at `.claude/docs-format.md`, referenced by every agent prompt with one line. `parts/terminology/` installs a template `docs/terminology.md` only when absent. `parts/permissions/` writes the igs allow list into `settings.json` through a new `settings` key in `part.yaml`, merged like hooks.
- Every prompt under 80 lines except `mission`. Each states its model in frontmatter.
- Checks: `bun src/cli.ts status /opt/ed/ivy` lists all parts; each skill loads in a session without error.
- Owns A-PRT-1 through A-PRT-4.

### W6 Dogfood and close

Files: `/opt/ed/igs/.claude/`, `/opt/ed/ivy/.claude/`, `README.md`.

- `factory update /opt/ed/ivy` and `factory update /opt/ed/igs`. In igs remove the local copies of commit, critic, explain, research if they are not symlinks, keep nudge, support, analytics, doc-id-drift, release-audit, browse, the touch-file hook and dev-bridge. Replace the sounds hook with `hook-factory`. Manifest clean: `factory status /opt/ed/igs` shows no `modified` or `conflict`.
- Run a `chore` mission end to end in this repo with `factory mission new smoke --workflow chore --attention unattended --no-open`, walk the steps by CLI, close it, confirm the merge commit and the mission folder on `main`.
- README documents the commands in one table.
- Owns A-DOG-1 through A-DOG-3.

### Accept round

Verifier and Validator run in parallel against `acceptance.md`. Findings to `findings.md`. Orchestrator triages, human answers from round two (light). Loop back to the owning step, `max: 3`.

## Decisions made in the spec

- Tokens per step deferred; command hooks do not see usage. Wall time ships now.
- `parts/<name>/part.yaml` with agents beside the skill, not a central agents folder. One folder per part keeps install and delete local.
- Fallback gate path exists in W2 before the plugin in W4, so the CLI works without function hooks.
- Warp tab config format is researched inside W3, not pre-decided here.
- Global settings are not edited by this mission. Preset overlays carry `SendMessage` and Remote Control changes.

## Risks

- Function hooks API differs from the transcript. W4 records the real surface, the gate decides.
- Warp tab config URI may not accept env or a command. Fallback prints the command.
- `SubagentStop` hook input may lack the transcript path. Fallback is `factory handoff save` by the orchestrator.
- igs local skills carry edits not in the parts. W6 diffs before deleting and lists any drift in the handoff.

## Handoff template

Final message of every worker, plain text:

```
Step: <id>
Done: <one line per item>
Undone: <one line per item or none>
Commands: <cmd> -> <exit code>, one per line, only the ones that matter
Issues: <one line each or none>
Deviations: <from spec, with reason, or none>
Faster: <one line or none>
Acceptance: <id pass|fail|unchecked> one per owned id
```
