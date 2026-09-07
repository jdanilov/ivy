import path from 'node:path';
import { lstat } from 'node:fs/promises';
import type { HookConfig, ManifestPart, Part, SnippetRecord } from '../types.js';
import { readManifest, writeManifest, deleteManifest } from '../core/manifest.js';
import { loadParts, withRequires, FACTORY_ROOT } from '../core/registry.js';
import { existingProjects, home, scopeOf } from '../core/projects.js';
import { copyPart, removePartFiles, injectHooks, removeHooks, injectMcp, removeMcp, injectSettings, removeSettings, writeSnippet, removeSnippet, dropEmptied } from '../core/linker.js';
import { resolvePart, runInit, runUninit } from '../core/recipes.js';
import { I, colors, symbols, displayName, pluralize } from '../ui/theme.js';
import { partNote, partRow } from '../ui/format.js';

const hookKey = (h: HookConfig): string => `${h.event}|${h.matcher}|${h.command}`;
// Where the line sits, not what it displaced: a recorded `replaced` must not read as a move.
const snippetKey = (s?: SnippetRecord): string => (s ? `${s.file}|${s.section}|${s.line}` : '');

/**
 * The one sequence that puts a part in place: vars resolved (a changed ~/.factory/config.yaml
 * re-points the project here), files copied, hooks, mcp and settings injected, snippet written,
 * init run. The init error is returned, not thrown, because the caller still has a manifest to write.
 */
async function applyPart(
  part: Part,
  prev: ManifestPart | undefined,
  targetDir: string,
): Promise<{ next: ManifestPart; restored: string[]; snippetAdded: boolean; failure: unknown }> {
  const resolved = await resolvePart(part, targetDir);
  const { entry: next, restored } = await copyPart(resolved, targetDir, FACTORY_ROOT, prev);
  if (resolved.hooks) await injectHooks(resolved.hooks, targetDir);
  if (resolved.mcp) await injectMcp(resolved.mcp, targetDir);
  if (resolved.settings) await injectSettings(resolved.settings, targetDir);

  let snippetAdded = false;
  if (resolved.snippet) {
    const { record, changed } = await writeSnippet(resolved.snippet, targetDir, prev?.snippet);
    next.snippet = record;
    snippetAdded = changed;
  }

  const failure = await runInit(resolved, prev, next, targetDir).then(() => null, (err: unknown) => err);
  return { next, restored, snippetAdded, failure };
}

