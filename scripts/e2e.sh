#!/usr/bin/env bash
# End to end, no pty: install into a throwaway repo, walk a chore mission, uninstall.
set -euo pipefail

FACTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# macOS mktemp hands back /var/folders/..., a symlink to /private/var/...; the linker
# builds relative symlink targets, so a logical path leaves every link dangling.
TMP="$(cd "$(mktemp -d)" && pwd -P)"
REPO="$TMP/repo"
export HOME="$TMP/home"
trap 'rm -rf "$TMP"' EXIT

die() { echo "e2e: $1" >&2; exit 1; }
# Quiet while it works, the whole output when it does not.
f() { local out; out="$(cd "$REPO" && bun "$FACTORY/src/cli.ts" "$@" 2>&1)" || { echo "$out" >&2; die "factory $* failed"; }; }

mkdir -p "$REPO" "$HOME"
git -C "$REPO" init -q
git -C "$REPO" config user.email e2e@factory.local
git -C "$REPO" config user.name e2e
echo '# e2e' > "$REPO/README.md"
git -C "$REPO" add -A && git -C "$REPO" commit -qm 'init'

f install "$REPO" --yes
[ -L "$REPO/.claude/skills/commit/skill.md" ] || die 'install left no symlink'
[ -e "$REPO/.claude/skills/commit/skill.md" ] || die 'install left a dangling symlink'
grep -q 'Docs format: @.claude/docs-format.md' "$REPO/AGENTS.md" || die 'install wrote no snippet'
git -C "$REPO" add -A && git -C "$REPO" commit -qm 'install factory'

f mission new x --stub --workflow chore
[ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" = 'main' ] || die 'stub took a branch'
f mission open x --dry-run
[ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" = 'mission/x' ] || die 'open did not promote the stub'
git -C "$REPO" check-ignore -q .factory/claim || die '.factory/claim is not ignored'

# chore declares no gate, so the walk opens one by hand to exercise the gate path.
for step in grill implement merge; do
   f step start "$step"
   if [ "$step" = grill ]; then f gate open grill --file intent.md; f gate answer grill accept; fi
   f step done "$step"
done

f mission close x
[ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" = 'main' ] || die 'close left the mission branch'
! git -C "$REPO" show-ref --verify --quiet refs/heads/mission/x || die 'close kept the branch'
[ -z "$(git -C "$REPO" status --porcelain)" ] || die "close left the tree dirty: $(git -C "$REPO" status --porcelain | tr '\n' ' ')"
grep -q 'close mission x' <(git -C "$REPO" log --format=%s main) || die 'close did not land on main'

f uninstall "$REPO" --yes
[ ! -e "$REPO/.claude/skills/commit" ] || die 'uninstall left a skill behind'
[ ! -e "$REPO/.mcp.json" ] || die 'uninstall left an empty .mcp.json'
[ ! -e "$REPO/.claude/settings.json" ] || die 'uninstall left an empty settings.json'
[ ! -e "$REPO/.claude/.factory-manifest.json" ] || die 'uninstall left the manifest'

echo 'e2e: ok'
