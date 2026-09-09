import path from 'node:path';
import { mkdir, rename } from 'node:fs/promises';
import { readDaemonEnabled } from './config.js';
import { Refusal } from './mission.js';
import { existingProjects, factoryHome, projectName } from './projects.js';

/** Enablement is per machine, so it is read from the config and never from the project's manifest. */
export const enabledOf = readDaemonEnabled;

export type Kind = 'daemon' | 'service';

interface Common {
  name: string;
  description?: string;
  cmd: string;
  /** Relative to the project root, default the root. */
  cwd?: string;
  env?: Record<string, string>;
}

export interface Daemon extends Common {
  kind: 'daemon';
  every: number;
  atMost?: { n: number; window: number };
  when: 'any' | 'active' | 'idle';
  timeout?: number;
}

export interface Service extends Common {
  kind: 'service';
  run: 'detached' | 'tab';
  restart: 'never' | 'on-failure' | 'always';
  /** Shown in the row, nothing else. */
  port?: number;
}

export type Entry = Daemon | Service;

/** A manifest the Factory cannot read is one error line and no entries, never a throw: a typo in
 *  one project's file must not take the supervisor or Mission Control down with it. */
export interface Manifest {
  entries: Entry[];
  error?: string;
}

export interface DaemonState {
  /** Mirrored from `~/.factory/config.yaml` when the state is read, never stored in the file. */
  enabled: boolean;
  pid?: number;
  startedAt?: string;
  lastStart?: string;
  lastEnd?: string;
  lastStatus?: 'ok' | 'skip' | 'fail';
  lastSummary?: string;
  nextDue?: string;
  successes?: string[];
  restarts?: string[];
  alert?: string;
  tabFallback?: boolean;
}

/** `key` is `<project name>/<name>`, the name Mission Control gives a row; `project` its dir. */
export interface Row {
  key: string;
  project: string;
  entry: Entry;
  state: DaemonState;
}

export type Request = 'run' | 'stop' | 'start';

/** `when: active` means input within this long. The one number the intent fixes. */
const IDLE_MS = 90 * 60 * 1000;

const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseDuration(s: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(s.trim());
  if (!match) throw new Error(`"${s}" is not a duration like 90s, 20m, 3h or 1d`);
  return Number(match[1]) * UNITS[match[2]!]!;
}

export function parseAtMost(s: string): { n: number; window: number } {
  const [n, window] = s.trim().split('/');
  if (!/^\d+$/.test(n ?? '') || window === undefined) throw new Error(`"${s}" is not a limit like 1/24h`);
  return { n: Number(n), window: parseDuration(window) };
}

// ── the manifest ─────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const oneLine = (err: unknown): string => (err instanceof Error ? err.message : String(err)).split('\n')[0]!;

/** The one place the manifest is named, so a message about it and the reader cannot disagree. */
export const manifestFile = (projectDir: string): string => path.join(projectDir, '.factory', 'daemons.yaml');

/** `<project>/.factory/daemons.yaml`, the committed list of what this project runs. */
export async function readManifest(projectDir: string): Promise<Manifest> {
  const file = Bun.file(manifestFile(projectDir));
  if (!(await file.exists())) return { entries: [] };

  try {
    const raw = Bun.YAML.parse(await file.text());
    if (raw === null || raw === undefined) return { entries: [] };
    if (!isRecord(raw)) throw new Error('expected a mapping of name to entry');
    return { entries: Object.entries(raw).map(([name, value]) => parseEntry(name, value)) };
  } catch (err) {
    return { entries: [], error: oneLine(err) };
  }
}

/** Every refusal names the entry and the field, because that is what the human has to go fix. */
function parseEntry(name: string, raw: unknown): Entry {
  const fail: (msg: string) => never = (msg) => { throw new Error(`${name}: ${msg}`); };
  // A field parser's own message is the reason; the entry and the field are the address.
  const field = <T>(what: string, parse: () => T): T => {
    try { return parse(); } catch (err) { return fail(`${what}: ${oneLine(err)}`); }
  };

  if (!isRecord(raw)) return fail('expected a mapping');
  const { kind, cmd, description, cwd } = raw;
  if (kind !== 'daemon' && kind !== 'service') fail('kind must be daemon or service');
  if (typeof cmd !== 'string' || cmd.trim() === '') fail('cmd is required');
  if (description !== undefined && typeof description !== 'string') fail('description must be a string');
  if (cwd !== undefined && typeof cwd !== 'string') fail('cwd must be a string');

  const common: Common = { name, cmd, description, cwd, env: raw.env === undefined ? undefined : parseEnv(raw.env, fail) };

  if (kind === 'daemon') {
    const when = raw.when ?? 'any';
    if (when !== 'any' && when !== 'active' && when !== 'idle') fail('when must be any, active or idle');
    if (raw.every === undefined) fail('every is required on a daemon');
    if (raw.atMost !== undefined && typeof raw.atMost !== 'string') fail('atMost must be a limit like 1/24h');
    return {
      ...common,
      kind,
      when,
      every: field('every', () => parseDuration(String(raw.every))),
      atMost: raw.atMost === undefined ? undefined : field('atMost', () => parseAtMost(raw.atMost as string)),
      timeout: raw.timeout === undefined ? undefined : field('timeout', () => parseDuration(String(raw.timeout))),
    };
  }

  const run = raw.run ?? 'detached';
  const restart = raw.restart ?? 'never';
  if (run !== 'detached' && run !== 'tab') fail('run must be detached or tab');
  if (restart !== 'never' && restart !== 'on-failure' && restart !== 'always') fail('restart must be never, on-failure or always');
  if (raw.port !== undefined && typeof raw.port !== 'number') fail('port must be a number');
  return { ...common, kind, run, restart, port: raw.port as number | undefined };
}

