import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { ScopeChoice } from '../types.js';
import { factoryHome } from './projects.js';
import { I, colors } from '../ui/theme.js';

/** `~/.factory/config.yaml`: machine-level facts — var overrides, scope per part, the caffeinate mode, the launch mode. */
export interface FactoryConfig {
  vars?: Record<string, string>;
  /** Where this machine wants each part, over what `part.yaml` recommends. `off` is nowhere. */
  parts?: Record<string, ScopeChoice>;
  /** Whether this machine runs each manifest entry, by `<project>/<name>`. Default off, and `off`
   *  wins over anything the project's daemon manifest says. */
  daemons?: Record<string, 'on' | 'off'>;
  /** How Mission Control lists things: `projects`, `<project>/missions`, `<project>/sessions`, each the
   *  names in the order the human moved them into. Whatever a list does not name follows it. */
  order?: Record<string, string[]>;
  /** What a project is called on this machine, by its absolute path. A path with no entry here is
   *  its folder's own name. */
  names?: Record<string, string>;
}

const CHOICES: ScopeChoice[] = ['project', 'global', 'off'];

/** AUTO holds the machine awake while a session is mid-turn, ON always, OFF never. */
export type Caffeinate = 'auto' | 'on' | 'off';

/** How `mission open` runs claude: FG in the tab, where Warp keeps its blocks over the
 *  conversation; BG under Claude Code's daemon, where the tab attaches and the session outlives it. */
export type Launch = 'fg' | 'bg';

const configPath = (): string => path.join(factoryHome(), 'config.yaml');

let cache: FactoryConfig | null = null;

let warned = false;

/**
 * The one file a human hand-edits, read by every command: a typo in it is one dim line and no
 * config, never a parse stack out of whatever command happened to read it. Named once per process,
 * because the second telling says nothing the first did not.
 */
function parse(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch (err) {
    if (!warned) console.log(`${I}${colors.dim}${configPath()} could not be read: ${err instanceof Error ? err.message : String(err)}${colors.reset}`);
    warned = true;
    return null;
  }
}

/** A mapping's entries whose value `keep` accepts. Anything that is not a mapping is nothing. */
function pairs<T>(raw: unknown, keep: (v: unknown) => boolean): Record<string, T> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => keep(v))) as Record<string, T>;
}

/** Missing or unreadable file is `{}` — a machine without overrides is the normal case. */
export async function loadConfig(): Promise<FactoryConfig> {
  if (cache) return cache;

  const file = Bun.file(configPath());
  if (!(await file.exists())) return (cache = {});

  const raw = parse(await file.text());
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return (cache = {});

  const { vars, parts, daemons, order, names } = raw as Record<string, unknown>;
  return (cache = {
    vars: pairs<string>(vars, (v) => typeof v === 'string'),
    parts: pairs<ScopeChoice>(parts, (v) => CHOICES.includes(v as ScopeChoice)),
    daemons: pairs<'on' | 'off'>(daemons, (v) => v === 'on' || v === 'off'),
    order: pairs<string[]>(order, (v) => Array.isArray(v) && v.every((s) => typeof s === 'string')),
    names: pairs<string>(names, (v) => typeof v === 'string'),
  });
}

/** Mission Control rewrites the file while it runs: whoever writes it drops the cache. */
export function resetConfig(): void {
  cache = null;
}

/** Read from the file every time, never the cache: Mission Control rewrites it while it runs. */
export async function readCaffeinate(): Promise<Caffeinate> {
  const raw = await Bun.file(configPath()).text().catch(() => '');
  const value = raw === '' ? null : (parse(raw) as { caffeinate?: unknown } | null)?.caffeinate;
  return value === 'on' || value === 'off' ? value : 'auto';
}

/** Read fresh too: the supervisor is a second process reading what the TUI just wrote. */
export async function readDaemonEnabled(key: string): Promise<boolean> {
  const raw = await Bun.file(configPath()).text().catch(() => '');
  const daemons = raw === '' ? null : (parse(raw) as { daemons?: unknown } | null)?.daemons;
  return pairs<'on'>(daemons, (v) => v === 'on')?.[key] === 'on';
}

/** Fresh as well: a project is named on every rebuild, and Mission Control's `R` rewrites the
 *  file underneath it. Undefined is "no entry", which is the folder's own name. */
export async function readName(projectPath: string): Promise<string | undefined> {
  const raw = await Bun.file(configPath()).text().catch(() => '');
  const names = raw === '' ? null : (parse(raw) as { names?: unknown } | null)?.names;
  return pairs<string>(names, (v) => typeof v === 'string')?.[projectPath];
}

export async function readLaunch(): Promise<Launch> {
  const raw = await Bun.file(configPath()).text().catch(() => '');
  const value = raw === '' ? null : (parse(raw) as { launch?: unknown } | null)?.launch;
  return value === 'bg' ? 'bg' : 'fg';
}

/**
 * One line rewritten in place, not the file re-serialised: `vars` and anything else a human put
 * here outlive the change. Quoted, because YAML reads a bare `on` as true.
 */
export async function writeCaffeinate(mode: Caffeinate): Promise<void> {
  await writeLine('caffeinate', mode);
}

