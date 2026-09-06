import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { factoryHome } from './projects.js';

/** `~/.factory/config.yaml`: machine-level facts — var overrides and the caffeinate mode. */
export interface FactoryConfig {
  vars?: Record<string, string>;
}

/** AUTO holds the machine awake while a session is mid-turn, ON always, OFF never. */
export type Caffeinate = 'auto' | 'on' | 'off';

const configPath = (): string => path.join(factoryHome(), 'config.yaml');

let cache: FactoryConfig | null = null;

/** Missing or unreadable file is `{}` — a machine without overrides is the normal case. */
export async function loadConfig(): Promise<FactoryConfig> {
  if (cache) return cache;

  const file = Bun.file(configPath());
  if (!(await file.exists())) return (cache = {});

  const raw = Bun.YAML.parse(await file.text());
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return (cache = {});

  const vars = (raw as Record<string, unknown>).vars;
  if (typeof vars !== 'object' || vars === null || Array.isArray(vars)) return (cache = {});

  const entries = Object.entries(vars).filter(([, v]) => typeof v === 'string') as [string, string][];
  return (cache = { vars: Object.fromEntries(entries) });
}

/** Read from the file every time, never the cache: Mission Control rewrites it while it runs. */
export async function readCaffeinate(): Promise<Caffeinate> {
  const raw = await Bun.file(configPath()).text().catch(() => '');
  const value = raw === '' ? null : (Bun.YAML.parse(raw) as { caffeinate?: unknown } | null)?.caffeinate;
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
