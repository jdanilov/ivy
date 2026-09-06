Work complete and committed on `mission/decisions` as `53e5e02`.

Key files: `/opt/ed/ivy/workflows/intent.yaml` (new), `/opt/ed/ivy/src/core/workflow.ts` (`stepRole`, `ROLE_MODEL`), `/opt/ed/ivy/src/core/mission.ts` (`setAutonomy`, `pointAtInserted`), `/opt/ed/ivy/src/commands/mission.ts` (`shape`, `autonomy`), `/opt/ed/ivy/parts/mission/skill.md` (119 lines).

```
Step: implement
Done: workflows/intent.yaml added; story, fix, chore, research rewritten around intent → … → merge, review replaces accept, grill/condense/human_from gone; quick untouched
Done: parser, dumper and WorkflowStep dropped human_from; stepRole and ROLE_MODEL added in core/workflow.ts; mission status prints runner · model per step and per parallel member
Done: Autonomy full|partial|none replaces Attention in types, core/mission (readState defaults partial), commands/mission, tui model/live/screen/actions/fixture, mission skill, orchestrator prompt, Summarizer, terminology, design.md, README, AGENTS.md — grep for attention across src parts presets workflows docs README AGENTS is empty
Done: mission new defaults to the intent workflow and takes --quick and --autonomy; mission shape <preset> [--autonomy L] appends a preset behind intent, adds pending steps, records state.workflow, refuses a second preset and a preset without intent, and is a byte-identical no-op for the same preset; mission autonomy L [name] records a deviation
Done: pointAtInserted is the one pointer rule, shared by mission shape and step add
Done: failed left RunState and the tui glyph and colour maps; StepStatus never carried it
Done: mission skill at 119 lines with Graph, Autonomy and a Decisions placeholder for W2; Summarizer runs inside merge before the gate, in the skill and as a comment in story.yaml
Done: scripts/test.ts walks the intent gate, expects the new story kinds, and gains the shape and pointer cases; scripts/e2e.sh answers the intent gate and checks unshaped → shape story → refusal of shape quick → --quick single step
Done: AGENTS.md architecture block and two new invariants, README command table rows for shape, autonomy and --quick, terminology Autonomy row and Loop row without human_from, design.md T key
Acceptance: A-GRF-1 pass, A-GRF-2 pass, A-GRF-3 pass, A-GRF-4 pass, A-GRF-5 pass, A-GRF-6 pass, A-GRF-7 pass, A-DOC-1 unchecked, A-DOC-2 unchecked
Undone: A-DOC-1 and A-DOC-2 stay unchecked until W2–W4 add the Decision and Archive rows, decision.ts, scope, ${root} and their invariants; my share of both is in
Issues: src/ui/theme.ts still carries failed branches in rowSymbol and rowColor — they take a plain string, not RunState, and docs/design.md's row-state table documents them, so I left them
Issues: src/tui/model.ts stepKind still names grill and accept and maps roles itself; W4 owns that rewrite, so I only renamed what the compiler needed
Deviations: dropped the dead grill line from .factory/validator/scratch.ts, outside my named ground, so the Validator's scratch world still builds a walkable mission
Decisions:
- MEDIUM: mission status names every step's runner and model, orchestrator · fable included, rather than hiding the model for the orchestrator as W4's mission pane does — one rule beats two
- MEDIUM: shaping a mission whose workflow is not just intent, a quick mission included, refuses with "already shaped as <workflow>" rather than adding a third message for that case
- MEDIUM: mission autonomy takes the level first and an optional mission name second, matching gate answer's verb-then-name shape
- LOW: pointAtInserted reads the step before and the step displaced out of the workflow after the insert, so both callers pass only the new step's name
- LOW: shape returns before any write when the preset is already in place, so a second shape leaves state.json byte-identical, which the test asserts
- LOW: the priority-order lines in the skill and the orchestrator prompt now say "the human's focus" so the attention grep can end empty without losing the rule
```
