# Roadmap

A plain checklist of work the Factory has decided to do and not started. `/retro` appends to it,
a human prunes it, nothing else reads it.

- [ ] Memory: the `mem` MCP, per project and global notes, recall on prompt (2026-09-05-refit)
- [ ] Codex harness support: a second harness reading the same parts (2026-09-05-refit)
- [ ] Overrule rate per agent in `retro.md`, written by the Summarizer, so decision confidence is measured before any prompt tuning or caps (2026-09-07-decisions)
- [ ] Detached sessions: a mission's Claude Code process kept alive outside the Warp tab (tmux or similar) and re-attached from any tab, with Warp still seeing the session's status; research first (2026-09-07-decisions)
- [ ] OhMyPi harness: run the same parts under Pi, and its memory engine as the Memory candidate; hands-on test before any decision (2026-09-07-decisions)
- [ ] Install scope chosen per part by the user, `off | global | project`, instead of fixed in `part.yaml` (2026-09-07-decisions)
- [ ] Fresh-system install path: the `factory` command shipped or documented instead of a hand `bun link`, README rewritten why-first for a human reader (2026-09-07-decisions)
- [ ] Graph editing from the screen: toggle a mission's steps on and off in the MISSION pane, `validate` first (2026-09-07-decisions)
- [ ] Workflow presets reviewed for overlap: `fix` is `chore` plus a verifier loop, `quick` is `chore` without a gate; decide whether three become one with flags (2026-09-07-decisions)
