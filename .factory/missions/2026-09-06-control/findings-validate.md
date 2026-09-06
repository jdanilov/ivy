# Validate round 1 — Mission Control wiring

Driven, not read. `e2e.ready` (`bun src/cli.ts status .`) exit 0 first. Every check ran under a
scratch `HOME` built by `.factory/validator/scratch.ts` and driven with `factory --frames <dir>`
or `.factory/validator/keys.ts` (`onKey` under `@opentui/core/testing`). Nothing was pressed
against this machine's real sessions; the one real-HOME run was `--frames`, read only.

Scratch HOMEs used: `/tmp/vhome.ZkhLmr` (A-SRC, A-TRX, A-UI), `/tmp/vhome2.6s6Uin` (A-ACT-1/2),
`/private/tmp/vhome3.Vb0cBW` (A-ACT-5 — see F4 for why the second one had to move).

## Assertions

| id       | verdict | evidence                                                                                                                                                                                                                 |
|----------|---------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| A-SRC-1  | pass    | `--frames` exit 0 with no tty, 8 frames. PROJECTS: `beta` / ` ○ bstub  stub` and `alpha` / ` ⊘ alpha  story  implement  4s  0  +1 −0`. Span capture: the whole stub row is `#6e6e6e` (dim), the mission name `#e4e4e4`. |
| A-SRC-2  | pass    | Before: `MESSAGES (2)` … `⊘ alpha/alpha  gate merge`, detail `intent.md (4 lines)` then the four body lines. After `factory gate answer merge accept` (exit 0) the next `--frames` reads `MESSAGES (1)` with the gate gone and the mission glyph back to `●`. |
| A-SRC-3  | pass    | `~/.factory/projects` last line `/tmp/vhome.ZkhLmr/gone`; `--frames` exit 0, no error, `grep -rl gone frames/` finds nothing. The same run deduped the `/tmp` and `/private/tmp` spellings of `alpha` and `beta` to one row each. |
| A-TRX-2  | pass    | ACTIVITY on the inbox frame: `16:00:33 Bash  bun scripts/test.ts` / `16:01:33 Edit  README.md` / `16:02:33 Agent Worker wire the read side` / `16:03:33 Ask  Ship the amber gates?` / `16:04:33 Text  Waiting on you: pick the trunk branch.` in timestamp order, then the hook's `Stop` row. The sidechain line (`Bash sidechain only`, timestamp between Edit and Agent) is absent. Bash shows the command's first line only. |
| A-TRX-4  | pass    | Session `bbbbbbbb`, last event `Stop`: `⊘ alpha/#bbbbbbbb  asks` with `Waiting on you: pick the trunk branch. More prose.` and `tab quick`. After appending a `UserPromptSubmit` line, the next `--frames` reads `MESSAGES (1)` with only the other session's question; the session row itself stays. |
| A-ACT-1  | pass    | `keys.ts --row inbox --focus right down return` wrote `{"status":"answered","file":"intent.md","answer":"accept","at":…}` — the same four fields and values `factory gate answer merge accept` wrote in the other scratch HOME. Second answer: CLI recorded `amend --note "cli first"` behind the screen's snapshot, then `↵ accept` toasted `✗ gate implement was already answered amend at 2026-09-06T13:16:09.143Z — "cli first"` and `state.json` still reads `amend`. |
| A-ACT-2  | pass    | `↵` on `amend` draws `amend note   ↵ record · esc cancel` over the verdict row; `esc` restores `accept  amend  reject` and `gates.condense` is still `{"status":"open"}`. Typing through the `InputRenderable` and `↵` wrote `{"answer":"amend","note":"add the migration step"}`; the same path on `reject` wrote `{"answer":"reject","note":"not ready"}`. The note reached `state.json` through the widget's INPUT event alone. |
| A-ACT-5  | pass    | `beta` with only `commit` installed: `factory status` `1 installed, 0 modified, 16 available`. `space` on `commit`, `space` on `docs-format`, `↵` → `apply: install docs-format, uninstall commit   y confirm  n cancel`, `y`. After: `factory status` `1 installed, 0 modified, 16 available` with `docs-format ● installed` the only row, `.claude/skills/` and `.claude/agents/` gone, manifest holding `docs-format` only. |
| A-UI-1   | pass    | Span colours on the story mission's MISSION pane, read at the column each name starts: grill `#a8a968`, intent `#a8a968`, research `#6b8fd9`, spec `#6e6e6e`, implement `#6b8fd9`, accept `#d7af5f`, verify `#d7af5f`, validate `#d7af5f`, condense `#6e6e6e`, merge `#6e6e6e`. Glyphs kept the lifecycle: `●` implement `#d97757`, `✓` done `#a8a968`, `·` skipped and `○` pending `#6e6e6e`. |
| A-UI-2   | pass    | `?` replaces the right pane to the full body height (MESSAGES and ACTIVITY both gone, `bg none`): `KEYS`, seven groups, a rule, `HOW FACTORY WORKS`, five primer lines, a blank, `Next: factory mission new <name> in a project, or /mission in a session.` — eight lines, under twelve. `down` behind the panel produced a byte-identical frame; a second `?` and `esc` each restored the pre-help frame (only the idle clock differed). |
| A-UI-3   | pass    | `f`: no `FACTORY` header, no status bar, key bar `↑↓ Scroll  ↵ f esc Back  Q Quit`. `↑` moved the top visible row from `echo row 023` to `022`, three `↑` to `020`, `↓` returned to the foot. `f`, `esc` and `↵` each restored the columns identically to the pre-`f` frame (idle clock only) with the left selection unchanged. |
| A-UI-5   | pass    | Three sessions in `alpha`, two touched now and one two hours old: rows `○ quick  #dddddddd  idle 1s` and `○ quick  #bbbbbbbb  idle 1m 19s`, inbox labels `alpha/#dddddddd  asks` and `alpha/#bbbbbbbb  asks` — two `quick` sessions told apart by the short id in both places. The stale session appears in neither, although its transcript carries the same text block. |

