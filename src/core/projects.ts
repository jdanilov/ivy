import path from 'node:path';
import { IVY_ROOT } from './registry.js';

const PROJECTS_FILE = path.join(IVY_ROOT, '.projects');

export async function loadProjects(): Promise<string[]> {
  const file = Bun.file(PROJECTS_FILE);
  if (!(await file.exists())) return [];
  const text = await file.text();
  return text.split('\n').filter((l) => l.trim() !== '');
}

export async function saveProject(projectPath: string): Promise<void> {
  const projects = await loadProjects();
  const abs = path.resolve(projectPath);
  if (!projects.includes(abs)) {
    projects.unshift(abs);
  } else {
    // Move to top (most recent)
    const idx = projects.indexOf(abs);
    projects.splice(idx, 1);
    projects.unshift(abs);
  }
  await Bun.write(PROJECTS_FILE, projects.join('\n') + '\n');
}
