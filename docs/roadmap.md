# Roadmap

A plain checklist of work the Factory has decided to do and not started. `/retro` appends to it,
a human prunes it, nothing else reads it.

- [ ] `mission open --dry-run` promotes a stub before it prints: rename the flag or split the promote out (2026-09-05-refit)
- [ ] Memory: the `mem` MCP, per project and global notes, recall on prompt (2026-09-05-refit)
- [ ] Global parts: a part that installs into `~/.claude` instead of a project (2026-09-05-refit)
- [ ] Codex harness support: a second harness reading the same parts (2026-09-05-refit)
- [ ] `status` counts `skipIfExists` templates as installed when there is no manifest (2026-09-05-refit)
- [ ] `mission new` on a claimed checkout with no tty exits 0 having done nothing, it should refuse (2026-09-05-refit)
- [ ] `uninstall` leaves behind a `docs/` it created (2026-09-05-refit)
- [ ] Directory `source` in a part's `files[]`, for vendors too large to list file by file (2026-09-05-refit)
- [ ] `step add --after X` when X is done and the pointer sits on the next pending step: the pointer should move to the new step (2026-09-06-control)
- [ ] `scripts/test.ts` in-process cases write scratch paths into the real `~/.factory/projects`: Bun fixes `os.homedir()` at start, so `FACTORY_HOME` must read `HOME` lazily or the cases must run as children (2026-09-06-control)
- [ ] `failed` step state: nothing sets it; add `factory step fail <step> --reason` or drop it from `RunState` (2026-09-06-control)
- [ ] `gate|step|mission` resolve from cwd, so a scratch HOME does not sandbox them; refuse when the resolved project is not in `$HOME/.factory/projects` (2026-09-06-control)
