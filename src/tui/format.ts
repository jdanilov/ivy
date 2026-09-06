import { StyledText, fg, bg, type TextChunk } from '@opentui/core';
import { C } from './theme.js';

/** Formats from docs/design.md: relative time, duration, tokens, ids, file lines. */

export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return '<1m ago';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Wall-clock time of a log line, the shape Droid's Progress Log uses. */
export function clock(at: number): string {
  return new Date(at).toTimeString().slice(0, 8);
}

export function dur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
}

export function tokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

export function id(session: string): string {
  return `#${session.slice(0, 8)}`;
}

/** A run of text and the colour it is drawn in. A row is a list of these. */
export type Cell = [text: string, color: string, invert?: boolean];

/** Puts `right` against the right edge, `left` against the left, spaces between. */
export function spread(left: Cell[], right: Cell[], width: number): Cell[] {
  const used = len(left) + len(right);
  return used >= width ? [...left, ...right] : [...left, [' '.repeat(width - used), C.dim], ...right];
}

/** Terminal cells a string takes. Emoji are two wide, and a live log is full of them. */
export function cols(text: string): number {
  let cells = 0;
  for (const ch of text) cells += ch.codePointAt(0)! > 0xffff ? 2 : 1;
  return cells;
}

export function len(cells: Cell[]): number {
  return cells.reduce((n, [text]) => n + cols(text), 0);
}

/** As much of `text` as fits in `cells`, in whole characters. */
function fit(text: string, cells: number): [text: string, width: number] {
  let out = '';
  let used = 0;
  for (const ch of text) {
    const w = ch.codePointAt(0)! > 0xffff ? 2 : 1;
    if (used + w > cells) break;
    out += ch;
    used += w;
  }
  return [out, used];
}

/** Word-wraps over at most `max` rows, splitting a word too long to fit. Never truncates. */
export function wrap(text: string, width: number, max: number): string[] {
  const out: string[] = [''];
  for (const word of text.split(/\s+/)) {
    for (let rest = word; rest; rest = rest.slice(width)) {
      const piece = rest.slice(0, width);
      const last = out[out.length - 1]!;
      if (!last) out[out.length - 1] = piece;
      else if (last.length + 1 + piece.length <= width) out[out.length - 1] = `${last} ${piece}`;
      else if (out.length < max) out.push(piece);
      else return out;
    }
  }
  return out;
}

/** One row, truncated with `…` at the pane edge, padded so a selected row inverts full width. */
export function line(cells: Cell[], width: number, selected = false): StyledText {
  const chunks: TextChunk[] = [];
  let left = width;

  for (const [text, color, invert] of cells) {
    if (left <= 0) break;
    const w = cols(text);
    const [head, used] = w > left ? fit(text, left - 1) : [text, w];
    const cut = w > left ? `${head}…` : head;
    left -= w > left ? used + 1 : used;
    chunks.push(selected || invert ? bg(C.selBg)(fg(C.selFg)(cut)) : fg(color)(cut));
  }
  if (left > 0) {
    const pad = ' '.repeat(left);
    chunks.push(selected ? bg(C.selBg)(pad) : fg(C.dim)(pad));
  }

  return new StyledText(chunks);
}
