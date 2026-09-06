All twelve `validate` assertions pass. Findings are in `/opt/ed/ivy/.factory/missions/2026-09-06-control/findings-validate.md`; the two reusable drivers are committed at `/opt/ed/ivy/.factory/validator/scratch.ts`, `/opt/ed/ivy/.factory/validator/keys.ts` and indexed in `/opt/ed/ivy/.factory/validator/scripts.md`.

Seven unlisted findings, none blocking. The two worth acting on first:

**F1 — three Workers on `implement`, one handoff file.** `parts/hook-factory/hook-factory.ts`:

```ts
/** A handoff is never traded for a shorter one: the next free `-2`, `-3` name takes it instead. */
async function freeName(dir: string, base: string, text: string): Promise<string> {
  for (let n = 1; ; n++) {
    const file = path.join(dir, n === 1 ? `${base}.md` : `${base}-${n}.md`);
    const existing = (await readFile(file, 'utf-8').catch(() => '')).trim();
    if (existing.length <= text.length) return file;
  }
}
```

A *longer* handoff always overwrites; the `-2` sibling only ever appears for a shorter one. W1 (5604 B) and W2 (7570 B) exist only in git history because each was committed before the next Worker ran.

**F4 — a project path with a symlink in it gets dangling part links.** `install --parts commit` into `/tmp/x/beta` writes `skill.md -> ../../../../../../opt/ed/ivy/...`, which resolves through `/private/tmp` to nowhere; `factory status` then reads `0 installed, 1 modified` right after a clean install, and in the PARTS pane `space` on a `modified` row toggles it as an *install*, so a human meaning to drop a part re-adds it. Same install under `/private/tmp`: `1 installed, 0 modified`. Pre-existing, not in this diff.

```
Step: accept (Validator, round 1)
Done:
- Ran e2e.ready (`bun src/cli.ts status .`) exit 0 before driving anything.
- Wrote and committed two reusable drivers: `.factory/validator/scratch.ts` (a whole scratch world: two registered repos, a running story mission with an open gate, a stub, a dead project path, live and stale sessions with transcripts) and `.factory/validator/keys.ts` (headless `onKey` driver with `type:`, `sleep:` and span capture), indexed in `.factory/validator/scripts.md`.
- Checked all 12 `validate` assertions by driving `factory --frames` and the test renderer under three scratch HOMEs; never touched a real session, never pressed `x` or `c`.
- Ran `factory --frames` read-only against the real HOME and read all 13 frames for user-visible defects.
- Filed `.factory/missions/2026-09-06-control/findings-validate.md`: per-assertion evidence table plus 7 ranked unlisted findings with repro steps.
Acceptance: A-SRC-1 pass, A-SRC-2 pass, A-SRC-3 pass, A-TRX-2 pass, A-TRX-4 pass, A-ACT-1 pass, A-ACT-2 pass, A-ACT-5 pass, A-UI-1 pass, A-UI-2 pass, A-UI-3 pass, A-UI-5 pass
Issues:
- F1 wide: `freeName()` in hook-factory overwrites a handoff whenever the new message is longer, so serial Workers on one step leave one file.
- F2: `missionPane` prints `s.wall ? dur(s.wall) : s.status`, so the real mission's skipped `research` reads `· research  0s` and `failed`/`blocked` vanish the same way.
- F3: `6/12 [+4]` — the bracket is pending steps, unlabelled and not additive.
- F4 pre-existing: dangling part symlinks under any path containing a symlink; status reports `modified` after a clean install and the PARTS toggle then inverts.
- F5: a refused gate answer still flips the MESSAGES row to `✓ answered`; only a 2 s toast says otherwise.
- F6: `--frames` and `--fixture` appear in no user-facing doc.
- F7: a project with no missions draws an empty status band and a bare heading; a fresh HOME shows an empty screen with no next step.
Deviations:
- Findings went to `findings-validate.md` as the task directed, not appended to `findings.md`.
- The three `implement-Worker*.md` handoffs named in the task do not exist; W1 and W2 were read from `git show 63b0e89:` and `git show 5afbae4:` (see F1).
Faster ways:
- A scratch HOME must be under `/private/tmp`, never `/tmp`: the `/tmp → /private/tmp` symlink dangles every part link and makes the PARTS pane and `factory status` lie (F4). One rebuilt world was lost to this.
- `captureSpans` merges adjacent same-colour spans; walk the spans accumulating columns and read the colour at the column a name starts in, which is what `keys.ts --spans '*'` prints.
- A boolean flag right before the key list eats the first key if the driver filters on `argv[i-1].startsWith('--')`; keep an explicit set of value-taking flags.
```
