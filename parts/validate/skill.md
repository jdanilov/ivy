---
name: validate
model: opus
description: ♻ Run the Validator against the running system and the mission contract
---

# Validate

Spawn `@Validator` to drive the running system. Do not drive it yourself and do not accept a
verdict read out of the code.

- Bound Mission (`FACTORY_MISSION`, or the folder named in `$ARGUMENTS`): pass the Mission folder.
  The Validator checks every `acceptance.md` assertion of kind `validate` and appends evidence to
  `<mission>/findings.md`.
- No Mission: give it the user-facing claim to check and it reports in its final message.

It runs the `e2e.ready` recipe first and asks rather than starting anything itself. It drives
through the `browse` skill unless `.factory/factory.yaml` names a project bridge. When there is
no way to drive the app, its handoff recommends the bridge or e2e suite to add.

Then triage with the Verifier's findings in one plan: fix or skip per finding with a reason.

$ARGUMENTS
