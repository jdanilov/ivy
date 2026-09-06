All caps hold, the tree is clean apart from the mission folder, and `beaee05` carries the work.

Key files: `/opt/ed/ivy/src/core/decision.ts`, `/opt/ed/ivy/src/commands/decision.ts`, `/opt/ed/ivy/parts/hook-factory/hook-factory.ts` (`parseDecisions`, `fileDecisions`, `waitingText`, `inject`), `/opt/ed/ivy/src/commands/step.ts` (`noneWaiting`), `/opt/ed/ivy/parts/mission/skill.md` (`## Decisions`, 119 lines).

Step: implement
Done: `src/core/decision.ts` — `Decision`, `readDecisions`, `fileDecisions`, `answerDecision`, `waitingDecisions`, `waits`, the seven-column `decisions.md` table, `|` in a summary swapped for `/`, temp-plus-rename on every write, first answer wins
Done: `src/commands/decision.ts` — `add|answer|list [--waiting]`, mission resolved from cwd like `gate`, `I`-indented output with a status glyph per row; wired in `src/cli.ts` beside `gate`, `--waiting` added to the boolean flags
Done: `step start` refuses while decisions wait, naming the ids and the answer command; `step done` untouched
Done: hook-factory stays standalone — `SubagentStop` files the `Decisions:` block (`by` from `agent_type`, `step` from the mission, status from `state.autonomy`, next id from existing rows, appended verbatim), `PostToolUse` prints the `hookSpecificOutput` JSON and `UserPromptSubmit` the plain text only while something waits, `PostToolUse` never reaches the events file, and the script still always exits 0
Done: `parts/hook-factory/part.yaml` gains `{ event: PostToolUse, matcher: Agent }`; `install` and `update` both land it in `settings.local.json` beside the seven `events:` entries
Done: every handoff template names `Decisions` with the one-line format (Worker 39, Investigator 44, Summarizer 57, Verifier 79, Validator 76 lines); mission skill's eight-line `## Decisions`, still 119 lines; orchestrator preset gains the decisions rule
Done: `scripts/test.ts` — hook filing case, hook injection case (JSON, plain text, silence after an answer, no `PostToolUse` on the bus), CLI case (statuses, `/` swap, refusal, answer, no-op, conflict), the dial, and the hook count now 8 with the Agent matcher asserted
Done: AGENTS.md architecture block and two invariants, README three command rows, terminology `Decision` row, `decisions.md` doc row, `Triage` row folded into `Decision`; `docs/design.md` untouched
Acceptance: A-DEC-1 pass, A-DEC-2 pass, A-DEC-3 pass, A-DEC-4 pass, A-DEC-5 pass, A-DEC-6 pass, A-DEC-7 pass, A-GRF-7 pass, A-DOC-1 unchecked, A-DOC-2 unchecked
Undone: A-DOC-1 and A-DOC-2 wait on W3 and W4 for the Archive and scope rows; my share of both is in
Commands: `bun x tsc --noEmit`, `bun scripts/test.ts`, `bash scripts/e2e.sh`, `bun src/cli.ts status /opt/ed/ivy` all exit 0
Issues: `/opt/ed/ivy/.claude/settings.local.json` still lacks the `PostToolUse` hook — `.claude` is gitignored, so only `factory update /opt/ed/ivy` installs it, and that rewrites the live session's hooks; A-DEC-8 needs it first
Deviations: the skill's `## Triage` section is gone, its rules folded into `## Decisions` — triage is now one decision per round and the 120-line cap left no room for both
Decisions:
- MEDIUM: an `auto` row is still answerable, so a human reading the table late can overrule a fork the dial let through; only `accepted` and `overruled` are final
- MEDIUM: the skill's Triage section folded into Decisions rather than shrinking the Graph or CLI blocks, keeping the ranking and findings.md rules at the cost of the heading
- MEDIUM: `decision list` is mission-scoped, unlike `gate list` which walks every project — Mission Control owns the cross-project view and answers nothing
- LOW: the hook appends rows verbatim instead of reparsing and rewriting the table, so a row it half-understands can never be lost
- LOW: several waiting decisions join with `; ` in the injected text, which reproduces the spec's one-row example exactly
- LOW: `answerDecision` returns `{ decision, changed }` so the command can print the dim no-op line the way `gate answer` does
- LOW: the Worker prompt lost two lines (goal merged with the reading order, the pre-handoff run became a Guardrails bullet) to hold the under-40 cap with the longer optional-fields line
