import { BoxRenderable, createCliRenderer, type CliRenderer, type KeyEvent } from '@opentui/core';
import path from 'node:path';
import { C, GLYPH, stateColor } from './theme.js';
import { dur, id, len, spread, tokens, type Cell } from './format.js';
import { column, newUi, select, type LeftItem, type Pane, type Ui } from './panes/pane.js';
import { leftPane } from './panes/left.js';
import { messagesPane } from './panes/messages.js';
import { missionPane, sessionPane } from './panes/mission.js';
import { partsPane, pending } from './panes/parts.js';
import { footPane } from './panes/foot.js';
import { helpPane } from './panes/help.js';
import { onKey } from './keys.js';
import type { Mission, Session, Snapshot } from './model.js';

/** Chrome rows: blank, header, rule, status, rule — rule, key bar. The key bar sits on the last
 *  terminal row: a row left undrawn under it reads as a gap the screen forgot to fill. */
const CHROME = 7;
/** Full activity keeps the blank row, the rule and the key bar, and gives the log everything else. */
const FULL_CHROME = 3;
/** Factory's own mark. Single-width in a monospace font, unlike most of the geometric glyphs. */
const BRAND = '⌬';

// ── header, status bar, key bar ───────────────────────────────────────────────

/** The mode is what the human chose, the bracket what the machine is actually doing. */
function awake(snap: Snapshot): boolean {
  const running = snap.projects.some((project) => project.missions.some((m) => m.state === 'running'));
  return snap.caffeinate === 'on' || (snap.caffeinate === 'auto' && running);
}

function caffeinateCells(snap: Snapshot): Cell[] {
  const on = awake(snap);
  return [['caffeinate ', C.dim], [snap.caffeinate.toUpperCase(), C.bright], [` [${on ? 'ON' : 'OFF'}]`, on ? C.accent : C.dim]];
}

function header(p: Pane, here: LeftItem, snap: Snapshot): void {
  const where = here.kind === 'inbox' ? 'all projects' : here.project.path;
  const left: Cell[] = [[`${BRAND} `, C.accent], ['FACTORY', C.accent], ['  ', C.dim], [where, C.dim]];
  p.row(spread(left, caffeinateCells(snap), p.width));
}

/** The bar is a third of the line at most, and only what the words on either side leave. */
const barRoom = (p: Pane, used: number): number => Math.min(Math.floor(p.width * 0.3), p.width - used - 6);

/** Missions of one project, or of all of them when the Inbox is selected: a bar over what they
 *  are, then the counts as the legend that names its colours. */
function summary(p: Pane, missions: Mission[]): void {
  const closed = missions.filter((m) => m.status === 'closed').length;
  const stub = missions.filter((m) => m.status === 'stub').length;
  const counts: [string, number, string][] = [
    ['running', missions.filter((m) => m.state === 'running').length, C.warning],
    ['waiting', missions.filter((m) => m.state === 'blocked').length, C.warning],
    ['stub', stub, C.track],
    ['closed', closed, C.success],
  ];
  const legend: Cell[] = counts.filter(([, n]) => n > 0).flatMap(([word, n], i): Cell[] =>
    [...(i ? ([[' · ', C.rule]] as Cell[]) : []), [`${n} `, C.dim], [word, C.dim]]);

  const bar = barRoom(p, len(legend));
  if (missions.length === 0 || bar <= 0) return p.row(legend);
  // Each mission is one segment: closed behind it, stub not started yet, everything else open.
  const width = (n: number): number => Math.round((bar * n) / missions.length);
  const green = width(closed);
  const grey = width(stub);
  p.row([['█'.repeat(green), C.success], ['█'.repeat(Math.max(0, bar - green - grey)), C.warning],
    ['█'.repeat(grey), C.track], ['  ', C.dim], ...legend]);
}

/** The state word varies in width and the bar behind it would move with it. */
const STATE_W = 8;

function missionBar(p: Pane, m: Mission): void {
  const total = m.steps.length;
  const done = m.steps.filter((s) => s.status === 'done').length;
  const word = m.status === 'stub' ? 'STUB' : m.status === 'closed' ? 'CLOSED' : m.state.toUpperCase();
  // A mission open and not started is waiting on the human, where a pending step is only next in line.
  const color = word === 'PENDING' ? C.warning : stateColor(m.state);
  const left: Cell[] = [[`${GLYPH[m.state]} `, color], [word.padEnd(STATE_W), C.bright]];
  const count: Cell[] = total ? [['  ', C.dim], [`${done}/${total}`, C.bright]] : [];
  const metrics: Cell[] = [
    ['autonomy ', C.dim], [m.autonomy, C.dim], ['   ', C.dim],
    ['TIME ', C.dim], [dur(m.wall), C.bright], [' · ', C.rule],
    ['In ', C.dim], [tokens(m.tokens.input), C.bright], [' · ', C.rule],
    ['Cached ', C.dim], [tokens(m.tokens.cached), C.bright], [' · ', C.rule],
    ['Out ', C.dim], [tokens(m.tokens.output), C.bright],
  ];

  const bar = barRoom(p, len(left) + len(count) + len(metrics));
  const fill = total && bar > 0 ? Math.round((bar * done) / total) : 0;
  const middle: Cell[] = total && bar > 0
    ? [['  ', C.dim], ['█'.repeat(fill), C.success], ['█'.repeat(bar - fill), C.track]] : [];
  p.row(spread([...left, ...middle, ...count], metrics, p.width));
}

