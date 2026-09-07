import type { Part } from '../types.js';

// 3-space indent to match @clack/prompts gutter (│)
export const I = '   ';

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export const symbols = {
  installed: '●',
  modified: '▲',
  notInstalled: '○',
  conflict: '✗',   // docs/design.md: ▲ yellow is modified, ✗ red is conflict
  skipped: '⊘',
  check: '✓',
  cross: '✗',
  selected: '◉',
  unselected: '◌',
};

export function statusColor(status: string): string {
  switch (status) {
    case 'installed':
      return colors.green;
    case 'modified':
      return colors.yellow;
    case 'not-installed':
      return colors.dim;
    case 'conflict':
      return colors.red;
    case 'skipped':
      return colors.dim;
    default:
      return colors.reset;
  }
}

export function statusSymbol(status: string): string {
  switch (status) {
    case 'installed':
      return symbols.installed;
    case 'modified':
      return symbols.modified;
    case 'not-installed':
      return symbols.notInstalled;
    case 'conflict':
      return symbols.conflict;
    case 'skipped':
      return symbols.skipped;
    default:
      return symbols.notInstalled;
  }
}

// Row states from docs/design.md: pending ○, running ●, done ✓, blocked ⊘. A step never fails —
// it is done, skipped or waiting on someone — so there is no ✗ row for a caller to reach.
export function rowSymbol(state: string): string {
  switch (state) {
    case 'running':
      return symbols.installed;
    case 'done':
      return symbols.check;
    case 'blocked':
      return '⊘';
    default:
      return symbols.notInstalled;
  }
}

export function rowColor(state: string): string {
  switch (state) {
    case 'running':
      return colors.cyan;
    case 'done':
      return colors.green;
    case 'blocked':
      return colors.yellow;
    default:
      return colors.dim;
  }
}

/** `23m 25s`, or just `10s` under a minute. */
export function duration(fromISO?: string, toISO?: string): string {
  if (!fromISO) return '';
  const ms = new Date(toISO ?? Date.now()).getTime() - new Date(fromISO).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const total = Math.round(ms / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60);
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

export function typeLabel(part: Part): string {
  return part.type;
}

export function displayName(part: Part): string {
  if (part.type === 'skill' || part.type === 'tool') return `/${part.name}`;
  return part.name;
}

// Column width for part display names, set once from the loaded parts
let nameColWidth = 16;

export function setNameCol(parts: Part[]): void {
  if (parts.length > 0) nameColWidth = Math.max(...parts.map((p) => displayName(p).length)) + 2;
}

export function nameCol(): number {
  return nameColWidth;
}

export function pluralize(count: number, singular: string, plural: string = singular + 's'): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'installed':
      return 'installed';
    case 'modified':
      return 'modified';
    case 'not-installed':
      return 'not installed';
    case 'conflict':
      return 'conflict';
    case 'skipped':
      return 'skipped';
    default:
      return status;
  }
}
