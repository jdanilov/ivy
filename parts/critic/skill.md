---
name: critic
model: sonnet
description: ♻ Review the uncommitted diff with the Verifier and triage the findings
---

# Critic

Alias for the Verifier on the diff, with no contract behind it.

- Spawn `@Verifier` over `git diff` and `git diff --cached`. Do not review the code yourself.
- No Mission is bound here, so there is no `acceptance.md`: the quality baseline is the whole check
  and the findings come back in the sub-agent's final message.
- Nothing changed: say the tree is clean and stop.

Then think through what is worth doing. Gatekeepers over-report, so rank by blast radius, effort
and confidence, and present fix or skip per finding with a reason. Let the user confirm or pick
before you implement anything.

$ARGUMENTS
