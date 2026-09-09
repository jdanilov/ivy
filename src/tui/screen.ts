import { BoxRenderable, createCliRenderer, decodePasteBytes, type CliRenderer, type KeyEvent, type PasteEvent } from '@opentui/core';
import path from 'node:path';
import { C, GLYPH, SESSION, stateColor } from './theme.js';
import { dur, id, len, spread, tokens, type Cell } from './format.js';
import { column, newUi, select, type LeftItem, type Pane, type Ui } from './panes/pane.js';
import { leftPane } from './panes/left.js';
import { messagesPane } from './panes/messages.js';
import { missionPane, sessionPane } from './panes/mission.js';
import { partsPane, pending } from './panes/parts.js';
import { daemonPane } from './panes/daemon.js';
import { footPane } from './panes/foot.js';
import { composeHeight, composePane, targetOf } from './panes/compose.js';
import { focused, formPane, showsForm, showsParts } from './panes/form.js';
import { intentForm } from './panes/intent.js';
import { helpPane } from './panes/help.js';
import { onKey, onPaste } from './keys.js';
import { rowTail } from '../commands/daemon.js';
import { startSupervisor, supervisorPid } from '../core/supervisor.js';
import type { Mission, Session, Snapshot } from './model.js';

/** Chrome rows: blank, header, rule — rule, key bar. The key bar sits on the last terminal row:
 *  a row left undrawn under it reads as a gap the screen forgot to fill. */
const CHROME = 5;
/** A full foot keeps the blank row, the rule and the key bar, and gives the pane everything else. */
const FULL_CHROME = 3;
/** Factory's own mark. Single-width in a monospace font, unlike most of the geometric glyphs. */
const BRAND = '⌬';

// ── header, status bar, key bar ───────────────────────────────────────────────

/** The mode is what the human chose, the bracket what the machine is actually doing. */
function awake(snap: Snapshot): boolean {
  const running = snap.projects.some((project) => project.missions.some((m) => m.state === 'running'));
  return snap.caffeinate === 'on' || (snap.caffeinate === 'auto' && running);
}

/** The bright first letter is the key that turns the setting, drawn as the key bar draws a key. */
function caffeinateCells(snap: Snapshot): Cell[] {
  const on = awake(snap);
  return [['C', C.bright], ['affeinate ', C.dim], [snap.caffeinate.toUpperCase(), C.bright], [` [${on ? 'ON' : 'OFF'}]`, on ? C.accent : C.dim]];
}

/** How `O` will run the next session: FG in the tab, BG under the daemon with the tab attached. */
const launchCells = (snap: Snapshot): Cell[] => [['L', C.bright], ['aunch ', C.dim], [snap.launch.toUpperCase(), C.bright], ['  ', C.dim]];

/** The bar is a third of the line at most, and only what the words on either side leave. */
const barRoom = (width: number, used: number): number => Math.min(Math.floor(width * 0.3), width - used - 6);

/** What the missions are, as counts: `1 running · 3 stub · 8 closed`, the zeros left out. */
function counts(missions: Mission[]): Cell[] {
  const tally: [string, number, string][] = [
    ['running', missions.filter((m) => m.state === 'running').length, C.bright],
    ['waiting', missions.filter((m) => m.state === 'blocked').length, C.warning],
    ['stub', missions.filter((m) => m.status === 'stub').length, C.dim],
    ['closed', missions.filter((m) => m.status === 'closed').length, C.dim],
  ];
  const cells = tally.filter(([, n]) => n > 0).flatMap(([word, n, color], i): Cell[] =>
    [...(i ? ([[' · ', C.rule]] as Cell[]) : []), [`${n} `, color], [word, C.dim]]);
  return cells.length ? cells : [['no missions', C.dim]];
}

/** A project is where it lives, then what its missions are; the Inbox, how many projects there are. */
const summary = (where: Cell, missions: Mission[]): Cell[] => [where, [' · ', C.rule], ...counts(missions)];

/** The state word varies in width and the bar behind it would move with it. */
const STATE_W = 8;

function missionBar(width: number, m: Mission): Cell[] {
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

  const bar = barRoom(width, len(left) + len(count) + len(metrics));
  const fill = total && bar > 0 ? Math.round((bar * done) / total) : 0;
  const middle: Cell[] = total && bar > 0
    ? [['  ', C.dim], ['█'.repeat(fill), C.success], ['█'.repeat(bar - fill), C.track]] : [];
  return spread([...left, ...middle, ...count], metrics, width);
}

