import path from 'node:path';
import { readManifest } from '../core/manifest.js';
import { scanProject } from '../core/scanner.js';
import { removeParts } from '../core/parts.js';
import { Refusal } from '../core/mission.js';
import { dependants } from '../core/registry.js';
import { selectParts, confirmModified } from '../ui/prompts.js';
import { I, nameCol, colors, statusColor, statusSymbol, displayName, pluralize } from '../ui/theme.js';
import { partNote, printPartResult, printSnippetInfo } from '../ui/format.js';

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

  // Taking a part out from under something that needs it leaves the dependant broken.
  for (const name of selectedNames) {
    const left = dependants(installedStates.map((s) => s.part), name, selectedNames);
    if (left.length > 0) throw new Refusal(`${name} is required by ${left.join(', ')} — uninstall those too, or keep it`);
  }

  // Perform uninstall
  console.log('');
  console.log(`${I}Uninstalling ${pluralize(selectedNames.length, 'part')}...`);
  console.log('');

  const removal = await removeParts(resolvedDir, selectedNames);

  // A part whose every file the project had edited is not removed: no tick, and it counts nowhere.
  const kept = removal.parts.filter((p) => p.removed.length === 0 && p.left.length > 0);

  for (const { name, snippet, removed, left } of removal.parts) {
    const part = installedStates.find((s) => s.part.name === name)!.part;
    // A copy the project edited is its own now: it stays, named once, under the file column.
    if (kept.some((p) => p.name === name)) {
      partNote(displayName(part), `left in place: ${left.join(', ')}`);
    } else {
      printPartResult(part, { verb: 'removed', files: removed });
      if (left.length > 0) console.log(`${pad}${colors.dim}left in place: ${left.join(', ')}${colors.reset}`);
    }
    if (snippet) printSnippetInfo(snippet, 'removed');
  }
  for (const file of removal.emptied) {
    console.log(`${I}${colors.dim}removed ${file}, nothing left in it${colors.reset}`);
  }

  console.log('');
  const removedStr = `${pluralize(removal.parts.length - kept.length, 'part')} removed`;
  if (removal.remaining > 0) {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${removedStr}. ${removal.remaining} remaining.`);
  } else {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${removedStr}.`);
  }
  console.log('');
}
