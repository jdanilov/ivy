Validation complete. Every `validate` assertion was driven against the real CLI in temp repos with a scratch `HOME`; `/opt/ed/ivy` and `/opt/ed/igs` were not written to (the only change in the repo is `findings-validate.md`).

Evidence file: `/opt/ed/ivy/.factory/missions/2026-09-05-refit/findings-validate.md`

Eight findings, the two that matter:

**F1 (wide, S, high) — `mission close` is blocked by the Factory's own claim file.** On a clean temp repo:

```
$ bun src/cli.ts mission close demo
   ✗ dirty outside the mission folder, commit or stash first: .factory/claim
```

`mission open` writes `.factory/claim`, then `mission close` counts it as a dirty file outside the mission folder and refuses. No part ships a `.gitignore` line for it; `/opt/ed/ivy` only works because its `.gitignore` was hand-edited. A-CLS-1 passes only after adding `.factory/claim` to the project's `.gitignore` by hand. On a fresh project the mission flow cannot be closed.

**F2 (wide, M, high) — snippet dedupe is exact-string, so real projects get duplicate lines.** igs `agents.md` `## Important Files` now reads:

```
- Terminology: `docs/terminology.md`
- Roadmap: `docs/roadmap.md`
- Finished tasks: `docs/finished-tasks.md`
- Unit reference example: `inssist-ext/imports/gen/`
- Docs format: @.claude/docs-format.md
- Terminology: @docs/terminology.md
- Roadmap: @docs/roadmap.md
```

Two files listed twice each, in two notations. Any project that already documents its important files hits this on first install.

Also: F3 — `handoffs/W5.md` has no `Acceptance:` line at all, so A-DOG-1/A-DOG-2's verdicts exist only as prose. F4 — `--skip` is wired only to `update` (`src/cli.ts:38-58`); `install --skip …` accepts and silently ignores it, and `AGENTS.md:97` documents it for all four commands. F5, F6, F7, F8 are narrow.

```
Step: accept
Done: Drove all 17 validate-kind assertions through the real CLI — pty-driven `install`/`uninstall`, `update`, `status`, `mission`/`step`/`gate`/`handoff` — in temp repos under /tmp with HOME=/tmp/valhome.MMhr
Done: Built a second checkout at /tmp/ivyco with three throwaway recipe parts for A-RCP-1 and A-RCP-3, so /opt/ed/ivy's registry was never touched
Done: Verified A-DOG-1 by reading /opt/ed/igs state plus handoffs/W5.md, and A-HND-2 by reading W5.md and W6.md; no update run on igs, nothing changed there
Done: Wrote /opt/ed/ivy/.factory/missions/2026-09-05-refit/findings-validate.md — per-assertion evidence table, eight ranked findings, one tooling paragraph
Acceptance: A-SNP-1 pass, A-SNP-2 pass, A-SNP-3 pass, A-RCP-1 pass, A-RCP-3 pass, A-VAR-2 pass, A-STB-1 pass, A-STB-2 pass, A-STB-3 pass, A-CLS-1 pass, A-CLS-2 pass, A-PRT-5 pass, A-CG-1 pass, A-CG-2 pass, A-ARC-2 pass, A-DOG-1 pass, A-HND-2 pass, A-RET-4 unchecked
Commands: `bun src/cli.ts mission close demo` in /tmp/stb1 -> 1, `✗ dirty outside the mission folder, commit or stash first: .factory/claim` — decided F1, the Factory's own claim file blocks close on any project that does not gitignore it
Commands: `bun src/cli.ts update /tmp/rcp1` -> 1, `✗ rcpfail init: exit 3 -> 3` — the exit code for A-RCP-1, which the pty masks on install
Commands: pty `install /tmp/snp1.89243 --skip <15 parts>` -> 0 but installed all 13 defaults — decided F4, `--skip` is update-only
Issues: A-CLS-1 passes only after `.factory/claim` is added to the project `.gitignore`; recorded as pass with the precondition named, since the close mechanics themselves are correct
Issues: A-DOG-1 passes on the Orchestrator's amended wording — igs owns `docs/roadmap.md`, so the template was correctly not created, and the `codegraph` conflict row is the expected one
Issues: `parts/zz-scratch/` (W1 leftover, untracked) was in the registry when this round started and vanished mid-run; untracked scratch parts are invisible to the Verifier's diff but live in every install menu
Deviations: A-SNP-1's isolated single-part case used `update` with a seeded manifest, since `install` cannot be narrowed to one part without a pty dance; the full pty `install` case is recorded alongside it
Deviations: A-FH-2 was run against a mirror of the refit mission in /tmp/fh2 rather than /opt/ed/ivy, because `mission open --dry-run` rewrites `.factory/claim` and would have disturbed the live orchestrator session
Faster: a `.factory/factory.yaml` with `e2e.ready` walking `mission new --stub` -> `open --dry-run` -> `step` -> `close` in a throwaway repo would have caught F1 on the first run, and a `--yes` flag on `install`/`uninstall` would replace every pty and arrow-key sequence in this round
```
