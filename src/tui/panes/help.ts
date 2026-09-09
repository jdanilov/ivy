import { C } from '../theme.js';
import { wrap, type Cell } from '../format.js';
import type { Pane } from './pane.js';

/** The `?` panel: what the Factory is, how it is used, then every key. */

/** The screen explains itself once, to the human who opened it before reading any doc. */
const PRIMER = [
  'Factory breaks large projects into missions and runs them in parallel, one Claude Code session each. Add projects to the Factory, install skills and fixtures, launch missions.',
  'A mission runs through intent capture, implementation and validation towards a defined goal, on its own branch, with an orchestrator session that delegates and asks.',
];

/** The five paths through the screen, keys first: what a human opening it wants to do, and the
 *  keys that do it. The words the screen uses are @docs/terminology.md's; this is what to press. */
const HOW: [keys: string, does: string][] = [
  ['N', 'Create a project: a path on the status bar, then installed'],
  ['↵ Space ↵ Y', 'Add parts: ↵ on a project, Space to pick, ↵ then Y to apply'],
  ['M ^S O', 'Start a mission: M the intent form, ^S the stub, O its tab'],
  ['A D', 'Watch activity and decisions in the foot; again for full height'],
  ['P R X A', 'Run daemons and services: P adds, R runs, X stops, A its log'],
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
  ['Form', 'P', 'On a project\'s rows, a new daemon or service for its manifest'],
  ['', '⇥ ⇧↵', 'The next field; ⇧⇥ the one before'],
  ['', '↵', 'On Name, the next field; ⇧↵ on the last one saves'],
  ['', '^S', 'Save: the stub is made, its intent rewritten, the entry added'],
  ['', '←→', 'On a dial, turn it; in a field, walk the text'],
  ['', '^U', 'Clear the field'],
  ['', 'Esc', 'Hand the keys back; a draft you changed is kept'],
  ['Foot', 'A', 'Activity, what its session did, or a daemon row\'s log'],
  ['', 'D', 'Decisions, the forks this mission took'],
  ['', 'A D', 'On the tab drawn: again full height, again the tab row alone'],
];

const GROUP_W = 10;
const HOW_W = 14;

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
    [['HOW TO USE', C.bright]], rule,
    ...HOW.map(([keys, does]): Cell[] => [[keys.padEnd(HOW_W), C.accent], [does, C.dim]]),
    [], [['KEYS', C.bright]], rule,
    ...HELP.map(([group, key, does]): Cell[] =>
      [[group.padEnd(GROUP_W), C.bright], [key.padEnd(7), C.accent], [does, C.dim]]),
  ];
  for (const cells of lines.slice(0, h)) p.row(cells);
}
