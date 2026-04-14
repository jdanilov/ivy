import * as p from '@clack/prompts';
import { existsSync } from 'node:fs';
import type { PartState } from '../types.js';
import { statusSymbol, statusColor, colors, displayName } from './theme.js';

export class CancelError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelError';
  }
}

function unwrap<T>(result: T | symbol): T {
  if (p.isCancel(result)) {
    p.cancel('');
    throw new CancelError();
  }
  return result as T;
}

type Command = 'install' | 'uninstall' | 'status' | 'cycle';

export async function pickCommand(): Promise<Command> {
  return unwrap(await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'install' as Command, label: 'Install', hint: 'add parts to a project' },
      { value: 'uninstall' as Command, label: 'Uninstall', hint: 'remove parts from a project' },
      { value: 'status' as Command, label: 'Status', hint: 'show what\'s installed' },
      { value: 'cycle' as Command, label: 'Cycle', hint: 'run developer-critic loop' },
    ],
  }));
}

export async function pickProject(recentProjects: string[]): Promise<string> {
  const existing = recentProjects.filter((p) => existsSync(p));

  const options: { value: string; label: string; hint?: string }[] = existing.map((dir) => ({
    value: dir,
    label: dir,
  }));
  options.push({
    value: '__custom__',
    label: 'Enter a path...',
    hint: 'type a new project path',
  });

  const result = unwrap(await p.select({
    message: 'Select a project:',
    options,
  }));

  if (result === '__custom__') {
    const custom = unwrap(await p.text({
      message: 'Project path:',
      placeholder: '/path/to/project',
      validate(value) {
        if (!value.trim()) return 'Path is required';
        if (!existsSync(value.trim())) return 'Directory does not exist';
        return undefined;
      },
    }));

    return (custom as string).trim();
  }

  return result as string;
}

export async function selectParts(
  parts: PartState[],
  mode: 'install' | 'uninstall',
): Promise<string[]> {
  const options = parts.map((ps) => {
    const sym = statusSymbol(ps.status);
    const col = statusColor(ps.status);

    let hint = '';
    if (mode === 'install') {
      if (ps.status === 'installed') hint = 'no changes';
      else if (ps.status === 'modified') hint = 'will overwrite';
      else if (ps.status === 'conflict') hint = 'conflict — file exists';
    } else {
      if (ps.status === 'modified') hint = 'has local changes';
    }

    const description = ps.part.description + (hint ? ` ${colors.dim}· ${hint}${colors.reset}` : '');

    const initialValue = mode === 'install'
      ? ps.part.default && ps.status !== 'installed'
      : false;

    return {
      value: ps.part.name,
      label: `${col}${sym}${colors.reset} ${displayName(ps.part)}`,
      hint: description,
      initialValue,
    };
  });

  const title = mode === 'install' ? 'Select parts to install:' : 'Select parts to uninstall:';

  return unwrap(await p.multiselect({
    message: title,
    options: options.map((o) => ({
      value: o.value,
      label: o.label,
      hint: o.hint,
    })),
    initialValues: options.filter((o) => o.initialValue).map((o) => o.value),
    required: false,
  }));
}

export async function confirmOverwrite(filePath: string): Promise<boolean> {
  return unwrap(await p.confirm({
    message: `${colors.yellow}⚠${colors.reset} Conflict: ${filePath} exists but was not installed by Ivy. Overwrite?`,
    initialValue: false,
  }));
}

export async function confirmModified(partNames: string[]): Promise<boolean> {
  const names = partNames.join(', ');
  return unwrap(await p.confirm({
    message: `${colors.yellow}⚠${colors.reset} ${names} ${partNames.length === 1 ? 'has' : 'have'} local changes that will be overwritten. Continue?`,
    initialValue: true,
  }));
}
