import { C } from '../theme.js';
import { clock, len, spans, spread, wrap, wrapCells, type Cell } from '../format.js';
import { readLogTail } from '../../core/daemons.js';
import { itemKey, type LeftItem, type Pane, type Ui } from './pane.js';
import type { Activity, DaemonRow, Decision, Mission, Project, Snapshot } from '../model.js';

/** The pane along the foot: the activity of whatever is selected's sessions, its decisions, or —
 *  on a daemon or a service row, which has no session and so no activity — the tail of its log. */

const VERB: Record<Activity['verb'], string> = {
  user: C.error, bash: C.dim, edit: C.success, read: C.dim, sub: C.agent, agent: C.bright, ask: C.warning,
  tool: C.dim, stop: C.dim,
};

/** What of a row is the human's or the model's own words, drawn bright; the rest is tooling, dim. */
const SAID = new Set<Activity['verb']>(['user', 'agent', 'ask']);

/** Where a `bash` or `sub` row stands, drawn where its text starts: out, back, or back with an error. */
const STATUS: Record<NonNullable<Activity['status']>, [glyph: string, color: string]> = {
  running: ['○', C.dim], ok: ['●', C.success], failed: ['●', C.error],
};

/** A row wraps under its text column to this many lines; a longer command is a paragraph nobody
 *  reads here. The last few `agent` rows are the exception: what the model just said is what the
 *  pane is opened for, so those stand whole, line breaks and all, up to a cap that keeps one
 *  report from being the whole foot. */
const ACTIVITY_ROWS = 2;
const WHOLE_ROWS = 40;
const WHOLE_LAST = 3;

/** `12:25:28` on the words, `+1:04` since the last of them on the tooling between: a turn reads
 *  as one clock time and the gaps under it, and a stop shares its agent's second, so it has none. */
const TIME_COL = 8;
const VERB_COL = 5;

/** `+7s`, `+1:04`, `+1:02:03`: a gap in the shape a stopwatch shows it, so a column of them scans. */
function gap(ms: number): string {
  const s = Math.round(ms / 1000);
  const two = (n: number): string => String(n).padStart(2, '0');
  if (s < 60) return `+${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `+${m}:${two(s % 60)}` : `+${Math.floor(m / 60)}:${two(m % 60)}:${two(s % 60)}`;
}

/** The two panes name each other: the foot is a pair of tabs, and `A` and `D` are how they switch.
 *  Each carries what came in since it was last open, so the hidden one says whether to look.
 *  On a daemon row the first tab is that row's log, whose word does not start with its key, so
 *  the key stands before it: the bright first letter is always the key that opens the tab. */
function tabs(ui: Ui, counts: Record<Ui['foot'], number>, log: boolean): Cell[] {
  const tab = (name: Ui['foot']): Cell[] => {
    const fresh = counts[name] - ui.seen[name];
    const word = log && name === 'activity' ? 'A LOG' : name.toUpperCase();
    return [[word[0]!, C.bright], [word.slice(1), ui.foot === name ? C.bright : C.dim],
      ...(fresh > 0 ? ([[` +${fresh}`, C.warning]] as Cell[]) : [])];
  };
  return [...tab('activity'), ['  ', C.dim], ...tab('decisions')];
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
  ui.scroll = ui.size === 'full' ? Math.max(0, Math.min(ui.scroll, rows.length - room)) : 0;
  const end = rows.length - ui.scroll;
  return rows.slice(Math.max(0, end - room), end);
}

const pad = (p: Pane, shown: number, room: number): void => {
  for (let i = shown; i < room; i++) p.row([]);
};

/**
 * Which missions the selection covers: a mission is one, a project its open ones, the Inbox and
 * Global every open one — both rows stand for every project at once. A closed mission's decisions
 * are its record, read by selecting it; over a project they would bury the live rows under every
 * run that came before.
 */
function missionsOf(snap: Snapshot, here: LeftItem): Mission[] {
  const open = (missions: Mission[]): Mission[] => missions.filter((m) => m.status === 'open');
  return here.kind === 'inbox' || here.kind === 'global' ? open(snap.projects.flatMap((project) => project.missions))
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

  p.row(spread(tabs(ui, counts, here.kind === 'daemon'), [[waiting ? `${waiting} waiting  ` : '', C.warning], [`${rows.length}`, C.dim]], p.width));
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
  if (here.kind === 'inbox' || here.kind === 'global') snap.projects.forEach(add);
  else if (here.kind === 'project') add(here.project);
  else if (here.kind === 'mission') { if (here.mission.session) map.set(here.mission.session, here.mission.name); }
  else if (here.kind === 'session') map.set(here.session.id, here.session.preset);
  return map;
}

const activityRows = (snap: Snapshot, owners: Map<string, string>): Activity[] =>
  snap.activity.filter((a) => owners.has(a.session)).sort((a, b) => a.at - b.at);

/** A `sub` row's text is `→ Commit · what it was asked`: the name is what the eye scans for. */
function subCells(text: string): Cell[] {
  const at = text.indexOf(' · ');
  return at === -1 ? [[text, C.bright]] : [[text.slice(0, at), C.bright], [text.slice(at), C.dim]];
}

/** A `code` span in prose is a name the reader can go open: drawn blue, the backticks dropped. A
 *  span cut by the wrap carries into the next line through `open`; a new source line closes it.
 *  Backticks, not the log's own escapes, which are `format.ts`'s `spans`. */
function codeSpans(line: string, tone: string, open: boolean): { cells: Cell[]; open: boolean } {
  const cells: Cell[] = [];
  for (const part of line.split('`')) {
    if (part !== '') cells.push([part, open ? C.agent : tone]);
    open = !open;
  }
  return { cells, open: !open };
}

