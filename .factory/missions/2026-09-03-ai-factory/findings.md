# Findings

## Round 1 triage (orchestrator, light attention)

| # | source | finding | decision | reason |
|---|--------|---------|----------|--------|
| 1 | Validator | step start and step done accept any step regardless of status or order, no refusal, no deviation | fix | enforcement hole under A-MIS-7, high blast |
| 2 | Verifier 1 | legacy .ivy-manifest.json with zero parts never renamed | fix | one-line, correctness of migration |
| 3 | Verifier 2 | zod unused dependency | fix | slop |
| 4 | Verifier 3 | browse default: true but needs external agent-browser | fix | default false |
| 5 | Validator, Verifier 4 | acceptance.md still says five parts | fix | contract text, now thirteen |
| 6 | Validator | mission open --dry-run prints a config path it never writes | fix | say would write |
| 7 | W6 handoff | removeHooks prints hook removed even when nothing matched | fix | output must not lie, small |
| 8 | Verifier 5 | --agents flag missing from assembleCommand | skip | agents ship as parts, not via the flag |
| 9 | W6 handoff | close leaves mission/<name> branch behind | skip | keep branches for now, retro item |

Round 2: Verifier only. Validate skipped, the one CLI behaviour change is checked by the Verifier with a live run.

## Round 1 Verifier

# Verify: AI Factory v1, round 1

tsc: `bun x tsc --noEmit` -> exit 0, no errors.

## Findings

| # | id or baseline | file:line | finding | blast | effort | conf | suggested fix |
|---|-----------------|-----------|---------|-------|--------|------|----------------|
| 1 | - | src/commands/update.ts:24, uninstall.ts:15 | legacy `.ivy-manifest.json` with zero `parts` entries is never renamed: both commands early-return "No parts installed" before `readManifest`'s caller writes anything, so `writeManifest`/`deleteManifest` (which drop the legacy file) are never reached. Repro: legacy manifest `{"parts":{}}` left as `.ivy-manifest.json` after `update` | narrow | S | med | rename/delete the legacy file in the early-return branch too, or normalize on read into a fresh write |
| 2 | - | package.json:15 | `zod` dependency unused (`grep -rl zod src parts plugins` empty), acknowledged in W1's own handoff as "left in package.json, unused" and never removed in W5/W6 | narrow | S | high | drop `zod` from `dependencies` unless `ai`/`@ai-sdk/xai` need it as a peer, in which case move it to that note |
| 3 | - | parts/browse/part.yaml:3 | `default: true` ships a tool that depends on the external `agent-browser` binary with no `envVars`/availability check, so a fresh install silently gets a tool part that fails at first use on a machine without it. W5 handoff flags the same gap under Issues | narrow | S | med | `default: false`, or add a check (envVar-style) that surfaces the missing binary in `status` |
| 4 | A-CLI-1 | acceptance.md:7 | contract text says `ls parts/*/part.yaml lists five`; the mission's final state (post W5/W6) ships 13 parts (`browse commit critic docs-format explain hook-factory hook-safe-bash mission permissions research terminology validate verify`). The underlying claim (every part is YAML, no `PARTS` in `src`) holds, the literal count is stale from the W1 checkpoint | narrow | S | low | update acceptance.md wording to drop the stale count, or note it was a W1-only snapshot |
| 5 | style | various | minor: `spawn.ts` omits `--agents` from `assembleCommand` (present in intent.md's general flag list but not in W3's own flag list, which spec.md and the code both match) — not a gap against the owning step's text, noted only for completeness | narrow | S | low | none needed |

## Assertions

