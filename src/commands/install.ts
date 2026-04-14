import path from 'node:path';
import { access } from 'node:fs/promises';
import { scanProject } from '../core/scanner.js';
import { readManifest, writeManifest } from '../core/manifest.js';
import { linkPart, injectHooks, injectMcp } from '../core/linker.js';
import { IVY_ROOT } from '../core/registry.js';
import { checkEnvVars } from '../core/env.js';
import { selectParts, confirmOverwrite, confirmModified } from '../ui/prompts.js';
import { I, colors, symbols, statusColor, statusSymbol, statusLabel, displayName, pluralize, typeLabel } from '../ui/theme.js';
import { printPartResult, printHookInfo, formatEnvWarnings } from '../ui/format.js';

export async function install(targetDir: string): Promise<void> {
  const resolvedDir = path.resolve(targetDir);

  // Validate git repo
  try {
    await access(path.join(resolvedDir, '.git'));
  } catch {
    console.log('');
    console.log(`${I}${colors.red}${symbols.cross}${colors.reset} Not a git repository: ${resolvedDir}`);
    console.log('');
    return;
  }

  // Check if .claude/ exists
  let claudeExists = false;
  try {
    await access(path.join(resolvedDir, '.claude'));
    claudeExists = true;
  } catch {
    // doesn't exist
  }

  // Header
  console.log('');
  console.log(`${I}${colors.dim}Target${colors.reset}   ${resolvedDir}`);
  console.log(`${I}${colors.dim}Claude${colors.reset}   ${claudeExists ? '.claude/ exists' : '.claude/ will be created'}`);

  // Scan project
  const states = await scanProject(resolvedDir);

  // Print status matrix
  console.log('');
  console.log(`${I}${'Part'.padEnd(14)}${'Type'.padEnd(10)}Status`);
  console.log(`${I}${'─'.repeat(42)}`);

  for (const ps of states) {
    const col = statusColor(ps.status);
    const sym = statusSymbol(ps.status);
    const label = statusLabel(ps.status);
    console.log(`${I}${displayName(ps.part).padEnd(14)}${colors.dim}${typeLabel(ps.part).padEnd(10)}${colors.reset}${col}${sym} ${label}${colors.reset}`);
  }

  console.log('');

  // Select parts
  const selectedNames = await selectParts(states, 'install');

  // Filter out conflicts that user doesn't want to overwrite
  let filteredNames = [...selectedNames];

  for (const name of selectedNames) {
    const ps = states.find((s) => s.part.name === name);
    if (ps && ps.status === 'conflict') {
      const conflictFiles = ps.part.files
        .filter((f) => ps.files[f.target]?.exists && !ps.files[f.target]?.isSymlink)
        .map((f) => f.target);

      for (const file of conflictFiles) {
        const ok = await confirmOverwrite(file);
        if (!ok) {
          filteredNames = filteredNames.filter((n) => n !== name);
          break;
        }
      }
    }
  }

  // Check for modified parts
  const modifiedSelected = filteredNames.filter((name) => {
    const ps = states.find((s) => s.part.name === name);
    return ps && ps.status === 'modified';
  });

  if (modifiedSelected.length > 0) {
    const ok = await confirmModified(modifiedSelected);
    if (!ok) {
      filteredNames = filteredNames.filter((n) => !modifiedSelected.includes(n));
    }
  }

  if (filteredNames.length === 0) {
    console.log('');
    console.log(`${I}${colors.dim}Nothing to install.${colors.reset}`);
    console.log('');
    return;
  }

  console.log('');
  console.log(`${I}Installing ${pluralize(filteredNames.length, 'part')}...`);
  console.log('');

  // Read or create manifest
  let manifest = await readManifest(resolvedDir);
  if (!manifest) {
    manifest = {
      version: 1,
      ivy: IVY_ROOT,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parts: {},
    };
  } else {
    manifest.updatedAt = new Date().toISOString();
  }

  let newCount = 0;
  let updateCount = 0;

  for (const name of filteredNames) {
    const ps = states.find((s) => s.part.name === name)!;
    const part = ps.part;
    const wasInstalled = ps.status === 'installed' || ps.status === 'modified';

    // Link files (create symlinks)
    const manifestPart = await linkPart(part, resolvedDir, IVY_ROOT);

    // Inject hooks if part has them
    if (part.hooks) {
      await injectHooks(part.hooks, resolvedDir);
    }

    // Inject MCP if part has it
    if (part.mcp) {
      await injectMcp(part.mcp, resolvedDir);
    }

    // Update manifest
    manifest.parts[name] = manifestPart;

    if (wasInstalled) {
      updateCount++;
    } else {
      newCount++;
    }

    // Print result
    const suffix = wasInstalled ? ` ${colors.dim}(updated)${colors.reset}` : '';
    printPartResult(part, { suffix });

    if (part.hooks) {
      printHookInfo();
    }
  }

  // Write manifest
  await writeManifest(resolvedDir, manifest);

  // Check env vars
  const installedParts = filteredNames
    .map((n) => states.find((s) => s.part.name === n)!.part);
  const envWarnings = await checkEnvVars(installedParts, resolvedDir);
  const envOutput = formatEnvWarnings(envWarnings);
  if (envOutput) {
    console.log(envOutput);
  }

  // Summary
  console.log('');
  if (updateCount > 0 && newCount > 0) {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${newCount} installed, ${updateCount} updated.`);
  } else if (updateCount > 0) {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${updateCount} updated.`);
  } else {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${pluralize(newCount, 'part')} installed.`);
  }
  console.log('');
}
