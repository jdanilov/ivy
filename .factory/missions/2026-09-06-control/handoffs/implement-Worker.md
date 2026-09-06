Committed clean on `mission/control`. Summary of the work and evidence:

**Files:** `/opt/ed/ivy/src/tui/{model,theme,live,screen,fixture,frames}.ts`, `/opt/ed/ivy/src/commands/control.ts`, `/opt/ed/ivy/scripts/test.ts`, `/opt/ed/ivy/parts/validate/agents/Validator.md`

```
Step: implement (W3, screen and prompts)
Done:
- src/tui/model.ts — StepKind is human | gatekeeper | agent | technical, and stepKind(step, early) is the one mapping: role worker/investigator → agent, verify/validate/accept or a parallel of those → gatekeeper, grill/intent or gate: human before the first worker step → human, else technical. live.ts flattens the workflow and passes `early`; fixture.ts spells no kind at all and reads its colours through the same call, so a look review is a review of what the screen draws. Mission gains `diff`.
- src/tui/theme.ts — the four kinds named in one KIND record (human C.success #a8a968, gatekeeper C.warning #d7af5f, agent #6b8fd9, technical C.dim #6e6e6e); the old gate/implement/gatekeeper trio and the now-unused panel fill are gone; stepColor takes the kind alone, the glyph keeps stateColor.
- src/tui/screen.ts — `?` is the right pane, not an overlay: KEYS with the same groups, a rule, HOW FACTORY WORKS in five wrapped sentences plus a Next line, drawn at the full body height (activity yields to it) with no border and no fill; `?` and esc close it, every other key is swallowed, the bar reads `? esc Back  Q Quit`.
- src/tui/screen.ts — `f` gives the log the screen: header and status bar are not drawn (FULL_CHROME 3), the bar reads `↑↓ Scroll  ↵ f esc Back  Q Quit`, `↑↓` scroll (Ui.scroll, clamped in activityPane which is the only place that knows the room), `↵`/`f`/`esc` restore the columns with ui.left untouched and the scroll reset.
- src/tui/live.ts — diffCount() runs `git diff --shortstat <trunkBranch>...<branch>` in state.worktree || the project, keyed per checkout+branch, cached in a module map, one run in flight at a time, never awaited by buildSnapshot; open missions with a branch only. settle() lets `--frames` wait for the counts in flight, then control.ts builds a second snapshot so a still frame carries them.
- src/tui/screen.ts — the row shows `+N −M` after the tokens, `+` olive, `−` (U+2212) red, and nothing while unknown.
- src/tui/live.ts — an unbound session is listed only while sessionLive(id) is true, which gates its question with it; the question's origin is the short id, so MESSAGES reads `alpha/#bbbbbbbb  asks`; the session row drops "unbound" and reads `quick  #bbbbbbbb  idle 9s`. A bound mission's question still carries the mission name.
- parts/validate/agents/Validator.md — new §3 "Keep the scripts, do not re-drive by hand": read .factory/validator/scripts.md first, write short bun/node scripts under .factory/validator/ with Bash (it has no Write), one index line each (name, what it reaches, when written), reuse next round, delete what breaks and drop its line. 75 lines, every existing rule kept, sections renumbered.
- scripts/test.ts — a case asserting the story workflow maps to grill:human,intent:human,research:agent,spec:technical,implement:agent,accept:gatekeeper,condense:technical,merge:technical, and that a bare verify/validate row is gatekeeping.

