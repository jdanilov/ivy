import { readManifest, writeManifest, deleteManifest } from './manifest.js';
import { removePartFiles, removeHooks, removeMcp, removeSettings, removeSnippet, dropEmptied, dropCreated } from './linker.js';
import { runUninit } from './recipes.js';
import { FACTORY_ROOT } from './registry.js';

/**
 * Taking parts back out, driven by the manifest: what the install actually wrote, vars resolved.
 * `uninstall` asks the human which ones, Mission Control reads them off a toggle; both land here,
 * so a part removed from the screen leaves exactly as much behind as one removed from the CLI.
 */

export interface Removed {
  name: string;
  /** The agent file whose snippet line went with it, when there was one. */
  snippet: string | null;
  /** Files actually deleted, so the report names what it did and not what it meant to. */
  removed: string[];
  /** Files the project edited after the install: left where they are, and named. */
  left: string[];
}

export interface Removal {
  parts: Removed[];
  /** Files deleted because nothing was left in them. */
  emptied: string[];
  remaining: number;
}

export async function removeParts(dir: string, names: string[]): Promise<Removal> {
  const manifest = await readManifest(dir);
  if (!manifest) return { parts: [], emptied: [], remaining: 0 };

  const parts: Removed[] = [];
  // Agent files the install created: candidates for deletion once every snippet is out of them.
  const created: string[] = [];

  for (const name of names) {
    const entry = manifest.parts[name];
    let removed: string[] = [];
    let left: string[] = [];
    if (entry) {
      await runUninit(name, entry.uninit, dir);
      ({ removed, left } = await removePartFiles(entry, dir, FACTORY_ROOT));
      if (entry.hooks) await removeHooks(entry.hooks, dir);
      if (entry.mcp) await removeMcp(entry.mcp.serverName, dir);
      if (entry.settings) await removeSettings(entry.settings, dir);
    }
    delete manifest.parts[name];

    if (entry?.snippet?.created) created.push(entry.snippet.file);
    const snippet = entry?.snippet && (await removeSnippet(entry.snippet, dir)) ? entry.snippet.file : null;
    parts.push({ name, snippet, removed, left });
  }

  const emptied = await dropEmptied(dir);

  const remaining = Object.keys(manifest.parts).length;
  if (remaining === 0) {
    await deleteManifest(dir);
  } else {
    manifest.updatedAt = new Date().toISOString();
    await writeManifest(dir, manifest);
  }

  // Last, so the manifest is already gone and an untouched `.claude/` reads as empty.
  emptied.push(...(await dropCreated(created, dir)));
  return { parts, emptied, remaining };
}
