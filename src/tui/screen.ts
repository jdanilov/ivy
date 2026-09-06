import { BoxRenderable, TextRenderable, createCliRenderer, type CliRenderer, type KeyEvent } from '@opentui/core';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { C, GLYPH, stateColor, stepColor } from './theme.js';
import { ago, clock, dur, id, len, line, spread, tokens, wrap, type Cell } from './format.js';
import { notify } from './notify.js';
// Prototype only: `n` fakes an arrival so the bell and the notification can be tested. Goes with wiring.
import { arrival } from './fixture.js';
import type { Activity, Attention, Caffeinate, InboxItem, Mission, Project, Session, Snapshot } from './model.js';

const ANSWERS = ['accept', 'amend', 'reject'] as const;
const CAFFEINATE: Caffeinate[] = ['auto', 'on', 'off'];
const ATTENTION: Attention[] = ['full', 'light', 'unattended'];

/** Chrome rows: blank, header, rule, status, rule — rule, key bar. The key bar sits on the last
 *  terminal row: a row left undrawn under it reads as a gap the screen forgot to fill. */
const CHROME = 7;
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
  full: boolean;
  help: boolean;
  hideClosed: boolean;
  toast: string | null;
}

export function newUi(): Ui {
  return {
    focus: 'left', left: 0, msg: 0, part: 0, answer: 0, answered: new Set(), toggles: {},
    confirm: false, full: false, help: false, hideClosed: false, toast: null,
  };
}

/** One selectable row of the left pane. The right pane is whatever this points at. */
export type LeftItem =
  | { kind: 'inbox' }
  | { kind: 'project'; project: Project }
  | { kind: 'mission'; project: Project; mission: Mission }
  | { kind: 'session'; project: Project; session: Session };

export function leftItems(snap: Snapshot, hideClosed = false): LeftItem[] {
  return [
    { kind: 'inbox' },
    ...snap.projects.flatMap((project): LeftItem[] => [
      { kind: 'project', project },
      ...project.missions
        .filter((mission) => !(hideClosed && mission.status === 'closed'))
        .map((mission): LeftItem => ({ kind: 'mission', project, mission })),
      ...project.sessions.map((session): LeftItem => ({ kind: 'session', project, session })),
    ]),
  ];
}

/** Identity of a row, so the selection survives a list that changed under it. */
function itemKey(item: LeftItem): string {
  return item.kind === 'inbox' ? 'inbox'
    : item.kind === 'project' ? `p ${item.project.name}`
    : item.kind === 'mission' ? `m ${item.project.name}/${item.mission.name}`
    : `s ${item.session.id}`;
}

/** What the right pane and the activity pane are about. */
function subject(here: LeftItem): string {
  return here.kind === 'inbox' ? 'all projects'
    : here.kind === 'project' ? here.project.name
    : here.kind === 'mission' ? here.mission.name
    : here.session.preset;
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
  return [selected && !focused ? '›  ' : '   ', C.dim];
}

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
    ['attention ', C.dim], [m.attention, C.dim], ['   ', C.dim],
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

/** Keys read uppercase and are pressed either way; `?` is the first thing dropped when the
 *  terminal is too narrow, because the overlay it opens lists everything anyway. */
function keyBar(p: Pane, here: LeftItem, ui: Ui): void {
  const right = ui.focus === 'right';
  const pairs: string[][] =
    !right ? [['↑↓', 'Select'], ['↵', 'Open'], ['O', 'Tab'], ['X', 'Kill'], ['C', 'Caffeinate'],
      ['Z', 'Closed'], ['F', 'Activity'], ['?', 'Help'], ['Q', 'Quit']]
    // ←→ pick the answer in Messages, so only esc leaves that one.
    : here.kind === 'inbox' ? [['↑↓', 'Select'], ['←→', 'Answer'], ['↵', 'Confirm'], ['esc', 'Back'],
      ['F', 'Activity'], ['?', 'Help'], ['Q', 'Quit']]
    : here.kind === 'project' && ui.confirm ? [['Y', 'Confirm'], ['N', 'Cancel'], ['esc', 'Back'], ['Q', 'Quit']]
    : here.kind === 'project' ? [['↑↓', 'Select'], ['Space', 'Toggle'], ['↵', 'Apply'],
      ...(pending(here.project, ui).length ? [['R', 'Reset']] : []), ['←esc', 'Back'], ['?', 'Help'], ['Q', 'Quit']]
    : [['←esc', 'Back'], ['C', 'Caffeinate'], ['F', 'Activity'], ['?', 'Help'], ['Q', 'Quit']];

  const cells = (list: string[][]): Cell[] =>
    list.flatMap(([key, label]) => [[`${key} `, C.bright], [`${label}  `, C.dim]] as Cell[]);
  const full = cells(pairs);
  p.row(len(full) <= p.width ? full : cells(pairs.filter(([key]) => key !== '?')));
}

