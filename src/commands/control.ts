import { str, type Flags } from '../core/args.js';

/**
 * Mission Control. Live by default: the real projects, missions and sessions, refreshed as their
 * files change. `--fixture` draws the demo snapshot for a look review, `--frames <dir>` writes the
 * live screen as text and exits, which is how it is checked without a terminal.
 */
export async function control(flags: Flags): Promise<void> {
  const fixture = flags.fixture === true;
  const snapshot = fixture
    ? (await import('../tui/fixture.js')).snapshot
    : await (await import('../tui/live.js')).buildSnapshot();

  const dir = str(flags, 'frames');
  if (dir !== undefined) {
    const { liveFrames, writeFrames } = await import('../tui/frames.js');
    return writeFrames(snapshot, dir, liveFrames(snapshot));
  }

  const { run } = await import('../tui/screen.js');
  if (fixture) return run(snapshot);

  const { startLive } = await import('../tui/watch.js');
  await run(snapshot, (apply) => startLive(snapshot, apply));
}
