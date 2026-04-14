import path from 'node:path';
import type { Manifest } from '../types.js';

export const MANIFEST_PATH = '.claude/.ivy-manifest.json';

export async function readManifest(targetDir: string): Promise<Manifest | null> {
  const fullPath = path.join(targetDir, MANIFEST_PATH);
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return null;
  }
  try {
    return (await file.json()) as Manifest;
  } catch {
    return null;
  }
}

export async function writeManifest(targetDir: string, manifest: Manifest): Promise<void> {
  const fullPath = path.join(targetDir, MANIFEST_PATH);
  await Bun.write(fullPath, JSON.stringify(manifest, null, 2) + '\n');
}
