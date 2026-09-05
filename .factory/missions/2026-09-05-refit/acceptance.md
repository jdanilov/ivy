# Acceptance: Factory refit

One assertion per line. `id | kind | claim | check | owner`. Kind `verify` is checked by the Verifier from code and CLI runs against temp repos with `HOME=$(mktemp -d)`. Kind `validate` is checked by the Validator by driving the CLI the same way. Every id ends pass, fail or unchecked in `findings.md`.

## Snippets

- A-SNP-1 | validate | `install` of a snippet part into a repo with `AGENTS.md` lacking the section appends the heading and the line at EOF | temp repo, diff before and after is exactly two added lines plus a blank | W1
- A-SNP-2 | validate | `install` into a repo with only `CLAUDE.md` writes the line there; with neither file `AGENTS.md` is created | two temp repos, `ls`, `grep` | W1
- A-SNP-3 | validate | `install` then `uninstall` leaves the agent file byte-identical, `install` twice adds the line once | temp repo, `cmp`, `grep -c` | W1
- A-SNP-4 | verify | Uninstall removes from the file recorded in the manifest, not from a fresh resolution | read `linker.ts`, manifest holds `snippet.file` | W1
- A-SNP-5 | verify | Uninstall removes a section left with only blank lines, keeps one with other content | temp repo with a hand-written extra line under the section | W1

## Recipes and vars

- A-RCP-1 | validate | `install` of a part with `recipes.init` runs each line in the project root, refuses on non-zero exit and leaves the part linked | scratch part with `exit 3`, `✗` line, symlinks present | W1
- A-RCP-2 | verify | `update` runs `init` only when the manifest part has no `initAt` | run update twice, recipe side effect happens once | W1
- A-RCP-3 | validate | `uninstall` runs `recipes.uninit`, a failing uninit prints `◈` and still unlinks | scratch part | W1
- A-VAR-1 | verify | `${name}` resolves config over part default over refusal, in mcp command, args, hook command and recipes | read `recipes.ts`, run with and without `~/.factory/config.yaml` | W1
- A-VAR-2 | validate | Editing `~/.factory/config.yaml` then `update` rewrites `.mcp.json` and the hook command with the new value | temp repo, codegraph part, `cat .mcp.json` | W1

## Stubs and close

- A-STB-1 | validate | `mission new x --stub` creates folder, workflow copy, intent skeleton, `state.json` status `stub`, no branch, no claim | temp repo, `git branch`, `ls .factory` | W2
- A-STB-2 | validate | `step start`, `gate open`, `mission close` on a stub refuse with the stub message | temp repo, exit 1, one `✗` line each | W2
- A-STB-3 | validate | `mission open x --dry-run` on a stub creates the branch and claim, sets status open, prints the command | temp repo, `state.json`, `git branch --show-current` | W2
- A-STB-4 | verify | `mission list` shows stubs after open missions and skips projects whose path is gone | `~/.factory/projects` in scratch HOME with a dead path, no error | W2
- A-CLS-1 | validate | `mission close` with a dirty `state.json` commits the mission folder on the branch, then merges | temp chore mission, `git log` shows the close commit before the merge | W2
- A-CLS-2 | validate | `mission close` with a dirty file outside the mission folder refuses and names the path | temp repo, exit 1 | W2

## Parts content

- A-PRT-1 | verify | `parts/critic` is gone and nothing references critic | `ls parts`, `grep -rn critic parts presets README.md AGENTS.md src` empty | W3
- A-PRT-2 | verify | roadmap part exists, default true, skipIfExists, snippet under `## Important Files` | read part.yaml | W3
- A-PRT-3 | verify | terminology and docs-format parts carry snippets with `@` paths | read part.yaml | W3
- A-PRT-4 | verify | `docs-format.md` under 25 lines with the glyph table, no example, reasons before rules | `wc -l`, read | W3
- A-PRT-5 | validate | `status /opt/ed/ivy` lists roadmap, retro, codegraph, archify and no critic, none `modified` or `conflict` | run | W3, W4
- A-PRT-6 | verify | ivy has `AGENTS.md` with three snippet lines under `## Important Files` and `CLAUDE.md` is one line `@AGENTS.md` | read | W3
- A-PRT-7 | verify | `docs/terminology.md` Gate and Question rows carry no plugin, new rows Stub, Snippet, Roadmap, Retro sweep | read | W3
- A-PRT-8 | verify | Every prompt within its line cap: mission 120, Worker 40, retro 60, others 80 | `wc -l` | W4
- A-CG-1 | validate | Installing codegraph into a temp repo with one `.ts` file runs `init`, writes `.codegraph/`, `.mcp.json` with the resolved command, the hook and the allow entry | temp repo, `ls`, `cat` | W3
- A-CG-2 | validate | Uninstalling codegraph removes `.codegraph/`, the mcp entry, the hook and the allow entry | same repo | W3
- A-CG-3 | verify | codegraph part is default false, pins a version in the default var, `gate.sh` uses `${CODEGRAPH:-codegraph}` | read | W3
- A-ARC-1 | verify | archify part is a skill, default false, installed per project by an init recipe cloning `${archify}` into `.claude/skills/archify`, removed by uninit, upstream sha recorded | read part.yaml | W6
- A-ARC-2 | validate | `node .claude/skills/archify/bin/archify.mjs doctor` exits 0 in a project with archify installed, uninstall removes the folder | temp repo | W6
- A-DOC-1 | verify | `AGENTS.md` documents `snippet`, `recipes`, `vars` and `--stub` | read | W3
- A-DOC-2 | verify | `README.md` command table has `--stub`, part list matches `ls parts` | read | W3
- A-DOC-3 | verify | `docs/roadmap.md` in ivy lists the five carried items | read | W3

