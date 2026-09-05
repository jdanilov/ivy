# Findings: refit

Triage by the Orchestrator, light attention, round 0 decided without the human. Evidence in `findings-verify.md` and `findings-validate.md`. Contract: 43 pass, 1 unchecked (A-RET-4, the human's), 0 fail.

## Round 0 triage

| # | Source | Finding | Blast | Effort | Decision |
|---|--------|---------|-------|--------|----------|
| F1 | Validator | `mission close` refuses on its own `.factory/claim` when the project does not ignore it | wide | S | fix: dirty check ignores `.factory/claim`; `mission new` and `open` add the ignore line when `git check-ignore` says it is tracked |
| F2 | Validator | Snippet dedupe is exact-line, projects that list the same path get duplicates | wide | M | fix: a line in the section that already names the snippet's path is replaced by the snippet line, original kept in the manifest and restored on uninstall |
| V1 | Verifier | `update.ts` repeats resolve, link, inject, snippet, init in two loops | narrow | S | fix: one helper |
| F4 | Validator | `--skip` only wired to `update`, `AGENTS.md` claims all four commands | narrow | S | fix the doc line |
| F5 | Validator | `uninstall` leaves `{}` settings files and `{"mcpServers":{}}` | narrow | S | fix: delete a settings or mcp file the uninstall emptied |
| F6 | Validator, W6 | archify clone lands in tracked `.claude/` on projects like igs | narrow | S | fix: init recipe adds `.claude/skills/archify/` to `.gitignore` unless already ignored |
| T1 | Validator, W1, W2, W3, W5 | No `verify` or `e2e` recipe in ivy; `install` and `uninstall` need a pty | wide | S | fix: `.factory/factory.yaml` with `verify` and `e2e`, `--yes` on install and uninstall |
| F3 | Validator | W5 handoff has no `Acceptance` line | narrow | S | skip: prose carries the verdicts, the rewritten Worker prompt already mandates the line |
| F7 | Validator | `mission open --dry-run` on a stub promotes it | narrow | S | skip: A-STB-3 pins it, dry-run is about the spawn; retro note |
| F8 | Validator | untracked scratch parts show in every install menu while a step runs | narrow | S | skip: habit, in the Worker notes |
| O1 | Orchestrator | `Validator.md` color flipped to yellow mid-round by nobody who admits it | narrow | S | reverted |

## Round 1 additions from the human

| # | Item | Decision |
|---|------|----------|
| H1 | `code-format` part: SoC, KISS, DRY, one-line comments, few lines, snippet | fix in round 1 |
| H2 | Mission Control shows the worktree a mission runs in and whether caffeinate is on | `docs/roadmap.md` |