/** A session has no steps to bar: its state word, then whose tab it is and how long it has waited. */
function sessionBar(p: Pane, s: Session): void {
  const word = s.busy ? 'WORKING' : 'IDLE';
  const left: Cell[] = [s.busy ? [`${GLYPH.running} `, C.accent] : [`${GLYPH.pending} `, C.dim], [word.padEnd(STATE_W), C.bright],
    ['  ', C.dim], [s.name ?? id(s.id), C.bright], [' · ', C.rule], [s.preset, C.dim], [' · ', C.rule], [s.cwd, C.dim]];
  const right: Cell[] = s.busy ? (s.agent ? [[s.agent, C.bright]] : []) : [['since ', C.dim], [dur(Date.now() - s.idleSince), C.bright]];
  p.row(spread(left, right, p.width));
}

function statusBar(p: Pane, snap: Snapshot, here: LeftItem, ui: Ui): void {
  // The one line the screen takes typing on: what the key asked for, then what has been typed.
  if (ui.input) return p.row([[`${ui.input.label} `, C.dim], [ui.input.value, C.bright], ['▏', C.accent]]);
  if (ui.toast) return p.row([[ui.toast, C.dim]]);
  if (here.kind === 'mission') return missionBar(p, here.mission);
  if (here.kind === 'session') return sessionBar(p, here.session);
  if (here.kind === 'inbox') return summary(p, snap.projects.flatMap((project) => project.missions));
  if (here.kind === 'global') {
    const on = here.project.parts.filter((part) => part.status !== 'not-installed').length;
    return p.row([[`${on}/${here.project.parts.length} `, C.bright], ['installed in ', C.dim],
      [path.join(here.project.path, '.claude'), C.bright], ['  ·  the user\'s own parts, in every project', C.dim]]);
  }
  return summary(p, here.project.missions);
}

/** What each kind of row answers. The bar lists only these, so it never offers a key whose whole
 *  reply would be a toast saying the row is the wrong kind. */
const ROW_KEYS: Record<LeftItem['kind'], string[]> = {
  inbox: [], global: [], project: ['M'], mission: ['O', 'X', 'T', 'H', 'N'], session: ['X', 'N'],
};
const ROW_PAIRS: string[][] = [['O', 'Tab'], ['X', 'Kill'], ['T', 'Autonomy'], ['H', 'Archive'], ['N', 'Rename'], ['M', 'New']];

/** Keys read uppercase and are pressed either way; `?` is the first thing dropped when the
 *  terminal is too narrow, because the overlay it opens lists everything anyway. */
function keyBar(p: Pane, here: LeftItem, ui: Ui): void {
  const right = ui.focus === 'right';
  const parts = here.kind === 'project' || here.kind === 'global';
  const foot: string[][] = ui.foot === 'decisions' ? [['A', 'Activity'], ['F', 'Full']] : [['D', 'Decisions'], ['F', 'Full']];
  const pairs: string[][] =
    // The panel and the full foot each take the screen: their bars list what still answers.
    ui.input ? [['↵', 'Done'], ['esc', 'Cancel']] :
    ui.help ? [['? esc', 'Back'], ['Q', 'Quit']] :
    ui.full ? [['↑↓', 'Scroll'], ['↵ f esc', 'Back'], ['Q', 'Quit']] :
    !right ? [['↑↓', 'Select'], ['↵', 'Open'], ...ROW_PAIRS.filter(([key]) => ROW_KEYS[here.kind].includes(key!)),
      ['Z', 'Archived'], ['C', 'Caffeinate'], ...foot, ['?', 'Help'], ['Q', 'Quit']]
    : here.kind === 'inbox' ? [['↑↓', 'Select'], ['←esc', 'Back'], ...foot, ['?', 'Help'], ['Q', 'Quit']]
    : parts && ui.confirm ? [['Y', 'Confirm'], ['N', 'Cancel'], ['esc', 'Back'], ['Q', 'Quit']]
    // Space picks the scope on the global row and the install on a project's: one key, two panes.
    : parts ? [['↑↓', 'Select'], ['Space', here.kind === 'global' ? 'Scope' : 'Toggle'], ['↵', 'Apply'],
      ...(pending(here.project, ui, here.kind === 'global').length ? [['R', 'Reset'], ['esc', 'Discard']] : [['←esc', 'Back']]), ['?', 'Help'], ['Q', 'Quit']]
    // The mission pane has one thing to focus, and the row it sits on is the autonomy dial.
    : [...(here.kind === 'mission' ? [['→ T', 'Autonomy']] : []),
      ['←esc', 'Back'], ['C', 'Caffeinate'], ...foot, ['?', 'Help'], ['Q', 'Quit']];

  const cells = (list: string[][]): Cell[] =>
    list.flatMap(([key, label]) => [[`${key} `, C.bright], [`${label}  `, C.dim]] as Cell[]);
  const full = cells(pairs);
  p.row(len(full) <= p.width ? full : cells(pairs.filter(([key]) => key !== '?')));
}

