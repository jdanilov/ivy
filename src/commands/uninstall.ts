import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { readManifest, writeManifest, MANIFEST_PATH } from '../core/manifest.js';
import { scanProject } from '../core/scanner.js';
import { unlinkPart, removeHooks, removeMcp } from '../core/linker.js';
import { selectParts, confirmModified } from '../ui/prompts.js';
import { colors, symbols, statusColor, statusSymbol, displayName } from '../ui/theme.js';
import type { PartState } from '../types.js';

const I = '   '; // 3-space indent to match @clack/prompts gutter

export async function uninstall(targetDir: string): Promise<void> {
  const resolvedDir = path.resolve(targetDir);

  // Read manifest
  const manifest = await readManifest(resolvedDir);
  if (!manifest || Object.keys(manifest.parts).length === 0) {
    console.log('');
    console.log(`${I}${colors.dim}No ivy parts installed.${colors.reset}`);
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
    console.log(`${I}${colors.dim}No ivy parts installed.${colors.reset}`);
    console.log('');
    return;
  }

  // Print installed parts
  console.log('');
  console.log(`${I}${colors.dim}Installed parts:${colors.reset}`);
  const pad = ' '.repeat(I.length + 2 + 14);

  for (const ps of installedStates) {
    const col = statusColor(ps.status);
    const sym = statusSymbol(ps.status);
    const fileList = ps.part.files.map((f) => f.target);
    const modifiedHint = ps.status === 'modified' ? ` ${colors.dim}· modified${colors.reset}` : '';

    if (fileList.length > 0) {
      console.log(`${I}${col}${sym}${colors.reset} ${displayName(ps.part).padEnd(14)}${fileList[0]}${modifiedHint}`);
      for (let i = 1; i < fileList.length; i++) {
        console.log(`${pad}${fileList[i]}`);
      }
    } else if (ps.part.mcp) {
      console.log(`${I}${col}${sym}${colors.reset} ${displayName(ps.part).padEnd(14)}.mcp.json → ${ps.part.mcp.serverName}${modifiedHint}`);
    } else {
      console.log(`${I}${col}${sym}${colors.reset} ${displayName(ps.part)}${modifiedHint}`);
    }
  }

  console.log('');

  // Select parts to uninstall
  const selectedNames = await selectParts(installedStates, 'uninstall');

  if (selectedNames.length === 0) {
    console.log('');
    console.log(`${I}${colors.dim}Nothing to uninstall.${colors.reset}`);
    console.log('');
    return;
  }

  // Warn about modified parts
  const modifiedSelected = selectedNames.filter((name) => {
    const ps = installedStates.find((s) => s.part.name === name);
    return ps && ps.status === 'modified';
  });

  if (modifiedSelected.length > 0) {
    const ok = await confirmModified(modifiedSelected);
    if (!ok) {
      const remaining = selectedNames.filter((n) => !modifiedSelected.includes(n));
      if (remaining.length === 0) {
        console.log('');
        console.log(`${I}${colors.dim}Nothing to uninstall.${colors.reset}`);
        console.log('');
        return;
      }
      return doUninstall(remaining, installedStates, manifest, resolvedDir);
    }
  }

  await doUninstall(selectedNames, installedStates, manifest, resolvedDir);
}

async function doUninstall(
  selectedNames: string[],
  installedStates: PartState[],
  manifest: NonNullable<Awaited<ReturnType<typeof readManifest>>>,
  resolvedDir: string,
): Promise<void> {
  console.log('');
  console.log(`${I}Uninstalling ${selectedNames.length} ${selectedNames.length === 1 ? 'part' : 'parts'}...`);
  console.log('');

  for (const name of selectedNames) {
    const ps = installedStates.find((s) => s.part.name === name)!;
    const part = ps.part;

    await unlinkPart(name, manifest, resolvedDir);

    if (part.hooks) {
      await removeHooks(part.hooks, resolvedDir);
    }

    if (part.mcp) {
      await removeMcp(part.mcp.serverName, resolvedDir);
    }

    delete manifest.parts[name];

    const fileList = part.files.map((f) => f.target);
    const dname = displayName(part);
    if (fileList.length > 0) {
      console.log(`${I}${colors.green}${symbols.check}${colors.reset} ${dname.padEnd(14)}removed ${fileList.join(', ')}`);
    } else if (part.mcp) {
      console.log(`${I}${colors.green}${symbols.check}${colors.reset} ${dname.padEnd(14)}removed from .mcp.json`);
    } else {
      console.log(`${I}${colors.green}${symbols.check}${colors.reset} ${dname.padEnd(14)}removed`);
    }
  }

  // Write or delete manifest
  const remainingCount = Object.keys(manifest.parts).length;
  if (remainingCount === 0) {
    try {
      await unlink(path.join(resolvedDir, MANIFEST_PATH));
    } catch {
      // already gone
    }
  } else {
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(resolvedDir, manifest);
  }

  console.log('');
  const removedStr = `${selectedNames.length} ${selectedNames.length === 1 ? 'part' : 'parts'} removed`;
  if (remainingCount > 0) {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${removedStr}. ${remainingCount} remaining.`);
  } else {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${removedStr}.`);
  }
  console.log('');
}