// ── left pane ─────────────────────────────────────────────────────────────────

function missionRow(p: Pane, m: Mission, selected: boolean, focused: boolean): void {
  const quiet = m.status !== 'open';
  const tail: Cell[] =
    m.status === 'stub' ? [['  stub', C.dim]]
    : m.status === 'closed' ? [[`  closed ${ago(m.closedAt ?? Date.now())}`, C.dim]]
    : [['  ', C.dim], [m.workflow, C.dim], ['  ', C.dim], [m.step ?? '—', C.bright], [m.round ? ` ↻${m.round}` : '', C.dim]];
  const right: Cell[] = m.status === 'open'
    ? [[dur(m.wall), C.dim], ['  ', C.dim], [tokens(m.tokens.input + m.tokens.cached + m.tokens.output), C.dim]]
    : [];
  const cells: Cell[] = [marker(selected, focused), [' ', C.dim], [`${GLYPH[m.state]} `, stateColor(m.state)], [m.name, quiet ? C.dim : C.bright]];
  p.row(spread([...cells, ...tail], right, p.width), selected && focused);
}

function sessionRow(p: Pane, s: Session, selected: boolean, focused: boolean): void {
  p.row([
    marker(selected, focused), [' ', C.dim], ['○ ', C.dim], [s.preset, C.bright], ['  unbound  ', C.dim],
    [id(s.id), C.dim], [`  idle ${dur(Date.now() - s.idleSince)}`, C.dim],
  ], selected && focused);
}

function leftPane(p: Pane, items: LeftItem[], snap: Snapshot, ui: Ui): void {
  const hidden = ui.hideClosed
    ? snap.projects.reduce((n, project) => n + project.missions.filter((m) => m.status === 'closed').length, 0) : 0;
  p.row([['PROJECTS', C.bright], [hidden ? `  ${hidden} closed hidden` : '', C.dim]]);
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
    p.row([marker(selected, focused), ...head], selected && focused);
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
  p.row([['step ', C.dim], [m.step ?? '—', C.bright], [' · role ', C.dim], [step?.role ?? '—', C.bright],
    [' · round ', C.dim], [`${m.round}`, C.bright], [' · attention ', C.dim], [m.attention, C.bright]]);
  p.row([['branch ', C.dim], [m.branch ?? '—', C.bright], [' · wt ', C.dim], [m.worktree ?? '—', C.bright]]);
  p.row([['session ', C.dim], [m.session ? id(m.session) : '—', C.bright], [' · caffeinate ', C.dim], [m.caffeinate ? 'on' : 'off', C.bright]]);
  p.row([['deviations ', C.dim], [`${m.deviations}`, C.bright]]);
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

// ── activity ──────────────────────────────────────────────────────────────────

const VERB: Record<Activity['verb'], string> = {
  Bash: C.bright, Edit: C.bright, Read: C.dim, Agent: C.implement, Text: C.bright, Ask: C.warning, Stop: C.success,
};

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
  else map.set(here.session.id, here.session.preset);
  return map;
}

