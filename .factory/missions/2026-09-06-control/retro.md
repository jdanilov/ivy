# Retro: Mission Control wiring

Feedback from the agents on this mission to the human. Roadmap items already recorded
(`step add --after` pointer, `failed` RunState, cwd-not-HOME sandboxing, test-suite HOME leak)
are not repeated here — their reasons on `docs/roadmap.md` still stand as written.

## Tools

- The handoff-naming collision (F1, now fixed) silently overwrote evidence three separate times
  in this one mission before anyone noticed: prototype rounds 1 and 2, then W1 and W2 of
  `implement`. Every loss happened to land on a commit boundary, which is the only reason
  `git show` could recover any of it — a mission that forgot to commit between sub-agents would
  have lost the work itself, not just the handoff.
- `.factory/validator/keys.ts` builds one snapshot and never rebuilds, so proving a race (a CLI
  answer landing behind the screen's own write) means racing a real ~30s sleep against a
  background process each attempt. A `--after <shell>` flag that runs a command once the
  snapshot is ready would make that instant and deterministic.
- Fixture frames stamp ACTIVITY rows with `Date.now()` at generation time, so regenerating them
  rewrites those rows even when the screen itself did not change — most of round 2's 83-line
  frame diff was the clock, not the fix. A fixed epoch in `fixture.ts` would make frame diffs
  worth reading.
- Three separate agents (prototype W1, prototype W2, accept-Verifier) independently rediscovered
  that a scratch script importing `src/tui/*` must live inside the repo, or Bun resolves a second
  `@opentui/core` from its global cache and every `instanceof` in the renderer fails silently.

## Context

- Two assertions in `acceptance.md` were written more specific than the thing they were checking:
  A-DOC-1 names "three" step colours where the shipped design (W3's later revision) has four;
  A-RFR-2's "flat within 20%" doesn't budget for the renderer's own ~200-render allocator
  warmup. Neither was a real bug, both cost a gatekeeper a judgement call instead of a clean
  pass/fail. This is the same "assertions should state invariants, not counts" lesson the refit
  mission already proposed as a memory — this mission is a second, independent confirmation of it.
- `intent.md`'s 800-line budget for `src/tui/` was already 2.75x understated by the time the
  first Worker (read side alone) finished round 0; the spec caught it and raised the budget, but
  a number set before any code exists is worth flagging as provisional rather than a guardrail.

## Workflow

- Splitting `implement` into three serial Workers by concern (read side / write side / screen)
  worked, but it is also exactly the shape that broke handoff naming — treat one Worker per step
  as the default, and only reach for a serial split when a step's own spec partitions the work as
  cleanly as this one did.
- Gatekeepers who independently re-derived a fact (`scanProject` vs `factory status`, a real
  `mission new` + `--frames` smoke test) caught two small inaccuracies in Worker self-reports
  (a stale "still needs a fix" claim, a test count off by one) that trusting the handoff's prose
  would have missed. Worth keeping as the gatekeeper's default move, not just a "faster way."
- `accept`'s round 2 skipped the Verifier by hand-reasoning "the Validator's fix set is
  mechanical, `verify` recipe already covers it" — sound this time, but if that reasoning recurs
  across missions it deserves a routing rule in `workflow.yaml`, not a fresh deviation each time.

## Memories

See `memory-candidates.md` in this folder.

## Handoff

Step: condense
Done: read intent, spec, acceptance, findings (+verify/validate/validate-r2), state, workflow,
  every handoffs/ file, W1 and W2's implement handoffs from git history (`63b0e89`, `5afbae4`),
  and `git log main..mission/control`
Done: wrote `retro.md` and `memory-candidates.md` in this mission folder
Done: condensed `handoffs/` from 9 files to 6 — removed `prototype-Worker-2.md` (round 3,
  superseded by round 4's `prototype-Worker.md`), `accept-Verifier.md` and `accept-Validator.md`
  (round 1, fully covered in more detail by `findings-verify.md` and `findings-validate.md`,
  which stay); kept `prototype.md`, `prototype-Worker.md`, `sounds-Worker.md`,
  `implement-Worker.md`, `implement-Worker-r1.md`, `accept-Validator-r1.md` as the last-round
  or non-duplicate record of each step
