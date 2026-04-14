#!/bin/bash
# Safe Bash Hook for Claude Code
# Blocks potentially destructive commands before execution
# Receives tool input as JSON on stdin

set -e

input=$(cat)
cmd=$(echo "$input" | jq -r '.command // empty')

# Exit early if no command
[[ -z "$cmd" ]] && exit 0

# Helper to block with message
block() {
  echo "BLOCKED: $1"
  echo "Command: $cmd"
  exit 1
}

# =============================================================================
# Git Destructive Operations
# =============================================================================

# Force push (anywhere - too risky)
echo "$cmd" | grep -qE 'git\s+push\s+.*(-f|--force)' && \
  block "git push --force - could overwrite remote history"

# Hard reset
echo "$cmd" | grep -qE 'git\s+reset\s+--hard' && \
  block "git reset --hard - would discard uncommitted changes"

# Clean with force (deletes untracked files)
echo "$cmd" | grep -qE 'git\s+clean\s+-[a-z]*f' && \
  block "git clean -f - would delete untracked files"

# Force delete branch
echo "$cmd" | grep -qE 'git\s+branch\s+-D' && \
  block "git branch -D - force deletes branch without merge check"

# =============================================================================
# File System Destructive Operations
# =============================================================================

# rm -rf on dangerous paths
echo "$cmd" | grep -qE 'rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+(/|~|\.|\.\.|\$HOME|/Users|/home|/etc|/var|/usr|\*)\s*$' && \
  block "rm -rf on dangerous path"

# Recursive rm on root-level directories
echo "$cmd" | grep -qE 'rm\s+-r[f]?\s+/[a-z]+\s*$' && \
  block "rm -r on root-level directory"

# chmod 777 (world writable)
echo "$cmd" | grep -qE 'chmod\s+(-R\s+)?777' && \
  block "chmod 777 - makes files world-writable"

# Recursive chmod
echo "$cmd" | grep -qE 'chmod\s+-R' && \
  block "chmod -R - recursive permission change"

# =============================================================================
# Process/System Operations
# =============================================================================

# sudo rm
echo "$cmd" | grep -qE 'sudo\s+rm\s' && \
  block "sudo rm - elevated privilege file deletion"

# pkill/killall without specific target (too broad)
echo "$cmd" | grep -qE '(pkill|killall)\s+-9' && \
  block "Force killing processes"

# =============================================================================
# All checks passed
# =============================================================================
exit 0
