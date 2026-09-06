Committed on `mission/control` as `600a655`.

```
Step: prototype
Done: fix 1 — key bar sits on `height - 1` (root box is the full terminal height, CHROME 7); every frame at 140x42, 100x24, 200x60 and 80x20 has the bar on the last row and the blank row above the header intact
Done: fix 2 — `C.rule` raised to `#3a3a3a` in theme.ts, used by every rule, the `│` divider and the metric separators; `#6e6e6e` still carries all label text
Done: fix 3 — `→` enters the right pane like `↵`, `←` leaves it, `←→` still choose on the MESSAGES answer row, `esc` leaves from anywhere
Done: addition 4 — bare `factory` opens Mission Control (`src/cli.ts` routes when there is no positional or it is `control`), the picker moved to `factory menu`, `factory --fixture` runs the prototype, unknown-command refusal lists `menu`, README gained the `factory` row
Done: addition 5 — full-width ACTIVITY pane between the columns and the key bar, a third of the room below the status bar, `f` toggles it to full (header, status bar and key bar stay); rows are `12:41:03` dim, a 7-wide verb column, then the text; a project or Inbox merges sessions and adds a mission column; `Activity { at, session, verb, text }` in model.ts, fixture 40/12/5 rows for refit, auth and the quick session
Done: addition 6 — `?` draws a centred `#3a3a3a`-bordered KEYS panel over everything, grouped Global, Projects, Messages, Parts, Mission, Activity; any key closes it
Done: addition 7 — key bar reads `↑↓ Select  ↵ Open  O Tab  X Kill  C Caffeinate  Z Closed  F Activity  ? Help  Q Quit`, letters uppercase and accepted either case, `? Help` dropped first when the bar does not fit
Done: addition 8 — `attention` on Mission, `attention light` dim before the status-bar metrics, `· attention light` on the MISSION step line, `t` cycles full → light → unattended with a toast; fixture refit light, auth full, intro light
Done: addition 9 — `z` hides closed missions, heading shows `PROJECTS  1 closed hidden`, selection re-found by row identity and clamped when its row is the one that went
Done: addition 10 — Inbox and MESSAGES oldest first (triage 1h, asks 8m, gate 3m), ages unchanged, `Inbox (3)` unchanged
Done: addition 11 — `src/tui/notify.ts` writes `\x07` and fires an unref'd `osascript` notification on darwin only; `n` appends a `cut/intro asks` question and calls it, listed only in the help overlay
Acceptance: `bun x tsc --noEmit` clean; `bun scripts/test.ts` exit 0, 12 cases, 0 failures; `bun src/cli.ts status /opt/ed/ivy` exit 0 — the whole `verify` recipe
Acceptance: frames regenerated at 140x42 into `/opt/ed/ivy/.factory/missions/2026-09-06-control/prototype/` — messages, parts, parts-pending, parts-confirm, mission, session, activity-full, help; every one reports the key bar on the last row and `bg none` or `#b8b8b8` only, help also `#0a0a0a` for its panel
Acceptance: pty smoke run (`python3 pty.fork`, 140x42, real `bun src/cli.ts control --fixture`) — 100 mixed keys including `f`, `?`, `z`, `t`, `n` twice, alive and drawing after the burst (`c` toast round trip 1.04 s), `q` exits 0 in 0.98 s, no entry added to `~/.factory/control.log`
Acceptance: `n` under the pty does not hang — round trip 1.52 s, `\x07` on the wire, toast `arrival cut/intro asks`, `Inbox (4)`, the `cut/intro asks` row appended at the foot; bare `osascript -e 'display notification …'` returns in 74 ms and no osascript process is left behind
Acceptance: last-row check automated — a headless sweep of every left row × plain/full/help/closed at 100x24, 200x60, 140x42 and 80x20 asserts exact row count, non-empty last row and blank first row; all pass
Acceptance: 1118 lines across `src/tui/` and `src/commands/control.ts`, fixture 226 — under 1150 and 300; only the allowed paths in the commit
Commands: `timeout 180 python3 /tmp/burst.py` exit 127 — macOS has no `timeout`, so the kill timer is a `waitpid(WNOHANG)` loop inside the driver instead
Issues: `scripts/test.ts` never shells out to the CLI and `scripts/e2e.sh` always passes a subcommand, so neither depended on bare `factory` opening the picker — no change needed there
Issues: at a 12-row terminal the centred help panel is taller than the screen and overflows the blank first row. Nothing else breaks and no review size is that small
Deviations: the Events block is gone from the MISSION detail pane, and `Mission.events` with it. ACTIVITY shows the same log in the shape the human asked for, and with the columns down to 24 rows the duplicate no longer fitted
Deviations: the help panel paints `#0a0a0a`. OpenTUI does not overwrite a cell with a space that has no background, so a transparent overlay let the rows underneath read straight through it — the frame proved it. This is the only fill besides the inverted row
Deviations: the unbound `quick` session's id changed from `8a9e6b42` to `b3f21c07`. It shared an id with the `auth` mission's session, which is contradictory data and would have merged their two activity logs into one
Deviations: `T Attention` is not in the key bar — the bar string in the brief has no `T` and the bar is already at 84 columns. It is in the help overlay under Mission
Deviations: `↵` while Activity is full brings the columns back rather than acting on the selection, so `f` is not the only way out of it
Faster: a scratch script outside the repo resolves `@opentui/core` to Bun's global cache while `src/tui` resolves it to `node_modules`, and the two copies fail every `instanceof` — `destroyRecursively` threw `remove expects a renderable child object`. Scratch harnesses have to sit in the repo root
Faster: `render()` now copies `r.root.getChildren()` before destroying. With the overlay the root has two children and `destroy()` splices the live array out from under the walk
```
