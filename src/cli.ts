#!/usr/bin/env bun

import { pickCommand, pickProject, CancelError } from './ui/prompts.js';
import { loadProjects, saveProject } from './core/projects.js';
import { colors } from './ui/theme.js';

const args = process.argv.slice(2);

async function resolveProject(argPath?: string): Promise<string> {
  if (argPath) return argPath;
  const recent = await loadProjects();
  return pickProject(recent);
}

async function dispatch(cmd: string, targetDir: string, plan?: string): Promise<void> {
  switch (cmd) {
    case 'install': {
      const { install } = await import('./commands/install.js');
      return install(targetDir);
    }
    case 'uninstall': {
      const { uninstall } = await import('./commands/uninstall.js');
      return uninstall(targetDir);
    }
    case 'status': {
      const { status } = await import('./commands/status.js');
      return status(targetDir);
    }
    case 'cycle': {
      const { cycle } = await import('./commands/cycle.js');
      return cycle(plan, targetDir);
    }
    default:
      console.log(`   ${colors.red}Unknown command: ${cmd}${colors.reset}`);
      process.exit(1);
  }
}

async function main() {
  console.log(`\n${colors.bold}Ivy${colors.reset} ${colors.dim}— portable development harness${colors.reset}\n`);

  const cmd = args[0] || await pickCommand();
  const rest = args.slice(1);
  const targetDir = await resolveProject(rest[0]);
  await saveProject(targetDir);

  await dispatch(cmd, targetDir, rest[1]);
}

main().catch((err) => {
  if (err instanceof CancelError) process.exit(0);
  console.error(err);
  process.exit(1);
});
