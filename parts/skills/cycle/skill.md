---
name: cycle
description: ⭕ Developer-Critic loop — autonomous iterative development via plan files
---

# Cycle

Run the Developer -> Critic -> Fixer -> Committer loop on a plan file.

This skill spawns its own Claude subprocesses and must be run in your terminal, not inside Claude Code.

## Usage

Run in your terminal from your project directory:
  bun .claude/skills/cycle/index.ts                 Pick from available plans
  bun .claude/skills/cycle/index.ts <plan-name>     Run a specific plan

## Prerequisites

Plans must exist in docs/plans/*.md (use /brainstorm to create one).

## What it does

1. Developer picks pending tasks from the plan and implements them
2. Critic reviews all uncommitted changes, files findings
3. Fixer addresses findings or marks them WONTFIX
4. Committer creates a structured commit
5. Repeat until all tasks are complete
