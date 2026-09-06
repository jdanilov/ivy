import { BoxRenderable, TextRenderable, createCliRenderer, type CliRenderer, type KeyEvent } from '@opentui/core';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { C, GLYPH, stateColor, stepColor } from './theme.js';
import { ago, dur, id, len, line, spread, tokens, wrap, type Cell } from './format.js';
import type { Caffeinate, InboxItem, Mission, Project, Session, Snapshot } from './model.js';

const ANSWERS = ['accept', 'amend', 'reject'] as const;
const CAFFEINATE: Caffeinate[] = ['auto', 'on', 'off'];

/** Chrome rows around the body: blank, header, rule, status, rule — rule, key bar, blank. */
const CHROME = 8;
/** Factory's own mark. Single-width in a monospace font, unlike most of the geometric glyphs. */
const BRAND = '⌬';

export interface Ui {
  focus: 'left' | 'right';
  left: number;
  msg: number;
  part: number;
  answer: number;
  answered: Set<number>;
  toggles: Record<string, boolean>;
  confirm: boolean;
  toast: string | null;
}

export function newUi(): Ui {
  return { focus: 'left', left: 0, msg: 0, part: 0, answer: 0, answered: new Set(), toggles: {}, confirm: false, toast: null };
}

/** One selectable row of the left pane. The right pane is whatever this points at. */
export type LeftItem =
  | { kind: 'inbox' }
  | { kind: 'project'; project: Project }
  | { kind: 'mission'; project: Project; mission: Mission }
  | { kind: 'session'; project: Project; session: Session };

export function leftItems(snap: Snapshot): LeftItem[] {
  return [
    { kind: 'inbox' },
    ...snap.projects.flatMap((project): LeftItem[] => [
      { kind: 'project', project },
      ...project.missions.map((mission): LeftItem => ({ kind: 'mission', project, mission })),
      ...project.sessions.map((session): LeftItem => ({ kind: 'session', project, session })),
    ]),
  ];
}

function clamp(i: number, n: number): number {
  return n === 0 ? 0 : Math.min(Math.max(i, 0), n - 1);
}

/** A column of rows drawn at a fixed width, so a selected row inverts edge to edge. */
function column(r: CliRenderer, width: number, extra: Record<string, unknown> = {}) {
  const box = new BoxRenderable(r, { flexDirection: 'column', overflow: 'hidden', ...extra });
  const row = (cells: Cell[], selected = false): void => {
    box.add(new TextRenderable(r, { content: line(cells, width, selected), flexShrink: 0 }));
  };
  return { box, width, row, rule: () => row([['─'.repeat(width), C.rule]]) };
}

type Pane = ReturnType<typeof column>;

function marker(selected: boolean, focused: boolean): Cell {
  return [selected && !focused ? '›' : ' ', C.dim];
}

// ── header, status bar, key bar ───────────────────────────────────────────────

function header(p: Pane, here: LeftItem, caffeinate: Caffeinate): void {
  const where = here.kind === 'inbox' ? 'all projects' : here.project.path;
  const left: Cell[] = [[`${BRAND} `, C.accent], ['Mission Control', C.accent], ['  ', C.dim], [where, C.dim]];
  p.row(spread(left, [['caffeinate ', C.dim], [caffeinate.toUpperCase(), C.bright]], p.width));
}

/** Missions of one project, or of all of them when the Inbox is selected. */
function summary(p: Pane, missions: Mission[]): void {
  const counts: [string, number][] = [
    ['running', missions.filter((m) => m.state === 'running').length],
    ['waiting', missions.filter((m) => m.state === 'blocked').length],
    ['stub', missions.filter((m) => m.status === 'stub').length],
    ['closed', missions.filter((m) => m.status === 'closed').length],
  ];
  p.row(counts.filter(([, n]) => n > 0).flatMap(([word, n], i): Cell[] =>
    [...(i ? ([[' · ', C.rule]] as Cell[]) : []), [`${n} `, C.bright], [word, C.dim]]));
}

