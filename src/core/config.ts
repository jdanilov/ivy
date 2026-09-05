import path from 'node:path';
import { FACTORY_HOME } from './projects.js';

/** `~/.factory/config.yaml`: machine-level facts, today only var overrides. */
export interface FactoryConfig {
  vars?: Record<string, string>;
}

const CONFIG_PATH = path.join(FACTORY_HOME, 'config.yaml');

let cache: FactoryConfig | null = null;

/** Missing or unreadable file is `{}` — a machine without overrides is the normal case. */
export async function loadConfig(): Promise<FactoryConfig> {
  if (cache) return cache;

  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) return (cache = {});

  const raw = Bun.YAML.parse(await file.text());
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return (cache = {});

  const vars = (raw as Record<string, unknown>).vars;
  if (typeof vars !== 'object' || vars === null || Array.isArray(vars)) return (cache = {});

  const entries = Object.entries(vars).filter(([, v]) => typeof v === 'string') as [string, string][];
  return (cache = { vars: Object.fromEntries(entries) });
}
