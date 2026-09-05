#!/usr/bin/env bun
// Plain-text frames of the three Mission Control modes, so the screen can be reviewed without a tty.
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createTestRenderer } from '@opentui/core/testing';
import { snapshot } from '../src/tui/fixture.js';
import { newUi, render } from '../src/tui/screen.js';

const out = process.argv[2] ?? '.factory/missions/2026-09-06-control/prototype';
await mkdir(out, { recursive: true });

const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({ width: 140, height: 42 });

// Inbox and Parts are drawn with the right pane focused, Mission with the left, so the review
// sees both the inverted row and the dim `›` marker.
const frames = [
  { name: 'inbox', mode: 0, focus: 'right' },
  { name: 'mission', mode: 1, focus: 'left' },
  { name: 'parts', mode: 2, focus: 'right' },
] as const;

for (const frame of frames) {
  const ui = newUi();
  ui.mode = frame.mode;
  ui.focus = frame.focus;
  render(renderer, snapshot, ui);
  await renderOnce();
  const file = path.join(out, `${frame.name}.txt`);
  await Bun.write(file, captureCharFrame());
  console.log(`✓ ${file}`);
}

renderer.destroy();
