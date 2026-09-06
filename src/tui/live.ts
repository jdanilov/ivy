import path from 'node:path';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { existingProjects, FACTORY_HOME } from '../core/projects.js';
import { listMissions, missionRowState, missionWorkflow } from '../core/mission.js';
import { scanProject } from '../core/scanner.js';
import { readTranscript, sumUsage, transcriptPath, type Tail } from './transcript.js';
import type { Mission as CoreMission, WorkflowStep } from '../types.js';
import type {
  Activity, Caffeinate, InboxItem, Mission, PartRow, Project, RunState, Session, Snapshot, StepKind, StepRow, TriageLine,
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

const EVENTS = path.join(FACTORY_HOME, 'events');
const PIDS = path.join(FACTORY_HOME, 'caffeinate');
const CONFIG = path.join(FACTORY_HOME, 'config.yaml');

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
  for (const name of await readdir(EVENTS).catch(() => [])) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.join(EVENTS, name);
    const info = await stat(file).catch(() => null);
    if (!info || Date.now() - info.mtimeMs > DAY) continue;

    const lines = (await readFile(file, 'utf-8').catch(() => '')).split('\n').filter((l) => l !== '');
    const last = parse(lines[lines.length - 1] ?? '');
    const at = Date.parse(last?.at ?? '');
    if (!last || Number.isNaN(at) || Date.now() - at > DAY) continue;

    const stops: number[] = [];
    let preset = 'quick';
    for (const raw of lines) {
      const line = parse(raw);
      if (!line) continue;
      if (line.event === 'Stop') stops.push(Date.parse(line.at ?? ''));
      if (line.event === 'SessionStart' && PRESETS.includes(line.detail ?? '')) preset = line.detail!;
    }
    const cwd = last.cwd ?? '';
    out.set(name.slice(0, -6), {
      session: name.slice(0, -6), cwd, real: await realpath(cwd).catch(() => cwd), at, event: last.event ?? '',
      detail: last.detail ?? '', preset, stops: stops.filter((s) => !Number.isNaN(s)),
    });
  }
  return out;
}

/** A session waits on the human when its last event was the end of a turn or a prompt. */
const waiting = (ev: Ev | undefined): boolean => ev?.event === 'Stop' || ev?.event === 'Notification';

// ── steps ────────────────────────────────────────────────────────────────────

const KIND: Record<string, StepKind> = { implement: 'implement', verify: 'gatekeeper', validate: 'gatekeeper' };

/** A step's colour family: what the workflow says it is, then what it is called. */
function stepKind(step: WorkflowStep): StepKind {
  if (step.gate) return 'gate';
  if (step.role === 'worker') return 'implement';
  if (step.role === 'verifier' || step.role === 'validator') return 'gatekeeper';
  return KIND[step.name] ?? 'plain';
}

function stepRows(m: CoreMission, steps: WorkflowStep[], tail: Tail | null): StepRow[] {
  return steps.flatMap((step): WorkflowStep[] => [step, ...(step.parallel ?? []).map((name) => ({ name }))])
    .map((step): StepRow => {
      const state = m.state.steps[step.name];
      const gateOpen = m.state.gates[step.name]?.status === 'open';
      const start = Date.parse(state?.startedAt ?? '');
      const end = Date.parse(state?.endedAt ?? '');
      const from = Number.isNaN(start) ? null : start;
      const to = Number.isNaN(end) ? Date.now() : end;
      return {
        name: step.name,
        kind: stepKind(step),
        status: (gateOpen ? 'blocked' : state?.status ?? 'pending') as RunState,
        ...(step.role ? { role: step.role } : {}),
        ...(from ? { wall: to - from } : {}),
        ...(from && tail ? { tokens: sumUsage(tail.usage, from, to) } : {}),
        ...(gateOpen ? { gateOpen } : {}),
      };
    });
}

// ── inbox ────────────────────────────────────────────────────────────────────

/** The triage the orchestrator wrote: `fix` or `skip` in a findings.md table row. */
function triagePlan(body: string[]): TriageLine[] {
  const plan: TriageLine[] = [];
  for (const line of body) {
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
    const action = cells.find((c) => c === 'fix' || c === 'skip') as TriageLine['action'] | undefined;
    if (!action || cells.length < 2) continue;
    plan.push({ action, text: cells.filter((c) => c !== action).sort((a, b) => b.length - a.length)[0] ?? '' });
  }
  return plan;
}

async function bodyOf(dir: string, file: string): Promise<string[]> {
  const text = await readFile(path.join(dir, file), 'utf-8').catch(() => '');
  return text === '' ? [] : text.replace(/\n$/, '').split('\n').slice(0, BODY_LINES);
}

/** An open gate is one Inbox item; on the accept step it is the round's triage. */
async function gateItems(project: string, m: CoreMission): Promise<InboxItem[]> {
  const items: InboxItem[] = [];
  for (const [step, gate] of Object.entries(m.state.gates)) {
    if (gate.status !== 'open') continue;
    const at = Date.parse(gate.at) || Date.now();
    const base = { project, origin: m.state.name, at };
    if (step === 'accept') {
      const body = await bodyOf(m.dir, 'findings.md');
      items.push({ ...base, kind: 'triage', label: `triage r${m.state.round}`, plan: triagePlan(body) });
      continue;
    }
    const body = gate.file ? await bodyOf(m.dir, gate.file) : [];
    items.push({ ...base, kind: 'gate', label: `gate ${step}`, file: gate.file ?? '', lines: body.length, body });
  }
  return items;
}

