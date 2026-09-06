# Validate r2 — the eight round-1 fixes

Round 2 covers `A-R1-1` … `A-R1-8` only, the three `verify` ids included: the step has no Verifier,
so the `verify` recipe was run here. All eight pass. Two findings, neither blocking.

Every run used a scratch `HOME=$(mktemp -d /private/tmp/vhome.XXXXXX)` built by
`.factory/validator/scratch.ts`, except `A-R1-4`, which wants a `/tmp` project because macOS makes
that a symlink to `/private/tmp` — the condition the bug needed.

## Verify recipe

| Command                        | Exit | Evidence                                                         |
|--------------------------------|------|------------------------------------------------------------------|
| `bun x tsc --noEmit`           | 0    | no output                                                        |
| `bun scripts/test.ts`          | 0    | 18 `✓` lines, 18 cases, `a handoff never overwrites the one before it` among them |
| `bash scripts/e2e.sh`          | 0    | `e2e: ok`                                                        |
| `bun src/cli.ts status /opt/ed/ivy` | 0 | `17 installed, 0 modified, 0 available`                          |

## Assertions

| id      | verdict | evidence                                                                                                                    |
|---------|---------|------------------------------------------------------------------------------------------------------------------------------|
| A-R1-1  | pass    | `handoff.ts <mission> 12 6 20` fired three real `SubagentStop` inputs at `parts/hook-factory/hook-factory.ts` (bound through `FACTORY_MISSION`, exit 0 each). Result: `implement-Worker.md` 12 lines `W1 line 1`, `implement-Worker-2.md` 6 lines `W2 line 1`, `implement-Worker-3.md` 20 lines `W3 line 1` — the longest last, nothing overwritten. A fourth input of 2 lines wrote no `-4`. `freeName()` now returns on `existing === ''`, the length compare is gone; the AGENTS.md invariant at line 151 says the same. |
| A-R1-2  | pass    | `--frames` on a scratch story mission: `· research   skipped`, `⊘ merge ⊘   blocked`, five `○ … pending` rows, `● implement   1m 47s`, `✓ grill   45s`, `✓ intent   0s`. With `spec` hand-patched to `failed` over a 90 s window the row reads `failed`, not `1m 30s` — the word wins over the duration for exactly the three states. |
| A-R1-3  | pass    | Status bar `⊘ BLOCKED  ████…  2/10   attention light` and `○ STUB  ████…  0/3`; MISSION header `2/10`. `grep -rn "\[+"` over all nine live frames, all nine of a second scratch world, and the eight committed `prototype/*.txt` returns nothing. |
| A-R1-4  | pass    | `install /tmp/vh4.u1MaKp/proj --parts commit` wrote `skill.md -> ../../../../../../../opt/ed/ivy/parts/commit/skill.md`; `readlink -f` = `/opt/ed/ivy/parts/commit/skill.md`, `test -e` true. `status` read `1 installed, 0 modified, 16 available`; after `update`, `14 installed, 0 modified` with `find .claude -type l ! -exec test -e {} \;` empty. The PARTS pane for that project reads `14/17` with no `modified` row, so the toggle is not inverted. `uninstall --yes` removed 14 parts and left no `.claude`. |
| A-R1-5  | pass    | Under `keys.ts`, two open gates. `↵ accept` on `verify` succeeded → row `✓ alpha/alpha  gate verify   answered`, `state.json` `verify.answer = accept`. Meanwhile the CLI answered `condense` `reject --note "cli got here first"` behind the screen's snapshot; `↵ accept` on that row left it `⊘ alpha/alpha  gate condense   <1m ago`, `MESSAGES (2)` unchanged, and the toast read `✗ gate condense was already answered reject at 2026-09-06T13:46:49.190Z — "cli got here first"`. `state.json` still holds the CLI's `reject`. |
| A-R1-6  | pass    | `README.md:38` in the command table: `| `factory --fixture`, `factory --frames <dir>` | Draw the demo snapshot; write the screen as text and exit, with no terminal |`. No second prose copy below the table. |
| A-R1-7  | pass    | Scratch world with `gamma` registered and never missioned: `gamma` heading followed by dim `no missions · factory mission new <name>`. A fresh empty HOME: `no projects · factory install <path>` under PROJECTS, three frames written, exit 0. |
| A-R1-8  | pass    | `grep -rn "\.mark\b\|\bmark\??:" src scripts parts .factory/validator` returns nothing. `EventRow` in `model.ts:41` is `{ at, verb, detail }`. The only `mark` left in `src/tui` is the `marker()` selection cell and its comment. |

## Findings

| id  | verdict | finding                                                                                                            | blast  | effort | conf |
|-----|---------|----------------------------------------------------------------------------------------------------------------------|--------|--------|------|
| -   | note    | `failed` is a `RunState` nothing can produce: no code under `src/` writes `steps.<name>.status = 'failed'`, and `step` takes only `start|done|skip`. The A-R1-2 render branch is right but unreachable until a step can fail | narrow | S      | high |
| -   | note    | A scratch `HOME` does not sandbox `factory gate|step|mission`: they resolve the mission from cwd, so a call made from the Factory checkout writes to the Factory's own live mission whatever `HOME` says | narrow | M      | high |

### `failed` has no producer

Repro: `grep -rn "failed" src/core src/commands` → nothing. `src/tui/live.ts:113` reads
`state?.status` straight through, so the word only ever appears if a human edits `state.json`.
Either give `factory step fail <step> --reason R` a home, or drop `failed` from `RunState` and the
glyph table. Checked by hand-patching the scratch `state.json`; that is the only way to see the row.

### cwd, not HOME, decides which mission a write lands in

Repro, in the Factory checkout: `HOME=/private/tmp/scratch bun src/cli.ts gate answer merge amend
--note x`. It prints `✓ gate merge amend` and writes `.factory/missions/<current>/state.json` here,
not in the scratch project — the scratch HOME only redirects `~/.factory/projects`, events and
config. It hit this round: two calls meant for the scratch world landed on `mission/control`,
adding an answered `merge` gate and an open `accept` gate, both removed by hand (the surrounding
Orchestrator transitions in that file are untouched). Because first answer wins on a gate, a stray
`gate answer` is not recoverable through the CLI — the real gate can never be answered afterwards.
A one-line guard would catch it: refuse when the resolved project is absent from `$HOME/.factory/projects`.

## Scripts

`.factory/validator/handoff.ts` added — fires n `SubagentStop` inputs at the hook and lists
`handoffs/`. `scratch.ts` grew `gamma`, a registered project with no missions, which A-R1-7 needed.
Both indexed in `.factory/validator/scripts.md`, along with the cwd trap above. Nothing pruned:
`scratch.ts` and `keys.ts` both still reach what they claim.
