import path from 'node:path';
import { mkdir, unlink, readdir, rmdir, readFile, lstat } from 'node:fs/promises';
import type { Part, HookConfig, McpConfig, ManifestPart, Settings, Snippet, SnippetRecord } from '../types.js';
import { hashFile } from './scanner.js';
import { scopeOf } from './projects.js';

/** Hooks are the project's local business; at user level there is only `~/.claude/settings.json`. */
export const hooksFileName = (targetDir: string): string =>
  path.join('.claude', scopeOf(targetDir) === 'global' ? 'settings.json' : 'settings.local.json');

const hooksFile = (targetDir: string): string => path.join(targetDir, hooksFileName(targetDir));

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

/**
 * Ours to overwrite or to remove: a file still holding the bytes the manifest recorded or the ones
 * the source holds now. A link into the Factory from an older install reads as the source, so it
 * counts too, and a dangling one reads as nothing at a path the manifest names. Anything else the
 * project wrote itself. Only asked about a target that exists.
 */
async function ours(targetPath: string, manifestHash?: string, sourcePath?: string): Promise<boolean> {
  const hash = await hashFile(targetPath);
  // Nothing to read is ours only from a dangling link: a directory or an unreadable file is theirs.
  if (hash === '') return (await lstat(targetPath).catch(() => null))?.isSymbolicLink() ?? false;
  if (hash === manifestHash) return true;
  return sourcePath !== undefined && hash === (await hashFile(sourcePath));
}

/**
 * Puts the part's files in place as copies, so the project stands on its own and the manifest is
 * the only link back to the Factory. Names the files that held something neither the manifest nor
 * the source knows, for the caller to report as restored.
 */
export async function copyPart(
  part: Part,
  targetDir: string,
  factoryRoot: string,
  prev?: ManifestPart,
): Promise<{ entry: ManifestPart; restored: string[] }> {
  const files: string[] = [];
  const hashes: Record<string, string> = {};
  const sources: Record<string, string> = {};
  const restored: string[] = [];

  for (const pf of part.files) {
    const sourcePath = path.join(factoryRoot, pf.source);
    const targetPath = path.join(targetDir, pf.target);
    sources[pf.target] = pf.source;

    // A template is a copy, seeded once: the project edits it, and whatever is already there stays.
    if (pf.skipIfExists) {
      if (!(await lstat(targetPath).catch(() => null))) {
        await mkdir(path.dirname(targetPath), { recursive: true });
        await Bun.write(targetPath, Bun.file(sourcePath));
      }
      files.push(pf.target);
      hashes[pf.target] = await hashFile(targetPath);
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });

    const at = await lstat(targetPath).catch(() => null);
    if (at) {
      if (!(await ours(targetPath, prev?.hashes[pf.target], sourcePath))) restored.push(pf.target);
      // A legacy install left a link into the Factory here, and writing through it edits the source.
      // Only a link is unlinked: anything else Bun.write replaces, or names in its own error.
      if (at.isSymbolicLink()) await unlink(targetPath);
    }

    await Bun.write(targetPath, Bun.file(sourcePath));

    files.push(pf.target);
    hashes[pf.target] = await hashFile(sourcePath);
  }

  const entry: ManifestPart = { files, hashes, sources };

  if (part.hooks) {
    entry.hooks = part.hooks;
  }

  if (part.mcp) {
    entry.mcp = { serverName: part.mcp.serverName, config: part.mcp.config };
  }

  if (part.settings) {
    entry.settings = part.settings;
  }

  // Kept resolved in the manifest so the part can still be uninstalled after the registry drops it.
  if (part.recipes?.uninit) {
    entry.uninit = part.recipes.uninit;
  }

  return { entry, restored };
}

// ── Snippets ─────────────────────────────────────────────────────────────────

const AGENT_FILES = ['AGENTS.md', 'CLAUDE.md'];

/** AGENTS.md when it exists, else CLAUDE.md when it exists, else AGENTS.md is the one we create. */
async function agentFile(targetDir: string): Promise<string> {
  for (const name of AGENT_FILES) {
    if (await lstat(path.join(targetDir, name)).catch(() => null)) return name;
  }
  return AGENT_FILES[0]!;
}

const readLines = async (filePath: string): Promise<string[]> => {
  const raw = await readFile(filePath, 'utf-8').catch(() => '');
  return raw === '' ? [] : raw.replace(/\n$/, '').split('\n');
};

const writeLines = (filePath: string, lines: string[]): Promise<number> =>
  Bun.write(filePath, lines.length === 0 ? '' : lines.join('\n') + '\n');

