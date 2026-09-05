import type { Part, EnvWarning, MissionState } from '../types.js';
import { I, nameCol, colors, symbols, displayName, rowColor, rowSymbol } from './theme.js';

const ROW_WIDTH = 62;
const visible = (text: string): number => text.replace(/\x1b\[[0-9;]*m/g, '').length;

/** Dim label, bright value, one per line. */
export function field(label: string, value: string): void {
  console.log(`${I}${colors.dim}${label.padEnd(9)}${colors.reset}${value}`);
}

export function rule(): void {
  console.log(`${I}${colors.dim}${'─'.repeat(ROW_WIDTH)}${colors.reset}`);
}

/** Left text, right-aligned metrics, padded by visible width so colors do not shift it. */
export function headerRow(left: string, right: string): void {
  if (right === '') return console.log(`${I}${left.trimEnd()}`);
  const gap = Math.max(1, ROW_WIDTH - visible(left) - visible(right));
  console.log(`${I}${left}${' '.repeat(gap)}${right}`);
}

/** One mission line: glyph, name, workflow · step · round, then session liveness. */
export function missionRow(state: MissionState, row: string, live: boolean): void {
  const glyph = `${rowColor(row)}${rowSymbol(row)}${colors.reset}`;
  const detail = `${colors.dim}${state.workflow} · ${state.step || '—'} · r${state.round}${colors.reset}`;
  const session = state.status === 'stub'
    ? `${colors.dim}stub${colors.reset}`
    : state.status === 'closed'
    ? `${colors.dim}closed${colors.reset}`
    : live
      ? `${colors.cyan}session${colors.reset}`
      : `${colors.dim}no session${colors.reset}`;
  headerRow(`${glyph} ${state.name.padEnd(20)}${detail}`, session);
}

// indent + "✓ " + name column
function pad(): string {
  return ' '.repeat(I.length + 2 + nameCol());
}

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
    console.log(`${I}${colors.green}${symbols.check}${colors.reset} ${dname.padEnd(nameCol())}${verb}${fileList[0]}${suffix}`);
    for (let i = 1; i < fileList.length; i++) {
      console.log(`${pad()}${fileList[i]}`);
    }
  } else if (part.mcp) {
    console.log(`${I}${colors.green}${symbols.check}${colors.reset} ${dname.padEnd(nameCol())}${verb}.mcp.json → ${part.mcp.serverName}${suffix}`);
  } else {
    console.log(`${I}${colors.green}${symbols.check}${colors.reset} ${dname}${suffix}`);
  }
}

/**
 * Print hook injection info line (indented under the part result).
 */
export function printHookInfo(): void {
  console.log(`${pad()}.claude/settings.local.json → hook added`);
}

/** One line under the part result for the agent-file line a snippet added or removed. */
export function printSnippetInfo(file: string, action: 'added' | 'removed'): void {
  console.log(`${pad()}${file} \u2192 line ${action}`);
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
