Based on my search through the Claude Code hooks documentation, here are the precise answers to your questions:

---

## Answers (facts only)

**1. PostToolUse & additionalContext:**
PostToolUse **does support** `hookSpecificOutput.additionalContext`. The exact JSON shape is:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Context text for Claude",
    "updatedToolOutput": "..."  // optional, replaces tool output
  }
}
```
The Agent tool matcher is **`"Agent"`** (exact string). Matchers like `"Agent|Task"` work — pipe-separated patterns are standard (line 226 of agent-sdk/hooks confirms `Agent` as a built-in tool). **Confirmation:** "For tool hooks, this is the tool name. Built-in tools include `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebFetch`, `Agent`…"

**2. SubagentStop input/output:**
SubagentStop exists (line 159 in available hooks). Input includes `agent_id` and `agent_type` (line 240: "required fields on `SubagentStart` and `SubagentStop`"). **additionalContext is supported** — confirmed by GitHub issue #65495: v2.1.163 added "Stop and SubagentStop hooks can now return `hookSpecificOutput.additionalContext`." No field named `stop_hook_active` is documented; transcript_path is not explicitly listed in SubagentStop input (the docs list `session_id`, `cwd`, `hook_event_name`, `agent_id`, `agent_type`).

**3. Stop hook output:**
Stop **can inject context** via `additionalContext`. The issue confirms: Stop can now "return `hookSpecificOutput.additionalContext` to give Claude feedback and keep the turn going without being labeled a hook error." The JSON shape matches PostToolUse above. (The old docs said it couldn't; they're outdated.)

**4. UserPromptSubmit:**
The docs (line 153) list it as injecting "additional context into prompts." Plain stdout is **added as context** per the agents.md convention; `additionalContext` also works (same `hookSpecificOutput` field).

**5. Hooks between Agent result and next inference:**
**PostToolUse** fires after the Agent tool returns (line 150: "Tool execution result"). No other hook fires between result and inference — the next event is the model's next call.

---

**Sources:**
- [Claude Code Agent SDK Hooks](https://code.claude.com/docs/en/agent-sdk/hooks.md)
- [GitHub Issue #65495: SubagentStop additionalContext](https://github.com/anthropics/claude-code/issues/65495)
