import path from 'node:path';
import * as p from '@clack/prompts';
import type { Attention, Mission, MissionState } from '../types.js';
import { str, type Flags } from '../core/args.js';
import {
  Refusal, closeMission, createMission, currentBranch, currentCheckout, git, listMissions,
  listWorktrees, mainCheckout, missionRowState, missionWorkflow, readClaim, resolveMission,
  sessionLive, writeClaim, writeState,
} from '../core/mission.js';
import { loadProjects } from '../core/projects.js';
import { field, headerRow, missionRow, rule } from '../ui/format.js';
import { I, colors, duration, rowColor, rowSymbol } from '../ui/theme.js';
import { CancelError } from '../ui/prompts.js';

const ATTENTION: Attention[] = ['full', 'light', 'unattended'];

export async function mission(sub: string, args: string[], flags: Flags, cwd: string): Promise<void> {
  switch (sub) {
    case 'new':
      return create(args[0], flags, cwd);
    case 'list':
      return list(flags);
    case 'status':
      return show(args[0], cwd);
    case 'adopt':
      return adopt(args[0], flags, cwd);
    case 'resume':
      return resume(args[0], cwd);
    case 'close':
      return close(args[0], cwd);
    default:
      throw new Refusal(`mission: unknown subcommand "${sub ?? ''}" — new, list, status, adopt, resume, close`);
  }
}

async function create(name: string | undefined, flags: Flags, cwd: string): Promise<void> {
  if (!name) throw new Refusal('mission new <name> [--workflow W] [--attention full|light|unattended] [--title T] [--worktree]');

  const attention = (str(flags, 'attention') ?? 'light') as Attention;
  if (!ATTENTION.includes(attention)) throw new Refusal(`attention must be one of ${ATTENTION.join(', ')}`);

  const main = await mainCheckout(cwd);
  const claim = await readClaim(main);
  let worktree = flags.worktree === true;

  if (claim && claim.mission !== name && !worktree && flags['no-worktree'] !== true) {
    console.log(`${I}${colors.yellow}⊘${colors.reset} ${main} is claimed by mission ${colors.bold}${claim.mission}${colors.reset}`);
    const answer = await p.confirm({ message: `Work ${name} in a worktree at ../${path.basename(main)}-${name}?`, initialValue: true });
    if (p.isCancel(answer)) throw new CancelError();
    worktree = answer;
  }

  const created = await createMission(cwd, {
    name,
    title: str(flags, 'title'),
    workflow: str(flags, 'workflow') ?? 'story',
    attention,
    worktree,
  });

  console.log('');
  headerRow(`${colors.cyan}●${colors.reset} ${colors.bold}${created.state.name}${colors.reset}`, `${colors.dim}${created.state.workflow} · ${created.state.attention}${colors.reset}`);
  rule();
  field('folder', created.dir);
  field('branch', created.state.branch);
  if (created.state.worktree) field('worktree', created.state.worktree);
  field('step', created.state.step);
  console.log('');
}

async function list(flags: Flags): Promise<void> {
  const all = flags.all === true;
  let shown = 0;

  console.log('');
  for (const project of await loadProjects()) {
    const missions = await listMissions(project).catch(() => []);
    const rows = all ? missions : missions.filter((m) => m.state.status === 'open');
    if (rows.length === 0) continue;

    console.log(`${I}${colors.dim}${project}${colors.reset}`);
    for (const m of rows) {
      missionRow(m.state, missionRowState(m.state), await sessionLive(m.state.session));
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
    `${colors.dim}${wall} · ${state.step || '—'} · r${state.round}${colors.reset}`,
  );
  rule();

  for (const step of workflow.steps) {
    stepLine(state, step.name, step.role, 0);
    for (const member of step.parallel ?? []) stepLine(state, member, undefined, 1);
  }

  if (state.deviations.length > 0) {
    console.log('');
    console.log(`${I}${colors.dim}deviations${colors.reset}`);
    for (const d of state.deviations) console.log(`${I}${colors.dim}·${colors.reset} ${d.what} ${colors.dim}— ${d.reason}${colors.reset}`);
  }
  console.log('');
}

function stepLine(state: MissionState, name: string, role: string | undefined, depth: number): void {
  const step = state.steps[name];
  const row = step?.status === 'done' ? 'done' : step?.status === 'running' ? 'running' : step?.status === 'skipped' ? 'blocked' : 'pending';
  const indent = '  '.repeat(depth);
  const time = step?.startedAt ? duration(step.startedAt, step.endedAt) : '';
  const gate = state.gates[name];

  const left = `${rowColor(row)}${rowSymbol(row)}${colors.reset} ${indent}${name.padEnd(14 - indent.length)}${role ? `${colors.dim}${role}${colors.reset}` : ''}`;
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

async function close(name: string | undefined, cwd: string): Promise<void> {
  const m: Mission = await resolveMission(cwd, name);
  const log = await closeMission(cwd, m);

  console.log('');
  headerRow(`${colors.green}✓${colors.reset} ${colors.bold}${m.state.name}${colors.reset} ${colors.dim}closed${colors.reset}`, '');
  rule();
  if (log.length === 0) console.log(`${I}${colors.dim}already closed, nothing left to do${colors.reset}`);
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