/** Wrapped lines of one row, each split into its spans. `whole` wraps per source line, so the
 *  code state is reset there; the fold treats the text as one line. */
function prose(text: string, room: number, tone: string, full: boolean): Cell[][] {
  const out: Cell[][] = [];
  let open = false;
  const sources = full ? text.split('\n') : [text.replace(/\s+/g, ' ')];
  for (const source of sources) {
    if (out.length >= WHOLE_ROWS) break;
    if (full && source.trim() === '') { if (out.at(-1)?.length !== 0) out.push([]); continue; }
    open = false;
    for (const line of wrap(source, room, full ? WHOLE_ROWS - out.length : ACTIVITY_ROWS)) {
      const next = codeSpans(line, tone, open);
      out.push(next.cells);
      open = next.open;
    }
  }
  return out;
}

/** The lines of one row: the time or the gap, the verb, then the status dot and the text wrapped
 *  under its own column. A stop closes its turn with one blank line, so turns read as paragraphs. */
function activityLines(a: Activity, since: number | undefined, owner: string | undefined, width: number, full: boolean): Cell[][] {
  const clocked = a.verb === 'user' || a.verb === 'agent';
  const when = clocked || since === undefined ? clock(a.at) : a.verb === 'stop' ? '' : gap(a.at - since);
  const head: Cell[] = [
    [`${when.padStart(TIME_COL)}  `, C.dim], ...(owner === undefined ? [] : ([[owner.padEnd(9), C.dim]] as Cell[])),
    [`${a.verb.padEnd(VERB_COL)}  `, VERB[a.verb]], ...(a.status ? ([[`${STATUS[a.status][0]} `, STATUS[a.status][1]]] as Cell[]) : []),
  ];
  const indent = len(head);
  const room = Math.max(20, width - indent);
  if (a.verb === 'sub') return [[...head, ...subCells(a.text)]];
  const tone = SAID.has(a.verb) ? C.bright : C.dim;
  const body = SAID.has(a.verb) ? prose(a.text, room, tone, full) : wrap(a.text, room, ACTIVITY_ROWS).map((text): Cell[] => [[text, tone]]);
  const lines = body.map((cells, i): Cell[] => (i === 0 ? [...head, ...cells] : [[' '.repeat(indent), C.dim], ...cells]));
  return a.verb === 'stop' ? [...lines, []] : lines;
}