/** A value written unquoted reads back as a number or a boolean; the child process wants strings.
 *  Anything that is not a scalar has no string a shell would want, so it is the manifest's error. */
function parseEnv(raw: unknown, fail: (msg: string) => never): Record<string, string> {
  if (!isRecord(raw)) fail('env must be a mapping');
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => {
    if (v === null || typeof v === 'object') fail(`env: ${k} must be a string, a number or a boolean`);
    return [k, String(v)];
  }));
}

/** A new entry as a human typed it: `every` and `port` are still their own text, so the file
 *  reads back the way it was written — `every: 3h`, not the milliseconds the parser makes of it. */
export interface NewEntry {
  name: string;
  kind: Kind;
  description?: string;
  cmd: string;
  cwd?: string;
  every?: string;
  restart?: Service['restart'];
  port?: string;
}

/** The header a manifest the Factory makes starts with; one a human wrote already has its own. */
const HEADER = '# What this project runs in the background: factory daemon list\n';

/** The fields of a written entry, in the order the manifest's own table lists them. */
const WRITTEN: (keyof Omit<NewEntry, 'name'>)[] = ['kind', 'description', 'cmd', 'cwd', 'every', 'restart', 'port'];

/** Quoted where the value is a human's line and would otherwise be YAML — a `cmd` holds colons,
 *  a description holds anything — plain where the field is one of the manifest's own words. */
const scalar = (key: string, value: string): string =>
  `  ${key}: ${key === 'cmd' || key === 'description' || key === 'cwd' ? JSON.stringify(value) : value}\n`;

/**
 * `P` in Mission Control, the one writer of a manifest: the entry is appended and nothing already
 * in the file is rewritten, because the comments, the order and the fields in it are a human's and
 * a round trip through the parser would drop every one of them. A name the file already has is
 * refused rather than merged — two entries under one name is a manifest that does not parse.
 */
export async function writeEntry(projectDir: string, entry: NewEntry): Promise<void> {
  const file = manifestFile(projectDir);
  const manifest = await readManifest(projectDir);
  if (manifest.error) throw new Refusal(`${file} does not parse — fix it first: ${manifest.error}`);
  if (manifest.entries.some((e) => e.name === entry.name)) throw new Refusal(`${projectDir} already runs ${entry.name}`);

  const block = `${entry.name}:\n` + WRITTEN
    .filter((key) => entry[key] !== undefined && entry[key] !== '')
    .map((key) => scalar(key, entry[key]!)).join('');
  const text = (await Bun.file(file).text().catch(() => '')) || HEADER;
  await mkdir(path.dirname(file), { recursive: true });
  await Bun.write(file, `${text.replace(/\n*$/, '\n')}\n${block}`);
}

// ── state, requests and logs, under ~/.factory/daemons/<project>/<name>/ ──────

export const daemonDir = (key: string): string => path.join(factoryHome(), 'daemons', key);

export const requestFile = (key: string): string => path.join(daemonDir(key), 'request');

export const logFile = (key: string): string => path.join(daemonDir(key), 'log');

/** A hand-written or half-written state file is no state, never a throw in the reader's face.
 *  `wanted` was a second desired state beside `enabled`; a file still carrying one is read past. */
export async function readState(key: string): Promise<DaemonState> {
  const raw = await Bun.file(path.join(daemonDir(key), 'state.json')).json().catch(() => ({}));
  const { wanted, ...stored } = isRecord(raw) ? (raw as Partial<DaemonState> & { wanted?: unknown }) : {};
  return { ...stored, enabled: false };
}

/** Temp file plus rename: the TUI reads this while the supervisor writes it. */
export async function writeState(key: string, state: DaemonState): Promise<void> {
  const dir = daemonDir(key);
  await mkdir(dir, { recursive: true });
  const { enabled, ...stored } = state;
  const temp = path.join(dir, `.state.json.${process.pid}`);
  await Bun.write(temp, JSON.stringify(stored, null, 2) + '\n');
  await rename(temp, path.join(dir, 'state.json'));
}

