import type { Part, EnvWarning } from '../types.js';
import { I, colors, symbols, displayName } from './theme.js';

const PAD = ' '.repeat(I.length + 2 + 14); // indent + "✓ " + name column

/**
 * Print a part's result line with file list, MCP info, or plain name.
 * Used by both install (with suffix like "(updated)") and uninstall (with prefix like "removed").
 */
export function printPartResult(
  part: Part,
  opts: { verb?: string; suffix?: string } = {},
): void {
  const dname = displayName(part);
  const fileList = part.files.map((f) => f.target);
  const suffix = opts.suffix ?? '';
  const verb = opts.verb ? `${opts.verb} ` : '';

  if (fileList.length > 0) {
    console.log(`${I}${colors.green}${symbols.check}${colors.reset} ${dname.padEnd(14)}${verb}${fileList[0]}${suffix}`);
    for (let i = 1; i < fileList.length; i++) {
      console.log(`${PAD}${fileList[i]}`);
    }
  } else if (part.mcp) {
    console.log(`${I}${colors.green}${symbols.check}${colors.reset} ${dname.padEnd(14)}${verb}.mcp.json → ${part.mcp.serverName}${suffix}`);
  } else {
    console.log(`${I}${colors.green}${symbols.check}${colors.reset} ${dname}${suffix}`);
  }
}

/**
 * Print hook injection info line (indented under the part result).
 */
export function printHookInfo(): void {
  console.log(`${PAD}.claude/settings.local.json → hook added`);
}

/**
 * Format environment variable warnings for display.
 */
export function formatEnvWarnings(warnings: EnvWarning[]): string {
  if (warnings.length === 0) return '';

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
