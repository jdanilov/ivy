import path from 'node:path';
import { readFile } from 'node:fs/promises';

/**
 * `intent.md`, the one file a human reads, as three fields. One module owns the format so the
 * intent form, the CLI's skeleton and the screen all read and write the same headings: a section
 * the form has nothing for is left out, and `## Goal` is always there because it is the line a
 * mission is judged by and the hand-editor's prompt.
 */

export interface Intent {
  goal: string;
  done: string;
  /** Guardrails, what not to touch, where to start from: one field for everything else. */
  extra: string;
}

export const SECTIONS: [keyof Intent, string][] = [
  ['goal', '## Goal'],
  ['done', '## Done looks like'],
  ['extra', '## Extra'],
];

export const EMPTY: Intent = { goal: '', done: '', extra: '' };

/** Where a mission's why was written before the form. Read only: the first save moves it. */
const WHY = '## Why';
/** The two sections `## Extra` stands for now. Read only: the first save folds them into it. */
const LEGACY_EXTRA = ['## Not in this mission', '## Start from'];

const HEADINGS = new Set([...SECTIONS.map(([, heading]) => heading), WHY, ...LEGACY_EXTRA]);

/** The file as its sections. A body runs to the next heading the format knows, not to the next
 *  `## ` line, so a markdown heading pasted into `## Extra` stays in the field. */
function sections(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  let heading: string | null = null;
  let body: string[] = [];
  const flush = (): void => { if (heading !== null) found[heading] = body.join('\n').trim(); };
  for (const line of text.split('\n')) {
    if (!HEADINGS.has(line.trim())) { body.push(line); continue; }
    flush();
    heading = line.trim();
    body = [];
  }
  flush();
  return found;
}

/** A section the file has none of reads ''. */
export function parseIntent(text: string): Intent {
  const found = sections(text);
  const intent: Intent = { ...EMPTY };
  for (const [key, heading] of SECTIONS) intent[key] = found[heading] ?? '';
  // Half the missions written before the form say what they are for under `## Why`, and a stub
  // with no goal cannot be opened from Mission Control. Read the why as the goal — the whole body,
  // because the first save rewrites the file and anything left behind here is deleted — and the
  // pane's own first-paragraph rule still draws one line of it.
  if (intent.goal === '') intent.goal = found[WHY] ?? '';
  // The guardrails and the start-from were two sections once: read whole, one after the other,
  // into the extra, so the first save carries them over instead of deleting them.
  intent.extra = [intent.extra, ...LEGACY_EXTRA.map((heading) => found[heading] ?? '')]
    .filter((body) => body !== '').join('\n\n');
  return intent;
}

export function renderIntent(name: string, intent: Intent): string {
  const sections = SECTIONS
    .filter(([key]) => key === 'goal' || intent[key].trim() !== '')
    .map(([key, heading]) => {
      const body = intent[key].trim();
      return `${heading}\n${body === '' ? '' : `\n${body}\n`}`;
    });
  return `# Intent: ${name}\n\n${sections.join('\n')}`;
}

const file = (dir: string): string => path.join(dir, 'intent.md');

/** '' fields when the file is missing: a mission with no intent yet reads as an empty one. */
export async function readIntent(dir: string): Promise<Intent> {
  return parseIntent(await readFile(file(dir), 'utf-8').catch(() => ''));
}

/** The form owns the whole file: what it does not carry is dropped, so there is one writer. */
export async function writeIntent(dir: string, name: string, intent: Intent): Promise<void> {
  await Bun.write(file(dir), renderIntent(name, intent));
}
