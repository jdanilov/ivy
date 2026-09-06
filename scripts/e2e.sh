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

# intent is a human gate in every preset: the walk opens it and answers it.
for step in intent implement merge; do
   f step start "$step"
   if [ "$step" = intent ]; then f gate open intent --file intent.md; f gate answer intent accept; fi
   f step done "$step"
done

f mission close x
[ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" = 'main' ] || die 'close left the mission branch'
! git -C "$REPO" show-ref --verify --quiet refs/heads/mission/x || die 'close kept the branch'
[ -z "$(git -C "$REPO" status --porcelain)" ] || die "close left the tree dirty: $(git -C "$REPO" status --porcelain | tr '\n' ' ')"
grep -q 'close mission x' <(git -C "$REPO" log --format=%s main) || die 'close did not land on main'

# A mission starts unshaped: one intent step, and a preset appended behind it once.
f mission new s --no-open
grep -q '"workflow": "intent"' "$REPO"/.factory/missions/*-s/state.json || die 'mission new did not start on the intent workflow'
f mission shape story
grep -q '"workflow": "story"' "$REPO"/.factory/missions/*-s/state.json || die 'shape did not record the preset'
[ "$(grep -c '^  - ' "$REPO"/.factory/missions/*-s/workflow.yaml)" = 6 ] || die 'shape did not append the story steps'
(cd "$REPO" && bun "$FACTORY/src/cli.ts" mission shape quick >/dev/null 2>&1) && die 'shape quick was not refused'

f mission new q --quick --no-worktree --no-open
[ "$(grep -c '^  - ' "$REPO"/.factory/missions/*-q/workflow.yaml)" = 1 ] || die '--quick is not a single step'

f uninstall "$REPO" --yes
[ ! -e "$REPO/.claude/skills/commit" ] || die 'uninstall left a skill behind'
[ ! -e "$REPO/.mcp.json" ] || die 'uninstall left an empty .mcp.json'
[ ! -e "$REPO/.claude/settings.json" ] || die 'uninstall left an empty settings.json'
[ ! -e "$REPO/.claude/.factory-manifest.json" ] || die 'uninstall left the manifest'

echo 'e2e: ok'