| id | verdict | evidence |
|----|---------|----------|
| A-CLI-1 | pass | `grep -r "PARTS" src` empty; `ls parts/*/part.yaml` lists 13 YAML parts, no TS registry remains (see finding 4 on stale count wording) |
| A-CLI-2 | validator | kind validate |
| A-CLI-3 | validator | kind validate |
| A-CLI-4 | pass | `manifest.ts` reads `.factory-manifest.json` then `.ivy-manifest.json`, migrates `ivy`->`factory` key; live run: legacy manifest with a real part (`commit`) renamed to `.factory-manifest.json` on `update`, exit 0 (edge case with an empty legacy manifest not renamed, filed as finding 1) |
| A-CLI-5 | pass | `cycle/`, `mcps/` absent; `parts/skills`, `parts/sounds` absent; `package.json` has no `@modelcontextprotocol/sdk`; `bun x tsc --noEmit` exit 0 |
| A-MIS-1 | validator | kind validate |
| A-MIS-2 | validator | kind validate |
| A-MIS-3 | validator | kind validate |
| A-MIS-4 | validator | kind validate |
| A-MIS-5 | validator | kind validate |
| A-MIS-6 | pass | unit run: bad `loop.back` on step "b" naming step "z" -> `workflow "bad": step "b": loop.back "z" is not an earlier step` |
| A-MIS-7 | pass | live run: `step skip implement --reason "test skip"` appended `{what:"skipped step implement", reason:"test skip"}` to `state.json.deviations` |
| A-MIS-8 | validator | kind validate |
| A-MIS-9 | pass | live run: `step start merge` then `step done merge` produced `{status:"done", startedAt, endedAt}` in `state.json.steps.merge` |
| A-REC-1 | pass | `recovery.md` (99 lines) covers every story step, every W2 CLI transition, and the mandated failure list (worker crash, session killed, gate answered twice, dead-session claim, worktree left after close, unmerged branch, main advanced under mission branch) |
| A-REC-2 | validator | kind validate |
| A-SPN-1 | pass | `presets/{orchestrator,quick,research}` each have `preset.yaml`, `prompt.md`, `settings.json`, `mcp.json`; orchestrator `settings.json` `permissions.allow: [SendMessage]`, quick/research `deny: [SendMessage]`; live `mission open --dry-run` command includes `--plugin-dir .../plugins/factory` |
| A-SPN-2 | validator | kind validate |
| A-SPN-3 | pass | live run: `WARP_MISSING=1 mission open` prints `no warp — run it yourself` plus the full `claude` command to stdout, exit 0, no spawn attempted |
| A-SPN-4 | pass | `spawn.ts` `openSession`: `mission.state.session = session; await writeState(...)` precedes `Bun.write(configPath, ...)` and the `open uri` spawn, by inspection and live run order |
| A-EVT-1 | validator | kind validate |
| A-EVT-2 | pass | live run: `PreCompact` hook payload for a bound session printed `Mission: Test Mission / Step: implement / Open gates: merge / Folder: ...` to stdout |
| A-EVT-3 | pass | live run: `UserPromptSubmit` on a bound session started `caffeinate -dims` (pid tracked), `Stop` killed it; `UserPromptSubmit` on an unbound session started no caffeinate, event line recorded `mission:null` |
| A-HOOK-1 | pass | `claude plugin validate --strict plugins/factory` -> "Validation passed", hooks `engine.create, prompt.submit, turn.complete, tool.call{ask}, tool.call{gate}` registered, `$.ui.status` present for the status row |
| A-HOOK-2 | unchecked | blocked by server rollout flag `tengu_plugin_hooks_modules`, off for this account on 2026-09-05, no local override (state.json gate note) |
| A-HOOK-3 | unchecked | blocked by the same rollout flag |
| A-PRT-1 | pass | `wc -l`: mission/skill.md 119 (<120), all other skills/agents/preset prompts <80; every skill and agent file states `model:` in frontmatter |
| A-PRT-2 | pass | `parts/verify/agents/Verifier.md` runs the `verify` recipe (section 2), baseline (section 3), contract (section 4); `parts/validate/agents/Validator.md` states "never fix code", never edits (no Write/Edit tools, `disallowedTools`), writes evidence per assertion (section 3) |
| A-PRT-3 | pass | every agent prompt (`Worker`, `Investigator`, `Summarizer`, `Verifier`, `Validator`, `Commit`) has the line `Docs you write follow .claude/docs-format.md. Names come from docs/terminology.md.`; no stray `ivy`/`droid`/legacy terms found |
| A-PRT-4 | validator | kind validate |
| A-DOG-1 | validator | kind validate |
| A-DOG-2 | validator | kind validate |
| A-DOG-3 | pass | README.md has one Commands table covering install/uninstall/status/update/mission/step/gate/handoff; CLAUDE.md's Architecture block matches the actual `src/`, `parts/`, `workflows/`, `presets/`, `plugins/factory/` tree |
| A-DLS-1 | pass | `docs/design.md` (134 lines) has palette (truecolor + ANSI 256), type scale, layout grid, glyph map with conflict resolution, row states, timestamp/duration formats, key bar, CLI rules, and a Droid-to-Factory name mapping table; no em-dashes, no box-drawing chars |

## Round 1 Validator

