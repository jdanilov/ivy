import { C } from '../theme.js';
import { spread, type Cell } from '../format.js';
import { draftCells, type Draft } from './compose.js';
import { itemKey, windowTop, type IntentDraft, type LeftItem, type Pane, type Ui } from './pane.js';
import type { Autonomy, Intent, Project } from '../model.js';

/**
 * INTENT: the stub's own pane. A mission is created and edited here, not on the status bar, so
 * the questionnaire the Orchestrator would have asked is on screen before the session starts.
 * The fields are message-box drafts — same editor, same wrap, same cursor — one per row, kept
 * until they are saved or dropped, the way a half-written message is kept.
 */

/** The editable order `field` indexes; the last stop is the autonomy dial, which has no text. */
export const FIELDS: [key: TextField, label: string][] = [
  ['name', 'Name (lowercase slug):'],
  ['goal', 'Mission Goal:'],
  ['done', 'What done looks like (one per line):'],
  ['extra', 'Extra (guardrails, what not to touch, start from, etc.):'],
];
export type TextField = 'name' | 'goal' | 'done' | 'extra';
/** In front of every label, so a label never reads as a value. */
const MARK = '› ';
/** `field` on the dials: past the last text field, autonomy then preset. */
export const AUTONOMY_FIELD = FIELDS.length;
export const SHAPE_FIELD = FIELDS.length + 1;
export const AUTONOMY: Autonomy[] = ['full', 'partial', 'none'];
/** The Shape dial: the shipped workflows, and `auto` for the `intent` one the Orchestrator shapes. */
export const SHAPES = ['auto', 'session', 'chore', 'research', 'train', 'story'] as const;
export type Shape = (typeof SHAPES)[number];
/** A stub's workflow as the dial reads it; one the dial does not list reads `auto`, and the save
 *  only rewrites a graph when the dial was turned, so that one is left as it is. */
export const shapeOf = (workflow: string | null): Shape =>
  (SHAPES as readonly string[]).includes(workflow ?? '') ? (workflow as Shape) : 'auto';
export const workflowOf = (shape: Shape): string => (shape === 'auto' ? 'intent' : shape);

/** The row the form belongs to, and everything saving it needs: one rule, stated once, so no
 *  caller has to narrow the row again to find the project or the name. */
export interface Form {
  /** The draft's key: one per project for a new mission, one per stub for an edit. */
  key: string;
  project: Project;
  /** '' while the stub is not made: until then the name is a field of the form. */
  name: string;
  /** A stub's own graph, null for a new mission: what the Shape dial is compared against. */
  workflow: string | null;
  create: boolean;
}

/** A project row writes a new mission, a stub row edits its own; every other row has no form. */
export function formOf(here: LeftItem): Form | null {
  if (here.kind === 'project') return { key: `new ${here.project.name}`, project: here.project, name: '', workflow: null, create: true };
  if (here.kind === 'mission' && here.mission.status === 'stub') {
    return { key: itemKey(here), project: here.project, name: here.mission.name, workflow: here.mission.workflow, create: false };
  }
  return null;
}

const draft = (text: string): Draft => ({ text, cursor: text.length });

/** A form filled from the row: a stub's own files, or empty for a new mission on a project row. */
function fresh(here: LeftItem): IntentDraft {
  const m = here.kind === 'mission' ? here.mission : null;
  const i: Intent = m?.intent ?? { goal: '', done: '', extra: '' };
  return {
    name: draft(m?.name ?? ''),
    goal: draft(i.goal), done: draft(i.done), extra: draft(i.extra),
    autonomy: m?.autonomy ?? 'partial',
    shape: shapeOf(m?.workflow ?? null),
    // A stub's name is fixed, so the cursor starts on the goal instead.
    field: m ? 1 : 0,
  };
}

/** The row's draft, made on demand: from here on the pane shows it and not the file. */
export const draftFor = (ui: Ui, here: LeftItem): IntentDraft => (ui.intents[formOf(here)!.key] ??= fresh(here));

/** A draft nobody has changed yet: still the row's own files. `Esc` drops one, so the pane goes
 *  back to following `intent.md` instead of freezing against it. */
