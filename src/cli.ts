#!/usr/bin/env bun

import { pickCommand, pickProject } from './ui/prompts.js';
import { loadProjects, saveProject } from './core/projects.js';
import { colors } from './ui/theme.js';

const args = process.argv.slice(2);
const command = args[0];

async function resolveProject(argPath?: string): Promise<string> {
  if (argPath) return argPath;
  const recent = await loadProjects();
  return pickProject(recent);
}

async function main() {
  console.log(`\n${colors.bold}Ivy${colors.reset} ${colors.dim}— portable development harness${colors.reset}\n`);

  if (command) {
    // Direct invocation: ivy <command> [path]
    const rest = args.slice(1);
    switch (command) {
      case 'install': {
        const targetDir = await resolveProject(rest[0]);
        await saveProject(targetDir);
        const { install } = await import('./commands/install.js');
        await install(targetDir);
        break;
      }
      case 'uninstall': {
        const targetDir = await resolveProject(rest[0]);
        await saveProject(targetDir);
        const { uninstall } = await import('./commands/uninstall.js');
        await uninstall(targetDir);
        break;
      }
      case 'status': {
        const targetDir = await resolveProject(rest[0]);
        await saveProject(targetDir);
        const { status } = await import('./commands/status.js');
        await status(targetDir);
        break;
      }
      case 'cycle': {
        const targetDir = await resolveProject(rest[0]);
        await saveProject(targetDir);
        const plan = rest[1];
        const { cycle } = await import('./commands/cycle.js');
        await cycle(plan, targetDir);
        break;
      }
      default:
        console.log(`  ${colors.red}Unknown command: ${command}${colors.reset}`);
        process.exit(1);
    }
  } else {
    // Interactive: pick project first, then command
    const targetDir = await resolveProject();
    await saveProject(targetDir);
    const cmd = await pickCommand();

    switch (cmd) {
      case 'install': {
        const { install } = await import('./commands/install.js');
        await install(targetDir);
        break;
      }
      case 'uninstall': {
        const { uninstall } = await import('./commands/uninstall.js');
        await uninstall(targetDir);
        break;
      }
      case 'status': {
        const { status } = await import('./commands/status.js');
        await status(targetDir);
        break;
      }
      case 'cycle': {
        const { cycle } = await import('./commands/cycle.js');
        await cycle(undefined, targetDir);
        break;
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