/** A session has no steps to bar: its state word, then whose tab it is and how long it has waited. */
function sessionBar(width: number, s: Session): Cell[] {
  const asking = s.now?.verb === 'ask';
  const word = asking ? 'ASKING' : s.busy ? 'WORKING' : 'IDLE';
  const left: Cell[] = [s.busy ? [`${SESSION.working} `, asking ? C.warning : C.accent] : [`${SESSION.idle} `, C.dim], [word.padEnd(STATE_W), C.bright],
    ['  ', C.dim], [s.name ?? id(s.id), C.bright], [' · ', C.rule], [s.preset, C.dim], [' · ', C.rule], [s.cwd, C.dim]];
  const right: Cell[] = s.busy ? (s.agent ? [[s.agent, C.bright]] : []) : [['since ', C.dim], [dur(Date.now() - s.idleSince), C.bright]];
  return spread(left, right, width);
}

/** What the selected row is, in `width` cells: the status the header row carries left of the brand. */
function status(width: number, snap: Snapshot, here: LeftItem, ui: Ui): Cell[] {
  // The one line the screen takes typing on: what the key asked for, then what has been typed.
  if (ui.input) return [[`${ui.input.label} `, C.dim], [ui.input.value, C.bright], ['▏', C.accent]];
  if (ui.toast) return [[ui.toast, C.dim]];
  if (here.kind === 'mission') return missionBar(width, here.mission);
  if (here.kind === 'session') return sessionBar(width, here.session);
  // A daemon has no run of its own to sum: the key says which one, the tail what it is doing.
  // With no supervisor every one of those rows is a record of the past, so the bar says so.
  if (here.kind === 'daemon') {
    return [[here.daemon.key, C.bright], [' · ', C.rule], [rowTail(here.daemon), C.dim],
      [snap.supervisor === null ? '  supervisor not running — factory supervisor start' : '', C.warning]];
  }
  if (here.kind === 'inbox') {
    const n = snap.projects.length;
    return summary([`${n} project${n === 1 ? '' : 's'}`, C.bright], snap.projects.flatMap((project) => project.missions));
  }
  if (here.kind === 'global') {
    const on = here.project.parts.filter((part) => part.status !== 'not-installed').length;
    return [[path.join(here.project.path, '.claude'), C.bright], [' has ', C.dim],
      [`${on}/${here.project.parts.length}`, C.bright], [' parts installed', C.dim]];
  }
  return summary([here.project.path, C.bright], here.project.missions);
}

/** One row: the brand, then the status of the selection over the rest. Two rows said no more. */
function header(p: Pane, snap: Snapshot, here: LeftItem, ui: Ui): void {
  const brand: Cell[] = [[`${BRAND} `, C.accent], ['FACTORY', C.accent], [' · ', C.rule]];
  p.row([...brand, ...status(p.width - len(brand), snap, here, ui)]);
}

/** What each kind of row answers. The bar lists only these, so it never offers a key whose whole
 *  reply would be a toast saying the row is the wrong kind. */
const ROW_KEYS: Record<LeftItem['kind'], string[]> = {
  inbox: [], global: [], project: ['M', 'R', 'U', 'P'], mission: ['O', 'K', 'T', 'E', 'P'], session: ['K', 'R', 'P'],
  daemon: ['R', 'X', 'P'],
};
const ROW_PAIRS: string[][] = [['O', 'Open Tab'], ['K', 'Kill'], ['T', 'Autonomy'], ['E', 'Archive'], ['R', 'Rename'], ['M', 'New Mission'], ['U', 'Uninstall'], ['P', 'New Service']];

/** A stub's autonomy is the form's dial, so `T` there answers with a toast and nothing else: the
 *  bar drops it, the way it lists Parts only where Parts is the pane. */
const rowKeys = (here: LeftItem): string[] =>
  here.kind === 'mission' && here.mission.status === 'stub'
    ? ROW_KEYS.mission.filter((key) => key !== 'T')
    : ROW_KEYS[here.kind];

/** A daemon row's own labels: `R` is Run on a daemon and Start on a service — both turn the row
 *  on — and `X` is Stop and off. The log is the foot's, so `A` carries it and the bar does not. */
function rowPairs(here: LeftItem): string[][] {
  if (here.kind !== 'daemon') return ROW_PAIRS.filter(([key]) => rowKeys(here).includes(key!));
  const label: Record<string, string> = { R: here.daemon.entry.kind === 'daemon' ? 'Run' : 'Start', X: 'Stop', P: 'New Service' };
  return ROW_KEYS.daemon.map((key) => [key, label[key]!]);
}

/** The `←→` pair while a form has the keys: the dial's own word, or nothing on a text field. */
function dialPair(ui: Ui, here: LeftItem): string[][] {
  const field = focused(ui, here);
  return field?.options ? [['←→', field.label.replace(/:$/, '')]] : [];
}

