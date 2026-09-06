# Validator scripts

Short drivers that reach the thing under test in one Bash call. Reuse them next round; delete a
script that breaks and drop its line with it.

Every run needs a scratch HOME **under `/private/tmp`**, never `/tmp`: the linker writes part
symlinks with lexical `..` hops, so a HOME behind the macOS `/tmp → /private/tmp` symlink makes
every installed part dangle and read `modified`.

| Script      | Reaches                                                                                          | Written     |
|-------------|--------------------------------------------------------------------------------------------------|-------------|
| `scratch.ts`| A whole Mission Control world in one run: repos `alpha` and `beta` registered through `factory status`, an open story mission stopped on a running `implement` with an open `merge` gate, a stub in `beta`, a dead path in `~/.factory/projects`, a live unbound session and a stale one, each with a Claude Code transcript holding every activity block kind plus a sidechain line. `bulk <session> <n>` appends n rows for scroll tests. Exports `run`, `events`, `transcript`, `bulk` for one-off variations. | 2026-09-06 |
| `keys.ts`   | The screen under keys, headless: builds the live snapshot (or `--fixture`), puts the selection on a row (`--row <itemKey substring>`, `--focus right`), sends each key through `onKey` and prints the frame. `type:text` goes through the note `InputRenderable`, `sleep:ms` waits for an action's write, `--spans <text|*>` prints colour and column per span, `--quiet` prints only the last frame. | 2026-09-06 |

```
HOME=$(mktemp -d /private/tmp/vhome.XXXXXX) bun .factory/validator/scratch.ts
HOME=<that> bun src/cli.ts --frames $HOME/frames        # still frames, no tty, exits 0
HOME=<that> bun .factory/validator/keys.ts --row inbox --focus right --wait 500 down return
```
