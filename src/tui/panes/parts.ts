import { C } from '../theme.js';
import { len, spread, wrap, type Cell } from '../format.js';
import type { Pane, Ui } from './pane.js';
import type { PartRow, Project, ScopeChoice } from '../model.js';

/** PARTS: what a project has installed, what it could have, and the toggles `↵` would apply. The
 *  global row draws the same list with the scope choice instead, because scope is chosen once for
 *  the machine and every project reads it. */

const DOT: Cell = [' · ', C.rule];
/** The longest description any part ships takes three rows beside the status columns. */
const DESCRIPTION_ROWS = 3;
/** Narrower than this the column says nothing, so a narrow pane drops the description whole rather
 *  than wrapping wider than the row and letting the pane edge cut it mid-word. */
const DESCRIPTION_MIN = 20;
const CHOICES: ScopeChoice[] = ['project', 'global', 'off'];

export function partStatus(name: string, base: string, ui: Ui): string {
  const toggled = ui.toggles[name];
  // A scope left pending on the global row is not an install toggle here, and the other way round.
  return typeof toggled !== 'boolean' ? base : toggled ? 'installed' : 'not-installed';
}

/** The scope `↵` would leave the part in: what Space cycled to, else what the config holds now. */
function partScope(part: PartRow, ui: Ui): ScopeChoice {
  const choice = ui.toggles[part.name];
  return typeof choice === 'string' ? choice : part.scope;
}

/** What the part can be: `global` is not on offer for one that needs a project root to live in. */
const offered = (part: PartRow): ScopeChoice[] => CHOICES.filter((c) => c !== 'global' || !part.projectOnly);

export const nextScope = (part: PartRow, ui: Ui): ScopeChoice => {
  const choices = offered(part);
  return choices[(choices.indexOf(partScope(part, ui)) + 1) % choices.length]!;
};

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

/** The one column a global row carries, in the place a project row keeps its status: where the part
 *  is to live, and for a global one whether `~/.claude` holds it yet — nothing else on the row says
 *  so, and a status word beside the scope only ever repeated it. `off` is the hollow glyph. */
function scopeCell(part: PartRow, status: string, ui: Ui): Cell {
  const scope = partScope(part, ui);
  const colour = scope !== 'global' ? C.dim : status === 'installed' ? C.success : C.warning;
  return [`${scope === 'off' ? '○' : '●'} ${scope.padEnd(11)}`, colour];
}

/** One row as drawn: a part's own rows carry its selection, so a clipped list keeps the highlight. */
type Row = { cells: Cell[]; selected: boolean };

/** The rows of one part: the row itself, then what it is for, wrapped under the description column. */
function partBlock(p: Pane, part: PartRow, i: number, ui: Ui, global: boolean): Row[] {
  const status = partStatus(part.name, part.status, ui);
  const on = status !== 'not-installed';
  const selected = i === ui.part && ui.focus === 'right';
  const changed = global ? partScope(part, ui) !== part.scope : on !== (part.status !== 'not-installed');
  // A part whose files no longer match the Factory is neither installed nor available: `update` fixes it.
  const word = status === 'modified' ? 'modified' : on ? 'installed' : 'available';
  const head: Cell[] = [
    [part.name.padEnd(16), C.bright], [part.type.padEnd(9), C.dim],
    global ? scopeCell(part, status, ui)
      : [`${on ? '●' : '○'} ${word.padEnd(11)}`, status === 'modified' ? C.warning : on ? C.success : C.dim],
  ];
  // One column either way, so what a part is for takes the rest of the row and wraps under it:
  // the pane where a part is chosen is the one that has to say what the part is.
  const tail: Cell[] = [[changed ? '±' : ' ', C.accent]];
  const indent = len(head);
  const room = p.width - indent - len(tail) - 2;
  const body = room >= DESCRIPTION_MIN ? wrap(part.description, room, DESCRIPTION_ROWS) : [];
  return [
    { cells: spread([...head, [body[0] ?? '', C.dim]], tail, p.width), selected },
    ...body.slice(1).map((text): Row => ({ cells: [[' '.repeat(indent), C.dim], [text, C.dim]], selected })),
  ];
}

/** What the pane closes on: a pending change and the way out of it, else the selected part's files —
 *  those only while the pane has the focus, since unfocused it has no selection to speak of. */
function footRows(parts: PartRow[], ui: Ui, changes: string[], global: boolean): Cell[][] {
  if (ui.confirm) {
    return [[['apply: ', C.dim], [changes.join(', '), C.bright], ['   Y ', C.accent], ['Confirm  ', C.dim], ['N ', C.accent], ['Cancel', C.dim]]];
  }
  if (changes.length > 0) return [[['↵ ', C.accent], ['Apply', C.dim], DOT, ['Esc ', C.accent], ['Discard', C.dim]]];
  if (ui.focus !== 'right') return [];
  const part = parts[ui.part];
  return [
    ...(global && part ? [[['recommended ', C.dim], [part.recommended, C.accent]] as Cell[]] : []),
    ...(part?.files ?? []).map((file): Cell[] => [[file, C.dim]]),
  ];
}

/** The rows a short pane can draw: the list is what gets clipped, and the window holds whatever the
 *  selection is on, so `Space` is never pressed on a row that is off the screen. */
function clip(blocks: Row[][], room: number, sel: number): Row[] {
  const size = (from: number, to: number): number => blocks.slice(from, to).reduce((n, b) => n + b.length, 0);
  let start = 0;
  while (start < sel && size(start, sel + 1) > room) start++;
  return blocks.slice(start).flat().slice(0, room);
}

export function partsPane(p: Pane, project: Project, ui: Ui, global: boolean, h: number): void {
  const parts = project.parts;
  const installed = parts.filter((part) => partStatus(part.name, part.status, ui) !== 'not-installed').length;
  const changes = pending(project, ui, global);
  p.row([
    ['PARTS', C.bright], [`  ${project.name}`, C.dim], [`  ${installed}/${parts.length}`, C.dim],
    [changes.length ? `  ±${changes.length}` : '', C.accent],
  ]);
  p.rule();

  // The rule and what stands under it keep the pane's bottom however long the list is: `↵` asks for
  // a `Y` on the apply line, and a confirmation drawn past the foot is one nobody can read.
  const foot = footRows(parts, ui, changes, global);
  const blocks = parts.map((part, i) => partBlock(p, part, i, ui, global));
  for (const { cells, selected } of clip(blocks, Math.max(0, h - 2 - (foot.length ? foot.length + 1 : 0)), ui.part)) p.row(cells, selected);

  if (foot.length === 0) return;
  p.rule();
  for (const cells of foot) p.row(cells);
}
