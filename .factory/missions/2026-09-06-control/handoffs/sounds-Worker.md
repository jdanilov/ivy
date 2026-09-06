Step: sounds
Done: `parts/hook-factory/sounds/sonar-deep.mp3` copied byte for byte from `/opt/ed/bloom/.claude/sounds/sonar-deep.mp3` (md5 `3157ced72c7190dfb005ee57ad0fe227`), targeted at `.claude/sounds/sonar-deep.mp3` in `part.yaml` files, the shape taken from the other fixture rows
Done: `part.yaml` gains `vars.sound` and `vars.quiet`, hook command is now `SOUND="${sound}" QUIET="${quiet}" bun $CLAUDE_PROJECT_DIR/.claude/scripts/hook-factory.ts ${event}`, description mentions the ring
Done: `hook-factory.ts` gains a `sound` section next to `caffeinate`: `soundFile()` (`off`/empty is silence, a bare name is `/System/Library/Sounds/<name>.aiff`, otherwise a path), `turnSeconds()` over the session's own events file, `waitsOnHuman()` for the table, and `ring()` spawning `afplay` with stdio ignored and `unref()`, never awaited
Done: `ring` is called from `main` as `await ring(...).catch(() => {})` before the `if (!mission) return` guard, so a session with no mission still rings and a throw cannot fail the hook or skip the mission steps; `stop_hook_active` added to `HookInput`
Done: one case in `scripts/test.ts` with a fake `afplay` first on a scratch `PATH`, proving 40 s Stop rings, 5 s Stop does not, `permission_prompt` rings, `SubagentStop` does not, `SOUND=off` does not
Done: README hook-factory row and the AGENTS.md `~/.factory/config.yaml` sentence name `sound` and `quiet`
Done: committed `b3cd239 ✨ feat: ring the sonar when a session waits on the human` on `mission/control`, `git commit -- parts/hook-factory scripts/test.ts README.md AGENTS.md`

Acceptance (no `acceptance.md` exists for this mission, so these are the task's own checks):
- ring table proven by test: pass — `✓ the hook rings only when the parent session waits on the human`, `bun scripts/test.ts` 12 cases, 0 failures
- `bun x tsc --noEmit`: pass, clean
- `bash scripts/e2e.sh`: pass, exit 0
- `bun src/cli.ts update /opt/ed/ivy`: pass — `0 installed, 3 relinked, 0 removed`; `status /opt/ed/ivy` shows `hook-factory fixture ● installed .claude/scripts/hook-factory.ts` + `.claude/sounds/sonar-deep.mp3`, totals `17 installed, 0 modified, 0 available`
- `bun src/cli.ts update /opt/ed/igs`: pass — `0 installed, 13 relinked, 0 removed`; `status /opt/ed/igs` shows the same two hook-factory files, totals `13 installed, 0 modified, 1 available, 2 skipped`
- settings as written: pass — `/opt/ed/ivy/.claude/settings.local.json` Stop hook is `SOUND="$CLAUDE_PROJECT_DIR/.claude/sounds/sonar-deep.mp3" QUIET="30" bun $CLAUDE_PROJECT_DIR/.claude/scripts/hook-factory.ts Stop`, i.e. the Factory vars substituted and `$CLAUDE_PROJECT_DIR` left for the shell; the manifest holds the same seven resolved commands
- the sound plays: pass — one `afplay /opt/ed/ivy/.claude/sounds/sonar-deep.mp3`, exit 0, played once at the end

Issues: `/opt/ed/igs` is left dirty on purpose (`.claude/.factory-manifest.json` modified, `.claude/sounds/` untracked) — the human commits there.

Deviations: `ring` sits before the `if (!mission) return` guard rather than beside the caffeinate calls inside it. Waiting on the human is a property of the session, not of a mission, and a non-mission session must ring too; the code still lives in a `sound` section next to `caffeinate`.
