/**
 * factory — function-hooks plugin.
 *
 * Registers two in-process MCP tools, `ask` and `gate`, so a sub-agent can put a question in
 * front of the human without blocking on a Bash call. Each draws AskUserQuestion in the main
 * session and, at the same time, drops a file in `<project>/.factory/inbox/`. Whichever answers
 * first wins; the file is then overwritten with `{ answered: true }` so the Inbox and the status
 * line stop counting it. There is no fs delete op (API.md), hence the overwrite.
 *
 * Also owns the mission status line row.
 *
 * Two shapes are forced by `claude plugin validate --strict` and are not style choices:
 *  - `$` may never be passed to another function, so every op call sits inside a hook body or
 *    inside a closure declared in one. Pure helpers below take data, never `$`.
 *  - Event names are the engine set. `SessionStart`, `UserPromptSubmit`, `Stop` and `PreCompact`
 *    are rejected as "not an event"; see `register` at the bottom for the mapping.
 *
 * Every op is guarded: a host with no in-process MCP registrar, no mission, or a different `$`
 * surface must degrade to a log line, never to a thrown hook.
 */

const POLL_MS = 1000;
const POLL_MAX = 900; // 15 minutes, then the file watch gives up and the dialog still stands
const CLIP = 1200;
const VERDICTS = ['accept', 'amend', 'reject'];

/** Registration is per engine, not per turn; `tick` runs on three events. */
let registered = false;

// ── pure helpers (never touch `$`) ──────────────────────────────────────────

function join(...parts: string[]): string {
  return parts
    .filter((p) => p !== '')
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

function base(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] ?? p;
}

const nowIso = (): string => new Date().toISOString();

const clip = (s: string, n = CLIP): string => (s.length > n ? `${s.slice(0, n)}…` : s);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** `$.fs.readFile` may hand back a string, a `{ content }` box or bytes. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const box = value as Record<string, unknown>;
    for (const key of ['content', 'text', 'data']) {
      if (typeof box[key] === 'string') return box[key] as string;
    }
  }
  return '';
}

/** `$.ui.ask` may hand back a string, an `{ answer }` box or a one-element selection array. */
function answerOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((v) => answerOf(v)).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const box = value as Record<string, unknown>;
    for (const key of ['answer', 'result', 'label', 'value', 'text']) {
      if (typeof box[key] === 'string') return (box[key] as string).trim();
    }
  }
  return '';
}

/** `$.fs.listDir` may hand back names, paths or dirent-like objects. */
function namesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return base(entry);
      if (entry && typeof entry === 'object') {
        const box = entry as Record<string, unknown>;
        const name = box.name ?? box.path ?? box.file;
        return typeof name === 'string' ? base(name) : '';
      }
      return '';
    })
    .filter((n) => n !== '');
}

function parseJson(text: string): Record<string, FactoryAny> | null {
  if (text.trim() === '') return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Record<string, FactoryAny>) : null;
  } catch {
    return null;
  }
}

interface Bound {
  dir: string;
  cwd: string;
  name: string;
  workflow: string;
  step: string;
  round: number;
  openGates: string[];
}

/** Folder names are `<date>-<name>`; newest first so a re-used name resolves to the latest. */
function missionCandidates(names: string[], wanted: string): string[] {
  const dirs = names.filter((n) => !n.startsWith('.'));
  const hits = wanted === '' ? dirs : dirs.filter((n) => n === wanted || n.endsWith(`-${wanted}`));
  return hits.sort().reverse().slice(0, 10);
}

function parseState(dir: string, cwd: string, text: string): Bound | null {
  const state = parseJson(text);
  if (!state) return null;
  const name = typeof state.name === 'string' ? state.name : base(dir).replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const gates = (state.gates ?? {}) as Record<string, { status?: string }>;
  return {
    dir,
    cwd: cwd === '' ? dir.replace(/\/\.factory\/missions\/[^/]+$/, '') : cwd,
    name,
    workflow: typeof state.workflow === 'string' ? state.workflow : 'story',
    step: typeof state.step === 'string' ? state.step : '',
    round: typeof state.round === 'number' ? state.round : 0,
    openGates: Object.keys(gates).filter((s) => gates[s]?.status === 'open'),
  };
}

function claimedMission(text: string): string {
  const claim = parseJson(text);
  return claim && typeof claim.mission === 'string' ? claim.mission : '';
}

/** FACTORY_MISSION only when the host exposes env at all. */
function envMission(): string {
  try {
    return (typeof process !== 'undefined' && process.env && process.env.FACTORY_MISSION) || '';
  } catch {
    return '';
  }
}

function statusLine(mission: Bound, waiting: boolean): string {
  const step = mission.step === '' ? '—' : mission.step;
  return `${mission.workflow} · ${step} r${mission.round} · ${waiting ? 'waiting' : 'running'}`;
}

/** An Inbox entry still counts as waiting until it carries an answer or is marked answered. */
function stillWaiting(entry: Record<string, FactoryAny> | null, missionName: string): boolean {
  if (!entry) return false;
  if (entry.answered === true) return false;
  if (typeof entry.answer === 'string' && entry.answer !== '') return false;
  return entry.mission === undefined || entry.mission === null || entry.mission === missionName;
}

