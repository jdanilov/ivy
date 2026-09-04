# Recovery: AI Factory v1

Agent-facing. One line per failure: `situation | state left behind | detection | recovery`.

## Story step: grill

- orchestrator session killed before intent.md written | state.json step=grill, no intent.md, claim still bound to dead session | `factory status` shows mission with no session in 10 min | `factory mission resume` re-checks out branch, orchestrator re-reads state.json, resumes grill, nothing to repair
- session killed mid-grill after partial intent.md draft | half-written intent.md on disk, step still `running` | `factory status` no-session flag, file mtime stale | orchestrator on resume re-reads partial intent.md, continues or discards, no CLI state to fix

## Story step: intent (gate: human)

- gate answered twice, once in Warp session once in Inbox | two `factory gate answer` calls race | second call sees gate.status already `answered` | `gate answer` is idempotent on same answer, refuses with the first answer's note on conflicting answer, orchestrator reports the conflict to the human
- gate left open, session killed before answer | state.json gates.intent.status=open, step stuck at intent | `factory status` no-session plus `factory mission status` shows open gate | `factory mission resume` reprints the gate content, human or orchestrator answers via `factory gate answer`
- worker/orchestrator crash mid step | see step start/done section below, same recovery for every gated step

## Story step: spec

- Investigator (I1 or I2) crashes before recovery.md or docs/design.md written | spec step marked done without the artefact, W2/I2 stalls | acceptance check A-REC-1/A-DLS-1 fails, missing file on disk | orchestrator reruns the Investigator pass as a fresh sub-agent, no shared state to clean since Investigator is read-only
- acceptance.md written but recovery.md missing because I1 pass never ran | spec step status=done, downstream steps reference a file that does not exist | `ls` in mission folder, grep for recovery.md | orchestrator re-runs I1 before letting W2 start, records a deviation with reason

## Story step: implement (role: worker)

- worker sub-agent crash mid-step, partial file edits on the branch, no handoff | working tree dirty on `mission/<name>`, step status=running, `handoffs/implement.md` absent | `factory status` no-session flag on the bound session, `git status` shows uncommitted changes | orchestrator inspects diff, re-runs the worker fresh (clean context) or hand-fixes, then `factory step done implement`
- orchestrator (bound) session killed while a worker step is running | step status=running with stale `startedAt`, no `endedAt` | no session in `~/.factory/events/` for 10 min | `factory mission resume` re-attaches a new session id via `factory mission adopt`, worker's partial work is on the branch, orchestrator decides continue or redo
- worker finishes but never commits | uncommitted changes on mission branch, handoff claims done | `git status` dirty after `step done` | orchestrator or Commit agent commits before moving on, `step done` does not require a clean tree by itself so this is a manual check in the worker prompt

## Story step: accept (parallel verify, validate; loop back to implement, max 3, human_from 2)

- one of verify/validate crashes, the other completes | `findings.md` has entries from one gatekeeper only, accept step still `running` | orchestrator sees only one set of assertion ids covered | orchestrator reruns the crashed gatekeeper alone (both never edit code, safe to rerun), `step done accept` still refuses until both parallel members answered per A-MIS-3-style check
- findings.md partially written when a gatekeeper is killed mid-write | truncated markdown, some assertion ids missing rows | coverage rule fails, ids without pass/fail/unchecked | orchestrator reruns that gatekeeper fresh, appends missing rows, no partial state to merge since gatekeepers overwrite their own section
- `step done` called on accept while a parallel member has not answered | CLI refuses | non-zero exit | orchestrator waits for or reruns the missing gatekeeper, then retries

## Story step: loop (accept -> implement)

- `step loop accept` records round then session dies before the human triage item is delivered | state.json round incremented, step back to `implement`, no triage record in Inbox/session | `factory status` shows round N with no session | `factory mission resume` reprints the last triage plan from findings.md, orchestrator re-delivers it
- round reaches `max` with findings still open | loop step would want another round but cap hit | `factory step loop` refuses past max, or state.json round == workflow max | this becomes a forced human gate regardless of attention mode, orchestrator opens a gate rather than looping again
- attention mode changed mid-mission (e.g. light to full) after round 1 already auto-decided | state.json attention field updated but round 1 triage already recorded without human | inspect deviations array for the attention change | no rollback, round 1 stands, deviation recorded with reason, round 2 onward follows new mode

## Story step: condense (role: summarizer)

