import { C } from '../theme.js';
import { len, spread, wrap, type Cell } from '../format.js';
import { marker, type Pane, type Ui } from './pane.js';
import type { PartRow, Project, ScopeChoice } from '../model.js';

/** PARTS: what a project has installed, what it could have, and the toggles `↵` would apply. The
 *  global row draws the same list with the scope choice instead, because scope is chosen once for
 *  the machine and every project reads it. */

const DOT: Cell = [' · ', C.rule];
/** The longest description any part ships takes three rows beside the status columns. */
const DESCRIPTION_ROWS = 3;
const CHOICES: ScopeChoice[] = ['project', 'global', 'off'];

export function partStatus(name: string, base: string, ui: Ui): string {
  const toggled = ui.toggles[name];
  // A scope left pending on the global row is not an install toggle here, and the other way round.
  return typeof toggled !== 'boolean' ? base : toggled ? 'installed' : 'not-installed';
}

/** The scope `↵` would leave the part in: what Space cycled to, else what the config holds now. */
export function partScope(part: PartRow, ui: Ui): ScopeChoice {
  const choice = ui.toggles[part.name];
  return typeof choice === 'string' ? choice : part.scope;
}

export const nextScope = (part: PartRow, ui: Ui): ScopeChoice =>
  CHOICES[(CHOICES.indexOf(partScope(part, ui)) + 1) % CHOICES.length]!;

/** The parts `↵` would install and the ones it would remove: the toggles the manifest disagrees with. */
export function changes(project: Project, ui: Ui): { add: string[]; drop: string[] } {
  const moved = project.parts.filter((part) => partStatus(part.name, part.status, ui) !== part.status);
  return {
    add: moved.filter((part) => ui.toggles[part.name] === true).map((part) => part.name),
    drop: moved.filter((part) => ui.toggles[part.name] === false).map((part) => part.name),
  };
}

/** The scope choices `↵` would write, each one a part the config does not already agree with. */
export function scopeChanges(project: Project, ui: Ui): { name: string; choice: ScopeChoice }[] {
  return project.parts
    .filter((part) => partScope(part, ui) !== part.scope)
    .map((part) => ({ name: part.name, choice: partScope(part, ui) }));
}

export function pending(project: Project, ui: Ui, global: boolean): string[] {
  if (global) return scopeChanges(project, ui).map(({ name, choice }) => `${name} → ${choice}`);
  const { add, drop } = changes(project, ui);
  return [...add.map((name) => `install ${name}`), ...drop.map((name) => `uninstall ${name}`)];
}

/** The three choices, the chosen one filled and bright, the recommended one in accent until it is
 *  the chosen: what the author advises is only worth saying while the human has left it. */
function choices(part: PartRow, ui: Ui): Cell[] {
  const chosen = partScope(part, ui);
  return CHOICES.map((choice): Cell => [
    `${choice === chosen ? '●' : '○'} ${choice.padEnd(9)}`,
    choice === chosen ? C.bright : choice === part.recommended ? C.accent : C.dim,
  ]);
}

export function partsPane(p: Pane, project: Project, ui: Ui, global: boolean): void {
  const parts = project.parts;
  const installed = parts.filter((part) => partStatus(part.name, part.status, ui) !== 'not-installed').length;
  const changes = pending(project, ui, global);
  p.row([
    ['PARTS', C.bright], [`  ${project.name}`, C.dim], [`  ${installed}/${parts.length}`, C.dim],
    [changes.length ? `  ±${changes.length}` : '', C.accent],
  ]);
  p.rule();

  parts.forEach((part, i) => {
    const status = partStatus(part.name, part.status, ui);
    const on = status !== 'not-installed';
    const selected = i === ui.part && ui.focus === 'right';
    const changed = global ? partScope(part, ui) !== part.scope : on !== (part.status !== 'not-installed');
    // A part whose files no longer match the Factory is neither installed nor available: `update` fixes it.
    const word = status === 'modified' ? 'modified' : on ? 'installed' : 'available';
    const head: Cell[] = [
      marker(i === ui.part, ui.focus === 'right'), [part.name.padEnd(16), C.bright], [part.type.padEnd(9), C.dim],
      [`${on ? '●' : '○'} ${word.padEnd(11)}`, status === 'modified' ? C.warning : on ? C.success : C.dim],
    ];
    // The choices hold the right edge, so they read down as three columns and nothing crowds them
    // out. What a part is for wraps under itself, the one thing worth reading on a project row;
    // beside the choices it takes the room they leave, on one line, and none when that is unreadable.
    const tail: Cell[] = [...(global ? choices(part, ui) : []), [changed ? '±' : ' ', C.accent]];
    const indent = len(head);
    const room = p.width - indent - len(tail) - 2;
    const body = global
      ? (room >= 12 ? wrap(part.description, room, 1) : [''])
      : wrap(part.description, Math.max(20, room), DESCRIPTION_ROWS);
    p.row(spread([...head, [body[0] ?? '', C.dim]], tail, p.width), selected);
    for (const text of body.slice(1)) p.row([[' '.repeat(indent), C.dim], [text, C.dim]], selected);
  });

  p.rule();
  if (ui.confirm) {
    return p.row([['apply: ', C.dim], [changes.join(', '), C.bright], ['   Y ', C.accent], ['Confirm  ', C.dim], ['N ', C.accent], ['Cancel', C.dim]]);
  }
  // The files of the selected part, until something is pending: then the way out is what matters.
  if (changes.length > 0) return p.row([['↵ ', C.accent], ['Apply', C.dim], DOT, ['Esc ', C.accent], ['Discard', C.dim]]);
  const part = parts[ui.part];
  if (global && part) p.row([['recommended ', C.dim], [part.recommended, C.accent]]);
  for (const file of part?.files ?? []) p.row([[file, C.dim]]);
}
