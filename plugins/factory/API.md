# Function hooks API, Claude Code 2.1.257

Confirmed by reading the installed binary's strings and by `claude plugin init --with hooks`, 2026-09-05. Assumed items are marked. The transcript's `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` flag and `plugin-authoring` skill do not exist in this build. Nothing gates the feature except the manifest.

## Layout

```
plugins/factory/
  .claude-plugin/plugin.json     { name, version, description }
  hooks/hooks.json               { "modules": ["../hooks.ts"] }   one module per plugin, path relative to hooks.json
  hooks.ts                       export function register(on, options) { ... }
```

`hooks.json` must have `hooks` (command hooks, settings format) or `modules`, or both. Load with `claude --plugin-dir plugins/factory`. `claude plugin validate --strict <dir>` runs the static analysis the loader runs and prints every problem. `claude plugin details <dir>` shows the inventory. `/reload-plugins` in a session reloads.

## Module rules, enforced statically before load

- `export function register(on, options)`; `options.signal` is an AbortSignal. Nothing may call `on` after register returns.
- `on("<event>", hook)` or `on("<event>", matcher, hook)`; `on("*", hook)`. Event is a string literal. Hook is a function literal or the name of one in the module. `on` may not be stored, spread or passed on.
- `$` is spelled literally at every call site as `$.noun.verb(...)`. The loader reads which ops and events the module uses from source.
- Hook signature: `($, e) => answer`. Answer shapes below. A hook may await.

## Events

Command-hook events: `PreToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `SubagentStart`, `SubagentStop`, `SessionStart`, `PreCompact`, `Notification`, and the rest of the settings list.
Engine events: `tool.call`, `tool.describe`, `ui.render`, `ui.resolve`, `ui.press`, `agent.offer`, `agent.spawn`, `prompt.submit`, `prompt.section`, `skill.prompt`, `attribution.text`, `turn.start`, `turn.step`, `turn.complete`, `engine.create`.

## Ops on `$`

model.complete, model.classify, model.fork · audio.play, audio.speak · mcp.call · session.cwd, session.model, session.turnCount, session.id, session.messages, session.repo, session.surface, session.authorize · turn.abort · flag.value · tool.list, tool.register, tool.call · agent.list, agent.spawn · ui.toast, ui.status, ui.log, ui.notice, ui.invalidate, ui.ask · fs.readFile, fs.writeFile, fs.listDir, fs.exists, fs.stat, fs.ancestors · store.get, store.set, store.delete, store.keys · http.fetch · prompt.submit · content.trim.

## Contracts

| Call | Takes | Notes |
|------|-------|-------|
| `$.tool.register({ name, description, inputSchema })` | name `[a-zA-Z0-9_-]{1,64}`, description non-empty | Registers `mcp__<plugin>__<name>` on an in-process MCP server. Fails with "no in-process MCP server registrar installed" on hosts without one. Polls until the tool is visible. Max tools per plugin. |
| `on("tool.call", { tool: "mcp__factory__ask" }, ($, e) => ({ result }))` | matcher on tool name | This is how a registered tool is answered. The engine says exactly this when a registered tool has no hook. Answer `{ result }` or `{ deny: "reason" }`. `e` carries the tool input (assumed `e.input`). |
| `$.ui.ask(question, options?)` | question first, at most 3 options | Draws AskUserQuestion in the main session. Budgeted per session and rate limited. Throws "no answer, the dialog was dismissed". Exact option shape assumed: array of strings or `{ label, description }`. |
| `$.ui.status({ text })` | text or undefined to clear | Status line row owned by the plugin. |
| `$.ui.toast({ text, timeoutMs? })`, `$.ui.log({ text })`, `$.ui.notice(...)` | | Toasts budgeted, two per session. |
| `$.fs.*` | project-confined | "links out of the project; skipped". Use paths under the project. |
| `$.store.set(key, value)` | JSON value | Per-plugin store. |
| `$.ui.invalidate({ event })` | `ui.render`, `prompt.section` or `tool.describe` | Re-runs that hook. |
| PreToolUse answer | `{ deny?: string, ask?: string, updatedInput? }` | |
| prompt.section answer | `{ text }` or null | Injects a section into the prompt. |
| turn.complete answer | `{ text }` | |
| tool.describe answer | `{ tool, description }` | |
| turn.abort | `{ turnId }` | |

## Not confirmed

- Whether the REPL host installs the tool registrar. Decided by the human test.
- Whether `mcp__factory__*` tools are visible inside sub-agents. MCP tools normally are. Decided by the human test.
- Exact `e` fields per event. `claude plugin validate` reports misuse; the worker iterates against it.
- `$.ui.ask` option shape. Start with an array of strings.
- Types: `/plugin-types` writes `.claude/types/claude-code-mcp.d.ts` for MCP inputs only, referencing "the engine's claude-code module types" which are not shipped as a file. A local `types.d.ts` declares `$` loosely.
