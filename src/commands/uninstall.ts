import path from 'node:path';
import { readManifest, writeManifest, deleteManifest } from '../core/manifest.js';
import { scanProject } from '../core/scanner.js';
import { unlinkPart, removeHooks, removeMcp, removeSettings, removeSnippet, dropEmptied } from '../core/linker.js';
import { runUninit } from '../core/recipes.js';
import { FACTORY_ROOT } from '../core/registry.js';
import { selectParts, confirmModified } from '../ui/prompts.js';
import { I, nameCol, colors, statusColor, statusSymbol, displayName, pluralize } from '../ui/theme.js';
import { printPartResult, printSnippetInfo } from '../ui/format.js';

export async function uninstall(targetDir: string, yes = false): Promise<void> {
  const resolvedDir = path.resolve(targetDir);

  // Read manifest
  const manifest = await readManifest(resolvedDir);
  if (!manifest || Object.keys(manifest.parts).length === 0) {
    console.log('');
    console.log(`${I}${colors.dim}No parts installed.${colors.reset}`);
    console.log('');
    return;
  }

  // Header
  console.log(`${I}${colors.dim}Target${colors.reset}   ${resolvedDir}`);

  // Scan and filter to installed/modified
  const allStates = await scanProject(resolvedDir);
  const installedStates = allStates.filter(
    (s) => s.status === 'installed' || s.status === 'modified',
  );

  if (installedStates.length === 0) {
    console.log('');
    console.log(`${I}${colors.dim}No parts installed.${colors.reset}`);
    console.log('');
    return;
  }

  // Print installed parts
  console.log('');
  console.log(`${I}${colors.dim}Installed parts:${colors.reset}`);
  const pad = ' '.repeat(I.length + 2 + nameCol());

  for (const ps of installedStates) {
    const col = statusColor(ps.status);
    const sym = statusSymbol(ps.status);
    const fileList = ps.part.files.map((f) => f.target);
    const modifiedHint = ps.status === 'modified' ? ` ${colors.dim}· modified${colors.reset}` : '';

    if (fileList.length > 0) {
      console.log(`${I}${col}${sym}${colors.reset} ${displayName(ps.part).padEnd(nameCol())}${fileList[0]}${modifiedHint}`);
      for (let i = 1; i < fileList.length; i++) {
        console.log(`${pad}${fileList[i]}`);
      }
    } else if (ps.part.mcp) {
      console.log(`${I}${col}${sym}${colors.reset} ${displayName(ps.part).padEnd(nameCol())}.mcp.json → ${ps.part.mcp.serverName}${modifiedHint}`);
    } else {
      console.log(`${I}${col}${sym}${colors.reset} ${displayName(ps.part)}${modifiedHint}`);
    }
  }

  console.log('');

  // Select parts to uninstall. `--yes` takes every installed part and asks nothing.
  let selectedNames = yes
    ? installedStates.map((s) => s.part.name)
    : await selectParts(installedStates, 'uninstall');

  if (selectedNames.length === 0) {
    console.log('');
    console.log(`${I}${colors.dim}Nothing to uninstall.${colors.reset}`);
    console.log('');
    return;
  }

  // Filter out modified parts if user declines
  const modifiedSelected = selectedNames.filter((name) => {
    const ps = installedStates.find((s) => s.part.name === name);
    return ps && ps.status === 'modified';
  });

  if (modifiedSelected.length > 0 && !yes) {
    const ok = await confirmModified(modifiedSelected);
    if (!ok) {
      selectedNames = selectedNames.filter((n) => !modifiedSelected.includes(n));
    }
  }

  if (selectedNames.length === 0) {
    console.log('');
    console.log(`${I}${colors.dim}Nothing to uninstall.${colors.reset}`);
    console.log('');
    return;
  }

  // Perform uninstall
  console.log('');
  console.log(`${I}Uninstalling ${pluralize(selectedNames.length, 'part')}...`);
  console.log('');

  for (const name of selectedNames) {
    const ps = installedStates.find((s) => s.part.name === name)!;
    const part = ps.part;

    // The manifest holds what the install actually wrote, vars resolved; the part.yaml may have moved on.
    const entry = manifest.parts[name];
    if (entry) {
      await runUninit(name, entry.uninit, resolvedDir);
      await unlinkPart(entry, resolvedDir, FACTORY_ROOT);
      if (entry.hooks) await removeHooks(entry.hooks, resolvedDir);
      if (entry.mcp) await removeMcp(entry.mcp.serverName, resolvedDir);
      if (entry.settings) await removeSettings(entry.settings, resolvedDir);
    }

    delete manifest.parts[name];

    printPartResult(part, { verb: 'removed' });

    if (entry?.snippet && (await removeSnippet(entry.snippet, resolvedDir))) {
      printSnippetInfo(entry.snippet.file, 'removed');
    }
  }

  for (const file of await dropEmptied(resolvedDir)) {
    console.log(`${I}${colors.dim}removed ${file}, nothing left in it${colors.reset}`);
  }

  // Write or delete manifest
  const remainingCount = Object.keys(manifest.parts).length;
  if (remainingCount === 0) {
    await deleteManifest(resolvedDir);
  } else {
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(resolvedDir, manifest);
  }

  console.log('');
  const removedStr = `${pluralize(selectedNames.length, 'part')} removed`;
  if (remainingCount > 0) {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${removedStr}. ${remainingCount} remaining.`);
  } else {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${removedStr}.`);
  }
  console.log('');
}
