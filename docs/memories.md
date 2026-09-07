# Memories

Seed corpus for the `mem` MCP on the roadmap: what closed missions learned the hard way, swept out of
their `memory-candidates.md`. Proposed only — a human confirms each note before it lands in `mem`.

- **Harness (OpenTUI)** — a scratch script that imports `src/tui/*` (or any `@opentui/core` consumer)
  must run from inside the repo: from `/tmp` Bun resolves a second `@opentui/core` copy from its
  global cache, the two module instances fail `instanceof` against each other and
  `destroyRecursively()` throws, or frames come back silently empty.
  Applies to: any script driving or testing this TUI.
- **Harness (OpenTUI)** — renderables added to the tree per frame must be `.destroyRecursively()`d,
  never `.remove()`d; `remove()` only detaches. Copy `root.getChildren()` before iterating to
  destroy, since `destroy()` splices the live array mid-walk.
  Applies to: any OpenTUI render loop.
- **Harness (OpenTUI testing)** — `captureSpans()` merges adjacent same-colour spans into one, so
  `spans.find(s => s.text === name)` silently misses a name whose colour matches its neighbour's.
  Walk the spans accumulating column offsets and read the colour at the column the name starts.
  Applies to: any span-colour assertion.
- **Project (ivy)** — Claude Code writes the transcript under
  `~/.claude/projects/<slug>/<session>.jsonl` where `<slug>` is the cwd with every `/` turned into
  `-`; `message.usage` repeats on every content-block line of one assistant message, so summing
  usage per line multiplies a response by its block count — key on `message.id` and count once.
  Applies to: any code reading `~/.claude/projects`.
- **Harness (Bun)** — `os.homedir()`, and anything resolved from `HOME` at import time (like
  `FACTORY_HOME`), is fixed at process start; setting `process.env.HOME` mid-process does not
  redirect it. A scratch-HOME test must run as a child process with `HOME` in its spawn env.
  Applies to: any in-process test needing a fake `~`.
- **Harness (macOS)** — `/tmp` is a symlink to `/private/tmp`; a scratch dir made under a `/tmp/...`
  mktemp path breaks anything computing relative symlinks or comparing realpaths. Always
  `mktemp -d /private/tmp/XXXXXX` for a scratch HOME or project.
  Applies to: any scratch-repo test on macOS.
- **Harness (pty)** — driving a live, already-running raw-terminal/OpenTUI screen for a key-burst or
  smoke test needs a real pty — Python's `pty.fork()` at a fixed size — a piped subprocess stdin
  does not give the renderer a controlling terminal.
  Applies to: any interactive-CLI smoke test.
- **Harness (macOS)** — Warp has no documented URI to focus an existing tab from outside it;
  `\x1b]777;notify;<app>;<label>\x07` (plus `\x07` for the bell) is its supported notification
  escape sequence.
  Applies to: anything alerting the user in a background Warp tab.
- **Harness (macOS)** — `afplay <file>` plays audio files including mp3 from the shell; the built-in
  system sounds live under `/System/Library/Sounds/*.aiff`.
  Applies to: any hook or script wanting an audible alert.
- **Project (ivy)** — OpenTUI's renderer takes roughly its first 150-200 render cycles to warm up
  its allocator/buffer pool (observed RSS 110→232MB) before flattening; a memory-flat assertion
  needs to run well past that warmup or it reads as a leak that isn't one.
  Applies to: any RSS-based invariant on `src/tui/`.
- **Harness (macOS)** — stray temp-dir pathology: a leaking test helper in an unrelated project can
  silently fill `/var/folders/.../T` with millions of entries and slow every `mktemp -d` scratch run
  to a crawl. `stat -f %z <dir>` divided by 32 estimates the entry count without listing; a
  streaming `os.scandir` + `rmdir` (skip non-empty, ~2800/s) clears it where `find -delete`/`bfs`
  stall.
  Applies to: any Worker or gatekeeper whose sandboxed CLI runs feel slow, before blaming Factory code.
- **Harness (Claude Code)** — auth needs the real config dir: a real headless sub-agent spawn (for a
  `PostToolUse`/`additionalContext` style check) cannot authenticate under a scratch `HOME`, Claude
  Code only reads credentials from the real `~/.claude`/config dir. Spawn with the real HOME and
  scratch-prefix only the project's own commands.
  Applies to: any Validator step driving a real spawn.
- **Harness (tmux)** — passthrough for Warp's agent badge: Warp's Claude Code status badge rides
  OSC 777, and tmux has stripped OSC/DCS passthrough by default since 3.3a, so a `claude` process
  inside tmux shows no badge unless `.tmux.conf` sets `allow-passthrough on` (plus
  `extended-keys always`).
  Applies to: any detached or tmux-based session recipe for Factory sessions.
- **Project (ivy)** — a recorded session is not a live one: checking "is a session id recorded"
  instead of "is it still live" before (re)binding or refusing lets one idle tab silently steal
  another's hook binding, or lets a dead-tab mission refuse to ever reopen. Check liveness
  (`sessionLive`), not presence.
  Applies to: any command that opens, adopts or spawns into an existing mission.
- **Workflow (prompts)** — foreground with a timeout, not background-and-poll: running a mission
  check (`run_in_background: true`) and polling the output file burns turns and hides failures
  behind the poll loop; run it in the foreground with a timeout.
  Applies to: any Worker or gatekeeper prompt naming a recipe to run.
- **Workflow (specs)** — a directory-wide line budget invites inlining, not splitting: a total-line
  cap on a folder (`src/tui/` under N) pushes an agent to inline constants and merge sections to
  stay under the number rather than restructure. A per-file cap drives the actual fix, splitting
  into one file per concern.
  Applies to: any spec or guardrail capping a directory's total line count.
- **Workflow (decisions)** — a decision's status is not final at `auto` or `waiting`: a human
  reading `decisions.md` after the fact can still overrule an `auto` row the dial let through, and
  only `accepted` and `overruled` are terminal.
  Applies to: any tooling or prompt reasoning over decision status.
- **Workflow (decisions)** — autonomy is answered in bulk, not per decision: faced with several
  waiting LOW decisions in one injected line, the human switched autonomy to `full` rather than
  answering each with `decision answer`. A bulk "accept all outstanding" path would match how the
  dial is actually used under load.
  Applies to: the `decision` CLI and the Orchestrator's waiting-decision rule.