// ── render ────────────────────────────────────────────────────────────────────

export function render(r: CliRenderer, snap: Snapshot, ui: Ui): void {
  // remove() detaches without freeing the native text buffer and yoga node behind every row:
  // a few hundred keypresses exhaust the allocator and the process dies. destroy frees them.
  // The copy matters: destroy() takes the child out of the live array we would be walking.
  for (const child of [...r.root.getChildren()]) child.destroyRecursively();

  const w = r.terminalWidth - 2;
  const { items, here } = select(snap, ui);

  // Everything under the status rule and above the key-bar rule. The foot keeps a third of it,
  // the columns take the rest — and either one takes all of it: `f` gives the foot the screen,
  // `?` gives the body to the panel, which needs the height to say anything worth reading.
  const region = Math.max(0, r.terminalHeight - (ui.full ? FULL_CHROME : CHROME));
  const actH = ui.full ? region : ui.help ? 0 : Math.min(region, Math.max(5, Math.floor(region / 3)));
  const bodyH = region - actH;

  // Two blank columns down the left and none anywhere else: the key bar sits on the last row and
  // no box carries a background, so every cell the screen does not colour keeps the terminal's own.
  const root = column(r, w, { width: r.terminalWidth, height: r.terminalHeight, paddingLeft: 2, paddingRight: 0 });
  root.row([]);
  // A full-height foot is that pane and nothing else: the header and the status bar are rows it can have.
  if (!ui.full) {
    header(root, here, snap);
    root.rule();
    statusBar(root, snap, here, ui);
    root.rule();
  }

  if (bodyH > 0) {
    const leftW = Math.max(30, Math.floor(w * 0.4));
    const rightW = w - leftW - 1;
    const body = new BoxRenderable(r, { flexDirection: 'row', height: bodyH, flexShrink: 0, overflow: 'hidden' });
    // Two cells of padding keep the left pane's right-aligned tokens off the divider.
    const left = column(r, leftW - 2, { width: leftW, paddingRight: 2 });
    const right = column(r, rightW - 1, { width: rightW, paddingLeft: 1 });
    leftPane(left, items, snap, ui);
    if (ui.help) helpPane(right, bodyH);
    else if (here.kind === 'inbox') messagesPane(right, snap, ui, bodyH);
    else if (here.kind === 'project' || here.kind === 'global') partsPane(right, here.project, ui, here.kind === 'global', bodyH);
    else if (here.kind === 'mission') missionPane(right, here.mission, ui.focus === 'right');
    else sessionPane(right, here.session);
    body.add(left.box);
    const divider = column(r, 1, { width: 1, flexShrink: 0 });
    for (let i = 0; i < bodyH; i++) divider.row([['│', C.rule]]);
    body.add(divider.box);
    body.add(right.box);
    root.box.add(body);
  }
  if (actH > 0) footPane(root, snap, here, actH, bodyH > 0, ui);

  root.rule();
  keyBar(root, here, ui);
  r.root.add(root.box);
}

// ── the screen as one thing ───────────────────────────────────────────────────

/** The screen as one thing a key can act on: the snapshot moves under it, the Ui persists. */
export interface App { r: CliRenderer; ui: Ui; snap: Snapshot }

export const draw = (app: App): void => render(app.r, app.snap, app.ui);

/** Only the newest toast clears itself: an action's result must not be wiped by its own "doing". */
let toasted = 0;

export function toast(app: App, text: string): void {
  app.ui.toast = text;
  const mine = ++toasted;
  draw(app);
  setTimeout(() => {
    if (mine !== toasted) return;
    app.ui.toast = null;
    draw(app);
  }, 2000);
}

/** An action touches the disk while the screen keeps drawing: it says what it started, then how it
 *  ended. The files it wrote reach the screen through the next rebuild, not through this. */
export function act(app: App, doing: string, fn: () => Promise<string>): void {
  toast(app, doing);
  void fn().then(
    (done) => toast(app, done),
    (e: unknown) => toast(app, `✗ ${e instanceof Error ? e.message : String(e)}`),
  );
}

/** Files change under the screen: `apply` swaps the snapshot in, `close()` stops the watching. */
export type Live = (apply: (next: Snapshot) => void) => { close(): void };

/** Resolves when the human quits, so the CLI ends without an exit call. */
export async function run(snap: Snapshot, live?: Live): Promise<void> {
  const r = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 });
  const app: App = { r, ui: newUi(), snap };
  draw(app);
  r.on('resize', () => draw(app));
  const watcher = live?.((next) => {
    app.snap = next;
    draw(app);
  });

  await new Promise<void>((done) => {
    r.keyInput.on('keypress', (key: KeyEvent) => {
      // Typed on the input line, `q` is a letter like any other.
      if (key.name === 'q' && !app.ui.input) {
        watcher?.close();
        r.destroy();
        return done();
      }
      onKey(app, key);
    });
  });
}