- Summarizer crash before retro.md written | condense step marked done, retro.md absent | `ls` mission folder, missing file | orchestrator reruns Summarizer fresh, headless, idempotent since it only reads artefacts and transcripts
- Summarizer runs twice (retry after apparent crash that actually finished) | two retro.md-writing passes, second overwrites first | git diff on mission folder shows retro.md changed after being committed | acceptable, retro.md is overwrite-safe, last write wins, no merge needed

## Story step: merge (gate: human)

- gate answered twice (session and Inbox race) | same as intent gate, second answer rejected or reports conflict | second `gate answer` call sees status=answered | idempotent, orchestrator surfaces the discrepancy if answers differ
- `mission close` attempted before merge gate answered | close refuses | non-zero exit, message names the open gate | human answers the gate, orchestrator retries close

## W2 CLI: mission new

- interrupted between branch creation and state.json write | `mission/<name>` branch exists, checked out, no `.factory/missions/<name>/state.json` | `git branch` shows the branch, mission folder missing or incomplete, no claim | `factory mission new` re-run detects the orphan branch (same name), reuses it, writes the missing folder and state.json instead of erroring; if ambiguous, human deletes the orphan branch and reruns
- interrupted after folder and state.json written, before claim written | mission folder exists, no `.factory/claim` | folder present, `factory status` shows the mission as an orphaned/unclaimed entry | resume-equivalent: rerun `mission new` logic for claim only, or `factory mission adopt` writes the claim
- second `mission new` on a checkout whose claim names a dead session | claim file present, session not in events for 10 min | claim lookup finds no live session | CLI still offers the worktree prompt per spec (claim is per-mission not per-session-liveness), human can also manually clear stale claim once `close`-verified; the dead session itself is later handled by `resume`/`adopt`

## W2 CLI: step start / done / skip / add / loop

- `step start` called twice for the same step (two sessions racing, one orchestrator, one accidental adopt) | step status flips running->running, `startedAt` overwritten by the second call | second caller's `startedAt` clobbers the first, timestamps look wrong | `step start` should be idempotent, refuse or no-op if already `running` with a warning naming the existing `startedAt`
- `step done` on a gated step with the gate unanswered | CLI refuses | non-zero exit | `factory gate answer` then retry `step done`
- `step done` on a step with an unanswered `parallel` member | CLI refuses | non-zero exit | finish or rerun the missing parallel member, retry
- `step skip` interrupted mid state.json write | partial/corrupt JSON on disk | `factory status`/any command fails to parse state.json | CLI must write via temp file plus atomic rename so partial writes never land; recovery is `factory mission resume` reading the last good write, human restores from git history of the mission folder if the corrupt file was already committed
- `step add` names a step that already exists | duplicate step name in workflow.yaml copy | validation error naming the step | orchestrator picks a distinct name or edits the existing step instead
- `step loop <step>` where `loop.back` is not an earlier step | rejected at workflow load per A-MIS-6 | error names the step | fix workflow.yaml copy, no state.json changes happened since validation runs first

## W2 CLI: gate open / answer

- `gate open` called twice for the same step | second call overwrites the gate content path, status stays `open` | inspect state.json gates[step].at changes | last open wins, orchestrator re-draws the latest content, no data loss since gate content is a file reference not the payload itself
- `gate answered twice`, once via plugin tool, once via CLI fallback racing the same gate | both attempt to set status=answered | second write sees status already `answered`, values could differ | `gate answer` is idempotent: first writer wins, second call is a no-op that reports the existing answer instead of erroring destructively

## W2 CLI: handoff save

- `SubagentStop` hook has no transcript path in its input | handoff never captured, `handoffs/<step>.md` absent | file missing after step marked done | fallback: orchestrator runs `factory handoff save <step>` itself, pasting the sub-agent's final message from its own context
- `handoff save` interrupted mid stdin read | partial/truncated `handoffs/<step>.md` | file exists but shorter than expected, missing template fields | orchestrator or human reruns `handoff save <step>` before condense reads it, overwrite is safe (handoffs are append-once per step, not appended-to)

## W2 CLI: mission adopt / resume / close