export async function readRequest(key: string): Promise<Request | null> {
  const text = (await Bun.file(requestFile(key)).text().catch(() => '')).trim();
  return text === 'run' || text === 'stop' || text === 'start' ? text : null;
}

export async function writeRequest(key: string, request: Request): Promise<void> {
  await mkdir(daemonDir(key), { recursive: true });
  await Bun.write(requestFile(key), `${request}\n`);
}

/**
 * A log line as a terminal would have shown it. A dev server draws with escape sequences and
 * rewrites its progress line with `\r`, and nothing that reads the log back is a terminal: the
 * pane would draw `32m` and jumping columns, and `daemon log` would paste them into a shell.
 * A `\r` rewrite keeps only what was written after the last one, which is what stood on screen.
 * Colour (SGR, the `m` sequences) stays: a shell renders it, and the pane parses it into cells.
 */
export function plainLine(line: string): string {
  return line
    .slice(line.lastIndexOf('\r') + 1)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC: window titles and the like
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, (seq) => (seq.endsWith('m') ? seq : '')) // CSI: cursor moves, erases
    .replace(/\x1b[@-Z\\-_]/g, '')                     // the lone two-byte escapes
    .replace(/\t/g, '  ')
    .replace(/[\x00-\x08\x0b-\x1a\x1c-\x1f\x7f]/g, ''); // whatever control bytes are left, ESC kept
}

/** Only the tail is ever shown and the log runs to 5 MB: read the last 64 KB, not the file.
 *  Every reader gets the lines already legible — there is no second place to clean them. */
export async function readLogTail(key: string, n: number): Promise<string[]> {
  const file = Bun.file(logFile(key));
  if (!(await file.exists())) return [];
  const text = await file.slice(Math.max(0, file.size - 64 * 1024)).text();
  return text === '' ? [] : text.replace(/\n$/, '').split('\n').slice(-n).map(plainLine);
}

/** Every row on this machine: only projects in `~/.factory/projects` are visible, and a project
 *  whose manifest does not parse contributes its error and no rows. */
export async function listRows(): Promise<{ rows: Row[]; errors: Record<string, string> }> {
  const rows: Row[] = [];
  const errors: Record<string, string> = {};

  for (const project of await existingProjects()) {
    const manifest = await readManifest(project);
    // The project's display name, not its folder's: a renamed project takes its keys with it.
    const name = await projectName(project);
    if (manifest.error) errors[name] = manifest.error;
    for (const entry of manifest.entries) {
      const key = `${name}/${entry.name}`;
      const state = await readState(key);
      state.enabled = await enabledOf(key);
      rows.push({ key, project, entry, state });
    }
  }

  return { rows, errors };
}

// ── cadence and the contract ─────────────────────────────────────────────────

/** Pure: no file, no clock of its own, so the supervisor and a test see the same answer. `every`
 *  gates on the last run of any status, which makes a tick missed to sleep due at once; `atMost`
 *  gates on successes inside its window; `when` gates on idle time; a run in flight is never due. */
export function due(d: Daemon, s: DaemonState, now: number, idleS: number): { due: boolean; next: number } {
  let next = s.lastEnd === undefined ? now : Date.parse(s.lastEnd) + d.every;

  if (d.atMost) {
    const inWindow = (s.successes ?? []).map(Date.parse).filter((t) => now - t < d.atMost!.window).sort((a, b) => a - b);
    if (inWindow.length >= d.atMost.n) next = Math.max(next, inWindow[0]! + d.atMost.window);
  }

  const active = idleS * 1000 < IDLE_MS;
  const when = d.when === 'any' || (d.when === 'active' ? active : !active);
  return { due: s.pid === undefined && when && now >= next, next };
}

/** The whole contract asked of a script: exit 0 is ok, a last stdout line `{"skip":…}` is a skipped
 *  run, non-zero is a failure, and a `summary` string is the row's text. */
export function verdict(code: number, stdout: string): { status: 'ok' | 'skip' | 'fail'; summary: string } {
  const last = stdout.split('\n').map((l) => l.trim()).filter((l) => l !== '').at(-1) ?? '';
  // A line that only looks like JSON is just the last line: the script owes the Factory nothing.
  let fields: Record<string, unknown> | undefined;
  try { const json: unknown = JSON.parse(last); fields = isRecord(json) ? json : undefined; } catch { fields = undefined; }

  const skip = typeof fields?.skip === 'string' ? fields.skip : fields?.skip === true ? 'skipped' : undefined;
  const clipped = last.length > 80 ? `${last.slice(0, 79)}…` : last;
  const summary = typeof fields?.summary === 'string' ? fields.summary : (skip ?? clipped);
  return { status: code !== 0 ? 'fail' : skip !== undefined ? 'skip' : 'ok', summary };
}