function missionBar(p: Pane, m: Mission): void {
  const total = m.steps.length;
  const done = m.steps.filter((s) => s.status === 'done').length;
  const queued = m.steps.filter((s) => s.status === 'pending').length;
  const word = m.status === 'stub' ? 'STUB' : m.status === 'closed' ? 'CLOSED' : m.state.toUpperCase();
  const left: Cell[] = [[`${GLYPH[m.state]} `, stateColor(m.state)], [word, C.bright]];
  const count: Cell[] = total ? [['  ', C.dim], [`${done}/${total}`, C.bright], [` [+${queued}]`, C.dim]] : [];
  const metrics: Cell[] = [
    ['TIME ', C.dim], [dur(m.wall), C.bright], [' · ', C.rule],
    ['In ', C.dim], [tokens(m.tokens.input), C.bright], [' · ', C.rule],
    ['Cached ', C.dim], [tokens(m.tokens.cached), C.bright], [' · ', C.rule],
    ['Out ', C.dim], [tokens(m.tokens.output), C.bright],
  ];

  // The bar fills what the words and the metrics leave, and never more than a third of the line.
  const bar = Math.min(Math.floor(p.width * 0.3), p.width - len(left) - len(count) - len(metrics) - 6);
  const fill = total && bar > 0 ? Math.round((bar * done) / total) : 0;
  const middle: Cell[] = total && bar > 0
    ? [['  ', C.dim], ['█'.repeat(fill), C.success], ['█'.repeat(bar - fill), C.track]] : [];
  p.row(spread([...left, ...middle, ...count], metrics, p.width));
}

function statusBar(p: Pane, snap: Snapshot, here: LeftItem, ui: Ui): void {
  if (ui.toast) return p.row([[ui.toast, C.dim]]);
  if (here.kind === 'mission') return missionBar(p, here.mission);
  if (here.kind === 'inbox') return summary(p, snap.projects.flatMap((project) => project.missions));
  return summary(p, here.project.missions);
}

function keyBar(p: Pane, here: LeftItem, ui: Ui): void {
  const right = ui.focus === 'right';
  const pairs: string[][] =
    !right ? [['↑↓', 'Select'], ['↵→', 'Open'], ['a', 'Adopt'], ['x', 'Kill'], ['c', 'Caffeinate'], ['q', 'Quit']]
    : here.kind === 'inbox' ? [['↑↓', 'Select'], ['←→', 'Answer'], ['↵', 'Confirm'], ['esc', 'Back'], ['q', 'Quit']]
    : here.kind === 'project' && ui.confirm ? [['y', 'Confirm'], ['n', 'Cancel'], ['esc', 'Back'], ['q', 'Quit']]
    : here.kind === 'project' ? [['↑↓', 'Select'], ['space', 'Toggle'], ['↵', 'Apply'], ['esc', 'Back'], ['q', 'Quit']]
    : [['esc', 'Back'], ['c', 'Caffeinate'], ['q', 'Quit']];
  p.row(pairs.flatMap(([key, label]) => [[`${key} `, C.bright], [`${label}  `, C.dim]] as Cell[]));
}

// ── left pane ─────────────────────────────────────────────────────────────────

function missionRow(p: Pane, m: Mission, selected: boolean, focused: boolean): void {
  const quiet = m.status !== 'open';
  const tail: Cell[] =
    m.status === 'stub' ? [['  stub', C.dim]]
    : m.status === 'closed' ? [[`  closed ${ago(m.closedAt ?? Date.now())}`, C.dim]]
    : [['  ', C.dim], [m.workflow, C.dim], ['  ', C.dim], [m.step ?? '—', C.bright], [` r${m.round}`, C.dim]];
  const right: Cell[] = m.status === 'open'
    ? [[dur(m.wall), C.dim], ['  ', C.dim], [tokens(m.tokens.input + m.tokens.cached + m.tokens.output), C.dim]]
    : [];
  const cells: Cell[] = [marker(selected, focused), ['  ', C.dim], [`${GLYPH[m.state]} `, stateColor(m.state)], [m.name, quiet ? C.dim : C.bright]];
  p.row(spread([...cells, ...tail], right, p.width), selected && focused);
}

function sessionRow(p: Pane, s: Session, selected: boolean, focused: boolean): void {
  p.row([
    marker(selected, focused), ['  ', C.dim], ['○ ', C.dim], [s.preset, C.bright], ['  unbound  ', C.dim],
    [id(s.id), C.dim], [`  idle ${dur(Date.now() - s.idleSince)}`, C.dim],
  ], selected && focused);
}

