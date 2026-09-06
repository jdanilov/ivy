import { str, type Flags } from '../core/args.js';
import { Refusal, resolveMission } from '../core/mission.js';
import {
  CONFIDENCES, VERDICTS, answerDecision, fileDecisions, readDecisions,
  type Confidence, type Decision, type DecisionStatus, type Verdict,
} from '../core/decision.js';
import { field } from '../ui/format.js';
import { I, colors } from '../ui/theme.js';

export async function decision(sub: string, args: string[], flags: Flags, cwd: string): Promise<void> {
  switch (sub) {
    case 'add':
      return add(args[0], flags, cwd);
    case 'answer':
      return answer(args[0], args[1], flags, cwd);
    case 'list':
      return list(flags, cwd);
    default:
      throw new Refusal(`decision: unknown subcommand "${sub ?? ''}" — add, answer, list`);
  }
}

/** The glyph says who owns the row: the human on a waiting one, the mission on every other. */
function glyph(status: DecisionStatus): string {
  if (status === 'waiting') return `${colors.yellow}⊘${colors.reset}`;
  if (status === 'accepted') return `${colors.green}✓${colors.reset}`;
  if (status === 'overruled') return `${colors.red}✗${colors.reset}`;
  return `${colors.dim}●${colors.reset}`;
}

function print(entry: Decision): void {
  console.log(`${I}${glyph(entry.status)} decision ${colors.bold}${entry.id}${colors.reset} ${colors.dim}${entry.status}${colors.reset}`);
}

async function add(summary: string | undefined, flags: Flags, cwd: string): Promise<void> {
  const confidence = str(flags, 'confidence')?.toUpperCase();
  if (!summary || !confidence) throw new Refusal('decision add "<summary>" --confidence HIGH|MEDIUM|LOW [--step S] [--by R]');
  if (!CONFIDENCES.includes(confidence as Confidence)) throw new Refusal(`confidence must be one of ${CONFIDENCES.join(', ')}`);

  const mission = await resolveMission(cwd, str(flags, 'mission'));
  const [filed] = await fileDecisions(mission.dir, mission.state, [{
    step: str(flags, 'step') ?? mission.state.step,
    by: str(flags, 'by') ?? 'orchestrator',
    confidence: confidence as Confidence,
    summary,
  }]);

  print(filed!);
  field('summary', filed!.summary);
  if (filed!.status === 'waiting') field('answer', `factory decision answer ${filed!.id} accept|overrule --note N`);
}

async function answer(id: string | undefined, verdict: string | undefined, flags: Flags, cwd: string): Promise<void> {
  if (!id || !verdict) throw new Refusal('decision answer <id> accept|overrule [--note N]');
  if (!VERDICTS.includes(verdict as Verdict)) throw new Refusal(`decision answer must be one of ${VERDICTS.join(', ')}`);

  const mission = await resolveMission(cwd, str(flags, 'mission'));
  const { decision: answered, changed } = await answerDecision(mission.dir, id, verdict as Verdict, str(flags, 'note'));

  if (!changed) {
    console.log(`${I}${colors.dim}decision ${id} was already ${answered.status} — nothing changed.${colors.reset}`);
    return;
  }
  print(answered);
  field('summary', answered.summary);
  if (answered.note !== '') field('note', answered.note);
}

/** This mission's table, newest last. `--waiting` is the list the human still owes an answer. */
async function list(flags: Flags, cwd: string): Promise<void> {
  const mission = await resolveMission(cwd, str(flags, 'mission'));
  const all = await readDecisions(mission.dir);
  const rows = flags.waiting === true ? all.filter((d) => d.status === 'waiting') : all;
  console.log('');

  for (const row of rows) {
    const tail = `${row.status}${row.note === '' ? '' : `: ${row.note}`}`;
    console.log(`${I}${glyph(row.status)} ${row.id.padEnd(5)}${row.step.padEnd(12)}${row.by.padEnd(14)}${row.confidence.padEnd(7)}${row.summary} ${colors.dim}${tail}${colors.reset}`);
  }

  if (rows.length === 0) console.log(`${I}${colors.dim}No ${flags.waiting === true ? 'waiting ' : ''}decisions in ${mission.state.name}.${colors.reset}`);
  console.log('');
}
