# Decisions

| id | step | by | confidence | summary | status | note |
|----|------|----|------------|---------|--------|------|
| D1 | implement | worker | MEDIUM | an `auto` row is still answerable, so a human reading the table late can overrule a fork the dial let through; only `accepted` and `overruled` are final | auto |  |
| D2 | implement | worker | MEDIUM | the skill's Triage section folded into Decisions rather than shrinking the Graph or CLI blocks, keeping the ranking and findings.md rules at the cost of the heading | auto |  |
| D3 | implement | worker | MEDIUM | `decision list` is mission-scoped, unlike `gate list` which walks every project — Mission Control owns the cross-project view and answers nothing | auto |  |
| D4 | implement | worker | LOW | the hook appends rows verbatim instead of reparsing and rewriting the table, so a row it half-understands can never be lost | accepted |  |
| D5 | implement | worker | LOW | several waiting decisions join with `; ` in the injected text, which reproduces the spec's one-row example exactly | accepted |  |
| D6 | implement | worker | LOW | `answerDecision` returns `{ decision, changed }` so the command can print the dim no-op line the way `gate answer` does | accepted |  |
| D7 | implement | worker | LOW | the Worker prompt lost two lines (goal merged with the reading order, the pre-handoff run became a Guardrails bullet) to hold the under-40 cap with the longer optional-fields line | accepted |  |
| D8 | implement | worker | MEDIUM | reverted the earlier W3's hardcoded `/tmp` in `scripts/test.ts` and `scripts/e2e.sh` to `tmpdir()` and a plain `mktemp -d`, so `TMPDIR` steers both; a caller with a slow temp folder can point the run somewhere small, which a hardcoded path takes away | auto |  |
| D9 | implement | worker | MEDIUM | every CLI call in `e2e.sh` reads stdin from `/dev/null`; without it the no-tty refusal never fires when the script is run from a terminal, and the case silently passes on a prompt | auto |  |
| D10 | implement | worker | MEDIUM | no shipped part adopts the new directory `source`. `hook-factory`'s `sounds/` was the obvious candidate, but a stray `.DS_Store` would then be linked into every project's `.claude/`; the feature is covered by a scratch part instead | auto |  |
| D11 | implement | worker | MEDIUM | the global-install collision is checked against `existingProjects()` manifests at install time rather than recorded anywhere, so a project whose path is gone cannot block the user's own parts | auto |  |
| D12 | implement | worker | LOW | `install` reports the hook file it actually wrote (`printHookInfo(hooksFileName(dir))`) instead of the hardcoded `settings.local.json`, so a global install does not claim a file that does not exist | accepted |  |
| D13 | implement | worker | LOW | README names the five global parts in a sentence under the parts table rather than gaining a Scope column, which would have re-wrapped every row for one bit of information | accepted |  |
