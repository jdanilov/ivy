# Roadmap

A plain checklist of work the Factory has decided to do and not started. `/retro` appends to it,
a human prunes it, nothing else reads it.

- [ ] Memory: the `mem` MCP, per project and global notes, recall on prompt (2026-09-05-refit)
- [ ] Codex harness support: a second harness reading the same parts (2026-09-05-refit)
- [ ] Overrule rate per agent in `retro.md`, written by the Summarizer, so decision confidence is measured before any prompt tuning or caps (2026-09-07-decisions)
- [ ] Detached sessions: `mission open --detached` starts `tmux new -d -s factory-<mission> 'claude …'` and the tab config attaches; needs `allow-passthrough on` and extended keys in tmux for Warp's agent badge and our OSC 777 notify; costs Warp's block scrollback and input editor in that tab (2026-09-07-decisions)
- [ ] OhMyPi harness: `omp` reads an existing `.claude/` tree, so parts need no second format; its per-project SQLite memory backend is the Memory candidate; the human runs the five-step scratch test first, then decide against the `mem` MCP line (2026-09-07-decisions)
- [ ] Install scope chosen per part by the user, `off | global | project`, instead of fixed in `part.yaml` (2026-09-07-decisions)
- [ ] Fresh-system install path: the `factory` command shipped or documented instead of a hand `bun link`, README rewritten why-first for a human reader (2026-09-07-decisions)
- [ ] Graph editing from the screen: toggle a mission's steps on and off in the MISSION pane, `validate` first (2026-09-07-decisions)
- [ ] Workflows: keep `story`, `research` and `quick`; drop `fix`; `chore` takes `--verify`, which adds the verifier loop after implement. `intent` stays the start of every shaped mission (2026-09-07-decisions)
