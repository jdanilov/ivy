import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { ScopeChoice } from '../types.js';
import { factoryHome } from './projects.js';
import { I, colors } from '../ui/theme.js';

/** `~/.factory/config.yaml`: machine-level facts — var overrides, scope per part, the caffeinate mode. */
export interface FactoryConfig {
  vars?: Record<string, string>;
  /** Where this machine wants each part, over what `part.yaml` recommends. `off` is nowhere. */
  parts?: Record<string, ScopeChoice>;
}

const CHOICES: ScopeChoice[] = ['project', 'global', 'off'];

/** AUTO holds the machine awake while a session is mid-turn, ON always, OFF never. */
export type Caffeinate = 'auto' | 'on' | 'off';

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

  const { vars, parts } = raw as Record<string, unknown>;
  return (cache = {
    vars: pairs<string>(vars, (v) => typeof v === 'string'),
    parts: pairs<ScopeChoice>(parts, (v) => CHOICES.includes(v as ScopeChoice)),
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

/**
 * One line rewritten in place, not the file re-serialised: `vars` and anything else a human put
 * here outlive the change. Quoted, because YAML reads a bare `on` as true.
 */
export async function writeCaffeinate(mode: Caffeinate): Promise<void> {
  const text = await Bun.file(configPath()).text().catch(() => '');
  const line = `caffeinate: "${mode}"`;
  const next = /^caffeinate:.*$/m.test(text) ? text.replace(/^caffeinate:.*$/m, line) : `${line}\n${text}`;
  await mkdir(factoryHome(), { recursive: true });
  await Bun.write(configPath(), next.endsWith('\n') ? next : `${next}\n`);
}

/**
 * The same rule one level in: the part's line under `parts:` rewritten where it is, or inserted at
 * the end of that block, or the block appended when the file has none. Only that line moves, and
 * only inside the block — `vars` may hold a key named after a part. Quoted, because YAML reads a
 * bare `off` as false.
 */
export async function writePartScope(name: string, choice: ScopeChoice): Promise<void> {
  const text = await Bun.file(configPath()).text().catch(() => '');
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
  const entry = `  ${name}: "${choice}"`;
  const head = lines.findIndex((l) => l.startsWith('parts:'));

  if (head === -1) {
    lines.push('parts:', entry);
  } else {
    // A flow mapping — `parts: {commit: project}` — closes on its own line, so an indented line
    // under it is not YAML: it becomes a block holding the same entries before anything is added.
    if (lines[head]!.slice('parts:'.length).trim() !== '') {
      const flow = (Bun.YAML.parse(lines[head]!) as { parts?: Record<string, unknown> } | null)?.parts ?? {};
      lines.splice(head, 1, 'parts:', ...Object.entries(flow).map(([k, v]) => `  ${k}: "${v}"`));
    }
    // The block runs while the lines stay indented; the part's own line is rewritten in place.
    let end = head + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end]!)) end++;
    const own = lines.slice(head + 1, end).findIndex((l) => l.trim().startsWith(`${name}:`));
    if (own === -1) lines.splice(end, 0, entry);
    else lines[head + 1 + own] = entry;
  }

  await mkdir(factoryHome(), { recursive: true });
  await Bun.write(configPath(), lines.join('\n') + '\n');
}
