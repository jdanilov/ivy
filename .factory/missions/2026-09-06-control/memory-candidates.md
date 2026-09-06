# Memory candidates: Mission Control wiring

Proposed only, human confirms before saving.

- Harness (OpenTUI): a scratch script that imports `src/tui/*` (or any `@opentui/core` consumer)
  must run from inside the repo — from `/tmp` Bun resolves a second `@opentui/core` copy from its
  global cache, the two module instances fail `instanceof` against each other and
  `destroyRecursively()` throws, or frames come back silently empty. Applies to any script
  driving or testing this TUI.
- Harness (OpenTUI): renderables added to the tree per frame must be `.destroyRecursively()`d,
  never `.remove()`d — `remove()` only detaches. Copy `root.getChildren()` before iterating to
  destroy, since `destroy()` splices the live array mid-walk. Applies to any OpenTUI render loop.
- Harness (OpenTUI testing): `captureSpans()` merges adjacent same-colour spans into one, so
  `spans.find(s => s.text === name)` silently misses a name whose colour matches its neighbour's.
  Walk the spans accumulating column offsets and read the colour at the column the name starts.
  Applies to any span-colour assertion.
- Project (ivy): Claude Code writes the transcript under `~/.claude/projects/<slug>/<session>.jsonl`
  where `<slug>` is the cwd with every `/` turned into `-`; `message.usage` repeats on every
  content-block line of one assistant message, so summing usage per line multiplies a response by
  its block count — key on `message.id` and count once. Applies to any code reading
  `~/.claude/projects`.
- Harness (Bun): `os.homedir()`, and anything resolved from `HOME` at import time (like
  `FACTORY_HOME`), is fixed at process start — setting `process.env.HOME` mid-process does not
  redirect it. A scratch-HOME test must run as a child process with `HOME` in its spawn env.
  Applies to any in-process test needing a fake `~`.
- Harness (macOS): `/tmp` is a symlink to `/private/tmp`; a scratch dir made under a `/tmp/...`
  mktemp path breaks anything computing relative symlinks or comparing realpaths. Always
  `mktemp -d /private/tmp/XXXXXX` for a scratch HOME or project. Applies to any scratch-repo test
  on macOS.
- Harness: driving a live, already-running raw-terminal/OpenTUI screen for a key-burst or smoke
  test needs a real pty — Python's `pty.fork()` at a fixed size — a piped subprocess stdin does
  not give the renderer a controlling terminal. Applies to any interactive-CLI smoke test.
- Harness (macOS): Warp has no documented URI to focus an existing tab from outside it;
  `\x1b]777;notify;<app>;<label>\x07` (plus `\x07` for the bell) is its supported notification
  escape sequence. Applies to anything alerting the user in a background Warp tab.
- Harness (macOS): `afplay <file>` plays audio files including mp3 from the shell; the built-in
  system sounds live under `/System/Library/Sounds/*.aiff`. Applies to any hook or script wanting
  an audible alert.
- Project (ivy): OpenTUI's renderer takes roughly its first 150-200 render cycles to warm up its
  allocator/buffer pool (observed RSS 110→232MB) before flattening — a memory-flat assertion needs
  to run well past that warmup or it reads as a leak that isn't one. Applies to any RSS-based
  invariant on `src/tui/`.