export function untouched(d: IntentDraft, here: LeftItem): boolean {
  const f = fresh(here);
  return d.autonomy === f.autonomy && d.shape === f.shape && FIELDS.every(([key]) => d[key].text === f[key].text);
}

/**
 * When the right pane is the form. A stub is edited in it, so it always is; a project row shows a
 * new mission's draft the way any row shows a draft — while it has the keys, or while it holds
 * something the row did not give it. `untouched` is the one reading of that, so the draft `Esc`
 * keeps is exactly the draft the pane goes on showing: a turned dial counts as much as typing.
 */
export function showsForm(ui: Ui, here: LeftItem): boolean {
  const form = formOf(here);
  if (form === null) return false;
  if (here.kind === 'mission' || ui.form) return true;
  const d = ui.intents[form.key];
  return d !== undefined && !untouched(d, here);
}

type PartsRow = Extract<LeftItem, { kind: 'global' | 'project' }>;

/** When the right pane is PARTS. The form outranks it on a project row, and the keys and the key
 *  bar read this rather than restate it: `space` toggling a part nobody can see was that bug.
 *  A predicate, so both callers still reach the project the pane is about. */
export const showsParts = (ui: Ui, here: LeftItem): here is PartsRow =>
  here.kind === 'global' || (here.kind === 'project' && !showsForm(ui, here));

/**
 * The form is built whole and then windowed: every field draws every line it holds — a goal is
 * read by the eye that is writing it, and a field that scrolls inside itself hides what was just
 * typed — and the pane is what moves, by the least that keeps the cursor's row on screen. The
 * header and its rule stay put, the way the left list's do.
 */
export function formPane(p: Pane, ui: Ui, here: LeftItem, h: number): void {
  const form = formOf(here);
  if (form === null) return;
  // No draft yet: a throwaway of what is on disk, so a hand edit of `intent.md` shows on the next
  // poll. Once one exists it is what the pane draws, until it is saved or dropped.
  const d = ui.intents[form.key] ?? fresh(here);
  const stub = here.kind === 'mission';

  p.row(spread([['INTENT', C.bright], [`  ${d.name.text || 'new mission'}`, C.dim]],
    [[stub ? 'stub' : 'new', C.dim]], p.width));
  p.rule();

  const rows: Cell[][] = [];
  // Where the cursor is, in drawn rows; under zero while the form has not got the keys, and then
  // the window stays where it was.
  let at = -1;
  const add = (cells: Cell[], cursor = false): void => {
    if (cursor) at = rows.length;
    rows.push(cells);
  };

  // A stub's name is drawn and never focused — `field` never lands on 0 there — because renaming
  // a stub means renaming its folder, and delete-and-remake is that path.
  for (const [i, [field, label]] of FIELDS.entries()) {
    const active = ui.form && d.field === i;
    add([[MARK + label, active ? C.accent : C.dim]]);
    const text = draftCells(d[field], p.width, active, Infinity);
    text.rows.forEach((cells, row) => { add(cells, active && row === text.at); });
    add([]); // a blank row between one input and the next label
  }

  const onAutonomy = ui.form && d.field === AUTONOMY_FIELD;
  const onShape = ui.form && d.field === SHAPE_FIELD;
  add(dial('Autonomy:', AUTONOMY, d.autonomy, onAutonomy), onAutonomy);
  add([]);
  add([]); // a dial has no input under it, so two blank rows keep the two apart
  add(dial('Shape:', SHAPES, d.shape, onShape), onShape);

  const room = Math.max(0, h - 2);
  ui.formTop = windowTop(ui.formTop, at, rows.length, room);
  for (const cells of rows.slice(ui.formTop, ui.formTop + room)) p.row(cells);
}


/** One row: the label, then every option with the chosen one bright and, on the dial, the cursor. */
function dial<T extends string>(label: string, options: readonly T[], value: T, on: boolean): Cell[] {
  return [[MARK + label, on ? C.accent : C.dim], ['  ', C.dim],
    ...options.flatMap((option, i): Cell[] => [
      ...(i ? ([[' | ', C.rule]] as Cell[]) : []),
      [option, option === value ? C.bright : C.dim, on && option === value],
    ])];
}
