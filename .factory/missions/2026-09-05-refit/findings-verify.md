
## r0 Verifier

Baseline: `bun x tsc --noEmit` -> 0. `HOME=$(mktemp -d) bun src/cli.ts status /opt/ed/ivy` -> 0, 14 installed, 0 modified, 2 available (`archify`, `codegraph`), no `critic` row, no `conflict`. No `.factory/factory.yaml` in this repo, so no `verify` recipe (known, already triaged).

Every `verify`-kind assertion below was checked by reading the code and, where the claim is behavioural, by exercising `writeSnippet`/`removeSnippet`/`resolvePart`/`runInit`/`runUninit` directly against scratch temp repos with `HOME=$(mktemp -d)` (equivalent to driving them through `install`/`update`, which call the same functions) — install/uninstall's interactive prompt needs a pty per W1's own note, already triaged.

### Contract — verify-kind assertions

| id | result | evidence |
|----|--------|----------|
| A-SNP-4 | pass | `src/commands/uninstall.ts:104,117` and `src/commands/update.ts:70-71,128` read `entry.snippet` off the manifest, never `part.snippet` fresh, before calling `removeSnippet` |
| A-SNP-5 | pass | `removeSnippet` in `src/core/linker.ts:137-155`; tested in a scratch repo — a section with only the part's line is deleted heading and all (byte-identical to before install), a section with a hand-written extra line keeps the heading and that line |
| A-RCP-2 | pass | `runInit` in `src/core/recipes.ts:56-71` copies `prev.initAt` and returns without running when present; tested twice against a real side-effect file, ran once |
| A-VAR-1 | pass | `resolvePart` in `src/core/recipes.ts:13-45`; tested config-over-part-default and refusal, substitution confirmed in `mcp.config.command`, `args`, `hooks[].command` and both recipe lists |
| A-STB-4 | pass | `mission list` (`src/commands/mission.ts:104-121`) and `gate list` (`src/commands/gate.ts:76`) both iterate `existingProjects()` (`src/core/projects.ts:47-53`), which drops dead paths silently; `loadProjects` (used only by `saveProject`) stays unpruned; sort at `mission.ts:112` puts `stub` after non-stub. Ran `mission list` with a scratch `~/.factory/projects` naming a dead path — `No open missions.`, exit 0, no error |
| A-PRT-1 | pass | `ls parts` has no `critic`; `grep -rn critic parts presets README.md AGENTS.md src` empty |
| A-PRT-2 | pass | `parts/roadmap/part.yaml`: fixture, default true, `skipIfExists: true`, snippet under `## Important Files` |
| A-PRT-3 | pass | `parts/terminology/part.yaml` and `parts/docs-format/part.yaml` each carry an `@path` snippet under `## Important Files` |
| A-PRT-4 | pass | `parts/docs-format/docs-format.md` is 23 lines, glyph table intact, no worked example, every bullet states its reason before the rule |
| A-PRT-6 | pass | `AGENTS.md:7-10` has the three snippet lines under `## Important Files`; `CLAUDE.md` is the single line `@AGENTS.md` |
| A-PRT-7 | pass | `docs/terminology.md`: Gate row (16) and Question row (39) carry no plugin sentence; Stub (31), Snippet (22), Roadmap (23), Retro sweep (41) rows present |
| A-PRT-8 | pass | `wc -l`: mission skill.md 120, Worker.md 39, retro/skill.md 54, Investigator 43, Summarizer 56, Verifier 78, verify/skill.md 20, Validator 64, validate/skill.md 23, Commit 73, explain 76, research 25, browse 52 — all within cap. `parts/archify/` has no `skill.md` after W6 (clone recipe, not vendored text), so the cap does not apply |
| A-CG-3 | pass | `parts/codegraph/part.yaml`: `default: false`, `vars.codegraph` pins `npx -y @colbymchenry/codegraph@1.6.0`; `gate.sh:11` uses `${CODEGRAPH:-codegraph}` |
| A-ARC-1 | pass (W6 reread) | `parts/archify/part.yaml`: type skill, default false, `files: []`, `recipes.init` clones `${archify}` into `.claude/skills/archify`, `recipes.uninit` removes it, upstream sha on line 1 |
| A-DOC-1 | pass | `AGENTS.md` documents `snippet` (66-70), `recipes` (71-73), `vars` (74-…) and `mission new <name> [--stub] …` (108) |
| A-DOC-2 | pass | `README.md` command table has `mission new <name> --stub` (38); part table (56-72) lists exactly the 16 folders under `parts/` (verified `ls parts` after removing a scratch part I had created and deleted for A-RCP/A-VAR testing), no critic |
| A-DOC-3 | pass | `docs/roadmap.md` lists the five "Not in this mission" items: Mission Control, Memory, Global parts, Codex harness, Tokens per step |
| A-WRK-1 | pass | `parts/mission/agents/Worker.md`: goal sentence first (line 9), exactly three `##Guardrails` bullets (17-22), 39 lines |
| A-WRK-2 | pass | `grep -rln "docs-format\|terminology" parts presets` returns only `parts/terminology/part.yaml`, `parts/docs-format/part.yaml`, `parts/docs-format/docs-format.md` |
| A-HND-1 | pass | `grep -rn "or none" parts presets` empty; `Step`/`Done`/`Acceptance` template plus the optional-fields line present verbatim in Worker.md, mission skill.md, Investigator.md, Summarizer.md, Verifier.md, Validator.md |
| A-FH-1 | pass | `grep -rn "mcp__factory\|plugin" parts presets src` empty; `Preset` in `src/types.ts` has no `plugins` field |
| A-FH-3 | pass | `git diff main..HEAD --stat -- plugins` empty |
| A-RET-1 | pass | `parts/retro/part.yaml`: skill, default true; `skill.md` model opus, 54 lines, covers sweep (§1), one item at a time (§2), four answers table (apply now/stub/roadmap/drop), prune and delete-empty (§3), `@Commit` at close |
| A-RET-2 | pass | `parts/retro/skill.md:12-13` refuses when `git status --porcelain` is dirty outside `.factory/`, names the paths |
| A-RET-3 | pass | `Verifier.md:65` and `Validator.md:51` (this file, and the one the Validator runs from) both carry `HOME=$(mktemp -d) … never remove that HOME`; no `rm`/`unset HOME` anywhere in either |
| A-DOG-2 | pass | `git -C /opt/ed/igs status --porcelain` and `md5` of `.mcp.json`, `.claude/settings.json`, `.claude/scripts/codegraph-gate.sh` match the handoff's recorded hashes exactly; `git diff --stat` on those three files is empty |

