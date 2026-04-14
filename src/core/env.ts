import type { Part, EnvWarning } from '../types.js';
import { colors } from '../ui/theme.js';

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

export function formatEnvWarnings(warnings: EnvWarning[]): string {
  if (warnings.length === 0) return '';

  const I = '   '; // 3-space indent to match @clack/prompts gutter
  const lines: string[] = [
    '',
    `${I}${colors.yellow}⚠ Environment variables needed:${colors.reset}`,
    '',
  ];

  for (const w of warnings) {
    lines.push(
      `${I}${colors.dim}${w.partName.padEnd(12)}${colors.reset}${w.envVar.name}   ${colors.dim}— ${w.envVar.url}${colors.reset}`,
    );
  }

  lines.push('');
  lines.push(`${I}${colors.dim}Add to your project .env or export in shell.${colors.reset}`);

  return lines.join('\n');
}
