import { C, GLYPH, stateColor, stepColor } from '../theme.js';
import { dur, id, spread, tokens, wrap, type Cell } from '../format.js';
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

/** The step name column, wide enough for the longest name plus the `×N` of a step run again. */
const NAME_COL = 13;

export function missionPane(p: Pane, m: Mission, focused = false): void {
  const done = m.steps.filter((s) => s.status === 'done').length;
  // The title a human gave it rides the header; a stub's stands alone below, where its graph would be.
  const titled: Cell[] = m.title !== m.name && m.steps.length ? [DOT, [m.title, C.dim]] : [];
  p.row(spread([['MISSION', C.bright], [`  ${m.name}`, C.dim], ...titled], m.steps.length ? [[`${done}/${m.steps.length}`, C.dim]] : [], p.width));
  p.rule();
  // A stub has no graph, so the pane says what it is for: the title, then the intent's own why.
  if (!m.steps.length) {
    p.row([[' ', C.dim], [m.title, C.bright]]);
    for (const l of wrap(m.why ?? 'no intent yet', p.width - 1, 6)) p.row([[' ', C.dim], [l, C.dim]]);
    p.rule();
    return;
  }

  for (const s of m.steps) {
    // A step the mission looped back to says so: one run is the norm and carries no mark.
    const again = (s.runs ?? 0) > 1 ? ` ×${s.runs}` : '';
    const cells: Cell[] = [
      [' ', C.dim], [`${GLYPH[s.status]} `, stateColor(s.status)], [s.name, stepColor(s.kind)], [again, C.dim],
      [' '.repeat(Math.max(1, NAME_COL - s.name.length - again.length)), C.dim],
      [runner(s), C.dim], ...(s.gateOpen ? ([['  ⊘', C.warning]] as Cell[]) : []),
    ];
    // What the step itself cost: tokens it added and produced. Cache reads re-send the whole
    // history every turn, so counting them makes a late step look heavier than an early one.
    const spend = s.tokens ? s.tokens.input + s.tokens.output : 0;
    // A duration is only news for a step that is getting somewhere: skipped and blocked both
    // measure a time nobody wants, and the word is what the row is for.
    const timed = s.status === 'running' || s.status === 'done';
    // Two columns, each right-aligned in its own width: the graph reads down, not ragged.
    const spent = spend ? tokens(spend) : '';
    const took = timed && s.wall ? dur(s.wall) : s.status;
    p.row(spread(cells, [[spent.padStart(SPEND_COL), C.dim], [took.padStart(TIME_COL), C.dim]], p.width));
  }
  p.rule();
  // The dial is the one thing this pane changes, so it is the one thing `→` can land on.
  fact(p, 'step', [[m.step ?? '—', C.bright], DOT, [runner(m.steps.find((s) => s.name === m.step)), C.dim],
    DOT, [`round ${m.round}`, C.dim], DOT, ['autonomy ', C.dim], [m.autonomy, C.bright, focused]]);
  fact(p, 'branch', [[m.branch ?? '—', C.bright], DOT, [`worktree ${m.worktree ?? '—'}`, C.dim]]);
  fact(p, 'session', [[m.preset ?? (m.session ? id(m.session) : '—'), C.bright], DOT,
    [`${m.state}${m.wall ? ` ${dur(m.wall)}` : ''}`, C.dim]]);

  // Why the mission left its workflow is worth a line each; a count and an ellipsis said neither.
  if (!m.deviations.length) return;
  p.rule();
  p.row([['DEVIATIONS', C.bright], [`  ${m.deviations.length}`, C.dim]]);
  for (const d of m.deviations) for (const l of wrap(d, p.width - 1, 2)) p.row([[' ', C.dim], [l, C.dim]]);
}

export function sessionPane(p: Pane, s: Session): void {
  p.row([['SESSION', C.bright], [`  ${s.name ?? id(s.id)}`, C.dim], [' · ', C.rule], [s.preset, C.dim]]);
  p.rule();
  p.row([['session ', C.dim], [id(s.id), C.bright], DOT,
    ...(s.busy ? ([['working', C.bright], ...(s.agent ? [DOT, [s.agent, C.dim]] : [])] as Cell[])
      : ([['idle ', C.dim], [dur(Date.now() - s.idleSince), C.bright]] as Cell[]))]);
  p.row([['cwd ', C.dim], [s.cwd, C.bright]]);
  // Its last word, whole: a statement as often as a question, so the label claims neither.
  if (!s.said) return;
  p.rule();
  p.row([['said', C.dim]]);
  for (const l of wrap(s.said, p.width, 6)) p.row([[l, C.bright]]);
}
