import path from 'node:path';
import { readlink } from 'node:fs/promises';
import type { HookConfig, ManifestPart } from '../types.js';
import { readManifest, writeManifest, deleteManifest } from '../core/manifest.js';
import { loadParts, FACTORY_ROOT } from '../core/registry.js';
import { linkPart, unlinkPart, injectHooks, removeHooks, injectMcp, removeMcp, injectSettings, removeSettings } from '../core/linker.js';
import { I, nameCol, colors, symbols, displayName } from '../ui/theme.js';

const hookKey = (h: HookConfig): string => `${h.event}|${h.matcher}|${h.command}`;

/** Non-interactive refresh of an installed project: relink what stayed, unlink what the registry dropped. */
export async function update(targetDir: string): Promise<void> {
  const resolvedDir = path.resolve(targetDir);
  const manifest = await readManifest(resolvedDir);

  console.log('');
  console.log(`${I}${colors.dim}Target${colors.reset}   ${resolvedDir}`);
  console.log('');

  if (!manifest || Object.keys(manifest.parts).length === 0) {
    console.log(`${I}${colors.dim}No parts installed.${colors.reset}`);
    console.log('');
    return;
  }

  const parts = await loadParts();
  const registry = new Map(parts.map((p) => [p.name, p]));
  // Dropped parts must not take files or hooks that a surviving part still owns.
  const liveFiles = new Set(parts.flatMap((p) => p.files.map((f) => f.target)));
  const liveHooks = new Set(parts.flatMap((p) => p.hooks ?? []).map(hookKey));

  const line = (sym: string, color: string, name: string, text: string): void => {
    console.log(`${I}${color}${sym}${colors.reset} ${name.padEnd(nameCol())}${text}`);
  };

  let relinked = 0;
  let removed = 0;
  let installed = 0;

  for (const [name, entry] of Object.entries(manifest.parts)) {
    const part = registry.get(name);

    if (part) {
      const links = () => Promise.all(part.files.map((f) => readlink(path.join(resolvedDir, f.target)).catch(() => '')));
      const before = await links();
      const next = await linkPart(part, resolvedDir, FACTORY_ROOT);
      if (part.hooks) await injectHooks(part.hooks, resolvedDir);
      if (part.mcp) await injectMcp(part.mcp, resolvedDir);
      if (part.settings) await injectSettings(part.settings, resolvedDir);
      manifest.parts[name] = next;

      // A file the part stopped shipping leaves a dangling symlink behind unless someone else owns it.
      const dropped = entry.files.filter((f) => !next.files.includes(f) && !liveFiles.has(f));
      if (dropped.length > 0) {
        const gone = await unlinkPart({ ...entry, files: dropped }, resolvedDir, FACTORY_ROOT);
        for (const file of gone.removed) {
          line('-', colors.yellow, displayName(part), file);
          removed++;
        }
      }

      if (JSON.stringify(entry) !== JSON.stringify(next) || String(before) !== String(await links())) {
        line(symbols.installed, colors.green, displayName(part), 'relinked');
        relinked++;
      }
      continue;
    }

    const orphan: ManifestPart = { ...entry, files: entry.files.filter((f) => !liveFiles.has(f)) };
    const result = await unlinkPart(orphan, resolvedDir, FACTORY_ROOT);

    for (const file of result.removed) {
      line('-', colors.yellow, name, file);
      removed++;
    }

    const staleHooks = (entry.hooks ?? []).filter((h) => !liveHooks.has(hookKey(h)));
    if (staleHooks.length > 0) {
      await removeHooks(staleHooks, resolvedDir);
      line('-', colors.yellow, name, '.claude/settings.local.json → hook removed');
      removed++;
    }

    if (entry.mcp) {
      await removeMcp(entry.mcp.serverName, resolvedDir);
      line('-', colors.yellow, name, `.mcp.json → ${entry.mcp.serverName}`);
      removed++;
    }

    if (entry.settings) {
      await removeSettings(entry.settings, resolvedDir);
      line('-', colors.yellow, name, '.claude/settings.json → settings removed');
      removed++;
    }

    // Stop tracking the part either way: what the Factory will not remove it will not manage.
    delete manifest.parts[name];
    if (result.left.length > 0) line('!', colors.dim, name, `left in place: ${result.left.join(', ')}`);
  }

  // A part the Factory ships as a default reaches an already-installed project on the next update.
  for (const part of parts) {
    if (!part.default || manifest.parts[part.name]) continue;

    manifest.parts[part.name] = await linkPart(part, resolvedDir, FACTORY_ROOT);
    if (part.hooks) await injectHooks(part.hooks, resolvedDir);
    if (part.mcp) await injectMcp(part.mcp, resolvedDir);
    if (part.settings) await injectSettings(part.settings, resolvedDir);

    line(symbols.installed, colors.green, displayName(part), 'installed');
    installed++;
  }

  if (Object.keys(manifest.parts).length === 0) {
    await deleteManifest(resolvedDir);
  } else {
    manifest.updatedAt = new Date().toISOString();
    manifest.factory = FACTORY_ROOT;
    await writeManifest(resolvedDir, manifest);
  }

  console.log('');
  if (relinked === 0 && removed === 0 && installed === 0) {
    console.log(`${I}${colors.bold}Up to date.${colors.reset}`);
  } else {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${installed} installed, ${relinked} relinked, ${removed} removed.`);
  }
  console.log('');
}