Acceptance:
- A-UI-1 pass — captureSpans at 140x42 over the refit mission pane, colour read at the column each name starts: grill #a8a968, intent #a8a968, research #6b8fd9, spec #6e6e6e, implement #6b8fd9, accept #d7af5f, verify #d7af5f, validate #d7af5f, condense #6e6e6e, merge #6e6e6e — all as specified; the glyphs beside them stayed lifecycle (research `·` #6e6e6e skipped, implement `●` #d97757 running, spec `✓` #a8a968 done).
- A-UI-2 pass — `?` frame: the right pane reads KEYS, seven groups, a rule, HOW FACTORY WORKS and 8 lines under it (5 primer + blank + "Next: factory mission new <name> in a project, or /mission in a session."), MISSION/MESSAGES gone, no border and no background span (frames report `bg none`); under the test renderer `down` behind the panel produced a byte-identical frame, `esc` and `?` each returned the exact pre-help frame.
- A-UI-3 pass — after `f` the frame carries no "FACTORY" and no status bar, last row is `↑↓ Scroll  ↵ f esc Back  Q Quit`; `↑` changed the visible rows, `↓` returned to the foot frame; `esc`, `↵` and `f` each restored the pre-`f` frame byte for byte with ui.left unchanged.
- A-UI-4 pass — scratch HOME, repo alpha, `mission new alpha`, one commit on mission/alpha: `git diff --shortstat main...mission/alpha` = "34 insertions(+), 1 deletion(-)" and the live frame row reads `● alpha  story  grill  8s  0  +34 −1`. Colours proved on the fixture: `+120` #a8a968, `−34` #cc5555. buildSnapshot calls diffCount synchronously and returns the cached value; the git run is a floating promise.
- A-UI-5 pass — same scratch HOME with three unbound sessions in one project, two with events touched now and one touched two hours ago: the frame lists `○ quick  #bbbbbbbb  idle 9s` and `○ quick  #aaaaaaaa  idle 9s`, MESSAGES (2) reads `alpha/#bbbbbbbb  asks` and `alpha/#aaaaaaaa  asks`, and the stale session appears in neither although its transcript holds a text block.
- A-VAL-1 pass — Validator.md §3 names writing under .factory/validator/, the one-line-per-script index in scripts.md, reuse next round and pruning with its line; file is 75 lines. Colours read Worker blue, Investigator cyan, Verifier yellow, Validator yellow, Summarizer magenta — all already as specified, none changed.

Commands:
- `bun x tsc --noEmit` exit 0; `bun scripts/test.ts` exit 0, 18 cases, 0 failures; `bun src/cli.ts status /opt/ed/ivy` exit 0; `bash scripts/e2e.sh` exit 0 ("e2e: ok").
- Budget: src/tui/ plus src/commands/control.ts = 2126 lines of 2200 (W2 left 2011). The help primer and the scroll cost 115; nothing else was squeezed.

Issues:
- A-UI-5 tightens A-SRC-4: an unbound session used to be listed on a 24h-old events line, it now needs sessionLive (events touched inside ten minutes). A bound mission's question is unchanged and can still outlive its session.
- docs/design.md now drifts in two places I am not allowed to touch: it says the help panel paints #0a0a0a (it paints nothing and is a pane, not an overlay) and its key table has no Activity scroll row. One-line fixes for whoever owns docs.
- The fixture frames in .factory/missions/2026-09-06-control/prototype/ predate this step, so they still show the old colours and the "unbound" session row. `bun scripts/tui-snapshot.ts <dir>` regenerates them; I wrote mine to /tmp rather than touch the mission folder.

Deviations:
- `?` takes the whole body height, so the activity pane is not drawn while it is open. "Full height" any other way leaves the primer without room at 24 rows.
- `factory --frames` builds the snapshot twice, with live.settle() between: the git counts land behind the first build and a still frame that never shows them is not worth writing. The live screen still never waits.
- Full activity keeps the leading blank row (chrome 3, not 2), so the screen's top margin does not jump when `f` is pressed.

Faster:
- captureSpans() merges adjacent spans of one colour, so `spans.find(text === name)` silently misses every step whose name shares its glyph's colour. Walk the spans accumulating columns and read the colour at the column the name starts in.
- `factory mission new` run with the wrong cwd acts on whatever repo you are standing in, and on a claimed checkout it blocks on the worktree prompt with no output. Under a scratch HOME, cd into the scratch repo first and give it `</dev/null`.
```
