import path from 'node:path';
import * as p from '@clack/prompts';
import type { Autonomy, Mission, MissionState, WorkflowStep } from '../types.js';
import { str, type Flags } from '../core/args.js';
import {
  Refusal, archiveMission, closeMission, createMission, currentBranch, currentCheckout, ensureIgnored,
  git, listArchived, listMissions, listWorktrees, mainCheckout, missionRowState, missionWorkflow, notStub,
  pointAtInserted, readClaim, readyToOpen, resolveMission, sessionLive, setAutonomy, withVerify, writeClaim, writeState,
} from '../core/mission.js';
import { dumpWorkflow, loadWorkflow, runnerLabel, stepRole } from '../core/workflow.js';
import { loadPreset, openSession } from '../core/spawn.js';
import { existingProjects } from '../core/projects.js';
import { field, headerRow, missionRow, rule } from '../ui/format.js';
import { I, colors, duration, rowColor, rowSymbol } from '../ui/theme.js';
import { CancelError } from '../ui/prompts.js';

const AUTONOMY: Autonomy[] = ['full', 'partial', 'none'];

/** Read on `mission new` and `mission shape`, the two commands that set the dial. */
function autonomyOf(flags: Flags, fallback: Autonomy): Autonomy {
  const value = (str(flags, 'autonomy') ?? fallback) as Autonomy;
  if (!AUTONOMY.includes(value)) throw new Refusal(`autonomy must be one of ${AUTONOMY.join(', ')}`);
  return value;
}

export async function mission(sub: string, args: string[], flags: Flags, cwd: string): Promise<void> {
  switch (sub) {
    case 'new':
      return create(args[0], flags, cwd);
    case 'list':
      return list(flags);
    case 'open':
      return open(args[0], flags, cwd);
    case 'shape':
      return shape(args[0], flags, cwd);
    case 'autonomy':
      return autonomy(args[0], args[1], cwd);
    case 'status':
      return show(args[0], cwd);
    case 'adopt':
      return adopt(args[0], flags, cwd);
    case 'resume':
      return resume(args[0], cwd);
    case 'close':
      return close(args[0], flags, cwd);
    case 'archive':
    case 'unarchive':
      return archive(args[0], sub === 'unarchive', cwd);
    default:
      throw new Refusal(`mission: unknown subcommand "${sub ?? ''}" — new, open, shape, autonomy, list, status, adopt, resume, close, archive, unarchive`);
  }
}

async function create(name: string | undefined, flags: Flags, cwd: string): Promise<void> {
  if (!name) throw new Refusal('mission new <name> [--stub] [--quick] [--workflow W] [--verify] [--autonomy full|partial|none] [--title T] [--worktree]');

  const autonomy = autonomyOf(flags, 'partial');

  const stub = flags.stub === true;
  const main = await mainCheckout(cwd);
  const claim = await readClaim(main);
  let worktree = flags.worktree === true;

  // A stub touches no branch, so a claim held by someone else is none of its business.
  if (!stub && claim && claim.mission !== name && !worktree && flags['no-worktree'] !== true) {
    // Nobody to ask: a script that would have been offered a worktree has to say so itself.
    if (!process.stdin.isTTY) throw new Refusal(`checkout claimed by mission ${claim.mission} — add --worktree`);
    console.log(`${I}${colors.yellow}⊘${colors.reset} ${main} is claimed by mission ${colors.bold}${claim.mission}${colors.reset}`);
    const answer = await p.confirm({ message: `Work ${name} in a worktree at ../${path.basename(main)}-${name}?`, initialValue: true });
    if (p.isCancel(answer)) throw new CancelError();
    worktree = answer;
  }

  const created = await createMission(cwd, {
    name,
    title: str(flags, 'title'),
    // Nobody knows the shape before the intent gate: `mission shape` appends a preset after it.
    workflow: str(flags, 'workflow') ?? (flags.quick === true ? 'quick' : 'intent'),
    autonomy,
    worktree,
    stub,
    verify: flags.verify === true,
  });

  // A stub has no branch to commit on: `mission open` promotes it and takes care of the ignore then.
  const workdir = created.state.worktree ?? (await currentCheckout(cwd));
  const ignored = created.state.branch ? await ensureIgnored(workdir) : null;

  console.log('');
  headerRow(`${colors.cyan}●${colors.reset} ${colors.bold}${created.state.name}${colors.reset}`, `${colors.dim}${created.state.workflow} · ${created.state.autonomy}${colors.reset}`);
  rule();
  field('folder', created.dir);
  field('branch', created.state.branch ?? `${colors.dim}stub — open it to branch${colors.reset}`);
  if (created.state.worktree) field('worktree', created.state.worktree);
  field('step', created.state.step);
  if (ignored) field('ignored', `the Factory's own files added to .gitignore${ignored === 'committed' ? ' and committed' : ''}`);
  console.log('');

  if (!stub && flags['no-open'] !== true) await open(created.state.name, flags, cwd);
}

