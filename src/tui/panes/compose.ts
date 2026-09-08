import type { KeyEvent } from '@opentui/core';
import { C } from '../theme.js';
import { id, type Cell } from '../format.js';
import { itemKey, type LeftItem, type Pane, type Ui } from './pane.js';

/**
 * COMPOSE: a message to the selected row's session, written under the foot and posted to the
 * session's inbox. No header names the session: the selected row already does. One draft per row, kept while the selection moves and while `Esc` hands the
 * keys back, so a half-written reply survives a look at another session.
 */

export interface Draft { text: string; cursor: number }

/** The box grows with the text to this many rows, then scrolls to keep the cursor in view. */
const MAX_ROWS = 12;

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

export function rows(text: string, width: number): Row[] {
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

/** Text at the cursor, typed or pasted: a terminal's line ends become the draft's own. */
export function insert(d: Draft, s: string): void {
  const text = s.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  d.text = d.text.slice(0, d.cursor) + text + d.text.slice(d.cursor);
  d.cursor += text.length;
}

/** The word before the cursor, with the spaces after it: what `⌥⌫` and `^W` take. */
const wordBefore = (d: Draft): number => /\S+\s*$|\s+$/.exec(d.text.slice(0, d.cursor))?.[0].length ?? 0;

/** What a key does to the draft. `↵` is a line break here: sending is a chord, and the caller's. */
export function editKey(d: Draft, key: KeyEvent, width: number): boolean {
  const all = rows(d.text, width);
  const r = rowOf(all, d.cursor);
  const cut = (from: number, to: number): void => {
    d.text = d.text.slice(0, from) + d.text.slice(to);
    d.cursor = from;
  };
  const jump = (to: number): void => {
    const row = all[to];
    if (row) d.cursor = Math.min(row.start + (d.cursor - all[r]!.start), row.end);
  };
  // A modifier on backspace is a word: Option in the terminal's own reading, Control in kitty's.
  const word = (key.name === 'backspace' && (key.meta || key.option || key.ctrl)) || (key.ctrl && key.name === 'w');
  if (key.name === 'return') insert(d, '\n');
  else if (word) cut(d.cursor - wordBefore(d), d.cursor);
  else if (key.ctrl && key.name === 'k') {
    // The line the cursor is on, break included; the last line takes the break before it instead.
    const from = d.text.lastIndexOf('\n', d.cursor - 1) + 1;
    const end = d.text.indexOf('\n', d.cursor);
    cut(end === -1 ? Math.max(0, from - 1) : from, end === -1 ? d.text.length : end + 1);
  } else if (key.name === 'backspace') {
    if (d.cursor === 0) return false;
    cut(d.cursor - 1, d.cursor);
  } else if (key.name === 'delete') cut(d.cursor, d.cursor + 1);
  else if (key.name === 'left') d.cursor = Math.max(0, d.cursor - 1);
  else if (key.name === 'right') d.cursor = Math.min(d.text.length, d.cursor + 1);
  else if (key.name === 'up') jump(r - 1);
  else if (key.name === 'down') jump(r + 1);
  else if (key.name === 'home' || (key.ctrl && key.name === 'a')) d.cursor = all[r]!.start;
  else if (key.name === 'end' || (key.ctrl && key.name === 'e')) d.cursor = all[r]!.end;
  else if (!key.ctrl && !key.meta && printable(key.sequence)) insert(d, key.sequence);
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

/**
 * A draft's text as rows, at most `max` of them, wrapped at the width the caller edits it at. The
 * cursor's row stays in view — the last rows up to it, never the first ones — and carries the
 * cursor while the keys are the draft's; a draft nobody is typing into draws dim and whole.
 * The intent form draws its fields through this too: one editor, one wrap, one cursor.
 */
export function draftRows(p: Pane, d: Draft, width: number, active: boolean, max: number): void {
  const all = rows(d.text, width);
  const at = rowOf(all, d.cursor);
  const from = Math.max(0, at - max + 1);
  for (const [i, row] of all.slice(from, from + max).entries()) {
    const text = d.text.slice(row.start, row.end);
    if (!active || from + i !== at) {
      p.row([[text, active ? C.bright : C.dim]]);
      continue;
    }
    const col = d.cursor - row.start;
    const cells: Cell[] = [[text.slice(0, col), C.bright], [text[col] ?? ' ', C.bright, true], [text.slice(col + 1), C.bright]];
    p.row(cells);
  }
}

export function composePane(p: Pane, ui: Ui, here: LeftItem): void {
  if (!targetOf(here)) return;
  p.rule();
  draftRows(p, draftOf(ui, here), p.width, ui.compose, MAX_ROWS);
}
