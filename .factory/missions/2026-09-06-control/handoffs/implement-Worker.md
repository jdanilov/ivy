Step: implement (W1, read side)

Done:
- `/opt/ed/ivy/src/tui/live.ts` builds the whole `Snapshot` from disk: `existingProjects` (deduped by realpath), `listMissions`+`readState`+`missionRowState`+`missionWorkflow`, `scanProject` for parts, `~/.factory/events/*.jsonl` for sessions and Stop rows, `~/.factory/caffeinate/<session>.pid` for the pid, gates and `findings.md` for the Inbox, `~/.factory/config.yaml` for the caffeinate mode.
- `/opt/ed/ivy/src/tui/transcript.ts` is the tail reader: byte offset per file, first read capped at the last 2 MB, activity mapping table, `sumUsage` for the mission total and per-step windows, last assistant text for questions, 400-row cap per session.
- `/opt/ed/ivy/src/tui/watch.ts` `startLive()`: `fs.watch` on the events and caffeinate dirs, each project's `.factory/missions` (recursive) and every open transcript, one rebuild per 200 ms burst, a 2 s poll, watchers and timers closed on quit.
- `/opt/ed/ivy/src/commands/control.ts`: live is the default, `--fixture` the demo, `--frames <dir>` writes the live screen as text and exits 0; `/opt/ed/ivy/src/tui/frames.ts` holds the frame writer that `scripts/tui-snapshot.ts` now calls too (no duplication).
- `screen.ts`: `run(snap, live?)` swaps the snapshot under the screen, `itemKey` exported, `n` and the `arrival()` fixture gone, per-step tokens on the MISSION rows, `modified` parts rendered as such; `model.ts` gained `StepRow.tokens` and the `Tool` verb; `format.ts` counts emoji as two cells (a live Bash row with an emoji was wrapping and pushing the panes down).
- `scripts/test.ts` gained one case: the tail parses each line once and its offset follows the file.
- `src/tui/` + `src/commands/control.ts` = 1750 lines (budget 1700, over by 50; the read side is 600 new lines and the fixture is 217 of the total).

Acceptance:
- A-SRC-1 pass — scratch HOME with p1 (`alpha`, implement running) and p2 (`beta` stub): `--frames` exit 0 with no tty, frames list both projects, `● alpha chore implement` and a dim `○ beta stub`.
- A-SRC-2 pass — `gate open merge --file retro.md` → MESSAGES (1) `⊘ p1/alpha gate merge`, `retro.md (4 lines)` with the body; after `gate answer merge accept` the next frame reads MESSAGES (0).
- A-SRC-3 pass — a dead path appended to `~/.factory/projects` is absent from the frames, exit 0, no error.
- A-SRC-4 pass — three scratch events files (30 h old / cwd outside every project / fresh inside p1): only the fresh unbound one appears, and the session named by `alpha`'s `state.session` never shows as unbound.
- A-SRC-5 pass — pid file naming a live `sleep` → `caffeinate: true`; the same file after the kill → `false`; a 999999 pid → `false`.
- A-SRC-6 pass — rows come from one `scanProject` call; scratch p1 shows `PARTS 2/17` with `commit ● modified` against `factory status` "1 installed, 1 modified", ivy shows `17/17` against "17 installed, 0 modified, 0 available".
- A-TRX-1 pass — 3 lines then 2 appended → 5 rows, `cmd 1..5` with no repeat, offset equals the file size; a 3.38 MB file parses 496 of 800 lines, exactly the last 2 MB; one case added to `scripts/test.ts`.
- A-TRX-2 pass — scratch jsonl renders `Bash / Edit / Agent / Ask / Text` in timestamp order, the sidechain Bash line excluded, plus the hook's `Stop` row.
- A-TRX-3 pass — mission tokens `600 / 9000 / 300` = six usages including the sidechain one; step `implement` between its `startedAt` and `endedAt` = `300 / 4500 / 150`.
- A-TRX-4 pass — after `Stop`, MESSAGES shows `p1/quick asks` with the last assistant text; after appending a `UserPromptSubmit` event it reads MESSAGES (0).
- A-RFR-1 pass — watchers cover the four sets; measured: 10 writes in 100 ms → 1 rebuild, 2.3 s idle → 1 poll rebuild, after `close()` → 0 rebuilds and 0 active handles.
- A-RFR-2 pass — `render()` still destroys (renderer root children stays 1 across 150 renders); 300 s of rebuild+render every 2 s with the transcript growing: RSS 103–119 MB, spread 15.5 %, activity rows capped at 402.

Deviations:
- `buildSnapshot()` takes no `prev`: the transcript offsets live in `transcript.ts` and everything else is read fresh, so the parameter had no honest use. The arrival diff W2 needs belongs at the `startLive` call site in `control.ts`, which holds the previous snapshot.
- `args.ts` unchanged: only value-less flags are declared (the `BOOLEAN` set); `--frames <dir>` already parses as a value flag.
- Usage is counted once per `message.id` — Claude Code writes one line per content block carrying the same usage object, so summing every line multiplies a response by its block count.
- `live.ts` reads `~/.factory/config.yaml` itself instead of `loadConfig()`, which caches for the process and drops unknown keys; `c` rewrites that file while the screen runs.
- Line budget missed by 50 (1750 of 1700).

Issues:
- `toast()` closes over the snapshot it was called with, so its 2 s re-render can paint one stale frame under live data — W2 owns the actions that raise toasts.
- `screen.ts` no longer imports `notify`; the `n` key and `fixture.arrival()` are gone, so W2 wires arrival where `startLive` is (control.ts).
- Transcript slug is `cwd` with `/` → `-`, matching every folder in `~/.claude/projects`; a project path with a dot may not resolve, in which case that session shows no activity rather than failing.

Faster ways:
- An evidence script that imports `src/tui/` must live inside the repo: run from `/tmp` it loads a second `@opentui` copy from the bun cache and `destroyRecursively` throws `remove expects a renderable child object`.
