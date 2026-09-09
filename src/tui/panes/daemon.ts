import path from 'node:path';
import { C } from '../theme.js';
import { ago, spread, type Cell } from '../format.js';
import { short } from '../../commands/daemon.js';
import type { Pane } from './pane.js';
import type { DaemonRow } from '../model.js';

/**
 * DAEMON, or SERVICE: the manifest entry as fields and what the last run left behind. The log is
 * the foot's, under `A`. Nothing here writes anything — the keys do that, through the same
 * functions `factory daemon` runs.
 */

const LABEL = 9;

const GLYPH = { ok: '✓', skip: '○', fail: '✗' };
const STATUS = { ok: C.success, skip: C.dim, fail: C.warning };

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
  } else if (e.kind === 'service') out.push(fact('pid', [['stopped', C.dim]]));

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

/** The word over the pane is the kind of row it is: a service is never a daemon on the screen,
 *  whatever the manifest calls the family. */
export function daemonPane(p: Pane, row: DaemonRow, h: number): void {
  const { entry, state } = row;
  const title = `${entry.kind === 'daemon' ? '↻' : '▶'} ${row.key}`;
  const lines: Cell[][] = [
    spread([[entry.kind === 'daemon' ? 'DAEMON' : 'SERVICE', C.bright], [`  ${title}`, C.dim]],
      [[state.enabled ? 'on' : 'off', state.enabled ? C.bright : C.dim]], p.width),
    [['─'.repeat(p.width), C.rule]],
    ...facts(row),
  ];
  for (const cells of lines.slice(0, h)) p.row(cells);
}
