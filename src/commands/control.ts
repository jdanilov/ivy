import { Refusal } from '../core/mission.js';
import type { Flags } from '../core/args.js';

/** Mission Control. The prototype draws a fixture; the wiring step reads the real files. */
export async function control(flags: Flags): Promise<void> {
  if (flags.fixture !== true) throw new Refusal('control: live data lands with the next step, run with --fixture');

  const { snapshot } = await import('../tui/fixture.js');
  const { run } = await import('../tui/screen.js');
  await run(snapshot);
}
