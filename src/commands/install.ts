import path from 'node:path';
import { access } from 'node:fs/promises';
import { scanProject } from '../core/scanner.js';
import { readManifest, writeManifest } from '../core/manifest.js';
import { linkPart, injectHooks, injectMcp, injectSettings, writeSnippet } from '../core/linker.js';
import { resolvePart, runInit } from '../core/recipes.js';
import { FACTORY_ROOT, withRequires } from '../core/registry.js';
import { checkEnvVars } from '../core/env.js';
import { selectParts, confirmOverwrite, confirmModified } from '../ui/prompts.js';
import { I, nameCol, colors, symbols, statusColor, statusSymbol, statusLabel, displayName, pluralize, typeLabel } from '../ui/theme.js';
import { printPartResult, printHookInfo, printSnippetInfo, formatEnvWarnings } from '../ui/format.js';

export async function install(targetDir: string, yes = false): Promise<void> {
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
  console.log(`${I}${'Part'.padEnd(nameCol())}${'Type'.padEnd(10)}Status`);
  console.log(`${I}${'─'.repeat(42)}`);

  for (const ps of states) {
    const col = statusColor(ps.status);
    const sym = statusSymbol(ps.status);
    const label = statusLabel(ps.status);
    console.log(`${I}${displayName(ps.part).padEnd(nameCol())}${colors.dim}${typeLabel(ps.part).padEnd(10)}${colors.reset}${col}${sym} ${label}${colors.reset}`);
  }

  console.log('');

  // Select parts. `--yes` answers nobody's question: the defaults plus what is already installed,
  // and a part whose target holds a file of the project's own is left alone.
  const selectedNames = yes
    ? states.filter((s) => s.status !== 'conflict' && (s.part.default || s.status === 'installed' || s.status === 'modified')).map((s) => s.part.name)
    : await selectParts(states, 'install');

  // A part without what it requires is broken, so the requirement comes along unasked.
  const { names: withDeps, added } = withRequires(states.map((s) => s.part), selectedNames);
  if (added.length > 0) {
    const names = added.map((n) => displayName(states.find((s) => s.part.name === n)!.part));
    console.log(`${I}${colors.dim}Also selected${colors.reset}  ${names.join(', ')} ${colors.dim}— required${colors.reset}`);
  }

  // Filter out conflicts that user doesn't want to overwrite
  let filteredNames = [...withDeps];

  for (const name of yes ? [] : withDeps) {
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

  if (modifiedSelected.length > 0 && !yes) {
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
      factory: FACTORY_ROOT,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parts: {},
    };
  } else {
    manifest.updatedAt = new Date().toISOString();
  }

  let newCount = 0;
  let updateCount = 0;
  // An init recipe that fails leaves the part linked and the manifest written, so `update` retries it.
  let failure: unknown = null;

  for (const name of filteredNames) {
    const ps = states.find((s) => s.part.name === name)!;
    const part = await resolvePart(ps.part);
    const wasInstalled = ps.status === 'installed' || ps.status === 'modified';
    const previous = manifest.parts[name];

    // Link files (create symlinks)
    const manifestPart = await linkPart(part, resolvedDir, FACTORY_ROOT);

    // Inject hooks if part has them
    if (part.hooks) {
      await injectHooks(part.hooks, resolvedDir);
    }

    // Inject MCP if part has it
    if (part.mcp) {
      await injectMcp(part.mcp, resolvedDir);
    }

    // Merge settings if part has them
    if (part.settings) {
      await injectSettings(part.settings, resolvedDir);
    }

    // Add the part's line to the agent file, recording where it went.
    let snippetAdded = false;
    if (part.snippet) {
      const { record, changed } = await writeSnippet(part.snippet, resolvedDir, previous?.snippet);
      manifestPart.snippet = record;
      snippetAdded = changed;
    }

    // Update manifest. Picking a part here takes it back off the skip list.
    manifest.parts[name] = manifestPart;
    if (manifest.skipped) manifest.skipped = manifest.skipped.filter((n) => n !== name);

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

    if (snippetAdded) {
      printSnippetInfo(manifestPart.snippet!.file, 'added');
    }

    try {
      await runInit(part, previous, manifestPart, resolvedDir);
    } catch (err) {
      failure = err;
      break;
    }
  }

  // Write manifest
  await writeManifest(resolvedDir, manifest);
  if (failure) throw failure;

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
