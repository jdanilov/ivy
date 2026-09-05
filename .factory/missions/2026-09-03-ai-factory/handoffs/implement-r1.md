Step: implement-r1
Done: step start refuses unless current step or parallel member and pending, running is a no-op. step done refuses unless running, done is a no-op. Out-of-order deviation escapes removed, no --force. readManifest renames a legacy manifest on read, zero-parts included. removeHooks returns a count, update prints only on a real removal. mission open --dry-run says would write. zod dropped. browse default false. acceptance.md counts no longer pinned.
Undone: none
Commands: bun install -> 0; tsc -> 0; full story walk with refusals at every out-of-order point -> as expected; legacy manifest rename on update and uninstall -> 0; hook removal reporting both ways -> correct; dry-run writes nothing; status -> 13 installed
Issues: done refusal fires before gate refusal, a gated step never started says pending, not the gate message. Empty mission branch closes without a merge commit, pre-existing.
Deviations: none
Faster: scripts/fixture-repo.sh walking the story workflow to a named step, replaces ~40 cold bun starts per round.
Acceptance: A-MIS-7 pass, triage 1..7 pass
