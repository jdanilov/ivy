import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { str, type Flags } from '../core/args.js';
import { Refusal, resolveMission } from '../core/mission.js';
import { field } from '../ui/format.js';
import { I, colors } from '../ui/theme.js';

export async function handoff(sub: string, args: string[], flags: Flags, cwd: string): Promise<void> {
  if (sub !== 'save') throw new Refusal(`handoff: unknown subcommand "${sub ?? ''}" — save`);

  const step = args[0];
  if (!step) throw new Refusal('handoff save <step> < handoff.md');

  const mission = await resolveMission(cwd, str(flags, 'mission'));
  const text = await Bun.stdin.text();
  if (text.trim() === '') throw new Refusal('handoff save reads the handoff from stdin and got nothing');

  // Inside a loop each round keeps its own handoff, so a re-run never overwrites the last one.
  const round = mission.state.round;
  const file = path.join(mission.dir, 'handoffs', round > 0 ? `${step}-r${round}.md` : `${step}.md`);

  await mkdir(path.dirname(file), { recursive: true });
  await Bun.write(file, text.endsWith('\n') ? text : text + '\n');

  console.log(`${I}${colors.green}✓${colors.reset} handoff ${colors.bold}${step}${colors.reset}`);
  field('file', file);
}