/** Writes the Warp tab config and opens it. The session id reaches state.json first. */
async function open(name: string | undefined, flags: Flags, cwd: string): Promise<void> {
  const m = await resolveMission(cwd, name);
  const dry = flags['dry-run'] === true;
  const stub = m.state.status === 'stub';
  const ignored = await readyToOpen(cwd, m, dry);
  const preset = await loadPreset(str(flags, 'preset') ?? 'orchestrator');
  const spawn = await openSession(cwd, m, preset, dry);
  const opened = spawn.warp ? 'tab opened' : 'no warp — run it yourself';
  const note = dry ? `dry run${spawn.warp ? '' : ' · no warp'}` : opened;

  console.log('');
  headerRow(
    `${colors.cyan}●${colors.reset} ${colors.bold}${m.state.name}${colors.reset} ${colors.dim}${preset.name}${colors.reset}`,
    `${colors.dim}${note}${colors.reset}`,
  );
  rule();
  field('session', spawn.session);
  field('cwd', spawn.cwd);
  field('config', dry ? `would write ${spawn.configPath}` : spawn.configPath);
  field('uri', spawn.uri);
  if (dry && stub) field('promote', `would branch mission/${m.state.name} and claim the checkout`);
  if (ignored) field('ignored', `the Factory's own files added to .gitignore${ignored === 'committed' ? ' and committed' : ''}`);
  console.log(`${I}${colors.dim}command${colors.reset}`);
  console.log(`${I}${spawn.command}`);
  console.log('');
}

/**
 * The graph is chosen after the intent gate, not before it: a mission starts on the `intent`
 * workflow and `shape` appends a preset's own steps behind that step. Once anything follows
 * intent the shape is settled, and asking for the same preset again is a no-op.
 */
async function shape(preset: string | undefined, flags: Flags, cwd: string): Promise<void> {
  if (!preset) throw new Refusal(`mission shape <preset> [--verify] [--autonomy ${AUTONOMY.join('|')}]`);

  const m = await resolveMission(cwd);
  const state = m.state;
  const loaded = await loadWorkflow(preset, await mainCheckout(cwd));
  const wanted = flags.verify === true ? withVerify(loaded) : loaded;
  if (wanted.steps[0]?.name !== 'intent') throw new Refusal(`${preset} has no intent step`);
  if (wanted.steps.length === 1) throw new Refusal(`${preset} has nothing after intent`);

  const workflow = await missionWorkflow(m);
  if (workflow.steps.some((step) => step.name !== 'intent')) {
    if (state.workflow !== wanted.name) throw new Refusal(`already shaped as ${state.workflow}`);
    console.log(`${I}${colors.dim}${state.name} is already shaped as ${wanted.name} — nothing changed.${colors.reset}`);
    return;
  }

  const appended = wanted.steps.slice(1);
  workflow.name = wanted.name;
  workflow.steps.push(...appended);
  await Bun.write(path.join(m.dir, 'workflow.yaml'), dumpWorkflow(workflow));

  for (const step of appended) for (const name of [step.name, ...(step.parallel ?? [])]) state.steps[name] ??= { status: 'pending' };
  state.workflow = wanted.name;
  state.autonomy = autonomyOf(flags, state.autonomy);
  pointAtInserted(state, workflow, appended[0]!.name);
  await writeState(m.dir, state);

  console.log('');
  headerRow(`${colors.cyan}●${colors.reset} ${colors.bold}${state.name}${colors.reset}`, `${colors.dim}${state.workflow} · ${state.autonomy}${colors.reset}`);
  rule();
  field('graph', workflow.steps.map((step) => step.name).join(' → '));
  field('step', state.step);
  console.log('');
}

