#!/usr/bin/env bun
// Plain-text frames of the fixture, so the look can be reviewed without a tty.
// Live data has its own frames: `factory --frames <dir>`.
import { snapshot } from '../src/tui/fixture.js';
import { leftItems } from '../src/tui/panes/pane.js';
import { draft } from '../src/tui/panes/form.js';
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
  { name: 'stub', left: at((i) => i.kind === 'mission' && i.mission.status === 'stub'), focus: 'left' },
  {
    name: 'parts-pending',
    left: at((i) => i.kind === 'project' && i.project.name === 'ivy'),
    focus: 'right',
    set: (ui) => {
      ui.toggles = { codegraph: true, browse: false };
      ui.part = 3;
    },
  },
  { name: 'decisions-full', left: at((i) => i.kind === 'mission' && i.mission.name === 'refit'), focus: 'left', set: (ui) => { ui.size = 'full'; } },
  { name: 'activity-full', left: at((i) => i.kind === 'mission' && i.mission.name === 'refit'), focus: 'left', set: (ui) => { ui.size = 'full'; ui.foot = 'activity'; } },
  { name: 'global', left: at((i) => i.kind === 'global'), focus: 'right' },
  {
    name: 'compose',
    left: at((i) => i.kind === 'session'),
    focus: 'left',
    set: (ui) => {
      ui.compose = true;
      ui.drafts['s b3f21c07'] = { text: 'Yes, keep the rename on the events file.\nDrop the transcript read.', cursor: 41 };
    },
  },
  { name: 'help', left: at((i) => i.kind === 'inbox'), focus: 'right', set: (ui) => { ui.help = true; } },
  // What `P` draws on a project's rows: the manifest's own fields, a daemon's set of them.
  {
    name: 'service',
    left: at((i) => i.kind === 'project' && i.project.name === 'ivy'),
    focus: 'right',
    set: (ui) => {
      ui.form = 'service';
      ui.forms['svc ivy'] = {
        texts: {
          name: draft('nightly'), description: draft('the build and the whole test walk'),
          cmd: draft('bun run build && bun scripts/test.ts'), cwd: draft(''), every: draft('1d'), port: draft(''),
        },
        dials: { kind: 'daemon', restart: 'never' },
        field: 5,
      };
    },
  },
  { name: 'daemon', left: at((i) => i.kind === 'daemon'), focus: 'right' },
  // What `A` draws on a daemon row: its log in the foot, given the whole screen.
  { name: 'daemon-log', left: at((i) => i.kind === 'daemon'), focus: 'right', set: (ui) => { ui.size = 'full'; } },
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