/** Where the section ends: the next heading of the same or higher level, or EOF. */
function sectionEnd(lines: string[], at: number): number {
  const level = /^#+/.exec(lines[at]!)![0].length;
  for (let i = at + 1; i < lines.length; i++) {
    const heading = /^(#+)\s/.exec(lines[i]!);
    if (heading && heading[1]!.length <= level) return i;
  }
  return lines.length;
}

/**
 * The path a snippet line points at, whether it includes the file with `@` or only names it in
 * backticks: what a line about the same file must contain to count as the same line.
 */
const snippetPath = (line: string): string | undefined => {
  const hit = /@(\S+)|`([^`]+)`/.exec(line);
  return hit?.[1] ?? hit?.[2];
};

/**
 * Adds the part's line under its section, creating the section at the end of the file when it is
 * missing. A line the project already wrote about the same path is rewritten in place instead, and
 * kept in the record so uninstall can put it back. Idempotent. Returns what to record.
 */
export async function writeSnippet(
  snippet: Snippet,
  targetDir: string,
  prev?: SnippetRecord,
): Promise<{ record: SnippetRecord; changed: boolean }> {
  const file = snippet.file ?? (await agentFile(targetDir));
  const record: SnippetRecord = { file, section: snippet.section, line: snippet.line };
  if (prev?.replaced !== undefined) record.replaced = prev.replaced;
  const filePath = path.join(targetDir, file);
  // Whoever brings the file into existence records it, so an uninstall knows the file is ours.
  if (prev?.created || !(await lstat(filePath).catch(() => null))) record.created = true;
  const lines = await readLines(filePath);

  let at = lines.findIndex((l) => l.trimEnd() === snippet.section);
  if (at === -1) {
    if (lines.length > 0) lines.push('');
    at = lines.push(snippet.section) - 1;
  }

  const end = sectionEnd(lines, at);
  const body = lines.slice(at + 1, end);
  if (body.some((l) => l === snippet.line)) return { record, changed: false };

  const target = snippetPath(snippet.line);
  const hit = target === undefined ? -1 : body.findIndex((l) => l.includes(target));
  if (hit !== -1) {
    // Our own line from a past install is not the project's: only a line we never wrote is restorable.
    if (record.replaced === undefined && body[hit] !== prev?.line) record.replaced = body[hit]!;
    lines[at + 1 + hit] = snippet.line;
  } else {
    let insert = end;
    while (insert > at + 1 && lines[insert - 1]!.trim() === '') insert--;
    lines.splice(insert, 0, snippet.line);
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeLines(filePath, lines);
  return { record, changed: true };
}

/**
 * Takes the recorded line back out of the recorded file, or puts the displaced line back where it
 * was. A section left with nothing but blank lines goes too, together with the blank the install
 * put in front of it. Nothing else is touched.
 */
export async function removeSnippet(record: SnippetRecord, targetDir: string): Promise<boolean> {
  const filePath = path.join(targetDir, record.file);
  const lines = await readLines(filePath);

  const at = lines.findIndex((l) => l.trimEnd() === record.section);
  if (at === -1) return false;

  const end = sectionEnd(lines, at);
  const hit = lines.slice(at + 1, end).indexOf(record.line);
  if (hit === -1) return false;

  if (record.replaced !== undefined) {
    lines[at + 1 + hit] = record.replaced;
    await writeLines(filePath, lines);
    return true;
  }

  const body = lines.slice(at + 1, end).filter((l) => l !== record.line);

  // An emptied section that ran to EOF was appended by an install: its leading blank goes with it.
  const empty = body.every((l) => l.trim() === '');
  const from = empty && end === lines.length && at > 0 && lines[at - 1] === '' ? at - 1 : at;
  lines.splice(from, end - from, ...(empty ? [] : [lines[at]!, ...body]));

  await writeLines(filePath, lines);
  return true;
}

/** Removes the part's files. A copy the project has since edited is reported as left behind. */
export async function removePartFiles(
  entry: ManifestPart,
  targetDir: string,
  factoryRoot: string,
): Promise<{ removed: string[]; left: string[] }> {
  const removed: string[] = [];
  const left: string[] = [];

  for (const file of entry.files) {
    const targetPath = path.join(targetDir, file);
    const source = entry.sources?.[file];

    if (!(await lstat(targetPath).catch(() => null))) continue;
    if (!(await ours(targetPath, entry.hashes[file], source && path.join(factoryRoot, source)))) {
      left.push(file);
      continue;
    }

    await unlink(targetPath);
    removed.push(file);

    // Empty parents are tidied up inside .claude only; a target elsewhere leaves its folders alone.
    let dir = path.dirname(targetPath);
    const claudeDir = path.join(targetDir, '.claude');
    while (dir !== claudeDir && dir.startsWith(claudeDir + path.sep)) {
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
  const settingsPath = hooksFile(targetDir);
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

/** Returns how many hook entries were actually removed, so a caller reports only real changes. */
export async function removeHooks(hooks: HookConfig[], targetDir: string): Promise<number> {
  const settingsPath = hooksFile(targetDir);
  let settings: Record<string, any>;

  try {
    const content = await readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content);
  } catch {
    return 0;
  }

  if (!settings.hooks) return 0;

  let removed = 0;

  for (const hook of hooks) {
    const eventKey = hook.event;
    if (!Array.isArray(settings.hooks[eventKey])) continue;

    const before = settings.hooks[eventKey].length;
    settings.hooks[eventKey] = (settings.hooks[eventKey] as HookEntry[])
      .filter((h) => !(h.matcher === hook.matcher && h.hooks?.some((hh) => hh.command === hook.command)));
    removed += before - settings.hooks[eventKey].length;

    if (settings.hooks[eventKey].length === 0) {
      delete settings.hooks[eventKey];
    }
  }

  if (removed === 0) return 0;

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return removed;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const key = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

/** Merges a part's settings into the project's, deduping list entries by string. */
function mergeSettings(into: Record<string, unknown>, from: Settings): void {
  for (const [k, value] of Object.entries(from)) {
    const current = into[k];
    if (Array.isArray(value)) {
      const list = Array.isArray(current) ? current : [];
      const seen = new Set(list.map(key));
      into[k] = [...list, ...value.filter((v) => !seen.has(key(v)))];
    } else if (isObject(value)) {
      const nested = isObject(current) ? current : {};
      mergeSettings(nested, value);
      into[k] = nested;
    } else {
      into[k] = value;
    }
  }
}

/** Takes the part's entries back out, dropping any key it emptied. */
function pruneSettings(from: Record<string, unknown>, part: Settings): void {
  for (const [k, value] of Object.entries(part)) {
    const current = from[k];
    if (Array.isArray(value) && Array.isArray(current)) {
      const drop = new Set(value.map(key));
      from[k] = current.filter((v) => !drop.has(key(v)));
      if ((from[k] as unknown[]).length === 0) delete from[k];
    } else if (isObject(value) && isObject(current)) {
      pruneSettings(current, value);
      if (Object.keys(current).length === 0) delete from[k];
    } else if (key(current) === key(value)) {
      delete from[k];
    }
  }
}

export async function injectSettings(settings: Settings, targetDir: string): Promise<void> {
  const settingsPath = path.join(targetDir, '.claude', 'settings.json');
  const current = await readJson<Record<string, unknown>>(settingsPath, {});

  mergeSettings(current, settings);

  await mkdir(path.dirname(settingsPath), { recursive: true });
  await Bun.write(settingsPath, JSON.stringify(current, null, 2) + '\n');
}

export async function removeSettings(settings: Settings, targetDir: string): Promise<void> {
  const settingsPath = path.join(targetDir, '.claude', 'settings.json');
  const current = await readJson<Record<string, unknown> | null>(settingsPath, null);
  if (!current) return;

  pruneSettings(current, settings);

  await Bun.write(settingsPath, JSON.stringify(current, null, 2) + '\n');
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

const EMPTIABLE = ['.claude/settings.json', '.claude/settings.local.json', '.mcp.json'];

/**
 * Deletes a settings or mcp file the Factory just emptied — `{}` or a bare `{"mcpServers": {}}`.
 * A file still holding anything of the project's own stays. Returns what went, for the report.
 */
export async function dropEmptied(targetDir: string): Promise<string[]> {
  const gone: string[] = [];

  for (const rel of EMPTIABLE) {
    const filePath = path.join(targetDir, rel);
    const json = await readJson<Record<string, unknown> | null>(filePath, null);
    if (!isObject(json)) continue;

    const keys = Object.keys(json);
    const servers = json.mcpServers;
    const empty = keys.length === 0
      || (keys.length === 1 && isObject(servers) && Object.keys(servers).length === 0);
    if (!empty) continue;

    await unlink(filePath).catch(() => {});
    gone.push(rel);
  }

  return gone;
}

/**
 * The counterpart of the install's file creation: an agent file the Factory made and the snippet
 * removals just emptied, and a `.claude/` with nothing left in it. Anything holding content stays.
 */
export async function dropCreated(files: string[], targetDir: string): Promise<string[]> {
  const gone: string[] = [];

  for (const rel of new Set(files)) {
    const filePath = path.join(targetDir, rel);
    const raw = await readFile(filePath, 'utf-8').catch(() => null);
    if (raw === null || raw.trim() !== '') continue;
    await unlink(filePath).catch(() => {});
    gone.push(rel);
  }

  // rmdir refuses a directory with anything in it, so these only fire once the last part is gone.
  for (const dir of ['.claude', 'docs']) {
    if (await rmdir(path.join(targetDir, dir)).then(() => true, () => false)) gone.push(`${dir}/`);
  }

  return gone;
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
