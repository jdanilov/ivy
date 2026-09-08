import { C, GLYPH, stateColor } from '../theme.js';
import { ago, dur, id, spread, tokens, type Cell } from '../format.js';
import { marker, type LeftItem, type Pane, type Ui } from './pane.js';
import type { Mission, Session, Snapshot } from '../model.js';

/** The left column: the Inbox, the user's own parts, then every project with its missions and sessions. */

/** What the branch is worth so far. Absent until the first `git diff` behind the snapshot lands. */
function diffCells(m: Mission): Cell[] {
  if (!m.diff) return [];
  return [['  ', C.dim], [`+${m.diff.added}`, C.success], [` −${m.diff.removed}`, C.error]];
}

function missionRow(p: Pane, m: Mission, selected: boolean, focused: boolean): void {
  const quiet = m.status !== 'open';
  const tail: Cell[] =
    m.archived ? [['  archived', C.dim]]
    : m.status === 'stub' ? [['  stub', C.dim]]
    : m.status === 'closed' ? [[`  closed ${ago(m.closedAt ?? Date.now())}`, C.dim]]
    : [['  ', C.dim], [m.workflow, C.dim], ['  ', C.dim], [m.step ?? '—', C.bright], [m.round ? ` ↻${m.round}` : '', C.dim]];
  const right: Cell[] = m.status === 'open'
    ? [[dur(m.wall), C.dim], ['  ', C.dim], [tokens(m.tokens.input + m.tokens.cached + m.tokens.output), C.dim], ...diffCells(m)]
    : [];
  const cells: Cell[] = [marker(selected, focused), [' ', C.dim], [`${GLYPH[m.state]} `, stateColor(m.state)], [m.name, quiet ? C.dim : C.bright]];
  p.row(spread([...cells, ...tail], right, p.width), selected && focused);
}

/** Named by what it is, not by its preset: a bare `quick` under a project reads as a mission. */
/** Named by what the human called it, else by its id: two quick sessions must not read the same. */
function sessionRow(p: Pane, s: Session, selected: boolean, focused: boolean): void {
  const state = s.busy ? `working${s.agent ? ` · ${s.agent}` : ''}` : `idle ${dur(Date.now() - s.idleSince)}`;
  p.row([
    marker(selected, focused), [' ', C.dim], s.busy ? ['● ', C.accent] : ['○ ', C.dim],
    [s.name ?? id(s.id), C.bright], [' · ', C.rule], [s.preset, C.dim],
    ...(s.name ? ([['  ', C.dim], [id(s.id), C.dim]] as Cell[]) : []), [`  ${state}`, C.dim],
  ], selected && focused);
}

export function leftPane(p: Pane, items: LeftItem[], snap: Snapshot, ui: Ui): void {
  const hidden = ui.showArchived
    ? 0 : snap.projects.reduce((n, project) => n + project.missions.filter((m) => m.archived).length, 0);
  p.row([['PROJECTS', C.bright], [hidden ? `  ${hidden} archived hidden` : '', C.dim]]);
  p.rule();

  const focused = ui.focus === 'left';
  items.forEach((item, i) => {
    const selected = i === ui.left;
    if (item.kind === 'mission') return missionRow(p, item.mission, selected, focused);
    if (item.kind === 'session') return sessionRow(p, item.session, selected, focused);
    const open = snap.inbox.length;
    if (i > 1) p.row([]); // a blank line between the Inbox, the global row and each project
    const head: Cell[] = item.kind === 'inbox'
      ? [['Inbox', C.bright], [` (${open})`, open ? C.warning : C.dim]]
      : [[item.project.name, C.bright]];
    p.row([marker(selected, focused), ...head], selected && focused);
    // Nothing under a heading reads as a screen that failed to load: the hint names the way out,
    // indented where the row it stands in for would be. A session row is something under it.
    if (item.kind === 'project' && item.project.missions.length === 0 && item.project.sessions.length === 0) {
      p.row([['   no missions · factory mission new <name>', C.dim]]);
    }
  });
  if (snap.projects.length === 0) {
    p.row([]);
    p.row([['  no projects · factory install <path>', C.dim]]);
  }
}