function leftPane(p: Pane, items: LeftItem[], snap: Snapshot, ui: Ui): void {
  p.row([['PROJECTS', C.bright]]);
  p.rule();

  const focused = ui.focus === 'left';
  items.forEach((item, i) => {
    const selected = i === ui.left;
    if (item.kind === 'mission') return missionRow(p, item.mission, selected, focused);
    if (item.kind === 'session') return sessionRow(p, item.session, selected, focused);
    const open = snap.inbox.length - ui.answered.size;
    if (i) p.row([]); // a blank line between the Inbox and each project
    const head: Cell[] = item.kind === 'inbox'
      ? [['Inbox', C.bright], [` (${open})`, open ? C.warning : C.dim]]
      : [[item.project.name, C.bright]];
    p.row([marker(selected, focused), [' ', C.dim], ...head], selected && focused);
  });
}

// ── messages ──────────────────────────────────────────────────────────────────

function messagesPane(p: Pane, snap: Snapshot, ui: Ui, h: number): void {
  const items = snap.inbox;
  p.row([['MESSAGES', C.bright], [` (${items.length - ui.answered.size})`, C.dim]]);
  p.rule();

  items.forEach((item, i) => {
    const selected = i === ui.msg;
    const answered = ui.answered.has(i);
    const cells: Cell[] = [
      marker(selected, ui.focus === 'right'),
      [answered ? '✓ ' : '⊘ ', answered ? C.success : C.warning],
      [`${item.project}/${item.origin}`, C.bright], ['  ', C.dim], [item.label, C.dim],
    ];
    p.row(spread(cells, [[answered ? 'answered' : ago(item.at), C.dim]], p.width), selected && ui.focus === 'right');
  });

  p.rule();
  const item = items[ui.msg];
  if (item) messageDetail(p, item, ui, h - 3 - items.length);
}

/** Sits at the foot of the pane: `pad` blank rows push it there, one more separates it. */
function answerRow(p: Pane, ui: Ui, answered: boolean, pad: number): void {
  for (let i = 0; i <= pad; i++) p.row([]);
  if (answered) return p.row([['✓ answered', C.success]]);
  p.row(ANSWERS.flatMap((a, i) => [[` ${a} `, C.bright, ui.focus === 'right' && i === ui.answer], ['  ', C.dim]] as Cell[]));
}

function messageDetail(p: Pane, item: InboxItem, ui: Ui, h: number): void {
  const answered = ui.answered.has(ui.msg);
  const room = Math.max(0, h - 3);

  if (item.kind === 'gate') {
    p.row([[item.file ?? '', C.bright], [` (${item.lines} lines)`, C.dim]]);
    const body = (item.body ?? []).flatMap((l) => (l ? wrap(l, p.width, 4) : ['']));
    for (const l of body.slice(0, room)) p.row([[l, C.dim]]);
    return answerRow(p, ui, answered, room - Math.min(body.length, room));
  }
  if (item.kind === 'question') {
    for (const l of wrap(item.text ?? '', p.width, Math.max(1, h - 2))) p.row([[l, C.bright]]);
    p.row([]);
    // Warp cannot focus a tab from outside; the name is what the human types into its tab switcher.
    return p.row([['tab ', C.dim], [item.tab ?? '', C.dim]]);
  }

  const plan = item.plan ?? [];
  p.row([['triage ', C.dim], [item.label.replace('triage ', ''), C.bright],
    [`  ${plan.filter((l) => l.action === 'fix').length} fix · ${plan.filter((l) => l.action === 'skip').length} skip`, C.dim]]);
  for (const l of plan) p.row([[l.action === 'fix' ? 'fix   ' : 'skip  ', l.action === 'fix' ? C.accent : C.dim], [l.text, C.bright]]);
  answerRow(p, ui, answered, Math.max(0, room - plan.length));
}

// ── mission and session ───────────────────────────────────────────────────────

function missionPane(p: Pane, m: Mission): void {
  const done = m.steps.filter((s) => s.status === 'done').length;
  p.row(spread([['MISSION', C.bright], [`  ${m.name}`, C.dim]], m.steps.length ? [[`${done}/${m.steps.length}`, C.dim]] : [], p.width));
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
  // One mission, one session: the id column would repeat itself on every line.
  const timeW = Math.max(0, ...m.events.map((e) => ago(e.at).length));
  for (const e of m.events) {
    p.row([
      [`${ago(e.at).padStart(timeW)}  `, C.dim], [e.verb.padEnd(17), C.bright], [e.detail, C.dim],
      [e.mark ? `  ${e.mark}` : '', e.mark === '✗' ? C.error : e.mark === '⊘' ? C.warning : C.success],
    ]);
  }
}

