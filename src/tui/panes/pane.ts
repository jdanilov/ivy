import { BoxRenderable, TextRenderable, type CliRenderer } from '@opentui/core';
import { C } from '../theme.js';
import { line, type Cell } from '../format.js';
import { home } from '../../core/projects.js';
import type { Autonomy, DaemonRow, Mission, Project, ScopeChoice, Session, Snapshot } from '../model.js';
import type { Draft } from './compose.js';
import type { Shape } from './form.js';

/**
 * What every pane shares: the Ui state it reads, the rows the left column lists — one of which the
 * right pane and the foot are about — and the fixed-width column a pane draws its rows into.
 */

export interface Ui {
  focus: 'left' | 'right';
  left: number;
  /** The first row of the left list drawn under its fixed header: the pane moves it by the least
   *  that keeps the selected row on screen, so walking down scrolls one row at a time. */
  top: number;
  msg: number;
  part: number;
  /** What `↵` would apply: install or not on a project row, the chosen scope on the global one. */
  toggles: Record<string, boolean | ScopeChoice>;
  confirm: boolean;
  /** How much of the screen the foot has: a third of the body, the whole screen, or its tab row
   *  alone. The drawn tab's own key walks the three. */
  size: 'third' | 'full' | 'min';
  /** Rows the full-height foot is scrolled back from its own foot. Zero everywhere else. */
  scroll: number;
  help: boolean;
  /** Which pane the foot draws. Activity is the session's own account of itself, so it comes first. */
  foot: 'decisions' | 'activity';
  /** How many rows each foot pane had when it was last opened or left, for the selection `at`:
   *  the `+N` on a tab is what came in since. `foot` is the pane the last frame drew. */
  seen: { at: string; foot: Ui['foot'] | null; decisions: number; activity: number };
  showArchived: boolean;
  toast: string | null;
  /** A line being typed on the status bar; `done` gets it on ↵, empty when nothing was typed. */
  input: { label: string; value: string; done: (value: string) => void } | null;
  /** The keys are the message box's; the drafts stay by row whether or not they are. */
  compose: boolean;
  drafts: Record<string, Draft>;
  /** The keys are the intent form's. */
  form: boolean;
  /** One intent draft per row, kept like a message draft: a stub row by its own key, a new
   *  mission under `new <project>`, so a project row shows what has been typed for it. */
  intents: Record<string, IntentDraft>;
}

/** The intent form's own state: a draft per field, the dial, and which field has the cursor. */
export interface IntentDraft {
  name: Draft;
  goal: Draft;
  done: Draft;
  extra: Draft;
  autonomy: Autonomy;
  /** The Shape dial: `auto` leaves the graph to the Orchestrator, a name is that preset's graph. */
  shape: Shape;
  /** Indexes the editable order `name goal done extra autonomy shape`. */
  field: number;
}

export function newUi(): Ui {
  return {
    focus: 'left', left: 0, top: 0, msg: 0, part: 0, toggles: {}, confirm: false, size: 'third',
    scroll: 0, help: false, foot: 'activity', seen: { at: '', foot: null, decisions: 0, activity: 0 },
    showArchived: false, toast: null, input: null, compose: false, drafts: {},
    form: false, intents: {},
  };
}

/** One selectable row of the left pane. The right pane is whatever this points at. */
export type LeftItem =
  | { kind: 'inbox' }
  | { kind: 'global'; project: Project }
  | { kind: 'project'; project: Project }
  | { kind: 'mission'; project: Project; mission: Mission }
  | { kind: 'session'; project: Project; session: Session }
  | { kind: 'daemon'; project: Project; daemon: DaemonRow };

/** The user's own parts as a project row: one PARTS pane, one apply path, the home dir as its root. */
const globalRow = (snap: Snapshot): LeftItem =>
  ({ kind: 'global', project: { name: 'Global', path: home(), missions: [], sessions: [], daemons: [], parts: snap.global } });

export function leftItems(snap: Snapshot, showArchived = false): LeftItem[] {
  return [
    { kind: 'inbox' },
    globalRow(snap),
    ...snap.projects.flatMap((project): LeftItem[] => [
      { kind: 'project', project },
      // What the project runs by itself first, then the work it has, then the tabs open on it:
      // the daemons are the rows a glance is for, and they are the ones that never move.
      ...project.daemons.map((daemon): LeftItem => ({ kind: 'daemon', project, daemon })),
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
    : item.kind === 'daemon' ? `d ${item.daemon.key}`
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
