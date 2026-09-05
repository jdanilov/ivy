import { BoxRenderable, TextRenderable, createCliRenderer, type CliRenderer, type KeyEvent } from '@opentui/core';
import { C, GLYPH, stateColor, stepColor } from './theme.js';
import { ago, dur, id, len, line, spread, tokens, wrap, type Cell } from './format.js';
import type { InboxItem, Mission, Project, Session, Snapshot } from './model.js';

const MODES = ['Inbox', 'Mission', 'Parts'] as const;
const ANSWERS = ['accept', 'amend', 'reject'] as const;

export interface Ui {
  focus: 'left' | 'right';
  mode: number;
  left: number;
  inbox: number;
  part: number;
  answer: number;
  answered: Set<number>;
  toggles: Record<string, boolean>;
  toast: string | null;
}

export function newUi(): Ui {
  return { focus: 'left', mode: 0, left: 0, inbox: 0, part: 0, answer: 0, answered: new Set(), toggles: {}, toast: null };
}

/** One selectable row of the left pane: a mission, or a session with no mission bound to it. */
interface LeftRow {
  project: Project;
  mission?: Mission;
  session?: Session;
}

function leftRows(snap: Snapshot): LeftRow[] {
  return snap.projects.flatMap((project) => [
    ...project.missions.map((mission) => ({ project, mission })),
    ...project.sessions.map((session) => ({ project, session })),
  ]);
}

function clamp(i: number, n: number): number {
  return n === 0 ? 0 : Math.min(Math.max(i, 0), n - 1);
}

/** A column of rows drawn at a fixed width, so a selected row inverts edge to edge. */
function pane(r: CliRenderer, width: number, box: BoxRenderable) {
  const row = (cells: Cell[], selected = false): void => {
    box.add(new TextRenderable(r, { content: line(cells, width, selected), flexShrink: 0 }));
  };
  return { box, width, row, rule: () => row([['─'.repeat(width), C.rule]]) };
}

type Pane = ReturnType<typeof pane>;

function column(r: CliRenderer, width: number, extra: Record<string, unknown> = {}): Pane {
  return pane(r, width, new BoxRenderable(r, { flexDirection: 'column', overflow: 'hidden', ...extra }));
}

// ── header, status bar, key bar ───────────────────────────────────────────────

function header(p: Pane, project: Project, m: Mission | undefined): void {
  const metrics: Cell[] = m
    ? [
        ['TIME ', C.dim], [dur(m.wall), C.bright], [' · ', C.rule],
        ['Input ', C.dim], [tokens(m.tokens.input), C.bright], [' · ', C.rule],
        ['Cached ', C.dim], [tokens(m.tokens.cached), C.bright], [' · ', C.rule],
        ['Output ', C.dim], [tokens(m.tokens.output), C.bright],
      ]
    : [];
  p.row(spread([['● ', C.accent], ['Mission Control', C.accent], ['  ', C.dim], [project.path, C.dim]], metrics, p.width));
}

function statusBar(p: Pane, m: Mission | undefined, ui: Ui): void {
  if (ui.toast) return p.row([[ui.toast, C.dim]]);
  if (!m) return p.row([]);

  const total = m.steps.length;
  const done = m.steps.filter((s) => s.status === 'done').length;
  const queued = m.steps.filter((s) => s.status === 'pending').length;
  const word = m.status === 'stub' ? 'STUB' : m.status === 'closed' ? 'CLOSED' : m.state.toUpperCase();
  const left: Cell[] = [[`${GLYPH[m.state]} `, stateColor(m.state)], [word, C.bright]];
  const right: Cell[] = total ? [[`${done}/${total}`, C.bright], [` [+${queued}]`, C.dim]] : [];

  // The reference bar fills the middle, not the whole line: two thirds of the width at most.
  const bar = Math.min(Math.floor(p.width * 0.66), p.width - len(left) - len(right) - 4);
  const fillW = total && bar > 0 ? Math.round((bar * done) / total) : 0;
  const middle: Cell[] = total && bar > 0
    ? [['  ', C.dim], ['█'.repeat(fillW), C.success], ['█'.repeat(bar - fillW), C.track], ['  ', C.dim]]
    : [];
  p.row(spread([...left, ...middle], right, p.width));
}

function keyBar(p: Pane, ui: Ui): void {
  const pairs =
    ui.focus === 'left' ? [['↑↓', 'Select'], ['↵', 'Open tab'], ['a', 'Adopt'], ['x', 'Kill'], ['Tab', 'Mode'], ['q', 'Quit']]
    : ui.mode === 0 ? [['↑↓', 'Select'], ['←→', 'Answer'], ['↵', 'Confirm'], ['Tab', 'Mode'], ['q', 'Quit']]
    : ui.mode === 2 ? [['↑↓', 'Select'], ['Space', 'Toggle'], ['↵', 'Apply'], ['Tab', 'Mode'], ['q', 'Quit']]
    : [['↑↓', 'Select'], ['↵', 'Open tab'], ['h', 'Back'], ['Tab', 'Mode'], ['q', 'Quit']];
  p.row(pairs.flatMap(([key, label]) => [[`${key} `, C.bright], [`${label}  `, C.dim]] as Cell[]));
}

