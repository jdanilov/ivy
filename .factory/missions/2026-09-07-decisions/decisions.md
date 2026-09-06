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
