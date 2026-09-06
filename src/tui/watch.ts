import path from 'node:path';
import { watch, type FSWatcher } from 'node:fs';
import { factoryHome } from '../core/projects.js';
import { buildSnapshot } from './live.js';
import { openTranscripts } from './transcript.js';
import type { Snapshot } from './model.js';

/**
 * Files change, the screen follows. `fs.watch` on everything a snapshot is built from, one rebuild
 * per burst, and a poll underneath it: a watcher that never fired — a mission folder created after
 * we started, a filesystem that drops events — costs two seconds, not the session.
 */

const DEBOUNCE = 200;
const POLL = 2000;

/** Recursive on the mission folders, which grow subfolders; flat on the rest, which do not. */
function watched(snap: Snapshot): [dir: string, recursive: boolean][] {
  return [
    [path.join(factoryHome(), 'events'), false],
    [path.join(factoryHome(), 'caffeinate'), false],
    ...snap.projects.map((p): [string, boolean] => [path.join(p.path, '.factory', 'missions'), true]),
    ...openTranscripts().map((file): [string, boolean] => [file, false]),
  ];
}

export interface Live { close(): void }

/** Rebuilds until `close()`. `apply` gets every new snapshot, the first one is the caller's own. */
export function startLive(first: Snapshot, apply: (snap: Snapshot) => void): Live {
  const watchers = new Map<string, FSWatcher>();
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  let closed = false;

  const sync = (snap: Snapshot): void => {
    const want = new Map(watched(snap));
    for (const [where, watcher] of watchers) {
      if (want.has(where)) continue;
      watcher.close();
      watchers.delete(where);
    }
    for (const [where, recursive] of want) {
      if (watchers.has(where)) continue;
      // A path that is not there yet is picked up by the poll, and watched on the next sync.
      try {
        watchers.set(where, watch(where, { recursive, persistent: false }, schedule));
      } catch {
        // nothing to watch here yet
      }
    }
  };

  const rebuild = async (): Promise<void> => {
    if (closed || building) return;
    building = true;
    try {
      const next = await buildSnapshot();
      if (closed) return;
      sync(next);
      apply(next);
    } catch {
      // A half-written file is the normal case here: the next rebuild reads it whole.
    } finally {
      building = false;
    }
  };

  function schedule(): void {
    if (debounce || closed) return;
    debounce = setTimeout(() => {
      debounce = null;
      void rebuild();
    }, DEBOUNCE);
  }

  sync(first);
  const poll = setInterval(() => void rebuild(), POLL);

  return {
    close(): void {
      closed = true;
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
