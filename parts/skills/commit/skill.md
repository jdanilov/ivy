---
name: commit
model: sonnet
description: ⭕ Structured git commits with sea-themed emojis
---

# ⭕ Commit changes [auto-approve]

1. Review uncommitted changes and prepare one or more GIT commits.
2. Follow format structure below for every commit message. Output all commit messages.
3. Create commits one by one.

Additional instructions (if any): $ARGUMENTS


## Context

- Current branch (git branch --show-current):
  !`git branch --show-current`

- Current git status (git status --short):
  !`git status --short`

- Current changes (staged + unstaged):
  !`git diff HEAD`

- Recent commits (git log --oneline -10):
  !`git log --oneline -10`


## Format Structure

1. **Header Line**: Start with an emoji and commit type, followed by a concise summary (max 72 chars)
   Format: `<emoji> <type>: <subject>`

2. **Body** (optional for simple changes): After a blank line, provide 1-3 sentences explaining WHY the changes were needed. Follow DRY principle, be succinct.

3. **Changes List** (optional for simple changes): Bullet points describing WHAT was changed in which files

## Commit Types & Emojis (Sea Theme)

- 🐠 feat: New feature or functionality
- 🦀 fix: Bug fix or error correction
- 🪼 refactor: Code restructuring without changing functionality
- 🐙 test: Adding or updating tests
- 🪝 text: Changing user-facing text, wording, content
- 🪸 style: UI/CSS changes, formatting, missing semicolons
- 🌀 chore: Build process, dependencies, tooling, agentic workflow changes
- 🦪 docs: Documentation changes only
- 🦈 perf: Performance improvements
- 🐋 release: Version releases or deployment related
- 🫧 merge: Merge commits
- 🌊 revert: Reverting previous commits
- ⛵ wip: Work in progress (incomplete changes)

## Guidelines

- While checking changes, make sure they are: reasonable, correct, have all imports properly declared. Abort and let me know if you find anything suspicious.
- Group related changes in the same commit.
- Keep header line under 72 characters.
- Don't end header with a period.
- Focus on WHAT and WHY, not HOW.
- Be specific but concise, avoid overly verbose descriptions or unnecessary details.
- Use present tense ("add" not "added").
- Do not append "Generated with Claude Code", "Co-Authored-By", "Signed-off-by" and similar lines at the end.
