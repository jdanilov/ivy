# Environment

What the Factory depends on, layer by layer, and how to loosen the outer layers so it runs beyond
one Mac with Warp. The inner layers, Bun and Claude Code, are the point of the tool and stay.
The outer ones, macOS and Warp, are accidents of where it was written, and they are where
adoption stops today.

## Dependency map

`●` unavoidable · `○` external, replaceable · `◈` silent failure elsewhere

### ● Runtime

| Dependency        | Where                                           | Note                                                       |
|-------------------|-------------------------------------------------|------------------------------------------------------------|
| Bun, recent       | `src/**`, @parts/hook-factory/hook-factory.ts   | `Bun.YAML`, `Bun.spawn`, `Bun.connect`, `Bun.CryptoHasher` |
| git on PATH       | @src/core/mission.ts                            | branches, worktrees, merge on close                        |
| `@opentui/core`   | `src/tui/**`                                    | native binary per platform, `core-darwin-arm64` here       |
| `@clack/prompts`  | `src/ui/**`                                     | pure JS                                                    |
| `ai`, `@ai-sdk/xai` | @parts/research/scripts/research.ts           | one opt-in part's dependency, paid by every install        |

### ○ Claude Code — the substrate, pinned to internals

| Dependency                                          | Where                          |
|-----------------------------------------------------|--------------------------------|
| `claude --bg`, `attach`, `stop`, `--session-id`     | @src/core/spawn.ts             |
| `~/.claude/jobs/<short>/state.json`                 | @src/core/spawn.ts:12          |
| `~/.claude/sessions/*` and its Unix inbox socket    | @src/core/peer.ts:11           |
| `--input-format stream-json` line shape             | @src/core/peer.ts:31           |
| `~/.claude/projects/<cwd mangled>/<session>.jsonl`  | @src/tui/transcript.ts:14      |
| hook events, `settings.json` shape, `$CLAUDE_PROJECT_DIR` | `parts/*/part.yaml`      |
| function-hooks plugin API, confirmed on one build   | @plugins/factory/API.md        |
| model names in `ROLE_MODEL`                         | @src/core/workflow.ts          |

A Claude release that renames one of these breaks three files quietly. Nothing checks the version.

### ○ macOS

| Call                                    | Where                                        | Elsewhere            |
|-----------------------------------------|----------------------------------------------|----------------------|
| `caffeinate -dims`                      | @parts/hook-factory/hook-factory.ts:170      | ◈ ENOENT             |
| `afplay`                                | @parts/hook-factory/hook-factory.ts:225      | ◈ ENOENT             |
| `open <uri>`, `open -Ra Warp`, `/Applications/Warp.app` | @src/core/spawn.ts:148       | ◈ never true         |
| `ps -o ppid=,comm=`, `nohup`, `/bin/sh` | @parts/hook-factory/hook-factory.ts:124      | POSIX only           |
| `process.kill`, Unix domain sockets     | @src/tui/actions.ts:75, @src/core/peer.ts    | POSIX only           |
| `ioreg -c IOHIDSystem` for idle time    | @src/core/platform.ts:24                     | ○ `xprintidle`, else `loginctl IdleSinceHint` |
| `launchctl bootstrap`, `bootout`, the user agent plist | @src/core/platform.ts:47, @src/commands/supervisor.ts:70 | ○ `systemctl --user enable --now` on a `systemd --user` unit |

