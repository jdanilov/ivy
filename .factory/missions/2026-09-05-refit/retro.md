# Retro: Factory refit

Feedback from agents to the human, mission `2026-09-05-refit`. Not a status report, the mission folder already is one.

## Faster than expected

- Accept loop closed in 3 of 3 max rounds, each pass small: round 1 fixed 9 findings in one Worker pass, round 2 fixed 3 more and passed.
- `--yes` on install/uninstall plus `.factory/factory.yaml`'s new `verify`/`e2e` recipes cut round 1 validation from a hand-timed pty dance to a 40-second scripted run (asked in W1, shipped in R1, confirmed by accept-Validator-r1).
- igs dogfood (W5) found the exact codegraph hand-wiring diff in one read-only pass, no drift beyond the one expected conflict row.
- The snippet and recipe engine (W1) — the two genuinely new mechanisms — passed every verify-kind assertion across all three rounds with no fail.

## Cost

| Item | Why it cost attention |
|---|---|
| Parallel-worktree close (R1-1) | Two missions in worktrees deadlocked each other's close; needed a full extra implement round to scope the dirty scan past `.factory/missions/*` |
| Contract wording (A-DOG-1, A-R2-3) | Two assertions pinned exact behaviour — "creates docs/roadmap.md", a byte count — that broke on real project state (igs owns its own roadmap) or table padding; both needed a live wording amendment |
| archify vendoring (W3) | Two-file vendor was non-functional (`doctor` needs 28 files); W6 became a whole extra Worker to redesign it as a clone recipe |
| pty-only install/uninstall (round 0) | Every check needed `script -q /dev/null` and timed keystrokes until `--yes` shipped in round 1 |

## Faster lines from handoffs

Testing and CLI ergonomics:
- `--yes` on install/uninstall (W1) — done in R1, is why later rounds got fast.
- `install --parts a,b` (R1-r1, accept-Validator-r1/-r2) — still missing; validating an opt-in part (codegraph, archify) still needs a throwaway registry clone.
- `.factory/factory.yaml` `ready: ["bun src/cli.ts status ."]` plus a two-mission `--worktree` block in `scripts/e2e.sh` — asked by every gatekeeper across all three rounds; the shipped suite could not have caught R1-1.
- A non-trimming `git()` sibling (W2, orchestrator) — `git status --porcelain`'s leading status column gets trimmed away by the existing helper, worked around ad hoc, not fixed at the source.

part.yaml schema:
- A directory `source` in `files[]` (symlink plus manifest-hash the tree) would have made the archify vendor one line (W3-W4); moot once W6 repointed archify at a clone recipe, worth keeping for the next large vendor.
- `git clone --filter=blob:none --sparse` would halve archify's clone (11.4MB to 5.8MB) at the cost of a git 2.25+ floor (W6); not taken.

## Workflow defaults to change

- Contracts should not pin exact counts, created-file names or blanket line limits that a real project's own state or a table's padding can legitimately break — A-DOG-1 and A-R2-3 both needed a live amendment this mission.
- Orchestrator must never commit while a Worker is running: one mid-step commit swept a Worker's staged `git rm`/`git mv` into an unrelated commit.
- `mission new` without `open` leaves `session: null`, so `SubagentStop` saves no handoff until `mission adopt` runs by hand — auto-adopt the interactive session, or fall back to the claimed mission.
- `hook-factory`'s `SubagentStop` names the handoff after the current step only: a Commit sub-agent overwrote `handoffs/implement.md` with a 36-byte line. Name by step plus agent type, never let a shorter save overwrite a longer one.

## Docs: wrong or stale

None found beyond what this mission itself rewrote (`docs-format.md`, `AGENTS.md`, `docs/terminology.md`) — those are the fix, not a finding.

## Open items carried forward

Already on `docs/roadmap.md`, not repeated here: Mission Control (2 lines), Memory, Global parts, Codex harness, tokens per step, `status` overcounting `skipIfExists` templates, `mission new` on a claimed no-tty checkout exiting 0 instead of refusing, `mission open --dry-run` promoting a stub before it prints.

Not yet on the roadmap:
- `.factory/factory.yaml` needs a `ready` recipe and `scripts/e2e.sh` a two-mission `--worktree` block — asked three times this mission, never added.
- `install --parts a,b` to validate opt-in parts without cloning the registry.
- `git()` in `src/core/mission.ts` trims stdout, breaking porcelain-style parsing at the source; add a non-trimming sibling.
- `hook-factory`'s `SubagentStop` handoff-naming and shorter-overwrites-longer bug.
- `mission new` without `open` never binds a session for `SubagentStop` to save into.
- Install codegraph on ivy itself, the first real per-project dogfood of that part.
- `uninstall` leaves a `docs/` directory it created (skipIfExists templates), cousin of the `status` overcount item already on the roadmap.
- `mission close` leaves `mission/<name>` branches behind after removing worktrees — by design since ai-factory, still undecided.

## Deleted from handoffs/

Round 0 and round 1 gatekeeper handoffs (`accept.md`, `accept-r1.md`, `accept-Verifier.md`, `accept-Verifier-r1.md`, `accept-Validator.md`, `accept-Validator-r1.md`) — their evidence and verdicts are reproduced in full in `findings.md`, `findings-verify.md` and `findings-validate.md`, which are kept. `accept-r2.md` (a one-line orchestrator note) folded the same way into `findings.md`'s round 2 triage. Kept `accept-Validator-r2.md` as the last round's record. All `implement` step handoffs (W1, W2, W3-W4, W5, W6, R1-r1, implement-r2) kept: each round built or fixed non-overlapping ground, none is covered by a later one. Also deleted `handoffs/condense-r2.md`, a 32-byte `hook-factory` SubagentStop autosave ("Checking line count of retro.md") caught mid-run by this very step — live evidence for the Workflow item above.

## Handoff

Step: condense
Done: Read intent.md, spec.md, acceptance.md, findings.md, findings-verify.md, findings-validate.md, state.json, all 17 handoffs, workflow.yaml, AGENTS.md, docs/roadmap.md, `.factory/missions/2026-09-03-ai-factory/retro.md` for shape, and `git log --oneline main..HEAD`. Wrote retro.md and memory-candidates.md in the mission folder.
Done: Deleted 8 handoffs (accept.md, accept-r1.md, accept-Verifier.md, accept-Verifier-r1.md, accept-Validator.md, accept-Validator-r1.md, accept-r2.md, condense-r2.md), all covered by findings.md/findings-verify.md/findings-validate.md or a stray autosave; see "Deleted from handoffs/" above for the reasoning.
Undone: implement step's 7 handoffs (W1, W2, W3-W4, W5, W6, R1-r1, implement-r2) were not condensed — each covers ground no other handoff or findings file restates in comparable detail.
Acceptance: none owned
