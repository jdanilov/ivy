import {
  BoxRenderable, TextRenderable, createCliRenderer, type CliRenderer, type KeyEvent,
} from '@opentui/core';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { C, GLYPH, stateColor, stepColor } from './theme.js';
import { ago, clock, dur, id, len, line, spread, tokens, wrap, type Cell } from './format.js';
import { applyParts, archive, killSession, openTab, setAutonomy, setCaffeinate } from './actions.js';
import { factoryHome, home } from '../core/projects.js';
import { runnerLabel } from '../core/workflow.js';
import type {
  Activity, Autonomy, Caffeinate, Decision, InboxItem, Mission, Project, Session, Snapshot,
} from './model.js';

const CAFFEINATE: Caffeinate[] = ['auto', 'on', 'off'];
const AUTONOMY: Autonomy[] = ['full', 'partial', 'none'];

/** Chrome rows: blank, header, rule, status, rule — rule, key bar. The key bar sits on the last
 *  terminal row: a row left undrawn under it reads as a gap the screen forgot to fill. */
const CHROME = 7;
/** Full activity keeps the blank row, the rule and the key bar, and gives the log everything else. */
const FULL_CHROME = 3;
/** Factory's own mark. Single-width in a monospace font, unlike most of the geometric glyphs. */
const BRAND = '⌬';

export interface Ui {
  focus: 'left' | 'right';
  left: number;
  msg: number;
  part: number;
  toggles: Record<string, boolean>;
  confirm: boolean;
  full: boolean;
  /** Rows the full-height foot is scrolled back from its own foot. Zero everywhere else. */
  scroll: number;
  help: boolean;
  /** Which pane the foot draws. Decisions is what a mission is waiting to be read for. */
  foot: 'decisions' | 'activity';
  showArchived: boolean;
  toast: string | null;
}

export function newUi(): Ui {
  return {
    focus: 'left', left: 0, msg: 0, part: 0, toggles: {}, confirm: false, full: false,
    scroll: 0, help: false, foot: 'decisions', showArchived: false, toast: null,
  };
}

/** One selectable row of the left pane. The right pane is whatever this points at. */
export type LeftItem =
  | { kind: 'inbox' }
  | { kind: 'global'; project: Project }
  | { kind: 'project'; project: Project }
  | { kind: 'mission'; project: Project; mission: Mission }
  | { kind: 'session'; project: Project; session: Session };

/** The user's own parts as a project row: one PARTS pane, one apply path, the home dir as its root. */
const globalRow = (snap: Snapshot): LeftItem =>
  ({ kind: 'global', project: { name: '~ global', path: home(), missions: [], sessions: [], parts: snap.global } });

export function leftItems(snap: Snapshot, showArchived = false): LeftItem[] {
  return [
    { kind: 'inbox' },
    globalRow(snap),
    ...snap.projects.flatMap((project): LeftItem[] => [
      { kind: 'project', project },
      ...project.missions
        .filter((mission) => showArchived || !mission.archived)
        .map((mission): LeftItem => ({ kind: 'mission', project, mission })),
      ...project.sessions.map((session): LeftItem => ({ kind: 'session', project, session })),
    ]),
  ];
}

/** Identity of a row, so the selection survives a list that changed under it. */
export function itemKey(item: LeftItem): string {
  return item.kind === 'inbox' ? 'inbox'
    : item.kind === 'global' ? 'global'
    : item.kind === 'project' ? `p ${item.project.name}`
    : item.kind === 'mission' ? `m ${item.project.name}/${item.mission.name}`
    : `s ${item.session.id}`;
}

