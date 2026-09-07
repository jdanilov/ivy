import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { itemKey, leftItems, newUi, render, type Ui } from './screen.js';
import type { Snapshot } from './model.js';

/**
 * The screen as plain text. A frame is a left row plus which pane has focus, so a gatekeeper —
 * or a review round — reads what the terminal would draw without owning a terminal.
 */

export interface Frame { name: string; left: number; focus: Ui['focus']; set?: (ui: Ui) => void }

/** Live: every left row with the right pane it opens, then each foot pane and the panel. */
export function liveFrames(snap: Snapshot): Frame[] {
  const rows = leftItems(snap).map((item, left): Frame => ({
    name: `${String(left).padStart(2, '0')}-${itemKey(item).replace(/[^a-z0-9]+/gi, '-')}`,
    left, focus: 'right',
  }));
  return [
    ...rows,
    { name: 'archived', left: 0, focus: 'left', set: (ui) => { ui.showArchived = true; } },
    { name: 'decisions-full', left: 0, focus: 'left', set: (ui) => { ui.full = true; } },
    { name: 'activity-full', left: 0, focus: 'left', set: (ui) => { ui.full = true; ui.foot = 'activity'; } },
    { name: 'help', left: 0, focus: 'right', set: (ui) => { ui.help = true; } },
  ];
}

/** The screen paints no background: the only coloured cells are the inverted selected row. */
function chrome(frame: { lines: { spans: { text: string; bg: { toInts(): number[] } }[] }[]; rows: number }): string {
  const backgrounds = new Set<string>();
  for (const l of frame.lines) {
    for (const span of l.spans) {
      const [r, g, b, a] = span.bg.toInts() as [number, number, number, number];
      if (a !== 0) backgrounds.add(`#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`);
    }
  }
  // The key bar owns the last row: an empty one there is the blank line the human kept seeing.
  const last = (frame.lines[frame.rows - 1]?.spans ?? []).map((span) => span.text).join('').trim();
  return `bg ${[...backgrounds].join(' ') || 'none'} · last row ${last ? JSON.stringify(last.slice(0, 20)) : 'EMPTY'}`;
}

export async function writeFrames(snap: Snapshot, dir: string, frames: Frame[], width = 140, height = 42): Promise<void> {
  const { createTestRenderer } = await import('@opentui/core/testing');
  await mkdir(dir, { recursive: true });
  const { renderer, renderOnce, captureCharFrame, captureSpans } = await createTestRenderer({ width, height });

  for (const frame of frames) {
    const ui = newUi();
    ui.left = frame.left;
    ui.focus = frame.focus;
    frame.set?.(ui);
    render(renderer, snap, ui);
    await renderOnce();
    const file = path.join(dir, `${frame.name}.txt`);
    await Bun.write(file, captureCharFrame());
    console.log(`✓ ${file}  ${chrome(captureSpans())}`);
  }

  renderer.destroy();
}