export async function writeLaunch(mode: Launch): Promise<void> {
  await writeLine('launch', mode);
}

async function writeLine(key: string, value: string): Promise<void> {
  const text = await Bun.file(configPath()).text().catch(() => '');
  const line = `${key}: "${value}"`;
  const at = new RegExp(`^${key}:.*$`, 'm');
  const next = at.test(text) ? text.replace(at, line) : `${line}\n${text}`;
  await mkdir(factoryHome(), { recursive: true });
  await Bun.write(configPath(), next.endsWith('\n') ? next : `${next}\n`);
}

export async function writePartScope(name: string, choice: ScopeChoice): Promise<void> {
  await writeBlockEntry('parts', name, choice);
}

export async function writeDaemonEnabled(key: string, mode: 'on' | 'off'): Promise<void> {
  await writeBlockEntry('daemons', key, mode);
}

/** The key is the project's absolute path — a plain YAML scalar, slashes and all. */
export async function writeName(projectPath: string, name: string): Promise<void> {
  await writeBlockEntry('names', projectPath, name);
}

/**
 * The same rule one level in: the entry's line under `parts:` or `daemons:` rewritten where it is,
 * or inserted at the end of that block, or the block appended when the file has none. Only that
 * line moves, and only inside the block — `vars` may hold a key named after a part. Quoted,
 * because YAML reads a bare `off` as false and a bare `on` as true.
 */
async function writeBlockEntry(block: string, name: string, value: string): Promise<void> {
  const text = await Bun.file(configPath()).text().catch(() => '');
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
  const entry = `  ${name}: "${value}"`;
  const head = lines.findIndex((l) => l.startsWith(`${block}:`));

  if (head === -1) {
    lines.push(`${block}:`, entry);
  } else {
    // A flow mapping — `parts: {commit: project}` — closes on its own line, so an indented line
    // under it is not YAML: it becomes a block holding the same entries before anything is added.
    if (lines[head]!.slice(block.length + 1).trim() !== '') {
      const flow = (Bun.YAML.parse(lines[head]!) as Record<string, Record<string, unknown> | undefined> | null)?.[block] ?? {};
      lines.splice(head, 1, `${block}:`, ...Object.entries(flow).map(([k, v]) => `  ${k}: "${v}"`));
    }
    // The block runs while the lines stay indented; the part's own line is rewritten in place.
    let end = head + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end]!)) end++;
    // The whole key, never a prefix of one: `names:` is keyed by path, and `/opt/ed/ivy` must not
    // rewrite the line `/opt/ed/ivy-two` holds.
    const own = lines.slice(head + 1, end).findIndex((l) => l.trim().slice(0, name.length + 1) === `${name}:`);
    if (own === -1) lines.splice(end, 0, entry);
    else lines[head + 1 + own] = entry;
  }

  await mkdir(factoryHome(), { recursive: true });
  await Bun.write(configPath(), lines.join('\n') + '\n');
}

/**
 * A project's name is inside its keys — `daemons:` and `order:` are keyed `<project>/<name>` and
 * the `projects` order lists the names themselves — so a rename rewrites those keys where they
 * stand. A new key written beside the old one would leave the row's flag and its place behind.
 */
export async function renameProjectKeys(from: string, to: string): Promise<void> {
  const text = await Bun.file(configPath()).text().catch(() => '');
  if (text === '') return;
  let block = '';
  const lines = text.replace(/\n$/, '').split('\n').map((line) => {
    const head = /^(\w+):/.exec(line);
    if (head) { block = head[1]!; return line; }
    if (block !== 'daemons' && block !== 'order') return line;
    const entry = /^(\s+)(.*)$/.exec(line);
    if (!entry) return line;
    const rest = entry[2]!;
    // The `projects` list holds the names as values; every other key is prefixed by one.
    if (block === 'order' && rest.startsWith('projects:')) return entry[1]! + rest.replace(`"${from}"`, `"${to}"`);
    return rest.startsWith(`${from}/`) ? entry[1]! + to + rest.slice(from.length) : line;
  });
  await Bun.write(configPath(), lines.join('\n') + '\n');
  resetConfig();
}

/**
 * The `order:` block replaced whole, the rest of the file untouched: it holds only what Mission
 * Control wrote, so nothing a human put there is lost, and one flow list per line reads back through
 * `loadConfig` like anything else. A block that was a flow mapping on one line is one line replaced.
 */
export async function writeOrder(key: string, names: string[]): Promise<void> {
  resetConfig();
  const order = { ...((await loadConfig()).order ?? {}), [key]: names };
  const text = await Bun.file(configPath()).text().catch(() => '');
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
  const block = ['order:', ...Object.entries(order).map(([k, v]) => `  ${k}: [${v.map((s) => JSON.stringify(s)).join(', ')}]`)];

  const head = lines.findIndex((l) => l.startsWith('order:'));
  let end = head + 1;
  while (head !== -1 && end < lines.length && /^\s+\S/.test(lines[end]!)) end++;
  if (head === -1) lines.push(...block);
  else lines.splice(head, end - head, ...block);

  await mkdir(factoryHome(), { recursive: true });
  await Bun.write(configPath(), lines.join('\n') + '\n');
  resetConfig();
}
