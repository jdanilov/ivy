import type { InboxItem } from './model.js';

/** A new Inbox item is the one thing worth interrupting the human for. The bell reaches the
 *  terminal, the notification reaches the desktop; wiring calls this from the file watcher. */
export function notify(item: InboxItem): void {
  process.stdout.write('\x07');
  if (process.platform !== 'darwin') return;

  const text = `${item.project}/${item.origin} ${item.label}`.replace(/"/g, '');
  try {
    // Fire and forget: unref so a slow Notification Centre never holds the screen up.
    Bun.spawn(['osascript', '-e', `display notification "${text}" with title "Factory"`], {
      stdout: 'ignore', stderr: 'ignore',
    }).unref();
  } catch {
    // A notification is never worth taking the screen down for.
  }
}
