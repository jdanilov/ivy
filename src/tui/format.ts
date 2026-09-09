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

/** The sixteen ANSI colours on the palette: a dev server's green is the screen's success, its
 *  yellow the warning, its blue the agent blue, so a log reads in the same voice as the rest. */
const ANSI: string[] = [
  C.dim, C.error, C.success, C.warning, C.agent, '#b58dc9', '#6bb3c9', C.bright,
  C.dim, C.error, C.success, C.warning, C.agent, '#b58dc9', '#6bb3c9', C.bright,
];

const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** A 256-colour index: the sixteen above, the 6×6×6 cube, then the grey ramp. */
function ansi256(n: number): string {
  if (n < 16) return ANSI[n]!;
  if (n < 232) { const c = n - 16; const v = (x: number): number => (x === 0 ? 0 : 55 + x * 40); return hex(v(Math.floor(c / 36)), v(Math.floor(c / 6) % 6), v(c % 6)); }
  return hex(8 + (n - 232) * 10, 8 + (n - 232) * 10, 8 + (n - 232) * 10);
}

/** A line with SGR colour in it, as cells: foreground codes set the colour, bold reads bright,
 *  dim reads dim, a reset goes back to `base`. Background and the rest are dropped — the screen
 *  paints no backgrounds. What a shell would show, in the pane's own cells. */
export function spans(line: string, base: string): Cell[] {
  const out: Cell[] = [];
  let color = base;
  let last = 0;
  const push = (text: string): void => {
    if (!text) return;
    const tail = out[out.length - 1];
    if (tail && tail[1] === color) tail[0] += text;
    else out.push([text, color]);
  };
  for (const m of line.matchAll(/\x1b\[([0-9;]*)m/g)) {
    push(line.slice(last, m.index));
    last = m.index + m[0].length;
    const codes = (m[1] === '' ? '0' : m[1]).split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]!;
      if (c === 0 || c === 39 || c === 22) color = base;
      else if (c === 1) color = C.bright;
      else if (c === 2) color = C.dim;
      else if (c >= 30 && c <= 37) color = ANSI[c - 30]!;
      else if (c >= 90 && c <= 97) color = ANSI[c - 82]!;
      else if (c === 38 && codes[i + 1] === 5) { color = ansi256(codes[i + 2] ?? 0); i += 2; }
      else if (c === 38 && codes[i + 1] === 2) { color = hex(codes[i + 2] ?? 0, codes[i + 3] ?? 0, codes[i + 4] ?? 0); i += 4; }
      else if (c === 48 && codes[i + 1] === 5) i += 2;
      else if (c === 48 && codes[i + 1] === 2) i += 4;
    }
  }
  push(line.slice(last));
  return out;
}

/** `wrap` over coloured cells: the text is wrapped as plain text and the colours put back by
 *  walking the two in step — wrapping only collapses whitespace and splits words, so every other
 *  character of a row is the next one in the cells. */
export function wrapCells(cells: Cell[], width: number, max: number): Cell[][] {
  const chars: [ch: string, color: string][] = cells.flatMap(([text, color]) => [...text].map((ch): [string, string] => [ch, color]));
  let i = 0;
  return wrap(cells.map(([text]) => text).join(''), width, max).map((row) => {
    const out: Cell[] = [];
    for (const ch of row) {
      // A space is the whitespace it stood for, and a row's leading space came from nothing.
      let color = chars[i]?.[1] ?? out[out.length - 1]?.[1] ?? C.dim;
      if (ch === ' ') { while (i < chars.length && /\s/.test(chars[i]![0])) i++; }
      else {
        while (i < chars.length && chars[i]![0] !== ch) i++;
        color = chars[i]?.[1] ?? color;
        i++;
      }
      const tail = out[out.length - 1];
      if (tail && tail[1] === color) tail[0] += ch;
      else out.push([ch, color]);
    }
    return out;
  });
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
