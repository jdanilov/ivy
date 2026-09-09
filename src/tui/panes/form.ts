import { C } from '../theme.js';
import type { Cell } from '../format.js';
import { draftCells, type Draft } from './compose.js';
import { windowTop, type LeftItem, type Pane, type Ui } from './pane.js';
import { INTENT } from './intent.js';
import { SERVICE } from './service.js';

/**
 * The form engine. Two things are filled in on the right pane — a mission's intent, a project's
 * daemon or service — and everything but their fields is the same: the walk over the stops, the
 * dials, the draft-per-row editing, the pane that scrolls under a fixed header, the cursor put
 * back on what a save refused. So a form is a `Def` and nothing else: the rows it draws, the
 * title over them and the draft it starts from. Nothing here knows which form it is drawing.
 */

export type FormKind = 'intent' | 'service';

/** One drawn row: a text field, or a dial when it has `options`. `off` is a row this kind of
 *  entry has no use for and is not drawn at all; `fixed` is drawn and never focused — a stub's
 *  name, which is already a folder and a branch; `line` is a field that holds one line, where
 *  `↵` walks on instead of breaking it. */
export interface Field {
  key: string;
  label: string;
  options?: readonly string[];
  off?: boolean;
  fixed?: boolean;
  line?: boolean;
}

/** A form's own state: a draft per text field, a value per dial, and which field has the cursor.
 *  Kept per row like a message draft, so a look at another row does not throw away what was typed. */
export interface FormDraft {
  texts: Record<string, Draft>;
  dials: Record<string, string>;
  /** Indexes `fields`; it never lands on one that is `off` or `fixed`. */
  field: number;
}

/** One form: which row it belongs to, what it draws there, and the draft it starts from. `fields`
 *  and `title` are read on every keystroke, so a dial can turn which rows the form even has. */
export interface Def {
  /** The draft's key on this row — one per row — or null when this form is not that row's. */
  key: (here: LeftItem) => string | null;
  fresh: (here: LeftItem) => FormDraft;
  title: (here: LeftItem, d: FormDraft, width: number) => Cell[];
  fields: (here: LeftItem, d: FormDraft) => Field[];
}

const DEFS: Record<FormKind, Def> = { intent: INTENT, service: SERVICE };

export const defOf = (kind: FormKind): Def => DEFS[kind];

/** In front of every label, so a label never reads as a value. */
const MARK = '› ';

export const draft = (text: string): Draft => ({ text, cursor: text.length });

/** The row's draft, made on demand: from here on the pane shows it and not the file. */
export const draftFor = (ui: Ui, kind: FormKind, here: LeftItem): FormDraft =>
  (ui.forms[DEFS[kind].key(here)!] ??= DEFS[kind].fresh(here));

/** A draft nobody has changed yet: still the row's own files. `Esc` drops one, so the pane goes
 *  back to following `intent.md` instead of freezing against it. */
export function untouched(kind: FormKind, d: FormDraft, here: LeftItem): boolean {
  const f = DEFS[kind].fresh(here);
  return Object.entries(f.texts).every(([key, text]) => d.texts[key]?.text === text.text)
    && Object.entries(f.dials).every(([key, value]) => d.dials[key] === value);
}

/**
 * Which form the right pane draws on this row, if any. The one holding the keys comes first; then
 * a stub, whose pane is its intent whatever else is going on; then a draft the row was given and
 * nobody saved — a turned dial counts as much as typing, so what `Esc` keeps is what goes on
 * being shown.
 */
export function showsForm(ui: Ui, here: LeftItem): FormKind | null {
  if (ui.form !== null && DEFS[ui.form].key(here) !== null) return ui.form;
  for (const kind of Object.keys(DEFS) as FormKind[]) {
    const key = DEFS[kind].key(here);
    if (key === null) continue;
    if (here.kind === 'mission') return kind;
    const d = ui.forms[key];
    if (d !== undefined && !untouched(kind, d, here)) return kind;
  }
  return null;
}