12 of 12 `validate` assertions pass. No assertion failed and none is unchecked.

## Findings

Ranked. Every one is `unlisted` — no assertion in the contract covers it. None blocks the step.

| id       | verdict | finding                                                                                  | blast  | effort | conf |
|----------|---------|-------------------------------------------------------------------------------------------|--------|--------|------|
| unlisted | fail    | F1 three Workers on `implement` left one handoff: each longer message overwrote the last  | wide   | S      | high |
| unlisted | fail    | F2 a skipped, failed or blocked step shows its duration instead of its status word         | narrow | S      | high |
| unlisted | fail    | F3 `[+4]` beside `6/12` is unlabelled and does not add up                                  | narrow | S      | high |
| unlisted | fail    | F4 a project path with a symlink in it gets dangling part links, `status` says `modified`  | narrow | M      | high |
| unlisted | fail    | F5 a refused gate answer still flips the row to `✓ answered`                               | narrow | S      | med  |
| unlisted | fail    | F6 `--frames` and `--fixture` are in no user-facing doc                                    | narrow | S      | high |
| unlisted | fail    | F7 a project with no missions draws an empty status band and a heading with nothing under it | narrow | S      | med  |

### F1 — three Workers, one handoff file

`parts/hook-factory/hook-factory.ts` `freeName()` returns the existing path whenever
`existing.length <= text.length`, so a *longer* handoff always overwrites its predecessor and the
`-2` sibling only ever appears for a shorter one. This mission ran three Workers on `implement`;
`handoffs/implement-Worker.md` holds W3's alone. W1 (5604 B, `63b0e89`) and W2 (7570 B, `5afbae4`)
survive only because each was committed before the next ran — the accept step was told to read
three handoffs and found one.

