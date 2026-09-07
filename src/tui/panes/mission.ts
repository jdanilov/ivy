import { C, GLYPH, stateColor, stepColor } from '../theme.js';
import { ago, dur, id, spread, tokens, wrap, type Cell } from '../format.js';
import { runnerLabel } from '../../core/workflow.js';
import type { Pane } from './pane.js';
import type { Mission, Session } from '../model.js';

/** MISSION: the graph of steps over the facts of the run. SESSION: an unbound tab and what it asks. */

/** Who runs a step, and with what: `runnerLabel` is the one place the pair is worded. */
const runner = (s: { role: string } | undefined): string => (s === undefined ? '—' : runnerLabel(s.role));

/** The four facts, label column and value column, so they read as a table without one being drawn. */
const LABEL = 13;
/** `310.2K` and `2h 14m`, plus two cells between them: the two columns a graph row ends in. */
const SPEND_COL = 8;
const TIME_COL = 9;
const DOT: Cell = [' · ', C.rule];

function fact(p: Pane, label: string, cells: Cell[]): void {
  p.row([[label.padEnd(LABEL), C.dim], ...cells]);
}

export function missionPane(p: Pane, m: Mission): void {
  const done = m.steps.filter((s) => s.status === 'done').length;
  p.row(spread([['MISSION', C.bright], [`  ${m.name}`, C.dim]], m.steps.length ? [[`${done}/${m.steps.length}`, C.dim]] : [], p.width));
  p.rule();

  for (const s of m.steps) {
    const cells: Cell[] = [
      [' ', C.dim], [`${GLYPH[s.status]} `, stateColor(s.status)], [s.name.padEnd(12), stepColor(s.kind)],
      [runner(s), C.dim], ...(s.gateOpen ? ([['  ⊘', C.warning]] as Cell[]) : []),
    ];
    const spend = s.tokens ? s.tokens.input + s.tokens.cached + s.tokens.output : 0;
    // A duration is only news for a step that is getting somewhere: skipped and blocked both
    // measure a time nobody wants, and the word is what the row is for.
    const timed = s.status === 'running' || s.status === 'done';
    // Two columns, each right-aligned in its own width: the graph reads down, not ragged.
    const spent = spend ? tokens(spend) : '';
    const took = timed && s.wall ? dur(s.wall) : s.status;
    p.row(spread(cells, [[spent.padStart(SPEND_COL), C.dim], [took.padStart(TIME_COL), C.dim]], p.width));
  }
  if (!m.steps.length) p.row([[' no steps yet', C.dim]]);

  p.rule();
  fact(p, 'step', [[m.step ?? '—', C.bright], DOT, [runner(m.steps.find((s) => s.name === m.step)), C.dim],
    DOT, [`round ${m.round}`, C.dim]]);
  fact(p, 'branch', [[m.branch ?? '—', C.bright], DOT, [`worktree ${m.worktree ?? '—'}`, C.dim]]);
  fact(p, 'session', [[m.preset ?? (m.session ? id(m.session) : '—'), C.bright], DOT,
    [`${m.state}${m.wall ? ` ${dur(m.wall)}` : ''}`, C.dim]]);
  if (m.deviations.length) fact(p, 'deviations', [[`${m.deviations.length}`, C.bright], DOT, [m.deviations.join(' · '), C.dim]]);
}

export function sessionPane(p: Pane, s: Session): void {
  p.row([['SESSION', C.bright], [`  ${s.preset}`, C.dim]]);
  p.rule();
  p.row([['session ', C.dim], [id(s.id), C.bright], [' · idle ', C.dim], [dur(Date.now() - s.idleSince), C.bright]]);
  p.row([['cwd ', C.dim], [s.cwd, C.bright]]);
  p.row([['last ', C.dim], [s.last ? `${s.last.verb}  ${s.last.detail}  ${ago(s.last.at)}` : '—', C.bright]]);
  if (!s.question) return;
  p.rule();
  p.row([['asks', C.warning]]);
  for (const l of wrap(s.question, p.width, 6)) p.row([[l, C.bright]]);
}