/** Keys read uppercase and are pressed either way; `?` is the first thing dropped when the
 *  terminal is too narrow, because the overlay it opens lists everything anyway. `L`, `C`, `A`
 *  and `D` are not here: the header and the foot tabs carry them as their bright first letter. */
function keyBar(p: Pane, snap: Snapshot, here: LeftItem, ui: Ui): void {
  const right = ui.focus === 'right';
  // The bar lists the pane that is drawn: a project row showing the intent form is not Parts.
  const parts = showsParts(ui, here);
  const pairs: string[][] =
    // The panel and the full foot each take the screen: their bars list what still answers.
    ui.input ? [['↵', 'Done'], ['Esc', 'Cancel']] :
    // `←→` turns the dial the cursor is on and walks the text everywhere else, so the bar offers
    // it only where it is a dial, and names that dial rather than a key the form may not have.
    ui.form ? [['⇥ ⇧↵', 'Field'], ['^S', 'Save'], ...dialPair(ui, here), ['^U', 'Clear'], ['Esc', 'Leave']] :
    ui.compose ? [['⇧↵', 'Send'], ['⌥⌫', 'Word'], ['^K', 'Line'], ['^U', 'Clear']] :
    ui.help ? [['? Esc', 'Back'], ['Q', 'Quit']] :
    ui.size === 'full' ? [['↑↓', 'Scroll'], ['↵ Esc', 'Back'], ['Q', 'Quit']] :
    // `N` is on every left row and last of them: it is the one key that answers with a project
    // the list does not hold yet, so it reads after whatever the selected row itself does.
    !right ? [['↑↓', 'Select'], ['↵', intentForm(here) !== null && here.kind === 'mission' ? 'Edit' : targetOf(here) ? 'Message' : 'Open'], ...rowPairs(here),
      ['N', 'New Project'], ['S', 'Show Archived'], ['Q', 'Quit'], ['?', 'Help']]
    : here.kind === 'inbox' ? [['↑↓', 'Select'], ['← Esc', 'Back'], ['Q', 'Quit'], ['?', 'Help']]
    : parts && ui.confirm ? [['Y', 'Confirm'], ['N', 'Cancel'], ['Esc', 'Back'], ['Q', 'Quit']]
    // Space picks the scope on the global row and the install on a project's: one key, two panes.
    : parts ? [['↑↓', 'Select'], ['Space', here.kind === 'global' ? 'Scope' : 'Toggle'], ['↵', 'Apply'],
      ...(pending(here.project, ui, here.kind === 'global').length ? [['R', 'Reset'], ['Esc', 'Discard']] : [['← Esc', 'Back']]), ['Q', 'Quit'], ['?', 'Help']]
    // The mission pane has one thing to focus, and the row it sits on is the autonomy dial. A
    // stub's right pane is the form instead, where neither key turns anything.
    : [...(here.kind === 'mission' && here.mission.status !== 'stub' ? [['→ T', 'Autonomy']] : []),
      ['← Esc', 'Back'], ['Q', 'Quit'], ['?', 'Help']];

  const cells = (list: string[][]): Cell[] =>
    list.flatMap(([key, label]) => [[`${key} `, C.bright], [`${label}  `, C.dim]] as Cell[]);
  // The two settings sit at the bar's right end: what `L` and `C` turn, beside the keys that turn it.
  const settings: Cell[] = [...launchCells(snap), ...caffeinateCells(snap)];
  // The bar narrows as a row's own keys grow, and only ever loses the two it can: `?`, whose
  // panel lists every key anyway, then `S`, which only hides rows. What the row answers and what
  // the settings say are why the bar is there, so neither is ever the thing that goes.
  const room = p.width - len(settings);
  const fit = (drop: string[]): Cell[] => cells(pairs.filter(([key]) => !drop.includes(key!)));
  const narrow = [[], ['?'], ['?', 'S']].map(fit);
  p.row(spread(narrow.find((row) => len(row) <= room) ?? narrow.at(-1)!, settings, p.width));
}

// ── render ────────────────────────────────────────────────────────────────────

/** A minimised foot is its tab row and nothing else — no rule over one line — so what came in is
 *  still counted and the body keeps every row the foot gave up. */
const MIN_FOOT = 1;

/** The left column takes two fifths, never under this. */
const LEFT_MIN = 30;
const leftWidth = (w: number): number => Math.max(LEFT_MIN, Math.floor(w * 0.4));

/** What the right pane draws into. The intent form wraps its fields to it, and `editKey` has to
 *  be given the same width or the cursor's row is not the one on screen. */
export const rightWidth = (r: CliRenderer): number => {
  const w = r.terminalWidth - 2;
  return w - leftWidth(w) - 2;
};


