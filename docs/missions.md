# Missions

The `mission | step | gate | decision | handoff` command family and the invariants every
transition keeps. Read when touching `src/core/mission.ts`, `decision.ts`, `workflow.ts`,
`spawn.ts`, `src/commands/mission.ts` or `parts/hook-factory/`.

## Commands

All five act on the checkout you are standing in, never prompt (the one exception is the worktree
offer in `mission new` on a claimed checkout) and exit 1 with a one-line `✗ …` on a refusal.

```
factory mission new <name> [--stub] [--quick] [--workflow W] [--autonomy full|partial|none] [--title T] [--worktree] [--no-open]
factory mission shape <preset> [--autonomy L] | autonomy full|partial|none [name]
factory mission open [name] [--preset orchestrator|quick|research] [--dry-run]
factory mission list [--all] | status [name] | adopt <name> --session <id> | resume [name] | close [name] [--keep-branch]
factory mission archive <name> | unarchive <name>
factory step start|done|skip <step> [--reason R] | add <step> --after X [--role R] --reason R | loop <step>
factory gate open <step> --file F | answer <step> accept|amend|reject [--note N] | list
factory decision add "<summary>" --confidence HIGH|MEDIUM|LOW [--step S] [--by R]
factory decision answer <id> accept|overrule [--note N] | list [--waiting]
factory handoff save <step>            # reads the handoff from stdin
```

## Invariants

- `mission new` creates the branch and folder first and writes `state.json` last, so an interrupted
  run leaves an orphan branch the next run reuses, never state pointing at a branch that is not there.
- Every `state.json` write is a temp file plus rename. No partial JSON ever lands.
- `step start`, `gate open`, `gate answer`, `mission adopt`, `mission close` are idempotent. First
  answer wins on a gate; a conflicting second answer is refused, not overwritten.
- `mission close` checks its own postconditions, so a rerun after a crash finishes the remaining work.
- The mission folder always resolves through `git worktree list`, so worktrees find it in the main checkout.
- Any transition that disagrees with `workflow.yaml` appends a `deviations` entry with a reason.
- `mission open` writes the session id to `state.json` before the tab exists, so the first hook
  event the new session emits already finds a mission bound to it.
- `hook-factory` never fails a hook: every step is guarded and the script always exits 0.
- A decision is one row in the mission's `decisions.md`, `id | step | by | confidence | summary |
  status | note`, written temp plus rename by `src/core/decision.ts` and, standalone, by the hook.
  `waits(autonomy, confidence)` decides `waiting` over `auto` at filing: `full` waits on nothing,
  `partial` on `LOW`, `none` on all three. `step start` refuses while a decision waits, naming the
  ids; first answer wins, the same verdict again is a no-op and a different one is refused.
- The hook files the `Decisions:` block of a `SubagentStop` final message and, on `PostToolUse`
  matcher `Agent` and on `UserPromptSubmit`, tells the Orchestrator which decisions wait. It never
  logs `PostToolUse` to the events file: one Agent result per row would drown the bus.
- A `SubagentStop` handoff lands in `handoffs/<step>[-<agent>][-r<round>].md`: a message under five
  lines is not saved, and an existing handoff is never overwritten, whatever the lengths — the second
  save of one name takes `-2`, the third `-3`.
- A claimed mission whose `state.json` has `session: null` adopts the first session to send a
  `SessionStart` or `UserPromptSubmit`; a session already recorded is never overwritten.
- `mission new` and the promotion in `mission open` add `.factory/claim`, `.factory/missions/` and
  `.factory/archive/` to the project `.gitignore`, only the lines nothing ignores yet, committing
  them when the file is otherwise clean, and `mission close` never counts anything under
  `.factory/` as dirt: the Factory's own files cannot block the Factory.
- A stub is a mission with `status: stub` and `branch: null`: folder, workflow copy and an
  `intent.md` skeleton, no branch and no claim. Every command that needs a branch refuses with
  `mission <name> is a stub, open it first`; `mission open` promotes it and then proceeds as usual,
  landing in the same state `mission new` would have.
- `mission close` commits nothing and never `git add`s the mission folder, which is ignored:
  `status: closed` in its own `state.json` is the postcondition a rerun reads back. It refuses
  when anything outside `.factory/` is dirty, naming the paths, and merges the branch when the
  trunk does not already hold it.
- `mission close` deletes `mission/<name>` last, after the worktree is gone and the merge landed;
  `--keep-branch` keeps it, and a branch git will not delete is reported, never forced.
- `mission new` without `--workflow` copies `intent.yaml`, one human-gated step and nothing after
  it. `mission shape <preset>` appends that preset's own steps behind `intent`, adds their pending
  `steps` entries and records the preset as `state.workflow`; it refuses once anything follows
  `intent` (`already shaped as story`) unless the preset is the one already there, and refuses a
  preset that does not start with `intent`. `--autonomy` on either sets the dial; `mission autonomy
  L` moves it later, with a `deviations` entry.
- One pointer rule serves `step add` and `mission shape`: after an insert, when the step before the
  new one is done or skipped and the pointer stands on it or on the step the insert displaced, the
  pointer moves to the new step. Anywhere else the pointer stays where it was.
- `mission new`, `mission list` and everything that resolves a mission refuse when the main
  checkout is not in `~/.factory/projects`: `✗ /x is not a registered project — run: factory
  install /x`. The projects file lives under `HOME`, which is what makes a scratch `HOME` a sandbox
  rather than a suggestion. The hook is unaffected — it binds by claim, not by the projects list.
- `mission open --dry-run` writes nothing at all, a stub's promotion included, and `mission open`
  on a closed mission refuses. Either way `state.json` is byte-identical afterwards.
- `mission open` on a mission whose `state.json` names a session that is still live refuses with
  `mission X is bound to session <id> — factory mission adopt X --session <id> to rebind`: a second
  open would point the mission at an empty tab and every event of the session already on it would go
  nowhere. A recorded session with no live events file is replaced, so a mission whose tab was closed
  opens again. Mission Control's `O` raises the same refusal as a toast.
- `mission new` on a claimed checkout with no tty on stdin refuses with `add --worktree` instead of
  hanging on a prompt nobody can answer, and leaves no folder behind.
- `mission archive <name>` refuses unless the mission is closed and renames its folder into
  `.factory/archive/`; git is not involved, both folders are ignored. `unarchive` is the reverse,
  both are idempotent, and only `mission list --all` reads the archive.
- `mission list` and `gate list` skip a registered project whose path is gone. The projects file keeps it.
