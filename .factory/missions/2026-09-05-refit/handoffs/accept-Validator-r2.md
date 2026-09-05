Round 2 driven, findings appended to `/opt/ed/ivy/.factory/missions/2026-09-05-refit/findings-validate.md` under `## r2 Validator`.

Two of three pass. **A-R2-3 fails on its README half.** The roadmap half is fine — R1-3 and R1-5 are both on `/opt/ed/ivy/docs/roadmap.md`. But `awk 'length>120' README.md | wc -l` returns 21: lines 34-54, the Commands table, all 127 chars. The handoff declared this a deviation on the grounds that "a markdown table row cannot wrap", which is true but not the issue — the table is over-padded, not too wide. Widest cells are 38 (`` `step add <step> --after X --reason R` ``) and 72 (`Create the mission folder, workflow copy, `state.json`, branch and claim`), so a tight row is `2+38+3+72+2` = 117. Repadding the table clears the assertion with no wording change.

R1-1 and R1-4 are genuinely fixed, and fixed conservatively. I closed missions in both orders, with one mission in a worktree and with both in worktrees (the exact pair that deadlocked in round 1) — every close exit 0, tree clean, and the refusal still fires on real dirt outside `.factory/`. The uninstall deletes are conditional: a hand-written `AGENTS.md`, a human-appended section on a factory-created one, and a foreign file in a factory-created `.claude/` all survive byte-identical, and the backticked-terminology snippet round trip still `cmp`s silent.

Two smaller things outside the contract: uninstall still leaves a `docs/` it created (`?? docs/` in a repo that had none — the same argument that just retired the 0-byte `AGENTS.md`), and `mission close` leaves `mission/p1`, `mission/p2` branches behind after removing their worktrees.

Tooling: there is still no `e2e.ready` recipe in `/opt/ed/ivy/.factory/factory.yaml`, so I substituted `bun src/cli.ts status /opt/ed/ivy` as the reachability probe by hand for the second round running. Add `ready: ["bun src/cli.ts status ."]` beside `verify` and `e2e` — it is the one line that turns "is this drivable" into a recipe instead of a Validator's judgement call. The gap that cost real time this round is different: `scripts/e2e.sh` covers install/mission/uninstall on a single-mission repo, so nothing in the suite would have caught R1-1. A second block in `e2e.sh` that opens two missions with `--worktree` and closes them in both orders is about fifteen lines and pins the exact deadlock this round fixed.

```
Step: accept-r2
Done: A-R2-1 driven in four temp repos, both close orders, one-in-worktree and both-in-worktree, plus the dirty-outside-.factory refusal
Done: A-R2-2 driven in a bare repo plus three counter-cases (project-owned AGENTS.md and .claude/mine.json, human-appended section, foreign file added post-install)
Done: R1-4 snippet regression, hand-written backticked docs/terminology.md, cmp silent after uninstall
Done: scripts/e2e.sh run once, exit 0
Done: A-R2-3 measured, roadmap half passes, README half fails at 21 lines of 127 chars
Done: findings appended to /opt/ed/ivy/.factory/missions/2026-09-05-refit/findings-validate.md
Acceptance: A-R2-1 pass, A-R2-2 pass, A-R2-3 fail
Commands: `awk 'length>120' /opt/ed/ivy/README.md | wc -l` -> 21, decides A-R2-3 fail; `mission close d1` -> exit 1, the intended refusal on file.txt and stray.txt
Issues: uninstall leaves a docs/ it created (?? docs/ in a repo that had none); mission close leaves mission/<name> branches after removing their worktrees
Faster: add `ready:` to .factory/factory.yaml, and a two-mission worktree block to scripts/e2e.sh — the suite as it stands could not have caught R1-1
```
