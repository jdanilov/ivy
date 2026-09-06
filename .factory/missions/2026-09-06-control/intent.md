# Mission Control

## Why

Working several missions in parallel is a backlog of Warp tabs waiting for input. Reading each
tab's scrollback to learn where it stands costs more attention than the missions do. One screen
that shows every project, every mission, what each is waiting on, and lets the human answer a
gate without switching tabs, makes the backlog readable in one glance.

## Goal

A Bun TUI on OpenTUI, `factory control`, one screen, three right-pane modes. Look and feel from
Droid's Mission Control as captured in `docs/design.md`: dark ground, one orange accent, dim labels
and bright values, glyph status column, inverted selected row, relative timestamps, key bar.

| Region     | Content                                                                                   |
|------------|-------------------------------------------------------------------------------------------|
| Header     | `● Factory`, selected mission and workflow, TIME · Input · Cached · Output right-aligned    |
| Status bar | state glyph and word, step progress bar, `done/total`, round, waiting count               |
| Left       | projects as headings, missions under them: glyph, name, workflow, step, round, wall time, tokens; dim second line for worktree and caffeinate; unbound sessions by cwd; stubs and closed dim |
| Right      | one of three modes on `tab`: Inbox, Mission, Parts. Each is a list above a detail block.   |
| Key bar    | bright key, dim label, the actions of the focused pane                                     |

Inbox: open gates from every `state.json`, orchestrator questions from the last `Notification` or
`Stop` event with no later `UserPromptSubmit`, triage plans for rounds routed to the human. A gate
answers in place through `factory gate answer`. Free text jumps to the tab where Warp allows it.

Mission: the selected mission's steps as a vertical graph coloured by meaning: gates yellow,
implement blue, gatekeepers cyan, done olive, current orange, skipped dim. Below it the current
step's role and round, worktree, branch, session, deviations, per-step wall time, and the
session's event log in Droid's Progress Log shape. Tokens per step once `state.json` carries them.

Parts: the `status` table for the selected project, space toggles, enter applies through the
existing install and uninstall paths.

## Done

- [ ] Prototype on a fake data fixture reviewed by the human before any wiring.
- [ ] `factory control` reads `~/.factory/projects`, every `.factory/missions/*/state.json`,
      `~/.factory/events`, `~/.factory/caffeinate` and the part manifests. No daemon. Watches the
      folders, polls every 2s as fallback.
- [ ] A gate answered in Mission Control lands in `state.json` exactly as `factory gate answer` would.
- [ ] Open tab, adopt and kill act on the selected mission or session.
- [ ] `docs/design.md` gains what the screen decided: pane grid, semantic step colours, key bar.

## Guardrails

- `@opentui/core` only, imperative, no JSX toolchain. One `render(state)` over a small tree.
- The TUI reads what the CLI writes and writes through the CLI's own core functions. No second
  state model.
- No new event kinds, no plugin, no function hooks.
- Under 800 lines in `src/tui/` at the end of the mission.

## Out of scope

Mission creation from the screen. Separate Sessions or Projects screens. Telegram or any bridge.
Tokens per step in `state.json` is its own roadmap line, the screen shows what exists.

## Open

- Warp has no documented URI to focus an existing tab. Prototype tries `warp://` actions, else the
  row shows the tab name for Warp's tab search.
- Per-session token totals may be summed from the Claude Code transcript under `~/.claude/projects/`
  until `state.json` records them.
