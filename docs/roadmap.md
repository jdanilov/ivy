# Roadmap

What to work on next, in order, for the human choosing the next mission. Each line says what you
get, why it is worth it, and roughly how big it is. `/retro` appends under `## Unsorted`; a human
moves a line up into the order or drops it. Nothing else reads this file.

## Next

- [x] **A real mission through the new open.** `O` now starts the session under `claude --bg` and
  the tab attaches to it; that path has only run against the e2e stub. Open one mission for real:
  the hook binds it through the settings overlay, Warp shows the badge, a reply from the message
  box lands, `K` stops it. Half a day, and it retires the risk in everything shipped on 2026-09-08.
- [ ] **Session status from Claude Code's own records.** `~/.claude/sessions/<pid>.json` says
  `busy`, `idle` or `waiting`, and what for: `permission prompt`, `input needed`. Watching it
  replaces the hook-gap guesswork: a row reads `◈ waiting · permission prompt`, liveness stops
  being a pid walk, and sessions in projects without the hook still appear. A day.
- [ ] **`O` on a session row.** A background session whose tab was closed is one
  `claude attach <id>` away; the Inbox's "answer in tab" line could open it too. Hours.
- [ ] **Replies read as yours in ACTIVITY.** A message from the box arrives as a `user` row that
  starts with `From the user, via Mission Control:`. Strip the prefix and mark it `you`, so the
  log reads as a conversation. Hours.

## Then

- [ ] **New skills.** Add `/review` skill, which is similar to `/critic` - check out davidondrej's
  total-review. Add `guardrail-hook` / `global-agent-guardrails` (see the davidondrej/skills),
  or improve save-bash to avoid surprises from agentic harnesses. 
- [ ] **Memory.** The `mem` MCP: per project and global notes, recalled on prompt, seeded from
  `docs/memories.md`. The biggest item here and the one agents would feel most; its own mission.
  (2026-09-05-refit)
- [ ] **Overrule rate per agent.** The Summarizer writes it into `retro.md`, so decision confidence
  is measured before any prompt tuning or caps. A day. (2026-09-07-decisions)
- [ ] **Fresh-system install path.** The `factory` command shipped or documented instead of a hand
  `bun link`, README rewritten why-first for a human reader. Worth it the day the Factory goes on
  a second machine. A day. (2026-09-07-decisions)
- [ ] **Graph editing from the screen.** Toggle a mission's steps on and off in the MISSION pane,
  `validate` first. A few days; wait until the graph is edited by hand often enough to want it.
  (2026-09-07-decisions)

## Not doing

- **Codex and OhMyPi harnesses.** One harness. Revisit only if a second one is in daily use.
  (2026-09-05-refit, 2026-09-07-decisions)
- **tmux detached sessions.** Superseded: `claude --bg` detaches and `claude attach` shows the
  session in a Warp tab that keeps the badge, which tmux could not. Shipped 2026-09-08.
  (2026-09-07-decisions)

## Unsorted
