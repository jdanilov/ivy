import path from 'node:path';
import { readFile } from 'node:fs/promises';

/**
 * `intent.md`, the one file a human reads, as four fields. One module owns the format so the
 * intent form, the CLI's skeleton and the screen all read and write the same headings: a section
 * the form has nothing for is left out, and `## Goal` is always there because it is the line a
 * mission is judged by and the hand-editor's prompt.
 */

export interface Intent {
  goal: string;
  done: string;
  not: string;
  start: string;
}

export const SECTIONS: [keyof Intent, string][] = [
  ['goal', '## Goal'],
  ['done', '## Done looks like'],
  ['not', '## Not in this mission'],
  ['start', '## Start from'],
];

export const EMPTY: Intent = { goal: '', done: '', not: '', start: '' };

/** A section's body is everything up to the next heading, trimmed; one it has none of reads ''. */
export function parseIntent(text: string): Intent {
  const intent: Intent = { ...EMPTY };
  for (const [key, heading] of SECTIONS) {
    const after = text.split(new RegExp(`^${heading}\\s*$`, 'm'))[1];
    if (after !== undefined) intent[key] = after.split(/^## /m)[0]!.trim();
  }
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
