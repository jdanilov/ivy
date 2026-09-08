# Hashline edits: measured, not adopted

Verdict: no-ship. On Fable 5.1 no hashline arm saves edit-operation tokens against what the model
does today, and both raise total tokens. The built-in `Edit` tool is not a token sink either.
Mission `hashline`, 2026-09-08, stopped at 34 of 48 planned runs once the direction was clear.

## Why it was asked

Fable 5.1 edits through Bash: 0 `Edit` calls and 141 python heredoc edits in the 25 most recent
sessions on the machine. `Edit` resends the old text of every hunk. pi's hashline tool addresses a
line by `LINE#HASH` and sends only the replacement. The claim was that it cuts edit tokens.

## What was run

Four arms on one committed TypeScript fixture, same model, same `bypassPermissions` mode, same
prompts, headless `claude -p --output-format json`, `git checkout .` between runs, 2–3 runs per cell.

| arm | tool set                                                                     |
|-----|------------------------------------------------------------------------------|
| A   | as-is: built-ins, no steer. Fable used `cat -n` + `perl -0pi`/heredocs        |
| D   | built-ins, steered to `Read` + `Edit`, never Bash                            |
| B   | quangdang46/hashline v0.9.16 over MCP, `Edit`/`Write` disallowed, steered    |
| C   | rjkaes/trueline-mcp 2.13.1 over MCP the same way, plus its SessionStart steer|

Tasks: `rename` a function across two files, `insert` a function plus export, `scatter` four
non-adjacent lines in a 200-line file, `reflow` inside a tab-indented file. Metrics: `edit_out` is
output tokens of every assistant message carrying an edit call (Edit, Write, MCP patch/edit, Bash
writing a file); `total` is uncached input + cache creation + output.

## Numbers (medians per cell, Fable 5.1)

| task    | arm | n | edit_out | Δ vs A | total | Δ vs A | cost  | correct |
|---------|-----|---|----------|--------|-------|--------|-------|---------|
| rename  | A   | 3 | 610      |        | 8975  |        | $0.22 | 3/3     |
| rename  | D   | 3 | 381      | −38%   | 9526  | +6%    | $0.25 | 3/3     |
| rename  | B   | 2 | 566      | −7%    | 11272 | +26%   | $0.29 | 2/2     |
| rename  | C   | 2 | 664      | +9%    | 9512  | +6%    | $0.26 | 2/2     |
| insert  | A   | 2 | 557      |        | 5752  |        | $0.15 | 2/2     |
| insert  | D   | 2 | 473      | −15%   | 6382  | +11%   | $0.19 | 2/2     |
| insert  | B   | 2 | 1048     | +88%   | 11465 | +99%   | $0.32 | 2/2     |
| insert  | C   | 2 | 734      | +32%   | 9630  | +67%   | $0.27 | 2/2     |
| scatter | A   | 2 | 330      |        | 8729  |        | $0.20 | 2/2     |
| scatter | D   | 2 | 706      | +114%  | 7697  | −12%   | $0.21 | 2/2     |
| scatter | B   | 2 | 1062     | +222%  | 13573 | +55%   | $0.37 | 2/2     |
| scatter | C   | 2 | 331      | 0%     | 7340  | −16%   | $0.19 | 2/2     |
| reflow  | A   | 2 | 621      |        | 5076  |        | $0.15 | 2/2     |
| reflow  | D   | 2 | 717      | +15%   | 5836  | +15%   | $0.18 | 2/2     |
| reflow  | B   | 2 | 760      | +22%   | 8474  | +67%   | $0.24 | 2/2     |
| reflow  | C   | 2 | 426      | −31%   | 7229  | +42%   | $0.20 | 2/2     |

| arm | Σ edit_out | Δ vs A | Σ total | Δ vs A | Σ cost |
|-----|------------|--------|---------|--------|--------|
| A   | 2118       |        | 28531   |        | $0.72  |
| D   | 2277       | +8%    | 29440   | +3%    | $0.82  |
| B   | 3435       | +62%   | 44784   | +57%   | $1.23  |
| C   | 2154       | +2%    | 33712   | +18%   | $0.92  |

Every run produced the intended diff. One B run on `insert` fell back to a Bash edit.

## Against the rule

Ship needed, for the best hashline arm vs A: edit_out saving > 25% ✗ (C: −2%), total ≤ A ✗
(C: +18%), correct ≥ A ✓. Two of three fail. B fails all but correctness.

## Why hashline loses here

- The saving is output-only and small: a Fable edit payload is already short. `perl -0pi` and
  `Edit` both send a few lines of anchor; a hash anchor saves those lines and nothing more.
- Hash-tagged reads cost input every time: every `read` returns `LINE#HASH:` prefixes, and `scatter`
  under B re-read and patched five times where A did one regex pass.
- MCP tools are deferred in Claude Code: each B/C run spent one `ToolSearch` turn finding the tool
  even with the steer naming it. A part would ship that overhead to every session.
- Published gains (Can Bölük's harness benchmark) concentrate in weak models failing exact-match
  edits. Fable's correctness here was 100% in every arm, so there was no failure to buy back.

## Side findings

- The python/heredoc habit is partly ours: under `bypassPermissions` the harness tells the session to
  edit via Bash instead of `Edit`. Arm D shows `Edit` costs about the same overall (+3% total), so
  neither steer is worth a part.
- quangdang46/hashline's `install.sh` silently writes MCP entries into `~/.claude.json` and other
  hosts' configs. Fetch the release tarball if it is ever wanted.
- trueline-mcp's PreToolUse intercept hook is broken in the npm package (missing module); its
  SessionStart steer works.
- The Factory has no user-scope MCP path: `injectMcp` writes `<target>/.mcp.json`, and at global
  scope Claude Code never reads it. A global mcp part would need `~/.claude.json`.

Raw runs, tasks, fixture and the benchmark script are kept in the mission folder under `bench/`.
