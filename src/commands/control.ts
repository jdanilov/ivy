import { str, type Flags } from '../core/args.js';
import { Refusal } from '../core/mission.js';
import type { InboxItem, Snapshot } from '../tui/model.js';

/**
 * Mission Control. Live by default: the real projects, missions and sessions, refreshed as their
 * files change. `--fixture` draws the demo snapshot for a look review, `--frames <dir>` writes the
 * live screen as text and exits, which is how it is checked without a terminal.
 */
export async function control(flags: Flags): Promise<void> {
  // A bare `--frames` is a typo, and the interactive screen it would fall through to hangs a run
  // that has no terminal: the whole point of the flag is not needing one.
  if (flags.frames === true) throw new Refusal('factory --frames <dir> [--fixture]');
  const fixture = flags.fixture === true;
  const live = fixture ? null : await import('../tui/live.js');
  let snapshot = live ? await live.buildSnapshot() : (await import('../tui/fixture.js')).snapshot;

  const dir = str(flags, 'frames');
  if (dir !== undefined) {
    // The git counts run behind the snapshot the screen draws; a frame gets to wait for them.
    if (live) {
      await live.settle();
      snapshot = await live.buildSnapshot();
    }
    const { liveFrames, writeFrames } = await import('../tui/frames.js');
    return writeFrames(snapshot, dir, liveFrames(snapshot));
  }

  const { run } = await import('../tui/screen.js');
  if (fixture) return run(snapshot);

  const { arrivals, notify } = await import('../tui/notify.js');
  const { startLive } = await import('../tui/watch.js');

  // The first snapshot is the backlog the human opened the screen to read; everything the rebuilds
  // add after it is news, and news is worth a bell. Only the key of an item counts, not its age.
  let seen: InboxItem[] | null = null;
  const announce = (snap: Snapshot): void => {
    for (const item of arrivals(seen, snap.inbox)) notify(item);
    seen = snap.inbox;
  };

  announce(snapshot);
  await run(snapshot, (apply) => startLive(snapshot, (next) => {
    announce(next);
    apply(next);
  }));
}
