import { C } from '../theme.js';
import { spread } from '../format.js';
import { draft, type Def, type Field, type FormDraft } from './form.js';

/**
 * SERVICE, or DAEMON: the other form the engine in @src/tui/panes/form.ts draws. `P` on any of a
 * project's rows fills in one entry of its `.factory/daemons.yaml` — the fields are that file's
 * own, in its own order — and `^S` appends it, off. Adding background work to a project was the
 * last common path that needed an editor and a shell.
 *
 * The Kind dial is the first row because it decides the rest of them: a daemon has a cadence, a
 * service has a restart policy and a port, and the fields the other kind uses are not drawn.
 */

export const KINDS = ['daemon', 'service'] as const;
export const RESTARTS = ['never', 'on-failure', 'always'] as const;

/** The draft's key: one per project, the row `P` puts the form on. */
export const serviceKey = (project: string): string => `svc ${project}`;

export const SERVICE: Def = {
  key: (here) => (here.kind === 'project' ? serviceKey(here.project.name) : null),

  fresh: (): FormDraft => ({
    texts: { name: draft(''), description: draft(''), cmd: draft(''), cwd: draft(''), every: draft(''), port: draft('') },
    dials: { kind: 'daemon', restart: 'never' },
    // The Kind dial is above the name and walked back to; the cursor starts where the typing does.
    field: 1,
  }),

  // The title is the dial's own word: what is being written is a daemon until it says otherwise.
  title: (here, d, width) => spread(
    [[d.dials.kind!.toUpperCase(), C.bright], [`  ${here.kind === 'project' ? here.project.name : ''}`, C.dim]],
    [['new', C.dim]], width),

  fields: (_here, d): Field[] => {
    const service = d.dials.kind === 'service';
    return [
      { key: 'kind', label: 'Kind:', options: KINDS },
      { key: 'name', label: 'Name (lowercase slug):', line: true },
      { key: 'description', label: 'Description (one line):' },
      { key: 'cmd', label: 'Command, run through the login shell:' },
      { key: 'cwd', label: 'Working dir, relative to the project (blank is its root):' },
      { key: 'every', label: 'Every (90s, 20m, 3h, 1d):', off: service },
      { key: 'restart', label: 'Restart:', options: RESTARTS, off: !service },
      { key: 'port', label: 'Port (shown in the row, nothing reads it):', off: !service },
    ];
  },
};
