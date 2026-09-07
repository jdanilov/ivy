import type { InboxItem } from './model.js';

/** Two items are the same message while they name the same origin and label; only the age moves.
 *  The label carries the gate's step and the decision's id, so a second decision is a new key. */
export const inboxKey = (item: InboxItem): string => `${item.project}/${item.origin}/${item.label}`;

/** Items the last snapshot did not have. The first snapshot is the backlog, not news. */
export function arrivals(prev: InboxItem[] | null, next: InboxItem[]): InboxItem[] {
  if (prev === null) return [];
  const seen = new Set(prev.map(inboxKey));
  return next.filter((item) => !seen.has(inboxKey(item)));
}

/** A new Inbox item is the one thing worth interrupting the human for. The bell and Warp's own
 *  notification reach the terminal, `osascript` reaches the desktop. Nothing here is awaited. */
export function notify(item: InboxItem): void {
  const label = `${item.project}/${item.origin} ${item.label}`;
  process.stdout.write(`\x07\x1b]777;notify;Factory;${label.replaceAll('\x07', '')}\x07`);
  if (process.platform !== 'darwin') return;

  try {
    // Fire and forget: unref so a slow Notification Centre never holds the screen up.
    Bun.spawn(['osascript', '-e', `display notification "${label.replaceAll('"', '')}" with title "Factory"`], {
      stdout: 'ignore', stderr: 'ignore',
    }).unref();
  } catch {
    // A notification is never worth taking the screen down for.
  }
}