// ── left pane ─────────────────────────────────────────────────────────────────

function marker(selected: boolean, focused: boolean): Cell {
  return [selected && !focused ? '›' : ' ', C.dim];
}

function missionRow(p: Pane, m: Mission, selected: boolean, focused: boolean): void {
  const quiet = m.status !== 'open';
  const name: Cell = [m.name, quiet ? C.dim : C.bright];
  const tail: Cell[] =
    m.status === 'stub' ? [['  stub', C.dim]]
    : m.status === 'closed' ? [[`  closed ${ago(m.closedAt ?? Date.now())}`, C.dim]]
    : [['  ', C.dim], [m.workflow, C.dim], ['  ', C.dim], [m.step ?? '—', C.bright], [` r${m.round}`, C.dim]];
  const right: Cell[] = m.status === 'open'
    ? [[dur(m.wall), C.dim], ['  ', C.dim], [tokens(m.tokens.input + m.tokens.cached + m.tokens.output), C.dim]]
    : [];

  p.row(spread([marker(selected, focused), [`${GLYPH[m.state]} `, stateColor(m.state)], name, ...tail], right, p.width), selected && focused);

  const notes = [m.worktree ? `wt ${m.worktree}` : '', m.caffeinate ? 'caffeinate on' : ''].filter(Boolean);
  if (notes.length) p.row([['   ', C.dim], [notes.join(' · '), C.dim]]);
}

function sessionRow(p: Pane, s: Session, selected: boolean, focused: boolean): void {
  const cells: Cell[] = [
    marker(selected, focused), ['  ', C.dim], [s.preset, C.bright], ['  unbound  ', C.dim],
    [id(s.id), C.dim], [`  idle ${dur(Date.now() - s.idleSince)}`, C.dim],
  ];
  p.row(cells, selected && focused);
}

function leftPane(p: Pane, rows: LeftRow[], ui: Ui): void {
  p.row([['Missions', C.bright]]);
  p.rule();

  let project = '';
  rows.forEach((row, i) => {
    if (row.project.name !== project) {
      project = row.project.name;
      p.row([[project, C.dim]]);
    }
    const selected = i === ui.left;
    const focused = ui.focus === 'left';
    if (row.mission) missionRow(p, row.mission, selected, focused);
    else sessionRow(p, row.session!, selected, focused);
  });
}

// ── right pane ────────────────────────────────────────────────────────────────

function inboxPane(p: Pane, snap: Snapshot, ui: Ui): void {
  const items = snap.inbox;
  p.row([['Inbox', C.bright], [` (${items.length - ui.answered.size})`, C.dim]]);
  p.rule();

  items.forEach((item, i) => {
    const selected = i === ui.inbox;
    const answered = ui.answered.has(i);
    const cells: Cell[] = [
      marker(selected, ui.focus === 'right'),
      [answered ? '✓ ' : '⊘ ', answered ? C.success : C.warning],
      [`${item.project}/${item.origin}`, C.bright], ['  ', C.dim],
      [item.label, C.dim],
    ];
    p.row(spread(cells, [[answered ? 'answered' : ago(item.at), C.dim]], p.width), selected && ui.focus === 'right');
  });

  p.rule();
  const item = items[ui.inbox];
  if (item) inboxDetail(p, item, ui);
}

function inboxDetail(p: Pane, item: InboxItem, ui: Ui): void {
  if (item.kind === 'gate') {
    p.row([[item.file ?? '', C.bright], [` (${item.lines} lines)`, C.dim]]);
    for (const l of (item.body ?? []).slice(0, 12)) p.row([[l, C.dim]]);
    p.row([]);
    p.row(ANSWERS.flatMap((a, i) => [[` ${a} `, C.bright, ui.focus === 'right' && i === ui.answer], ['  ', C.dim]] as Cell[]));
    return;
  }
  if (item.kind === 'question') {
    for (const l of wrap(`"${item.text}"`, p.width, 3)) p.row([[l, C.bright]]);
    p.row([]);
    p.row([['→ jump to tab ', C.dim], [item.tab ?? '', C.accent]]);
    return;
  }
  const plan = item.plan ?? [];
  p.row([['triage ', C.dim], [item.label.replace('triage ', ''), C.bright],
    [`  ${plan.filter((l) => l.action === 'fix').length} fix · ${plan.filter((l) => l.action === 'skip').length} skip`, C.dim]]);
  for (const l of plan) p.row([[`${l.action === 'fix' ? 'fix ' : 'skip'}  `, l.action === 'fix' ? C.accent : C.dim], [l.text, C.bright]]);
}

