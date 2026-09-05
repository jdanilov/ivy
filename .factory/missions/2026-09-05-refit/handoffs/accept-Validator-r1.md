Validation done. `bash scripts/e2e.sh` -> exit 0 (`e2e: ok`), and all five owned assertions pass. Evidence appended to `/opt/ed/ivy/.factory/missions/2026-09-05-refit/findings-validate.md` under `## r1 Validator`.

Key results:

- **F1 rerun exactly**: `/tmp/r1f1`, fresh repo, no `.gitignore`. `mission new` committed `🧹 chore: ignore .factory/claim` containing **only** `.gitignore` (`1 file changed, 1 insertion(+)`), and `mission close demo` returned 0 with a clean tree — round 0's blocker is gone.
- **F2**: replacement is in place and reversible. The manifest records `replaced: "- Terminology: \`docs/terminology.md\`"`, `cmp` after uninstall is silent, and a second `install` plus `update` leaves the file byte-stable.
- **F5**: `.mcp.json`, `settings.json`, `settings.local.json` are all deleted when emptied, verified with codegraph itself (the exact round 0 case).
- **T1**: no pty anywhere this round; `--yes` installs exactly the 14 `default: true` parts and keeps an already-installed non-default one.

Five new findings, ranked. The one that matters: **two missions in parallel worktrees can never close** — each mission's untracked folder is "dirty outside the mission folder" to the other, so `close p1` names p2's `state.json`/`workflow.yaml` and vice versa. Deleting p2's folder let p1 close instantly, which pins the cause. The claim is correctly absent from both lists, so it is not F1 returning — it is the same dirty scan needing `.factory/missions/*` treated the way `.factory/claim` now is. Wide, M, high.

The other four are narrow: `mission new` appending its line to an already-dirty `.gitignore` and `close` then refusing on that file; `status` reporting `2 installed` after a full uninstall (skipIfExists templates seen by the scanner with no manifest); uninstall leaving a 0-byte `AGENTS.md` it created plus an empty `.claude/`; `mission new` on a claimed checkout with no tty exiting 0 having done nothing.

```
Step: accept-r1 (Validator)
Done: ran the e2e recipe once, exit 0
Done: A-R1-1 rerun of the round 0 F1 scenario, close succeeds, ignore commit holds only .gitignore
Done: A-R1-2 snippet replace in place and restore on uninstall, plus an idempotency pass
Done: A-R1-3 no empty settings or mcp file left, checked with codegraph and a scratch mcp part
Done: A-R1-4 install --yes and uninstall --yes, no tty, exit 0, 14 defaults
Done: A-R1-9 roadmap snippet backticked, one Roadmap line and three @ lines in ivy and igs
Done: five findings appended to findings-validate.md, ranked, plus the tooling paragraph
Acceptance: A-R1-1 pass, A-R1-2 pass, A-R1-3 pass, A-R1-4 pass, A-R1-9 pass
Commands: bash scripts/e2e.sh -> 0; mission close p1 in a parallel worktree -> 1 (finding R1-1); mission close b with a dirty .gitignore -> 1 (finding R1-2)
Deviations: no e2e.ready recipe exists, so the CLI in temp repos was the driver, as in round 0
Deviations: a clone at /tmp/ivyco2 carried a scratch mcp part and codegraph flipped to default true, the only way --yes can reach a non-default part; product code untouched
Faster: a --parts a,b flag on install would remove the need for that clone and let scripts/e2e.sh cover the mcp and recipe paths
```
