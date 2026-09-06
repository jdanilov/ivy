import path from 'node:path';
import type { MissionState, Workflow } from '../types.js';
import { str, type Flags } from '../core/args.js';
import { Refusal, deviate, missionWorkflow, notStub, now, pointAtInserted, resolveMission, writeState } from '../core/mission.js';
import { allStepNames, dumpWorkflow, findStep, nextStep, ownerStep, validate } from '../core/workflow.js';
import { field } from '../ui/format.js';
import { I, colors, duration, rowColor, rowSymbol } from '../ui/theme.js';

export async function step(sub: string, args: string[], flags: Flags, cwd: string): Promise<void> {
  const name = args[0];
  if (!name) throw new Refusal(`step ${sub ?? '<sub>'} <step> — start, done, skip, add, loop`);

  const mission = await resolveMission(cwd, str(flags, 'mission'));
  notStub(mission.state);
  const workflow = await missionWorkflow(mission);
  const state = mission.state;

  switch (sub) {
    case 'start':
      start(state, workflow, name);
      break;
    case 'done':
      done(state, workflow, name);
      break;
    case 'skip':
      skip(state, workflow, name, flags);
      break;
    case 'add':
      await add(mission.dir, state, workflow, name, flags);
      break;
    case 'loop':
      loop(state, workflow, name, flags);
      break;
    default:
      throw new Refusal(`step: unknown subcommand "${sub ?? ''}" — start, done, skip, add, loop`);
  }

  await writeState(mission.dir, state);
  print(state, name);
}

function known(workflow: Workflow, name: string): void {
  if (!allStepNames(workflow).includes(name)) {
    throw new Refusal(`no step "${name}" in workflow ${workflow.name} — add it with: factory step add ${name} --after <step> --reason R`);
  }
}

function start(state: MissionState, workflow: Workflow, name: string): void {
  known(workflow, name);
  const current = state.steps[name];

  if (current?.status === 'running') {
    console.log(`${I}${colors.dim}${name} is already running since ${current.startedAt} — nothing changed.${colors.reset}`);
    return;
  }
  if (current && current.status !== 'pending') {
    throw new Refusal(`step ${name} is ${current.status}, not pending — loop the mission back before running it again`);
  }

  // Only the current step, or a member of its parallel group, may start: the workflow is the order.
  if (ownerStep(workflow, name)?.name !== state.step) {
    throw new Refusal(`step ${name} is not the current step — the mission is at ${state.step}, start that with: factory step start ${state.step}`);
  }

  state.steps[name] = { status: 'running', startedAt: now() };
}

function done(state: MissionState, workflow: Workflow, name: string): void {
  known(workflow, name);
  const current = state.steps[name];
  if (current?.status === 'done') {
    console.log(`${I}${colors.dim}${name} is already done — nothing changed.${colors.reset}`);
    return;
  }
  if (current?.status !== 'running') {
    throw new Refusal(`step ${name} is ${current?.status ?? 'pending'}, not running — start it with: factory step start ${name}`);
  }

  const definition = findStep(workflow, name);

  if (definition?.gate) {
    const gate = state.gates[name];
    if (gate?.status !== 'answered') {
      throw new Refusal(`step ${name} is a ${definition.gate} gate and it is ${gate ? 'open' : 'not opened'} — answer it with: factory gate answer ${name} accept`);
    }
  }

  const waiting = (definition?.parallel ?? []).filter((m) => {
    const status = state.steps[m]?.status;
    return status !== 'done' && status !== 'skipped';
  });
  if (waiting.length > 0) throw new Refusal(`step ${name} waits on its parallel ${waiting.length === 1 ? 'member' : 'members'} ${waiting.join(', ')}`);

  state.steps[name] = { ...current, status: 'done', startedAt: current.startedAt ?? now(), endedAt: now() };

  // Only a top-level step moves the mission on; a parallel member leaves the group current.
  if (definition && state.step === name) state.step = nextStep(workflow, name)?.name ?? name;
}

function skip(state: MissionState, workflow: Workflow, name: string, flags: Flags): void {
  known(workflow, name);
  const reason = str(flags, 'reason') ?? 'not given';
  const current = state.steps[name];

  state.steps[name] = { ...current, status: 'skipped', endedAt: now(), reason };
  deviate(state, `skipped step ${name}`, reason);

  if (findStep(workflow, name) && state.step === name) state.step = nextStep(workflow, name)?.name ?? name;
}

async function add(dir: string, state: MissionState, workflow: Workflow, name: string, flags: Flags): Promise<void> {
  const after = str(flags, 'after');
  const reason = str(flags, 'reason') ?? 'not given';
  if (!after) throw new Refusal(`step add ${name} --after <step> [--role R] --reason R`);
  if (allStepNames(workflow).includes(name)) throw new Refusal(`step "${name}" already exists in workflow ${workflow.name}`);

  const at = workflow.steps.findIndex((s) => s.name === after);
  if (at === -1) throw new Refusal(`no step "${after}" to insert after in workflow ${workflow.name}`);

  const role = str(flags, 'role');
  workflow.steps.splice(at + 1, 0, role ? { name, role } : { name });
  validate(workflow);
  await Bun.write(path.join(dir, 'workflow.yaml'), dumpWorkflow(workflow));

  state.steps[name] = { status: 'pending' };
  pointAtInserted(state, workflow, name);
  deviate(state, `added step ${name} after ${after}`, reason);
}

function loop(state: MissionState, workflow: Workflow, name: string, flags: Flags): void {
  known(workflow, name);
  const definition = findStep(workflow, name);
  if (!definition?.loop) throw new Refusal(`step ${name} has no loop in workflow ${workflow.name}`);

  const round = state.round + 1;
  if (round > definition.loop.max) {
    throw new Refusal(`round ${round} is past loop max ${definition.loop.max} on ${name} — open a human gate instead of looping again`);
  }

  state.round = round;
  state.steps[name] = { status: 'pending', reason: str(flags, 'reason') };
  for (const member of definition.parallel ?? []) state.steps[member] = { status: 'pending' };
  state.steps[definition.loop.back] = { status: 'pending' };
  state.step = definition.loop.back;
}

function print(state: MissionState, name: string): void {
  const entry = state.steps[name];
  const row = entry?.status === 'done' ? 'done' : entry?.status === 'running' ? 'running' : entry?.status === 'skipped' ? 'blocked' : 'pending';
  console.log(`${I}${rowColor(row)}${rowSymbol(row)}${colors.reset} ${name.padEnd(14)}${colors.dim}${entry?.status ?? 'pending'}${colors.reset} ${colors.dim}${duration(entry?.startedAt, entry?.endedAt)}${colors.reset}`);
  field('step', `${state.step} ${colors.dim}r${state.round}${colors.reset}`);
}
