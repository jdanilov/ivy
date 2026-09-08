import { C } from '../theme.js';
import { clock, dur, len, spread, wrap, type Cell } from '../format.js';
import { itemKey, type LeftItem, type Pane, type Ui } from './pane.js';
import type { Activity, Decision, Mission, Project, Snapshot } from '../model.js';

/** The pane along the foot: the decisions of whatever is selected, or its sessions' activity. */

const VERB: Record<Activity['verb'], string> = {
  user: C.error, bash: C.dim, edit: C.success, read: C.dim, sub: C.agent, agent: C.bright, ask: C.warning,
  tool: C.dim, stop: C.dim,
};

/** What of a row is the human's or the model's own words, drawn bright; the rest is tooling, dim. */
const SAID = new Set<Activity['verb']>(['user', 'agent', 'ask']);

/** Where a `bash` or `sub` row stands, drawn before its verb: out, back, or back with an error. */
const STATUS: Record<NonNullable<Activity['status']>, [glyph: string, color: string]> = {
  running: ['○', C.dim], ok: ['●', C.success], failed: ['●', C.error],
};

/** A row wraps under its text column to this many lines; a longer command is a paragraph nobody reads here. */
const ACTIVITY_ROWS = 2;

/** `12:25:28` on the words, `+1m 4s` since the last of them on the tooling between: a turn reads
 *  as one clock time and the gaps under it, and a stop shares its agent's second, so it has none. */
const TIME_COL = 8;
const VERB_COL = 5;

/** The two panes name each other: the foot is a pair of tabs, and `A` and `D` are how they switch.
 *  Each carries what came in since it was last open, so the hidden one says whether to look. */
function tabs(ui: Ui, counts: Record<Ui['foot'], number>): Cell[] {
  const tab = (name: Ui['foot']): Cell[] => {
    const fresh = counts[name] - ui.seen[name];
    return [[name.toUpperCase(), ui.foot === name ? C.bright : C.dim], ...(fresh > 0 ? ([[` +${fresh}`, C.warning]] as Cell[]) : [])];
  };
  return [...tab('decisions'), ['  ', C.dim], ...tab('activity')];
}

/** The counts a tab's `+N` is measured from: both reset when the selection changes, since the rows
 *  no longer compare; the pane being left and the one being opened both start from now. */
function markSeen(ui: Ui, here: LeftItem, counts: Record<Ui['foot'], number>): void {
  const at = itemKey(here);
  if (ui.seen.at !== at) ui.seen = { at, foot: null, ...counts };
  if (ui.seen.foot === ui.foot) return;
  if (ui.seen.foot) ui.seen[ui.seen.foot] = counts[ui.seen.foot];
  ui.seen[ui.foot] = counts[ui.foot];
  ui.seen.foot = ui.foot;
}

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

/**
 * Which missions the selection covers: a mission is one, a project its open ones, the Inbox every
 * open one. A closed mission's decisions are its record, read by selecting it; over a project they
 * would bury the live rows under every run that came before.
 */
function missionsOf(snap: Snapshot, here: LeftItem): Mission[] {
  const open = (missions: Mission[]): Mission[] => missions.filter((m) => m.status === 'open');
  return here.kind === 'inbox' ? open(snap.projects.flatMap((project) => project.missions))
    : here.kind === 'mission' ? [here.mission]
    : here.kind === 'project' ? open(here.project.missions) : [];
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

const decisionRows = (snap: Snapshot, here: LeftItem): [string, Decision][] =>
  missionsOf(snap, here).flatMap((m) => m.decisions.map((d): [string, Decision] => [m.name, d]));

function decisionsPane(p: Pane, snap: Snapshot, here: LeftItem, room: number, ui: Ui, counts: Record<Ui['foot'], number>): void {
  const rows = decisionRows(snap, here);
  const waiting = rows.filter(([, d]) => d.status === 'waiting').length;
  const many = missionsOf(snap, here).length > 1;

  p.row(spread(tabs(ui, counts), [[waiting ? `${waiting} waiting  ` : '', C.warning], [`${rows.length}`, C.dim]], p.width));
  p.rule();
  // A wrapped row is more lines than rows, so the scroll and the room are counted in lines.
  const lines = rows.flatMap(([name, d]) => decisionLines(many ? name : null, d, p.width));
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

const activityRows = (snap: Snapshot, owners: Map<string, string>): Activity[] =>
  snap.activity.filter((a) => owners.has(a.session)).sort((a, b) => a.at - b.at);

/** The lines of one row: the time or the gap, the status dot, the verb, then the text wrapped
 *  under its own column. A stop closes its turn with one blank line, so turns read as paragraphs. */
function activityLines(a: Activity, since: number | undefined, owner: string | undefined, width: number): Cell[][] {
  const clocked = a.verb === 'user' || a.verb === 'agent';
  const when = clocked || since === undefined ? clock(a.at) : a.verb === 'stop' ? '' : `+${dur(a.at - since)}`;
  const [glyph, color] = a.status ? STATUS[a.status] : [' ', C.dim];
  const head: Cell[] = [
    [`${when.padStart(TIME_COL)}  `, C.dim], ...(owner === undefined ? [] : ([[owner.padEnd(9), C.dim]] as Cell[])),
    [`${glyph} `, color], [`${a.verb.padEnd(VERB_COL)}  `, VERB[a.verb]],
  ];
  const indent = len(head);
  const tone = SAID.has(a.verb) ? C.bright : C.dim;
  const lines = wrap(a.text, Math.max(20, width - indent), ACTIVITY_ROWS)
    .map((text, i): Cell[] => (i === 0 ? [...head, [text, tone]] : [[' '.repeat(indent), C.dim], [text, tone]]));
  return a.verb === 'stop' ? [...lines, []] : lines;
}

function activityPane(p: Pane, snap: Snapshot, here: LeftItem, room: number, ui: Ui, counts: Record<Ui['foot'], number>): void {
  const owners = sessionsOf(snap, here);
  const rows = activityRows(snap, owners);

  p.row(spread(tabs(ui, counts), [[`${rows.length}`, C.dim]], p.width));
  p.rule();
  // The scroll walks lines, not rows: a wrapped row is two of them. The gap on a tooling row is
  // measured from the last word of its own session, so merged logs do not time each other, and
  // a stop clears it: whatever opens the next turn, a report back as often as a prompt, is clocked.
  const since = new Map<string, number>();
  const lines = rows.flatMap((a): Cell[][] => {
    const out = activityLines(a, since.get(a.session), owners.size > 1 ? owners.get(a.session) : undefined, p.width);
    if (a.verb === 'stop') since.delete(a.session);
    else if (a.verb === 'user' || a.verb === 'agent') since.set(a.session, a.at);
    return out;
  });
  const shown = visible(lines, room, ui);
  for (const line of shown) p.row(line);
  pad(p, shown.length, room);
}

/** The pane along the foot, whichever one `A` and `D` last chose. `F` gives it the whole screen. */
export function footPane(p: Pane, snap: Snapshot, here: LeftItem, h: number, sep: boolean, ui: Ui): void {
  if (sep) p.rule();
  const room = Math.max(0, h - (sep ? 3 : 2));
  const counts = { decisions: decisionRows(snap, here).length, activity: activityRows(snap, sessionsOf(snap, here)).length };
  markSeen(ui, here, counts);
  if (ui.foot === 'activity') return activityPane(p, snap, here, room, ui, counts);
  decisionsPane(p, snap, here, room, ui, counts);
}