## Prompts and function hooks

- A-WRK-1 | verify | Worker.md opens with the goal, has exactly three guardrails, under 40 lines | read | W4
- A-WRK-2 | verify | No prompt under `parts` or `presets` mentions docs-format or terminology except the two parts that ship them | `grep -rln` | W4
- A-HND-1 | verify | Every handoff template has `Step`, `Done`, `Acceptance` then the optional-fields line, and no `or none` | `grep -rn "or none" parts presets` empty | W4
- A-HND-2 | validate | A Worker run on a trivial step ends with a handoff that omits empty fields | spawn on a one-line task, read `handoffs/` | W4
- A-FH-1 | verify | `grep -rn "mcp__factory\|plugin" parts presets src` is empty, `Preset` has no `plugins` | grep, read types | W4
- A-FH-2 | validate | `mission open refit --dry-run` prints a command without `--plugin-dir` | run | W4
- A-FH-3 | verify | `plugins/factory` is unchanged on this branch | `git diff main..HEAD --stat -- plugins` empty | W4

## Retro

- A-RET-1 | verify | `/retro` skill exists, default true, opus, under 60 lines, covers sweep, one item at a time, four answers, prune, delete empty, commit | read | W4
- A-RET-2 | verify | Skill refuses on a dirty tree outside `.factory/` | read | W4
- A-RET-3 | verify | Gatekeeper prompts set `HOME` to a scratch dir for CLI runs and never remove it | read Verifier.md, Validator.md | W4
- A-RET-4 | validate | `/retro` on the ai-factory retro presents items one at a time and prunes on each answer | human runs it in the orchestrator session | Orchestrator

## Dogfood

- A-DOG-1 | validate | `update /opt/ed/igs` unlinks critic, links retro and roadmap, adds three snippet lines to igs `AGENTS.md`, keeps igs' own `docs/roadmap.md` (skipIfExists), `status` shows `0 modified`; a `conflict` row for hand-wired codegraph is expected until the human installs the part | run | W5
- A-DOG-2 | verify | igs hand-wired codegraph untouched by the update, diff against the part recorded in the handoff | read handoff, `git -C /opt/ed/igs status` | W5

## Round 1

- A-R1-1 | validate | `mission close` succeeds in a fresh repo that never ignored `.factory/claim`; `mission new` leaves `.factory/claim` ignored | temp repo without the ignore line, `git check-ignore .factory/claim` | R1
- A-R1-2 | validate | Installing a snippet part into a section that already names the path replaces that line with the snippet line; uninstall restores the original | temp repo with `- Terminology: \`docs/terminology.md\``, `cmp` after uninstall | R1
- A-R1-3 | validate | `uninstall` of every part leaves no `{}` settings file and no empty `.mcp.json` | temp repo, `ls .claude .mcp.json` | R1
- A-R1-4 | validate | `install --yes` installs the defaults and `uninstall --yes` removes everything without a prompt | temp repo, plain pipe, exit 0 | R1
- A-R1-5 | verify | `.factory/factory.yaml` in ivy has `verify` and `e2e` recipes and `e2e` walks stub, open, step, close in a throwaway repo and exits 0 | run the recipe | R1
- A-R1-6 | verify | `code-format` part: fixture, default true, `.claude/code-format.md` under 12 lines, snippet under `## Important Files`; installed on ivy and igs | read, `status` | R1
- A-R1-7 | verify | archify init adds `.claude/skills/archify/` to `.gitignore` when the path is not already ignored | temp repo tracking `.claude`, `git check-ignore` | R1
- A-R1-8 | verify | `update.ts` has one apply sequence, `AGENTS.md` documents `--skip` on `update` only, `docs/roadmap.md` carries the two Mission Control lines | read | R1
- A-R1-9 | validate | roadmap snippet is a backtick reference, not an `@` include; after `update` ivy and igs `AGENTS.md` each carry exactly one Roadmap line, the backtick one, and the three `@` lines are terminology, docs-format, code-format | `grep -c Roadmap`, read | R1
