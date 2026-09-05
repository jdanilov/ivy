import type { GateAnswer } from '../types.js';
import { str, type Flags } from '../core/args.js';
import { Refusal, listMissions, missionWorkflow, now, resolveMission, sessionLive, writeState } from '../core/mission.js';
import { allStepNames, findStep } from '../core/workflow.js';
import { loadProjects } from '../core/projects.js';
import { field } from '../ui/format.js';
import { I, colors } from '../ui/theme.js';

const ANSWERS: GateAnswer[] = ['accept', 'amend', 'reject'];

export async function gate(sub: string, args: string[], flags: Flags, cwd: string): Promise<void> {
  switch (sub) {
    case 'open':
      return open(args[0], flags, cwd);
    case 'answer':
      return answer(args[0], args[1], flags, cwd);
    case 'list':
      return list();
    default:
      throw new Refusal(`gate: unknown subcommand "${sub ?? ''}" — open, answer, list`);
  }
}

async function open(step: string | undefined, flags: Flags, cwd: string): Promise<void> {
  const file = str(flags, 'file');
  if (!step || !file) throw new Refusal('gate open <step> --file <path>');

  const mission = await resolveMission(cwd, str(flags, 'mission'));
  const workflow = await missionWorkflow(mission);
  if (!allStepNames(workflow).includes(step)) throw new Refusal(`no step "${step}" in workflow ${workflow.name}`);

  // Last open wins: the gate holds a path to the content, not the content itself.
  mission.state.gates[step] = { status: 'open', file, at: now() };
  await writeState(mission.dir, mission.state);

  console.log(`${I}${colors.yellow}⊘${colors.reset} gate ${colors.bold}${step}${colors.reset} ${colors.dim}open${colors.reset}`);
  field('content', file);
  field('answer', `factory gate answer ${step} accept|amend|reject --note N`);
}

async function answer(step: string | undefined, verdict: string | undefined, flags: Flags, cwd: string): Promise<void> {
  if (!step || !verdict) throw new Refusal('gate answer <step> accept|amend|reject [--note N]');
  if (!ANSWERS.includes(verdict as GateAnswer)) throw new Refusal(`gate answer must be one of ${ANSWERS.join(', ')}`);

  const mission = await resolveMission(cwd, str(flags, 'mission'));
  const state = mission.state;
  const existing = state.gates[step];

  // First answer wins. The same answer twice is a no-op, a different one is reported, never overwritten.
  if (existing?.status === 'answered') {
    if (existing.answer === verdict) {
      console.log(`${I}${colors.dim}gate ${step} was already answered ${verdict} at ${existing.at}.${colors.reset}`);
      return;
    }
    throw new Refusal(`gate ${step} was already answered ${existing.answer} at ${existing.at}${existing.note ? ` — "${existing.note}"` : ''}`);
  }

  const workflow = await missionWorkflow(mission);
  if (!allStepNames(workflow).includes(step)) throw new Refusal(`no step "${step}" in workflow ${workflow.name}`);
  if (!existing && !findStep(workflow, step)?.gate) throw new Refusal(`step ${step} has no gate — open one with: factory gate open ${step} --file F`);

  state.gates[step] = { status: 'answered', file: existing?.file, answer: verdict as GateAnswer, note: str(flags, 'note'), at: now() };
  await writeState(mission.dir, state);

  console.log(`${I}${colors.green}✓${colors.reset} gate ${colors.bold}${step}${colors.reset} ${verdict}`);
  if (str(flags, 'note')) field('note', str(flags, 'note')!);
}

/** Open gates across every registered project, so one command shows the whole backlog. */
async function list(): Promise<void> {
  let shown = 0;
  console.log('');

  for (const project of await loadProjects()) {
    for (const mission of await listMissions(project).catch(() => [])) {
      if (mission.state.status !== 'open') continue;
      for (const [step, entry] of Object.entries(mission.state.gates)) {
        if (entry.status !== 'open') continue;
        const live = (await sessionLive(mission.state.session)) ? '' : ` ${colors.dim}no session${colors.reset}`;
        console.log(`${I}${colors.yellow}⊘${colors.reset} ${mission.state.name.padEnd(20)}${step.padEnd(12)}${colors.dim}${entry.file ?? ''}${colors.reset}${live}`);
        shown++;
      }
    }
  }

  if (shown === 0) console.log(`${I}${colors.dim}No open gates.${colors.reset}`);
  console.log('');
}
