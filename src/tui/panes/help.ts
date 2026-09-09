import { C, stepColor } from '../theme.js';
import { wrap, type Cell } from '../format.js';
import type { Pane } from './pane.js';

/** The `?` panel: what the Factory is, the words the screen uses, then every key. */

/** The screen explains itself once, to the human who opened it before reading any doc. */
const PRIMER = [
  'Factory breaks large projects into missions and runs them in parallel, one Claude Code session each. Add projects to the Factory, install skills and fixtures, launch missions.',
  'A mission runs through intent capture, implementation and validation towards a defined goal, on its own branch, with an orchestrator session that delegates and asks.',
];

/** The words the screen uses. `gatekeeper` and `gate` keep the colours the graph gives their steps. */
const TERMS: [term: string, color: string, means: string][] = [
  ['session', C.bright, 'a Claude Code session, observed by the Factory'],
  ['mission', C.bright, 'a unit of work with a goal, a workflow graph and an orchestrator'],
  ['workflow', C.bright, 'an ordered graph of steps that runs a mission towards its goal'],
  ['gatekeeper', stepColor('gatekeeper'), 'Verify checks the code, Validate runs e2e user testing'],
  ['gate', stepColor('human'), 'a step that stops until the human answers it'],
  ['round', C.bright, 'one pass through a loop of the graph'],
  ['decision', C.bright, 'a fork an agent took, with a confidence: auto, or waiting on you'],
  ['autonomy', C.bright, 'which confidences wait: full none, partial LOW, none every one'],
  ['caffeinate', C.bright, 'keeps the Mac awake while a mission or a session runs'],
];

/** Every key the screen answers, one key to a line, under the pane it belongs to. */
const HELP: [group: string, key: string, does: string][] = [
  ['Global', '→', 'Enter the right pane, and in MISSION turn the autonomy dial'],
  ['', '←', 'Back to the left column'],
  ['', '↵', 'Write to the row\'s session; elsewhere open the selection'],
  ['', 'Esc', 'Back; Parts drops its toggles, the message box keeps its draft'],
  ['', 'L', 'Launch fg → bg: Claude in the tab, or under its daemon, attached'],
  ['', 'C', 'Caffeinate auto → on → off'],
  ['', 'Q', 'Quit'],
  ['Projects', 'N', 'New project: a path on the status bar, installed and registered'],
  ['', 'U', 'Uninstall a project and drop it from the list, after a Y'],
  ['', 'O', 'Open the mission\'s tab, /mission as its first prompt'],
  ['', 'K', 'Kill: claude stop under bg, else a signal, again for SIGKILL'],
  ['', 'T', 'Autonomy full → partial → none; a stub\'s is in the form'],
  ['', 'E', 'Archive a closed mission or a stub, or bring it back'],
  ['', 'S', 'Show the archived ones'],
  ['', 'R', 'Rename a project or a session; a mission\'s name is its branch'],
  ['', 'M', 'The intent form for a new stub in the project'],
  ['', '↵', 'On a stub, edit its intent in the form'],
  ['', '⇧↑↓', 'Move the row up or down; the order is kept'],
  ['Daemons', 'R', 'Run a daemon now, or start a service; the row is turned on'],
  ['', 'X', 'Stop what runs and turn the row off for this machine'],
  ['', 'A', 'Its log in the foot, and the alert acknowledged; not Launch here'],
  ['', '↵', 'The DAEMON pane: the entry and what the last run left'],
  ['Parts', 'Space', 'Toggle a part; on Global, cycle its scope'],
  ['', 'R', 'Reset the toggles'],
  ['Message', '⇧↵', 'Send it; the session reads it as yours'],
  ['', '↵', 'A line break'],
  ['', '⌥⌫', 'Erase the word before the cursor'],
  ['', '^K', 'Erase the line'],
  ['', '^U', 'Clear the draft'],
  ['', '^V', 'Paste the clipboard; ⌘V is the terminal\'s own paste'],
  ['Form', '⇥ ⇧↵', 'The next field; ⇧⇥ the one before'],
  ['', '↵', 'On Name, the next field; ⇧↵ on Shape saves'],
  ['', '^S', 'Save: the stub is made, or its intent rewritten'],
  ['', '←→', 'On autonomy, turn the dial; in a field, walk the text'],
  ['', '^U', 'Clear the field'],
  ['', 'Esc', 'Hand the keys back; a draft you changed is kept'],
  ['Foot', 'A', 'Activity, what its session did, or a daemon row\'s log'],
  ['', 'D', 'Decisions, the forks this mission took'],
  ['', 'A D', 'On the tab drawn: again full height, again the tab row alone'],
];

const GROUP_W = 10;
const TERM_W = 12;

/**
 * Not an overlay: while `?` is open this is the right pane, at the full height of the body, and
 * it stands in for MESSAGES while the Inbox is empty, so a fresh install opens on it. Top down,
 * primer first: what a short terminal loses is the end of the key list, which the bar repeats.
 */
export function helpPane(p: Pane, h: number): void {
  const rule: Cell[] = [['─'.repeat(p.width), C.rule]];
  const lines: Cell[][] = [
    [['HOW FACTORY WORKS', C.bright]], rule,
    ...PRIMER.flatMap((text) => [...wrap(text, p.width, 4).map((l): Cell[] => [[l, C.dim]]), []]),
    [['TERMS', C.bright]], rule,
    ...TERMS.map(([term, color, means]): Cell[] => [[term.padEnd(TERM_W), color], [means, C.dim]]),
    [], [['KEYS', C.bright]], rule,
    ...HELP.map(([group, key, does]): Cell[] =>
      [[group.padEnd(GROUP_W), C.bright], [key.padEnd(7), C.accent], [does, C.dim]]),
  ];
  for (const cells of lines.slice(0, h)) p.row(cells);
}