function gateVerdict(raw: string): { answer: string; note: string } {
  const answer = VERDICTS.find((v) => raw.toLowerCase().startsWith(v)) ?? '';
  const note = answer === '' ? '' : raw.slice(answer.length).replace(/^[\s:—-]+/, '');
  return { answer, note };
}

const ASK_TOOL = {
  name: 'ask',
  description:
    'Ask the human a question and block until they answer. Draws AskUserQuestion in the main ' +
    'session and mirrors the question into the Factory Inbox at .factory/inbox/<id>.json; either ' +
    'surface can answer it, first answer wins. Use this instead of guessing, and instead of ' +
    'stopping to report that you are blocked.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question, phrased so a one-line answer decides it.' },
      options: { type: 'array', items: { type: 'string' }, description: 'Up to three choices. Omit for free text.' },
    },
    required: ['question'],
  },
};

const GATE_TOOL = {
  name: 'gate',
  description:
    'Put a workflow gate in front of the human. Reads the gate content file, draws it in the main ' +
    'session with accept / amend / reject, mirrors it into the Factory Inbox, and records the verdict ' +
    'in <mission>/gates/<step>.json. It does NOT touch state.json: the orchestrator must then run ' +
    '`factory gate answer <step> <accept|amend|reject> [--note N]`, which the returned text spells out.',
  inputSchema: {
    type: 'object',
    properties: {
      step: { type: 'string', description: 'Workflow step the gate belongs to.' },
      file: { type: 'string', description: 'Path to the gate content, relative to the project root.' },
    },
    required: ['step', 'file'],
  },
};

// ── hooks ───────────────────────────────────────────────────────────────────

/**
 * Registers the tools once, then repaints the status line row:
 * `<workflow> · <step> r<round> · <state>`, cleared when this session has no mission.
 */
async function tick($: FactoryOps, _e: FactoryEvent): Promise<void> {
  const read = async (path: string): Promise<string> => {
    try {
      return textOf(await $.fs.readFile(path));
    } catch {
      return '';
    }
  };

  if (!registered) {
    registered = true;
    try {
      await $.tool.register(ASK_TOOL);
      await $.tool.register(GATE_TOOL);
    } catch (error) {
      // "no in-process MCP server registrar installed" — this host cannot host the tools.
      const reason = error instanceof Error ? error.message : String(error);
      try {
        await $.ui.log({ text: `factory: ask and gate not registered (${clip(reason, 120)}); use the CLI fallback.` });
      } catch {
        /* nothing left to report through */
      }
    }
  }

  try {
    let cwd = '';
    try {
      cwd = String((await $.session.cwd()) ?? '');
    } catch {
      cwd = '';
    }

    let mission: Bound | null = null;
    const fromEnv = envMission();
    if (fromEnv !== '') mission = parseState(fromEnv, cwd, await read(join(fromEnv, 'state.json')));

    if (!mission && cwd !== '') {
      const wanted = claimedMission(await read(join(cwd, '.factory', 'claim')));
      let names: string[] = [];
      try {
        names = namesOf(await $.fs.listDir(join(cwd, '.factory', 'missions')));
      } catch {
        names = [];
      }
      for (const name of missionCandidates(names, wanted)) {
        const dir = join(cwd, '.factory', 'missions', name);
        const found = parseState(dir, cwd, await read(join(dir, 'state.json')));
        if (found && (wanted === '' || found.name === wanted)) {
          mission = found;
          break;
        }
      }
    }

    if (!mission) {
      await $.ui.status(undefined);
      return;
    }

    let waiting = mission.openGates.length > 0;
    if (!waiting) {
      const inbox = join(mission.cwd, '.factory', 'inbox');
      let files: string[] = [];
      try {
        files = namesOf(await $.fs.listDir(inbox)).filter((n) => n.endsWith('.json'));
      } catch {
        files = [];
      }
      for (const file of files.slice(0, 20)) {
        if (stillWaiting(parseJson(await read(join(inbox, file))), mission.name)) {
          waiting = true;
          break;
        }
      }
    }

    await $.ui.status({ text: statusLine(mission, waiting) });
  } catch {
    /* a host without a status line row is not a failure */
  }
}

/**
 * Answers both registered tools. One body, two matchers, because `$` cannot be handed to a
 * shared helper. Draws the dialog and watches the Inbox file at the same time; first wins.
 */
