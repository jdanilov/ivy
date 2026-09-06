Committed. Final state verified: `tsc` clean, `scripts/test.ts` exit 0 (17 cases), `scripts/e2e.sh` exit 0, `factory status` 17 installed / 0 modified.

```
Step: implement (W2, write side and docs)
Done:
- /opt/ed/ivy/src/tui/actions.ts — every key's write side through the CLI's own functions: answerGate (gate() with cwd = project), openTab (sessionLive + loadPreset + openSession), killSession (pgrep -f -- "--session-id <id>", SIGTERM then SIGKILL inside 5 s), applyParts (install --parts + removeParts), setCaffeinate, setAttention. Console silenced while a command runs, each returns the toast line, a refusal throws.
- /opt/ed/ivy/src/core/parts.ts — removeParts(dir, names): uninit, unlink, hooks, mcp, settings, snippet, dropEmptied, manifest write-or-delete, dropCreated. /opt/ed/ivy/src/commands/uninstall.ts now prints around it instead of doing it.
- /opt/ed/ivy/src/core/config.ts — Caffeinate type, readCaffeinate (uncached) and writeCaffeinate (one line rewritten in place, so vars survive); live.ts reads through it, model.ts re-exports the type. One reader, not two.
- /opt/ed/ivy/src/tui/screen.ts — keys act: App {r, ui, snap} + draw(), toast re-renders from the current snapshot (W1's stale-toast issue), act() toasts start then outcome, amend/reject open an InputRenderable at the answer row with esc to cancel, `y` applies the pending part set, `c`/`t`/`o`/`x` call actions. A live rebuild does not redraw while the note is open, and `q` does not quit mid-note.
- /opt/ed/ivy/src/tui/notify.ts — inboxKey, arrivals(prev, next), and the Warp 777;notify sequence beside the bell; /opt/ed/ivy/src/commands/control.ts diffs the inbox at the startLive call site and notifies once per new key.
- /opt/ed/ivy/parts/hook-factory/hook-factory.ts — reads `caffeinate` from ~/.factory/config.yaml per event: off never starts, on starts at SessionStart and does not stop on Stop, auto unchanged.
- /opt/ed/ivy/src/tui/live.ts, model.ts — InboxItem carries the step an answer is recorded against.
- /opt/ed/ivy/scripts/test.ts — three cases: the hook's three caffeinate modes (fake caffeinate on PATH), `c` writing the mode and holding only its own pid, and arrivals.
- Docs: docs/design.md gained a Mission Control section (pane grid, semantic step colours, #3a3a3a rule, key bar and key table); docs/terminology.md rewrote Mission Control and Inbox and added Messages, Activity, Caffeinate; README gained `factory`, `factory menu` and a keys line; AGENTS.md lists src/tui/ and names caffeinate in the config.yaml line; docs/roadmap.md dropped the three Mission Control lines and the tokens-per-step line.

Acceptance:
- A-ACT-1 pass — ↵ on the gate wrote {status: answered, file: intent.md, answer: accept}, identical to `gate answer`; a second, different answer toasted "✗ gate grill was already answered accept at …" and the stored answer stayed accept.
- A-ACT-2 pass — amend drew "amend note" over the verdicts with a focused InputRenderable, typed text reached ui.note, esc left the gate open with nothing written, and a second pass recorded {answer: amend, note: "add the migration step"}.
- A-ACT-3 pass — `o` with no live session wrote state.session and ~/.warp/tab_configs/factory-alpha.toml; with a fresh events file it only toasted "factory-alpha is already open — switch to that tab" and the session id was unchanged.
- A-ACT-4 pass — against a script whose argv carries --session-id <id>: first press SIGTERM (process exited within 2 s), second within 5 s SIGKILL, an unknown id returned "no process for #…" and signalled nothing; process.pid is excluded from the pgrep hits.
- A-ACT-5 pass — toggling commit off and docs-format on then ↵,y removed .claude/skills/commit/skill.md and installed .claude/docs-format.md; `bun src/cli.ts status <dir>` afterwards read "1 installed, 0 modified, 16 available" with docs-format the only installed row.
- A-ACT-6 pass — scripts/test.ts case, scratch HOME with a fake caffeinate: `on` wrote caffeinate: "on" keeping vars and left a live pid in control.pid; `auto` killed control.pid only and left a session pid alone; `off` killed the session pid too and cleared the folder.
- A-ACT-7 pass — scripts/test.ts case: off started nothing on SessionStart or UserPromptSubmit; on started at SessionStart and still held after Stop; auto started on the prompt and let go on Stop.
- A-ACT-8 pass — `t` wrote attention: unattended and appended {what: "attention set to unattended", reason: "set from Mission Control"} to deviations.
- A-NTF-1 pass — arrivals(null, [a]) = [], arrivals([a], [a aged]) = [], arrivals([a], [a, b]) = [b]; control.ts seeds `seen` with the first snapshot and announces once per rebuild before apply.
- A-NTF-2 pass — notify() writes \x07 and \x1b]777;notify;Factory;<label>\x07 to stdout, then Bun.spawn(['osascript', …]).unref() behind a darwin guard, never awaited.
- A-DOC-1 pass — docs/design.md "Mission Control" carries the row-by-row pane grid, the semantic colour table (human #a8a968, gatekeeper #d7af5f, agent #6b8fd9, technical #6e6e6e), the #3a3a3a rule note and the key bar plus a key table; docs/terminology.md rows Mission Control, Inbox, Activity, Caffeinate describe the screen as built.
- A-DOC-2 pass — README rows `factory` and `factory menu` plus the keys paragraph; AGENTS.md src/ block lists tui/ and the ~/.factory line names `caffeinate: auto|on|off`; roadmap has neither Mission Control nor tokens-per-step lines.
- A-DOC-3 pass — src/tui/ plus src/commands/control.ts = 2011 lines of 2200; `bun x tsc --noEmit` exit 0; `bun scripts/test.ts` exit 0, 17 cases; `bash scripts/e2e.sh` exit 0 ("e2e: ok").

Deviations:
- readCaffeinate/writeCaffeinate live in src/core/config.ts rather than beside live.ts's copy: the file is the core's, and the writer belongs with the reader. model.ts re-exports the Caffeinate type so the TUI still names it once.
- `o` uses the orchestrator preset, the one `mission open` defaults to; state.json records no preset of its own.
- `c off` kills the hook's session pids as well as control.pid, per the spec's "kill every pid in that folder"; OFF would otherwise not read as off until every session ended.
- design.md documents the four-kind colour scheme from the spec's W3 section; theme.ts still carries the prototype's three, which is W3's change.

Issues:
- Bun's os.homedir() is fixed at process start, so scripts/test.ts's `process.env.HOME` does not redirect FACTORY_HOME for in-process code — the existing in-process cases append scratch paths to the real ~/.factory/projects. My caffeinate case runs as a child with HOME in its env for that reason. Worth a roadmap line.
- pgrep -f matches any process whose command line contains "--session-id <id>", a shell that spawned claude included; the id keeps it off anything unrelated, but a kill can hit two pids.
- docs/factory-transcript.txt, docs/function-hooks-transcript.txt, docs/graph-engineering-transcript.txt and docs/screenshots/*.png were staged-but-uncommitted at mission start and are absent from disk and index now; nothing in this step touched them, and git fsck still lists dangling blobs.

Faster:
- The action loop is the test renderer plus onKey: render(app.r, app.snap, ui) + renderOnce() + captureCharFrame() for the look, and the InputRenderable found by walking renderer.root and driven with insertText() for the note.
- A victim process for `x` must be a script (#!/bin/sh + sleep), not `sh -c 'sleep 60' --session-id X`: sh execs a lone command away and the argv pgrep needs goes with it.
```
