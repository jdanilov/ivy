import { stepRole } from '../core/workflow.js';
import type { WorkflowStep } from '../types.js';
import { stepKind } from './model.js';
import type { Activity, Decision, InboxItem, Mission, PartRow, Project, Scope, ScopeChoice, Snapshot, StepRow } from './model.js';

/** Fake data for the look-and-feel prototype. Every age is an offset from `now`, so the screen keeps its shape. */

const M = 60_000;
const H = 60 * M;
const D = 24 * H;
// A literal, not `Date.now()`: stamping at generation time rewrites every ACTIVITY row whenever frames are regenerated.
const now = 1_788_782_400_000; // 2026-09-07T12:00:00Z

/** The kind and the runner are never spelled out here: the fixture reads both through the
 *  mappings the live snapshot uses, so a look review is a review of what ships. */
function steps(spec: [name: string, status: StepRow['status'], wall?: number, of?: Omit<WorkflowStep, 'name'>,
  tokens?: StepRow['tokens'], runs?: number][]): StepRow[] {
  return spec.map(([name, status, wall, of, tokens, runs]) => {
    const step: WorkflowStep = { name, ...of };
    return { name, status, wall, tokens, runs, kind: stepKind(step), role: stepRole(step) };
  });
}

// The two finished steps carry their spend, so the graph's tokens column is on screen in a look review.
const refitSteps = steps([
  ['intent', 'done', 12 * M, { gate: 'human' }, { input: 24_000, cached: 260_000, output: 4_800 }],
  ['research', 'skipped', undefined, { role: 'investigator' }],
  ['spec', 'done', 8 * M, undefined, { input: 41_500, cached: 620_000, output: 9_300 }],
  ['implement', 'running', 6 * M, { role: 'worker' }, undefined, 2],
  ['review', 'pending', undefined, { parallel: ['verify', 'validate'] }],
  ['verify', 'pending'], ['validate', 'pending'], ['merge', 'pending', undefined, { gate: 'human' }],
]);

/** `minutes back|verb|text`, oldest first — the shape wiring will read out of the transcript. */
function log(session: string, spec: string): Activity[] {
  return spec.trim().split('\n').map((row) => {
    const [back, verb, text] = row.split('|') as [string, Activity['verb'], string];
    return { at: now - Math.round(Number(back) * M), session, verb, text };
  });
}