function missionPane(p: Pane, m: Mission | undefined, ui: Ui): void {
  if (!m) return p.row([['Mission', C.bright]]);
  const done = m.steps.filter((s) => s.status === 'done').length;
  p.row(spread([['Mission', C.bright], [`  ${m.name}`, C.dim]], m.steps.length ? [[`${done}/${m.steps.length}`, C.dim]] : [], p.width));
  p.rule();

  for (const s of m.steps) {
    const cells: Cell[] = [
      [' ', C.dim], [`${GLYPH[s.status]} `, stateColor(s.status)], [s.name, stepColor(s.kind, s.status)],
      ...(s.gateOpen ? ([['  ⊘', C.warning]] as Cell[]) : []),
    ];
    p.row(spread(cells, [[s.wall ? dur(s.wall) : s.status, C.dim]], p.width));
  }
  if (!m.steps.length) p.row([[' no steps yet', C.dim]]);

  p.rule();
  const step = m.steps.find((s) => s.name === m.step);
  p.row([['step ', C.dim], [m.step ?? '—', C.bright], [' · role ', C.dim], [step?.role ?? '—', C.bright], [' · round ', C.dim], [`${m.round}`, C.bright]]);
  p.row([['branch ', C.dim], [m.branch ?? '—', C.bright], [' · wt ', C.dim], [m.worktree ?? '—', C.bright]]);
  p.row([['session ', C.dim], [m.session ? id(m.session) : '—', C.bright], [' · caffeinate ', C.dim], [m.caffeinate ? 'on' : 'off', C.bright]]);
  p.row([['deviations ', C.dim], [`${m.deviations}`, C.bright]]);

  p.rule();
  p.row([['Events', C.bright]]);
  for (const e of m.events) {
    p.row([
      [ago(e.at).padEnd(8), C.dim], [id(e.session).padEnd(11), C.dim],
      [e.verb.padEnd(17), C.bright], [e.detail, C.dim],
      [e.mark ? `  ${e.mark}` : '', e.mark === '✗' ? C.error : e.mark === '⊘' ? C.warning : C.success],
    ]);
  }
}

function partStatus(name: string, base: string, ui: Ui): string {
  const toggled = ui.toggles[name];
  return toggled === undefined ? base : toggled ? 'installed' : 'not-installed';
}

function partsPane(p: Pane, project: Project, ui: Ui): void {
  const installed = project.parts.filter((part) => partStatus(part.name, part.status, ui) === 'installed').length;
  p.row(spread([['Parts', C.bright], [`  ${project.name}`, C.dim]], [[`${installed}/${project.parts.length}`, C.dim]], p.width));
  p.rule();

  project.parts.forEach((part, i) => {
    const status = partStatus(part.name, part.status, ui);
    const on = status === 'installed';
    const selected = i === ui.part;
    p.row(
      [
        marker(selected, ui.focus === 'right'), [part.name.padEnd(16), C.bright], [part.type.padEnd(9), C.dim],
        [`${on ? '●' : '○'} ${(on ? 'installed' : 'available').padEnd(11)}`, on ? C.success : C.dim],
        [part.file, C.dim], [ui.toggles[part.name] === undefined ? '' : '  ±', C.warning],
      ],
      selected && ui.focus === 'right',
    );
  });

  p.rule();
  const part = project.parts[ui.part];
  if (!part) return;
  p.row([['part ', C.dim], [part.name, C.bright], [' · type ', C.dim], [part.type, C.bright], [' · file ', C.dim], [part.file, C.bright]]);
  p.row([['pending ', C.dim], [pending(project, ui) || 'nothing', C.bright]]);
}

/** What `enter` would apply: the toggles that disagree with the manifest. */
function pending(project: Project, ui: Ui): string {
  return project.parts
    .filter((part) => ui.toggles[part.name] !== undefined && partStatus(part.name, part.status, ui) !== part.status)
    .map((part) => `${ui.toggles[part.name] ? 'install' : 'uninstall'} ${part.name}`)
    .join(', ');
}

// ── render ────────────────────────────────────────────────────────────────────

