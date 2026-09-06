All eight round-1 assertions pass. Everything was reproduced against scratch HOMEs, not read off the Worker's handoff.

Findings file: `/opt/ed/ivy/.factory/missions/2026-09-06-control/findings-validate-r2.md`
Scripts: `/opt/ed/ivy/.factory/validator/handoff.ts` (new), `/opt/ed/ivy/.factory/validator/scratch.ts` (gained `gamma`), index at `/opt/ed/ivy/.factory/validator/scripts.md`, committed as `e17dc85`.

One thing you need to know before anything else: two `factory gate` calls of mine ran from `/opt/ed/ivy` instead of the scratch repo and wrote to the live `control` mission — an answered `merge` gate (`amend`, note "cli first") and an open `accept` gate. I removed both from `.factory/missions/2026-09-06-control/state.json` and restored `updated` to `2026-09-06T13:36:52.663Z`. The file is still dirty, but only with your own transitions (implement done, accept running, verify skipped plus its deviation). Please eyeball `git diff .factory/missions/2026-09-06-control/state.json` before you commit it. Since first answer wins on a gate, a stray `gate answer` is unrecoverable through the CLI, which is why it is filed as a finding.

```
Step: accept
Done: verify recipe run in full — `bun x tsc --noEmit` 0, `bun scripts/test.ts` 0 with 18 cases, `bash scripts/e2e.sh` 0 (`e2e: ok`), `bun src/cli.ts status /opt/ed/ivy` 0
Done: A-R1-1 driven by firing four real SubagentStop inputs at hook-factory (12, 6, 20, then 2 lines) — .md, -2, -3, no -4
Done: A-R1-2/3/7 driven through `--frames` on two scratch worlds plus a fresh empty HOME; a `failed` step hand-patched into state.json to reach the third branch
Done: A-R1-4 driven through a real `/tmp` project — install --parts, update, uninstall, dangling-link sweep, PARTS pane
Done: A-R1-5 driven under keys.ts: one accept that succeeded, one refused by a CLI answer landing behind the snapshot
Done: A-R1-6 and A-R1-8 read and grepped, including EventRow in model.ts and the committed prototype frames
Done: findings-validate-r2.md written; handoff.ts added and scratch.ts extended with `gamma`, both indexed and committed
Acceptance: A-R1-1 pass, A-R1-2 pass, A-R1-3 pass, A-R1-4 pass, A-R1-5 pass, A-R1-6 pass, A-R1-7 pass, A-R1-8 pass

Issues: `failed` is a RunState nothing under src/ can produce — the A-R1-2 branch is correct but unreachable without editing state.json by hand. Either `factory step fail` earns a place or the state leaves RunState.
Issues: a scratch HOME does not sandbox `factory gate|step|mission`; they resolve the mission from cwd. Worth refusing when the resolved project is not in `$HOME/.factory/projects`.
Deviations: I repaired `.factory/missions/2026-09-06-control/state.json` after my own two stray gate writes. Editing live mission state is outside a Validator's remit, but leaving a fake answered `merge` gate would have permanently blocked the real one. The damaged copy is at /tmp/state-damaged.json if you want the before.
Faster ways: `keys.ts` builds its snapshot once and never rebuilds, so testing a refusal means racing a background CLI call against a `sleep:` key — about 30 s per attempt. A `--after <shell>` flag that runs a command once the snapshot is built would make that deterministic and instant.
```