- two sessions adopt one mission concurrently | state.json `session` field overwritten by whichever adopt call wrote last, both sessions think they are bound | `factory status` shows one live session in events, the other's hook events also land in the same mission's stream causing mixed step transitions | `mission adopt` must set session id and refuse (or warn) if the existing session is still live per events; human closes the stale tab, re-adopt
- `mission resume` from a worktree whose main checkout has moved (main advanced, or `mission/<name>` deleted from main) | worktree still checked out on `mission/<name>`, main checkout's HEAD no longer matches what the worktree branched from | `git worktree list` from the worktree still resolves the mission folder in main, but `git log` shows main has diverged or the branch is gone from main's ref list | `resume` resolves the mission folder via `git worktree list` regardless (per A-MIS-8), then reports the divergence; orchestrator rebases or leaves as is until close, close will detect the unmerged/diverged branch and refuse if merge cannot fast/no-ff cleanly
- `mission close` with an unmerged branch (merge produces conflicts) | merge aborted mid-way, working tree may have conflict markers, status not yet `closed` | `git status` shows merge in progress, `mission close` exits non-zero | human resolves conflicts and commits, or `git merge --abort`, orchestrator or human reruns `factory mission close`
- main moved under the mission branch (main has new commits made outside the mission after the branch was cut) | `mission/<name>` branch base is behind main, `--no-ff` merge is still possible but risks unrelated conflicts | `git log main..mission/<name>` and `git log mission/<name>..main` both non-empty | close still runs `--no-ff` merge; on conflict same recovery as above; orchestrator may rebase the mission branch onto main first as a deviation, recorded with reason
- crash between merge commit and clearing claim / removing worktree | merge landed on main, `.factory/claim` still present, worktree still on disk, state.json still `status: open` | `git log --merges` shows the merge, but `factory status` still lists mission as open with a claim | `mission close` must be idempotent: rerun detects the merge already happened (mission folder committed, branch merged) and only performs the remaining steps: clear claim, remove worktree, set closed
- worktree left after close (rm failed, e.g. dir in use or uncommitted changes inside it) | worktree directory still exists on disk, `git worktree list` still lists it, but claim cleared and status closed | `git worktree list` shows a stale entry Factory no longer tracks in state.json | `git worktree remove --force` after confirming no uncommitted work, or `git worktree prune` if the directory was deleted manually first
- claim left by a dead session (session killed without the mission ever closing) | `.factory/claim` still names the mission, session has no events for 10+ min | `factory status` shows the project claimed with `no session` | `factory mission resume` re-binds a live session to the existing claim; only `mission close` clears the claim, so a stuck claim with no intention to close requires a human to close or manually delete `.factory/claim` and record the deviation

## W2 CLI: worktree creation

- worktree creation interrupted after `git worktree add` but before state.json records the path | worktree exists on disk and in `git worktree list`, but the second mission's state.json has no `worktree` field | `git worktree list` shows an entry state.json doesn't know about | rerun the worktree step of `mission new`, it detects the existing worktree by path convention `../<repo>-<name>` and records it instead of creating a duplicate
- two worktree creations target the same path (retry after a failure that actually partially succeeded) | `git worktree add` fails second time, path already exists | non-zero exit, git error naming the path | CLI checks `git worktree list` first, reuses the existing worktree if branch matches, else asks the human to remove the stale path

## Rules for W2

- write `state.json` before creating the branch is wrong for `mission new`; instead: create the branch and folder first, write `state.json` last, so an interrupted run leaves an orphan branch (cheap to detect and reuse) rather than a state.json pointing at a branch that does not exist
- claim always carries `{ mission, session, at }`, never mission name alone, so liveness is checkable against events without a second file
- every state.json write is atomic: write to a temp file in the same directory, then rename, never partial JSON on disk
- `step start`, `gate open`, `gate answer`, `mission adopt`, `mission close` are idempotent: calling them again in the same state is a no-op or a reported conflict, never a crash or silent overwrite of a differing value
- `mission close` checks its own postconditions before acting: if the merge commit already exists on main, skip straight to clearing claim, removing worktree, setting closed
- `mission resume` and `factory status` always resolve the mission folder through `git worktree list`, never through a hardcoded relative path, so worktrees and moved checkouts still find it
- every transition that disagrees with `workflow.yaml` appends a `deviations` entry with a reason, so recovery via resume can explain why state doesn't match the workflow copy
- `mission adopt` refuses a second bind while the current session is live in events, unless forced with a reason that is recorded as a deviation
- worktree removal is a separate, retryable step from clearing the claim; close does not consider itself failed if worktree removal fails, it reports the leftover path
