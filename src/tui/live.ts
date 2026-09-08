import path from 'node:path';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { existingProjects, factoryHome, home } from '../core/projects.js';
import { loadConfig, readCaffeinate } from '../core/config.js';
import { readDecisions, type Decision } from '../core/decision.js';
import { stepRole } from '../core/workflow.js';
import { git, listArchived, listMissions, missionRowState, missionWorkflow, sessionLive, trunkBranch } from '../core/mission.js';
import { scanProject } from '../core/scanner.js';
import { allParts, loadParts, projectOnly } from '../core/registry.js';
import { readTranscript, sumUsage, transcriptPath, type Tail } from './transcript.js';
import { dur, id } from './format.js';
import type { Mission as CoreMission, WorkflowStep } from '../types.js';
import { stepKind } from './model.js';
import type {
  Activity, InboxItem, Mission, PartRow, Project, RunState, Session, Snapshot, StepRow,
} from './model.js';

/**
 * The screen from the files that are already there: the projects list, each mission's state.json,
 * the hook's event lines, the caffeinate pids and Claude Code's transcripts. Everything but the
 * transcripts is read from scratch on every rebuild — they are all small, and a cache that lies
 * costs more than the read.
 */

/** A session nobody touched for a day is history, not something the screen waits on. */
const DAY = 24 * 60 * 60 * 1000;
/** A gate body is read to be skimmed, not to be paged through. */
const BODY_LINES = 200;

const events = (): string => path.join(factoryHome(), 'events');

// ── events ───────────────────────────────────────────────────────────────────

interface Ev {
  session: string;
  cwd: string;
  /** The same folder with every symlink resolved: what a project path is compared against. */
  real: string;
  at: number;
  event: string;
  detail: string;
  preset: string;
  /** Every Stop the session has logged: the one activity row the transcript does not carry. */
  stops: number[];
  /** Every prompt the human sent, the other row the transcript does not carry as its own. */
  prompts: { at: number; text: string }[];
  /** Every background sub-agent that reported back: a turn starts there too, with nobody typing. */
  reports: { at: number; text: string }[];
  /** The final message of a Stop nobody has answered yet; `null` when nothing is waiting. */
  asks: string | null;
  /** The final message of the last Stop, answered or not. */
  said: string;
  /** What Mission Control's `N` called it, on the one line of this file the hook did not write. */
  name: string;
}

interface EventLine { at?: string; event?: string; cwd?: string; detail?: string | null }

/** The Warp tab config and the prompt file are named after the preset; the hook logs its source. */
const PRESETS = ['orchestrator', 'quick', 'research'];

function parse(line: string): EventLine | null {
  try {
    return JSON.parse(line) as EventLine;
  } catch {
    return null;
  }
}

async function readEvents(): Promise<Map<string, Ev>> {
  const out = new Map<string, Ev>();
  for (const name of await readdir(events()).catch(() => [])) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.join(events(), name);
    const info = await stat(file).catch(() => null);
    if (!info || Date.now() - info.mtimeMs > DAY) continue;

    const lines = (await readFile(file, 'utf-8').catch(() => '')).split('\n').filter((l) => l !== '');
    const last = parse(lines[lines.length - 1] ?? '');
    const at = Date.parse(last?.at ?? '');
    if (!last || Number.isNaN(at) || Date.now() - at > DAY) continue;

    const stops: number[] = [];
    const prompts: Ev['prompts'] = [];
    const reports: Ev['reports'] = [];
    let said = '';
    let called = '';
    let preset = 'quick';
    // What the session is waiting on the human with is the end of a turn, and only a prompt
    // answers it: an idle Notification after a Stop is the same question asked again, and one
    // before any Stop is a permission box nobody can read off this screen.
    let asks: string | null = null;
    for (const raw of lines) {
      const line = parse(raw);
      if (!line) continue;
      if (line.event === 'Stop') {
        stops.push(Date.parse(line.at ?? ''));
        asks = said = line.detail ?? '';
      }
      if (line.event === 'UserPromptSubmit' || line.event === 'SubagentReport') {
        asks = null;
        // Lines from before the hook told the two apart: a notification's tag is its first word.
        const report = line.event === 'SubagentReport' || (line.detail ?? '').startsWith('<task-notification>');
        const text = report && line.event !== 'SubagentReport' ? 'a sub-agent reported back' : line.detail ?? '';
        (report ? reports : prompts).push({ at: Date.parse(line.at ?? ''), text });
      }
      if (line.event === 'SessionStart' && PRESETS.includes(line.detail ?? '')) preset = line.detail!;
      if (line.event === 'Rename') called = line.detail ?? '';
    }
    const cwd = last.cwd ?? '';
    out.set(name.slice(0, -6), {
      session: name.slice(0, -6), cwd, real: await realpath(cwd).catch(() => cwd), at, event: last.event ?? '',
      detail: last.detail ?? '', preset, stops: stops.filter((s) => !Number.isNaN(s)),
      prompts: prompts.filter((p) => !Number.isNaN(p.at)), reports: reports.filter((r) => !Number.isNaN(r.at)), asks, said, name: called,
    });
  }
  return out;
}