# Findings: Validator, round 1

Driven as a user: `factory` CLI at `src/cli.ts` on `mission/ai-factory`, every run with
`HOME=/tmp/factory-val-home`, temp repos under `/tmp`. No `.factory/factory.yaml` exists in this
repo, so there was no `e2e.ready` recipe to run. The system under test is a CLI with no server, so
the driver is the CLI itself, and the missing recipe is recorded under Tooling.

Command prefix below, omitted per row: `HOME=/tmp/factory-val-home bun /opt/ed/ivy/src/cli.ts`.

## Assertions

| id | verdict | evidence (command -> exit, fact) |
|----|---------|----------------------------------|
| A-CLI-2 | pass | `status /opt/ed/ivy` -> 0. 13 rows from `parts/*/part.yaml`, every one `● installed`, `13 installed, 0 modified, 0 available`, plus a Missions block showing `ai-factory story · accept · r0 no session`. The check text says five rows, W5 shipped 13, see finding 3. |
| A-CLI-3 | pass | `/tmp/fv-cli3`, hand-made `.factory-manifest.json` naming retired part `brainstorm` with a live symlink to `/opt/ed/ivy/parts/brainstorm/skill.md`, plus `critic`. `update /tmp/fv-cli3` -> 0, non-interactive, printed `- brainstorm .claude/skills/brainstorm/skill.md` and `● /critic relinked`, `1 relinked, 1 removed`. After: `.claude/skills/brainstorm/` gone, `brainstorm` gone from the manifest, `critic/skill.md` a live link into `parts/critic/skill.md`. `update /opt/ed/ivy` -> 0, `Up to date.`, `git status` clean. |
| A-MIS-1 | pass | `mission new story1 --workflow story --attention light --title "Story one" --no-open` -> 0 in `/tmp/fv-mis`. Created `.factory/missions/2026-09-05-story1/{workflow.yaml,state.json,handoffs/}`, `git branch --show-current` -> `mission/story1`, `.factory/claim` = `{"mission":"story1","session":null,"at":...}`, `state.json` carries `status: open`, `step: grill`, `round: 0`. |
| A-MIS-2 | pass | With the claim held by `alpha`, `mission new beta --workflow chore --worktree --no-open` -> 0, printed `worktree /private/tmp/fv-mis-beta`. `git worktree list` -> two entries, `[mission/alpha]` and `[mission/beta]`. Both `state.json` files `status: open`, claim still names `alpha`. |
| A-MIS-3 | pass | `step done intent` -> 1, one line: `✗ step intent is a human gate and it is not opened — answer it with: factory gate answer intent accept`. Then `gate answer intent accept --note "validator walk"` -> 0, `step done intent` -> 0, step advanced to `spec`. Same refusal reproduced at `merge`. |
| A-MIS-4 | pass | At `accept` r0, `step loop accept` -> 0, printed `○ accept pending` and `step implement r1`. `state.json` -> `"step": "implement"`, `"round": 1`. |
| A-MIS-5 | pass | `gate open merge --file /tmp/fv-mis/gate.md` -> 0, then `mission close` -> 1: `✗ gate open on merge — answer it with: factory gate answer <step> accept`. After `gate answer merge accept` and `step done merge`, `mission close` -> 0 printing merged, committed, claim cleared. `git log main --merges -1` -> `bbbb4f3 🔀 merge: mission/story1`, `git ls-tree -r main` lists `.factory/missions/2026-09-05-story1/{state.json,workflow.yaml}`, `.factory/claim` gone, `state.json` on main `status: closed`. Worktree half via `beta`: `mission close beta` -> 0 printed `worktree removed /private/tmp/fv-mis-beta`, `git worktree list` down to one, directory gone. |
| A-MIS-8 | pass | From `/tmp/fv-mis-beta` (worktree, its own `.factory/missions` holds only the older story1 folder), `mission resume beta` -> 0, printed `folder /private/tmp/fv-mis/.factory/missions/2026-09-05-beta`, `branch mission/beta`, `step grill pending`. Resolution came from the main checkout, not the worktree. |
| A-REC-2 | pass | `mission adopt beta --session 1111...5555` -> 0. Empty events file `~/.factory/events/1111...5555.jsonl` back-dated to 07:00 (4h stale): `status /tmp/fv-mis` -> 0, Missions row `beta chore · grill · r0 no session`. One fresh JSON line appended: same command -> 0, row flips to `session`. `mission resume beta` -> 0, re-attaches, prints `session 1111...5555` and `step grill pending`, and warns `mission/beta is checked out at /private/tmp/fv-mis-beta`. |
| A-SPN-2 | pass | `mission open alpha --dry-run` -> 0. Every flag from spec W3 present in one line: `FACTORY_MISSION=/private/tmp/fv-mis/.factory/missions/2026-09-05-alpha claude --session-id <uuid> --name alpha --model fable --effort high --append-system-prompt-file .../presets/orchestrator/prompt.md --settings .../settings.json --mcp-config .../mcp.json --strict-mcp-config --plugin-dir /opt/ed/ivy/plugins/factory`. `WARP_MISSING=1 mission open alpha` -> 0, header `no warp — run it yourself`, printed the same command and wrote `/tmp/factory-val-home/.warp/tab_configs/factory-alpha.toml` with `[[panes]]`, `directory`, and the command in `commands`. No Warp tab opened, no run without `WARP_MISSING`. Session id landed in `state.json` before the print. |
| A-EVT-1 | pass | Seven runs of `parts/hook-factory/hook-factory.ts` with `FACTORY_MISSION=<alpha folder>`, stdin per event using the 2.1.257 field names. All -> 0. `~/.factory/events/ev-session-0001.jsonl` holds exactly 7 lines, one per event in order SessionStart, UserPromptSubmit, SubagentStart, SubagentStop, Notification, PreCompact, Stop, each with `at`, `event`, `session`, `cwd`, `mission: "alpha"`, `step: "grill"`, `detail` (`startup`, `do the thing`, `Worker`, `Worker`, `Claude needs your permission`, `auto`, null). PreCompact also printed the focus block to stdout. SubagentStop wrote `handoffs/grill.md`. Caffeinate: `pgrep -l caffeinate` before -> 5552 only, after UserPromptSubmit -> 5552 plus new 14751, after Stop -> 5552 only. No leak, nothing of mine left running. |
| A-HOOK-2 | unchecked | Blocked by the server rollout flag `tengu_plugin_hooks_modules`, off with no local override, so `plugins/factory` module hooks never load and `ask` is not registered. Recorded in the `hook-spike` gate answer (`fallback`) and in `handoffs/W4.md`. Needs a human session on a build with the flag on. |
| A-HOOK-3 | unchecked | Same block. The inbox answer path cannot be exercised while the tool never draws. |
| A-PRT-4 | pass (half) | `status /opt/ed/ivy` -> 0 lists every W5 part: `/mission` (with Worker, Investigator, Summarizer), `/verify` (Verifier), `/validate` (Validator), `/critic`, `/browse`, `docs-format`, `terminology`, `permissions`, `hook-factory`, `hook-safe-bash`, `/commit`, `/explain`, `/research`. The second half, a session loading `/mission` without error, is unchecked: driving an interactive `claude` session was out of scope for this run. |
| A-DOG-1 | pass | `status /opt/ed/igs` -> 0, `11 installed, 0 modified, 0 available, 2 skipped`. No `modified`, no `conflict`. Generic skills are symlinks into `parts/`: commit, critic, explain, research, mission, validate, verify, and six agents under `.claude/agents/`. igs-only skills kept as local files: analytics, doc-id-drift, nudge, release-audit, support, plus browse which is `⊘ skipped`. |
| A-DOG-2 | pass | `git -C /opt/ed/ivy log main --merges -1` -> `55c5a7f 🔀 merge: mission/smoke`, two parents `196190e 4424ca3`. `git show main --stat` -> `6604b70 🏗️ chore: close mission smoke` adding `.factory/missions/2026-09-05-smoke/{state.json,workflow.yaml}`. That `state.json` reads `status: closed`, `workflow: chore`, `attention: unattended`. Folder present on `main`. |

