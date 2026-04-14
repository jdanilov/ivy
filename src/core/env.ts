import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Part, EnvWarning } from '../types.js';

async function loadDotEnv(targetDir: string): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  try {
    const content = await readFile(path.join(targetDir, '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      vars[key] = val;
    }
  } catch {
    // no .env file
  }
  return vars;
}

export async function checkEnvVars(parts: Part[], targetDir: string): Promise<EnvWarning[]> {
  const dotEnv = await loadDotEnv(targetDir);
  const warnings: EnvWarning[] = [];

  for (const part of parts) {
    if (!part.envVars) continue;
    for (const envVar of part.envVars) {
      if (!process.env[envVar.name] && !dotEnv[envVar.name]) {
        warnings.push({ partName: part.name, envVar });
      }
    }
  }

  return warnings;
}
