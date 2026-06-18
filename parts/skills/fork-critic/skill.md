---
name: fork-critic
model: opus
description: ❧ Forked critic — fresh-context code review with selectable findings
---

# Fork Critic

Launch a **separate Claude instance** to review uncommitted changes, then rank and present findings to pick which ones to implement.

Additional instructions from the user (if any): $ARGUMENTS


## Step 1 — Run the forked critic

```bash
bun .claude/skills/fork-critic/scripts/fork-critic.ts <additional instructions>
```

Read the JSON output. Each finding has: `severity`, `file`, `line`, `title`, `body`.


## Step 2 — Present findings

If the array is empty, tell the user the code is clean and stop.

Otherwise, format each finding as a numbered list for the user:

```
Forked critic found N issues:

1. ■ Major title — file:line
   body (first 2 lines)

2. ● Minor title — file:line
   body (first 2 lines)

3. ◇ Suggestion title — file:line
   body (first 2 lines)

4. △ Testing title — file:line
   body (first 2 lines)
```

Then ask the user:

> Which findings should I implement? (enter numbers like 1,3,4 — or "all" / "none")

## Step 3 — Implement selected findings

For each selected finding, implement the fix described in `body`. Work through them one at a time. After each fix, briefly confirm what you did.

Skip any finding the user did not select.

## Rules

- If the script fails, show the error and stop — do not attempt to review code yourself (that defeats the purpose of fresh context)
- Do NOT add your own findings — only implement what the forked critic found