export function render(r: CliRenderer, snap: Snapshot, ui: Ui): void {
  // remove() detaches without freeing the native text buffer and yoga node behind every row:
  // a few hundred keypresses exhaust the allocator and the process dies. destroy frees them.
  // The copy matters: destroy() takes the child out of the live array we would be walking.
  for (const child of [...r.root.getChildren()]) child.destroyRecursively();

  const w = r.terminalWidth - 2;
  const { items, here } = select(snap, ui);

  // Everything under the status rule and above the key-bar rule. The foot keeps a third of it,
  // the columns take the rest — and either one takes all of it: the drawn tab's own key gives the
  // foot the screen or leaves it its tab row alone, `?` gives the body to the panel, which needs
  // the height to say anything worth reading.
  // The message box takes its rows off the top of the region, and the foot keeps its share of the rest.
  const full = ui.size === 'full';
  const composeH = Math.min(composeHeight(ui, here, w), Math.max(0, r.terminalHeight - (full ? FULL_CHROME : CHROME) - 5));
  const region = Math.max(0, r.terminalHeight - (full ? FULL_CHROME : CHROME) - composeH);
  // The panel wants the whole body, on `?` and on an Inbox with nothing in it alike.
  const panel = ui.help || (here.kind === 'inbox' && snap.inbox.length === 0);
  const actH = full ? region : panel ? 0 : ui.size === 'min' ? Math.min(region, MIN_FOOT)
    : Math.min(region, Math.max(5, Math.floor(region / 3)));
  const bodyH = region - actH;

  // Two blank columns down the left and none anywhere else: the key bar sits on the last row and
  // no box carries a background, so every cell the screen does not colour keeps the terminal's own.
  const root = column(r, w, { width: r.terminalWidth, height: r.terminalHeight, paddingLeft: 2, paddingRight: 0 });
  root.row([]);
  // A full-height foot is that pane and nothing else: the header and the status bar are rows it can have.
  if (!full) {
    header(root, snap, here, ui);
    root.rule();
  }

  if (bodyH > 0) {
    const leftW = leftWidth(w);
    const rightW = w - leftW - 1;
    const body = new BoxRenderable(r, { flexDirection: 'row', height: bodyH, flexShrink: 0, overflow: 'hidden' });
    // Two cells of padding keep the left pane's right-aligned tokens off the divider.
    const left = column(r, leftW - 2, { width: leftW, paddingRight: 2 });
    const right = column(r, rightW - 1, { width: rightW, paddingLeft: 1 });
    leftPane(left, items, snap, ui, bodyH);
    // An empty Inbox has nothing to show, so the panel stands there: a fresh install opens on it.
    if (panel) helpPane(right, bodyH);
    else if (here.kind === 'inbox') messagesPane(right, snap, ui, bodyH);
    // The form outranks Parts and MISSION: a stub is edited here, and a project row shows the new
    // mission it has a draft for. It scrolls inside the body rather than being cut by it: what is
    // being typed into has to stay on screen, where a graph only has to be read from the top.
    else if (showsForm(ui, here)) formPane(right, ui, here, bodyH);
    else if (here.kind === 'project' || here.kind === 'global') partsPane(right, here.project, ui, here.kind === 'global', bodyH);
    else if (here.kind === 'daemon') daemonPane(right, here.daemon, bodyH);
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
  if (composeH > 0) composePane(root, ui, here);

  root.rule();
  keyBar(root, snap, here, ui);
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

/** The daemons run whether or not anyone is watching, so the screen starts the machine's
 *  supervisor when nothing else has and never stops it: quitting must not take them down. Only a
 *  live screen does it — a fixture run and the headless frame drivers have no machine to keep. */
async function ensureSupervisor(): Promise<void> {
  if ((await supervisorPid()) !== null) return;
  await startSupervisor();
}

/** Resolves when the human quits, so the CLI ends without an exit call. */
export async function run(snap: Snapshot, live?: Live): Promise<void> {
  const r = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 });
  const app: App = { r, ui: newUi(), snap };
  draw(app);
  if (live) void ensureSupervisor().catch((e: unknown) => toast(app, `✗ supervisor: ${e instanceof Error ? e.message : String(e)}`));
  r.on('resize', () => draw(app));
  const watcher = live?.((next) => {
    app.snap = next;
    draw(app);
  });

  await new Promise<void>((done) => {
    r.keyInput.on('paste', (e: PasteEvent) => onPaste(app, decodePasteBytes(e.bytes)));
    r.keyInput.on('keypress', (key: KeyEvent) => {
      // Typed on the input line or into a message, `q` is a letter like any other.
      if (key.name === 'q' && !app.ui.input && !app.ui.compose && !app.ui.form) {
        watcher?.close();
        r.destroy();
        return done();
      }
      onKey(app, key);
    });
  });
}
