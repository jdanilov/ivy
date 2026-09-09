import { C, COMMAND } from '../theme.js';
import { type Cell, ago, spans, spread, wrap } from '../format.js';
import { logTail } from './foot.js';
import { marker, type Pane, type Ui } from './pane.js';
import type { InboxItem, Snapshot } from '../model.js';

/** MESSAGES: everything waiting on the human across every project, and how each one is answered. */

/** Enough of a daemon's log to say what went wrong; the whole tail is the foot's, under `A`. */
const LOG_LINES = 5;

export function messagesPane(p: Pane, snap: Snapshot, ui: Ui, h: number): void {
  const items = snap.inbox;
  p.row([['MESSAGES', C.bright], [` (${items.length})`, C.dim]]);
  p.rule();

  items.forEach((item, i) => {
    const selected = i === ui.msg;
    const cells: Cell[] = [
      marker(selected, ui.focus === 'right'), ['⊘ ', C.warning],
      [`${item.project}/${item.origin}`, C.bright], ['  ', C.dim], [item.label, C.dim],
    ];
    p.row(spread(cells, [[ago(item.at), C.dim]], p.width), selected && ui.focus === 'right');
  });

  p.rule();
  const item = items[ui.msg];
  if (item) messageDetail(p, item, h - 3 - items.length);
}

/** Read-only, on purpose: one answer path, the session that raised it, and the CLI records it. */
function messageDetail(p: Pane, item: InboxItem, h: number): void {
  const room = Math.max(1, h - 3);

  if (item.kind === 'gate') {
    p.row([[item.file ?? '', C.bright], [` (${item.lines} lines)`, C.dim]]);
    const body = (item.body ?? []).flatMap((l) => (l ? wrap(l, p.width, 4) : ['']));
    for (const l of body.slice(0, room - 1)) p.row([[l, C.dim]]);
  } else if (item.kind === 'daemon') {
    // Why it is here, then what the run said. `<project>/<name>` is the row's own daemon key, and
    // the tail is read behind the frame; the fixture has no log on disk and carries its lines.
    for (const l of wrap(item.text ?? '', p.width, 2)) p.row([[l, C.warning]]);
    const log = item.body ?? logTail(`${item.project}/${item.origin}`, LOG_LINES);
    for (const l of log.slice(0, Math.max(0, room - 3))) p.row(spans(l, C.dim));
  } else {
    for (const text of (item.text ?? '').split('\n')) for (const l of wrap(text, p.width, room)) p.row([[l, C.bright]]);
  }

  p.row([]);
  // Warp cannot focus a tab from outside; the name is what the human types into its tab switcher.
  if (item.kind === 'question') return p.row([['answer in tab ', C.dim], [item.tab ?? '—', C.bright]]);
  // A daemon answers to nobody's session: reading its log is what clears the alert.
  if (item.kind === 'daemon') return p.row([['answer in a shell  ', C.dim], [`${COMMAND} `, C.dim], [item.answer ?? '', C.bright]]);
  p.row([['answer in the session  ', C.dim], [`${COMMAND} `, C.dim], [item.answer ?? '', C.bright]]);
}