All 26 `verify`-kind assertions pass. Nothing here needed a fail or unchecked verdict.

### Baseline findings

| id | verdict | finding | blast | effort | conf |
|----|---------|---------|-------|--------|------|
| - | slop | `src/commands/update.ts` duplicates the resolve → link → inject hooks/mcp/settings → snippet → `runInit` sequence between the "existing parts" loop (47-96) and the "new default parts" loop (141-162); a shared `applyPart(resolved, prev, resolvedDir)` helper would remove ~15 duplicated lines. Pre-existing shape (the two loops already duplicated `linkPart`/`injectHooks`/`injectMcp`/`injectSettings` before this mission); this mission extended the duplication symmetrically rather than introducing it fresh | narrow | M | med |
| - | clean | `src/core/linker.ts` snippet functions (`writeSnippet`/`removeSnippet`, 106-155) are small, single-purpose, and the section/line arithmetic is exercised correctly at every boundary I tried (EOF section creation, dedup, emptied-section removal, section-with-other-content removal, CLAUDE.md fallback, neither-file creation) — no note beyond "read the whole function, it holds" | | | |
| - | clean | `src/core/recipes.ts` is 80 lines end to end, one `VAR` regex, one `sub()` closure, `resolvePart`/`runInit`/`runUninit` each one job — no abstraction beyond what W1's three features need | | | |
| - | clean | `parts/archify/part.yaml`'s W6 rework (clone recipe instead of vendored files) is the right call over vendoring ~100 `files[]` entries for a two-file skill that needed 28; the guard-vs-retry tension it leaves (documented in the W6 handoff `Issues`) is a real tradeoff, not an oversight | | | |