/** Newest at the bottom, oldest scrolled off: the log reads the way it was written. */
function activityPane(p: Pane, snap: Snapshot, here: LeftItem, h: number, sep: boolean): void {
  if (sep) p.rule();
  const owners = sessionsOf(snap, here);
  const rows = snap.activity.filter((a) => owners.has(a.session)).sort((a, b) => a.at - b.at);
  const merged = owners.size > 1;

  p.row(spread([['ACTIVITY', C.bright], [`  ${subject(here)}`, C.dim]], [[`${rows.length}`, C.dim]], p.width));
  p.rule();
  const room = Math.max(0, h - (sep ? 3 : 2));
  for (const a of rows.slice(Math.max(0, rows.length - room))) {
    p.row([
      [`${clock(a.at)}  `, C.dim], ...(merged ? ([[(owners.get(a.session) ?? '').padEnd(9), C.dim]] as Cell[]) : []),
      [a.verb.padEnd(7), VERB[a.verb]], [a.text, a.verb === 'Text' || a.verb === 'Ask' ? C.bright : C.dim],
    ]);
  }
  for (let i = Math.min(rows.length, room); i < room; i++) p.row([]);
}

// ── help ──────────────────────────────────────────────────────────────────────

/** Every key the screen answers, by the pane it belongs to. One row per line of the panel. */
const HELP: [group: string, keys: [string, string][]][] = [
  ['Global', [['↑↓', 'Select'], ['↵', 'Open'], ['→', 'Enter pane'], ['←esc', 'Back'], ['?', 'Help'], ['Q', 'Quit']]],
  ['', [['C', 'Caffeinate'], ['N', 'Simulate arrival (prototype)']]],
  ['Projects', [['Z', 'Hide closed'], ['O', 'Open tab'], ['X', 'Kill']]],
  ['Messages', [['↑↓', 'Select'], ['←→', 'Choose answer'], ['↵', 'Confirm'], ['esc', 'Back']]],
  ['Parts', [['Space', 'Toggle'], ['↵', 'Apply'], ['R', 'Reset'], ['Y', 'Confirm'], ['N', 'Cancel']]],
  ['Mission', [['T', 'Attention full → light → unattended']]],
  ['Activity', [['F', 'Full height'], ['↵', 'Back to the columns']]],
];

const GROUP_W = 10;

function helpPanel(r: CliRenderer): void {
  const rows = HELP.map(([group, keys]): Cell[] =>
    [[group.padEnd(GROUP_W), C.bright], ...keys.flatMap(([k, label]) => [[`${k} `, C.accent], [`${label}   `, C.dim]] as Cell[])]);
  const inner = Math.min(r.terminalWidth - 6, Math.max(...rows.map(len)));
  const height = rows.length + 4;

  const box = new BoxRenderable(r, {
    position: 'absolute', zIndex: 10, flexDirection: 'column', overflow: 'hidden',
    left: Math.max(0, Math.floor((r.terminalWidth - inner - 4) / 2)),
    top: Math.max(0, Math.floor((r.terminalHeight - height) / 2)),
    width: inner + 4, height, paddingLeft: 1, paddingRight: 1,
    border: true, borderStyle: 'single', borderColor: C.rule, backgroundColor: C.panel,
  });
  const put = (cells: Cell[]): void => { box.add(new TextRenderable(r, { content: line(cells, inner), flexShrink: 0 })); };
  put([['KEYS', C.bright]]);
  put([['─'.repeat(inner), C.rule]]);
  rows.forEach(put);
  r.root.add(box);
}

// ── render ────────────────────────────────────────────────────────────────────