async function onFactoryTool($: FactoryOps, e: FactoryEvent): Promise<{ result: string }> {
  const read = async (path: string): Promise<string> => {
    try {
      return textOf(await $.fs.readFile(path));
    } catch {
      return '';
    }
  };
  const write = async (path: string, value: unknown): Promise<boolean> => {
    try {
      await $.fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
      return true;
    } catch {
      return false;
    }
  };

  let cwd = '';
  try {
    cwd = String((await $.session.cwd()) ?? '');
  } catch {
    cwd = '';
  }

  let mission: Bound | null = null;
  const fromEnv = envMission();
  if (fromEnv !== '') mission = parseState(fromEnv, cwd, await read(join(fromEnv, 'state.json')));
  if (!mission && cwd !== '') {
    const wanted = claimedMission(await read(join(cwd, '.factory', 'claim')));
    let names: string[] = [];
    try {
      names = namesOf(await $.fs.listDir(join(cwd, '.factory', 'missions')));
    } catch {
      names = [];
    }
    for (const name of missionCandidates(names, wanted)) {
      const dir = join(cwd, '.factory', 'missions', name);
      const found = parseState(dir, cwd, await read(join(dir, 'state.json')));
      if (found && (wanted === '' || found.name === wanted)) {
        mission = found;
        break;
      }
    }
  }

  const root = mission?.cwd || cwd;
  const input = (e.input ?? e.arguments ?? e.args ?? {}) as Record<string, FactoryAny>;
  const isGate = String(e.tool ?? '').endsWith('__gate') || typeof input.step === 'string';

  let question: string;
  let options: string[] | undefined;
  let step = '';

  if (isGate) {
    step = typeof input.step === 'string' && input.step !== '' ? input.step : 'gate';
    const rel = typeof input.file === 'string' ? input.file : '';
    const body = rel === '' ? '' : await read(rel.startsWith('/') ? rel : join(root, rel));
    question = clip([`Gate: ${step}`, rel === '' ? '' : `(${rel})`, '', body || '(gate content unreadable)'].filter((l) => l !== '').join('\n'));
    options = VERDICTS;
  } else {
    question = typeof input.question === 'string' && input.question.trim() !== '' ? input.question.trim() : 'The factory has a question.';
    options = Array.isArray(input.options) ? input.options.map((o: FactoryAny) => String(o)).filter(Boolean).slice(0, 3) : undefined;
    if (options && options.length === 0) options = undefined;
  }

  const id = `${isGate ? `gate-${step}-` : ''}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const file = join(root, '.factory', 'inbox', `${id}.json`);
  await write(file, {
    id,
    mission: mission?.name ?? null,
    step: isGate ? step : mission?.step ?? null,
    question,
    options: options ?? null,
    at: nowIso(),
  });

  // Race: the dialog resolves empty rather than throwing, so the race always settles.
  let settled = false;
  const drawn = (async (): Promise<string> => {
    try {
      return answerOf(await $.ui.ask(question, options));
    } catch {
      return ''; // "no answer, the dialog was dismissed"
    } finally {
      settled = true;
    }
  })();
  const watched = (async (): Promise<string> => {
    for (let i = 0; i < POLL_MAX && !settled; i++) {
      await sleep(POLL_MS);
      if (settled) break;
      const entry = parseJson(await read(file));
      if (entry && typeof entry.answer === 'string' && entry.answer.trim() !== '') {
        settled = true;
        return entry.answer.trim();
      }
    }
    return '';
  })();

  let raw = await Promise.race([drawn, watched]);
  if (raw === '') {
    // The dialog lost or was dismissed; give the file one last look before giving up.
    const late = parseJson(await read(file));
    if (late && typeof late.answer === 'string') raw = late.answer.trim();
  }

  await write(file, { id, answered: true, answer: raw || null, at: nowIso() });

  if (!isGate) return { result: raw === '' ? 'no answer' : raw };

  const { answer, note } = gateVerdict(raw);
  if (answer === '') return { result: 'no answer — the gate is still open' };

  const target = mission ? join(mission.dir, 'gates', `${step}.json`) : '';
  const saved = target !== '' && (await write(target, { step, answer, note: note === '' ? null : note, at: nowIso() }));
  const command = `factory gate answer ${step} ${answer}${note === '' ? '' : ` --note "${note.replace(/"/g, "'")}"`}`;

  return {
    result: [
      `${answer}${note === '' ? '' : ` — ${note}`}`,
      saved ? `recorded in ${target}` : 'not recorded: no mission folder in reach',
      `Now run: ${command}`,
    ].join('\n'),
  };
}

// ── register ────────────────────────────────────────────────────────────────

/**
 * Event names are the engine set, not the settings set. `claude plugin validate` rejects
 * `SessionStart`, `UserPromptSubmit`, `Stop` and `PreCompact` with "is not an event", so:
 *
 *   SessionStart      -> engine.create   (earliest event the validator accepts)
 *   UserPromptSubmit  -> prompt.submit
 *   Stop              -> turn.complete
 *   PreCompact        -> nothing. No compaction event exists in the module API, so the focus
 *                        text stays with the `hook-factory` command hook. See the handoff.
 */
export function register(on: FactoryOn, _options: FactoryRegisterOptions): void {
  on('engine.create', tick);
  on('prompt.submit', tick);
  on('turn.complete', tick);

  on('tool.call', { tool: 'mcp__factory__ask' }, onFactoryTool);
  on('tool.call', { tool: 'mcp__factory__gate' }, onFactoryTool);
}
