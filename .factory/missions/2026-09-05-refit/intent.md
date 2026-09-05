# Intent: Factory refit

Grilled 2026-09-05 after the ai-factory retro. Goal: a Factory that is flexible and token-efficient, harness-agnostic where it can be, and that eats its own retro.

## Why

- retro.md is 70 lines a human will not read. The feedback loop only closes if an agent digests it and asks one thing at a time.
- Every prompt repeats two sentences about docs-format and terminology. Once in `AGENTS.md` they are in every context for free.
- Handoffs and prompts carry fields and rules that cost tokens and add nothing. Constraints written as identity ("you implement exactly one step") replace the goal.
- Function hooks are gated server-side and Codex is coming as a second harness. Depending on them fights both.
- codegraph and archify are worth having on medium and large codebases, and today nothing installs or removes them per project.

## Done looks like

- [ ] `/retro` skill: sweeps every closed mission's `retro.md` in the project, presents one actionable item at a time with a recommendation, on approval applies it through a Worker, creates a mission stub with `factory mission new --stub`, or appends to `docs/roadmap.md`; processed lines are pruned, an empty retro.md is deleted. Dogfooded on the ai-factory retro at the end of this mission.
- [ ] `roadmap` part: template `docs/roadmap.md`, plain markdown checklist, skipIfExists, with an `AGENTS.md` snippet.
- [ ] `snippet` key in part.yaml: `{ file?, section, line }`. Install appends the line under the section in `AGENTS.md`, else `CLAUDE.md`, creating `AGENTS.md` and the section when neither exists. Uninstall removes the line and an emptied section. Idempotent, deduped by exact line. terminology, roadmap and docs-format carry one each under `## Important Files` as `@path` references.
- [ ] docs-format.md rewritten to ten lines: reasons then rules, glyph line kept, example gone. No hard rules that break an agent without serving the intent.
- [ ] Every skill and agent prompt drops its docs-format and terminology sentences. Worker prompt rewritten around the goal, under 40 lines. Handoff template in every prompt and in the spec template: `Step`, `Done`, then only fields with content; Commands only when they failed or decided something.
- [ ] Function hooks unwired: presets carry no `plugins`, no agent lists `mcp__factory__ask`, mission skill drops the tools section, sub-agents return blocked with the question and the orchestrator asks. `plugins/factory` stays on disk untouched, nothing references it. intent, terminology and design docs of ai-factory are not edited; `docs/terminology.md` Question and Gate rows updated.
- [ ] `parts/critic` removed, `/verify` covers the diff-only case. `factory update` on ivy and igs unlinks it.
- [ ] ivy's `CLAUDE.md` renamed `AGENTS.md`, content trimmed to what an agent needs, Important Files section populated by the snippets.
- [ ] codegraph and archify parts per `docs/research/codegraph-archify.md`: install, init recipe, uninstall, per project, opt-in (default false). If the research finds one of them undefined, it goes to roadmap.md with a one-line scope and this item is marked with the reason.
- [ ] `factory mission new --stub`: folder plus intent skeleton, status `stub`, no branch, no claim; `mission list` shows stubs; `mission open` on a stub promotes it.
- [ ] `mission close` commits the mission folder on the branch before switching to trunk. Gatekeeper prompts set `HOME` to a scratch dir for CLI runs; `mission list` skips projects whose path no longer exists.

## Not in this mission

Mission Control, memory, global parts, Codex harness support itself. Tokens per step.

## Decisions

| Topic | Decision |
|-------|----------|
| Snippet mechanism | A key on any part, not a part type. The file and its `AGENTS.md` line install and uninstall together. |
| Agent file | `AGENTS.md` preferred, `CLAUDE.md` fallback, `AGENTS.md` created when neither exists. |
| Shared context | docs-format and terminology reach agents through `AGENTS.md` `@` lines, never through prompt sentences. |
| Handoff | Empty fields are omitted. `none` is never written. |
| Worker | Goal first: implement what the step asks until its owned assertions pass, commit, hand off. Three guardrails: stay in the step, minimal code, ask when the spec is silent. |
| Function hooks | Unwired, not deleted. Revisit when a harness-neutral format exists. |
| Retro | Per project sweep across closed missions, one item at a time, prune on decision. |
| Stub | A mission with intent and no branch. Promoted by `mission open`. |
| codegraph, archify | Opt-in parts with an `init` recipe run once after install. Shape from the research doc. |

## Open for the spec stage

- Research result for codegraph and archify.
- Exact `init` recipe mechanism: a `recipes.init` list in part.yaml run by install and update when the part is new.