export function render(r: CliRenderer, snap: Snapshot, ui: Ui): void {
  // remove() detaches without freeing the native text buffer and yoga node behind every row:
  // a few hundred keypresses exhaust the allocator and the process dies. destroy frees them.
  // The copy matters: destroy() takes the child out of the live array we would be walking.
  for (const child of [...r.root.getChildren()]) child.destroyRecursively();

  const w = r.terminalWidth - 2;
  const items = leftItems(snap, ui.hideClosed);
  ui.left = clamp(ui.left, items.length);
  const here = items[ui.left]!;

  // Everything under the status rule and above the key-bar rule. Activity keeps a third of it,
  // or all of it on `f`, and the columns take what is left.
  const region = Math.max(0, r.terminalHeight - CHROME);
  const actH = ui.full ? region : Math.min(region, Math.max(5, Math.floor(region / 3)));
  const bodyH = region - actH;

  // The key bar sits on the last row and no box carries a background, so every cell the screen
  // does not colour keeps the terminal's own.
  const root = column(r, w, { width: r.terminalWidth, height: r.terminalHeight, paddingLeft: 1, paddingRight: 1 });
  root.row([]);
  header(root, here, snap);
  root.rule();
  statusBar(root, snap, here, ui);
  root.rule();

  if (bodyH > 0) {
    const leftW = Math.max(30, Math.floor(w * 0.4));
    const rightW = w - leftW - 1;
    const body = new BoxRenderable(r, { flexDirection: 'row', height: bodyH, flexShrink: 0, overflow: 'hidden' });
    // Two cells of padding keep the left pane's right-aligned tokens off the divider.
    const left = column(r, leftW - 2, { width: leftW, paddingRight: 2 });
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
  }
  activityPane(root, snap, here, actH, bodyH > 0);

  root.rule();
  keyBar(root, here, ui);
  r.root.add(root.box);
  if (ui.help) helpPanel(r);
}

// ── keys ──────────────────────────────────────────────────────────────────────

function toast(r: CliRenderer, snap: Snapshot, ui: Ui, text: string): void {
  ui.toast = text;
  render(r, snap, ui);
  setTimeout(() => { ui.toast = null; render(r, snap, ui); }, 2000);
}

/** Every action is in memory: the prototype shows what would happen, it does nothing. */
export function handleKey(r: CliRenderer, snap: Snapshot, ui: Ui, key: KeyEvent): void {
  // The overlay is a read: the next key puts it away, whatever it was.
  if (ui.help) { ui.help = false; return render(r, snap, ui); }
  if (key.name === '?') { ui.help = true; return render(r, snap, ui); }

  const items = leftItems(snap, ui.hideClosed);
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
      // In Messages ←→ walk the answer row; everywhere else → is a second ↵.
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
      // The columns are gone while Activity is full: ↵ brings them back before it does anything.
      if (ui.full) { ui.full = false; break; }
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
    case 'r':
      if (inParts) ui.toggles = {};
      break;
    case 'f':
      ui.full = !ui.full;
      break;
    case 'z': {
      ui.hideClosed = !ui.hideClosed;
      const next = leftItems(snap, ui.hideClosed);
      const found = next.findIndex((item) => itemKey(item) === itemKey(here));
      ui.left = found >= 0 ? found : clamp(ui.left, next.length);
      break;
    }
    case 't': {
      if (here.kind !== 'mission') break;
      const m = here.mission;
      m.attention = ATTENTION[(ATTENTION.indexOf(m.attention) + 1) % ATTENTION.length]!;
      return toast(r, snap, ui, `${m.name} attention ${m.attention}`);
    }
    case 'n': {
      // Stands in for the watcher the wiring step adds: the arrival path is the one being tested.
      const item = arrival();
      snap.inbox.push(item);
      notify(item);
      return toast(r, snap, ui, `arrival ${item.project}/${item.origin} ${item.label}`);
    }
    case 'c':
      snap.caffeinate = CAFFEINATE[(CAFFEINATE.indexOf(snap.caffeinate) + 1) % CAFFEINATE.length]!;
      return toast(r, snap, ui, `caffeinate ${snap.caffeinate.toUpperCase()} [${awake(snap) ? 'ON' : 'OFF'}]`);
    case 'o':
      if (!right) return toast(r, snap, ui, `open tab ${here.kind === 'mission' ? here.mission.name : here.kind === 'session' ? id(here.session.id) : '—'} (prototype: no-op)`);
      break;
    case 'x':
      if (!right) return toast(r, snap, ui, `kill ${here.kind === 'session' ? id(here.session.id) : '—'} (prototype: no-op)`);
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
  const r = await createCliRenderer({ exitOnCtrlC: true, targetFps: 30 });
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
