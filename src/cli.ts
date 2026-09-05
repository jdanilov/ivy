#!/usr/bin/env bun

import { pickCommand, pickProject, CancelError } from './ui/prompts.js';
import { loadProjects, saveProject } from './core/projects.js';
import { loadParts } from './core/registry.js';
import { parseArgs, str, type Flags } from './core/args.js';
import { Refusal } from './core/mission.js';
import { I, colors, setNameCol } from './ui/theme.js';

// Mission work happens in the checkout you are standing in; only the part commands pick a project.
const MISSION_COMMANDS = ['mission', 'step', 'gate', 'handoff'];

async function runMissionCommand(cmd: string, argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv);
  const [sub, ...rest] = positionals;
  const cwd = process.cwd();

  switch (cmd) {
    case 'mission': {
      const { mission } = await import('./commands/mission.js');
      return mission(sub!, rest, flags, cwd);
    }
    case 'step': {
      const { step } = await import('./commands/step.js');
      return step(sub!, rest, flags, cwd);
    }
    case 'gate': {
      const { gate } = await import('./commands/gate.js');
      return gate(sub!, rest, flags, cwd);
    }
    default: {
      const { handoff } = await import('./commands/handoff.js');
      return handoff(sub!, rest, flags, cwd);
    }
  }
}

async function dispatch(cmd: string, targetDir: string, flags: Flags): Promise<void> {
  switch (cmd) {
    case 'install': {
      const { install } = await import('./commands/install.js');
      const parts = str(flags, 'parts');
      return install(targetDir, flags.yes === true, parts ? parts.split(',') : []);
    }
    case 'uninstall': {
      const { uninstall } = await import('./commands/uninstall.js');
      return uninstall(targetDir, flags.yes === true);
    }
    case 'status': {
      const { status } = await import('./commands/status.js');
      return status(targetDir);
    }
    case 'update': {
      const { update } = await import('./commands/update.js');
      const skip = str(flags, 'skip');
      return update(targetDir, skip ? skip.split(',') : []);
    }
    default:
      throw new Refusal(`unknown command: ${cmd} — install, uninstall, status, update, mission, step, gate, handoff`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] && MISSION_COMMANDS.includes(args[0])) return runMissionCommand(args[0], args.slice(1));

  console.log(`\n${colors.bold}Factory${colors.reset} ${colors.dim}— portable development harness${colors.reset}\n`);

  setNameCol(await loadParts());

  const { positionals, flags } = parseArgs(args);
  const cmd = positionals[0] || await pickCommand();
  const targetDir = positionals[1] ?? await pickProject(await loadProjects());
  await saveProject(targetDir);

  await dispatch(cmd, targetDir, flags);
}

main().catch((err) => {
  if (err instanceof CancelError) process.exit(0);
  if (err instanceof Refusal) {
    console.log(`${I}${colors.red}✗${colors.reset} ${err.message}`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
