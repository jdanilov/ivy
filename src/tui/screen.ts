import {
  BoxRenderable, InputRenderable, InputRenderableEvents, TextRenderable, createCliRenderer,
  type CliRenderer, type KeyEvent,
} from '@opentui/core';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { C, GLYPH, stateColor, stepColor } from './theme.js';
import { ago, clock, dur, id, len, line, spread, tokens, wrap, type Cell } from './format.js';
import { answerGate, applyParts, killSession, openTab, setAttention, setCaffeinate } from './actions.js';
import type { Activity, Attention, Caffeinate, InboxItem, Mission, Project, Session, Snapshot } from './model.js';

const ANSWERS = ['accept', 'amend', 'reject'] as const;
const CAFFEINATE: Caffeinate[] = ['auto', 'on', 'off'];
const ATTENTION: Attention[] = ['full', 'light', 'unattended'];

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
  answer: number;
  answered: Set<number>;
  toggles: Record<string, boolean>;
  confirm: boolean;
  full: boolean;
  /** Rows the full-height log is scrolled back from its foot. Zero everywhere else. */
  scroll: number;
  help: boolean;
  hideClosed: boolean;
  toast: string | null;
  /** Open while a rejected or amended gate is waiting for its one-line note. */
  note: { verdict: 'amend' | 'reject'; text: string } | null;
}

