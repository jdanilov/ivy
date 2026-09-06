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
| `scratch.ts`| A whole Mission Control world in one run: repos `alpha`, `beta` and `gamma` registered through `factory status`, an open story mission stopped on a running `implement` with an open `merge` gate, a stub in `beta`, `gamma` with no missions at all, a dead path in `~/.factory/projects`, a live unbound session and a stale one, each with a Claude Code transcript holding every activity block kind plus a sidechain line. `bulk <session> <n>` appends n rows for scroll tests. Exports `run`, `events`, `transcript`, `bulk` for one-off variations. | 2026-09-06 |
| `keys.ts`   | The screen under keys, headless: builds the live snapshot (or `--fixture`), puts the selection on a row (`--row <itemKey substring>`, `--focus right`), sends each key through `onKey` and prints the frame. `type:text` goes through the note `InputRenderable`, `sleep:ms` waits for an action's write, `--spans <text|*>` prints colour and column per span, `--quiet` prints only the last frame. | 2026-09-06 |
| `handoff.ts`| `hook-factory`'s SubagentStop path: fires n sub-agent final messages of the given line counts at the hook (bound through `FACTORY_MISSION`, no claim or session needed) and lists what landed in `handoffs/` with line counts. Checks the never-overwrite invariant end to end. | 2026-09-06 |

```
HOME=$(mktemp -d /private/tmp/vhome.XXXXXX) bun .factory/validator/scratch.ts
HOME=<that> bun src/cli.ts --frames $HOME/frames        # still frames, no tty, exits 0
HOME=<that> bun .factory/validator/keys.ts --row inbox --focus right --wait 700 down return
HOME=<that> bun .factory/validator/handoff.ts <missionDir> 12 6 20   # → .md, -2, -3
```

A step state of `failed` is not reachable through the CLI — patch `steps.<name>.status` in the
scratch `state.json` by hand when a row needs it.
