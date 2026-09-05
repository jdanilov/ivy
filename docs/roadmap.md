# Roadmap

A plain checklist of work the Factory has decided to do and not started. `/retro` appends to it,
a human prunes it, nothing else reads it.

- [ ] Mission Control: the OpenTUI screen over projects, missions and the Inbox (2026-09-05-refit)
- [ ] Mission Control shows the worktree a mission runs in (2026-09-05-refit)
- [ ] Mission Control shows whether caffeinate is on, from `~/.factory/caffeinate/<session>.pid` (2026-09-05-refit)
- [ ] `mission open --dry-run` promotes a stub before it prints: rename the flag or split the promote out (2026-09-05-refit)
- [ ] Memory: the `mem` MCP, per project and global notes, recall on prompt (2026-09-05-refit)
- [ ] Global parts: a part that installs into `~/.claude` instead of a project (2026-09-05-refit)
- [ ] Codex harness support: a second harness reading the same parts (2026-09-05-refit)
- [ ] Tokens per step: recorded in `state.json` and shown in `mission status` (2026-09-05-refit)
- [ ] `status` counts `skipIfExists` templates as installed when there is no manifest (2026-09-05-refit)
- [ ] `mission new` on a claimed checkout with no tty exits 0 having done nothing, it should refuse (2026-09-05-refit)
