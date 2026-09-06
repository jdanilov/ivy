# Findings: Mission Control wiring

Round 1: 31 of 31 assertions pass (`findings-verify.md`, `findings-validate.md`). Twelve
unlisted findings, none blocking. Triage by the Orchestrator, attention light.

## Round 1 triage

| id  | finding                                                                                   | plan | reason                                                                    |
|-----|-------------------------------------------------------------------------------------------|------|---------------------------------------------------------------------------|
| F1  | `freeName` in hook-factory overwrites a handoff when the new one is longer; W1 and W2 lost | fix  | evidence loss on every multi-Worker step; never overwrite, always `-N`     |
| F2  | MISSION rows print `0s` for skipped, failed, blocked steps instead of the status word      | fix  | the row lies about the step                                                |
| F3  | status bar `6/12 [+4]` bracket is unlabelled pending, not additive                        | fix  | drop the bracket, `done/total` says it                                     |
| F4  | project path through a symlink gets dangling part links, status says `modified`, PARTS toggle inverts | fix | pre-existing linker bug, `/tmp` on macOS hits it; resolve the target realpath |
| F5  | a refused gate answer still flips the row to `✓ answered`                                 | fix  | only a success marks the row                                               |
| F6  | `--frames` and `--fixture` in no user doc                                                 | fix  | one README line                                                            |
| F7  | a project with no missions shows a bare heading; a fresh HOME an empty screen             | fix  | one dim hint line naming the next command                                  |
| V3  | `EventRow.mark` dead, fixture only                                                        | fix  | delete                                                                     |
| V2  | W3 handoff claims two design.md drifts its own commit fixed                               | skip | the doc is right, the prose is history                                     |
| V4  | handoff test count 18, actual 17                                                          | skip | same                                                                       |
| V5  | RSS warms 110 to 232 MB over the first 200 renders, then flat                             | skip | flat is the invariant; note for the retro, no code                         |

Fix set goes to one Worker: hook-factory, linker, `src/tui`, README. Round 2 checks A-R1-*.
