import path from 'node:path';
import { C } from '../theme.js';
import { ago, spread, wrap, type Cell } from '../format.js';
import { readLogTail } from '../../core/daemons.js';
import { short } from '../../commands/daemon.js';
import type { Pane, Ui } from './pane.js';
import type { DaemonRow } from '../model.js';

/**
 * DAEMON: the manifest entry as fields, what the last run left behind, then the tail of the log.
 * `l` gives the log the whole pane. Nothing here writes anything — the keys do that, through the
 * same functions `factory daemon` runs.
 */

/** What the detail pane shows under LOG, and what `factory daemon log` prints with no `-n`. */
export const LOG_LINES = 30;
/** What the log view can draw: it fills the pane, and a tall terminal holds more than thirty
 *  rows. The read costs the same either way — `readLogTail` reads the last 64 KB whatever it is
 *  asked for — so the cache holds more lines than any pane can put on screen. */
const READ_LINES = 500;
/** A long line wraps, but a stack trace must not push the newest lines off the pane. */
const WRAP_ROWS = 2;
const LABEL = 9;

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

/** What `l` already read on its way through the CLI's own `daemon log`: the view's first frame
 *  has the lines, and the refresh above takes over from there. It never shortens a tail that is
 *  already longer — the ack reads thirty lines and the view draws more than that. */
export const seedTail = (key: string, lines: string[]): void => {
  if ((tails.get(key) ?? []).length < lines.length) tails.set(key, lines);
};

/** The fixture has no `~/.factory/daemons/` behind it and carries the lines it wants shown. */
const linesOf = (row: DaemonRow, n: number): string[] => (row.log ? row.log.slice(-n) : logTail(row.key, n));

const GLYPH = { ok: '✓', skip: '○', fail: '✗' };
const STATUS = { ok: C.success, skip: C.dim, fail: C.warning };

/** The last `room` rows, and none at all where there is no room: `slice(-0)` is the whole log. */
const lastRows = (rows: string[], room: number): string[] => (room <= 0 ? [] : rows.slice(-room));

const fact = (label: string, cells: Cell[]): Cell[] => [[label.padEnd(LABEL), C.dim], ...cells];

/** `a · b · c` over what is there: a field the entry does not set contributes nothing, and a
 *  number is only ever there or zero. */
const join = (parts: (string | number | false | undefined)[]): string => parts.filter(Boolean).join(' · ');

/** The entry the manifest declares, then the facts the supervisor wrote about it. */
function facts(row: DaemonRow): Cell[][] {
  const { entry: e, state: s } = row;
  const out: Cell[][] = [];

  if (e.description) out.push([[e.description, C.dim]], []);
  out.push(fact('cmd', [[e.cmd, C.bright]]));
  out.push(fact('cwd', [[path.join(row.project, e.cwd ?? '.'), C.dim]]));
  if (e.env) out.push(fact('env', [[Object.entries(e.env).map(([k, v]) => `${k}=${v}`).join(' '), C.dim]]));
  out.push(e.kind === 'daemon'
    ? fact('every', [[join([short(e.every), e.atMost && `at most ${e.atMost.n}/${short(e.atMost.window)}`,
      `when ${e.when}`, e.timeout && `timeout ${short(e.timeout)}`]), C.bright]])
    : fact('run', [[join([e.run, `restart ${e.restart}`, e.port && `port ${e.port}`, s.tabFallback && 'tab→detached']), C.bright]]));

  if (s.pid !== undefined) {
    out.push(fact('pid', [[String(s.pid), C.accent], [s.startedAt ? ` · up ${short(Date.now() - Date.parse(s.startedAt))}` : '', C.dim]]));
  } else if (e.kind === 'service') out.push(fact('pid', [['stopped', C.dim], [s.wanted ? ' · wanted' : '', C.dim]]));

  if (s.lastStatus) {
    const said = join([s.lastSummary, s.lastEnd && ago(Date.parse(s.lastEnd))]);
    out.push(fact('last', [[`${GLYPH[s.lastStatus]} ${s.lastStatus}`, STATUS[s.lastStatus]], [said && ` · ${said}`, C.dim]]));
  }
  if (s.nextDue !== undefined && s.pid === undefined) {
    out.push(fact('next', [[short(Math.max(0, Date.parse(s.nextDue) - Date.now())), C.bright]]));
  }
  if (s.alert !== undefined) out.push(fact('alert', [[s.alert, C.warning]]));
  return out;
}

export function daemonPane(p: Pane, row: DaemonRow, ui: Ui, h: number): void {
  const { entry, state } = row;
  const title = `${entry.kind === 'daemon' ? '↻' : '▶'} ${row.key}`;

  // `l`: the log alone, as much of it as the pane holds, the newest line at the foot.
  if (ui.daemonLog) {
    const lines = linesOf(row, READ_LINES);
    p.row(spread([['LOG', C.bright], [`  ${title}`, C.dim]], [[`${lines.length} lines`, C.dim]], p.width));
    p.rule();
    const rows = lines.flatMap((l) => wrap(l, p.width, WRAP_ROWS));
    for (const l of lastRows(rows, h - 2)) p.row([[l, C.dim]]);
    return;
  }

  const lines: Cell[][] = [
    spread([['DAEMON', C.bright], [`  ${title}`, C.dim]], [[state.enabled ? 'on' : 'off', state.enabled ? C.bright : C.dim]], p.width),
    [['─'.repeat(p.width), C.rule]],
    ...facts(row),
    [],
    [['LOG', C.bright]],
    [['─'.repeat(p.width), C.rule]],
  ];
  for (const cells of lines.slice(0, h)) p.row(cells);

  // Whatever the facts left: the newest lines, the way a tail reads.
  const room = h - lines.length;
  const log = linesOf(row, LOG_LINES).flatMap((l) => wrap(l, p.width, WRAP_ROWS));
  if (log.length === 0 && room > 0) return p.row([['nothing logged yet', C.dim]]);
  for (const l of lastRows(log, room)) p.row([[l, C.dim]]);
}
