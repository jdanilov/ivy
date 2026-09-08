import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { home } from './projects.js';

/**
 * A session's inbox: the Unix socket Claude Code binds for messages from other sessions, and
 * lets any process of the same user post to. What arrives starts a turn in an idle session and is
 * read between tool calls in a busy one, so it is how words reach a session from outside its tab.
 */

const sessionsDir = (): string => path.join(home(), '.claude', 'sessions');

interface SessionRecord { pid: number; sessionId: string; messagingSocketPath?: string }

/** Every live session keeps `<pid>.json` there; the file outlives the process, so the pid is checked. */
export async function inboxOf(session: string): Promise<string | null> {
  const files = (await readdir(sessionsDir()).catch(() => [])).filter((f) => /^\d+\.json$/.test(f));
  for (const file of files) {
    const rec = await Bun.file(path.join(sessionsDir(), file)).json().catch(() => null) as SessionRecord | null;
    if (rec?.sessionId !== session || typeof rec.messagingSocketPath !== 'string') continue;
    try {
      process.kill(rec.pid, 0);
    } catch {
      continue;
    }
    return rec.messagingSocketPath;
  }
  return null;
}

/** One JSON line, the shape `--input-format stream-json` reads, and the connection ends. */
export function post(sock: string, text: string): Promise<void> {
  const line = `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer from ${sock}`)), 5000);
    const done = (e?: Error): void => {
      clearTimeout(timer);
      if (e) reject(e);
      else resolve();
    };
    Bun.connect({
      unix: sock,
      socket: {
        open(s) {
          s.write(line);
          s.end();
        },
        data() {},
        close() { done(); },
        error(_s, e) { done(e); },
        connectError(_s, e) { done(e); },
      },
    }).catch((e: Error) => done(e));
  });
}