/** The dial, moved mid-mission. Every move lands in `deviations` with where it came from. */
async function autonomy(level: string | undefined, name: string | undefined, cwd: string): Promise<void> {
  if (!level || !AUTONOMY.includes(level as Autonomy)) throw new Refusal(`mission autonomy ${AUTONOMY.join('|')} [name]`);
  const m = await setAutonomy(cwd, name, level as Autonomy, 'set with factory mission autonomy');
  field('mission', m.state.name);
  field('autonomy', m.state.autonomy);
}

async function list(flags: Flags): Promise<void> {
  const all = flags.all === true;
  let shown = 0;

  console.log('');
  for (const project of await existingProjects()) {
    const missions = await listMissions(project).catch(() => []);
    const rows = (all ? missions : missions.filter((m) => m.state.status !== 'closed'))
      .sort((a, b) => Number(a.state.status === 'stub') - Number(b.state.status === 'stub'));
    const archived = all ? await listArchived(project).catch(() => []) : [];
    if (rows.length === 0 && archived.length === 0) continue;

    console.log(`${I}${colors.dim}${project}${colors.reset}`);
    for (const m of rows) {
      missionRow(m.state, missionRowState(m.state), await sessionLive(m.state.session));
      shown++;
    }
    for (const m of archived) {
      missionRow(m.state, missionRowState(m.state), false, true);
      shown++;
    }
    console.log('');
  }

  if (shown === 0) {
    console.log(`${I}${colors.dim}No open missions.${colors.reset}`);
    console.log('');
  }
}

async function show(name: string | undefined, cwd: string): Promise<void> {
  const m = await resolveMission(cwd, name);
  const state = m.state;
  const workflow = await missionWorkflow(m);
  const wall = duration(state.created, state.status === 'closed' ? state.updated : undefined);

  console.log('');
  headerRow(
    `${colors.cyan}●${colors.reset} ${colors.bold}${state.name}${colors.reset} ${colors.dim}${state.workflow}${colors.reset}`,
    `${colors.dim}${wall} · ${state.step || '—'} · r${state.round} · ${state.autonomy}${colors.reset}`,
  );
  rule();

  for (const step of workflow.steps) {
    stepLine(state, step, 0);
    for (const member of step.parallel ?? []) stepLine(state, { name: member }, 1);
  }

  if (state.deviations.length > 0) {
    console.log('');
    console.log(`${I}${colors.dim}deviations${colors.reset}`);
    for (const d of state.deviations) console.log(`${I}${colors.dim}·${colors.reset} ${d.what} ${colors.dim}— ${d.reason}${colors.reset}`);
  }
  console.log('');
}

function stepLine(state: MissionState, definition: WorkflowStep, depth: number): void {
  const name = definition.name;
  const role = stepRole(definition);
  const step = state.steps[name];
  const row = step?.status === 'done' ? 'done' : step?.status === 'running' ? 'running' : step?.status === 'skipped' ? 'blocked' : 'pending';
  const indent = '  '.repeat(depth);
  const time = step?.startedAt ? duration(step.startedAt, step.endedAt) : '';
  const gate = state.gates[name];

  const left = `${rowColor(row)}${rowSymbol(row)}${colors.reset} ${indent}${name.padEnd(14 - indent.length)}${colors.dim}${runnerLabel(role)}${colors.reset}`;
  const notes = [
    step?.status === 'skipped' ? `${colors.dim}skipped: ${step.reason ?? ''}${colors.reset}` : '',
    gate?.status === 'open' ? `${colors.yellow}⊘ gate open${colors.reset}` : '',
    gate?.status === 'answered' ? `${colors.green}✓ gate ${gate.answer}${colors.reset}` : '',
    time ? `${colors.dim}${time}${colors.reset}` : '',
  ].filter(Boolean);

  headerRow(left, notes.join(`${colors.dim} · ${colors.reset}`));
}

