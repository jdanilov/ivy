#!/usr/bin/env bun
// Plain-text frames of every Mission Control pane, so the screen can be reviewed without a tty.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createTestRenderer } from '@opentui/core/testing';
import { snapshot } from '../src/tui/fixture.js';
import { leftItems, newUi, render, type Ui } from '../src/tui/screen.js';

const out = process.argv[2] ?? '.factory/missions/2026-09-06-control/prototype';
await mkdir(out, { recursive: true });

const items = leftItems(snapshot);
const at = (match: (i: (typeof items)[number]) => boolean): number => items.findIndex(match);

// The right pane follows the left selection, so a frame is a row plus which pane has focus.
const frames: { name: string; left: number; focus: Ui['focus']; set?: (ui: Ui) => void }[] = [
  { name: 'messages', left: at((i) => i.kind === 'inbox'), focus: 'right' },
  { name: 'parts', left: at((i) => i.kind === 'project' && i.project.name === 'ivy'), focus: 'right' },
  { name: 'mission', left: at((i) => i.kind === 'mission' && i.mission.name === 'refit'), focus: 'left' },
  { name: 'session', left: at((i) => i.kind === 'session'), focus: 'right' },
  {
    name: 'parts-pending',
    left: at((i) => i.kind === 'project' && i.project.name === 'ivy'),
    focus: 'right',
    set: (ui) => {
      ui.toggles = { codegraph: true, browse: false };
      ui.part = 3;
    },
  },
  {
    name: 'parts-confirm',
    left: at((i) => i.kind === 'project' && i.project.name === 'ivy'),
    focus: 'right',
    set: (ui) => {
      ui.toggles = { codegraph: true, browse: false };
      ui.part = 3;
      ui.confirm = true;
    },
  },
];

const { renderer, renderOnce, captureCharFrame, captureSpans } = await createTestRenderer({ width: 140, height: 42 });

/** The screen paints no background: the only coloured cells are the inverted selected row. */
function chrome(): string {
  const frame = captureSpans();
  const backgrounds = new Set<string>();
  for (const l of frame.lines) {
    for (const span of l.spans) {
      const [r, g, b, a] = span.bg.toInts();
      if (a !== 0) backgrounds.add(`#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`);
    }
  }
  const last = (frame.lines[frame.rows - 1]?.spans ?? []).map((span) => span.text).join('');
  return `bg ${[...backgrounds].join(' ') || 'none'} · last row ${last.trim() ? `DRAWN ${JSON.stringify(last)}` : 'empty'}`;
}

for (const frame of frames) {
  const ui = newUi();
  ui.left = frame.left;
  ui.focus = frame.focus;
  frame.set?.(ui);
  render(renderer, snapshot, ui);
  await renderOnce();
  const file = path.join(out, `${frame.name}.txt`);
  await Bun.write(file, captureCharFrame());
  console.log(`✓ ${file}  ${chrome()}`);
}

renderer.destroy();