/** The final message of the turn that ended: the tail has it whole, the hook's Stop has it clipped. */
const said = (ev: Ev | undefined, tail: Tail | null): string => tail?.text || ev?.said || '';

/**
 * What a session is asking the human. A turn that ended is not a question by itself, most final
 * messages are statements: it asks when its last line ends in `?`, or when the turn put an
 * AskUserQuestion to the human. Nothing while a sub-agent is still out.
 */
function asking(ev: Ev | undefined, tail: Tail | null): string {
  if (ev?.asks == null || working(tail)) return '';
  const text = said(ev, tail);
  const lastLine = text.trim().split('\n').filter((l) => l.trim() !== '').at(-1) ?? '';
  const since = turnStart(ev, Infinity) ?? 0;
  const askedTool = tail?.activity.some((a) => a.verb === 'ask' && a.at > since) ?? false;
  return /\?\s*$/.test(lastLine) || askedTool ? text : '';
}

/** The role of a sub-agent the session still has out in the background, if any. */
function working(tail: Tail | null): string | undefined {
  const [agent] = tail?.running ?? [];
  return agent === undefined ? undefined : tail?.agents.get(agent) ?? 'agent';
}

// ── steps ────────────────────────────────────────────────────────────────────

/** A parallel group draws as its own rows: the group, then each member under it. */
const flatten = (steps: WorkflowStep[]): WorkflowStep[] =>
  steps.flatMap((step) => [step, ...(step.parallel ?? []).map((name): WorkflowStep => ({ name }))]);

function stepRows(m: CoreMission, steps: WorkflowStep[], tail: Tail | null): StepRow[] {
  return flatten(steps)
    .map((step): StepRow => {
      const state = m.state.steps[step.name];
      const gateOpen = m.state.gates[step.name]?.status === 'open';
      const start = Date.parse(state?.startedAt ?? '');
      const end = Date.parse(state?.endedAt ?? '');
      const from = Number.isNaN(start) ? null : start;
      const to = Number.isNaN(end) ? Date.now() : end;
      const role = stepRole(step);
      return {
        name: step.name,
        kind: stepKind(step),
        status: (gateOpen ? 'blocked' : state?.status ?? 'pending') as RunState,
        role,
        ...(state?.runs ? { runs: state.runs } : {}),
        ...(from ? { wall: to - from } : {}),
        ...(from && tail ? { tokens: sumUsage(tail.usage, from, to, role, tail.agents) } : {}),
        ...(gateOpen ? { gateOpen } : {}),
      };
    });
}

// ── inbox ────────────────────────────────────────────────────────────────────

async function bodyOf(dir: string, file: string): Promise<string[]> {
  const text = await readFile(path.join(dir, file), 'utf-8').catch(() => '');
  return text === '' ? [] : text.replace(/\n$/, '').split('\n').slice(0, BODY_LINES);
}

/** Everything of one mission that waits on the human: each open gate, each waiting decision. */
async function waitItems(project: string, m: CoreMission, decisions: Decision[]): Promise<InboxItem[]> {
  const items: InboxItem[] = [];
  for (const [step, gate] of Object.entries(m.state.gates)) {
    if (gate.status !== 'open') continue;
    const body = gate.file ? await bodyOf(m.dir, gate.file) : [];
    items.push({
      kind: 'gate', project, origin: m.state.name, at: Date.parse(gate.at) || Date.now(),
      label: `gate ${step}`, answer: `factory gate answer ${step} accept|amend|reject`,
      file: gate.file ?? '', lines: body.length, body,
    });
  }
  // decisions.md carries no clock, so a waiting row is as old as the last thing the mission wrote.
  const at = Date.parse(m.state.updated) || Date.now();
  for (const d of decisions.filter((row) => row.status === 'waiting')) {
    items.push({
      kind: 'decision', project, origin: m.state.name, at, label: `decision ${d.id}`,
      answer: `factory decision answer ${d.id} accept|overrule`,
      text: `${d.step} · ${d.by} · ${d.confidence}\n${d.summary}`,
    });
  }
  return items;
}