async function adopt(name: string | undefined, flags: Flags, cwd: string): Promise<void> {
  const session = str(flags, 'session');
  if (!session) throw new Refusal('mission adopt <name> --session <id>');

  const m = await resolveMission(cwd, name);
  const state = m.state;
  notStub(state);

  if (state.session === session) {
    console.log(`${I}${colors.dim}${state.name} is already bound to ${session}.${colors.reset}`);
    return;
  }
  if (state.session && (await sessionLive(state.session)) && flags.force !== true) {
    throw new Refusal(`${state.name} is bound to live session ${state.session} — close that tab or pass --force --reason R`);
  }
  if (state.session && flags.force === true) {
    state.deviations.push({ at: new Date().toISOString(), what: `rebound session ${state.session} to ${session}`, reason: str(flags, 'reason') ?? 'not given' });
  }

  state.session = session;
  await writeState(m.dir, state);

  const main = await mainCheckout(cwd);
  const claim = await readClaim(main);
  if (claim?.mission === state.name) await writeClaim(main, { ...claim, session });

  field('mission', state.name);
  field('session', session);
}

async function resume(name: string | undefined, cwd: string): Promise<void> {
  const m = await resolveMission(cwd, name);
  const state = m.state;
  notStub(state);
  const checkout = await currentCheckout(cwd);
  const branch = await currentBranch(checkout);

  if (branch !== state.branch) {
    const elsewhere = (await listWorktrees(cwd)).find((w) => w.branch === state.branch && w.dir !== checkout);
    if (elsewhere) console.log(`${I}${colors.dim}${state.branch} is checked out at ${elsewhere.dir}${colors.reset}`);
    else await git(checkout, 'checkout', state.branch);
  }

  console.log('');
  headerRow(
    `${colors.cyan}●${colors.reset} ${colors.bold}${state.name}${colors.reset} ${colors.dim}${state.workflow}${colors.reset}`,
    `${colors.dim}${state.step || '—'} · r${state.round}${colors.reset}`,
  );
  rule();
  field('folder', m.dir);
  field('branch', state.branch);
  field('step', `${state.step} ${colors.dim}${state.steps[state.step]?.status ?? 'pending'}${colors.reset}`);
  field('session', (await sessionLive(state.session)) ? state.session! : `${colors.dim}no session${colors.reset}`);

  const open = Object.entries(state.gates).filter(([, g]) => g.status === 'open');
  for (const [step, gate] of open) {
    console.log(`${I}${colors.yellow}⊘${colors.reset} gate ${colors.bold}${step}${colors.reset} ${colors.dim}${gate.file ?? ''}${colors.reset}`);
  }
  console.log('');
}

async function close(name: string | undefined, flags: Flags, cwd: string): Promise<void> {
  const m: Mission = await resolveMission(cwd, name);
  notStub(m.state);
  const log = await closeMission(cwd, m, flags['keep-branch'] === true);

  console.log('');
  headerRow(`${colors.green}✓${colors.reset} ${colors.bold}${m.state.name}${colors.reset} ${colors.dim}closed${colors.reset}`, '');
  rule();
  if (log.length === 0) console.log(`${I}${colors.dim}already closed, nothing left to do${colors.reset}`);
  for (const line of log) console.log(`${I}${colors.dim}·${colors.reset} ${line}`);
  console.log('');
}

/** Closed work moved between `.factory/missions/` and `.factory/archive/`, history and all. */
async function archive(name: string | undefined, back: boolean, cwd: string): Promise<void> {
  if (!name) throw new Refusal(`mission ${back ? 'unarchive' : 'archive'} <name>`);
  const log = await archiveMission(cwd, name, back);

  console.log('');
  headerRow(`${colors.dim}🗄${colors.reset}  ${colors.bold}${name}${colors.reset} ${colors.dim}${back ? 'unarchived' : 'archived'}${colors.reset}`, '');
  rule();
  if (log.length === 0) console.log(`${I}${colors.dim}already ${back ? 'in the mission folder' : 'archived'}, nothing to do${colors.reset}`);
  for (const line of log) console.log(`${I}${colors.dim}·${colors.reset} ${line}`);
  console.log('');
}

/** Used by `factory status <project>`: open missions in that checkout. */
export async function missionsBlock(projectDir: string): Promise<void> {
  const missions = await listMissions(projectDir).catch(() => []);
  const open = missions.filter((m) => m.state.status === 'open');
  if (open.length === 0) return;

  console.log('');
  console.log(`${I}${colors.bold}Missions${colors.reset}`);
  for (const m of open) missionRow(m.state, missionRowState(m.state), await sessionLive(m.state.session));
}
