import { C } from '../theme.js';
import { len, spread, wrap, type Cell } from '../format.js';
import { marker, type Pane, type Ui } from './pane.js';
import type { Project } from '../model.js';

/** PARTS: what a project has linked, what it could have, and the toggles `↵` would apply. */

const DOT: Cell = [' · ', C.rule];
/** The longest description any part ships takes three rows beside the status columns. */
const DESCRIPTION_ROWS = 3;

export function partStatus(name: string, base: string, ui: Ui): string {
  const toggled = ui.toggles[name];
  return toggled === undefined ? base : toggled ? 'installed' : 'not-installed';
}

/** The parts `↵` would install and the ones it would remove: the toggles the manifest disagrees with. */
export function changes(project: Project, ui: Ui): { add: string[]; drop: string[] } {
  const moved = project.parts.filter((part) => partStatus(part.name, part.status, ui) !== part.status);
  return {
    add: moved.filter((part) => ui.toggles[part.name] === true).map((part) => part.name),
    drop: moved.filter((part) => ui.toggles[part.name] === false).map((part) => part.name),
  };
}

export function pending(project: Project, ui: Ui): string[] {
  const { add, drop } = changes(project, ui);
  return [...add.map((name) => `install ${name}`), ...drop.map((name) => `uninstall ${name}`)];
}

export function partsPane(p: Pane, project: Project, ui: Ui): void {
  const parts = project.parts;
  const installed = parts.filter((part) => partStatus(part.name, part.status, ui) !== 'not-installed').length;
  const changes = pending(project, ui);
  p.row([
    ['PARTS', C.bright], [`  ${project.name}`, C.dim], [`  ${installed}/${parts.length}`, C.dim],
    [changes.length ? `  ±${changes.length}` : '', C.accent],
  ]);
  p.rule();

  parts.forEach((part, i) => {
    const status = partStatus(part.name, part.status, ui);
    const on = status !== 'not-installed';
    const selected = i === ui.part && ui.focus === 'right';
    const changed = on !== (part.status !== 'not-installed');
    // A part whose files no longer match the Factory is neither installed nor available: `update` fixes it.
    const word = status === 'modified' ? 'modified' : on ? 'installed' : 'available';
    const head: Cell[] = [
      marker(i === ui.part, ui.focus === 'right'), [part.name.padEnd(16), C.bright], [part.type.padEnd(9), C.dim],
      [`${on ? '●' : '○'} ${word.padEnd(11)}`, status === 'modified' ? C.warning : on ? C.success : C.dim],
    ];
    // What a part is for is the one thing worth reading here, so it wraps under itself, never cut.
    const indent = len(head);
    const body = wrap(part.description, Math.max(20, p.width - indent - 2), DESCRIPTION_ROWS);
    p.row(spread([...head, [body[0] ?? '', C.dim]], [[changed ? '±' : ' ', C.accent]], p.width), selected);
    for (const text of body.slice(1)) p.row([[' '.repeat(indent), C.dim], [text, C.dim]], selected);
  });

  p.rule();
  if (ui.confirm) {
    return p.row([['apply: ', C.dim], [changes.join(', '), C.bright], ['   Y ', C.accent], ['Confirm  ', C.dim], ['N ', C.accent], ['Cancel', C.dim]]);
  }
  // The files of the selected part, until something is pending: then the way out is what matters.
  if (changes.length > 0) return p.row([['↵ ', C.accent], ['Apply', C.dim], DOT, ['Esc ', C.accent], ['Discard', C.dim]]);
  for (const file of parts[ui.part]?.files ?? []) p.row([[file, C.dim]]);
}
