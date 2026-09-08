#!/usr/bin/env bun
/**
 * The bracketed-paste path into the intent form, which tui-keys cannot send: `onPaste` is wired to
 * the renderer's own paste event, not to `onKey`. Opens the form on the fixture's `ivy` project,
 * pastes a two-line string into the goal field and prints the frame.
 *
 *   bun .factory/validator/form-paste.ts [text]
 */
import type { KeyEvent } from '@opentui/core';
import { render, type App } from '../../src/tui/screen.js';
import { onKey, onPaste } from '../../src/tui/keys.js';
import { itemKey, leftItems, newUi } from '../../src/tui/panes/pane.js';

const text = process.argv[2] ?? 'pasted goal line one\nline two';
const snap = (await import('../../src/tui/fixture.js')).snapshot;
const { createTestRenderer } = await import('@opentui/core/testing');
const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 140, height: 42 });

const ui = newUi();
ui.left = leftItems(snap, false).findIndex((i) => itemKey(i).includes('p ivy'));
const app: App = { r: renderer, ui, snap };

const key = (name: string, seq = name) => onKey(app, { name, ctrl: false, meta: false, shift: false, sequence: seq } as KeyEvent);
key('m');                       // form on, cursor on name
for (const ch of 'memo') key(ch);
key('tab', '\t');               // onto goal
onPaste(app, text);
await Bun.sleep(200);
render(renderer, app.snap, app.ui);
await renderOnce();
console.log(captureCharFrame());
process.exit(0);
