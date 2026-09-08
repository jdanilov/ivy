#!/usr/bin/env bun
/**
 * A PARTS pane at an arbitrary terminal size — tui-keys hardcodes 140x42.
 *   bun .factory/validator/width.ts <cols> [--fixture] [--row <substring>] [--height <rows>]
 *                                          [--keys down,down,space]
 * Default row is `global`; any left-item key works, so the project pane can be read at the same
 * size. `--keys` sends the same names tui-keys does through `onKey` before the frame is printed,
 * which is how a selection deep in the list reaches a short terminal. Prints one frame.
 */
import type { KeyEvent } from '@opentui/core';
import { render, type App } from '../../src/tui/screen.js';
import { onKey } from '../../src/tui/keys.js';
import { itemKey, leftItems, newUi, type Ui } from '../../src/tui/panes/pane.js';
import type { Snapshot } from '../../src/tui/model.js';

const cols = Number(process.argv[2] ?? 140);
const opt = (n: string): string | undefined => {
   const i = process.argv.indexOf(`--${n}`);
   return i === -1 ? undefined : process.argv[i + 1];
};
const rows = Number(opt('height') ?? 42);
const row = opt('row') ?? 'global';
const keys = (opt('keys') ?? '').split(',').filter((k) => k !== '');
const snap: Snapshot = process.argv.includes('--fixture')
   ? (await import('../../src/tui/fixture.js')).snapshot
   : await (async () => { const l = await import('../../src/tui/live.js'); await l.buildSnapshot(); await l.settle(); return l.buildSnapshot(); })();

const { createTestRenderer } = await import('@opentui/core/testing');
const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: cols, height: rows });
const ui: Ui = newUi();
ui.left = leftItems(snap, false).findIndex((i) => itemKey(i).includes(row));
ui.focus = 'right';
const app: App = { r: renderer, ui, snap };
for (const key of keys) onKey(app, { name: key, ctrl: false, meta: false, shift: false, sequence: key } as KeyEvent);
render(renderer, app.snap, app.ui);
await renderOnce();
console.log(captureCharFrame());
process.exit(0);
