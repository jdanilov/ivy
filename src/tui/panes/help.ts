import { C, stepColor } from '../theme.js';
import { wrap, type Cell } from '../format.js';
import type { Pane } from './pane.js';

/** The `?` panel: every key, the words the screen uses, and what the Factory is. */

/** Every key the screen answers, one key to a line on screen, under the pane it belongs to. */
const HELP: [group: string, key: string, does: string][] = [
  ['Global', '↑↓', 'Move the selection'], ['', '→', 'Enter the right pane, and in MISSION turn the autonomy dial'],
  ['', '↵', 'Write to the row\'s session; elsewhere open the selection or apply what is pending'], ['', '←', 'Back to the left column'],
  ['', 'Esc', 'Back, or discard the pending toggles first'], ['', 'L', 'Launch fg → bg: claude in the tab, or under its daemon with the tab attached'],
  ['', 'C', 'Caffeinate auto → on → off'],
  ['', '?', 'This panel'], ['', 'Q', 'Quit'],
  ['Projects', 'O', 'Open the mission\'s Warp tab, /mission as its first prompt'], ['', 'K', 'Kill its session: claude stop under bg, else a signal, again within 5s to SIGKILL'],
  ['', 'T', 'Autonomy full → partial → none'], ['', 'E', 'Archive a closed mission or a stub, or bring it back'],
  ['', 'S', 'Show the archived ones'], ['', 'R', 'Rename: a mission\'s title, a session\'s name'],
  ['', 'M', 'A new stub mission in the project'], ['', '⇧↑↓', 'Move the row up or down; the order is kept'],
  ['Messages', '↑↓', 'Read what waits — every one answers in its session'],
  ['Parts', 'Space', 'Toggle a part; on Global, cycle its scope'], ['', 'Y', 'Confirm the apply'],
  ['', 'N', 'Cancel it'], ['', 'R', 'Reset the toggles'],
  ['Message', '⇧↵ ^S', 'Send it; the session reads it as yours'], ['', '↵', 'A line break'],
  ['', '⌥⌫ ^W', 'Erase the word before the cursor'], ['', '^K', 'Erase the line'],
  ['', '^U', 'Clear the draft'], ['', '^V', 'Paste the clipboard; ⌘V is the terminal\'s own paste'],
  ['', 'Esc', 'Keep the draft, hand the keys back'],
  ['Foot', 'A', 'Activity, what its session did; again, full height'], ['', 'D', 'Decisions, the forks this mission took; again, full height'],
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
export function helpPane(p: Pane, h: number): void {
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
