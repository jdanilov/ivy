# Acceptance: AI Factory v1, build order 1 and 2

One assertion per line. `id | kind | claim | check | owner`. Kind `verify` is checked by the Verifier from code and CLI runs. Kind `validate` is checked by the Validator by driving the CLI in a temp repo. Every id ends pass, fail or unchecked in `findings.md`.

## CLI and parts

- A-CLI-1 | verify | Every part is a `parts/<name>/part.yaml` loaded at startup, no TypeScript registry remains | `grep -r "PARTS" src` empty, every part is a `parts/*/part.yaml` | W1
- A-CLI-2 | validate | `factory status <project>` lists parts from YAML with install state | run against `/opt/ed/ivy`, one row per `parts/*/part.yaml`, no error | W1
- A-CLI-3 | validate | `factory update <project>` relinks installed parts and removes parts gone from the registry, non-interactive | run against `/opt/ed/ivy`, `brainstorm` and `cycle` symlinks gone, `critic-self` untouched, exit 0 | W1
- A-CLI-4 | verify | Manifest is `.claude/.factory-manifest.json`, an old `.ivy-manifest.json` is read and renamed on next write | inspect `manifest.ts`, run update on a project with the old file | W1
- A-CLI-5 | verify | `cycle/`, `mcps/`, dropped parts, `@modelcontextprotocol/sdk` are gone and `bun x tsc --noEmit` passes | `ls`, `package.json`, tsc exit 0 | W1

## Missions

- A-MIS-1 | validate | `factory mission new` creates the folder, workflow copy, state.json, branch `mission/<name>`, claim | temp repo, inspect files and `git branch` | W2
- A-MIS-2 | validate | Second `mission new` on a claimed checkout with `--worktree` creates a worktree and both missions stay open | temp repo, `git worktree list` shows two | W2
- A-MIS-3 | validate | `factory step done` on a gated step refuses until `factory gate answer` | temp repo, exit non-zero then zero | W2
- A-MIS-4 | validate | `factory step loop accept` records a round and moves the current step back to `implement` | temp repo, `state.json` `round: 1`, `step: implement` | W2
- A-MIS-5 | validate | `factory mission close` refuses with an open gate, then merges with `--no-ff`, commits the mission folder on `main`, clears claim, removes worktree, sets closed | temp repo, `git log --merges -1`, folder on main | W2
- A-MIS-6 | verify | Workflow loader replaces by name from `.factory/factory.yaml` and rejects a `loop.back` that is not earlier | unit run with a bad yaml, error message names the step | W2
- A-MIS-7 | verify | Every transition that disagrees with `workflow.yaml` appends a deviation with a reason | inspect `state.json` after `step skip` | W2
- A-MIS-8 | validate | `factory mission resume` from a worktree resolves the mission folder in the main checkout | run from the worktree, prints current step | W2
- A-MIS-9 | verify | `state.json` step entries carry `startedAt` and `endedAt` so wall time derives | inspect after a run | W2

## Recovery

- A-REC-1 | verify | `recovery.md` covers every failure listed in the spec I1 with a recovery per line | read the file | I1
- A-REC-2 | validate | A mission whose session has no events in ten minutes shows `no session` in `factory status` and `resume` re-attaches | temp repo, empty events dir | W2

## Spawn and events

- A-SPN-1 | verify | Three presets exist with `preset.yaml`, `prompt.md`, `settings.json`, `mcp.json` and the orchestrator allows `SendMessage` | `ls presets/*`, read settings | W3
- A-SPN-2 | validate | `factory mission open` writes a Warp tab config and the assembled `claude` command carries every flag in the spec | inspect the TOML, `--dry-run` prints the command | W3
- A-SPN-3 | verify | Without Warp the command is printed, not executed | run with `WARP_MISSING=1` or on a path without `warp` | W3
- A-SPN-4 | verify | Session id written to `state.json` before the tab opens | inspect order in `spawn.ts` | W3
- A-EVT-1 | validate | `hook-factory` appends a JSON line per hook event to `~/.factory/events/<session>.jsonl` with mission binding | run the script with a sample hook payload for each event | W3
- A-EVT-2 | verify | `PreCompact` prints mission title, step and open gates | run with a sample payload | W3
- A-EVT-3 | verify | Caffeinate starts on prompt and stops on stop only when mission-bound | run twice, `pgrep caffeinate` | W3

## Function hooks

- A-HOOK-1 | verify | `plugins/factory` registers `ask` and `gate` and a status line row, loads under the enable flag | human runs `plugins/factory/test.md` | W4
- A-HOOK-2 | validate | `ask` is visible from a sub-agent and draws in the main session | human test, pasted result | W4
- A-HOOK-3 | validate | An answer written to the inbox file dismisses the drawn prompt and resolves the tool | human test, pasted result | W4

## Parts and prompts

- A-PRT-1 | verify | `mission` skill under 120 lines, every other prompt under 80, all name their model | `wc -l`, frontmatter | W5
- A-PRT-2 | verify | Verifier prompt carries the baseline checks plus contract assertions and the `verify` recipe, Validator never edits and writes evidence per assertion | read prompts | W5
- A-PRT-3 | verify | Every agent prompt references `docs-format` in one line and uses terminology names only | grep | W5
- A-PRT-4 | validate | `factory status /opt/ed/ivy` lists all new parts and a session loads `/mission` without error | run, open a session | W5

## Dogfood

- A-DOG-1 | validate | `factory status /opt/ed/igs` shows no `modified` or `conflict`, local generic skills gone, igs-only skills kept | run, `ls` | W6
- A-DOG-2 | validate | A `chore` mission runs new, steps, close in this repo and leaves a merge commit plus the folder on `main` | run, `git log` | W6
- A-DOG-3 | verify | README lists every command in one table, CLAUDE.md reflects the layout | read | W6

## Design

- A-DLS-1 | verify | `docs/design.md` has palette, layout, glyph map to the terse-visual symbols, formats, key bar, CLI rules, name mapping | read | I2