function question(project: string, origin: string, tab: string, text: string, at: number): InboxItem {
  return { kind: 'question', project, origin, label: 'asks', at, text, tab };
}

// ── git ──────────────────────────────────────────────────────────────────────

interface Diff { added: number; removed: number }

const diffs = new Map<string, Diff>();
const counting = new Map<string, Promise<void>>();

/**
 * Lines the branch adds and removes against the trunk. `git diff` on a large repo costs more than
 * a frame does, so the count runs behind the snapshot: the row carries the last one until the next
 * result lands, and nothing at all until the first. One run per checkout at a time.
 */
function diffCount(cwd: string, branch: string): Diff | undefined {
  const key = `${cwd}:${branch}`;
  if (!counting.has(key)) {
    counting.set(key, (async () => {
      try {
        const out = await git(cwd, 'diff', '--shortstat', `${await trunkBranch(cwd)}...${branch}`);
        diffs.set(key, {
          added: Number(/(\d+) insertion/.exec(out)?.[1] ?? 0),
          removed: Number(/(\d+) deletion/.exec(out)?.[1] ?? 0),
        });
      } catch {
        // No trunk, no branch yet, a checkout mid-rebase: the row keeps the count it had.
      } finally {
        counting.delete(key);
      }
    })());
  }
  return diffs.get(key);
}

/** A frame is a still, not a stream: it waits for the counts in flight, then builds once more. */
export async function settle(): Promise<void> {
  await Promise.all([...counting.values()]);
}

// ── missions and sessions ────────────────────────────────────────────────────

/** `logged` is per session: two missions can name one — a closed one and its successor. */
interface Ctx { activity: Activity[]; inbox: InboxItem[]; logged: Set<string> }

/** The tool calls a turn made: everything in the log between a prompt and its Stop that is not prose. */
const TOOLS = new Set<Activity['verb']>(['bash', 'edit', 'read', 'sub', 'ask', 'tool']);

/** When the turn that ended at `at` began: the last prompt or sub-agent report before it. */
const turnStart = (ev: Ev, at: number): number | undefined =>
  [...ev.prompts, ...ev.reports].map((t) => t.at).filter((t) => t <= at).sort((a, b) => a - b).at(-1);

/** Rows the log shows for one session: its transcript blocks plus the hook's prompt and Stop lines.
 *  A Stop row sums its turn — how long, how many tools — from the prompt that opened it. */
function logRows(ctx: Ctx, tail: Tail | null, ev: Ev | undefined, session: string): void {
  if (session === '' || ctx.logged.has(session)) return;
  ctx.logged.add(session);
  if (tail) ctx.activity.push(...tail.activity);
  for (const { at, text } of ev?.prompts ?? []) ctx.activity.push({ at, session, verb: 'user', text });
  for (const { at, text } of ev?.reports ?? []) ctx.activity.push({ at, session, verb: 'sub', text: `← ${text}` });
  for (const at of ev?.stops ?? []) {
    const from = turnStart(ev!, at);
    const tools = toolCount(tail, from, at);
    const text = from === undefined ? '' : `turn ${dur(at - from)} · ${tools} tool${tools === 1 ? '' : 's'}`;
    ctx.activity.push({ at, session, verb: 'stop', text });
  }
}

const toolCount = (tail: Tail | null, from: number | undefined, to: number): number =>
  tail?.activity.filter((a) => TOOLS.has(a.verb) && a.at > (from ?? 0) && a.at <= to).length ?? 0;

/** The open turn, or the last one that ended: what the SESSION pane sums under `turn`. */
function turnOf(ev: Ev, tail: Tail | null): Session['turn'] {
  const at = turnStart(ev, Infinity);
  if (at === undefined) return undefined;
  const end = ev.stops.filter((t) => t >= at).at(-1);
  return { at, tools: toolCount(tail, at, end ?? Infinity), ...(end === undefined ? {} : { wall: end - at }) };
}

