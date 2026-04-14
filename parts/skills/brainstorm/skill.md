---
name: brainstorm
model: opus
description: ⭕ Interactively brainstorm and plan a task, resolving ambiguity before generating an implementation plan
---

# Brainstorm

You are helping the user brainstorm and plan: **$ARGUMENTS**

## Process

1. **Understand the task**: Read relevant code, understand the current state of the project
2. **Research if needed**: Use web search or code exploration to gather context
3. **Ask clarifying questions**: Use AskUserQuestion to resolve any ambiguity. Some areas to poke around:
   - Scope and boundaries
   - Acceptance criteria
   - Technical approach preferences
   - Edge cases and constraints
4. **Iterate**: Keep asking questions until all ambiguity is resolved
5. **Generate plan**: Once clear, create a plan file at `docs/plans/<name>.md`

## Plan Format

```markdown
# Plan: <Name>

## Goal
<1-3 sentences describing what this achieves>

## Context
<Relevant background: existing code, dependencies, constraints>

## Acceptance Criteria
- [ ] <Measurable criterion 1>
- [ ] <Measurable criterion 2>
...

## Tasks
- [ ] <Implementation task 1>
- [ ] <Implementation task 2>
...

## Ask User
(empty — populated during execution if Developer needs input)

## Critic Findings
(empty — populated during execution by the Critic)
```

## Rules
- Task names in kebab-case for the filename (e.g., `content-optimizer.md`)
- Tasks should be concrete and implementable — not vague
- Each task should be completable in a focused coding session
- Include enough context that an agent reading the plan can implement it
- Show the user a preview of the plan before saving and ask for approval
