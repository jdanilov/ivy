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
  conflict: '▲',
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
    default:
      return symbols.notInstalled;
  }
}

export function typeLabel(part: Part): string {
  return part.type;
}

export function displayName(part: Part): string {
  return part.type === 'skill' || part.type === 'tool' ? `/${part.name}` : part.name;
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
    default:
      return status;
  }
}
