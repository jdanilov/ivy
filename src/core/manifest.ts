import path from 'node:path';
import { unlink } from 'node:fs/promises';
import type { Manifest } from '../types.js';

export const MANIFEST_PATH = '.claude/.factory-manifest.json';
const LEGACY_MANIFEST_PATH = '.claude/.ivy-manifest.json';

export async function readManifest(targetDir: string): Promise<Manifest | null> {
  for (const rel of [MANIFEST_PATH, LEGACY_MANIFEST_PATH]) {
    const file = Bun.file(path.join(targetDir, rel));
    if (!(await file.exists())) continue;
    try {
      const manifest = (await file.json()) as Manifest & { ivy?: string };
      if (!manifest.factory && manifest.ivy) manifest.factory = manifest.ivy;
      delete manifest.ivy;
      // Rename here, not on the next write: a legacy manifest with no parts never reaches one.
      if (rel === LEGACY_MANIFEST_PATH) await writeManifest(targetDir, manifest);
      return manifest;
    } catch {
      return null;
    }
  }
  return null;
}

/** Writes the current manifest and drops the legacy one, so an ivy install renames on first read or write. */
export async function writeManifest(targetDir: string, manifest: Manifest): Promise<void> {
  await Bun.write(path.join(targetDir, MANIFEST_PATH), JSON.stringify(manifest, null, 2) + '\n');
  await drop(targetDir, LEGACY_MANIFEST_PATH);
}

export async function deleteManifest(targetDir: string): Promise<void> {
  await drop(targetDir, MANIFEST_PATH);
  await drop(targetDir, LEGACY_MANIFEST_PATH);
}

async function drop(targetDir: string, rel: string): Promise<void> {
  try {
    await unlink(path.join(targetDir, rel));
  } catch {
    // already gone
  }
}
