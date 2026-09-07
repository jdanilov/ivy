Work committed on `mission/decisions` as `35aa172` (code) and `cc78fba` (docs). Tree clean apart from `parts/explain/skill.md`, which was already modified when I arrived and is not mine.

Key files: `/opt/ed/ivy/src/tui/screen.ts`, `/opt/ed/ivy/src/tui/live.ts`, `/opt/ed/ivy/src/tui/model.ts`, `/opt/ed/ivy/src/tui/fixture.ts`, `/opt/ed/ivy/src/tui/actions.ts`, `/opt/ed/ivy/docs/design.md`.

```
Step: implement
Done: model.ts — Mission gains autonomy, archived, preset, decisions and deviations as `<what>: <reason>` strings, loses caffeinate; StepRow carries role and model; InboxItem.kind is gate|decision|question with one `answer` field holding the session command; Snapshot gains `global: PartRow[]`; PartRow gains description; Ui gains `foot` and `showArchived` and loses answer, answered and note
Done: stepKind maps through stepRole — worker/investigator agent, verifier/validator gatekeeper, a parallel group its members', `gate: human` human — with grill, accept and condense kept by name for closed missions' workflow copies
Done: live.ts reads decisions.md per mission, `.factory/archive/*` through listArchived as archived rows, the global manifest through scanProject(home()), and files each open gate and each waiting decision into the Inbox; triagePlan and the caffeinate pid read are gone
Done: left column — `~ global` above the projects opening PARTS on ~/.claude, apply routing through install(home()) and removeParts(home()); archived missions dim behind `Z`, which replaces hide-closed
Done: foot — DECISIONS by default, one row per decision of the selected scope with ⊘ waiting, ✓ accepted, ✗ overruled: note and dim auto rows, the mission column only when more than one is in scope; `A` ACTIVITY, `D` back, `F` full height for either with ↑↓ scrolling through one shared window helper
Done: MISSION pane — graph rows name runner and model, four aligned label/value rows (step, branch, session, deviations), deviations absent at zero
Done: MESSAGES read-only — answer row, note prompt, InputRenderable, `record`, `ANSWERS` and actions.answerGate removed; each row shows `answer in the session: factory gate|decision answer …`; inboxKey is now project/origin/label so a second waiting decision rings
Done: PARTS shows each part's description, `Y Confirm`/`N Cancel` capitalised, `↵ Apply · Esc Discard` while pending, and Esc discards the toggles before it leaves the pane
Done: `T` cycles autonomy through mission autonomy, `H` archives or unarchives a closed mission through archiveMission with a toast otherwise; KEYS is one key per line by pane plus a TERMS block with the four step kinds in their colours
Done: fixture rebuilt on the story graph with four decision statuses, an archived mission and a global parts list; frames.ts gains archived, decisions-full and activity-full; keys.ts drops the dead `type:` path and gains `--archived`; tui-snapshot gains global and decisions-full
Done: docs/design.md — the foot pane with its status table, the keys table for T H Z D A F, step colours by role with the runner rule; README keys row; terminology Messages, Inbox and Foot rows
Acceptance: A-UI-1 pass, A-UI-2 pass, A-UI-3 pass, A-UI-4 pass, A-UI-5 pass, A-UI-6 pass, A-UI-7 pass, A-UI-8 pass, A-DOC-1 pass
Commands: `bun x tsc --noEmit` 0 (also clean under --noUnusedLocals), `bun scripts/test.ts` 0, `bun src/cli.ts --frames` 0, `bun src/cli.ts status /opt/ed/ivy` 0, `bun scripts/tui-snapshot.ts` 0. `src/tui/` is 2179 lines against the 2200 budget
Commands: keys driver over a scratch HOME and temp repo for T (state.json follows full → partial → none with a deviation each), H (archive commits 🗄️, row leaves, Z shows it, H returns it, open mission toasts), the global apply both ways, and `cmp` on state.json after ←→↵ in MESSAGES
Issues: two cases in scripts/test.ts encoded the old behaviour and were updated, not worked around — the inbox key is now project/origin/label, and story's `merge` reads human because it carries `gate: human`
Deviations: scripts/tui-snapshot.ts is outside my named ground but its `activity-full` frame would have drawn decisions after the default changed; it gains `ui.foot` and a `global` frame
Decisions:
- MEDIUM: InboxItem carries one `answer` string built in live.ts rather than the screen switching on kind to compose the command — the pane stays one branch and a new waiting kind costs no render code
- MEDIUM: inboxKey moved from project/origin/kind to project/origin/label so each waiting decision rings its own bell; the label already carries the gate's step and the decision's id, so no field was added for it
- MEDIUM: a waiting decision's `at` is the mission's `updated`, since decisions.md carries no clock; a stat per mission would buy a truer age for a value only the sort order and one `ago` use
- MEDIUM: the `~ global` row builds a synthetic Project around `home()` and `snap.global`, so PARTS, changes, pending and applyParts are the project code unchanged and the global install path is `scopeOf` deciding inside `install`
- MEDIUM: Esc in PARTS discards pending toggles first and leaves the pane on a second press, matching the `↵ Apply · Esc Discard` footer the spec names
- LOW: a parallel group row shows `orchestrator` as its runner while its members show verifier and validator — the group is the Orchestrator's own bookkeeping, and one rule beats an exception
- LOW: the KEYS panel merges `?` and `Q` onto one line; at 42 rows the panel is four rows short of one-key-per-line plus TERMS plus the primer, and the four step kinds share a single coloured row for the same reason
```