/** What the right pane and the foot pane are about. */
function subject(here: LeftItem): string {
  return here.kind === 'inbox' ? 'all projects'
    : here.kind === 'session' ? here.session.preset
    : here.kind === 'mission' ? here.mission.name
    : here.project.name;
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
  const word = m.status === 'stub' ? 'STUB' : m.status === 'closed' ? 'CLOSED' : m.state.toUpperCase();
  const left: Cell[] = [[`${GLYPH[m.state]} `, stateColor(m.state)], [word, C.bright]];
  const count: Cell[] = total ? [['  ', C.dim], [`${done}/${total}`, C.bright]] : [];
  const metrics: Cell[] = [
    ['autonomy ', C.dim], [m.autonomy, C.dim], ['   ', C.dim],
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
  if (here.kind === 'global') {
    const on = here.project.parts.filter((part) => part.status !== 'not-installed').length;
    return p.row([[`${on}/${here.project.parts.length} `, C.bright], ['installed in ', C.dim],
      [path.join(here.project.path, '.claude'), C.bright], ['  ·  the user\'s own parts, in every project', C.dim]]);
  }
  return summary(p, here.project.missions);
}

/** Keys read uppercase and are pressed either way; `?` is the first thing dropped when the
 *  terminal is too narrow, because the overlay it opens lists everything anyway. */
function keyBar(p: Pane, here: LeftItem, ui: Ui): void {
  const right = ui.focus === 'right';
  const parts = here.kind === 'project' || here.kind === 'global';
  const foot: string[][] = ui.foot === 'decisions' ? [['A', 'Activity'], ['F', 'Full']] : [['D', 'Decisions'], ['F', 'Full']];
  const pairs: string[][] =
    // The panel and the full foot each take the screen: their bars list what still answers.
    ui.help ? [['? esc', 'Back'], ['Q', 'Quit']] :
    ui.full ? [['↑↓', 'Scroll'], ['↵ f esc', 'Back'], ['Q', 'Quit']] :
    !right ? [['↑↓', 'Select'], ['↵', 'Open'], ['O', 'Tab'], ['X', 'Kill'], ['T', 'Autonomy'],
      ['H', 'Archive'], ['Z', 'Archived'], ['C', 'Caffeinate'], ...foot, ['?', 'Help'], ['Q', 'Quit']]
    : here.kind === 'inbox' ? [['↑↓', 'Select'], ['←esc', 'Back'], ...foot, ['?', 'Help'], ['Q', 'Quit']]
    : parts && ui.confirm ? [['Y', 'Confirm'], ['N', 'Cancel'], ['esc', 'Back'], ['Q', 'Quit']]
    : parts ? [['↑↓', 'Select'], ['Space', 'Toggle'], ['↵', 'Apply'],
      ...(pending(here.project, ui).length ? [['R', 'Reset'], ['esc', 'Discard']] : [['←esc', 'Back']]), ['?', 'Help'], ['Q', 'Quit']]
    : [['←esc', 'Back'], ['C', 'Caffeinate'], ...foot, ['?', 'Help'], ['Q', 'Quit']];

  const cells = (list: string[][]): Cell[] =>
    list.flatMap(([key, label]) => [[`${key} `, C.bright], [`${label}  `, C.dim]] as Cell[]);
  const full = cells(pairs);
  p.row(len(full) <= p.width ? full : cells(pairs.filter(([key]) => key !== '?')));
}

// ── left pane ─────────────────────────────────────────────────────────────────

/** What the branch is worth so far. Absent until the first `git diff` behind the snapshot lands. */
function diffCells(m: Mission): Cell[] {
  if (!m.diff) return [];
  return [['  ', C.dim], [`+${m.diff.added}`, C.success], [` −${m.diff.removed}`, C.error]];
}

function missionRow(p: Pane, m: Mission, selected: boolean, focused: boolean): void {
  const quiet = m.status !== 'open';
  const tail: Cell[] =
    m.archived ? [['  archived', C.dim]]
    : m.status === 'stub' ? [['  stub', C.dim]]
    : m.status === 'closed' ? [[`  closed ${ago(m.closedAt ?? Date.now())}`, C.dim]]
    : [['  ', C.dim], [m.workflow, C.dim], ['  ', C.dim], [m.step ?? '—', C.bright], [m.round ? ` ↻${m.round}` : '', C.dim]];
  const right: Cell[] = m.status === 'open'
    ? [[dur(m.wall), C.dim], ['  ', C.dim], [tokens(m.tokens.input + m.tokens.cached + m.tokens.output), C.dim], ...diffCells(m)]
    : [];
  const cells: Cell[] = [marker(selected, focused), [' ', C.dim], [`${GLYPH[m.state]} `, stateColor(m.state)], [m.name, quiet ? C.dim : C.bright]];
  p.row(spread([...cells, ...tail], right, p.width), selected && focused);
}

/** Named by what it is, not by its preset: a bare `quick` under a project reads as a mission. */
function sessionRow(p: Pane, s: Session, selected: boolean, focused: boolean): void {
  p.row([
    marker(selected, focused), [' ', C.dim], ['○ ', C.dim], ['session', C.bright], [' · ', C.rule],
    [s.preset, C.dim], ['  ', C.dim], [id(s.id), C.dim], [`  idle ${dur(Date.now() - s.idleSince)}`, C.dim],
  ], selected && focused);
}

function leftPane(p: Pane, items: LeftItem[], snap: Snapshot, ui: Ui): void {
  const hidden = ui.showArchived
    ? 0 : snap.projects.reduce((n, project) => n + project.missions.filter((m) => m.archived).length, 0);
  p.row([['PROJECTS', C.bright], [hidden ? `  ${hidden} archived hidden` : '', C.dim]]);
  p.rule();

  const focused = ui.focus === 'left';
  items.forEach((item, i) => {
    const selected = i === ui.left;
    if (item.kind === 'mission') return missionRow(p, item.mission, selected, focused);
    if (item.kind === 'session') return sessionRow(p, item.session, selected, focused);
    const open = snap.inbox.length;
    if (i > 1) p.row([]); // a blank line between the Inbox, the global row and each project
    const head: Cell[] = item.kind === 'inbox'
      ? [['Inbox', C.bright], [` (${open})`, open ? C.warning : C.dim]]
      : [[item.project.name, item.kind === 'global' ? C.dim : C.bright]];
    p.row([marker(selected, focused), ...head], selected && focused);
    // Nothing under a heading reads as a screen that failed to load: the hint names the way out,
    // indented where the row it stands in for would be. A session row is something under it.
    if (item.kind === 'project' && item.project.missions.length === 0 && item.project.sessions.length === 0) {
      p.row([['    no missions · factory mission new <name>', C.dim]]);
    }
  });
  if (snap.projects.length === 0) {
    p.row([]);
    p.row([['   no projects · factory install <path>', C.dim]]);
  }
}

// ── messages ──────────────────────────────────────────────────────────────────

function messagesPane(p: Pane, snap: Snapshot, ui: Ui, h: number): void {
  const items = snap.inbox;
  p.row([['MESSAGES', C.bright], [` (${items.length})`, C.dim]]);
  p.rule();

  items.forEach((item, i) => {
    const selected = i === ui.msg;
    const cells: Cell[] = [
      marker(selected, ui.focus === 'right'), ['⊘ ', C.warning],
      [`${item.project}/${item.origin}`, C.bright], ['  ', C.dim], [item.label, C.dim],
    ];
    p.row(spread(cells, [[ago(item.at), C.dim]], p.width), selected && ui.focus === 'right');
  });

  p.rule();
  const item = items[ui.msg];
  if (item) messageDetail(p, item, h - 3 - items.length);
}

/** Read-only, on purpose: one answer path, the session that raised it, and the CLI records it. */
function messageDetail(p: Pane, item: InboxItem, h: number): void {
  const room = Math.max(1, h - 3);

  if (item.kind === 'gate') {
    p.row([[item.file ?? '', C.bright], [` (${item.lines} lines)`, C.dim]]);
    const body = (item.body ?? []).flatMap((l) => (l ? wrap(l, p.width, 4) : ['']));
    for (const l of body.slice(0, room - 1)) p.row([[l, C.dim]]);
  } else {
    for (const text of (item.text ?? '').split('\n')) for (const l of wrap(text, p.width, room)) p.row([[l, C.bright]]);
  }

  p.row([]);
  // Warp cannot focus a tab from outside; the name is what the human types into its tab switcher.
  if (item.kind === 'question') return p.row([['answer in tab ', C.dim], [item.tab ?? '—', C.bright]]);
  p.row([['answer in the session: ', C.dim], [item.answer ?? '', C.bright]]);
}

// ── mission and session ───────────────────────────────────────────────────────

/** Who runs a step, and with what: `runnerLabel` is the one place the pair is worded. */
const runner = (s: { role: string } | undefined): string => (s === undefined ? '—' : runnerLabel(s.role));

/** The four facts, label column and value column, so they read as a table without one being drawn. */
const LABEL = 13;
const DOT: Cell = [' · ', C.rule];

function fact(p: Pane, label: string, cells: Cell[]): void {
  p.row([[label.padEnd(LABEL), C.dim], ...cells]);
}

function missionPane(p: Pane, m: Mission): void {
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
    // `310.2K` then `2h 14m`, each right-aligned in its own width: the graph reads down, not ragged.
    const spent = spend ? tokens(spend) : '';
    const took = timed && s.wall ? dur(s.wall) : s.status;
    p.row(spread(cells, [[spent.padStart(8), C.dim], [took.padStart(9), C.dim]], p.width));
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

/** The parts `↵` would install and the ones it would remove: the toggles the manifest disagrees with. */
function changes(project: Project, ui: Ui): { add: string[]; drop: string[] } {
  const moved = project.parts.filter((part) => partStatus(part.name, part.status, ui) !== part.status);
  return {
    add: moved.filter((part) => ui.toggles[part.name] === true).map((part) => part.name),
    drop: moved.filter((part) => ui.toggles[part.name] === false).map((part) => part.name),
  };
}

function pending(project: Project, ui: Ui): string[] {
  const { add, drop } = changes(project, ui);
  return [...add.map((name) => `install ${name}`), ...drop.map((name) => `uninstall ${name}`)];
}

function partsPane(p: Pane, project: Project, ui: Ui): void {
  const parts = project.parts;
  const installed = parts.filter((part) => partStatus(part.name, part.status, ui) !== 'not-installed').length;
  const changes = pending(project, ui);
  p.row([
    ['PARTS', C.bright], [`  ${project.name}`, C.dim], [`  ${installed}/${parts.length}`, C.dim],
    [changes.length ? `  ±${changes.length}` : '', C.accent],
  ]);
  p.rule();

  parts.forEach((part, i) => {
    const status = partStatus(part.name, part.status, ui);
    const on = status !== 'not-installed';
    const selected = i === ui.part && ui.focus === 'right';
    const changed = on !== (part.status !== 'not-installed');
    // A part whose files no longer match the Factory is neither installed nor available: `update` fixes it.
    const word = status === 'modified' ? 'modified' : on ? 'installed' : 'available';
    const head: Cell[] = [
      marker(i === ui.part, ui.focus === 'right'), [part.name.padEnd(16), C.bright], [part.type.padEnd(9), C.dim],
      [`${on ? '●' : '○'} ${word.padEnd(11)}`, status === 'modified' ? C.warning : on ? C.success : C.dim],
    ];
    // What a part is for is the one thing worth reading here, so it wraps under itself, never
    // cut; three rows takes the longest description any part ships.
    const indent = len(head);
    const body = wrap(part.description, Math.max(20, p.width - indent - 2), 3);
    p.row(spread([...head, [body[0] ?? '', C.dim]], [[changed ? '±' : ' ', C.accent]], p.width), selected);
    for (const text of body.slice(1)) p.row([[' '.repeat(indent), C.dim], [text, C.dim]], selected);
  });

  p.rule();
  if (ui.confirm) {
    return p.row([['apply: ', C.dim], [changes.join(', '), C.bright], ['   Y ', C.accent], ['Confirm  ', C.dim], ['N ', C.accent], ['Cancel', C.dim]]);
  }
  // The files of the selected part, until something is pending: then the way out is what matters.
  if (changes.length > 0) return p.row([['↵ ', C.accent], ['Apply', C.dim], DOT, ['Esc ', C.accent], ['Discard', C.dim]]);
  for (const file of parts[ui.part]?.files ?? []) p.row([[file, C.dim]]);
}

// ── foot: decisions and activity ──────────────────────────────────────────────

const VERB: Record<Activity['verb'], string> = {
  Bash: C.bright, Edit: C.bright, Read: C.dim, Agent: C.agent, Text: C.bright, Ask: C.warning,
  Tool: C.dim, Stop: C.success,
};

/** Newest last, oldest scrolled off: both foot panes read the way they were written, and `↑↓`
 *  walk back through them while the foot is full. The clamp lives here because only this knows
 *  the room, and the pad below keeps the rule under the pane on its own row. */
function visible<T>(rows: T[], room: number, ui: Ui): T[] {
  ui.scroll = ui.full ? Math.max(0, Math.min(ui.scroll, rows.length - room)) : 0;
  const end = rows.length - ui.scroll;
  return rows.slice(Math.max(0, end - room), end);
}

const pad = (p: Pane, shown: number, room: number): void => {
  for (let i = shown; i < room; i++) p.row([]);
};

/** Which missions the selection covers: a mission is one, a project its own, the Inbox every one. */
function missionsOf(snap: Snapshot, here: LeftItem): Mission[] {
  return here.kind === 'inbox' ? snap.projects.flatMap((project) => project.missions)
    : here.kind === 'mission' ? [here.mission]
    : here.kind === 'project' ? here.project.missions : [];
}

/** Where a decision stands, left of its id: a blank margin is a fork nobody was asked about. */
const VERDICT: Record<Decision['status'], [glyph: string, color: string]> = {
  waiting: ['·', C.warning], accepted: ['✓', C.success], overruled: ['✗', C.error], auto: [' ', C.dim],
};

/** How sure the agent was, as one glyph: the word costs a column and says no more than the colour. */
const SURE: Record<Decision['confidence'], string> = { LOW: C.error, MEDIUM: C.warning, HIGH: C.info };

/**
 * `✓ D15 ● what was decided`: the verdict, the id, the confidence, then the decision itself. The
 * summary wraps under its own column instead of being cut, so a row copies whole into the session
 * that answers it. An `auto` row is a record, not a question, so it reads dim end to end.
 */
function decisionLines(mission: string | null, d: Decision, width: number): Cell[][] {
  const auto = d.status === 'auto';
  const [glyph, color] = VERDICT[d.status];
  const head: Cell[] = [
    [`${glyph} `, color], [d.id.padEnd(5), auto ? C.dim : C.bright],
    ['● ', auto ? C.dim : SURE[d.confidence]],
    ...(mission === null ? [] : ([[mission.padEnd(10), C.dim]] as Cell[])),
  ];
  // An overruled row without its note reads as a verdict with no reason.
  const said = d.status === 'overruled' && d.note !== '' ? `${d.summary} — ${d.note}` : d.summary;
  // Four rows is a paragraph already; nothing a foot pane is read for runs longer.
  const indent = len(head);
  const body = wrap(said, Math.max(20, width - indent), 4);
  return body.map((text, i): Cell[] => i === 0
    ? [...head, [text, auto ? C.dim : C.bright]]
    : [[' '.repeat(indent), C.dim], [text, auto ? C.dim : C.bright]]);
}

function decisionsPane(p: Pane, snap: Snapshot, here: LeftItem, room: number, ui: Ui): void {
  const missions = missionsOf(snap, here);
  const rows = missions.flatMap((m) => m.decisions.map((d): [string, Decision] => [m.name, d]));
  const waiting = rows.filter(([, d]) => d.status === 'waiting').length;

  p.row(spread([['DECISIONS', C.bright], [`  ${subject(here)}`, C.dim]],
    [[waiting ? `${waiting} waiting  ` : '', C.warning], [`${rows.length}`, C.dim]], p.width));
  p.rule();
  // A wrapped row is more lines than rows, so the scroll and the room are counted in lines.
  const lines = rows.flatMap(([name, d]) => decisionLines(missions.length > 1 ? name : null, d, p.width));
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
  if (here.kind === 'inbox') snap.projects.forEach(add);
  else if (here.kind === 'project') add(here.project);
  else if (here.kind === 'mission') { if (here.mission.session) map.set(here.mission.session, here.mission.name); }
  else if (here.kind === 'session') map.set(here.session.id, here.session.preset);
  return map;
}

function activityPane(p: Pane, snap: Snapshot, here: LeftItem, room: number, ui: Ui): void {
  const owners = sessionsOf(snap, here);
  const rows = snap.activity.filter((a) => owners.has(a.session)).sort((a, b) => a.at - b.at);
  const merged = owners.size > 1;

  p.row(spread([['ACTIVITY', C.bright], [`  ${subject(here)}`, C.dim]], [[`${rows.length}`, C.dim]], p.width));
  p.rule();
  const shown = visible(rows, room, ui);
  for (const a of shown) {
    p.row([
      [`${clock(a.at)}  `, C.dim], ...(merged ? ([[(owners.get(a.session) ?? '').padEnd(9), C.dim]] as Cell[]) : []),
      [a.verb.padEnd(7), VERB[a.verb]], [a.text, a.verb === 'Text' || a.verb === 'Ask' ? C.bright : C.dim],
    ]);
  }
  pad(p, shown.length, room);
}

/** The pane along the foot, whichever one `A` and `D` last chose. `F` gives it the whole screen. */
function footPane(p: Pane, snap: Snapshot, here: LeftItem, h: number, sep: boolean, ui: Ui): void {
  if (sep) p.rule();
  const room = Math.max(0, h - (sep ? 3 : 2));
  if (ui.foot === 'activity') return activityPane(p, snap, here, room, ui);
  decisionsPane(p, snap, here, room, ui);
}

// ── help ──────────────────────────────────────────────────────────────────────

/** Every key the screen answers, one key to a line on screen, under the pane it belongs to. */
const HELP: [group: string, key: string, does: string][] = [
  ['Global', '↑↓', 'Move the selection'], ['', '→', 'Enter the right pane'],
  ['', '↵', 'Open the selection, or apply what is pending'], ['', '←', 'Back to the left column'],
  ['', 'esc', 'Back, or discard the pending toggles first'], ['', 'C', 'Caffeinate auto → on → off'],
  ['', '?', 'This panel'], ['', 'Q', 'Quit'],
  ['Projects', 'O', 'Open the mission\'s Warp tab'], ['', 'X', 'Kill its session, again within 5s to SIGKILL'],
  ['', 'T', 'Autonomy full → partial → none'], ['', 'H', 'Archive a closed mission, or bring it back'],
  ['', 'Z', 'Show the archived ones'],
  ['Messages', '↑↓', 'Read what waits — every one answers in its session'],
  ['Parts', 'Space', 'Toggle a part'], ['', 'Y', 'Confirm the apply'],
  ['', 'N', 'Cancel it'], ['', 'R', 'Reset the toggles'],
  ['Foot', 'D', 'Decisions, the forks this mission took'], ['', 'A', 'Activity, what its session did'],
  ['', 'F', 'Either at full height, ↑↓ scrolls'],
];

/** The words the screen uses, in the colours it draws them in — the four step families first,
 *  each in the colour the graph gives it, so the panel doubles as the legend for a graph row. */
const TERMS: [term: string, color: string, means: string][] = [
  ['human', stepColor('human'), 'a step that stops for you: intent, merge'],
  ['gatekeeper', stepColor('gatekeeper'), 'work checked by whoever did not write it: verify, validate'],
  ['agent', stepColor('agent'), 'a sub-agent with its own context: implement, research'],
  ['technical', stepColor('technical'), 'the Orchestrator\'s own bookkeeping: spec, an ungated merge'],
  ['mission', C.bright, 'one unit of work: a branch, a folder, a workflow copied in as its graph'],
  ['workflow', C.bright, 'the ordered steps; add, skip and loop bend one mission\'s copy'],
  ['gate', C.warning, 'a step that stops until the human answers it — accept, amend, reject'],
  ['round', C.bright, 'one pass through a loop: gatekeepers check, the work resumes'],
  ['decision', C.bright, 'a fork an agent took, filed with a confidence: auto, or waiting on you'],
  ['autonomy', C.bright, 'which confidences wait: full none, partial LOW, none every one'],
];

const GROUP_W = 10;
const TERM_W = 11;

/** The screen explains itself once, to the human who opened it before reading any doc. */
const PRIMER = [
  'A mission is one unit of work: its own branch, its workflow copied in as a graph.',
  'Gates stop for the human; a decision waits when its confidence is under the dial.',
];

/**
 * Not an overlay: while `?` is open this is the right pane, at the full height of the body. The
 * keys and the terms are what it was opened for, so the primer is what a short terminal loses.
 */
function helpPane(p: Pane, h: number): void {
  const rule: Cell[] = [['─'.repeat(p.width), C.rule]];
  const lines: Cell[][] = [
    [['KEYS', C.bright]], rule,
    ...HELP.map(([group, key, does]): Cell[] =>
      [[group.padEnd(GROUP_W), C.bright], [key.padEnd(7), C.accent], [does, C.dim]]),
    rule, [['TERMS', C.bright]],
    ...TERMS.map(([term, color, means]): Cell[] => [[term.padEnd(TERM_W), color], [means, C.dim]]),
  ];
  const primer: Cell[][] = [
    rule, [['HOW FACTORY WORKS', C.bright]],
    ...PRIMER.flatMap((text) => wrap(text, p.width, 2).map((l): Cell[] => [[l, C.dim]])),
  ];
  // All of the primer or none of it: a heading with one line under it says less than the rows
  // it costs, and a sentence cut in half says nothing at all.
  const all = h >= lines.length + primer.length ? [...lines, ...primer] : lines;
  for (const cells of all.slice(0, h)) p.row(cells);
}

// ── render ────────────────────────────────────────────────────────────────────

export function render(r: CliRenderer, snap: Snapshot, ui: Ui): void {
  // remove() detaches without freeing the native text buffer and yoga node behind every row:
  // a few hundred keypresses exhaust the allocator and the process dies. destroy frees them.
  // The copy matters: destroy() takes the child out of the live array we would be walking.
  for (const child of [...r.root.getChildren()]) child.destroyRecursively();

  const w = r.terminalWidth - 2;
  const items = leftItems(snap, ui.showArchived);
  ui.left = clamp(ui.left, items.length);
  const here = items[ui.left]!;

  // Everything under the status rule and above the key-bar rule. The foot keeps a third of it,
  // the columns take the rest — and either one takes all of it: `f` gives the foot the screen,
  // `?` gives the body to the panel, which needs the height to say anything worth reading.
  const region = Math.max(0, r.terminalHeight - (ui.full ? FULL_CHROME : CHROME));
  const actH = ui.full ? region : ui.help ? 0 : Math.min(region, Math.max(5, Math.floor(region / 3)));
  const bodyH = region - actH;

  // The key bar sits on the last row and no box carries a background, so every cell the screen
  // does not colour keeps the terminal's own.
  const root = column(r, w, { width: r.terminalWidth, height: r.terminalHeight, paddingLeft: 1, paddingRight: 1 });
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
    else if (here.kind === 'project' || here.kind === 'global') partsPane(right, here.project, ui);
    else if (here.kind === 'mission') missionPane(right, here.mission);
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

// ── keys ──────────────────────────────────────────────────────────────────────

/** The screen as one thing a key can act on: the snapshot moves under it, the Ui persists. */
export interface App { r: CliRenderer; ui: Ui; snap: Snapshot }

export const draw = (app: App): void => render(app.r, app.snap, app.ui);

/** Only the newest toast clears itself: an action's result must not be wiped by its own "doing". */
let toasted = 0;

function toast(app: App, text: string): void {
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
function act(app: App, doing: string, fn: () => Promise<string>): void {
  toast(app, doing);
  void fn().then(
    (done) => toast(app, done),
    (e: unknown) => toast(app, `✗ ${e instanceof Error ? e.message : String(e)}`),
  );
}

export function handleKey(app: App, key: KeyEvent): void {
  const { snap, ui } = app;

  // The panel holds the right pane until it is asked to leave; nothing else acts behind it.
  if (ui.help) {
    if (key.name !== '?' && key.name !== 'escape') return;
    ui.help = false;
    return draw(app);
  }
  if (key.name === '?') { ui.help = true; return draw(app); }

  // The foot has the screen to itself: the arrows walk back through it, three keys hand it back.
  if (ui.full) {
    if (key.name === 'up' || key.name === 'k') ui.scroll += 1;
    else if (key.name === 'down' || key.name === 'j') ui.scroll = Math.max(0, ui.scroll - 1);
    else if (key.name === 'return' || key.name === 'f' || key.name === 'escape') ui.full = false;
    else if (key.name === 'a') ui.foot = 'activity';
    else if (key.name === 'd') ui.foot = 'decisions';
    else return;
    return draw(app);
  }

  const items = leftItems(snap, ui.showArchived);
  ui.left = clamp(ui.left, items.length);
  const here = items[ui.left]!;
  const right = ui.focus === 'right';
  const inMessages = right && here.kind === 'inbox';
  const inParts = right && (here.kind === 'project' || here.kind === 'global');
  const move = (i: number, n: number, delta: number) => clamp(i + delta, n);

  if (inParts && ui.confirm) {
    if (key.name === 'y') {
      const { add, drop } = changes(here.project, ui);
      ui.toggles = {};
      ui.confirm = false;
      return act(app, `applying ${add.length + drop.length} change(s)…`, () => applyParts(here.project.path, add, drop));
    }
    if (key.name === 'n' || key.name === 'escape') ui.confirm = false;
    return draw(app);
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
      ui.focus = 'right';
      break;
    case 'left':
      ui.focus = 'left';
      break;
    case 'escape':
      // Esc is the way out of a set of toggles nobody applied; a second one leaves the pane.
      if (inParts && pending(here.project, ui).length > 0) ui.toggles = {};
      else ui.focus = 'left';
      break;
    case 'space':
      if (inParts) {
        const part = here.project.parts[ui.part];
        if (part) ui.toggles[part.name] = partStatus(part.name, part.status, ui) !== 'installed';
      }
      break;
    case 'return': {
      // Every message is answered in the session that raised it; the row says which command.
      if (inMessages) return;
      if (inParts) {
        if (!pending(here.project, ui).length) return;
        ui.confirm = true;
        break;
      }
      if (!right) ui.focus = 'right';
      break;
    }
    case 'r':
      if (inParts) ui.toggles = {};
      break;
    case 'f':
      // The foot opens at its own foot, wherever the last visit left the scroll.
      ui.full = true;
      ui.scroll = 0;
      break;
    case 'a':
      ui.foot = 'activity';
      break;
    case 'd':
      ui.foot = 'decisions';
      break;
    case 'z': {
      ui.showArchived = !ui.showArchived;
      const next = leftItems(snap, ui.showArchived);
      const found = next.findIndex((item) => itemKey(item) === itemKey(here));
      ui.left = found >= 0 ? found : clamp(ui.left, next.length);
      break;
    }
    case 'h': {
      if (right) break;
      if (here.kind !== 'mission') return toast(app, 'select a mission to archive it');
      const m = here.mission;
      if (m.status !== 'closed') return toast(app, `${m.name} is ${m.status} — close it first`);
      return act(app, `${m.archived ? 'unarchiving' : 'archiving'} ${m.name}…`,
        () => archive(here.project.path, m.name, m.archived));
    }
    case 't': {
      if (here.kind !== 'mission') break;
      const m = here.mission;
      // Shown at once, written behind it: the rebuild that follows reads state.json back.
      m.autonomy = AUTONOMY[(AUTONOMY.indexOf(m.autonomy) + 1) % AUTONOMY.length]!;
      return act(app, `${m.name} autonomy ${m.autonomy}…`, () => setAutonomy(here.project.path, m.name, m.autonomy));
    }
    case 'c': {
      snap.caffeinate = CAFFEINATE[(CAFFEINATE.indexOf(snap.caffeinate) + 1) % CAFFEINATE.length]!;
      const mode = snap.caffeinate;
      return act(app, `caffeinate ${mode.toUpperCase()}…`, () => setCaffeinate(mode));
    }
    case 'o':
      if (right) break;
      if (here.kind !== 'mission') return toast(app, 'select a mission to open its tab');
      return act(app, `opening ${here.mission.name}…`, () => openTab(here.project.path, here.mission.name));
    case 'x': {
      if (right) break;
      const session = here.kind === 'mission' ? here.mission.session : here.kind === 'session' ? here.session.id : null;
      if (!session) return toast(app, 'no session on this row');
      return act(app, `killing ${id(session)}…`, () => killSession(session));
    }
    default:
      return;
  }
  draw(app);
}

/** A key must never take the screen down: the toast says what broke, the log says where. */
export function onKey(app: App, key: KeyEvent): void {
  try {
    handleKey(app, key);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const log = path.join(factoryHome(), 'control.log');
    const entry = `${new Date().toISOString()} key=${key.name}\n${err.stack ?? err.message}\n\n`;
    void mkdir(path.dirname(log), { recursive: true }).then(() => appendFile(log, entry)).catch(() => {});
    try {
      toast(app, `error: ${err.message}`);
    } catch {
      // The renderer itself is gone; the log already has the stack.
    }
  }
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
      if (key.name === 'q') {
        watcher?.close();
        r.destroy();
        return done();
      }
      onKey(app, key);
    });
  });
}