function sessionPane(p: Pane, s: Session): void {
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

// ── parts ─────────────────────────────────────────────────────────────────────

function partStatus(name: string, base: string, ui: Ui): string {
  const toggled = ui.toggles[name];
  return toggled === undefined ? base : toggled ? 'installed' : 'not-installed';
}

/** What `↵` would apply: the toggles that disagree with the manifest. */
function pending(project: Project, ui: Ui): string[] {
  return project.parts
    .filter((part) => partStatus(part.name, part.status, ui) !== part.status)
    .map((part) => `${ui.toggles[part.name] ? 'install' : 'uninstall'} ${part.name}`);
}

function partsPane(p: Pane, project: Project, ui: Ui): void {
  const parts = project.parts;
  const installed = parts.filter((part) => partStatus(part.name, part.status, ui) === 'installed').length;
  const changes = pending(project, ui);
  p.row([
    ['PARTS', C.bright], [`  ${project.name}`, C.dim], [`  ${installed}/${parts.length}`, C.dim],
    [changes.length ? `  ±${changes.length}` : '', C.accent],
  ]);
  p.rule();

  parts.forEach((part, i) => {
    const on = partStatus(part.name, part.status, ui) === 'installed';
    const selected = i === ui.part;
    const changed = on !== (part.status === 'installed');
    const cells: Cell[] = [
      marker(selected, ui.focus === 'right'), [part.name.padEnd(16), C.bright], [part.type.padEnd(9), C.dim],
      [`${on ? '●' : '○'} ${(on ? 'installed' : 'available').padEnd(11)}`, on ? C.success : C.dim],
      [part.files[0] ?? '', C.dim],
    ];
    p.row(spread(cells, [[changed ? '±' : ' ', C.accent]], p.width), selected && ui.focus === 'right');
  });

  p.rule();
  if (ui.confirm) {
    return p.row([['apply: ', C.dim], [changes.join(', '), C.bright], ['   y ', C.accent], ['confirm  ', C.dim], ['n ', C.accent], ['cancel', C.dim]]);
  }
  for (const file of parts[ui.part]?.files ?? []) p.row([[file, C.dim]]);
}

// ── render ────────────────────────────────────────────────────────────────────

export function render(r: CliRenderer, snap: Snapshot, ui: Ui): void {
  // remove() detaches without freeing the native text buffer and yoga node behind every row:
  // a few hundred keypresses exhaust the allocator and the process dies. destroy frees them.
  for (const child of r.root.getChildren()) child.destroyRecursively();

  const w = r.terminalWidth - 2;
  const items = leftItems(snap);
  ui.left = clamp(ui.left, items.length);
  const here = items[ui.left]!;
  const bodyH = Math.max(1, r.terminalHeight - CHROME);

  const root = column(r, w, { width: r.terminalWidth, height: r.terminalHeight, paddingLeft: 1, paddingRight: 1, backgroundColor: C.bg });
  root.row([]);
  header(root, here, snap.caffeinate);
  root.rule();
  statusBar(root, snap, here, ui);
  root.rule();

  const leftW = Math.max(30, Math.floor(w * 0.45));
  const rightW = w - leftW - 1;
  const body = new BoxRenderable(r, { flexDirection: 'row', flexGrow: 1, flexShrink: 1, overflow: 'hidden' });
  const left = column(r, leftW, { width: leftW });
  const right = column(r, rightW - 1, { width: rightW, paddingLeft: 1 });
  leftPane(left, items, snap, ui);
  if (here.kind === 'inbox') messagesPane(right, snap, ui, bodyH);
  else if (here.kind === 'project') partsPane(right, here.project, ui);
  else if (here.kind === 'mission') missionPane(right, here.mission);
  else sessionPane(right, here.session);
  body.add(left.box);
  const divider = column(r, 1, { width: 1, flexShrink: 0 });
  for (let i = 0; i < bodyH; i++) divider.row([['│', C.rule]]);
  body.add(divider.box);
  body.add(right.box);
  root.box.add(body);

  root.rule();
  keyBar(root, here, ui);
  root.row([]);
  r.root.add(root.box);
}

// ── keys ──────────────────────────────────────────────────────────────────────

function toast(r: CliRenderer, snap: Snapshot, ui: Ui, text: string): void {
  ui.toast = text;
  render(r, snap, ui);
  setTimeout(() => { ui.toast = null; render(r, snap, ui); }, 2000);
}

/** Every action is in memory: the prototype shows what would happen, it does nothing. */
export function handleKey(r: CliRenderer, snap: Snapshot, ui: Ui, key: KeyEvent): void {
  const items = leftItems(snap);
  ui.left = clamp(ui.left, items.length);
  const here = items[ui.left]!;
  const right = ui.focus === 'right';
  const inMessages = right && here.kind === 'inbox';
  const inParts = right && here.kind === 'project';
  const move = (i: number, n: number, delta: number) => clamp(i + delta, n);

  if (inParts && ui.confirm) {
    if (key.name === 'y') { ui.toggles = {}; ui.confirm = false; return toast(r, snap, ui, 'applied (prototype)'); }
    if (key.name === 'n' || key.name === 'escape') ui.confirm = false;
    return render(r, snap, ui);
  }

  switch (key.name) {
    case 'up': case 'k': case 'down': case 'j': {
      const d = key.name === 'up' || key.name === 'k' ? -1 : 1;
      if (inMessages) ui.msg = move(ui.msg, snap.inbox.length, d);
      else if (inParts) ui.part = move(ui.part, here.project.parts.length, d);
      else ui.left = move(ui.left, items.length, d);
      break;
    }
    case 'right':
      // In Messages ←→ walk the answer row, so only `esc` leaves that pane.
      if (inMessages) ui.answer = move(ui.answer, ANSWERS.length, 1);
      else ui.focus = 'right';
      break;
    case 'left':
      if (inMessages) ui.answer = move(ui.answer, ANSWERS.length, -1);
      else ui.focus = 'left';
      break;
    case 'escape':
      ui.focus = 'left';
      break;
    case 'space':
      if (inParts) {
        const part = here.project.parts[ui.part];
        if (part) ui.toggles[part.name] = partStatus(part.name, part.status, ui) !== 'installed';
      }
      break;
    case 'return':
      if (inMessages) {
        if (ui.answered.has(ui.msg)) return;
        ui.answered.add(ui.msg);
        return toast(r, snap, ui, `${ANSWERS[ui.answer]} ${snap.inbox[ui.msg]?.label} (prototype: no-op)`);
      }
      if (inParts) {
        if (!pending(here.project, ui).length) return;
        ui.confirm = true;
        break;
      }
      if (!right) ui.focus = 'right';
      break;
    case 'c':
      snap.caffeinate = CAFFEINATE[(CAFFEINATE.indexOf(snap.caffeinate) + 1) % CAFFEINATE.length]!;
      return toast(r, snap, ui, `caffeinate ${snap.caffeinate.toUpperCase()}`);
    case 'a':
      if (!inParts) return toast(r, snap, ui, `adopt ${here.kind === 'mission' ? here.mission.name : '—'} (prototype: no-op)`);
      break;
    case 'x':
      if (!inParts) return toast(r, snap, ui, `kill ${here.kind === 'session' ? here.session.id : '—'} (prototype: no-op)`);
      break;
    default:
      return;
  }
  render(r, snap, ui);
}

/** A key must never take the screen down: the toast says what broke, the log says where. */
export function onKey(r: CliRenderer, snap: Snapshot, ui: Ui, key: KeyEvent): void {
  try {
    handleKey(r, snap, ui, key);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const log = path.join(homedir(), '.factory', 'control.log');
    const entry = `${new Date().toISOString()} key=${key.name}\n${err.stack ?? err.message}\n\n`;
    void mkdir(path.dirname(log), { recursive: true }).then(() => appendFile(log, entry)).catch(() => {});
    try {
      toast(r, snap, ui, `error: ${err.message}`);
    } catch {
      // The renderer itself is gone; the log already has the stack.
    }
  }
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
      onKey(r, snap, ui, key);
    });
  });
}