function question(project: string, origin: string, tab: string, text: string, at: number): InboxItem {
  return { kind: 'question', project, origin, label: 'asks', at, text, tab };
}

// ── missions and sessions ────────────────────────────────────────────────────

/** The hook records one pid per session; a stale file outlives the process that made it. */
async function caffeinated(session: string | null): Promise<boolean> {
  if (!session) return false;
  const pid = Number(await readFile(path.join(PIDS, `${session}.pid`), 'utf-8').catch(() => ''));
  try {
    return pid > 0 && process.kill(pid, 0);
  } catch {
    return false;
  }
}

/** `logged` is per session: two missions can name one — a closed one and its successor. */
interface Ctx { activity: Activity[]; inbox: InboxItem[]; logged: Set<string> }

/** Rows the log shows for one session: its transcript blocks plus the hook's Stop lines. */
function logRows(ctx: Ctx, tail: Tail | null, ev: Ev | undefined, session: string): void {
  if (session === '' || ctx.logged.has(session)) return;
  ctx.logged.add(session);
  if (tail) ctx.activity.push(...tail.activity);
  for (const at of ev?.stops ?? []) ctx.activity.push({ at, session, verb: 'Stop', text: '' });
}

async function missionRow(ctx: Ctx, project: string, dir: string, m: CoreMission, ev: Ev | undefined): Promise<Mission> {
  const state = m.state;
  // A worktree mission runs in its own checkout, so that is where its transcript was written.
  const cwd = ev?.cwd || state.worktree || dir;
  const tail = state.session ? await readTranscript(transcriptPath(cwd, state.session), state.session, cwd) : null;
  const workflow = await missionWorkflow(m).catch(() => null);
  const steps = stepRows(m, workflow?.steps ?? [], tail);

  logRows(ctx, tail, ev, state.session ?? '');
  ctx.inbox.push(...(await gateItems(project, m)));
  if (waiting(ev) && tail?.text) {
    ctx.inbox.push(question(project, state.name, `factory-${state.name}`, tail.text, ev!.at));
  }

  return {
    name: state.name,
    workflow: state.workflow,
    status: state.status,
    state: missionRowState(state) as RunState,
    attention: state.attention,
    step: state.step || null,
    round: state.round,
    session: state.session,
    branch: state.branch,
    worktree: state.worktree,
    caffeinate: await caffeinated(state.session),
    wall: steps.reduce((n, s) => n + (s.wall ?? 0), 0),
    tokens: tail ? sumUsage(tail.usage) : { input: 0, cached: 0, output: 0 },
    steps,
    deviations: state.deviations.length,
    ...(state.status === 'closed' ? { closedAt: Date.parse(state.updated) || Date.now() } : {}),
  };
}

async function sessionRow(ctx: Ctx, project: string, ev: Ev): Promise<Session> {
  const tail = await readTranscript(transcriptPath(ev.cwd, ev.session), ev.session, ev.cwd);
  logRows(ctx, tail, ev, ev.session);
  const asks = waiting(ev) ? tail.text : '';
  if (asks) ctx.inbox.push(question(project, ev.preset, ev.preset, asks, ev.at));

  return {
    id: ev.session,
    preset: ev.preset,
    cwd: ev.cwd,
    idleSince: ev.at,
    last: { at: ev.at, verb: ev.event, detail: ev.detail },
    ...(asks ? { question: asks } : {}),
  };
}

// ── snapshot ─────────────────────────────────────────────────────────────────

/** The mode the human chose. Read from the file every time: `c` rewrites it while we run. */
async function caffeinateMode(): Promise<Caffeinate> {
  const raw = await readFile(CONFIG, 'utf-8').catch(() => '');
  const value = raw === '' ? null : (Bun.YAML.parse(raw) as { caffeinate?: unknown } | null)?.caffeinate;
  return value === 'on' || value === 'off' ? value : 'auto';
}

const parts = (states: Awaited<ReturnType<typeof scanProject>>): PartRow[] =>
  states.map((s) => ({
    name: s.part.name, type: s.part.type,
    status: s.status === 'installed' || s.status === 'modified' ? s.status : 'not-installed',
    files: s.part.files.map((f) => f.target),
  }));

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

export async function buildSnapshot(): Promise<Snapshot> {
  const dirs = await projectDirs();
  const events = await readEvents();
  const found = new Map<string, CoreMission[]>();
  for (const { dir } of dirs) found.set(dir, await listMissions(dir).catch(() => []));

  // A session bound to any mission is that mission's row, never an unbound one of its own.
  const bound = new Set([...found.values()].flatMap((ms) => ms.map((m) => m.state.session).filter((s) => s !== null)));
  const ctx: Ctx = { activity: [], inbox: [], logged: new Set() };
  const projects: Project[] = [];

  for (const { dir, real } of dirs) {
    const name = path.basename(dir);
    const missions: Mission[] = [];
    for (const m of found.get(dir) ?? []) {
      missions.push(await missionRow(ctx, name, real, m, m.state.session ? events.get(m.state.session) : undefined));
    }
    const sessions: Session[] = [];
    for (const ev of events.values()) {
      if (bound.has(ev.session) || owner(dirs, ev.real) !== real) continue;
      sessions.push(await sessionRow(ctx, name, ev));
    }
    projects.push({ name, path: dir, missions, sessions, parts: parts(await scanProject(dir)) });
  }

  ctx.inbox.sort((a, b) => a.at - b.at);
  ctx.activity.sort((a, b) => a.at - b.at);
  return { projects, inbox: ctx.inbox, activity: ctx.activity, caffeinate: await caffeinateMode() };
}
