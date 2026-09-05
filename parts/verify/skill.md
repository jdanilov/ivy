---
name: verify
model: sonnet
description: ♻ Run the Verifier over the diff against the mission contract
---

# Verify

Spawn `@Verifier` over the uncommitted diff. Do not review the code yourself.

- Bound Mission (`FACTORY_MISSION`, or the folder named in `$ARGUMENTS`): pass the Mission folder.
  The Verifier checks every `acceptance.md` assertion of kind `verify` and appends its findings to
  `<mission>/findings.md`.
- No Mission: the diff alone against the quality baseline. The Verifier reports in its final message.

Then triage: rank by blast radius, effort and confidence, propose fix or skip per finding with a
reason. Skip is the default for anything outside the contract. Present one plan, not one item per
finding, and let the human accept or amend it.

$ARGUMENTS
