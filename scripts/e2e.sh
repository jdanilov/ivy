#!/usr/bin/env bash
# End to end, no pty: install into a throwaway repo, walk a chore mission, uninstall.
set -euo pipefail

FACTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# macOS mktemp hands back /var/folders/..., which resolves to /private/var/...; a project is
# compared against the path it really has, so the logical one is no good here.
TMP="$(cd "$(mktemp -d)" && pwd -P)"
REPO="$TMP/repo"
export HOME="$TMP/home"
# No tab ever opens from a test run, whatever this machine has installed.
export WARP_MISSING=1
trap 'rm -rf "$TMP"' EXIT
# The `claude` a test run starts: no daemon and no model, just the one line and the one record
# that `--bg` leaves behind, so `mission open` walks its real path and no session ever runs.
mkdir -p "$TMP/bin" && cat > "$TMP/bin/claude" <<'STUB'
#!/bin/sh
case "$1" in
   --bg) id="$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"; mkdir -p "$HOME/.claude/jobs/$id"
      printf '{"sessionId":"%s-e2e0-4000-8000-000000000000"}\n' "$id" > "$HOME/.claude/jobs/$id/state.json"
      echo "backgrounded · $id · $3";;
   stop) echo "stopped $2";;
esac
STUB
chmod +x "$TMP/bin/claude"; export PATH="$TMP/bin:$PATH"

die() { echo "e2e: $1" >&2; exit 1; }
# Never a tty on stdin: a run from a terminal must reach the same refusals a script does.
fin() { local dir="$1"; shift; local out; out="$(cd "$dir" && bun "$FACTORY/src/cli.ts" "$@" 2>&1 </dev/null)" || { echo "$out" >&2; die "factory $* failed in $dir"; }; }
f() { fin "$REPO" "$@"; }
# The same again, with the output on stdout for a grep.
says() { local dir="$1"; shift; (cd "$dir" && bun "$FACTORY/src/cli.ts" "$@" 2>&1 </dev/null); }
# The other half of the contract: exit 1 and a line saying what to do instead.
refuses() { local dir="$1" want="$2"; shift 2; local out
   out="$(cd "$dir" && bun "$FACTORY/src/cli.ts" "$@" 2>&1 </dev/null)" && { echo "$out" >&2; die "factory $* was not refused"; }
   grep -q -- "$want" <<< "$out" || { echo "$out" >&2; die "factory $* refused without \"$want\""; }
}
repo() { mkdir -p "$1"; git -C "$1" init -q; git -C "$1" config user.email e2e@factory.local
   git -C "$1" config user.name e2e; echo '# e2e' > "$1/README.md"
   git -C "$1" add -A; git -C "$1" commit -qm 'init'; }

mkdir -p "$HOME/.factory"
# The hook holds the Mac awake on a prompt under the default `auto`; a scratch run leaves none behind.
printf 'caffeinate: "off"\n' > "$HOME/.factory/config.yaml"
repo "$REPO"

f install "$REPO" --yes
[ -f "$REPO/.claude/skills/mission/skill.md" ] || die 'install left no file'
[ ! -L "$REPO/.claude/skills/mission/skill.md" ] || die 'install left a link into the Factory'
[ ! -e "$REPO/.claude/skills/commit" ] || die 'a global part landed in a project'
grep -q 'Docs format: @.claude/docs-format.md' "$REPO/AGENTS.md" || die 'install wrote no snippet'
# Plain untracked files: what a repo without the Factory on the machine would see committed.
git -C "$REPO" status --porcelain | grep -q '^?? \.claude/' || die 'install left no plain untracked files'
git -C "$REPO" add -A && git -C "$REPO" commit -qm 'install factory'

# A mission only runs in a project ~/.factory/projects knows: that is what sandboxes a scratch HOME.
STRANGER="$TMP/stranger"
repo "$STRANGER"
refuses "$STRANGER" 'is not a registered project' mission new n --no-open