const refitLog = log('75cb46e1', `
30.2|You|Round 2: fix the three Verifier findings, skip nothing without a reason.
30.0|Text|Round 2 opens. Three findings from the Verifier, all in the render path.
29.5|Read|.factory/missions/2026-09-06-refit/findings.md
28.6|Bash|rg -n "destroyRecursively" src
28.0|Text|Triage: fix F1 and F2, skip F3 — the divider is cosmetic and out of the contract.
27.4|Agent|Worker implement round 2
26.3|Read|src/ui/format.ts
25.7|Edit|src/tui/screen.ts destroy the old row tree instead of removing it
24.4|Edit|src/tui/format.ts spread() pads to the pane width
23.1|Bash|bun scripts/test.ts
22.4|Text|Two cases fail: the status bar no longer fits its metrics at 100 columns.
21.1|Edit|src/tui/screen.ts cap the progress bar at a third of the line
20.3|Bash|bun scripts/test.ts
18.9|Stop|Worker handed off: 4 files, 2 fixes, F3 skipped with a reason
18.1|Text|Handoff reads clean. Verify before the accept gate.
17.4|Agent|Verifier round 2
16.8|Read|.factory/missions/2026-09-06-refit/acceptance.md
15.3|Read|src/tui/screen.ts
14.6|Text|A2 pass, A5 pass, A9 unchecked — nothing drives the 100-column case.
13.8|Stop|Verifier findings written
13.0|Agent|Worker implement round 2
12.3|Edit|scripts/test.ts a 100x24 render case
11.6|Bash|bun scripts/test.ts
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
  ['intent', 'done', 4 * M, { gate: 'human' }], ['implement', 'done', 71 * M, { role: 'worker' }],
  ['verify', 'done', 22 * M], ['merge', 'blocked', undefined, { gate: 'human' }],
]);
authSteps[3]!.gateOpen = true;

/** `id step by confidence summary status note`, the columns of the mission's own decisions.md. */
function decisions(spec: [string, string, string, Decision['confidence'], string, Decision['status'], string?][]): Decision[] {
  return spec.map(([id, step, by, confidence, summary, status, note]) => ({ id, step, by, confidence, summary, status, note: note ?? '' }));
}

const refitDecisions = decisions([
  ['D1', 'spec', 'orchestrator', 'HIGH', 'Four workers, serial — one context per ground', 'auto'],
  ['D2', 'implement', 'worker', 'MEDIUM', 'Reuse readJson for the manifest rather than a second parser', 'accepted'],
  // Long on purpose: a summary the human has to read whole is what the foot pane wraps for.
  ['D3', 'implement', 'worker', 'LOW', 'Do not implement auth here: the contract names one endpoint and the session store already carries the flag, so a second path would be two ways of saying one thing — KISS and YAGNI', 'waiting'],
  ['D4', 'review', 'orchestrator', 'MEDIUM', 'Triage r2: fix F1 and F3, skip F2 as cosmetic', 'overruled', 'fix F2 too, it is on the contract'],
]);

const authDecisions = decisions([
  ['D1', 'implement', 'worker', 'HIGH', 'Rotate the refresh token on every reuse', 'accepted'],
  ['D2', 'verify', 'verifier', 'LOW', 'Device-list paging is out of the contract, left alone', 'waiting'],
]);

const partFiles: Record<string, string[]> = {
  archify: ['.claude/skills/archify/skill.md', '.claude/skills/archify/template.html'],
  mission: ['.claude/skills/mission/skill.md', '.claude/agents/Worker.md', '.claude/agents/Investigator.md', '.claude/agents/Summarizer.md'],
};

const part = (name: string, type: string, description: string, status: PartRow['status'] = 'installed',
  scope: ScopeChoice = 'project', recommended: Scope = 'project'): PartRow =>
  ({ name, type, description, status, scope, recommended, files: partFiles[name] ?? [`.claude/skills/${name}/skill.md`] });

const ivyParts: PartRow[] = [
  part('archify', 'skill', 'architecture diagrams from a typed spec, html and svg', 'not-installed'),
  part('browse', 'tool', 'drive a real or headless browser through agent-browser'),
  part('code-format', 'fixture', 'how code is written'),
  part('codegraph', 'mcp', 'code graph MCP plus prompt hook, per project index', 'not-installed'),
  part('docs-format', 'fixture', 'how agent-facing docs are written'),
  part('hook-factory', 'fixture', 'report session events, file decisions, ring when the session waits'),
  part('mission', 'skill', 'run a mission through its workflow, gates and triage'),
  part('retro', 'skill', 'sweep closed missions\' retro.md into one table the human answers'),
  part('roadmap', 'fixture', 'template docs/roadmap.md, the project\'s plain checklist'),
  part('terminology', 'fixture', 'template docs/terminology.md for the project domain'),
  part('validate', 'skill', 'validator gatekeeper driving the running system'),
  part('verify', 'skill', 'verifier gatekeeper over the diff and the contract'),
];

/** The global row lists every part, because scope is chosen there: the ones copied into
 *  `~/.claude/` and shared by every project, the ones a project keeps, and the ones turned off. */
const globalParts: PartRow[] = [
  // Chosen `global` and not there yet: the one state the scope column draws in warning.
  part('browse', 'tool', 'drive a real or headless browser through agent-browser', 'not-installed', 'global', 'global'),
  part('commit', 'skill', 'structured git commits', 'installed', 'global', 'global'),
  part('explain', 'skill', 'visual code explanations and flow diagrams', 'installed', 'global', 'global'),
  part('hook-safe-bash', 'fixture', 'block destructive commands', 'installed', 'global', 'global'),
  part('mission', 'skill', 'run a mission end to end, from workflow and gates to close', 'not-installed'),
  part('permissions', 'fixture', 'baseline tool allow list in .claude/settings.json', 'installed', 'global', 'global'),
  part('research', 'tool', 'web research via Grok', 'not-installed', 'off', 'global'),
];

/** Everything a mission needs but a fixture rarely varies. */
function mission(m: Partial<Mission> & Pick<Mission, 'name' | 'workflow'>): Mission {
  return {
    title: m.name, status: 'open', state: 'pending', autonomy: 'full', archived: false, step: null, round: 0,
    session: null, preset: null, branch: null, worktree: null, wall: 0,
    tokens: { input: 0, cached: 0, output: 0 }, steps: [], decisions: [], deviations: [],
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
        preset: 'orchestrator', branch: 'mission/refit', worktree: '../ivy-refit', wall: 14 * M,
        deviations: [
          'skipped research: the recovery design was already in the intent',
          'added step polish after implement: the wrap rule landed after the spec was written',
        ],
        autonomy: 'partial', tokens: { input: 310_200, cached: 4_100_000, output: 48_000 }, steps: refitSteps,
        decisions: refitDecisions, diff: { added: 412, removed: 96 },
      }),
      mission({
        name: 'memory', title: 'Memory: the mem MCP', workflow: 'intent', status: 'stub',
        why: 'Every mission relearns the project from scratch. A per-project note store the hook recalls on prompt would let a session start where the last one stopped.',
      }),
    ],
  },
  {
    name: 'igs',
    path: '~/dev/igs',
    parts: ivyParts.filter((p) => ['commit', 'mission', 'verify', 'permissions'].includes(p.name)),
    sessions: [
      {
        id: 'b3f21c07', name: 'recall', busy: false, preset: 'quick', cwd: '~/dev/igs', idleSince: now - 12 * M,
        said: 'Two recall strategies fit here, embeddings or a grep index. Which do you want for v1?',
      },
    ],
    missions: [
      mission({
        name: 'auth', workflow: 'fix', state: 'blocked', step: 'merge', round: 2, session: '8a9e6b42',
        preset: 'orchestrator', branch: 'mission/auth', wall: 2 * H + 4 * M, autonomy: 'partial',
        tokens: { input: 96_400, cached: 1_100_000, output: 22_800 },
        diff: { added: 120, removed: 34 }, steps: authSteps, decisions: authDecisions,
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
        name: 'intro', workflow: 'chore', status: 'closed', state: 'done', autonomy: 'partial', wall: 41 * M,
        tokens: { input: 44_000, cached: 820_000, output: 9_100 }, closedAt: now - 2 * D,
      }),
      mission({
        name: 'seed', workflow: 'chore', status: 'closed', state: 'done', archived: true, wall: 18 * M,
        tokens: { input: 21_000, cached: 300_000, output: 4_200 }, closedAt: now - 9 * D,
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
    kind: 'decision', project: 'ivy', origin: 'refit', label: 'decision D3', at: now - 1 * H,
    answer: 'factory decision answer D3 accept|overrule',
    text: 'implement · worker · LOW\nDo not implement auth here, KISS and YAGNI',
  },
  {
    kind: 'decision', project: 'igs', origin: 'auth', label: 'decision D2', at: now - 22 * M,
    answer: 'factory decision answer D2 accept|overrule',
    text: 'verify · verifier · LOW\nDevice-list paging is out of the contract, left alone',
  },
  {
    kind: 'question', project: 'igs', origin: 'quick', label: 'asks', at: now - 8 * M,
    text: 'Two recall strategies fit here, embeddings or a grep index. Embeddings need a model on the box and a rebuild whenever a note changes; a grep index is instant and dumb. Which do you want for v1?',
    tab: 'factory-igs-quick',
  },
  {
    kind: 'gate', project: 'igs', origin: 'auth', label: 'gate merge', at: now - 3 * M,
    answer: 'factory gate answer merge accept|amend|reject',
    file: 'retro.md', lines: 41, body: retroBody,
  },
];

export const snapshot: Snapshot = {
  projects, global: globalParts, inbox, activity: [...refitLog, ...authLog, ...quickLog], caffeinate: 'auto',
};
