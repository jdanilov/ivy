---
name: check
description: ⌬ Review finished work for DRY, KISS, YAGNI, SoC, bloat, blast radius and regressions via @Check sub-agent
---

# Check via Sub-Agent

Spawn the @Check sub-agent. Pass it the scope and the task context:

- Scope: `$ARGUMENTS` if given (commit range, files, or a plan dir). Otherwise uncommitted changes; if the tree is clean, the last commit.
- Context: a few sentences on what the task was and its goal, so the agent can judge what is in scope and what is not.

Relay the agent's findings in a bullet point list, ranked by criticality x blast radius, then the verdict line: what you think worth doing. Do not fix anything unless asked.
