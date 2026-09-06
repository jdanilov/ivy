import { stepKind } from './model.js';
import type { Activity, InboxItem, Mission, PartRow, Project, Snapshot, StepRow } from './model.js';

/** Fake data for the look-and-feel prototype. Ages are relative, so the screen reads right whenever it runs. */

const M = 60_000;
const H = 60 * M;
const D = 24 * H;
const now = Date.now();

/** The kind is never spelled out here: the fixture reads its colours through the same mapping the
 *  live snapshot does, so a look review is a review of what the screen will draw. */
function steps(spec: [name: string, status: StepRow['status'], wall?: number, role?: string][]): StepRow[] {
  return spec.map(([name, status, wall, role]) => ({
    name, status, wall, kind: stepKind({ name, ...(role ? { role } : {}) }), ...(role ? { role } : {}),
  }));
}

const refitSteps = steps([
  ['grill', 'done', 3 * M], ['intent', 'done', 12 * M], ['research', 'skipped', undefined, 'investigator'],
  ['spec', 'done', 8 * M], ['implement', 'running', 6 * M, 'worker'], ['accept', 'pending'],
  ['verify', 'pending'], ['validate', 'pending'], ['condense', 'pending'],
  ['merge', 'pending'],
]);

/** `minutes back|verb|text`, oldest first — the shape wiring will read out of the transcript. */
function log(session: string, spec: string): Activity[] {
  return spec.trim().split('\n').map((row) => {
    const [back, verb, text] = row.split('|') as [string, Activity['verb'], string];
    return { at: now - Math.round(Number(back) * M), session, verb, text };
  });
}

const refitLog = log('75cb46e1', `
30.0|Text|Round 2 opens. Three findings from the Verifier, all in the render path.
29.5|Read|.factory/missions/2026-09-06-refit/findings.md
29.1|Read|src/tui/screen.ts
28.6|Bash|rg -n "destroyRecursively" src
28.0|Text|Triage: fix F1 and F2, skip F3 — the divider is cosmetic and out of the contract.
27.4|Agent|Worker implement round 2
26.9|Read|src/tui/screen.ts
26.3|Read|src/ui/format.ts
25.7|Edit|src/tui/screen.ts destroy the old row tree instead of removing it
25.0|Bash|bun x tsc --noEmit
24.4|Edit|src/tui/format.ts spread() pads to the pane width
23.8|Bash|bun x tsc --noEmit
23.1|Bash|bun scripts/test.ts
22.4|Text|Two cases fail: the status bar no longer fits its metrics at 100 columns.
21.8|Read|src/tui/format.ts
21.1|Edit|src/tui/screen.ts cap the progress bar at a third of the line
20.3|Bash|bun scripts/test.ts
19.6|Bash|bun x tsc --noEmit
18.9|Stop|Worker handed off: 4 files, 2 fixes, F3 skipped with a reason
18.1|Text|Handoff reads clean. Verify before the accept gate.
17.4|Agent|Verifier round 2
16.8|Read|.factory/missions/2026-09-06-refit/acceptance.md
16.1|Bash|git diff --stat main...mission/refit
15.3|Read|src/tui/screen.ts
14.6|Text|A2 pass, A5 pass, A9 unchecked — nothing drives the 100-column case.
13.8|Stop|Verifier findings written
13.0|Agent|Worker implement round 2
12.3|Edit|scripts/test.ts a 100x24 render case
11.6|Bash|bun scripts/test.ts
10.8|Bash|bun x tsc --noEmit
10.0|Stop|Worker handed off: A9 now checked
9.2|Text|All nine assertions pass, so the accept gate is the next thing.
8.4|Ask|Accept round 2 and move on to validate?
7.1|Read|.factory/missions/2026-09-06-refit/state.json
6.2|Bash|bun src/cli.ts step done implement
5.4|Agent|Validator drive the screen at three sizes
4.1|Bash|bun scripts/tui-snapshot.ts
2.9|Read|.factory/missions/2026-09-06-refit/prototype/messages.txt
1.6|Text|Frames read right at 140x42, the key bar sits on the last row.
0.4|Ask|Round 2 accepted?`);

const authLog = log('8a9e6b42', `
70|Text|Fix mission opens: the session cookie survives logout.
66|Read|src/auth/session.ts
61|Agent|Worker implement
55|Edit|src/auth/session.ts clear the cookie on logout
48|Bash|bun test auth
41|Edit|src/auth/refresh.ts rotate the refresh token on reuse
35|Bash|bun test auth
28|Stop|Worker handed off: 3 fixes, 2 skipped
21|Agent|Verifier round 2
14|Bash|git diff --stat main...mission/auth
7|Text|The contract is green. Opening the merge gate on retro.md.
3|Ask|Merge auth into main?`);

const quickLog = log('b3f21c07', `
26|Text|Looking at how recall should be indexed before writing anything.
22|Read|docs/terminology.md
18|Bash|rg -n "Recall" docs
15|Text|Embeddings need a model on the box; a grep index is instant and dumb.
12|Ask|Which recall strategy for v1, embeddings or a grep index?`);

const authSteps = steps([
  ['grill', 'done', 4 * M], ['implement', 'done', 71 * M, 'worker'],
  ['verify', 'done', 22 * M], ['merge', 'blocked'],
]);
authSteps[3]!.gateOpen = true;