The last two are the daemons' adapters, and the only two the Factory already shims: `idleSeconds()`
and `unitFile()` in `src/core/platform.ts`, called by the supervisor's loop and by `supervisor
install` and `uninstall`, which are the one place the OS scheduler is touched. An OS with neither
idle tool reads 0 — always active, so `when: active` never blocks a run — and one with no unit
adapter refuses `supervisor install` with a line, leaving `factory supervisor start` by hand.

### ○ Warp

| Dependency                              | Where                    |
|-----------------------------------------|--------------------------|
| `~/.warp/tab_configs/*.toml`, `warp://tab_config/` URI | @src/core/spawn.ts:9 |
| OSC `777;notify` escape                 | @src/tui/notify.ts:18    |
| the diff panel, called Changes in docs  | @docs/terminology.md     |

`mission open` conflates "open a terminal tab" with "start a session". That is what makes Warp
load-bearing: the session part is Claude's, the tab part is the terminal's, and only the second
varies by environment.

### ○ Per-part externals — opt-in, already gated by `default: false` or `envVars`

| Part        | Needs                                                                     |
|-------------|---------------------------------------------------------------------------|
| codegraph   | `npx -y @colbymchenry/codegraph@1.6.0`, so Node as well as Bun            |
| browse      | `agent-browser` CLI, Chrome/Brave/Edge 144+ with remote debugging, `~/.agent-browser/*.sock` |
| research    | an xAI key                                                                |
| hook-factory | `bun` on PATH in every target project: hooks run `bun .claude/scripts/hook-factory.ts` |

The last row is the silent killer. A teammate clones a project with the Factory installed, opens
Claude, and every hook errors. `install` never checks.

## What breaks where

| Environment          | install/update/status | mission CLI  | `mission open` | Mission Control  | hooks                        |
|----------------------|-----------------------|--------------|----------------|------------------|------------------------------|
| macOS + Warp         | ✓                     | ✓            | ✓              | ✓                | ✓                            |
| macOS, other terminal | ✓                    | ✓            | ◈ prints cmd   | ◈ no notify      | ✓                            |
| Linux                | ✓                     | ✓            | ◈ prints cmd   | ✓ opentui binary | ◈ caffeinate, afplay throw   |
| Windows native       | ✓ probably            | ◈ git paths  | ✗              | ✗ opentui, tty   | ✗ `/bin/sh`, `ps`, sockets   |
| target without Bun   | ✓                     | ✓            | ✓              | ✓                | ✗ every hook                 |

## Levers, highest gain per effort first

1. **Platform shim, one module.** `src/core/platform.ts` exists, with the daemons' `idleSeconds()`
   and `unitFile()`; the lever is `keepAwake()`, `playSound()`, `openUri()` and `parentCommand(pid)`
   moving in beside them. mac → `caffeinate` / `afplay` / `open`; linux →
   `systemd-inhibit` / `paplay` or `aplay` / `xdg-open`; unknown → no-op, logged once. Every
   `darwin` assumption leaves the callers. Half a day.
2. **Terminal adapter instead of Warp.** `launch:` already exists in `~/.factory/config.yaml`;
   add `terminal: warp | tmux | wezterm | kitty | iterm | none`. `none` prints the command, which
   the code half-does already. tmux alone covers Linux, SSH and Mac users not on Warp. Notify falls
   back to the bell; OSC 777 becomes one adapter's line. Split `mission open` into start-session
   and open-tab so the adapter only owns the second.
3. **Hooks without Bun on the target.** `bun build --compile` the hook per platform at install
   time, or ship a JS build `node` can run. Minimum: `install` detects a missing `bun` and warns.
4. **Claude Code internals behind one interface.** `src/core/claude.ts` owning the jobs dir, the
   sessions dir, the transcript path and the `--bg` protocol. `claude --version` once, refuse with
   one line below the floor.
5. **Distribution.** README says clone plus `bun install`; `bin` is a `.ts`. Release
   `bun build --compile` binaries per OS, or publish to npm so `bunx factory` works. The first
   step stops being "clone my repo". Move `ai` and `@ai-sdk/xai` out of the core `package.json`
   into the research part.
6. **Preflight `factory doctor`.** ✓ / ✗ per line: bun, git, claude version, terminal, then the
   opt-in externals. Turns every silent failure above into a visible one.
7. **Windows: don't.** Sockets, `ps`, `/bin/sh`, tty rendering. Say WSL in the README.

## Order

◇ Mission one: 1, 2 with `none` and `tmux`, 6. Small, and Linux becomes first-class.
◇ Mission two: 3, 4. They change install semantics and the hook contract.
◇ Mission three: 5.
Windows stays out of scope.