export function newUi(): Ui {
  return {
    focus: 'left', left: 0, msg: 0, part: 0, answer: 0, answered: new Set(), toggles: {},
    confirm: false, full: false, scroll: 0, help: false, hideClosed: false, toast: null, note: null,
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
export function itemKey(item: LeftItem): string {
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
  const word = m.status === 'stub' ? 'STUB' : m.status === 'closed' ? 'CLOSED' : m.state.toUpperCase();
  const left: Cell[] = [[`${GLYPH[m.state]} `, stateColor(m.state)], [word, C.bright]];
  const count: Cell[] = total ? [['  ', C.dim], [`${done}/${total}`, C.bright]] : [];
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
    // The panel and the full log each take the screen: their bars list what still answers.
    ui.help ? [['? esc', 'Back'], ['Q', 'Quit']] :
    ui.full ? [['↑↓', 'Scroll'], ['↵ f esc', 'Back'], ['Q', 'Quit']] :
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

/** What the branch is worth so far. Absent until the first `git diff` behind the snapshot lands. */
function diffCells(m: Mission): Cell[] {
  if (!m.diff) return [];
  return [['  ', C.dim], [`+${m.diff.added}`, C.success], [` −${m.diff.removed}`, C.error]];
}

function missionRow(p: Pane, m: Mission, selected: boolean, focused: boolean): void {
  const quiet = m.status !== 'open';
  const tail: Cell[] =
    m.status === 'stub' ? [['  stub', C.dim]]
    : m.status === 'closed' ? [[`  closed ${ago(m.closedAt ?? Date.now())}`, C.dim]]
    : [['  ', C.dim], [m.workflow, C.dim], ['  ', C.dim], [m.step ?? '—', C.bright], [m.round ? ` ↻${m.round}` : '', C.dim]];
  const right: Cell[] = m.status === 'open'
    ? [[dur(m.wall), C.dim], ['  ', C.dim], [tokens(m.tokens.input + m.tokens.cached + m.tokens.output), C.dim], ...diffCells(m)]
    : [];
  const cells: Cell[] = [marker(selected, focused), [' ', C.dim], [`${GLYPH[m.state]} `, stateColor(m.state)], [m.name, quiet ? C.dim : C.bright]];
  p.row(spread([...cells, ...tail], right, p.width), selected && focused);
}

function sessionRow(p: Pane, s: Session, selected: boolean, focused: boolean): void {
  p.row([
    marker(selected, focused), [' ', C.dim], ['○ ', C.dim], [s.preset, C.bright], ['  ', C.dim],
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
    // Nothing under a heading reads as a screen that failed to load: the hint names the way out,
    // indented where the row it stands in for would be.
    if (item.kind === 'project' && item.project.missions.length === 0) {
      p.row([['    no missions · factory mission new <name>', C.dim]]);
    }
  });
  if (snap.projects.length === 0) {
    p.row([]);
    p.row([['   no projects · factory install <path>', C.dim]]);
  }
}

// ── messages ──────────────────────────────────────────────────────────────────

function messagesPane(r: CliRenderer, p: Pane, snap: Snapshot, ui: Ui, h: number): void {
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
  if (item) messageDetail(r, p, item, ui, h - 3 - items.length);
}

/** Sits at the foot of the pane: `pad` blank rows push it there, one more separates it. */
function answerRow(r: CliRenderer, p: Pane, ui: Ui, answered: boolean, pad: number): void {
  for (let i = 0; i <= pad; i++) p.row([]);
  if (answered) return p.row([['✓ answered', C.success]]);
  if (ui.note) return notePrompt(r, p, ui.note);
  p.row(ANSWERS.flatMap((a, i) => [[` ${a} `, C.bright, ui.focus === 'right' && i === ui.answer], ['  ', C.dim]] as Cell[]));
}

/** An amend or a reject is a sentence, not a verdict: the input takes it where the verdicts were. */
function notePrompt(r: CliRenderer, p: Pane, note: NonNullable<Ui['note']>): void {
  p.row([[`${note.verdict} `, C.warning], ['note', C.bright], ['   ↵ record · esc cancel', C.dim]]);
  const input = new InputRenderable(r, {
    width: p.width, flexShrink: 0, value: note.text,
    placeholder: 'one line', textColor: C.bright, placeholderColor: C.dim, cursorColor: C.accent,
  });
  // The text lives in the Ui, so a rebuild under the human's hands redraws what they have typed.
  input.on(InputRenderableEvents.INPUT, (value: string) => { note.text = value; });
  p.box.add(input);
  input.focus();
}

function messageDetail(r: CliRenderer, p: Pane, item: InboxItem, ui: Ui, h: number): void {
  const answered = ui.answered.has(ui.msg);
  const room = Math.max(0, h - 3);

  if (item.kind === 'gate') {
    p.row([[item.file ?? '', C.bright], [` (${item.lines} lines)`, C.dim]]);
    const body = (item.body ?? []).flatMap((l) => (l ? wrap(l, p.width, 4) : ['']));
    for (const l of body.slice(0, room)) p.row([[l, C.dim]]);
    return answerRow(r, p, ui, answered, room - Math.min(body.length, room));
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
  answerRow(r, p, ui, answered, Math.max(0, room - plan.length));
}

// ── mission and session ───────────────────────────────────────────────────────

function missionPane(p: Pane, m: Mission): void {
  const done = m.steps.filter((s) => s.status === 'done').length;
  p.row(spread([['MISSION', C.bright], [`  ${m.name}`, C.dim]], m.steps.length ? [[`${done}/${m.steps.length}`, C.dim]] : [], p.width));
  p.rule();

  for (const s of m.steps) {
    const cells: Cell[] = [
      [' ', C.dim], [`${GLYPH[s.status]} `, stateColor(s.status)], [s.name, stepColor(s.kind)],
      ...(s.gateOpen ? ([['  ⊘', C.warning]] as Cell[]) : []),
    ];
    const spend = s.tokens ? s.tokens.input + s.tokens.cached + s.tokens.output : 0;
    // A duration is only news for a step that is getting somewhere: skipped, failed and blocked
    // all measure a time nobody wants, and the word is what the row is for.
    const timed = s.status === 'running' || s.status === 'done';
    p.row(spread(cells, [[spend ? `${tokens(spend)}  ` : '', C.dim], [timed && s.wall ? dur(s.wall) : s.status, C.dim]], p.width));
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
    const selected = i === ui.part;
    const changed = on !== (part.status !== 'not-installed');
    // A part whose files no longer match the Factory is neither installed nor available: `update` fixes it.
    const word = status === 'modified' ? 'modified' : on ? 'installed' : 'available';
    const cells: Cell[] = [
      marker(selected, ui.focus === 'right'), [part.name.padEnd(16), C.bright], [part.type.padEnd(9), C.dim],
      [`${on ? '●' : '○'} ${word.padEnd(11)}`, status === 'modified' ? C.warning : on ? C.success : C.dim],
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
  Bash: C.bright, Edit: C.bright, Read: C.dim, Agent: C.agent, Text: C.bright, Ask: C.warning,
  Tool: C.dim, Stop: C.success,
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

/** Newest at the bottom, oldest scrolled off: the log reads the way it was written. `↑↓` walk
 *  back through it while it is full, and the clamp lives here because only this knows the room. */
function activityPane(p: Pane, snap: Snapshot, here: LeftItem, h: number, sep: boolean, ui: Ui): void {
  if (sep) p.rule();
  const owners = sessionsOf(snap, here);
  const rows = snap.activity.filter((a) => owners.has(a.session)).sort((a, b) => a.at - b.at);
  const merged = owners.size > 1;

  p.row(spread([['ACTIVITY', C.bright], [`  ${subject(here)}`, C.dim]], [[`${rows.length}`, C.dim]], p.width));
  p.rule();
  const room = Math.max(0, h - (sep ? 3 : 2));
  ui.scroll = ui.full ? Math.max(0, Math.min(ui.scroll, rows.length - room)) : 0;
  const end = rows.length - ui.scroll;
  for (const a of rows.slice(Math.max(0, end - room), end)) {
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
  ['', [['C', 'Caffeinate']]],
  ['Projects', [['Z', 'Hide closed'], ['O', 'Open tab'], ['X', 'Kill']]],
  ['Messages', [['↑↓', 'Select'], ['←→', 'Choose answer'], ['↵', 'Confirm'], ['esc', 'Back']]],
  ['Parts', [['Space', 'Toggle'], ['↵', 'Apply'], ['R', 'Reset'], ['Y', 'Confirm'], ['N', 'Cancel']]],
  ['Mission', [['T', 'Attention full → light → unattended']]],
  ['Activity', [['F', 'Full height'], ['↑↓', 'Scroll'], ['↵', 'Back to the columns']]],
];

const GROUP_W = 10;

/** The screen explains itself once, to the human who opened it before reading any doc. */
const PRIMER = [
  'A mission is one unit of work: its own branch, its workflow copied in as a graph.',
  'The Orchestrator session grills you, writes the intent, and runs the steps.',
  'Gates stop for the human: one waits in MESSAGES until you answer it.',
  'Gatekeepers check work they did not write: the Verifier and the Validator.',
  '`mission close` merges the branch and files what the mission learned.',
];

/** Not an overlay: while `?` is open this is the right pane, at the full height of the body. */
function helpPane(p: Pane): void {
  p.row([['KEYS', C.bright]]);
  p.rule();
  for (const [group, keys] of HELP) {
    p.row([[group.padEnd(GROUP_W), C.bright],
      ...keys.flatMap(([k, label]) => [[`${k} `, C.accent], [`${label}   `, C.dim]] as Cell[])]);
  }
  p.row([]);
  p.rule();
  p.row([['HOW FACTORY WORKS', C.bright]]);
  for (const text of PRIMER) for (const l of wrap(text, p.width, 2)) p.row([[l, C.dim]]);
  p.row([]);
  p.row([['Next: ', C.dim], ['factory mission new <name>', C.bright], [' in a project, or ', C.dim],
    ['/mission', C.bright], [' in a session.', C.dim]]);
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
  // the columns take the rest — and either one takes all of it: `f` gives the log the screen,
  // `?` gives the body to the panel, which needs the height to say anything worth reading.
  const region = Math.max(0, r.terminalHeight - (ui.full ? FULL_CHROME : CHROME));
  const actH = ui.full ? region : ui.help ? 0 : Math.min(region, Math.max(5, Math.floor(region / 3)));
  const bodyH = region - actH;

  // The key bar sits on the last row and no box carries a background, so every cell the screen
  // does not colour keeps the terminal's own.
  const root = column(r, w, { width: r.terminalWidth, height: r.terminalHeight, paddingLeft: 1, paddingRight: 1 });
  root.row([]);
  // Full activity is the log and nothing else: the header and the status bar are rows it can have.
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
    if (ui.help) helpPane(right);
    else if (here.kind === 'inbox') messagesPane(r, right, snap, ui, bodyH);
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
  if (actH > 0) activityPane(root, snap, here, actH, bodyH > 0, ui);

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

/** Where a message came from: the Inbox names its project, the action needs the checkout. */
function projectOf(snap: Snapshot, name: string): string {
  const project = snap.projects.find((p) => p.name === name);
  if (!project) throw new Error(`no project ${name}`);
  return project.path;
}

/** ↵ on a gate: `accept` goes straight through, the other two come back here with the note. */
function record(app: App, verdict: (typeof ANSWERS)[number], note: string): void {
  const { snap, ui } = app;
  const item = snap.inbox[ui.msg];
  if (!item) return;
  const row = ui.msg;
  ui.note = null;
  // The tick is the record, not the attempt: a refused gate leaves the row open for another try.
  act(app, `${verdict} ${item.label}…`, async () => {
    const done = await answerGate(projectOf(snap, item.project), item, verdict, note);
    ui.answered.add(row);
    return done;
  });
}

export function handleKey(app: App, key: KeyEvent): void {
  const { snap, ui } = app;

  // The input owns the keyboard while a note is open: only these two are the screen's.
  if (ui.note) {
    if (key.name === 'escape') { ui.note = null; return draw(app); }
    if (key.name === 'return') return record(app, ui.note.verdict, ui.note.text.trim());
    return;
  }

  // The panel holds the right pane until it is asked to leave; nothing else acts behind it.
  if (ui.help) {
    if (key.name !== '?' && key.name !== 'escape') return;
    ui.help = false;
    return draw(app);
  }
  if (key.name === '?') { ui.help = true; return draw(app); }

  // The log has the screen to itself: the arrows walk back through it, three keys hand it back.
  if (ui.full) {
    if (key.name === 'up' || key.name === 'k') ui.scroll += 1;
    else if (key.name === 'down' || key.name === 'j') ui.scroll = Math.max(0, ui.scroll - 1);
    else if (key.name === 'return' || key.name === 'f' || key.name === 'escape') ui.full = false;
    else return;
    return draw(app);
  }

  const items = leftItems(snap, ui.hideClosed);
  ui.left = clamp(ui.left, items.length);
  const here = items[ui.left]!;
  const right = ui.focus === 'right';
  const inMessages = right && here.kind === 'inbox';
  const inParts = right && here.kind === 'project';
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
    case 'return': {
      if (inMessages) {
        const item = snap.inbox[ui.msg];
        if (!item || ui.answered.has(ui.msg)) return;
        // A question is a turn in someone else's session; only its tab can answer it.
        if (item.kind === 'question') return toast(app, `answer ${item.origin} in tab ${item.tab ?? '—'}`);
        const verdict = ANSWERS[ui.answer]!;
        if (verdict === 'accept') return record(app, verdict, '');
        ui.note = { verdict, text: '' };
        break;
      }
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
      // The log opens at its foot, wherever the last visit left the scroll.
      ui.full = true;
      ui.scroll = 0;
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
      // Shown at once, written behind it: the rebuild that follows reads state.json back.
      m.attention = ATTENTION[(ATTENTION.indexOf(m.attention) + 1) % ATTENTION.length]!;
      return act(app, `${m.name} attention ${m.attention}…`, () => setAttention(here.project.path, m.name, m.attention));
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
    const log = path.join(homedir(), '.factory', 'control.log');
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
    // A redraw destroys the note input and what the human had typed into it: the next key redraws.
    if (!app.ui.note) draw(app);
  });

  await new Promise<void>((done) => {
    r.keyInput.on('keypress', (key: KeyEvent) => {
      if (key.name === 'q' && !app.ui.note) {
        watcher?.close();
        r.destroy();
        return done();
      }
      onKey(app, key);
    });
  });
}
