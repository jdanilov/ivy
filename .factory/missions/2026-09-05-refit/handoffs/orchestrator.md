Step: orchestrator notes, mid-mission
Done: bound the session with `mission adopt` after W1 and W2 handoffs were lost, saved both by hand
Issues: `mission new` without `open` leaves `session: null`, so `hook-factory` SubagentStop saves nothing. Either `new` on an interactive session adopts it, or the hook falls back to the claimed mission.
Issues: agent frontmatter `model: opus` is not honoured by the Agent tool in this session, sub-agents ran on the parent model. Orchestrator passes `model` explicitly per role; the mission skill must say so.
Issues: `git()` in `src/core/mission.ts` trims output and breaks `git status --porcelain` parsing (W2).
Issues: ivy has no `.factory/factory.yaml`, so Workers have no `verify` recipe (W2).
Issues: `install` and `uninstall` need a pty; a `--yes` flag would make them scriptable (W1).
Deviations: W3 and W4 packed into one Worker per the new packing rule.
Faster: install the codegraph part on ivy itself after this mission, as the first real per-project use.
