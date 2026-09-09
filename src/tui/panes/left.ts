import { C, GLYPH, SESSION, stateColor } from '../theme.js';
import { ago, dur, id, spread, type Cell } from '../format.js';
import { rowTail } from '../../commands/daemon.js';
import { chevron, windowTop, type LeftItem, type Pane, type Ui } from './pane.js';
import type { DaemonRow, Mission, Session, Snapshot } from '../model.js';

/** The left column: the Inbox, the user's own parts, then every project with its daemons, its
 *  missions and its sessions. A row names itself on the left and says where it stands on the
 *  right, so the two read as columns down the pane. */

/** One row: what names it left, where it stands right, the chevron's two cells last. The gap
 *  belongs to the right cells, so a row too long to fit keeps it and the edge cuts the tail
 *  instead of running the name and the tail into one word. */
const rowCells = (width: number, left: Cell[], right: Cell[], selected: boolean, focused: boolean): Cell[] =>
  spread(left, [['  ', C.dim], ...right, chevron(selected, focused)], width);

/** A row under a project stands two cells in from its heading, so a project reads as a block. */
const UNDER: Cell = ['  ', C.dim];

/** What the branch is worth so far. Absent until the first `git diff` behind the snapshot lands. */
function diffCells(m: Mission): Cell[] {
  if (!m.diff) return [];
  return [['  ', C.dim], [`+${m.diff.added}`, C.success], [` −${m.diff.removed}`, C.error]];
}

function missionRow(width: number, m: Mission, selected: boolean, focused: boolean): Cell[] {
  const quiet = m.status !== 'open';
  const left: Cell[] = [
    UNDER, [`${GLYPH[m.state]} `, stateColor(m.state)], [m.name, quiet ? C.dim : C.bright],
    ...(m.status === 'open' && !m.archived
      ? ([['  ', C.dim], [m.workflow, C.dim], ['  ', C.dim], [m.step ?? '—', C.bright],
        [m.round ? ` ↻${m.round}` : '', C.dim], [m.bg ? '  bg' : '', C.dim]] as Cell[])
      : []),
  ];
  // Where the mission stands, right: a word for one that is over, and for an open one its wall
  // time and diff — the tokens are the status bar's, and the row has no room for them.
  const right: Cell[] =
    m.archived ? [['archived', C.dim]]
    : m.status === 'stub' ? [['stub', C.dim]]
    : m.status === 'closed' ? [[`closed ${ago(m.closedAt ?? Date.now())}`, C.dim]]
    : [[dur(m.wall), C.dim], ...diffCells(m)];
  return rowCells(width, left, right, selected, focused);
}

/** Named by what the human called it, else by its id: two bare sessions must not read the same. */
function sessionRow(width: number, s: Session, selected: boolean, focused: boolean): Cell[] {
  // A picker up is the one busy state that waits on the human: it reads as a warning, not as work.
  const asking = s.now?.verb === 'ask';
  const state = asking ? 'asking' : s.busy ? `working${s.agent ? ` · ${s.agent}` : ''}` : `idle ${dur(Date.now() - s.idleSince)}`;
  const left: Cell[] = [
    UNDER, s.busy ? [`${SESSION.working} `, asking ? C.warning : C.accent] : [`${SESSION.idle} `, C.dim],
    [s.name ?? id(s.id), C.bright], [' · ', C.rule], [s.preset, C.dim], [s.bg ? '  bg' : '', C.dim],
    ...(s.name ? ([['  ', C.dim], [id(s.id), C.dim]] as Cell[]) : []),
  ];
  return rowCells(width, left, [[state, C.dim]], selected, focused);
}

/** Warning once something failed, dim while it is off, accent while it runs: the colour is the
 *  state, the glyph the kind — the same reading `factory daemon list` gives the same row. The
 *  failure reads first, so a service the supervisor turned off for dying is not a dim row. */
export function daemonColor(d: DaemonRow): string {
  const s = d.state;
  if (s.alert !== undefined || s.lastStatus === 'fail') return C.warning;
  if (!s.enabled) return C.dim;
  return s.pid === undefined ? C.bright : C.accent;
}

/** A daemon sits in the project's list above its missions: the kind in the glyph, what it does
 *  and what it last did in the tail — `rowTail` is the CLI's, so neither surface drifts. */
function daemonRow(width: number, d: DaemonRow, selected: boolean, focused: boolean): Cell[] {
  const color = daemonColor(d);
  return rowCells(width, [UNDER, [`${d.entry.kind === 'daemon' ? '↻' : '▶'} `, color], [d.entry.name, color]],
    [[rowTail(d), C.dim]], selected, focused);
}

/** One drawn line and whether the selection stands on it: the pane is a window over these, and
 *  the window has to know which line it must keep. A blank and a hint are lines like any other. */
type Row = { cells: Cell[]; here: boolean };

/** Every line the list would draw at full height, in order. */
function listRows(width: number, items: LeftItem[], snap: Snapshot, ui: Ui, focused: boolean): Row[] {
  const rows: Row[] = [];
  const add = (cells: Cell[], here = false): void => { rows.push({ cells, here }); };

  items.forEach((item, i) => {
    const selected = i === ui.left;
    if (item.kind === 'mission') return add(missionRow(width, item.mission, selected, focused), selected);
    if (item.kind === 'session') return add(sessionRow(width, item.session, selected, focused), selected);
    if (item.kind === 'daemon') return add(daemonRow(width, item.daemon, selected, focused), selected);
    const open = snap.inbox.length;
    if (i > 1) add([]); // a blank line between the Inbox, the global row and each project
    const head: Cell[] = item.kind === 'inbox'
      ? [['Inbox', C.bright], [` (${open})`, open ? C.warning : C.dim]]
      : [[item.project.name, C.bright]];
    add(rowCells(width, head, [], selected, focused), selected);
    // Nothing under a heading reads as a screen that failed to load: the hint names the way out,
    // indented where the row it stands in for would be. A session row is something under it.
    const empty = item.kind === 'project'
      && item.project.missions.length === 0 && item.project.sessions.length === 0 && item.project.daemons.length === 0;
    if (empty) add([['  no missions · create one with M', C.dim]]);
    // A manifest nobody can read costs the project its daemons and nothing else: one line, no rows.
    if (item.kind === 'project' && item.project.daemonError) {
      add([[`  daemons.yaml: ${item.project.daemonError}`, C.dim]]);
    }
  });
  if (snap.projects.length === 0) {
    add([]);
    add([['  no projects · factory install <path>', C.dim]]);
  }
  return rows;
}

export function leftPane(p: Pane, items: LeftItem[], snap: Snapshot, ui: Ui, h: number): void {
  const hidden = ui.showArchived
    ? 0 : snap.projects.reduce((n, project) => n + project.missions.filter((m) => m.archived).length, 0);
  p.row([['PROJECTS', C.bright], [hidden ? `  ${hidden} archived hidden` : '', C.dim]]);
  p.rule();

  const focused = ui.focus === 'left';
  const rows = listRows(p.width, items, snap, ui, focused);
  // The header and its rule stay put: the list alone scrolls, under them.
  const room = Math.max(0, h - 2);
  ui.top = windowTop(ui.top, rows.findIndex((line) => line.here), rows.length, room);
  for (const line of rows.slice(ui.top, ui.top + room)) p.row(line.cells, line.here && focused);
}
