# Validator scripts

Short drivers that reach the thing under test in one Bash call. Reuse them next round; delete a
script that breaks and drop its line with it.

Every run needs a scratch HOME **under `/private/tmp`**, never `/tmp`: `scratch.ts` refuses a
`/tmp` HOME on purpose. The one exception is the symlinked-path check (A-R1-4), which wants a
`/tmp/<dir>` project precisely because macOS makes it a symlink to `/private/tmp`.

`factory gate|step|mission` act on **the checkout you are standing in**, not on `$HOME`. A scratch
HOME does not sandbox them: `cd` into the scratch repo (and `</dev/null`) before every such call,
or the write lands in the Factory's own mission.

| Script      | Reaches                                                                                          | Written     |
|-------------|--------------------------------------------------------------------------------------------------|-------------|
| `scratch.ts`| A whole Mission Control world in one run: repos `alpha`, `beta` and `gamma` registered through `factory status`, an open story mission stopped on a running `implement` with an open `merge` gate and four decisions (auto, accepted, waiting, overruled), a stub in `beta`, a closed mission in `gamma` for the archive keys, a dead path in `~/.factory/projects`, a live unbound session and a stale one, each with a Claude Code transcript holding every activity block kind plus a sidechain line. `bulk <session> <n>` appends n rows for scroll tests. Exports `run`, `events`, `transcript`, `bulk`. | 2026-09-06 |
| `scripts/tui-keys.ts` | Promoted out of here into `scripts/` and into `e2e.run`. The screen under keys, headless: builds the live snapshot (or `--fixture`), puts the selection on a row (`--row <itemKey substring>`, `--focus right`, `--archived`), sends each key through `onKey` and checks every frame it draws — an error toast or an empty last row exits 1. `sleep:ms` waits for an action's write, `reload` rebuilds the snapshot the way the watcher would (an action's write is invisible without it), `--spans <text\|*>` prints colour and column per span, `--quiet` prints only the last frame. | 2026-09-07 |
| `handoff.ts`| `hook-factory`'s SubagentStop path: fires n sub-agent final messages of the given line counts at the hook (bound through `FACTORY_MISSION`, no claim or session needed) and lists what landed in `handoffs/` with line counts. Checks the never-overwrite invariant end to end. | 2026-09-06 |
| `repo.ts`   | One scratch git repo under `$HOME`, registered with `factory status` (or fully installed with `--install`), ready for `mission`, `step`, `gate` and `decision`. Every CLI assertion starts here. Exports `makeRepo`, `run`, which `scripts/spawn.ts` imports from here. | 2026-09-07 |
| `scripts/hook-inject.ts` | Promoted out of here into `scripts/` and into `e2e.run`. `hook-factory`'s decision paths, fired as a child the way Claude Code fires them: `<missionDir> subagent "<final text>"` files a `Decisions:` block, `post` and `prompt` print the injection for whatever waits. With no arguments it builds its own scratch mission, walks the handoff through to the injection and exits 1 on a broken round trip. | 2026-09-07 |
| `scripts/spawn.ts` | Promoted out of here into `scripts/` and into the `e2e.spawn` recipe, its own recipe because it spends a real model run. The one real spawn: a scratch project with the Factory installed, a mission, and a headless session told to run one `@Worker` whose handoff carries a LOW decision. Prints the `additionalContext` the parent received and the mission's `decisions.md`. | 2026-09-07 |

```
HOME=$(mktemp -d /private/tmp/vhome.XXXXXX) bun .factory/validator/scratch.ts
HOME=<that> bun src/cli.ts --frames $HOME/frames        # still frames, no tty, exits 0
HOME=<that> bun scripts/tui-keys.ts --row inbox --focus right --wait 700 down return
HOME=<that> bun .factory/validator/handoff.ts <missionDir> 12 6 20   # → .md, -2, -3
HOME=$(mktemp -d /private/tmp/vhome.XXXXXX) bun .factory/validator/repo.ts g1 --install
HOME=<that> bun scripts/hook-inject.ts <missionDir> post
REAL_HOME=$HOME HOME=$(mktemp -d /private/tmp/vspawn.XXXXXX) bun scripts/spawn.ts
```

`e2e.run` now carries `scripts/tui-keys.ts` and `scripts/hook-inject.ts` behind `scripts/e2e.sh`:
the screen and the hook are checked by the recipe, and these lines are for poking a live world.

`failed` has left `StepStatus`; there is no unreachable status left to patch by hand.

Claude Code authenticates only from the real config dir: a scratch `HOME`, a copied `.claude.json`
and `CLAUDE_CONFIG_DIR` all read `Not logged in`. `scripts/spawn.ts` therefore runs the session with
the real `HOME` and prefixes the project's own hook commands with `HOME=<scratch>`, so every Factory
write still lands in the scratch home and only the transcript touches the real one.
