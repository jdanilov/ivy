# factory plugin — human test

Four steps, one Warp tab, ~5 minutes, from `/opt/ed/ivy` on `mission/ai-factory`.
Paste the three result lines back to the orchestrator.

## 0 — is the rollout on?

Hook modules are gated server-side by `tengu_plugin_hooks_modules`. Check before anything else:

    claude --debug -p "Reply ok." --model sonnet --plugin-dir /opt/ed/ivy/plugins/factory >/dev/null 2>&1; grep -i "hooks modules" "$(ls -t ~/.claude/debug/*.txt | head -1)"

`hooks modules not loaded: rollout flag ... is off` means stop here, the fallback stays live. No such line means continue.

## 1 — loads (A-HOOK-1)

`cd /opt/ed/ivy && claude --plugin-dir /opt/ed/ivy/plugins/factory`

Expect no plugin load error in the banner, `/plugin` listing `factory 0.1.0`, and a status line
row like `story · implement r0 · running` that repaints after each prompt. No mission in
`.factory/missions/` means no row; that is correct, not a failure.

Line: `A-HOOK-1 pass|fail` (add the error text on fail)

## 2 — ask draws in the main session

Prompt: `Call the mcp__factory__ask tool with question "Ship it?" and options ["yes","no"].`

Expect a dialog with two choices. Pick one; the tool returns what you picked. If Claude says it
has no such tool, the host installed no in-process MCP registrar — note that verbatim.

## 3 — ask from a sub-agent (A-HOOK-2)

Prompt: `Spawn a general-purpose sub-agent and have it call mcp__factory__ask with question "From the sub-agent?".`

Expect the dialog in THIS session, not inside the sub-agent. Answer it; the sub-agent gets the
answer back and finishes.

Line: `A-HOOK-2 pass|fail`

## 4 — the Inbox answers first (A-HOOK-3)

Prompt: `Call mcp__factory__ask with question "Answered from the inbox?".` Do NOT answer the
dialog. In a second terminal:

    cd /opt/ed/ivy && f=$(ls -t .factory/inbox/*.json | head -1) && echo "$f" && python3 -c "import json,sys;p=sys.argv[1];d=json.load(open(p));d['answer']='yes';json.dump(d,open(p,'w'))" "$f"

Expect the dialog to close within ~1s and the tool to return `yes`; the file ends `{"answered": true, ...}`.

Line: `A-HOOK-3 pass|fail`