## Findings

| # | id | what happened | blast | effort | confidence | suggested fix |
|---|----|---------------|-------|--------|------------|---------------|
| 1 | A-MIS-7 | `step done <step>` on a step that is not running is accepted silently. In the story mission at `implement` r1, `step done condense` -> 0 marked `condense` done, auto-stamping `startedAt` and `endedAt` at the same instant, while `implement` and `accept` were still pending. `state.json` `deviations` stayed `[]`, so the out-of-order transition left no trace and `mission status` then rendered `✓ condense` above `○ implement`. Reproduced on a second mission: at `grill` pending, `step done merge --mission alpha` -> 0, `deviations: []`. `step start` is equally lax: `step start merge` -> 0 while `accept` was unfinished. Unknown steps are refused correctly (`step done nonesuch` -> 1), and a repeat `done` is a clean no-op, so only the order and status preconditions are missing. This is also the DX promise the mission owes: a step that is not running should give a one-line refusal and exit 1. It exits 0 instead. No stack trace. | wide | S | high | In the `done` transition require `status === "running"`, else refuse in one line with exit 1 the way the gate and parallel refusals already do. When the orchestrator means it, route it through the existing deviation path so `deviations` records what disagreed with `workflow.yaml` and why. |
| 2 | A-CLI-2 | The contract's check text reads `five rows`, the CLI lists 13. Not a code defect: W1 shipped five parts and W5 added eight more, so the assertion text went stale mid-mission. Judged against the claim (`lists parts from YAML with install state`), it passes. Left as is, a reader comparing the two will call it a fail. | narrow | S | high | Amend the A-CLI-2 check text to `all parts from YAML, no error` so it does not pin a count that later steps move. |
| 3 | A-SPN-2 | `mission open --dry-run` prints `config /tmp/factory-val-home/.warp/tab_configs/factory-alpha.toml` but writes nothing: the directory did not exist after the run. Not writing is right for a dry run, the label reads as if the file is there. | narrow | S | med | Label it `config (would write)` on the dry-run path. |
| 4 | - | `status` shows the `permissions` fixture with an empty Files column, since it merges into `settings.json` and ships no files. Consistent, and a reader cannot tell installed-with-no-files from a rendering bug. | narrow | S | med | Print the settings target, for example `.claude/settings.json (settings)`, in the Files column for settings-only parts. |

