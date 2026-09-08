import { BoxRenderable, TextRenderable, type CliRenderer } from '@opentui/core';
import { C } from '../theme.js';
import { line, type Cell } from '../format.js';
import { home } from '../../core/projects.js';
import type { Mission, Project, ScopeChoice, Session, Snapshot } from '../model.js';

/**
 * What every pane shares: the Ui state it reads, the rows the left column lists — one of which the
 * right pane and the foot are about — and the fixed-width column a pane draws its rows into.
 */

export interface Ui {
  focus: 'left' | 'right';
  left: number;
  msg: number;
  part: number;
  /** What `↵` would apply: install or not on a project row, the chosen scope on the global one. */
  toggles: Record<string, boolean | ScopeChoice>;
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
  ({ kind: 'global', project: { name: 'Global', path: home(), missions: [], sessions: [], parts: snap.global } });

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

/**
 * The rows and the one the right pane and the foot are about. The screen and the keys both need it,
 * and both would otherwise clamp `ui.left` themselves: one clamp, one owner.
 */
export function select(snap: Snapshot, ui: Ui): { items: LeftItem[]; here: LeftItem } {
  const items = leftItems(snap, ui.showArchived);
  ui.left = clamp(ui.left, items.length);
  return { items, here: items[ui.left]! };
}

/** Identity of a row, so the selection survives a list that changed under it. */
export function itemKey(item: LeftItem): string {
  return item.kind === 'inbox' ? 'inbox'
    : item.kind === 'global' ? 'global'
    : item.kind === 'project' ? `p ${item.project.name}`
    : item.kind === 'mission' ? `m ${item.project.name}/${item.mission.name}`
    : `s ${item.session.id}`;
}

export function clamp(i: number, n: number): number {
  return n === 0 ? 0 : Math.min(Math.max(i, 0), n - 1);
}

/** A column of rows drawn at a fixed width, so a selected row inverts edge to edge. */
export function column(r: CliRenderer, width: number, extra: Record<string, unknown> = {}) {
  const box = new BoxRenderable(r, { flexDirection: 'column', overflow: 'hidden', ...extra });
  const row = (cells: Cell[], selected = false): void => {
    box.add(new TextRenderable(r, { content: line(cells, width, selected), flexShrink: 0 }));
  };
  return { box, width, row, rule: () => row([['─'.repeat(width), C.rule]]) };
}

export type Pane = ReturnType<typeof column>;

/** Two cells: the arrow a selection keeps while the focus is in the other pane, or room for it. */
export function marker(selected: boolean, focused: boolean): Cell {
  return [selected && !focused ? '› ' : '  ', C.dim];
}
