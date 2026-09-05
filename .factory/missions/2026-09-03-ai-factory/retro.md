# Retro: AI Factory v1

Feedback from agents to the human, mission `2026-09-03-ai-factory`. Not a status report, the mission folder already is one.

## Faster than expected

- Accept loop closed in 2 of 3 max rounds: round 1 fixed 7 findings in one implement pass, round 2 Verifier-only came back clean.
- igs dogfood (W6) found zero drift: every generic skill was already a dangling symlink, no reconciliation before relinking.
- Function-hooks API mapped with one-line throwaway modules through `claude plugin validate`, no live session burned until the human test gate.

## Cost

| Item | Why it cost attention |
|---|---|
| W4 spike | Stalled twice probing the plugin API by hand before the real engine event set landed (`ce6dfe0` guessed, `2b55fc2` corrected), see `transcripts/function-hooks-transcript.txt` |
| Rollout flag | `tengu_plugin_hooks_modules` off for this account, no local override, left A-HOOK-2/3 unchecked and forced a human-run test gate mid-mission |
| SendMessage deny | User-level `~/.claude/settings.json` deny outranks the preset `allow`, the orchestrator preset alone could not turn it on, needed a manual fix outside the mission |
| macOS `timeout` | No `timeout` binary on macOS, probing scripts written against GNU coreutils hung instead of failing fast during the W4 spike |

## Faster lines from handoffs

### Tooling
- One Bun script importing command functions beats ~110 CLI cold starts per check run, could become a real test (W2).
- `scripts/fixture-repo.sh` to walk the story workflow to a named step, replaces ~40 cold `bun` starts per accept round (implement-r1, Validator round 1 findings).
- Map an unknown API surface with one-line throwaway modules through `claude plugin validate`, a second each, before writing real hooks (W4).

### part.yaml schema
- Record each file's source in the manifest so `update` can verify ownership without `readlink` (W1).
- Hooks shorthand `{ events: [...], command }` to replace seven near-identical hook entries (W3, W5).
- `part.yaml` `requires` key so a part can declare it needs another part's agent (W5).
- `update --skip` and `requires` are one idea: a part could declare the project may own it (W6).

No Faster lines from I1, I2, or W2's CLI/prompt surfaces beyond the above.

## Workflow defaults to change

- Investigator recovery pass should gate spec, not run parallel with W1: spec was written before `recovery.md` landed, it only worked because W2 read the file later (deviation logged in `state.json`).
- Accept round default: when only one CLI behaviour changed, route to the one gatekeeper that covers it instead of both in parallel (round 2 ran Verifier only, decided by the orchestrator by hand each time).
- Worker prompt needs a time budget and a no-probe rule: building a mission by hand cost the Validator ~40 cold starts in round 1; a scripted fixture would have caught the missing-refusal finding on the first run.

## Docs: wrong or stale

| Doc | Was | Should be |
|---|---|---|
| `acceptance.md` A-CLI-1/A-CLI-2 | Pinned "five parts" | Unpinned to "all parts from YAML", fixed in round 2; a contract template should never pin a count later steps move |
| `plugins/factory/API.md` | Recorded a guessed event set first | Corrected to the real engine set (`engine.create`, `prompt.submit`, `turn.complete`, `tool.call`, `PreToolUse`) after live probing |
| `intent.md` Context | Implies `$.ui`, `$.model`, `$.http` etc reach the function body | `$` cannot be passed to functions, all ops sit inside the hook body itself (W4) |
| function-hooks spec | `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` reads as sufficient to enable | Also gated server-side by `tengu_plugin_hooks_modules`, no local override; the env var alone does nothing |

## Open items carried forward

- Re-check the `tengu_plugin_hooks_modules` rollout flag periodically; A-HOOK-2/3 stay unchecked until it flips.
- igs working tree has uncommitted `.claude` changes for the human to commit.
- `mission/ai-factory` and `mission/smoke` both left behind after close, by design ("keep branches for now"), flagged in findings as a retro item.
- `.claude/skills/{critic-self,dry,fork-critic}` in ivy are dangling legacy symlinks, owned by nobody, human to delete.
- Empty mission branches close without a merge commit (`git branch --merged` reports them merged already); the smoke mission needed a real change to exercise the merge path.
- Tokens per step deferred to the Mission Control mission; wall time only ships now.
- Mission Control, memory (`mem` MCP), global parts: all named as follow-up missions in `intent.md`, not started here.
- `step done`/`step start` refusal ordering: the running-state check fires before the gate check, so a gated step that never started reports "pending" instead of the gate message; accepted as-is in round 2.

## Handoff

Step: condense
Done: Read intent.md, spec.md, acceptance.md, recovery.md, findings.md, state.json, all nine handoffs, docs/terminology.md, docs-format.md, git log on mission/ai-factory. Wrote retro.md and memory-candidates.md in the mission folder.
Undone: No handoffs deleted or condensed, one handoff per step already exists (I1, I2, W1-W6, implement-r1), nothing mid-round to drop; the task for this run explicitly excluded touching handoffs/.
Commands: wc -l handoffs/*.md -> 75 total, one file per step; git log --oneline mission/ai-factory -> confirms mission/ai-factory and mission/smoke both still present
Issues: none
Deviations: none
Faster: none
Acceptance: none owned
