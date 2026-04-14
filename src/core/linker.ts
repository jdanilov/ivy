import path from 'node:path';
import { mkdir, symlink, unlink, readdir, rmdir, readFile, lstat } from 'node:fs/promises';
import type { Part, HookConfig, McpConfig, Manifest, ManifestPart } from '../types.js';
import { hashFile } from './scanner.js';

export async function linkPart(part: Part, targetDir: string, ivyRoot: string): Promise<ManifestPart> {
  const files: string[] = [];
  const hashes: Record<string, string> = {};

  for (const pf of part.files) {
    const sourcePath = path.join(ivyRoot, pf.source);
    const targetPath = path.join(targetDir, pf.target);

    // Create parent directory
    await mkdir(path.dirname(targetPath), { recursive: true });

    // Remove existing file/symlink if present
    try {
      await lstat(targetPath);
      await unlink(targetPath);
    } catch {
      // doesn't exist, fine
    }

    // Compute relative path from target location to source
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

export async function unlinkPart(partName: string, manifest: Manifest, targetDir: string): Promise<void> {
  const entry = manifest.parts[partName];
  if (!entry) return;

  for (const file of entry.files) {
    const targetPath = path.join(targetDir, file);
    try {
      await unlink(targetPath);
    } catch {
      // already gone
    }

    // Try to clean up empty parent directories up to .claude/
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
}

export async function injectHooks(hooks: HookConfig[], targetDir: string): Promise<void> {
  const settingsPath = path.join(targetDir, '.claude', 'settings.local.json');
  let settings: Record<string, any> = {};

  try {
    const content = await readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  } catch {
    // file doesn't exist or invalid JSON
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const hook of hooks) {
    const eventKey = hook.event;
    if (!Array.isArray(settings.hooks[eventKey])) {
      settings.hooks[eventKey] = [];
    }

    const hookEntry = {
      matcher: hook.matcher,
      hooks: [{ type: 'command', command: hook.command }],
    };

    // Avoid duplicates: check if this command is already present
    const existing = settings.hooks[eventKey] as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
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
  let settings: Record<string, any> = {};

  try {
    const content = await readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  } catch {
    return; // no settings file, nothing to remove
  }

  if (!settings.hooks) return;

  for (const hook of hooks) {
    const eventKey = hook.event;
    if (!Array.isArray(settings.hooks[eventKey])) continue;

    settings.hooks[eventKey] = (settings.hooks[eventKey] as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>)
      .filter((h) => !(h.matcher === hook.matcher && h.hooks?.some((hh) => hh.command === hook.command)));

    // Remove empty arrays
    if (settings.hooks[eventKey].length === 0) {
      delete settings.hooks[eventKey];
    }
  }

  // Remove empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export async function injectMcp(mcp: McpConfig, targetDir: string): Promise<void> {
  const mcpPath = path.join(targetDir, '.mcp.json');
  let mcpConfig: Record<string, any> = { mcpServers: {} };

  try {
    const content = await readFile(mcpPath, 'utf-8');
    mcpConfig = JSON.parse(content);
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }
  } catch {
    // file doesn't exist or invalid JSON
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
    return; // no mcp file, nothing to remove
  }

  if (mcpConfig.mcpServers) {
    delete mcpConfig.mcpServers[serverName];
  }

  await Bun.write(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
}
