#!/usr/bin/env bash
# Scan project directory tree for source file density
#
# Usage: scan.sh [options] [extensions...]
#   -d DIR    Project root directory (default: current directory)
#   -n DEPTH  Max directory depth to display (default: 10)
#   -e EXTS   Source extensions (default: broad set)
#
# Examples:
#   scan.sh                          Scan current dir, all defaults
#   scan.sh -d /path/to/project      Scan specific project
#   scan.sh -n 3                     Limit to 3 levels deep
#   scan.sh -d ./src -n 2 ts tsx js  Only these extensions
#
# Features:
#   - Counts non-empty lines only (blank lines excluded)
#   - Respects .gitignore (uses git ls-files when in a git repo)
#   - Tree-style output with rolled-up totals per parent directory
#   - Marks directories that already have a CLAUDE.md

set -euo pipefail

ROOT="."
MAX_DEPTH=10

while getopts "d:n:" opt; do
  case $opt in
    d) ROOT="$OPTARG" ;;
    n) MAX_DEPTH="$OPTARG" ;;
    *) echo "Usage: scan.sh [-d dir] [-n depth] [extensions...]" >&2; exit 1 ;;
  esac
done
shift $((OPTIND - 1))

ROOT=$(cd "$ROOT" && pwd)

if [ $# -eq 0 ]; then
  EXTS=(ts tsx js jsx mjs cjs py rb go rs java kt kts swift vue svelte astro c cpp cc h hpp cs lua zig hs ex exs erl ml mli scala sc r jl php dart nim)
else
  EXTS=("$@")
fi

# Build grep -E pattern for extensions: \.(ts|tsx|js)$
ext_pattern='\.('
for i in "${!EXTS[@]}"; do
  [ "$i" -gt 0 ] && ext_pattern+="|"
  ext_pattern+="${EXTS[$i]}"
done
ext_pattern+=')$'

# Phase 1: list source files (respecting .gitignore if in a git repo)
filelist=$(mktemp)
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  # Tracked + untracked-but-not-ignored
  git -C "$ROOT" ls-files --cached --others --exclude-standard 2>/dev/null | \
    grep -E "$ext_pattern" | \
    sed "s|^|$ROOT/|" > "$filelist"
else
  # Fallback: find with common dirs pruned
  PRUNE_DIRS=("node_modules" ".git" "dist" "build" ".next" ".nuxt" "coverage" "__pycache__" ".venv" "venv" "vendor" "target" ".claude")
  PRUNE_ARGS=()
  for d in "${PRUNE_DIRS[@]}"; do
    PRUNE_ARGS+=("-name" "$d" "-o")
  done
  unset 'PRUNE_ARGS[${#PRUNE_ARGS[@]}-1]'

  NAME_ARGS=()
  for ext in "${EXTS[@]}"; do
    [ ${#NAME_ARGS[@]} -gt 0 ] && NAME_ARGS+=("-o")
    NAME_ARGS+=("-name" "*.${ext}")
  done

  find "$ROOT" \( "${PRUNE_ARGS[@]}" \) -prune -o \( "${NAME_ARGS[@]}" \) -print > "$filelist"
fi

# Phase 2: count non-empty lines per file → "count\treldir"
raw=$(mktemp)
while IFS= read -r filepath; do
  [ -f "$filepath" ] || continue
  count=$(grep -cv '^[[:space:]]*$' "$filepath" 2>/dev/null || echo 0)
  dir=$(dirname "$filepath")
  reldir="${dir#$ROOT}"
  reldir="${reldir#/}"
  [ -z "$reldir" ] && reldir="."
  printf '%s\t%s\n' "$count" "$reldir"
done < "$filelist" > "$raw"

# Phase 3: aggregate own files/lines per directory
agg=$(mktemp)
awk -F'\t' '{
  files[$2]++
  lines[$2] += $1
}
END {
  for (d in files) print d "\t" files[d] "\t" lines[d]
}' "$raw" | sort > "$agg"

# Phase 4: collect all directories (including parents for roll-up)
alldirs=$(mktemp)
{
  awk -F'\t' '{print $1}' "$agg"
  awk -F'\t' '{print $1}' "$agg" | while IFS= read -r d; do
    while [ "$d" != "." ] && [ -n "$d" ]; do
      d=$(dirname "$d")
      echo "$d"
    done
  done
} | sort -u > "$alldirs"

# Phase 5: calculate roll-ups and print
claude_count=0

printf '\n'
printf '%-28s %5s %6s %5s  %s\n' "DIRECTORY" "FILES" "LINES" "OWN" "CLAUDE.MD"
echo "─────────                    ───── ────── ─────  ─────────"

while IFS= read -r dir; do
  # Calculate depth (0 for root)
  if [ "$dir" = "." ]; then
    depth=0
  else
    depth=$(( $(echo "$dir" | tr -cd '/' | wc -c | tr -d ' ') + 1 ))
  fi

  # Skip directories beyond max depth
  [ "$depth" -gt "$MAX_DEPTH" ] && continue

  if [ "$dir" = "." ]; then
    roll_files=$(awk -F'\t' '{s+=$2} END {print s+0}' "$agg")
    roll_lines=$(awk -F'\t' '{s+=$3} END {print s+0}' "$agg")
  else
    roll_files=$(awk -F'\t' -v d="$dir" '$1 == d || index($1, d"/") == 1 {s+=$2} END {print s+0}' "$agg")
    roll_lines=$(awk -F'\t' -v d="$dir" '$1 == d || index($1, d"/") == 1 {s+=$3} END {print s+0}' "$agg")
  fi

  own_lines=$(awk -F'\t' -v d="$dir" '$1 == d {print $3}' "$agg")
  own_lines=${own_lines:-0}

  [ "$roll_files" -eq 0 ] && continue

  if [ "$dir" = "." ]; then
    display="$ROOT"
  else
    display="$(basename "$dir")"
  fi

  indent=""
  for ((i=0; i<depth; i++)); do indent="  $indent"; done
  padded="${indent}${display}"

  own_display=""
  if [ "$own_lines" -gt 0 ] && [ "$own_lines" -ne "$roll_lines" ]; then
    own_display=$own_lines
  fi

  if [ "$dir" = "." ]; then
    check="$ROOT/CLAUDE.md"
  else
    check="$ROOT/$dir/CLAUDE.md"
  fi
  if [ -f "$check" ]; then
    claude_mark="◆"
    claude_count=$((claude_count + 1))
  else
    claude_mark=""
  fi

  printf '%-28s %5d %6d %5s  %s\n' "$padded" "$roll_files" "$roll_lines" "$own_display" "$claude_mark"
done < "$alldirs"

total_files=$(wc -l < "$raw" | tr -d ' ')
total_lines=$(awk -F'\t' '{s+=$1} END {print s+0}' "$raw")
echo "─────────                    ───── ────── ─────  ─────────"
printf '%-28s %5d %6d %5s  %s\n' "TOTAL" "$total_files" "$total_lines" "" "$claude_count"

rm -f "$filelist" "$raw" "$agg" "$alldirs"