/** A stub's own words: the first paragraph under `## Why`, joined onto one line. */
async function intentWhy(dir: string): Promise<string | undefined> {
  const text = await readFile(path.join(dir, 'intent.md'), 'utf-8').catch(() => '');
  const body = text.split(/^## Why\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const paragraph = body.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, ' ').trim()).find((s) => s !== '');
  return paragraph;
}

async function missionRow(ctx: Ctx, project: string, dir: string, m: CoreMission, ev: Ev | undefined, archived: boolean): Promise<Mission> {
  const state = m.state;
  // A worktree mission runs in its own checkout, so that is where its transcript was written.
  const cwd = ev?.cwd || state.worktree || dir;
  const tail = state.session ? await readTranscript(transcriptPath(cwd, state.session), state.session, cwd) : null;
  const workflow = await missionWorkflow(m).catch(() => null);
  const steps = stepRows(m, workflow?.steps ?? [], tail);

  const decisions = await readDecisions(m.dir);

  // A closed mission's session is history: what it asks now is its own row's, or the next mission's.
  if (state.status !== 'closed') {
    logRows(ctx, tail, ev, state.session ?? '');
    ctx.inbox.push(...(await waitItems(project, m, decisions)));
    const asks = asking(ev, tail);
    if (asks) ctx.inbox.push(question(project, state.name, `factory-${state.name}`, asks, ev!.at));
  }

  // A worktree mission's diff is counted where that mission's commits are.
  const diff = state.status === 'open' && state.branch ? diffCount(state.worktree || dir, state.branch) : undefined;

  const why = state.status === 'stub' ? await intentWhy(m.dir) : undefined;

  return {
    name: state.name,
    title: state.title,
    ...(why ? { why } : {}),
    workflow: state.workflow,
    status: state.status,
    state: missionRowState(state) as RunState,
    autonomy: state.autonomy,
    archived,
    step: state.step || null,
    round: state.round,
    session: state.session,
    preset: ev?.preset ?? null,
    branch: state.branch,
    worktree: state.worktree,
    wall: steps.reduce((n, s) => n + (s.wall ?? 0), 0),
    tokens: tail ? sumUsage(tail.usage) : { input: 0, cached: 0, output: 0 },
    ...(diff ? { diff } : {}),
    steps,
    decisions,
    deviations: state.deviations.map((d) => `${d.what}: ${d.reason}`),
    ...(state.status === 'closed' ? { closedAt: Date.parse(state.updated) || Date.now() } : {}),
  };
}

async function sessionRow(ctx: Ctx, project: string, ev: Ev): Promise<Session> {
  const tail = await readTranscript(transcriptPath(ev.cwd, ev.session), ev.session, ev.cwd);
  logRows(ctx, tail, ev, ev.session);
  const asks = asking(ev, tail);
  if (asks) ctx.inbox.push(question(project, id(ev.session), ev.preset, asks, ev.at));

  const agent = working(tail);
  const now = tail.activity.filter((a) => a.status === 'running').at(-1);
  const turn = turnOf(ev, tail);
  const spend = sumUsage(tail.usage);
  // The screen's own name outranks Claude Code's: it is the later word, given on this screen.
  const name = ev.name || tail.title;
  return {
    id: ev.session,
    ...(name ? { name } : {}),
    // No hook fires between a prompt and its Stop: a prompt after the last Stop is a turn in flight.
    busy: ev.asks === null || agent !== undefined,
    ...(agent ? { agent } : {}),
    preset: ev.preset,
    cwd: ev.cwd,
    idleSince: ev.stops.at(-1) ?? ev.at,
    ...(now ? { now } : {}),
    ...(turn ? { turn } : {}),
    tokens: { input: spend.input, output: spend.output },
    // Sub-agents spend in their own windows: only the session's own last turn says how full its is.
    context: (({ input, cached }) => input + cached)(tail.usage.filter((u) => !u.agent).at(-1) ?? { input: 0, cached: 0 }),
  };
}

// ── snapshot ─────────────────────────────────────────────────────────────────

const parts = async (dir: string): Promise<PartRow[]> =>
  (await scanProject(dir)).map((s) => ({
    name: s.part.name, type: s.part.type, description: s.part.description,
    status: s.status === 'installed' || s.status === 'modified' ? s.status : 'not-installed',
    scope: s.part.scope, recommended: s.part.recommended,
    files: s.part.files.map((f) => f.target),
  }));

/**
 * The global row lists every part the Factory ships, the ones config turned `off` included: scope
 * is chosen there, and a part nobody can see is a part nobody can turn back on. Only what resolves
 * global has a status to read — the rest is somebody else's `.claude/`.
 */
async function globalParts(): Promise<PartRow[]> {
  const scanned = new Map((await parts(home())).map((row) => [row.name, row]));
  const inPlay = new Map((await loadParts()).map((p) => [p.name, p]));
  return (await allParts()).map((part): PartRow => ({
    name: part.name, type: part.type, description: part.description,
    status: scanned.get(part.name)?.status ?? 'not-installed',
    scope: inPlay.get(part.name)?.scope ?? 'off',
    recommended: part.recommended,
    ...(projectOnly(part) ? { projectOnly: true } : {}),
    files: part.files.map((f) => f.target),
  }));
}

interface Dir { dir: string; real: string }

/** One folder can be registered twice under two names for it — /tmp and /private/tmp. Once each. */
async function projectDirs(): Promise<Dir[]> {
  const seen = new Set<string>();
  const dirs: Dir[] = [];
  for (const dir of await existingProjects()) {
    const real = await realpath(dir).catch(() => dir);
    if (seen.has(real)) continue;
    seen.add(real);
    dirs.push({ dir, real });
  }
  return dirs;
}

/** Which project a session belongs to: the deepest one its resolved cwd sits under. */
function owner(dirs: Dir[], real: string): string | null {
  let best: string | null = null;
  for (const { real: dir } of dirs) {
    if ((real === dir || real.startsWith(`${dir}/`)) && (best === null || dir.length > best.length)) best = dir;
  }
  return best;
}

/** The order the human moved a list into; what the list does not name follows it, as it came. */
function ordered<T>(items: T[], names: string[] | undefined, nameOf: (t: T) => string): T[] {
  if (!names) return items;
  const rank = (t: T): number => { const i = names.indexOf(nameOf(t)); return i === -1 ? names.length : i; };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

export async function buildSnapshot(): Promise<Snapshot> {
  const order = (await loadConfig()).order ?? {};
  const dirs = ordered(await projectDirs(), order.projects, (d) => path.basename(d.dir));
  const events = await readEvents();
  const found = new Map<string, [mission: CoreMission, archived: boolean][]>();
  for (const { dir } of dirs) {
    const live = await listMissions(dir).catch(() => []);
    const archived = await listArchived(dir).catch(() => []);
    found.set(dir, [...live.map((m): [CoreMission, boolean] => [m, false]), ...archived.map((m): [CoreMission, boolean] => [m, true])]);
  }

  // A session bound to an open mission is that mission's row, never an unbound one of its own.
  // A closed mission keeps its session id as a record; the session, if it lives on, is free.
  const bound = new Set([...found.values()].flatMap((ms) =>
    ms.filter(([m]) => m.state.status !== 'closed').map(([m]) => m.state.session).filter((s) => s !== null)));
  const ctx: Ctx = { activity: [], inbox: [], logged: new Set() };
  const projects: Project[] = [];

  for (const { dir, real } of dirs) {
    const name = path.basename(dir);
    const missions: Mission[] = [];
    for (const [m, archived] of found.get(dir) ?? []) {
      const ev = m.state.session && m.state.status !== 'closed' ? events.get(m.state.session) : undefined;
      missions.push(await missionRow(ctx, name, real, m, ev, archived));
    }
    const sessions: Session[] = [];
    for (const ev of events.values()) {
      if (bound.has(ev.session) || owner(dirs, ev.real) !== real) continue;
      // A session the human can still answer. A dead one's question is a message nobody can reply to.
      if (!(await sessionLive(ev.session))) continue;
      sessions.push(await sessionRow(ctx, name, ev));
    }
    projects.push({
      name, path: dir, parts: await parts(dir),
      missions: ordered(missions, order[`${name}/missions`], (m) => m.name),
      sessions: ordered(sessions, order[`${name}/sessions`], (s) => s.id),
    });
  }

  ctx.inbox.sort((a, b) => a.at - b.at);
  ctx.activity.sort((a, b) => a.at - b.at);
  return { projects, global: await globalParts(), inbox: ctx.inbox, activity: ctx.activity, caffeinate: await readCaffeinate() };
}
