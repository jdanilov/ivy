#!/usr/bin/env bun
/**
 * Headless key driver for Mission Control. Builds the live snapshot (or the fixture), puts the
 * selection on a row, sends keys through `onKey` exactly as the terminal would, and prints the
 * frame after each one. Every frame is checked as it is drawn: the key bar must hold the last row
 * and no key may have left an error toast behind, so a run is also an assertion and exits 1 when
 * one fails. Must live inside the repo: run from /tmp it loads a second @opentui.
 *
 *   HOME=<scratch> bun scripts/tui-keys.ts [opts] <key> <key> …
 *
 *   --fixture           the demo snapshot instead of the live one
 *   --row <substr>      start on the first left row whose itemKey contains this
 *   --archived          start with the archived missions shown, as `z` does
 *   --focus right|left  starting focus (default left)
 *   --wait <ms>         pause after each key so an action's write lands (default 400)
 *   --quiet             only the last frame
 *   --spans <substr>    after the last key, print colour + column of every span holding substr ('*' = all)
 *   keys: up down left right return escape space a d f h z t c o x y n r ? q  |  sleep:ms  |  reload
 */
import type { KeyEvent } from '@opentui/core';
import { render, type App } from '../src/tui/screen.js';
import { onKey } from '../src/tui/keys.js';
import { itemKey, leftItems, newUi, type Ui } from '../src/tui/panes/pane.js';
import type { Snapshot } from '../src/tui/model.js';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const flag = (name: string): boolean => argv.includes(`--${name}`);
const VALUE_FLAGS = new Set(['row', 'focus', 'wait', 'spans']);
const keys = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1]?.startsWith('--') && VALUE_FLAGS.has(argv[i - 1]!.slice(2))));

const rebuild = async (): Promise<Snapshot> => {
  const live = await import('../src/tui/live.js');
  await live.buildSnapshot(); await live.settle(); return live.buildSnapshot();
};
const snap: Snapshot = flag('fixture') ? (await import('../src/tui/fixture.js')).snapshot : await rebuild();

const { createTestRenderer } = await import('@opentui/core/testing');
const { renderer, renderOnce, captureCharFrame, captureSpans } = await createTestRenderer({ width: 140, height: 42 });

const ui: Ui = newUi();
ui.showArchived = flag('archived');
const row = opt('row');
if (row !== undefined) {
  const rows = leftItems(snap, ui.showArchived);
  const at = rows.findIndex((i) => itemKey(i).includes(row));
  if (at === -1) throw new Error(`no left row matching ${row}: ${rows.map(itemKey).join(' | ')}`);
  ui.left = at;
}
ui.focus = opt('focus') === 'right' ? 'right' : 'left';

const app: App = { r: renderer, ui, snap };
const wait = Number(opt('wait') ?? 400);
const quiet = flag('quiet');

let broken = 0;

/** The frame a key left behind, and the two things every frame owes whoever is looking at it. */
async function frame(label: string): Promise<void> {
  render(renderer, app.snap, app.ui);
  await renderOnce();
  const text = captureCharFrame();
  // `onKey` swallows a throw into a toast rather than taking the screen down, so the toast is the
  // only trace left: a run that nobody reads the frames of has to read them here.
  const failed = text.split('\n').find((row) => row.includes('error: '));
  if (failed) { broken++; console.log(`✗ ${label}: ${failed.trim()}`); }
  const spans = captureSpans();
  const bar = (spans.lines[spans.rows - 1]?.spans ?? []).map((s: { text: string }) => s.text).join('').trim();
  if (bar === '') { broken++; console.log(`✗ ${label}: nothing on the last row, the key bar was pushed off`); }
  if (!quiet) {
    console.log(`\n═══ ${label} ═══`);
    console.log(text);
  }
}

await frame('start');
for (const key of keys) {
  if (key.startsWith('sleep:')) {
    await Bun.sleep(Number(key.slice(6)));
  } else if (key === 'reload') {
    // The watcher does this in the real screen; headless, an action's write needs asking for again.
    app.snap = await rebuild();
  } else {
    onKey(app, { name: key === '?' ? '?' : key, ctrl: false, meta: false, shift: false, sequence: key } as KeyEvent);
  }
  await Bun.sleep(wait);
  await frame(key);
}
if (quiet) {
  const last = keys[keys.length - 1] ?? 'start';
  console.log(`\n═══ ${last} ═══`);
  console.log(captureCharFrame());
}

const want = opt('spans');
if (want !== undefined) {
  const f = captureSpans();
  f.lines.forEach((line: any, y: number) => {
    let x = 0;
    for (const span of line.spans) {
      if (want === '*' ? span.text.trim() !== '' : span.text.includes(want)) {
        const [r, g, b] = span.fg.toInts();
        console.log(`  y${y} x${x} #${[r, g, b].map((n: number) => n.toString(16).padStart(2, '0')).join('')}  ${JSON.stringify(span.text)}`);
      }
      x += span.text.length;
    }
  });
}

renderer.destroy();
if (broken > 0) {
  console.log(`✗ tui-keys: ${broken} broken frame(s)`);
  process.exit(1);
}
console.log(`✓ tui-keys: ${keys.length + 1} frames`);
