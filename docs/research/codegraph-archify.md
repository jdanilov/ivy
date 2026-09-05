# Codegraph and Archify

Research for the `codegraph, archify` line in `2026-09-05-refit/intent.md:11,23`. Both exist and are installable; neither is undefined, so neither goes to `docs/roadmap.md`.

## Comparison

| | Codegraph | Archify |
|---|---|---|
| Install | `npm i -g @colbymchenry/codegraph` (or `install.sh`, or `npx @colbymchenry/codegraph`) | `npx skills add tt-a1i/archify -g` (vendors skill.md + renderer into `~/.claude/skills/archify`) |
| Init | `codegraph init` (builds index in one step) | none, stateless per invocation |
| Per-project files | `.codegraph/` (`codegraph.db[-wal/-shm]`, `ui/trails/`, daemon pid/sock/log), own `.gitignore` inside it. Optional `codegraph.json` at root, hand-written | none by default. Output `.html/.svg/.png` land wherever the agent is told to write them |
| Surface | MCP `codegraph serve --mcp`, tool `codegraph_explore` (+ `codegraph_node/search/callers/callees/impact` behind `CODEGRAPH_MCP_TOOLS`). CLI: `query`, `explore`, `node`, `status`, `sync`, `callers`, `callees`, `impact`, `ui` | Chat-only skill: agent emits typed JSON IR, `SKILL.md` instructs it to shell out to a bundled `bin/archify.mjs validate\|deliver\|preview\|compare\|doctor` |
| Hook | `UserPromptSubmit` → `codegraph-gate.sh`, runs `codegraph prompt-hook` on stdin, truncates output over `CODEGRAPH_HOOK_LIMIT` (default 1800 chars), no-op if `CODEGRAPH_HOOK=0` or the binary errors | none |
| Prerequisites | Node only for the npm install path; the published bin bundles its own runtime, no native build. No API keys, no telemetry sent unless opted in | `bin/archify.mjs` is a plain Node script; DSH profile of the same skill states Node `^22.19.0 \|\| >=24.0.0`, base repo does not pin a version. No API keys |

## Codegraph, evidence

- `@colbymchenry/codegraph`, MIT, no deps, bundled runtime. `npm view` shows npm latest `1.6.0`; the binary actually on this Mac is a locally-published prerelease `1.5.0-jdanilov.1` (`ls -la $(which codegraph)` resolves through nvm into `lib/node_modules/@colbymchenry/codegraph`) — worth pinning a version before the Factory depends on it.
- `@ /opt/ed/igs/.mcp.json` wires the MCP entry, `@ /opt/ed/igs/.claude/settings.json:1-15` allow-lists `mcp__codegraph__*` and wires the `UserPromptSubmit` hook, `@ /opt/ed/igs/.claude/scripts/codegraph-gate.sh` is the hook body.
- Gate blocks nothing by exit code, it only shapes what reaches the prompt: cheap hint (~500B) passes untouched, the expensive explore dump is truncated to a pointer past `CODEGRAPH_HOOK_LIMIT`. It never fails the turn.
- `codegraph install` (agent-wiring subcommand) is not what Ivy should run — Ivy's own linker already writes `.mcp.json` and hook entries. Only `codegraph init` belongs in an `init` recipe.
- `/opt/ed/dungeonloom` has a stray `.codegraph/` index (`ls -la /opt/ed/dungeonloom/.codegraph`) with no `.mcp.json` or settings wiring — an orphaned index from a prior manual `codegraph init`, not a working install. `/opt/ed/cut` and `/opt/ed/BrogueCE` show no codegraph trace.
- Source: `https://github.com/colbymchenry/codegraph#readme` (fetched), `npm view @colbymchenry/codegraph`.

## Archify, evidence

- `docs/vault/01-Inbox/Tasks.md:22,74` and `.factory/missions/2026-09-03-ai-factory/intent.md:98,204` are the only local mentions, both aspirational ("Archify HTML on demand", listed as a skill part) — no local install exists yet, `~/.claude/skills/` is empty.
- The real tool is `tt-a1i/archify` on GitHub, an agent skill (not an MCP, not a daemon): natural language → typed JSON IR → deterministic HTML/SVG compiler, five diagram kinds (architecture, workflow, sequence, data-flow, lifecycle). Source: `https://github.com/tt-a1i/archify`, `https://tt-a1i.github.io/archify/`.
- The npm package literally named `archify` (`npm view archify`, v0.0.4, `justin-calleja/archifier`) is unrelated, a tree-printing utility. Do not `npm i archify`.
- Installed once via the `skills` CLI (`vercel-labs/skills` on npm) which copies skill files into an agent's skills dir; Ivy's own symlink model replaces that step, Ivy should vendor `SKILL.md` + `bin/archify.mjs` under `parts/skills/archify` directly.

## Proposed part.yaml

```yaml
name: codegraph
type: mcp
default: false
files:
  - { source: parts/codegraph/gate.sh, target: .claude/scripts/codegraph-gate.sh }
mcp:
  serverName: codegraph
  config: { command: codegraph, args: [serve, --mcp] }
hooks:
  - { event: UserPromptSubmit, command: "$CLAUDE_PROJECT_DIR/.claude/scripts/codegraph-gate.sh" }
envVars: []   # none required; CODEGRAPH_HOOK / CODEGRAPH_HOOK_LIMIT are optional overrides, not secrets
init: ["codegraph init"]     # once per project, builds .codegraph/; codegraph uninit on part removal
```

```yaml
name: archify
type: skill
default: false
files:
  - { source: parts/skills/archify/SKILL.md, target: .claude/skills/archify/SKILL.md }
  - { source: parts/skills/archify/bin/archify.mjs, target: .claude/skills/archify/bin/archify.mjs }
mcp: null
hooks: []
envVars: []
init: []      # stateless, nothing to build per project
```

## Open questions

- Which codegraph version does the Factory pin — npm latest `1.6.0` or the local `1.5.0-jdanilov.1` fork the user already runs.
- Should `codegraph.json` (exclude/include rules) ship as a `skipIfExists` template, or stay hand-authored per project.
- Uninstall symmetry: does removing the codegraph part run `codegraph uninit` (deletes `.codegraph/`), or leave the index behind like the dungeonloom orphan.
- Archify has no CLI on PATH and no MCP; confirm a `skill`-type part with a bundled `bin/archify.mjs` is the intended shape versus a `tool` type, per the part-type table in `@ CLAUDE.md`.
- Not checked: whether `bin/archify.mjs` has an npm-declared engines field (GitHub raw fetch 404'd on `main`, branch name may differ).