```
git log --oneline --name-only -- .factory/missions/2026-09-06-control/handoffs/
  609180e … handoffs/implement-Worker.md      # W3, 7668 B
  5afbae4 … handoffs/implement-Worker.md      # W2, 7570 B
  63b0e89 … handoffs/implement-Worker.md      # W1, 5604 B
```

The name needs something that differs per sub-agent run — a counter that only ever goes up, or the
agent's session id — not a length comparison.

### F2 — a skipped step reads as a duration

`missionPane()` ends each row with `[s.wall ? dur(s.wall) : s.status]`, so the status word only
survives while the step has no measured time. The real `control` mission skipped `research` in
55 ms and the row reads `· research  0s`, one glyph away from `✓ grill  0s`. The same swallows
`failed` and `blocked` on any step that ran at all.

```
bun src/cli.ts --frames /tmp/realframes && sed -n 11p /tmp/realframes/05-m-ivy-control.txt
 ›   ● control  story  accept  14h 4m  9.4M  +3542 −75  │  · research                                    0s
```
Against the scratch mission, whose skip took under a millisecond, the same row reads `· research  skipped`.

### F3 — `[+4]`

`missionBar()` writes `` `${done}/${total}` `` then `` ` [+${queued}]` ``, pending steps. On the real
mission that is `6/12 [+4]`: nothing on the screen or in `?` names it, and 6 + 4 ≠ 12 (one running,
one skipped) invites the reader to look for the missing two. Either label it or drop it — the bar
beside it already carries progress.

### F4 — dangling part links under a symlinked path

Pre-existing, not in this mission's diff, but it cost this round a rebuilt scratch world and it will
cost the next one. The linker writes relative symlinks with lexical `..` hops, so a project whose
path contains a symlink gets links that resolve somewhere else:

```
HOME=$(mktemp -d /tmp/x.XXXX); bun src/cli.ts install --parts commit $HOME/beta
ls -l $HOME/beta/.claude/skills/commit/skill.md
  skill.md -> ../../../../../../opt/ed/ivy/parts/commit/skill.md   # /tmp is /private/tmp: dangles
bun src/cli.ts status $HOME/beta
  0 installed, 1 modified, 16 available                            # right after a clean install
```
The same install under `/private/tmp` reads `1 installed, 0 modified`. In Mission Control this shows
as `commit ● modified` and, worse, `space` on a `modified` row toggles it as an *install*, so the
human who meant to drop it re-adds it. Resolve the target directory with `realpath` before computing
the relative link.

### F5 — a refused answer still marks the row answered

`handleKey` does `ui.answered.add(ui.msg)` before `act()` runs, so the MESSAGES row turns
`✓ alpha/alpha  gate implement   answered` even when the write came back
`✗ gate implement was already answered amend …`. The toast is the only signal and it clears after
two seconds; the row keeps the tick until the next rebuild. Mark the row on the action's result.

### F6 — the gatekeeper flags are undocumented

`factory --frames <dir>` is the only way to read the screen without a terminal and `--fixture` is the
look-review path; the README command table has `factory` and `factory menu` and neither flag, and
`?` does not mention them. One row each in the README table.

### F7 — an empty project

`07-p-igs.txt` row 3 is blank between two rules — `summary()` filters every zero count, so a project
with no missions draws an empty status band. In the left pane the same project is a heading with
nothing under it. On a fresh `HOME` the whole screen is empty with no line saying what to run
(exit 0, no crash — that part is right). A `no missions yet` row and, on an empty projects list,
`factory install <path>` would carry the reader.

## What is missing to drive this

`factory --frames <dir>` and the test renderer are enough: this round needed no bridge and no
browser, and every assertion above was checked headlessly. What was missing is the scratch world —
each check began by hand-building a HOME, a repo, a mission, events and a transcript. That is now
`.factory/validator/scratch.ts` plus `keys.ts`, indexed in `.factory/validator/scripts.md`. The one
tooling gap left is a `factory --frames` line in the README (F6) and a note that a scratch HOME must
live under `/private/tmp` (F4), which `scripts.md` now carries.
