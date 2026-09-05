import path from 'node:path';
import { mkdir, symlink, unlink, readdir, readlink, rmdir, readFile, lstat } from 'node:fs/promises';
import type { Part, HookConfig, McpConfig, ManifestPart } from '../types.js';
import { hashFile } from './scanner.js';

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

export async function linkPart(part: Part, targetDir: string, factoryRoot: string): Promise<ManifestPart> {
  const files: string[] = [];
  const hashes: Record<string, string> = {};

  for (const pf of part.files) {
    const sourcePath = path.join(factoryRoot, pf.source);
    const targetPath = path.join(targetDir, pf.target);

    await mkdir(path.dirname(targetPath), { recursive: true });

    try {
      await lstat(targetPath);
      await unlink(targetPath);
    } catch {
      // doesn't exist
    }

    const relPath = path.relative(path.dirname(targetPath), sourcePath);
    await symlink(relPath, targetPath);

    files.push(pf.target);
    hashes[pf.target] = await hashFile(sourcePath);
  }

  const entry: ManifestPart = { files, hashes };

  if (part.hooks) {
    entry.hooks = part.hooks;
  }

  if (part.mcp) {
    entry.mcp = { serverName: part.mcp.serverName, config: part.mcp.config };
  }

  return entry;
}

/** A target we may remove: a symlink into the Factory whose source still exists. */
async function isFactoryLink(targetPath: string, factoryRoot: string): Promise<boolean> {
  try {
    if (!(await lstat(targetPath)).isSymbolicLink()) return false;
    const dest = path.resolve(path.dirname(targetPath), await readlink(targetPath));
    return dest.startsWith(factoryRoot + path.sep) && (await Bun.file(dest).exists());
  } catch {
    return false;
  }
}

/** Removes the part's symlinks. Anything the Factory cannot claim is reported as left behind. */
export async function unlinkPart(
  entry: ManifestPart,
  targetDir: string,
  factoryRoot: string,
): Promise<{ removed: string[]; left: string[] }> {
  const removed: string[] = [];
  const left: string[] = [];

  for (const file of entry.files) {
    const targetPath = path.join(targetDir, file);

    if (!(await isFactoryLink(targetPath, factoryRoot))) {
      if (await lstat(targetPath).catch(() => null)) left.push(file);
      continue;
    }

    await unlink(targetPath);
    removed.push(file);

    let dir = path.dirname(targetPath);
    const claudeDir = path.join(targetDir, '.claude');
    while (dir !== claudeDir && dir.startsWith(claudeDir)) {
      try {
        const entries = await readdir(dir);
        if (entries.length === 0) {
          await rmdir(dir);
          dir = path.dirname(dir);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }

  return { removed, left };
}

type HookEntry = { matcher?: string; hooks: Array<{ type: string; command: string }> };

export async function injectHooks(hooks: HookConfig[], targetDir: string): Promise<void> {
  const settingsPath = path.join(targetDir, '.claude', 'settings.local.json');
  const settings = await readJson<Record<string, any>>(settingsPath, {});

  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const hook of hooks) {
    const eventKey = hook.event;
    if (!Array.isArray(settings.hooks[eventKey])) {
      settings.hooks[eventKey] = [];
    }

    // UserPromptSubmit and Stop take no matcher, so the key is left out entirely.
    const hookEntry: HookEntry = {
      ...(hook.matcher === undefined ? {} : { matcher: hook.matcher }),
      hooks: [{ type: 'command', command: hook.command }],
    };

    const existing = settings.hooks[eventKey] as HookEntry[];
    const alreadyExists = existing.some(
      (h) => h.matcher === hook.matcher && h.hooks?.some((hh) => hh.command === hook.command),
    );

    if (!alreadyExists) {
      existing.push(hookEntry);
    }
  }

  await mkdir(path.dirname(settingsPath), { recursive: true });
  await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export async function removeHooks(hooks: HookConfig[], targetDir: string): Promise<void> {
  const settingsPath = path.join(targetDir, '.claude', 'settings.local.json');
  let settings: Record<string, any>;

  try {
    const content = await readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  } catch {
    return;
  }

  if (!settings.hooks) return;

  for (const hook of hooks) {
    const eventKey = hook.event;
    if (!Array.isArray(settings.hooks[eventKey])) continue;

    settings.hooks[eventKey] = (settings.hooks[eventKey] as HookEntry[])
      .filter((h) => !(h.matcher === hook.matcher && h.hooks?.some((hh) => hh.command === hook.command)));

    if (settings.hooks[eventKey].length === 0) {
      delete settings.hooks[eventKey];
    }
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export async function injectMcp(mcp: McpConfig, targetDir: string): Promise<void> {
  const mcpPath = path.join(targetDir, '.mcp.json');
  const mcpConfig = await readJson<Record<string, any>>(mcpPath, { mcpServers: {} });

  if (!mcpConfig.mcpServers) {
    mcpConfig.mcpServers = {};
  }

  mcpConfig.mcpServers[mcp.serverName] = mcp.config;

  await Bun.write(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
}

export async function removeMcp(serverName: string, targetDir: string): Promise<void> {
  const mcpPath = path.join(targetDir, '.mcp.json');
  let mcpConfig: Record<string, any>;

  try {
    const content = await readFile(mcpPath, 'utf-8');
    mcpConfig = JSON.parse(content);
  } catch {
    return;
  }

  if (mcpConfig.mcpServers) {
    delete mcpConfig.mcpServers[serverName];
  }

  await Bun.write(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
}
