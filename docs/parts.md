# Parts

How a part is declared, where its files land, and what `install | uninstall | status | update` do
with it. Read when touching `src/core/registry.ts`, `linker.ts`, `parts.ts`, `manifest.ts` or a
`part.yaml`.

## part.yaml

```yaml
type: skill          # skill | tool | fixture | mcp
description: one line
scope: project       # optional, project | global — global installs into ~/.claude/ instead
default: true        # preselected in the install menu
files:
  - source: skill.md         # relative to the part folder
  - source: agents/Verifier.md
  - source: sounds/          # a directory, expanded at load to every file under it
  - source: terminology.md   # a template
    target: docs/terminology.md
    skipIfExists: true       # seed it once, then it belongs to the project
hooks:               # optional, merged into .claude/settings.local.json, or settings.json when global
  - { event: PreToolUse, matcher: Bash, command: ... }   # matcher omitted where the event takes none
  - { events: [Stop, SessionEnd], command: ... }          # sugar: one entry per event, ${event} names it
settings:            # optional, merged into .claude/settings.json: lists union, scalars overwrite
  permissions: { allow: [...] }
mcp:                 # optional, written to .mcp.json
envVars:             # optional, checked against process.env and the project .env
snippet:             # optional, one line the part owns in the project's agent file
  section: "## Important Files"                  # an ATX heading, created at EOF when missing
  line: "- Terminology: @docs/terminology.md"    # appended at the end of that section, deduped
  file: AGENTS.md    # optional, overrides AGENTS.md → CLAUDE.md → create AGENTS.md
recipes:             # optional, shell lines run in the project root
  init:   ["${codegraph} init"]             # once, when the part becomes installed
  uninit: ["${codegraph} uninit --force"]   # once, when it is uninstalled or dropped
vars:                # optional, defaults for ${name}
  codegraph: "npx -y @colbymchenry/codegraph@1.6.0"
requires: [mission]  # optional, parts selected and installed with this one, never removable under it
```

## Targets

Defaults for `skill` and `tool`: `agents/X.md` → `.claude/agents/X.md`, everything else →
`.claude/skills/<name>/X`. Fixtures and mcp parts give each file an explicit `target`, which may
sit outside `.claude`. A `source` naming a directory, with or without a trailing slash, expands at
registry load to every file under it, each targeted `<target>/<relative>`; the manifest holds the
expanded list, so nothing downstream knows the shorthand existed.

## Scope

A part's `scope` decides the target dir and nothing else: `project` links into the project's
`.claude/`, `global` into `~/.claude/`, where hooks and settings share one `settings.json` because
there is no `settings.local.json` at user level. A project command never lists a global part and
`--global` never lists a project one, so a part that changes scope is unlinked by the next `update`
the same way a retired one is. A global part with a `snippet` or `recipes` is a registry error:
nothing global has a project root to write a line in or run a command in.

## `${name}` substitution

`${name}` is substituted in `mcp.config.command`, `mcp.config.args`, `hooks[].command` and both recipe
lists: `~/.factory/config.yaml` `vars.<name>` wins over the part's `vars.<name>`, over the one built-in
`${root}` — `$CLAUDE_PROJECT_DIR` for a project, `$HOME` for a global part — and nothing defining
it is a refusal. A value may carry arguments; in `mcp.config.command` the first word is the command and
the rest leads the args. Substitution happens as the manifest entry is built, so the manifest, `.mcp.json`
and the hooks hold resolved strings and `update` re-points a project after a config edit. The everyday
override is hook-factory's `sound` (`off` silences it, a bare name is a macOS system sound) and
`quiet`, the turn length in seconds below which the end of a turn does not ring.

## Manifest, snippets, recipes

The manifest records where each file came from under the Factory root, so uninstall knows a link is
ours without reading it; a manifest written before that falls back to `readlink`. It also records each
part's `snippet: { file, section, line }` and, after `recipes.init` succeeded, `initAt`. A section that
already carries a line naming the same path gets that line rewritten in place instead of a second one
appended, and the original is kept as `snippet.replaced`. Uninstall works from those records, not from
a fresh resolution: it puts a replaced line back, otherwise removes the recorded line from the recorded
file and drops the section when only blank lines are left. A settings or mcp file the uninstall emptied
is deleted, and so are `.claude/` and `docs/` once nothing is left in either. With no manifest at all,
`status` reads a `skipIfExists` file that exists as installed: a project seeded with the templates by
hand owns them already. `init` runs when `initAt` is absent and refuses on a non-zero exit with the
part left linked, so a fix plus `update` retries. `uninit` runs on uninstall and when `update` drops a
part the registry no longer has; a failure prints `◈` and the unlink continues.

## Commands

`install | uninstall | status | update [project]` act on a project and fall back to the picker.
All four take `--global`, which stands where the project path would: the home dir, the registry
filtered to `scope: global`, and nothing written to `~/.factory/projects`. `install` and `uninstall`
take `--yes`: the defaults plus what is already installed, no menu, no confirm. `install` also takes
`--parts a,b`: exactly those parts plus their `requires`, no menu, no confirm, an unknown name is a
refusal and a name the other scope owns names the command that does install it. `update` alone takes
`--skip a,b`, which records the part in the manifest, so the project keeps its own copy for good.

`update` is the non-interactive install: relink, add parts the registry marks `default`, drop parts
and files it no longer has, rewrite hooks, settings, snippets and manifest. It only ever removes a
symlink pointing into the Factory. `install --global` refuses while any registered project's manifest
still lists a part it is about to link, naming the projects: the same skill loaded twice is worse than
an unfinished migration, and `update` on each project is what finishes it.
