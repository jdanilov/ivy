import { C } from '../theme.js';
import { spread, type Cell } from '../format.js';
import { draftRows, type Draft } from './compose.js';
import { itemKey, type IntentDraft, type LeftItem, type Pane, type Ui } from './pane.js';
import type { Autonomy, Intent, Project } from '../model.js';

/**
 * INTENT: the stub's own pane. A mission is created and edited here, not on the status bar, so
 * the questionnaire the Orchestrator would have asked is on screen before the session starts.
 * The fields are message-box drafts — same editor, same wrap, same cursor — one per row, kept
 * until they are saved or dropped, the way a half-written message is kept.
 */

/** The editable order `field` indexes; the last stop is the autonomy dial, which has no text. */
export const FIELDS: [key: TextField, label: string, max: number][] = [
  ['name', 'name · lowercase slug, fixed once the stub is made', 1],
  ['goal', 'goal · what this mission is for', 4],
  ['done', 'done looks like · one per line', 6],
  ['not', 'not in this mission · guardrails, do not touch', 6],
  ['start', 'start from · files, docs, a bug id, a prior mission', 6],
];
export type TextField = 'name' | 'goal' | 'done' | 'not' | 'start';
/** `field` on the dial: past the last text field. */
export const AUTONOMY_FIELD = FIELDS.length;
export const AUTONOMY: Autonomy[] = ['full', 'partial', 'none'];

/** The row the form belongs to, and everything saving it needs: one rule, stated once, so no
 *  caller has to narrow the row again to find the project or the name. */
export interface Form {
  /** The draft's key: one per project for a new mission, one per stub for an edit. */
  key: string;
  project: Project;
  /** '' while the stub is not made: until then the name is a field of the form. */
  name: string;
  create: boolean;
}

/** A project row writes a new mission, a stub row edits its own; every other row has no form. */
export function formOf(here: LeftItem): Form | null {
  if (here.kind === 'project') return { key: `new ${here.project.name}`, project: here.project, name: '', create: true };
  if (here.kind === 'mission' && here.mission.status === 'stub') {
    return { key: itemKey(here), project: here.project, name: here.mission.name, create: false };
  }
  return null;
}

const draft = (text: string): Draft => ({ text, cursor: text.length });

/** A form filled from the row: a stub's own files, or empty for a new mission on a project row. */
function fresh(here: LeftItem): IntentDraft {
  const m = here.kind === 'mission' ? here.mission : null;
  const i: Intent = m?.intent ?? { goal: '', done: '', not: '', start: '' };
  return {
    name: draft(m?.name ?? ''),
    goal: draft(i.goal), done: draft(i.done), not: draft(i.not), start: draft(i.start),
    autonomy: m?.autonomy ?? 'partial',
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
  return d.autonomy === f.autonomy && FIELDS.every(([key]) => d[key].text === f[key].text);
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

export function formPane(p: Pane, ui: Ui, here: LeftItem): void {
  const form = formOf(here);
  if (form === null) return;
  // No draft yet: a throwaway of what is on disk, so a hand edit of `intent.md` shows on the next
  // poll. Once one exists it is what the pane draws, until it is saved or dropped.
  const d = ui.intents[form.key] ?? fresh(here);
  const stub = here.kind === 'mission';

  p.row(spread([['INTENT', C.bright], [`  ${d.name.text || 'new mission'}`, C.dim]],
    [[stub ? 'stub' : 'new', C.dim]], p.width));
  p.rule();

  // A stub's name is drawn and never focused — `field` never lands on 0 there — because renaming
  // a stub means renaming its folder, and delete-and-remake is that path.
  for (const [i, [field, label, max]] of FIELDS.entries()) {
    const active = ui.form && d.field === i;
    p.row([[label, active ? C.accent : C.dim]]);
    draftRows(p, d[field], p.width, active, max);
  }

  const onDial = ui.form && d.field === AUTONOMY_FIELD;
  p.row([['autonomy', onDial ? C.accent : C.dim], ['  ', C.dim],
    ...AUTONOMY.flatMap((a, i): Cell[] => [
      ...(i ? ([[' | ', C.rule]] as Cell[]) : []),
      [a, a === d.autonomy ? C.bright : C.dim, onDial && a === d.autonomy],
    ])]);
}