export function render(r: CliRenderer, snap: Snapshot, ui: Ui): void {
  for (const child of r.root.getChildren()) r.root.remove(child);

  const w = r.terminalWidth - 2;
  const rows = leftRows(snap);
  ui.left = clamp(ui.left, rows.length);
  const here = rows[ui.left];
  const project = here?.project ?? snap.projects[0]!;
  const mission = here?.mission;

  const root = column(r, w, { width: r.terminalWidth, height: r.terminalHeight, paddingLeft: 1, paddingRight: 1, backgroundColor: C.bg });
  header(root, project, mission);
  root.rule();
  statusBar(root, mission, ui);
  root.rule();

  const leftW = Math.max(30, Math.floor(w * 0.45));
  const rightW = w - leftW - 1;
  const body = new BoxRenderable(r, { flexDirection: 'row', flexGrow: 1, flexShrink: 1, overflow: 'hidden' });
  const left = column(r, leftW, { width: leftW });
  const right = column(r, rightW - 1, { width: rightW, paddingLeft: 1 });
  leftPane(left, rows, ui);
  if (ui.mode === 0) inboxPane(right, snap, ui);
  else if (ui.mode === 1) missionPane(right, mission, ui);
  else partsPane(right, project, ui);
  body.add(left.box);
  const divider = column(r, 1, { width: 1, flexShrink: 0 });
  for (let i = 0; i < r.terminalHeight - 6; i++) divider.row([['│', C.rule]]);
  body.add(divider.box);
  body.add(right.box);
  root.box.add(body);

  root.rule();
  keyBar(root, ui);
  r.root.add(root.box);
}

// ── keys ──────────────────────────────────────────────────────────────────────

function toast(r: CliRenderer, snap: Snapshot, ui: Ui, text: string): void {
  ui.toast = text;
  render(r, snap, ui);
  setTimeout(() => {
    ui.toast = null;
    render(r, snap, ui);
  }, 2000);
}

/** Every action is in memory: the prototype shows what would happen, it does nothing. */
export function handleKey(r: CliRenderer, snap: Snapshot, ui: Ui, key: KeyEvent): void {
  const rows = leftRows(snap);
  const here = rows[ui.left];
  const project = here?.project ?? snap.projects[0]!;
  const inboxMode = ui.focus === 'right' && ui.mode === 0;
  const partsMode = ui.focus === 'right' && ui.mode === 2;
  const step = (list: number, n: number, delta: number) => clamp(list + delta, n);

  switch (key.name) {
    case 'tab':
      ui.mode = (ui.mode + 1) % MODES.length;
      break;
    case 'up':
    case 'k':
      if (inboxMode) ui.inbox = step(ui.inbox, snap.inbox.length, -1);
      else if (partsMode) ui.part = step(ui.part, project.parts.length, -1);
      else ui.left = step(ui.left, rows.length, -1);
      break;
    case 'down':
    case 'j':
      if (inboxMode) ui.inbox = step(ui.inbox, snap.inbox.length, 1);
      else if (partsMode) ui.part = step(ui.part, project.parts.length, 1);
      else ui.left = step(ui.left, rows.length, 1);
      break;
    case 'right':
      if (inboxMode) ui.answer = step(ui.answer, ANSWERS.length, 1);
      else ui.focus = 'right';
      break;
    case 'l':
      ui.focus = 'right';
      break;
    case 'left':
      if (inboxMode) ui.answer = step(ui.answer, ANSWERS.length, -1);
      else ui.focus = 'left';
      break;
    case 'h':
      ui.focus = 'left';
      break;
    case 'space':
      if (partsMode) {
        const part = project.parts[ui.part];
        if (part) ui.toggles[part.name] = partStatus(part.name, part.status, ui) !== 'installed';
      }
      break;
    case 'return':
      if (inboxMode) {
        ui.answered.add(ui.inbox);
        return toast(r, snap, ui, `${ANSWERS[ui.answer]} ${snap.inbox[ui.inbox]?.label} (prototype: no-op)`);
      }
      if (partsMode) return toast(r, snap, ui, `apply: ${pending(project, ui) || 'nothing to apply'}`);
      return toast(r, snap, ui, `open tab factory-${here?.mission?.name ?? here?.session?.preset} (prototype: no-op)`);
    case 'a':
      if (!partsMode) return toast(r, snap, ui, `adopt ${here?.mission?.name ?? '—'} (prototype: no-op)`);
      break;
    case 'x':
      if (!partsMode) return toast(r, snap, ui, `kill ${here?.session?.id ?? here?.mission?.session ?? '—'} (prototype: no-op)`);
      break;
    default:
      return;
  }
  render(r, snap, ui);
}

/** Resolves when the human quits, so the CLI ends without an exit call. */
export async function run(snap: Snapshot): Promise<void> {
  const r = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30, backgroundColor: C.bg });
  const ui = newUi();
  render(r, snap, ui);
  r.on('resize', () => render(r, snap, ui));

  await new Promise<void>((done) => {
    r.keyInput.on('keypress', (key: KeyEvent) => {
      if (key.name === 'q') {
        r.destroy();
        return done();
      }
      handleKey(r, snap, ui, key);
    });
  });
}