f mission new x --stub --workflow chore
[ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" = 'main' ] || die 'stub took a branch'
cp "$REPO"/.factory/missions/*-x/state.json "$TMP/state.before"
f mission open x --dry-run
cmp -s "$TMP/state.before" "$REPO"/.factory/missions/*-x/state.json || die 'a dry run rewrote state.json'
[ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" = 'main' ] || die 'a dry run promoted the stub'
[ ! -e "$REPO/.factory/claim" ] || die 'a dry run claimed the checkout'
f mission open x
[ "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" = 'mission/x' ] || die 'open did not promote the stub'
for ignored in .factory/claim .factory/missions/ .factory/archive/; do
   git -C "$REPO" check-ignore -q "$ignored" || die "$ignored is not ignored"
done
# A second open while that session is live would strand it, so it is refused; a dead one is replaced.
SESSION="$(sed -n 's/.*"session": "\([^"]*\)".*/\1/p' "$REPO"/.factory/missions/*-x/state.json)"
mkdir -p "$HOME/.factory/events" && : > "$HOME/.factory/events/$SESSION.jsonl"
refuses "$REPO" 'is bound to session' mission open x
rm "$HOME/.factory/events/$SESSION.jsonl"
f mission open x --dry-run
# The other launch: the stub claude's --bg leaves the one record the real daemon would.
echo 'launch: "bg"' >> "$HOME/.factory/config.yaml"
f mission open x
grep -q '"session": "[0-9a-f]\{8\}-e2e0-' "$REPO"/.factory/missions/*-x/state.json || die 'a bg open did not read the session id back from the job record'
grep -q 'claude attach' "$HOME"/.warp/tab_configs/factory-x.toml || die 'a bg open did not write an attaching tab'
sed -i '' '/^launch:/d' "$HOME/.factory/config.yaml"

# No tty to offer a worktree to, so the caller is told to ask for one.
refuses "$REPO" 'add --worktree' mission new b --no-open
[ ! -d "$REPO"/.factory/missions/*-b ] 2>/dev/null || die 'the refused mission left a folder behind'

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
# The mission folder is ignored: it stays on disk, closed, and git never hears about it.
grep -q '"status": "closed"' "$REPO"/.factory/missions/*-x/state.json || die 'close did not record the status'
[ -z "$(git -C "$REPO" ls-files -- .factory)" ] || die 'close committed the mission folder'
refuses "$REPO" 'mission x is closed' mission open x

# Closed work steps aside with its history and comes back the same way.
HEAD_BEFORE="$(git -C "$REPO" rev-parse HEAD)"
f mission archive x
[ -d "$REPO"/.factory/archive/*-x ] || die 'archive did not move the folder'
[ -z "$(git -C "$REPO" status --porcelain)" ] || die 'archive left the tree dirty'
[ "$(git -C "$REPO" rev-parse HEAD)" = "$HEAD_BEFORE" ] || die 'archive committed something'
says "$REPO" mission list --all | grep -q 'archived' || die 'list --all does not show the archived row'
f mission unarchive x
[ -d "$REPO"/.factory/missions/*-x ] || die 'unarchive did not put it back'

# A mission starts unshaped: one intent step, and a preset appended behind it once.
f mission new s --no-open
grep -q '"workflow": "intent"' "$REPO"/.factory/missions/*-s/state.json || die 'mission new did not start on the intent workflow'
f mission shape story
grep -q '"workflow": "story"' "$REPO"/.factory/missions/*-s/state.json || die 'shape did not record the preset'
[ "$(grep -c '^  - ' "$REPO"/.factory/missions/*-s/workflow.yaml)" = 6 ] || die 'shape did not append the story steps'
refuses "$REPO" 'session has no intent step' mission shape session

f mission new q --session --no-worktree --no-open
[ "$(grep -c '^  - ' "$REPO"/.factory/missions/*-q/workflow.yaml)" = 1 ] || die '--session is not a single step'

f uninstall "$REPO" --yes
[ ! -e "$REPO/.claude/skills/mission" ] || die 'uninstall left a skill behind'
[ ! -e "$REPO/.mcp.json" ] || die 'uninstall left an empty .mcp.json'
[ ! -e "$REPO/.claude/settings.json" ] || die 'uninstall left an empty settings.json'
[ ! -e "$REPO/.claude/.factory-manifest.json" ] || die 'uninstall left the manifest'

# The machine's own commands: every registered project at once, no positional and no picker. The
# supervisor is never started here — a black-box run must leave no process behind.
printf 'tick:\n  kind: daemon\n  cmd: "true"\n  every: 1h\n' > "$REPO/.factory/daemons.yaml"
says "$REPO" daemon list | grep -q 'repo/tick' || die 'daemon list does not show the manifest row'
says "$REPO" daemon list | grep -q 'supervisor not running' || die 'daemon list does not head with the missing supervisor'
says "$REPO" supervisor status | grep -q 'not running' || die 'supervisor status does not say it is not running'
says "$REPO" supervisor status | grep -q 'not installed' || die 'supervisor status does not say the unit is not installed'
# Two verbs and no supervisor: `run` turns the row on and leaves the request for a tick that
# never comes, `stop` turns it back off. The config is the whole desired state, so it is the proof.
f daemon run repo/tick
grep -q 'repo/tick: "on"' "$HOME/.factory/config.yaml" || die 'daemon run did not turn the row on'
f daemon stop repo/tick
grep -q 'repo/tick: "off"' "$HOME/.factory/config.yaml" || die 'daemon stop did not turn the row off'
refuses "$REPO" 'no daemon' daemon run repo/nothing
rm "$REPO/.factory/daemons.yaml"

# The user's own parts: home dir, one settings.json for hooks and allow list, no project involved.
fin "$TMP" install --global --yes
[ -f "$HOME/.claude/skills/commit/skill.md" ] || die 'install --global left no file'
[ ! -L "$HOME/.claude/skills/commit/skill.md" ] || die 'install --global left a link into the Factory'
[ -e "$HOME/.claude/.factory-manifest.json" ] || die 'install --global wrote no manifest'
grep -q '\$HOME/.claude/scripts/safe-bash.sh' "$HOME/.claude/settings.json" || die '${root} did not resolve to $HOME'
[ ! -e "$HOME/.claude/settings.local.json" ] || die 'a settings.local.json at user level'
! grep -q "$HOME" "$HOME/.factory/projects" || die 'the home dir landed in the projects list'
says "$TMP" status --global | grep -q '5 installed' || die 'status --global does not read the parts back'
# One run over every registered project and then the home dir, with no positional and no picker.
says "$TMP" update --all | grep -q 'All done' || die 'update --all did not walk the projects and the home dir'
# The daemon's records under ~/.claude are Claude Code's own, never the Factory's to remove.
rm -rf "$HOME/.claude/jobs"
fin "$TMP" uninstall --global --yes
[ ! -e "$HOME/.claude" ] || die 'uninstall --global left the home .claude behind'

# A copy of the registry, so a scratch part can say things the shipped ones do not.
COPY="$TMP/factory"
mkdir -p "$COPY/parts/vendor/assets/deep"
cp -R "$FACTORY/src" "$COPY/src"
cp -R "$FACTORY/parts/roadmap" "$COPY/parts/roadmap"
ln -s "$FACTORY/node_modules" "$COPY/node_modules"
echo one > "$COPY/parts/vendor/assets/one.txt"
echo two > "$COPY/parts/vendor/assets/deep/two.txt"
cat > "$COPY/parts/vendor/part.yaml" <<'YAML'
type: fixture
description: a directory source, expanded when the registry loads
default: false
files:
  - source: assets/
    target: .claude/vendor
YAML

VENDOR="$TMP/vendor-repo"
repo "$VENDOR"
(cd "$VENDOR" && bun "$COPY/src/cli.ts" install "$VENDOR" --parts vendor >/dev/null </dev/null) || die 'a directory source did not install'
[ -e "$VENDOR/.claude/vendor/one.txt" ] || die 'a directory source missed a top-level file'
[ -e "$VENDOR/.claude/vendor/deep/two.txt" ] || die 'a directory source missed a nested file'
grep -q '.claude/vendor/deep/two.txt' "$VENDOR/.claude/.factory-manifest.json" || die 'the manifest does not list the expanded files'

# Nothing global has a project root, so a snippet or a recipe on one is a registry error.
cat >> "$COPY/parts/vendor/part.yaml" <<'YAML'
scope: global
snippet:
  section: "## Important Files"
  line: "- Vendor: `.claude/vendor/`"
YAML
BROKEN="$(cd "$VENDOR" && bun "$COPY/src/cli.ts" status "$VENDOR" 2>&1 </dev/null || true)"
grep -q 'neither a snippet nor recipes' <<< "$BROKEN" || { echo "$BROKEN" >&2; die 'a global part with a snippet was not refused'; }

echo 'e2e: ok'
