#!/usr/bin/env bun
// Plain-text frames of the fixture, so the look can be reviewed without a tty.
// Live data has its own frames: `factory --frames <dir>`.
import { snapshot } from '../src/tui/fixture.js';
import { leftItems } from '../src/tui/screen.js';
import { writeFrames, type Frame } from '../src/tui/frames.js';

const out = process.argv[2] ?? '.factory/missions/2026-09-06-control/prototype';

const items = leftItems(snapshot);
const at = (match: (i: (typeof items)[number]) => boolean): number => items.findIndex(match);

// The right pane follows the left selection, so a frame is a row plus which pane has focus.
const frames: Frame[] = [
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
  { name: 'activity-full', left: at((i) => i.kind === 'mission' && i.mission.name === 'refit'), focus: 'left', set: (ui) => { ui.full = true; } },
  { name: 'help', left: at((i) => i.kind === 'inbox'), focus: 'right', set: (ui) => { ui.help = true; } },
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

await writeFrames(snapshot, out, frames);