## Tooling

There is no `.factory/factory.yaml` in this repo, so no `e2e.ready` and no `verify` recipe: every
gatekeeper re-derives how to drive the CLI from prose. Add one with an `e2e.ready` that runs
`bun src/cli.ts status .` and asserts exit 0, so the Validator's first move is a recipe and not a
guess.

The expensive part of this round was building a mission by hand, roughly 40 cold `bun` starts at
about a second each. Ship `scripts/fixture-repo.sh <dir>` that makes a temp git repo with an initial
commit, a stale `.factory-manifest.json` naming a retired part, and a fake `HOME`, then walks the
story workflow to any named step. It would have caught finding 1 on the first run, because a scripted
walk asserts the step status before every `done` and the current code never does.

## Round 2 Verifier

tsc: `bun x tsc --noEmit` -> exit 0. Live runs in /tmp temp repos, HOME=/tmp/verify2-home, both cleaned up.

### Findings

| # | item | file:line | finding | blast | effort | confidence | fix |
|---|------|-----------|---------|-------|--------|------------|-----|
| 1 | 1 | src/commands/step.ts:74-76 | done on a never-started gated step now says "pending, not running" instead of the gate message; acceptable, start is a hard precondition for every step and the gate message still fires once running, confirmed live | narrow | - | high | none |
| 2 | - | src/commands/step.ts | clean: start/done refusals are one line, exit 1, cover running/done/skipped source states plus wrong-current-step; no dead code, no unused params left from the old deviate-based paths | - | - | high | none |

### Items (triage 1 to 7)

| triage | pass/fail | evidence |
|--------|-----------|----------|
| 1 | pass | live story walk: done-on-pending exits 1 one line, start-on-non-current exits 1 one line, restart-on-done refused, restart-on-running idempotent exit 0, skip-then-start refused, add-then-start-out-of-order refused, loop back then start implement then step start implement r1 all correct |
| 2 | pass | legacy `.ivy-manifest.json` with `{"parts":{}}` renamed to `.factory-manifest.json` on both `update` and `status` (read path), old file gone |
| 3 | pass | package.json has no `zod`; `ai`/`@ai-sdk/xai` still resolve it as a peer in bun.lock; tsc and bun install clean |
| 4 | pass | parts/browse/part.yaml `default: false` |
| 5 | pass | registry reads every `parts/*/part.yaml` dynamically, no hardcoded count in src; acceptance.md wording no longer pins a number |
| 6 | pass | `mission open --dry-run` prints `would write <path>`, no file appears under `.warp/tab_configs` after the run |
| 7 | pass | hook removal line printed only when a matching hook was actually deleted from settings.local.json (case A: no match, no line, exit 0; case B: match, line printed, entry gone, other hooks untouched) |
