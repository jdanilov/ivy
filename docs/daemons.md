# Daemons

A project's background work — a bot on a schedule, a dev server up while you work — used to be a
launchd plist here, a pm2 entry there and a shell script somewhere else, so what runs on a machine
could only be learned by asking each in its own language. The Factory declares it instead: one
manifest per project, committed, and one supervisor per machine running what the manifests say and
the machine allows. Read before touching @src/core/daemons.ts, @src/core/supervisor.ts,
@src/core/platform.ts or @src/commands/daemon.ts.

That split is what makes it portable: *what* a project runs travels with the repo, *whether* it
runs here is the machine's — `~/.factory/config.yaml` under `daemons:`, default off. `off` wins
over anything the manifest says, and a project outside `~/.factory/projects` is invisible.

## The manifest

`.factory/daemons.yaml` maps a name to an entry; a `daemon` is periodic, a `service` long-running.
The name under its project folder is the key every surface uses: `igs/cws-reviews`.

| Field         | Kind    | Meaning                                                                       |
|---------------|---------|-------------------------------------------------------------------------------|
| `kind`        | both    | `daemon` or `service`. Required.                                              |
| `cmd`         | both    | Required. Run through the login shell, `$SHELL -lc`, so PATH has bun and nvm's node. |
| `description` | both    | One line, shown in the DAEMON pane.                                           |
| `cwd`         | both    | Relative to the project root, default the root.                               |
| `env`         | both    | Laid over the supervisor's own environment. Scalars only — quote a port.       |
| `every`       | daemon  | Required. `90s`, `20m`, `3h`, `1d`.                                           |
| `atMost`      | daemon  | `N/window`, `1/24h`. Successes only.                                          |
| `when`        | daemon  | `any` (default), `active`, `idle`. The line is 90 min without input.          |
| `timeout`     | daemon  | Kills the run's process group and files it failed, summary `timeout`.         |
| `run`         | service | `detached` (default) or `tab`.                                                |
| `restart`     | service | `never` (default), `on-failure`, `always`.                                    |
| `port`        | service | Shown in the row. Nothing reads it.                                           |

A file that does not parse, or an entry missing a field, costs that project its rows and nothing
else: one error naming the entry and the field, one dim line under the project, never a throw.

## The contract

Nothing is asked of a script but its exit code and, if it has something to say, its last stdout
line. `✓` exit 0 is **ok** · `○` exit 0 with `{"skip":"nothing to reply to"}` is **skip** · `✗`
non-zero is **fail** · `{"summary":"posted 3/5"}` is the row's text, and a last line that is not
JSON is that text itself, clipped to 80 cells. The rest of what it prints is its log.

## Cadence

`due()` is pure — no file of its own, no clock of its own — so the supervisor and a test read one
answer. `every` gates on the last completed run of **any** status: a failure does not retry in a
tight loop, and a tick missed to sleep or to a downed supervisor is due at once, once, after which
the cadence resumes. `atMost` is a second window, over successes only; `when` reads idle time
through one adapter per OS, and an OS with neither is always active; a row with a pid is never due.
`next` is the later of `lastEnd + every` and the window's oldest success plus the window. The loop
wakes every 30 s and on a file change, so a cadence under 30 s is in practice 30 s. `daemon run`
and `R` bypass all three gates, and turn the row on: Run is the only way on.

## Services

Desired state is `enabled`, the one line in the machine's config, raised by `run` and lowered by
`stop`: a service that is on and not running is started by the next tick, and a stop, having turned
the row off, cannot be undone by the `restart: always` of the service it just killed. `detached`
spawns under the supervisor in its own process group with stdout and stderr to the log, and a stop is
`kill(-pid)`, SIGKILL five seconds later. `tab` opens a Warp tab the way `mission open` does, its
shell writing its own pid to `<dir>/tab.pid` first so the supervisor can still stop what the human
is watching; no Warp, or no pid within ten seconds, and it runs detached with a dim `tab→detached`.

An exit nobody asked for is judged by `restart`: `never` turns the row **off** and alerts
`died <code>`, exit 0 included — the human said run and it is not running, and a row left on would
be started again by the next tick. `on-failure` on a non-zero exit and `always` on any restart after
`min(1s·2ⁿ, 60s)`, giving up after five inside ten minutes, which turns it off with its alert too.
The supervisor is the one surface that writes the config, because it is the one that saw the exit.

## State, logs and requests

Under `~/.factory/daemons/<project>/<name>/`. The project repo holds nothing of the Factory's.

| File           | Written by              | Holds                                                      |
|----------------|-------------------------|-------------------------------------------------------------|
| `state.json`   | the supervisor          | the facts below, temp file plus rename                     |
| `log`, `log.1` | the supervisor          | every run under a `── <ISO> run <cmd>` header, rotated at 5 MB, one generation |
| `request`      | the CLI and the TUI     | `run`, `stop` or `start`, consumed once by the next tick   |

`state.json`: `pid` and `startedAt` while it runs; `lastStart`, `lastEnd`, `lastStatus`,
`lastSummary`, `nextDue` from the last run; `successes`, the stamps `atMost` counts; `restarts`, the
stamps inside the give-up window; `alert`; `tabFallback`. `enabled` is mirrored from the config
when the state is read, never stored, and a `wanted` key an older Factory left in the file is read
past and never written again. A request is a file and not a socket because reads
already go through files, and one written while the supervisor restarts survives to the next tick.

A failed run and a death set `alert`, one Inbox row beside the gates, naming the command that
answers it: `factory daemon log igs/cws-reviews`. Reading the log is the acknowledgement — the CLI's
`daemon log` and the TUI's `l` are the same call — and a next success clears it too. `↵` only looks.

## Keys and their twins

Every key is one call into @src/commands/daemon.ts, the same call the subcommand beside it makes.

| Key     | On a daemon row                                          | CLI                                  |
|---------|-----------------------------------------------------------|--------------------------------------|
| `r`     | turn it on and run now, or start a service                | `factory daemon run <key>`           |
| `x`     | stop the run or the service, and turn it off              | `factory daemon stop <key>`          |
| `l`     | the log alone in the right pane, the alert cleared        | `factory daemon log <key> [-f] [-n N]` |
| `↵`     | DAEMON: the entry, the last result, the last 30 log lines | `factory daemon status <key>`        |

`l` is the Log here and nowhere else: every other row still turns Launch, and the key bar says so.
`factory daemon list [project]` prints the rows themselves.

## The supervisor

One process per machine, started detached by `factory supervisor start`. It holds no truth of its
own: manifests, machine config and state files are read again every tick, so the CLI and Mission
Control steer it by writing files. One bad row is one alert and one line in the supervisor's log.

- **Singleton** — `~/.factory/supervisor/pid`, liveness-checked; a pid nobody answers to is a
  crashed supervisor and is unlinked. A second `start` refuses, naming the live pid.
- **Adopt** — on start, a state `pid` still alive whose `ps -o command=` still contains its `cmd` is
  kept and the rest cleared: neither orphan a detached service nor claim a pid the OS has reused.
- **Watch** — `fs.watch` on `~/.factory`, `~/.factory/daemons` and each project's `.factory`,
  debounced, with the 30 s tick under it. A manifest edit needs no restart.
- **Stop** — SIGTERM unlinks the pid file and exits. What it started was told to outlive it.
- **install** — writes the OS unit and loads it: a launchd user agent on macOS, a `systemd --user`
  unit on Linux, @src/core/platform.ts. The one place the Factory touches the OS scheduler; `start`,
  `stop`, `status` and the loop never do. Mission Control starts one when none runs, never stops it.
