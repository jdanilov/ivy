import { C } from '../theme.js';
import { clock, len, spread, wrap, type Cell } from '../format.js';
import type { LeftItem, Pane, Ui } from './pane.js';
import type { Activity, Decision, Mission, Project, Snapshot } from '../model.js';

/** The pane along the foot: the decisions of whatever is selected, or its sessions' activity. */

const VERB: Record<Activity['verb'], string> = {
  Bash: C.bright, Edit: C.bright, Read: C.dim, Agent: C.agent, Text: C.bright, Ask: C.warning,
  Tool: C.dim, Stop: C.success,
};

/** The two panes name each other: the foot is a pair of tabs, and `A` and `D` are how they switch. */
const tabs = (ui: Ui): Cell[] => [
  ['DECISIONS', ui.foot === 'decisions' ? C.bright : C.dim], ['  ', C.dim],
  ['ACTIVITY', ui.foot === 'activity' ? C.bright : C.dim],
];

/** Newest last, oldest scrolled off: both foot panes read the way they were written, and `↑↓`
 *  walk back through them while the foot is full. The clamp lives here because only this knows
 *  the room, and the pad below keeps the rule under the pane on its own row. */
function visible<T>(rows: T[], room: number, ui: Ui): T[] {
  ui.scroll = ui.full ? Math.max(0, Math.min(ui.scroll, rows.length - room)) : 0;
  const end = rows.length - ui.scroll;
  return rows.slice(Math.max(0, end - room), end);
}

const pad = (p: Pane, shown: number, room: number): void => {
  for (let i = shown; i < room; i++) p.row([]);
};

/** Which missions the selection covers: a mission is one, a project its own, the Inbox every one. */
function missionsOf(snap: Snapshot, here: LeftItem): Mission[] {
  return here.kind === 'inbox' ? snap.projects.flatMap((project) => project.missions)
    : here.kind === 'mission' ? [here.mission]
    : here.kind === 'project' ? here.project.missions : [];
}

/** Where a decision stands, left of its id. A question the human still owes an answer to is the
 *  only thing here that is not settled, so it is the only glyph that is not a verdict. */
const VERDICT: Record<Decision['status'], [glyph: string, color: string]> = {
  waiting: ['?', C.error], accepted: ['✓', C.success], overruled: ['✗', C.error], auto: ['✓', C.dim],
};

/** A summary long enough to need a fifth row is a paragraph nobody reads off a foot pane. */
const SUMMARY_ROWS = 4;

/**
 * `✓ D15 what was decided`: the verdict, the id, then the decision itself. The summary wraps under
 * its own column instead of being cut, so a row copies whole into the session that answers it. An
 * `auto` row is a record, not a question, so it reads dim end to end.
 */
function decisionLines(mission: string | null, d: Decision, width: number): Cell[][] {
  const auto = d.status === 'auto';
  const [glyph, color] = VERDICT[d.status];
  const head: Cell[] = [
    [`${glyph} `, color], [d.id.padEnd(5), auto ? C.dim : C.bright],
    ...(mission === null ? [] : ([[mission.padEnd(10), C.dim]] as Cell[])),
  ];
  // An overruled row without its note reads as a verdict with no reason.
  const said = d.status === 'overruled' && d.note !== '' ? `${d.summary} — ${d.note}` : d.summary;
  const indent = len(head);
  const body = wrap(said, Math.max(20, width - indent), SUMMARY_ROWS);
  return body.map((text, i): Cell[] => i === 0
    ? [...head, [text, auto ? C.dim : C.bright]]
    : [[' '.repeat(indent), C.dim], [text, auto ? C.dim : C.bright]]);
}

function decisionsPane(p: Pane, snap: Snapshot, here: LeftItem, room: number, ui: Ui): void {
  const missions = missionsOf(snap, here);
  const rows = missions.flatMap((m) => m.decisions.map((d): [string, Decision] => [m.name, d]));
  const waiting = rows.filter(([, d]) => d.status === 'waiting').length;

  p.row(spread(tabs(ui), [[waiting ? `${waiting} waiting  ` : '', C.warning], [`${rows.length}`, C.dim]], p.width));
  p.rule();
  // A wrapped row is more lines than rows, so the scroll and the room are counted in lines.
  const lines = rows.flatMap(([name, d]) => decisionLines(missions.length > 1 ? name : null, d, p.width));
  const shown = visible(lines, room, ui);
  for (const cells of shown) p.row(cells);
  if (rows.length === 0) p.row([['no decisions filed yet', C.dim]]);
  pad(p, Math.max(shown.length, 1), room);
}

/** Which sessions the selection covers, and what to call each one in the mission column. */
function sessionsOf(snap: Snapshot, here: LeftItem): Map<string, string> {
  const map = new Map<string, string>();
  const add = (project: Project): void => {
    for (const m of project.missions) if (m.session) map.set(m.session, m.name);
    for (const session of project.sessions) map.set(session.id, session.preset);
  };
  if (here.kind === 'inbox') snap.projects.forEach(add);
  else if (here.kind === 'project') add(here.project);
  else if (here.kind === 'mission') { if (here.mission.session) map.set(here.mission.session, here.mission.name); }
  else if (here.kind === 'session') map.set(here.session.id, here.session.preset);
  return map;
}

function activityPane(p: Pane, snap: Snapshot, here: LeftItem, room: number, ui: Ui): void {
  const owners = sessionsOf(snap, here);
  const rows = snap.activity.filter((a) => owners.has(a.session)).sort((a, b) => a.at - b.at);
  const merged = owners.size > 1;

  p.row(spread(tabs(ui), [[`${rows.length}`, C.dim]], p.width));
  p.rule();
  const shown = visible(rows, room, ui);
  for (const a of shown) {
    p.row([
      [`${clock(a.at)}  `, C.dim], ...(merged ? ([[(owners.get(a.session) ?? '').padEnd(9), C.dim]] as Cell[]) : []),
      [a.verb.padEnd(7), VERB[a.verb]], [a.text, a.verb === 'Text' || a.verb === 'Ask' ? C.bright : C.dim],
    ]);
  }
  pad(p, shown.length, room);
}

/** The pane along the foot, whichever one `A` and `D` last chose. `F` gives it the whole screen. */
export function footPane(p: Pane, snap: Snapshot, here: LeftItem, h: number, sep: boolean, ui: Ui): void {
  if (sep) p.rule();
  const room = Math.max(0, h - (sep ? 3 : 2));
  if (ui.foot === 'activity') return activityPane(p, snap, here, room, ui);
  decisionsPane(p, snap, here, room, ui);
}
