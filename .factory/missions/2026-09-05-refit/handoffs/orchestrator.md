Step: orchestrator notes, mid-mission
Done: bound the session with `mission adopt` after W1 and W2 handoffs were lost, saved both by hand
Issues: `mission new` without `open` leaves `session: null`, so `hook-factory` SubagentStop saves nothing. Either `new` on an interactive session adopts it, or the hook falls back to the claimed mission.
Issues: agent frontmatter `model: opus` is not honoured by the Agent tool in this session, sub-agents ran on the parent model. Orchestrator passes `model` explicitly per role; the mission skill must say so.
Issues: `git()` in `src/core/mission.ts` trims output and breaks `git status --porcelain` parsing (W2).
Issues: ivy has no `.factory/factory.yaml`, so Workers have no `verify` recipe (W2).
Issues: `install` and `uninstall` need a pty; a `--yes` flag would make them scriptable (W1).
Deviations: W3 and W4 packed into one Worker per the new packing rule.
Faster: install the codegraph part on ivy itself after this mission, as the first real per-project use.
Issues: `hook-factory` SubagentStop names the handoff after the current step, so a Commit sub-agent spawned by a Worker overwrote `handoffs/implement.md` with a 36-byte progress line. Name by step plus agent type, skip messages under a few lines, never overwrite a longer file with a shorter one.
Issues: A-DOG-1 pinned "creates docs/roadmap.md" and "status clean" for a project that owns its roadmap and hand-wires codegraph. Contract wording, not a defect; amended in place.
Issues: Orchestrator committed mid-step and swept a Worker's staged `git rm` and `git mv` into its own commit. Never commit while a Worker runs.
Undone: round 1 additions from the human, after accept round 0: `code-format` part (fixture, default true, `.claude/code-format.md`, a few lines: SoC, KISS, DRY, comments one line and rare, snippet `- Code format: @.claude/code-format.md`); roadmap lines for Mission Control: show the worktree a mission runs in, show whether caffeinate is on.
Issues: two contract lines had to be amended for wording, A-DOG-1 and A-R2-3. Contracts should not pin counts or blanket line limits that tables and owned files break.
Faster: `.factory/factory.yaml` wants `ready: ["bun src/cli.ts status ."]`, and `scripts/e2e.sh` a two-mission `--worktree` block that closes in both orders; `docs/` left by uninstall shares the R1-3 root.
