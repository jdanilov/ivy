import type { KeyEvent } from '@opentui/core';
import { C } from '../theme.js';
import { id, type Cell } from '../format.js';
import { itemKey, type LeftItem, type Pane, type Ui } from './pane.js';

/**
 * COMPOSE: a message to the selected row's session, written under the foot and posted to the
 * session's inbox. No header names the session: the selected row already does. One draft per row, kept while the selection moves and while `esc` hands the
 * keys back, so a half-written reply survives a look at another session.
 */

export interface Draft { text: string; cursor: number }

/** The box grows with the text to this many rows, then scrolls to keep the cursor in view. */
const MAX_ROWS = 6;

export const draftOf = (ui: Ui, here: LeftItem): Draft => (ui.drafts[itemKey(here)] ??= { text: '', cursor: 0 });

/** The session a row can be written to: a session row's own, a mission row's bound one. */
export function targetOf(here: LeftItem): { session: string; name: string } | null {
  if (here.kind === 'session') return { session: here.session.id, name: here.session.name ?? id(here.session.id) };
  if (here.kind === 'mission' && here.mission.session) return { session: here.mission.session, name: here.mission.name };
  return null;
}

// ── layout ────────────────────────────────────────────────────────────────────

/** One screen row of the text: a hard break ends a row, a full width starts the next. */
interface Row { start: number; end: number }

function rows(text: string, width: number): Row[] {
  const out: Row[] = [];
  let start = 0;
  for (const para of text.split('\n')) {
    const end = start + para.length;
    let at = start;
    do {
      out.push({ start: at, end: Math.min(at + width, end) });
      at += width;
    } while (at < end);
    start = end + 1;
  }
  return out;
}

/** The row the cursor is on: at a soft break it is the row that begins there, not the one that filled. */
const rowOf = (all: Row[], cursor: number): number => all.findLastIndex((r) => r.start <= cursor && cursor <= r.end);

// ── editing ───────────────────────────────────────────────────────────────────

/** A typed character or a paste, never a control sequence: those name keys and come through `name`. */
const printable = (s: string): boolean => /^[^\x00-\x08\x0b-\x1f\x7f]+$/.test(s);

/** What a key does to the draft. `↵` is a line break here: sending is a chord, and the caller's. */
export function editKey(d: Draft, key: KeyEvent, width: number): boolean {
  const all = rows(d.text, width);
  const r = rowOf(all, d.cursor);
  const insert = (s: string): void => {
    d.text = d.text.slice(0, d.cursor) + s + d.text.slice(d.cursor);
    d.cursor += s.length;
  };
  const jump = (to: number): void => {
    const row = all[to];
    if (row) d.cursor = Math.min(row.start + (d.cursor - all[r]!.start), row.end);
  };
  if (key.name === 'return') insert('\n');
  else if (key.name === 'backspace') {
    if (d.cursor === 0) return false;
    d.text = d.text.slice(0, d.cursor - 1) + d.text.slice(d.cursor);
    d.cursor -= 1;
  } else if (key.name === 'delete') d.text = d.text.slice(0, d.cursor) + d.text.slice(d.cursor + 1);
  else if (key.name === 'left') d.cursor = Math.max(0, d.cursor - 1);
  else if (key.name === 'right') d.cursor = Math.min(d.text.length, d.cursor + 1);
  else if (key.name === 'up') jump(r - 1);
  else if (key.name === 'down') jump(r + 1);
  else if (key.name === 'home' || (key.ctrl && key.name === 'a')) d.cursor = all[r]!.start;
  else if (key.name === 'end' || (key.ctrl && key.name === 'e')) d.cursor = all[r]!.end;
  else if (!key.ctrl && !key.meta && printable(key.sequence)) insert(key.sequence.replaceAll('\r', '\n'));
  else return false;
  return true;
}

// ── drawing ───────────────────────────────────────────────────────────────────

/** Rows the box takes, its rule included; none while the row has nothing to write to or say. */
export function composeHeight(ui: Ui, here: LeftItem, width: number): number {
  const draft = ui.drafts[itemKey(here)];
  if (!targetOf(here) || (!ui.compose && !draft?.text)) return 0;
  return 1 + Math.min(MAX_ROWS, rows(draft?.text ?? '', width).length);
}

export function composePane(p: Pane, ui: Ui, here: LeftItem): void {
  const target = targetOf(here);
  if (!target) return;
  const d = draftOf(ui, here);
  const all = rows(d.text, p.width);
  const at = rowOf(all, d.cursor);

  p.rule();
  // The cursor's row stays in view: the box shows the last rows up to it, never the first ones.
  const from = Math.max(0, at - MAX_ROWS + 1);
  for (const [i, row] of all.slice(from, from + MAX_ROWS).entries()) {
    const text = d.text.slice(row.start, row.end);
    if (!ui.compose || from + i !== at) {
      p.row([[text, ui.compose ? C.bright : C.dim]]);
      continue;
    }
    const col = d.cursor - row.start;
    const cells: Cell[] = [[text.slice(0, col), C.bright], [text[col] ?? ' ', C.bright, true], [text.slice(col + 1), C.bright]];
    p.row(cells);
  }
}
