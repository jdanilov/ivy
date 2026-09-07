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

/** One mission line: glyph, name, workflow · step · round, then session liveness. Archived rows dim. */
export function missionRow(state: MissionState, row: string, live: boolean, archived = false): void {
  const glyph = `${archived ? colors.dim : rowColor(row)}${rowSymbol(row)}${colors.reset}`;
  const name = archived ? `${colors.dim}${state.name.padEnd(20)}${colors.reset}` : state.name.padEnd(20);
  const detail = `${colors.dim}${state.workflow} · ${state.step || '—'} · r${state.round}${colors.reset}`;
  const session = archived
    ? `${colors.dim}archived${colors.reset}`
    : state.status === 'stub'
    ? `${colors.dim}stub${colors.reset}`
    : state.status === 'closed'
    ? `${colors.dim}closed${colors.reset}`
    : live
      ? `${colors.cyan}session${colors.reset}`
      : `${colors.dim}no session${colors.reset}`;
  headerRow(`${glyph} ${name}${detail}`, session);
}

// indent + "✓ " + name column
function pad(): string {
  return ' '.repeat(I.length + 2 + nameCol());
}

/**
 * One part, one row: the glyph, the name column, then what happened to it. Every line in the
 * install family that is not a file list is this shape, so a report reads down one column.
 */
export function partRow(symbol: string, color: string, name: string, text: string): void {
  console.log(`${I}${color}${symbol}${colors.reset} ${name.padEnd(nameCol())}${text}`);
}

/** The row for something the Factory did not do: dim end to end, wherever it is printed from. */
export function partNote(name: string, text: string): void {
  console.log(`${I}${colors.dim}! ${name.padEnd(nameCol())}${text}${colors.reset}`);
}

/**
 * Print a part's result line with file list, MCP info, or plain name.
 * Used by both install (with suffix like "(updated)") and uninstall (with prefix like "removed"),
 * which names the files it actually removed rather than every file the part ships.
 */
export function printPartResult(
  part: Part,
  opts: { verb?: string; suffix?: string; files?: string[] } = {},
): void {
  const dname = displayName(part);
  const fileList = opts.files ?? part.files.map((f) => f.target);
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

/** One line under the part result for the settings file the hooks went into. */
export function printHookInfo(file: string): void {
  console.log(`${pad()}${file} → hook added`);
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
