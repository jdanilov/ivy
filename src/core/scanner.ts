import path from 'node:path';
import { lstat } from 'node:fs/promises';
import type { PartState, PartStatus } from '../types.js';
import { loadParts, FACTORY_ROOT } from './registry.js';
import { readManifest } from './manifest.js';

export async function hashFile(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return '';
  }
  const bytes = await file.arrayBuffer();
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(new Uint8Array(bytes));
  return 'sha256:' + hasher.digest('hex');
}

export async function scanProject(targetDir: string): Promise<PartState[]> {
  const manifest = await readManifest(targetDir);
  const parts = await loadParts();
  const skipped = new Set(manifest?.skipped ?? []);
  const states: PartState[] = [];

  for (const part of parts) {
    // A skipped part is the project's own business: whatever sits at its targets is not our conflict.
    if (skipped.has(part.name)) {
      states.push({ part, status: 'skipped', files: {} });
      continue;
    }

    const fileStates: PartState['files'] = {};
    let allExist = true;
    let anyExists = false;
    let allHashMatch = true;
    let allSymlinks = true;
    let inManifest = manifest?.parts[part.name] != null;

    for (const pf of part.files) {
      const targetPath = path.join(targetDir, pf.target);
      const sourcePath = path.join(FACTORY_ROOT, pf.source);

      let exists = false;
      let isSymlink = false;
      let hashMatch = false;

      try {
        const stat = await lstat(targetPath);
        exists = true;
        isSymlink = stat.isSymbolicLink();

        if (exists) {
          const targetHash = await hashFile(targetPath);
          const sourceHash = await hashFile(sourcePath);
          hashMatch = targetHash !== '' && sourceHash !== '' && targetHash === sourceHash;
        }
      } catch {
        // file doesn't exist
      }

      fileStates[pf.target] = { exists, isSymlink, hashMatch };

      // A seeded template belongs to the project once it is there: present is installed, whatever it holds.
      if (pf.skipIfExists) {
        if (exists) anyExists = true;
        else allExist = false;
        continue;
      }

      if (exists) anyExists = true;
      else allExist = false;

      if (!hashMatch) allHashMatch = false;
      if (!isSymlink) allSymlinks = false;
    }

    // MCP parts with no files: check manifest only
    if (part.files.length === 0) {
      let status: PartStatus = inManifest ? 'installed' : 'not-installed';
      states.push({ part, status, files: fileStates });
      continue;
    }

    let status: PartStatus;
    if (!anyExists) {
      status = 'not-installed';
    } else if (allExist && allHashMatch) {
      status = 'installed';
    } else if (anyExists && !inManifest && !allSymlinks) {
      status = 'conflict';
    } else {
      status = 'modified';
    }

    states.push({ part, status, files: fileStates });
  }

  return states;
}
