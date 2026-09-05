import path from 'node:path';
import { homedir } from 'node:os';
import { lstat, mkdir, unlink } from 'node:fs/promises';
import { FACTORY_ROOT } from './registry.js';
import { I, colors } from '../ui/theme.js';

export const FACTORY_HOME = path.join(homedir(), '.factory');

const PROJECTS_FILE = path.join(FACTORY_HOME, 'projects');
const SEED_FILE = path.join(FACTORY_ROOT, '.projects');
const DROID_FILES = ['auth.v2.key', 'droids'];

let ready: Promise<boolean> | null = null;

/** Create ~/.factory unless Droid still owns it. Seeds the projects file from the repo once. */
function home(): Promise<boolean> {
  ready ??= (async () => {
    for (const name of DROID_FILES) {
      if (await lstat(path.join(FACTORY_HOME, name)).catch(() => null)) {
        console.log(`${I}${colors.yellow}${FACTORY_HOME}/${name} belongs to Droid — move it aside, the Factory owns ${FACTORY_HOME} now.${colors.reset}`);
        return false;
      }
    }

    await mkdir(FACTORY_HOME, { recursive: true });

    const seed = Bun.file(SEED_FILE);
    if (!(await Bun.file(PROJECTS_FILE).exists()) && (await seed.exists())) {
      await Bun.write(PROJECTS_FILE, await seed.text());
    }
    await unlink(SEED_FILE).catch(() => {});

    return true;
  })();
  return ready;
}

export async function loadProjects(): Promise<string[]> {
  if (!(await home())) return [];
  const file = Bun.file(PROJECTS_FILE);
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
  if (!(await home())) return;
  const projects = await loadProjects();
  const abs = path.resolve(projectPath);
  const idx = projects.indexOf(abs);
  if (idx !== -1) projects.splice(idx, 1);
  projects.unshift(abs);
  await Bun.write(PROJECTS_FILE, projects.join('\n') + '\n');
}
