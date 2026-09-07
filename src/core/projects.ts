import path from 'node:path';
import { homedir } from 'node:os';
import { lstat, mkdir, unlink } from 'node:fs/promises';
import type { Scope } from '../types.js';
import { FACTORY_ROOT } from './registry.js';
import { I, colors } from '../ui/theme.js';

/**
 * HOME read at call time, never at import: Bun fixes `os.homedir()` when the process starts, so a
 * scratch HOME set by a test or a spawned run would otherwise reach the real one anyway.
 */
export const home = (): string => process.env.HOME ?? homedir();

export const factoryHome = (): string => path.join(home(), '.factory');

/** The home dir is the global scope, every other target is a project. One rule, read everywhere. */
export const scopeOf = (targetDir: string): Scope => (path.resolve(targetDir) === home() ? 'global' : 'project');

const projectsFile = (): string => path.join(factoryHome(), 'projects');
const SEED_FILE = path.join(FACTORY_ROOT, '.projects');
const DROID_FILES = ['auth.v2.key', 'droids'];

let ready: Promise<boolean> | null = null;

/** Create ~/.factory unless Droid still owns it. Seeds the projects file from the repo once. */
function ownHome(): Promise<boolean> {
  ready ??= (async () => {
    for (const name of DROID_FILES) {
      if (await lstat(path.join(factoryHome(), name)).catch(() => null)) {
        console.log(`${I}${colors.yellow}${factoryHome()}/${name} belongs to Droid — move it aside, the Factory owns ${factoryHome()} now.${colors.reset}`);
        return false;
      }
    }

    await mkdir(factoryHome(), { recursive: true });

    const seed = Bun.file(SEED_FILE);
    if (!(await Bun.file(projectsFile()).exists()) && (await seed.exists())) {
      await Bun.write(projectsFile(), await seed.text());
    }
    await unlink(SEED_FILE).catch(() => {});

    return true;
  })();
  return ready;
}

export async function loadProjects(): Promise<string[]> {
  if (!(await ownHome())) return [];
  const file = Bun.file(projectsFile());
  if (!(await file.exists())) return [];
  const text = await file.text();
  return text.split('\n').filter((l) => l.trim() !== '');
}

/** A project path can vanish. The list commands skip it silently, the projects file keeps it. */
export async function existingProjects(): Promise<string[]> {
  const live: string[] = [];
  for (const project of await loadProjects()) {
    if (await lstat(project).catch(() => null)) live.push(project);
  }
  return live;
}

export async function saveProject(projectPath: string): Promise<void> {
  if (!(await ownHome())) return;
  const projects = await loadProjects();
  const abs = path.resolve(projectPath);
  const idx = projects.indexOf(abs);
  if (idx !== -1) projects.splice(idx, 1);
  projects.unshift(abs);
  await Bun.write(projectsFile(), projects.join('\n') + '\n');
}