const ivyParts: PartRow[] = (
  [
    ['archify', 'skill', ['.claude/skills/archify/skill.md', '.claude/skills/archify/template.html']],
    ['browse', 'tool', ['.claude/skills/browse/skill.md', '.claude/skills/browse/agent-browser.md']],
    ['code-format', 'fixture', ['.claude/code-format.md']],
    ['codegraph', 'mcp', ['.claude/scripts/codegraph-gate.sh', '.mcp.json']],
    ['commit', 'skill', ['.claude/skills/commit/skill.md']],
    ['docs-format', 'fixture', ['.claude/docs-format.md']],
    ['explain', 'skill', ['.claude/skills/explain/skill.md']],
    ['hook-factory', 'fixture', ['.claude/scripts/hook-factory.ts']],
    ['hook-safe-bash', 'fixture', ['.claude/scripts/safe-bash.sh']],
    ['mission', 'skill', ['.claude/skills/mission/skill.md', '.claude/agents/Worker.md', '.claude/agents/Investigator.md', '.claude/agents/Summarizer.md']],
    ['permissions', 'fixture', ['.claude/settings.json']],
    ['research', 'tool', ['.claude/skills/research/skill.md']],
    ['retro', 'skill', ['.claude/skills/retro/skill.md']],
    ['roadmap', 'fixture', ['docs/roadmap.md']],
    ['terminology', 'fixture', ['docs/terminology.md']],
    ['validate', 'skill', ['.claude/skills/validate/skill.md', '.claude/agents/Validator.md']],
    ['verify', 'skill', ['.claude/skills/verify/skill.md', '.claude/agents/Verifier.md']],
  ] as const
).map(([name, type, files]) => ({ name, type, files: [...files], status: name === 'archify' || name === 'codegraph' ? 'not-installed' : 'installed' }));

/** Everything a mission needs but a fixture rarely varies. */
function mission(m: Partial<Mission> & Pick<Mission, 'name' | 'workflow'>): Mission {
  return {
    status: 'open', state: 'pending', attention: 'full', step: null, round: 0, session: null, branch: null, worktree: null,
    caffeinate: false, wall: 0, tokens: { input: 0, cached: 0, output: 0 }, steps: [], deviations: 0,
    ...m,
  };
}

const projects: Project[] = [
  {
    name: 'ivy',
    path: '/opt/ed/ivy',
    parts: ivyParts,
    sessions: [],
    missions: [
      mission({
        name: 'refit', workflow: 'story', state: 'running', step: 'implement', round: 2, session: '75cb46e1',
        branch: 'mission/refit', worktree: '../ivy-refit', caffeinate: true, wall: 14 * M, deviations: 1,
        attention: 'light', tokens: { input: 310_200, cached: 4_100_000, output: 48_000 }, steps: refitSteps,
        diff: { added: 412, removed: 96 },
      }),
      mission({ name: 'memory', workflow: 'story', status: 'stub' }),
    ],
  },
  {
    name: 'igs',
    path: '~/dev/igs',
    parts: ivyParts.filter((p) => ['commit', 'mission', 'verify', 'permissions'].includes(p.name)),
    sessions: [
      {
        id: 'b3f21c07', preset: 'quick', cwd: '~/dev/igs', idleSince: now - 12 * M,
        last: { at: now - 12 * M, verb: 'Notification', detail: 'waiting on the human', mark: '⊘' },
        question: 'Two recall strategies fit here, embeddings or a grep index. Which do you want for v1?',
      },
    ],
    missions: [
      mission({
        name: 'auth', workflow: 'fix', state: 'blocked', step: 'merge', round: 2, session: '8a9e6b42',
        branch: 'mission/auth', wall: 2 * H + 4 * M, tokens: { input: 96_400, cached: 1_100_000, output: 22_800 },
        diff: { added: 120, removed: 34 }, steps: authSteps,
      }),
    ],
  },
  {
    name: 'cut',
    path: '~/dev/cut',
    parts: ivyParts.filter((p) => ['commit', 'mission'].includes(p.name)),
    sessions: [],
    missions: [
      mission({
        name: 'intro', workflow: 'chore', status: 'closed', state: 'done', attention: 'light', wall: 41 * M,
        tokens: { input: 44_000, cached: 820_000, output: 9_100 }, closedAt: now - 2 * D,
      }),
    ],
  },
];

const retroBody = `# Retro

## Tools

The codegraph MCP paid for itself twice: both recovery designs came out of one query.
The browse tool timed out on the login flow, the Validator fell back to curl and said so.

## Context

AGENTS.md is doing the work a spec should do. Three steps quoted it back at me.
The Worker prompt is still under 40 lines and nobody complained.

## Workflow

Two rounds of verify on a copy change is one round too many, the second found nothing.`.split('\n');

/** Oldest first: the Inbox reads like a queue, the newest arrival lands at the foot. */
const inbox: InboxItem[] = [
  {
    kind: 'triage', project: 'igs', origin: 'auth', label: 'triage r2', at: now - 1 * H,
    plan: [
      { action: 'fix', text: 'A3 session cookie survives logout — Worker, one round' },
      { action: 'fix', text: 'A7 refresh token not rotated on reuse' },
      { action: 'fix', text: 'A9 rate limit counts by IP, not by account' },
      { action: 'skip', text: 'A4 password rules read oddly — copy, not behaviour' },
      { action: 'skip', text: 'A11 device list paging — out of the contract' },
    ],
  },
  {
    kind: 'question', project: 'igs', origin: 'quick', label: 'asks', at: now - 8 * M,
    text: 'Two recall strategies fit here, embeddings or a grep index. Embeddings need a model on the box and a rebuild whenever a note changes; a grep index is instant and dumb. Which do you want for v1?',
    tab: 'factory-igs-quick',
  },
  {
    kind: 'gate', project: 'igs', origin: 'auth', label: 'gate merge', at: now - 3 * M,
    file: 'retro.md', lines: 41, body: retroBody,
  },
];

export const snapshot: Snapshot = { projects, inbox, activity: [...refitLog, ...authLog, ...quickLog], caffeinate: 'auto' };