type PartsRow = Extract<LeftItem, { kind: 'global' | 'project' }>;

/** When the right pane is PARTS. A form outranks it on a project row, and the keys and the key
 *  bar read this rather than restate it: `space` toggling a part nobody can see was that bug.
 *  A predicate, so both callers still reach the project the pane is about. */
export const showsParts = (ui: Ui, here: LeftItem): here is PartsRow =>
  here.kind === 'global' || (here.kind === 'project' && showsForm(ui, here) === null);

/** The fields the cursor stops on, in order: what `⇥`, `⇧⇥` and `⇧↵` walk, and whose last one
 *  `⇧↵` saves from. */
export const stops = (fields: Field[]): number[] =>
  fields.flatMap((f, i) => (f.off === true || f.fixed === true ? [] : [i]));

/** Where one of a form's rows is: what a save that refuses a field puts the cursor on. */
export const fieldAt = (kind: FormKind, here: LeftItem, d: FormDraft, key: string): number =>
  DEFS[kind].fields(here, d).findIndex((f) => f.key === key);

/** The field the cursor is on, for the key bar: `←→` turns a dial and walks the text in a field. */
export function focused(ui: Ui, here: LeftItem): Field | undefined {
  if (ui.form === null) return undefined;
  const def = DEFS[ui.form];
  const key = def.key(here);
  if (key === null) return undefined;
  const d = ui.forms[key] ?? def.fresh(here);
  return def.fields(here, d)[d.field];
}

/**
 * The form is built whole and then windowed: every field draws every line it holds — a goal is
 * read by the eye that is writing it, and a field that scrolls inside itself hides what was just
 * typed — and the pane is what moves, by the least that keeps the cursor's row on screen. The
 * header and its rule stay put, the way the left list's do.
 */
export function formPane(p: Pane, ui: Ui, here: LeftItem, h: number): void {
  const kind = showsForm(ui, here);
  if (kind === null) return;
  const def = DEFS[kind];
  // No draft yet: a throwaway of what is on disk, so a hand edit of `intent.md` shows on the next
  // poll. Once one exists it is what the pane draws, until it is saved or dropped.
  const d = ui.forms[def.key(here)!] ?? def.fresh(here);

  p.row(def.title(here, d, p.width));
  p.rule();

  const rows: Cell[][] = [];
  // Where the cursor is, in drawn rows; under zero while the form has not got the keys, and then
  // the window stays where it was.
  let at = -1;
  const add = (cells: Cell[], cursor = false): void => {
    if (cursor) at = rows.length;
    rows.push(cells);
  };

  for (const [i, field] of def.fields(here, d).entries()) {
    if (field.off === true) continue;
    const active = ui.form === kind && d.field === i;
    if (field.options) {
      add(dial(field.label, field.options, d.dials[field.key]!, active), active);
      // A dial has no input under it, so two blank rows keep it off the next label.
      add([]);
      add([]);
      continue;
    }
    add([[MARK + field.label, active ? C.accent : C.dim]]);
    const text = draftCells(d.texts[field.key]!, p.width, active, Infinity);
    text.rows.forEach((cells, row) => { add(cells, active && row === text.at); });
    add([]); // a blank row between one input and the next label
  }
  while (rows.at(-1)?.length === 0) rows.pop();

  const room = Math.max(0, h - 2);
  ui.formTop = windowTop(ui.formTop, at, rows.length, room);
  for (const cells of rows.slice(ui.formTop, ui.formTop + room)) p.row(cells);
}

/** One row: the label, then every option with the chosen one bright and, on the dial, the cursor. */
function dial(label: string, options: readonly string[], value: string, on: boolean): Cell[] {
  return [[MARK + label, on ? C.accent : C.dim], ['  ', C.dim],
    ...options.flatMap((option, i): Cell[] => [
      ...(i ? ([[' | ', C.rule]] as Cell[]) : []),
      [option, option === value ? C.bright : C.dim, on && option === value],
    ])];
}
