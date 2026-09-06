#!/usr/bin/env bun
/**
 * Headless key driver for Mission Control. Builds the live snapshot (or the fixture), puts the
 * selection on a row, sends keys through `onKey` exactly as the terminal would, and prints the
 * frame after each one. Must live inside the repo: run from /tmp it loads a second @opentui.
 *
 *   HOME=<scratch> bun /opt/ed/ivy/.factory/validator/keys.ts [opts] <key> <key> …
 *
 *   --fixture           the demo snapshot instead of the live one
 *   --row <substr>      start on the first left row whose itemKey contains this
 *   --focus right|left  starting focus (default left)
 *   --wait <ms>         pause after each key so an action's write lands (default 400)
 *   --quiet             only the last frame
 *   --spans <substr>    after the last key, print colour + column of every span holding substr ('*' = all)
 *   keys: up down left right return escape space f z t c o x y n r ? q  |  type:text  |  sleep:ms
 */
import type { KeyEvent } from '@opentui/core';
import { itemKey, leftItems, newUi, onKey, render, type App, type Ui } from '../../src/tui/screen.js';
import type { Snapshot } from '../../src/tui/model.js';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const flag = (name: string): boolean => argv.includes(`--${name}`);
const VALUE_FLAGS = new Set(['row', 'focus', 'wait', 'spans']);
const keys = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1]?.startsWith('--') && VALUE_FLAGS.has(argv[i - 1]!.slice(2))));

const snap: Snapshot = flag('fixture')
  ? (await import('../../src/tui/fixture.js')).snapshot
  : await (async () => { const live = await import('../../src/tui/live.js'); const s = await live.buildSnapshot(); await live.settle(); return live.buildSnapshot(); })();

const { createTestRenderer } = await import('@opentui/core/testing');
const { renderer, renderOnce, captureCharFrame, captureSpans } = await createTestRenderer({ width: 140, height: 42 });

const ui: Ui = newUi();
const row = opt('row');
if (row !== undefined) {
  const at = leftItems(snap).findIndex((i) => itemKey(i).includes(row));
  if (at === -1) throw new Error(`no left row matching ${row}: ${leftItems(snap).map(itemKey).join(' | ')}`);
  ui.left = at;
}
ui.focus = opt('focus') === 'right' ? 'right' : 'left';

const app: App = { r: renderer, ui, snap };
const wait = Number(opt('wait') ?? 400);
const quiet = flag('quiet');

async function frame(label: string): Promise<void> {
  render(renderer, app.snap, app.ui);
  await renderOnce();
  console.log(`\n═══ ${label} ═══`);
  console.log(captureCharFrame());
}

/** The note prompt is a real InputRenderable; typing goes through it, not through onKey. */
function input(node: any): any {
  if (node?.constructor?.name === 'InputRenderable') return node;
  for (const child of node?.getChildren?.() ?? []) { const hit = input(child); if (hit) return hit; }
  return null;
}

if (!quiet) await frame('start');
for (const key of keys) {
  if (key.startsWith('sleep:')) {
    await Bun.sleep(Number(key.slice(6)));
  } else if (key.startsWith('type:')) {
    const box = input(renderer.root);
    if (!box) throw new Error('no input on screen to type into');
    box.insertText(key.slice(5)); // the INPUT event carries it into ui.note.text
  } else {
    onKey(app, { name: key === '?' ? '?' : key, ctrl: false, meta: false, shift: false, sequence: key } as KeyEvent);
  }
  await Bun.sleep(wait);
  if (!quiet) await frame(key);
}
if (quiet) await frame(keys[keys.length - 1] ?? 'start');

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
