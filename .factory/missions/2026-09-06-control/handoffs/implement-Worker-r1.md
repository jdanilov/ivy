All eight fixes are in, verified, and committed on `mission/control` as `1e142e5`.

Key files: `/opt/ed/ivy/parts/hook-factory/hook-factory.ts`, `/opt/ed/ivy/src/core/linker.ts`, `/opt/ed/ivy/src/tui/screen.ts`, `/opt/ed/ivy/src/tui/model.ts`, `/opt/ed/ivy/src/tui/fixture.ts`, `/opt/ed/ivy/scripts/test.ts`, `/opt/ed/ivy/README.md`, `/opt/ed/ivy/AGENTS.md`, `/opt/ed/ivy/.factory/missions/2026-09-06-control/prototype/`.

Step: implement
Done: F1 `freeName()` in hook-factory no longer compares lengths — an existing non-empty handoff is never overwritten, the next free `-N` takes the save; the under-five-lines skip is unchanged and the AGENTS.md invariant sentence rewritten to match
Done: F2 `missionPane()` prints a duration only for running and done steps; skipped, failed, blocked and pending print their status word
Done: F3 `missionBar()` drops the `[+N]` bracket, `done/total` only; the `queued` count is gone with it
Done: F4 `linkPart()` computes the relative symlink target from `realpath` of the link's own directory, so a project reached through a symlink gets links that resolve; `scanProject` needed no change, it reads the links
Done: F5 `record()` marks the MESSAGES row answered inside the action's success continuation, so a refusal leaves the row `⊘` and the toast carries the refusal text
Done: F6 README command table gains a `factory --fixture`, `factory --frames <dir>` row; the duplicate prose sentence below the table removed
Done: F7 a project with no missions draws `no missions · factory mission new <name>` under its heading, an empty projects list draws `no projects · factory install <path>` under PROJECTS, both dim
Done: V3 `EventRow.mark` deleted from `model.ts` and its one write in `fixture.ts`
Done: new `scripts/test.ts` case "a handoff never overwrites the one before it" (18 cases now), fixture frames regenerated
Acceptance: A-R1-1 pass — new test case fires three `SubagentStop` hooks (12, 6, then 20 lines) into a scratch mission: `implement-Worker.md` holds W1, `-2` W2, `-3` W3, and a two-line sign-off writes no `-4`
Acceptance: A-R1-2 pass — `bun src/cli.ts --frames` against the real HOME renders the `control` mission's row as `· research   skipped`, where the finding recorded `0s`
Acceptance: A-R1-3 pass — same frame's status bar reads `● RUNNING  ████…  5/12   attention light`; `grep -c "\[+"` over every live frame and every fixture frame finds nothing
Acceptance: A-R1-4 pass — `install --parts commit` into `/tmp/f4proj.*` left `skill.md` resolving to `/opt/ed/ivy/parts/commit/skill.md` and `status` read `1 installed, 0 modified`; `update` then read `14 installed, 0 modified` with no dangling link, and `uninstall --yes` removed 14 parts leaving no `.claude`
Acceptance: A-R1-5 pass — scratch world, CLI recorded `amend --note "cli first"` behind the screen's snapshot, then `↵ accept` under `keys.ts` left `MESSAGES (2)` with the row still `⊘` and the status bar reading `✗ gate merge was already answered amend at … — "cli first"`; `state.json` still `amend`. A successful `accept` on a fresh world still flips the row to `✓ … answered` and `MESSAGES (1)`
Acceptance: A-R1-6 pass — `README.md:38` `| factory --fixture, factory --frames <dir> | Draw the demo snapshot; write the screen as text and exit, with no terminal |`
Acceptance: A-R1-7 pass — real-HOME frames show `no missions · factory mission new <name>` under `igs`, `dungeonloom` and `cut`; a fresh `/private/tmp` HOME renders `no projects · factory install <path>` under PROJECTS, exit 0
Acceptance: A-R1-8 pass — `grep -rn "\.mark\b|mark?:" src/ scripts/ .factory/validator/` returns nothing

Commands: none failed. `bun x tsc --noEmit` 0, `bun scripts/test.ts` 0 with 18/18, `bash scripts/e2e.sh` 0 (`e2e: ok`), `bun src/cli.ts status /opt/ed/ivy` 0 with `17 installed, 0 modified`.

Deviations: the README already carried a prose sentence naming both flags below the keys line; rather than say it twice I moved it into the table row F6 asked for and dropped the sentence. Same file, same fix, one line net.

Issues: the fixture frames' ACTIVITY timestamps are computed from `Date.now()` at generation time, so every regeneration rewrites those rows even when nothing about the screen changed — most of the 83-line frame diff in this commit is that clock, not the fixes. A fixed epoch in `fixture.ts` would make the frames a real diff to review.
