Findings filed. Final handoff below.

Step: accept (round 1, Verifier)

Done:
- Read intent.md, spec.md, acceptance.md, workflow.yaml, state.json, and the surviving `handoffs/implement-Worker.md` (discovered W1/W2's handoffs were overwritten by the naming collision, see findings).
- Ran the `verify` recipe from `.factory/factory.yaml`: `bun x tsc --noEmit` (exit 0), `bun scripts/test.ts` (exit 0, 17/17), `bun src/cli.ts status /opt/ed/ivy` (exit 0, 17 installed/0 modified) — used a scratch `HOME` for the status run.
- Read and cross-checked every owned assertion against `src/tui/{live,transcript,watch,model,actions,notify,screen,frames}.ts`, `src/core/{mission,config,parts}.ts`, `src/commands/{control,uninstall}.ts`, `parts/validate/agents/Validator.md`, `docs/{design,terminology,roadmap}.md`, `AGENTS.md`, `README.md`.
- Ran independent checks beyond reading: `scanProject('/opt/ed/ivy')` diffed against `factory status` (A-SRC-6); a scratch repo `mission new` + `factory control --frames` end-to-end smoke confirming the read side and the `+N −M` diff row work against real files (A-UI-4); a 1500-iteration headless render loop with RSS sampling for A-RFR-2 (script lived at repo root, deleted after).
- Wrote `.factory/missions/2026-09-06-control/findings-verify.md` with per-assertion evidence and five baseline findings.

Acceptance: A-SRC-4 pass, A-SRC-5 pass, A-SRC-6 pass, A-TRX-1 pass, A-TRX-3 pass, A-RFR-1 pass, A-RFR-2 pass (caveat — see findings), A-ACT-3 pass, A-ACT-4 pass, A-ACT-6 pass, A-ACT-7 pass, A-ACT-8 pass, A-NTF-1 pass, A-NTF-2 pass, A-DOC-1 pass, A-DOC-2 pass, A-DOC-3 pass, A-UI-4 pass, A-VAL-1 pass.

Issues:
- The mission's own handoff-naming convention (`handoffs/<step>[-<agent>][-r<round>].md`) collided across W1/W2/W3, who all wrote to `implement-Worker.md`; each rewrote rather than appended, so W1's and W2's evidence is gone from the working tree (recoverable only via `git show <commit> -- handoffs/implement-Worker.md` on `63b0e89` and `5afbae4`). This is a process defect worth fixing before the next multi-Worker mission on one step.
- The surviving handoff contains two small inaccuracies: an "Issues" note describing two `docs/design.md` drifts that the same commit already fixed, and a test count off by one (claims 18, actual 17).
- `EventRow.mark` (`src/tui/model.ts:45`) is dead: written once by the fixture, read nowhere.

Deviations: none from the workflow; findings above are quality notes, not blocking failures.

Faster ways: `scanProject` vs `factory status` and the `mission new` + `--frames` smoke test were quick, high-confidence ways to check A-SRC-6 and A-UI-4 without trusting the Workers' prose — worth doing first on any future TUI-wiring round before reading code line by line.
