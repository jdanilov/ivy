# Memory candidates: Factory refit

Proposed only, human confirms before saving.

- Harness: agent frontmatter `model:` is not honoured by the Agent tool in this session — the spawning session must pass `model` explicitly per role on every spawn. Applies to any mission using sub-agents.
- Harness: `@clack/prompts` menus (Factory's `install`/`uninstall`) cannot be driven by a plain pipe; before `--yes` existed the only way was a pty (`script -q /dev/null` plus timed keystrokes). Applies to Factory CLI testing.
- Project (ivy): `git()` in `src/core/mission.ts` trims stdout, which eats the leading status column of `git status --porcelain`; use `git diff --name-only` plus `git ls-files --others --exclude-standard` instead. Applies to any new caller parsing git output in this repo.
- Project (ivy): a Factory-written file living inside a tracked project root (`.factory/claim`) must be gitignored by the part/command that creates it, or `mission close`'s dirty scan deadlocks on the Factory's own artifact. Applies when adding any new Factory-written path.
- Harness: `mission new` without `open` in the same step leaves `session: null`, so `SubagentStop` cannot save a handoff until `mission adopt` binds one by hand. Applies to any mission started non-interactively.
- Workflow: acceptance assertions should state invariants, not pin exact counts, byte widths or created-file names — real project state and formatting legitimately vary and forced two live amendments this mission (A-DOG-1, A-R2-3). Applies to writing `acceptance.md` in any mission.
