#!/usr/bin/env bash
# Caps the codegraph UserPromptSubmit hook.
# Cheap "hint" output (~500B) passes through untouched; the expensive full
# exploration dump (6-16KB) is truncated so it stays a pointer, not a payload.
# Disable entirely with CODEGRAPH_HOOK=0.
set -uo pipefail

[ "${CODEGRAPH_HOOK:-1}" = "0" ] && exit 0

input=$(cat)
out=$(printf '%s' "$input" | ${CODEGRAPH:-codegraph} prompt-hook 2>/dev/null) || exit 0
[ -z "$out" ] && exit 0

limit=${CODEGRAPH_HOOK_LIMIT:-1800}
if [ "${#out}" -le "$limit" ]; then
  printf '%s' "$out"
else
  printf '%s\n… [truncated — call codegraph_explore if this area is relevant]\n</codegraph_context>\n' \
    "$(printf '%s' "$out" | head -c "$limit")"
fi
