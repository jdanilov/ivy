import type { EventRow, InboxItem, Mission, PartRow, Project, Snapshot, StepRow } from './model.js';

/** Fake data for the look-and-feel prototype. Ages are relative, so the screen reads right whenever it runs. */

const M = 60_000;
const H = 60 * M;
const D = 24 * H;
const now = Date.now();

function steps(spec: [name: string, kind: StepRow['kind'], status: StepRow['status'], wall?: number][]): StepRow[] {
  return spec.map(([name, kind, status, wall]) => ({ name, kind, status, wall }));
}

const refitSteps = steps([
  ['grill', 'plain', 'done', 3 * M], ['intent', 'gate', 'done', 12 * M], ['research', 'plain', 'skipped'],
  ['spec', 'plain', 'done', 8 * M], ['implement', 'implement', 'running', 6 * M], ['accept', 'plain', 'pending'],
  ['verify', 'gatekeeper', 'pending'], ['validate', 'gatekeeper', 'pending'], ['condense', 'plain', 'pending'],
  ['merge', 'gate', 'pending'],
]);
refitSteps[4]!.role = 'worker';

const refitEvents: EventRow[] = (
  [
    [2 * M, 'SubagentStop', '[Worker]', '✓'], [8 * M, 'SubagentStop', '[Worker]', '✓'],
    [11 * M, 'PreToolUse', 'Bash bun x tsc --noEmit', ''], [14 * M, 'UserPromptSubmit', 'round 2, keep the linker', ''],
    [19 * M, 'Stop', 'triage r1 accepted', '✓'], [24 * M, 'SubagentStop', '[Verifier]', '✗'],
    [26 * M, 'SubagentStop', '[Validator]', '✓'], [38 * M, 'SubagentStop', '[Worker]', '✓'],
    [51 * M, 'Notification', 'gate intent open', '⊘'], [64 * M, 'SessionStart', 'preset orchestrator', ''],
  ] as const
).map(([back, verb, detail, mark]) => ({ at: now - back, session: '75cb46e1', verb, detail, mark }));

const authSteps = steps([
  ['grill', 'plain', 'done', 4 * M], ['implement', 'implement', 'done', 71 * M],
  ['verify', 'gatekeeper', 'done', 22 * M], ['merge', 'gate', 'blocked'],
]);
authSteps[3]!.gateOpen = true;

const ivyParts: PartRow[] = (
  [
    ['archify', 'skill', '.claude/skills/archify/skill.md'], ['browse', 'tool', '.claude/skills/browse/skill.md'],
    ['code-format', 'fixture', '.claude/code-format.md'], ['codegraph', 'mcp', '.claude/scripts/codegraph-gate.sh'],
    ['commit', 'skill', '.claude/skills/commit/skill.md'], ['docs-format', 'fixture', '.claude/docs-format.md'],
    ['explain', 'skill', '.claude/skills/explain/skill.md'], ['hook-factory', 'fixture', '.claude/scripts/hook-factory.ts'],
    ['hook-safe-bash', 'fixture', '.claude/scripts/safe-bash.sh'], ['mission', 'skill', '.claude/skills/mission/skill.md'],
    ['permissions', 'fixture', '.claude/settings.json'], ['research', 'tool', '.claude/skills/research/skill.md'],
    ['retro', 'skill', '.claude/skills/retro/skill.md'], ['roadmap', 'fixture', 'docs/roadmap.md'],
    ['terminology', 'fixture', 'docs/terminology.md'], ['validate', 'skill', '.claude/skills/validate/skill.md'],
    ['verify', 'skill', '.claude/skills/verify/skill.md'],
  ] as const
).map(([name, type, file]) => ({ name, type, file, status: name === 'archify' || name === 'codegraph' ? 'not-installed' : 'installed' }));

/** Everything a mission needs but a fixture rarely varies. */
function mission(m: Partial<Mission> & Pick<Mission, 'name' | 'workflow'>): Mission {
  return {
    status: 'open', state: 'pending', step: null, round: 0, session: null, branch: null, worktree: null,
    caffeinate: false, wall: 0, tokens: { input: 0, cached: 0, output: 0 }, steps: [], deviations: 0, events: [],
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
        tokens: { input: 310_200, cached: 4_100_000, output: 48_000 }, steps: refitSteps, events: refitEvents,
      }),
      mission({ name: 'memory', workflow: 'story', status: 'stub' }),
    ],
  },
  {
    name: 'igs',
    path: '~/dev/igs',
    parts: ivyParts.filter((p) => ['commit', 'mission', 'verify', 'permissions'].includes(p.name)),
    sessions: [{ id: '8a9e6b42', preset: 'quick', idleSince: now - 12 * M }],
    missions: [
      mission({
        name: 'auth', workflow: 'fix', state: 'blocked', step: 'merge', round: 2, session: '8a9e6b42',
        branch: 'mission/auth', wall: 2 * H + 4 * M, tokens: { input: 96_400, cached: 1_100_000, output: 22_800 },
        steps: authSteps,
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
        name: 'intro', workflow: 'chore', status: 'closed', state: 'done', wall: 41 * M,
        tokens: { input: 44_000, cached: 820_000, output: 9_100 }, closedAt: now - 2 * D,
      }),
    ],
  },
];

const retroBody = [
  '# Retro',
  '',
  '## Tools',
  '',
  'The codegraph MCP paid for itself twice: both recovery designs came out of one query.',
  'The browse tool timed out on the login flow, the Validator fell back to curl and said so.',
  '',
  '## Context',
  '',
  'AGENTS.md is doing the work a spec should do. Three steps quoted it back at me.',
  'The Worker prompt is still under 40 lines and nobody complained.',
  '',
];

const inbox: InboxItem[] = [
  {
    kind: 'gate',
    project: 'igs',
    origin: 'auth',
    label: 'gate merge',
    at: now - 3 * M,
    file: 'retro.md',
    lines: 41,
    body: retroBody,
  },
  {
    kind: 'question',
    project: 'igs',
    origin: 'quick',
    label: 'asks',
    at: now - 8 * M,
    text: 'Two recall strategies fit here, embeddings or a grep index. Which do you want for v1?',
    tab: 'factory-igs-quick',
  },
  {
    kind: 'triage',
    project: 'igs',
    origin: 'auth',
    label: 'triage r2',
    at: now - 1 * H,
    plan: [
      { action: 'fix', text: 'A3 session cookie survives logout — Worker, one round' },
      { action: 'fix', text: 'A7 refresh token not rotated on reuse' },
      { action: 'fix', text: 'A9 rate limit counts by IP, not by account' },
      { action: 'skip', text: 'A4 password rules read oddly — copy, not behaviour' },
      { action: 'skip', text: 'A11 device list paging — out of the contract' },
    ],
  },
];

export const snapshot: Snapshot = { projects, inbox };
