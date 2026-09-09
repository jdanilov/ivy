import { C } from '../theme.js';
import { spread } from '../format.js';
import { draft, type Def, type Field, type FormDraft } from './form.js';
import { itemKey, type LeftItem } from './pane.js';
import type { Autonomy, Intent, Project } from '../model.js';

/**
 * INTENT: the stub's own pane, one of the two forms the engine in @src/tui/panes/form.ts draws.
 * A mission is created and edited here, not on the status bar, so the questionnaire the
 * Orchestrator would have asked is on screen before the session starts. The fields are message-box
 * drafts — same editor, same wrap, same cursor — one per row, kept until they are saved or
 * dropped, the way a half-written message is kept.
 */

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
export interface IntentForm {
  project: Project;
  /** '' while the stub is not made: until then the name is a field of the form. */
  name: string;
  /** A stub's own graph, null for a new mission: what the Shape dial is compared against. */
  workflow: string | null;
  create: boolean;
}

/** A project row writes a new mission, a stub row edits its own; every other row has no intent. */
export function intentForm(here: LeftItem): IntentForm | null {
  if (here.kind === 'project') return { project: here.project, name: '', workflow: null, create: true };
  if (here.kind === 'mission' && here.mission.status === 'stub') {
    return { project: here.project, name: here.mission.name, workflow: here.mission.workflow, create: false };
  }
  return null;
}

export const INTENT: Def = {
  // One draft per project for a new mission, one per stub for an edit.
  key: (here) => (here.kind === 'project' ? `new ${here.project.name}` : intentForm(here) === null ? null : itemKey(here)),

  // A stub's own files, or empty for a new mission on a project row.
  fresh: (here): FormDraft => {
    const m = here.kind === 'mission' ? here.mission : null;
    const i: Intent = m?.intent ?? { goal: '', done: '', extra: '' };
    return {
      texts: { name: draft(m?.name ?? ''), goal: draft(i.goal), done: draft(i.done), extra: draft(i.extra) },
      dials: { autonomy: m?.autonomy ?? 'partial', shape: shapeOf(m?.workflow ?? null) },
      // A stub's name is fixed, so the cursor starts on the goal instead.
      field: m ? 1 : 0,
    };
  },

  title: (here, d, width) => spread(
    [['INTENT', C.bright], [`  ${d.texts.name!.text || 'new mission'}`, C.dim]],
    [[here.kind === 'mission' ? 'stub' : 'new', C.dim]], width),

  // Renaming a stub means renaming its folder and its branch, and delete-and-remake is that path:
  // there the name is drawn and never focused.
  fields: (here): Field[] => [
    { key: 'name', label: 'Name (lowercase slug):', line: true, fixed: here.kind === 'mission' },
    { key: 'goal', label: 'Mission Goal:' },
    { key: 'done', label: 'What done looks like (one per line):' },
    { key: 'extra', label: 'Extra (guardrails, what not to touch, start from, etc.):' },
    { key: 'autonomy', label: 'Autonomy:', options: AUTONOMY },
    { key: 'shape', label: 'Shape:', options: SHAPES },
  ],
};