/** Non-interactive refresh of an installed project: rewrite what stayed, remove what the registry dropped. */
export async function update(targetDir: string, skip: string[] = []): Promise<void> {
  const resolvedDir = path.resolve(targetDir);
  const manifest = await readManifest(resolvedDir);
  // A skipped part is neither installed nor touched: the project owns whatever sits at its targets.
  // The list sticks in the manifest, so a later bare `update` does not reinstall it.
  const skipped = new Set([...(manifest?.skipped ?? []), ...skip]);

  console.log('');
  console.log(`${I}${colors.dim}Target${colors.reset}   ${resolvedDir}`);
  if (skipped.size > 0) console.log(`${I}${colors.dim}Skipped${colors.reset}  ${[...skipped].join(', ')}`);
  console.log('');

  if (!manifest || Object.keys(manifest.parts).length === 0) {
    console.log(`${I}${colors.dim}No parts installed.${colors.reset}`);
    console.log('');
    return;
  }

  // Out of scope is out of the registry: a part that turned global drops here like a retired one.
  const parts = (await loadParts()).filter((p) => p.scope === scopeOf(resolvedDir));
  const registry = new Map(parts.map((p) => [p.name, p]));
  // Dropped parts must not take files or hooks that a surviving part still owns.
  const liveFiles = new Set(parts.flatMap((p) => p.files.map((f) => f.target)));
  const liveHooks = new Set(parts.flatMap((p) => p.hooks ?? []).map(hookKey));

  let refreshed = 0;
  let removed = 0;
  let installed = 0;
  // A failing init stops the run with everything written so far kept, so a rerun picks up where it broke.
  let failure: unknown = null;

  for (const [name, entry] of Object.entries(manifest.parts)) {
    if (skipped.has(name)) continue;
    const part = registry.get(name);

    if (part) {
      // Where each file comes from is recorded in the manifest, so only its absence needs the disk.
      const gone = await Promise.all(part.files.map((f) => lstat(path.join(resolvedDir, f.target)).then(() => false, () => true)));
      const { next, restored, snippetAdded, failure: initFailed } = await applyPart(part, entry, resolvedDir);
      for (const file of restored) partRow(symbols.installed, colors.green, displayName(part), `restored ${file}`);
      if (snippetAdded) partRow(symbols.installed, colors.green, displayName(part), `${next.snippet!.file} → line added`);

      // A var change rewrites the hook command, so the command we recorded last time has to go.
      const stale = (entry.hooks ?? []).filter((h) => !(next.hooks ?? []).some((n) => hookKey(n) === hookKey(h)));
      if (stale.length > 0) await removeHooks(stale, resolvedDir);

      if (entry.snippet && snippetKey(entry.snippet) !== snippetKey(next.snippet)) {
        if (await removeSnippet(entry.snippet, resolvedDir)) partRow('-', colors.yellow, displayName(part), `${entry.snippet.file} → line removed`);
      }

      manifest.parts[name] = next;

      // A file the part stopped shipping is left behind unless someone else owns it.
      const dropped = entry.files.filter((f) => !next.files.includes(f) && !liveFiles.has(f));
      if (dropped.length > 0) {
        const gone = await removePartFiles({ ...entry, files: dropped }, resolvedDir, FACTORY_ROOT);
        for (const file of gone.removed) {
          partRow('-', colors.yellow, displayName(part), file);
          removed++;
        }
      }

      if (initFailed) failure = initFailed;

      if (JSON.stringify(entry) !== JSON.stringify(next) || gone.includes(true)) {
        partRow(symbols.installed, colors.green, displayName(part), 'refreshed');
        refreshed++;
      }
      if (failure) break;
      continue;
    }

    await runUninit(name, entry.uninit, resolvedDir);

    const orphan: ManifestPart = { ...entry, files: entry.files.filter((f) => !liveFiles.has(f)) };
    const result = await removePartFiles(orphan, resolvedDir, FACTORY_ROOT);

    for (const file of result.removed) {
      partRow('-', colors.yellow, name, file);
      removed++;
    }

    const staleHooks = (entry.hooks ?? []).filter((h) => !liveHooks.has(hookKey(h)));
    if (staleHooks.length > 0 && (await removeHooks(staleHooks, resolvedDir)) > 0) {
      partRow('-', colors.yellow, name, '.claude/settings.local.json → hook removed');
      removed++;
    }

    if (entry.mcp) {
      await removeMcp(entry.mcp.serverName, resolvedDir);
      partRow('-', colors.yellow, name, `.mcp.json → ${entry.mcp.serverName}`);
      removed++;
    }

    if (entry.settings) {
      await removeSettings(entry.settings, resolvedDir);
      partRow('-', colors.yellow, name, '.claude/settings.json → settings removed');
      removed++;
    }

    if (entry.snippet && (await removeSnippet(entry.snippet, resolvedDir))) {
      partRow('-', colors.yellow, name, `${entry.snippet.file} → line removed`);
      removed++;
    }

    // Stop tracking the part either way: what the Factory will not remove it will not manage.
    delete manifest.parts[name];
    if (result.left.length > 0) partNote(name, `left in place: ${result.left.join(', ')}`);
  }

  // What an installed part requires has to be there too, default or not.
  const needed = new Set(withRequires(parts, Object.keys(manifest.parts)).added);

  // A part the Factory ships as a default reaches an already-installed project on the next update.
  for (const part of parts) {
    if (manifest.parts[part.name] || skipped.has(part.name)) continue;
    if (!part.default && !needed.has(part.name)) continue;

    const { next, snippetAdded, failure: initFailed } = await applyPart(part, undefined, resolvedDir);
    if (snippetAdded) partRow(symbols.installed, colors.green, displayName(part), `${next.snippet!.file} → line added`);
    manifest.parts[part.name] = next;

    partRow(symbols.installed, colors.green, displayName(part), 'installed');
    installed++;

    if (initFailed) {
      failure = initFailed;
      break;
    }
  }

  if (removed > 0) {
    for (const file of await dropEmptied(resolvedDir)) {
      partRow('-', colors.yellow, '', `${file} → removed, nothing left in it`);
      removed++;
    }
  }

  if (Object.keys(manifest.parts).length === 0) {
    await deleteManifest(resolvedDir);
  } else {
    manifest.updatedAt = new Date().toISOString();
    manifest.factory = FACTORY_ROOT;
    if (skipped.size > 0) manifest.skipped = [...skipped];
    await writeManifest(resolvedDir, manifest);
  }

  if (failure) throw failure;

  console.log('');
  if (refreshed === 0 && removed === 0 && installed === 0) {
    console.log(`${I}${colors.bold}Up to date.${colors.reset}`);
  } else {
    console.log(`${I}${colors.bold}Done.${colors.reset} ${installed} installed, ${refreshed} refreshed, ${removed} removed.`);
  }
  console.log('');
}

/**
 * Every registered project, then the home dir, in one run: how a Factory change reaches the copies
 * it already made, and the whole migration off an older install. The first failure ends the run,
 * with everything before it kept, so a fix plus a rerun carries on.
 */
export async function updateAll(): Promise<void> {
  const projects = await existingProjects();
  for (const project of projects) await update(project);
  await update(home());

  console.log(`${I}${colors.bold}All done.${colors.reset} ${pluralize(projects.length, 'project')} and the home dir.`);
  // Nothing global has ever been installed here, and `update` only refreshes what a manifest lists.
  if (!(await readManifest(home()))) console.log(`${I}${colors.dim}The home dir holds no parts — factory install --global adds them.${colors.reset}`);
  console.log('');
}