function activityPane(p: Pane, snap: Snapshot, here: LeftItem, room: number, ui: Ui, counts: Record<Ui['foot'], number>): void {
  const owners = sessionsOf(snap, here);
  const rows = activityRows(snap, owners);

  p.row(spread(tabs(ui, counts, false), [[`${rows.length}`, C.dim]], p.width));
  p.rule();
  // The scroll walks lines, not rows: a wrapped row is two of them. The gap on a tooling row is
  // measured from the last word of its own session, so merged logs do not time each other, and
  // a stop clears it: whatever opens the next turn, a report back as often as a prompt, is clocked.
  const since = new Map<string, number>();
  const recent = new Set(rows.filter((a) => a.verb === 'agent').slice(-WHOLE_LAST));
  const lines = rows.flatMap((a): Cell[][] => {
    const out = activityLines(a, since.get(a.session), owners.size > 1 ? owners.get(a.session) : undefined, p.width, recent.has(a));
    if (a.verb === 'stop') since.delete(a.session);
    else if (a.verb === 'user' || a.verb === 'agent' || !since.has(a.session)) since.set(a.session, a.at);
    return out;
  });
  const shown = visible(lines, room, ui);
  for (const line of shown) p.row(line);
  pad(p, shown.length, room);
}

// ── the log of a daemon row ────────────────────────────────────────────

/** What the foot can draw of a log: it fills the screen when the foot is full, and a tall
 *  terminal holds more than a screenful of scrollback. The read costs the same either way —
 *  `readLogTail` reads the last 64 KB whatever it is asked for. */
const READ_LINES = 500;
/** A long line wraps, but a stack trace must not push the newest lines off the pane. */
const WRAP_ROWS = 2;

const tails = new Map<string, string[]>();
const reading = new Set<string>();

/**
 * The log from behind the frame: `render` is synchronous, so the read is started here and lands
 * on a later frame — the screen redraws every second, so the tail is never more than that old.
 */
export function logTail(key: string, n: number): string[] {
  if (!reading.has(key)) {
    reading.add(key);
    void readLogTail(key, READ_LINES)
      .then((lines) => tails.set(key, lines))
      .catch(() => tails.set(key, []))
      .finally(() => reading.delete(key));
  }
  return (tails.get(key) ?? []).slice(-n);
}

/** What `A` already read on its way through the CLI's own `daemon log`: the first frame after the
 *  key has the lines, and the refresh above takes over from there. It never shortens a tail that
 *  is already longer — the ack reads thirty lines and the pane draws more than that. */
export const seedTail = (key: string, lines: string[]): void => {
  if ((tails.get(key) ?? []).length < lines.length) tails.set(key, lines);
};

/** The fixture has no `~/.factory/daemons/` behind it and carries the lines it wants shown. */
const linesOf = (row: DaemonRow, n: number): string[] => (row.log ? row.log.slice(-n) : logTail(row.key, n));

/** The tail as the terminal wrote it, colours and all, newest at the foot: what `factory daemon
 *  log` prints, in the pane the same key acknowledged the row's alert from. */
function logPane(p: Pane, lines: string[], room: number, ui: Ui, counts: Record<Ui['foot'], number>): void {
  p.row(spread(tabs(ui, counts, true), [[`${lines.length}`, C.dim]], p.width));
  p.rule();
  const rows = lines.flatMap((l) => wrapCells(spans(l, C.dim), p.width, WRAP_ROWS));
  const shown = visible(rows, room, ui);
  for (const cells of shown) p.row(cells);
  if (rows.length === 0) p.row([['nothing logged yet', C.dim]]);
  pad(p, Math.max(shown.length, 1), room);
}

/**
 * The pane along the foot, whichever one `A` and `D` last chose, ACTIVITY to begin with; the same
 * key again gives it the whole screen, and once more leaves the tab row alone — a foot minimised
 * is still the row that says whether anything came in.
 */
export function footPane(p: Pane, snap: Snapshot, here: LeftItem, h: number, sep: boolean, ui: Ui): void {
  if (sep) p.rule();
  const log = here.kind === 'daemon' ? linesOf(here.daemon, READ_LINES) : null;
  const room = Math.max(0, h - (sep ? 3 : 2));
  const counts = {
    decisions: decisionRows(snap, here).length,
    activity: log ? log.length : activityRows(snap, sessionsOf(snap, here)).length,
  };
  markSeen(ui, here, counts);
  if (ui.size === 'min') return p.row(spread(tabs(ui, counts, log !== null), [[`${counts[ui.foot]}`, C.dim]], p.width));
  if (ui.foot === 'decisions') return decisionsPane(p, snap, here, room, ui, counts);
  if (log) return logPane(p, log, room, ui, counts);
  activityPane(p, snap, here, room, ui, counts);
}
