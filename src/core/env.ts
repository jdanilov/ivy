import type { Part, EnvWarning } from '../types.js';

export function checkEnvVars(parts: Part[]): EnvWarning[] {
  const warnings: EnvWarning[] = [];

  for (const part of parts) {
    if (!part.envVars) continue;
    for (const envVar of part.envVars) {
      if (!process.env[envVar.name]) {
        warnings.push({ partName: part.name, envVar });
      }
    }
  }

  return warnings;
}
