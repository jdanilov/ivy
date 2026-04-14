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

import type { Part } from '../types.js';

export function displayName(part: Part): string {
  return part.type === 'skill' ? `/${part.name}` : part.name;
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
