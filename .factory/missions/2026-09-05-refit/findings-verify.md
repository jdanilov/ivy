
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


## r1 Verifier

Recipe run: `.factory/factory.yaml` `verify` now exists — `bun x tsc --noEmit` -> 0, `bun src/cli.ts status /opt/ed/ivy` -> 0 (15 installed, 0 modified, 2 available). `e2e` recipe (`scripts/e2e.sh`) -> `e2e: ok`, exit 0.

Every `verify`-kind assertion below was checked by reading the diff `9320c50..HEAD` and, for the behavioural claims, by exercising the real code paths in scratch temp repos with `HOME=$(mktemp -d)`: `ensureClaimIgnored` against a repo with a dirty `.gitignore` plus an unrelated staged file, and again with a clean `.gitignore` plus the same staged file; `writeSnippet`/`removeSnippet` round-tripped against a hand-written backtick line (byte-identical restore via `cmp`); `dropEmptied` against a `.mcp.json` and `.claude/settings.json` each carrying an extra top-level key; the archify `init` recipe run directly against a repo that tracks `.claude/`.

### Contract — verify-kind assertions

| id | result | evidence |
|----|--------|----------|
| A-R1-5 | pass | `.factory/factory.yaml` has `verify: [bun x tsc --noEmit, bun src/cli.ts status /opt/ed/ivy]` and `e2e: [scripts/e2e.sh]`; ran both, all exit 0. `scripts/e2e.sh` (51 lines) walks `install --yes` → `mission new x --stub` → `mission open x --dry-run` (promotes) → `step start/done` on grill/implement/merge with a hand-opened gate on grill → `mission close x` → `uninstall --yes`, asserting branch, `.gitignore`, tree-clean and no-leftover-file at each stage; ran it directly, `e2e: ok` |
| A-R1-6 | pass | `parts/code-format/part.yaml`: `type: fixture`, `default: true`, `files: [{source: code-format.md, target: .claude/code-format.md}]`, `snippet.section: "## Important Files"`; `wc -l parts/code-format/code-format.md` = 11 (< 12); `status /opt/ed/ivy` and `status /opt/ed/igs` both show `code-format ● installed .claude/code-format.md` |
| A-R1-7 | pass | `parts/archify/part.yaml` init line 3: `git check-ignore -q .claude/skills/archify \|\| echo '.claude/skills/archify/' >> .gitignore`; ran the resolved recipe directly (`resolvePart`+`runInit`) against a scratch repo tracking `.claude/`: `.gitignore` gained exactly `.claude/skills/archify/`, `git check-ignore -q .claude/skills/archify` then exits 0 |
| A-R1-8 | pass | `update.ts:19-39` `applyPart()` is called from both the existing-parts loop (`update.ts:83`) and the new-default-parts loop (`update.ts:158`) — one sequence, confirms V1 resolved. `AGENTS.md:103-106`: "`install \| uninstall \| status \| update [project]`... `install` and `uninstall` take `--yes`... `update` alone takes `--skip a,b`" — `--skip` named only for `update`. `docs/roadmap.md:7-8` adds exactly two new "Mission Control" lines (worktree, caffeinate); the third new line added this round (`mission open --dry-run` promotes...) is unrelated to Mission Control, so the two-line count for that phrase holds |

All four owned assertions pass.

### Attention points

- `ensureClaimIgnored` (`src/core/mission.ts:140-152`): guard is sound and never commits anything but `.gitignore`. Traced both branches live: (1) `.gitignore` already dirty + an unrelated file staged → function writes the ignore line but returns `'added'`, no `git add`/`commit` at all, the unrelated staged file is untouched; (2) `.gitignore` clean + the same unrelated file staged → `git add -- .gitignore && git commit -m ... -- .gitignore` runs, `git show --stat HEAD` shows exactly one file (`.gitignore`, +1 line), the unrelated file stays staged and uncommitted. `git commit -- .gitignore` is a pathspec-scoped partial commit regardless of what else is in the index, so this holds even with a large unrelated staged changeset. `closeMission`'s `outside` filter (`mission.ts:368`) also excludes `.factory/claim` from the dirty scan explicitly (F1), independent of whether the ignore line exists yet.
- `removeSnippet`'s `snippet.replaced` restore (`src/core/linker.ts:159-185`): round-tripped install→uninstall on an `AGENTS.md` with a hand-written backtick line naming the same path — `cmp` after uninstall reports byte-identical to the pre-install file. `writeSnippet`'s guard at `linker.ts:141` (`record.replaced === undefined && body[hit] !== prev?.line`) correctly distinguishes the project's own line (recorded once, as `replaced`) from the Factory's own prior line at that slot (an in-place content swap, e.g. the roadmap `@`→backtick migration this round) — traced that migration directly through `update`: the old `@docs/roadmap.md` line is overwritten in place by `writeSnippet`, `replaced` stays unset, and the follow-up `removeSnippet(entry.snippet, …)` call in `update.ts:91` correctly no-ops (the old line is already gone from the file, so `hit === -1`) rather than double-removing or corrupting the section.
- `dropEmptied` (`src/core/linker.ts:392-411`) never deletes a file with other keys: confirmed live against `.claude/settings.json` holding `{"env":{"FOO":"bar"}}` (no part-owned keys left, but the file has content — stayed) and `.mcp.json` holding `{"mcpServers":{},"customThing":true}` (`mcpServers` empty but a sibling key present — stayed); only a bare `.claude/settings.local.json` of `{}` was removed. `keys.length === 0` and the `mcpServers`-only-and-empty check are the only two conditions, so anything else, even one extra key, is preserved by construction — no boundary the check gets wrong.

### Baseline findings

| id | verdict | finding | blast | effort | conf |
|----|---------|---------|-------|--------|------|
| - | slop | `README.md:92` runs 153 chars, three times the wrap width of every neighbouring line in the same paragraph (97-100 chars) — the "section already names the path" sentence was appended without rewrapping | narrow | S | high |
| - | note | `parts/validate/agents/Validator.md` color `green`→`yellow`, committed as `7146b18 style: Validator agent colour yellow, gates on the graph` by the human, not an agent — unlike round 0's O1 (an untracked, unattributed flip), this one is an authored commit, so not a finding on its own; the "gates on the graph" half of the message has no corresponding diff in this or any other file, worth a one-line ask if it was meant to land something else | narrow | S | low |
| - | clean | `install.ts`'s `--yes` path (`install.ts:55-56`) folds `modified`-status parts into the auto-selection and skips `confirmModified` entirely; this can relink over a part whose target the project edited by hand. Checked against actual behaviour: `linkPart` only ever touches `skipIfExists` targets when they are absent, so no such file is silently rewritten — the risk is confined to non-template (symlinked) parts, which are cosmetic/managed content by design, and `AGENTS.md:104-105` already documents `--yes` as "no confirm". Each relinked part still prints `(updated)`, so the run is not silent. Working as specified, not a defect |
| - | clean | `update.ts`'s `applyPart` (V1 fix) is exercised by both loops with identical semantics confirmed live (a stale-snippet migration test showed no double-write, no double-remove); the shared helper removed the duplication flagged in round 0 without changing observable behaviour |
