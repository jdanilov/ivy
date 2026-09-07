import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import type { EnvVar, HookConfig, HookEvent, McpConfig, Part, PartFile, PartType, Recipes, Scope, Snippet } from '../types.js';
import { HOOK_EVENTS } from '../types.js';

// Resolve FACTORY_ROOT from this file's location: src/core/ -> project root
export const FACTORY_ROOT = path.resolve(import.meta.dir, '..', '..');

const TYPES: PartType[] = ['skill', 'tool', 'fixture', 'mcp'];

let cache: Part[] | null = null;

/** Load every parts/<name>/part.yaml. Folders without a part.yaml are not parts. */
export async function loadParts(): Promise<Part[]> {
  if (cache) return cache;

  const dir = path.join(FACTORY_ROOT, 'parts');
  const entries = await readdir(dir, { withFileTypes: true });
  const parts: Part[] = [];

  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = Bun.file(path.join(dir, entry.name, 'part.yaml'));
    if (!(await file.exists())) continue;
    parts.push(await parsePart(entry.name, Bun.YAML.parse(await file.text())));
  }

  for (const part of parts) {
    for (const req of part.requires ?? []) {
      if (!parts.some((p) => p.name === req)) throw new Error(`parts/${part.name}/part.yaml: requires "${req}", which is not a part`);
    }
  }

  cache = parts;
  return parts;
}

/**
 * The selection plus everything it requires, transitively: a dependant without its requirement is
 * broken, so install and update pull the requirement in rather than leave a half-part behind.
 */
export function withRequires(parts: Part[], selected: string[]): { names: string[]; added: string[] } {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const names = new Set(selected);
  // A Set iterated while it grows visits what the loop adds, so this closes over the whole chain.
  for (const name of names) for (const req of byName.get(name)?.requires ?? []) names.add(req);
  return { names: [...names], added: [...names].filter((n) => !selected.includes(n)) };
}

/** Installed parts that need `name` and are not going away with it. */
export function dependants(parts: Part[], name: string, leaving: string[]): string[] {
  return parts.filter((p) => !leaving.includes(p.name) && (p.requires ?? []).includes(name)).map((p) => p.name);
}

/** Every file under a directory source, in name order, paths relative to it. */
async function walk(dir: string, prefix = ''): Promise<string[]> {
  const found: string[] = [];
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await walk(path.join(dir, entry.name), rel)));
    else found.push(rel);
  }
  return found;
}

async function parsePart(name: string, raw: unknown): Promise<Part> {
  const fail: (msg: string) => never = (msg) => {
    throw new Error(`parts/${name}/part.yaml: ${msg}`);
  };

  if (!isRecord(raw)) return fail('expected a mapping');

  const type = raw.type as PartType;
  if (!TYPES.includes(type)) fail(`type must be one of ${TYPES.join(', ')}`);
  if (typeof raw.description !== 'string') fail('description must be a string');
  if (typeof raw.default !== 'boolean') fail('default must be a boolean');
  if (!Array.isArray(raw.files)) fail('files must be a list');

  const scope = (raw.scope ?? 'project') as Scope;
  if (scope !== 'project' && scope !== 'global') fail('scope must be project or global');
  // Nothing global has a project root: no agent file to write a line in, no directory to run in.
  if (scope === 'global' && (raw.snippet !== undefined || raw.recipes !== undefined)) fail('a global part can have neither a snippet nor recipes');

  const files: PartFile[] = [];
  for (const f of raw.files as unknown[]) {
    if (!isRecord(f) || typeof f.source !== 'string') fail('every files entry needs a source');
    if (f.target !== undefined && typeof f.target !== 'string') fail(`files entry "${f.source}" has a non-string target`);
    if (f.skipIfExists !== undefined && typeof f.skipIfExists !== 'boolean') fail(`files entry "${f.source}" has a non-boolean skipIfExists`);

    const source = f.source.replace(/\/$/, '');
    const target = (f.target as string | undefined) ?? defaultTarget(name, type, source) ?? fail(`files entry "${f.source}" needs a target`);
    const extra = f.skipIfExists === true ? { skipIfExists: true as const } : {};
    const dir = path.join(FACTORY_ROOT, 'parts', name, source);

    // A directory source is a shorthand for every file under it, kept expanded from here on.
    if (await stat(dir).then((st) => st.isDirectory(), () => false)) {
      for (const rel of await walk(dir)) files.push({ source: path.join('parts', name, source, rel), target: path.join(target, rel), ...extra });
      continue;
    }
    files.push({ source: path.join('parts', name, source), target, ...extra });
  }

  const part: Part = { name, type, scope, description: raw.description, default: raw.default, files };

  if (raw.hooks !== undefined) {
    if (!Array.isArray(raw.hooks)) fail('hooks must be a list');
    // `events: [A, B]` is sugar for one entry per event, `${event}` in the command naming each.
    part.hooks = (raw.hooks as unknown[]).flatMap((h): HookConfig[] => {
      if (!isRecord(h) || typeof h.command !== 'string') return fail('every hook needs a command');
      const { command, matcher } = h as { command: string; matcher?: unknown };
      const events = h.events === undefined ? [h.event] : h.events;
      if (!Array.isArray(events) || events.length === 0) fail('a hook needs event, or events as a non-empty list');
      if (matcher !== undefined && typeof matcher !== 'string') fail(`hook on ${events.join(', ')} has a non-string matcher`);
      return events.map((event): HookConfig => {
        if (!HOOK_EVENTS.includes(event as HookEvent)) fail(`hook event must be one of ${HOOK_EVENTS.join(', ')}`);
        return {
          event: event as HookEvent,
          ...(matcher === undefined ? {} : { matcher: matcher as string }),
          command: command.replaceAll('${event}', event as string),
        };
      });
    });
  }

  if (raw.mcp !== undefined) {
    const mcp = raw.mcp;
    if (!isRecord(mcp) || typeof mcp.serverName !== 'string' || !isRecord(mcp.config) || typeof mcp.config.command !== 'string' || !Array.isArray(mcp.config.args)) {
      fail('mcp needs serverName and config { command, args }');
    }
    part.mcp = mcp as unknown as McpConfig;
  }

  if (raw.settings !== undefined) {
    if (!isRecord(raw.settings)) fail('settings must be a mapping');
    part.settings = raw.settings;
  }

  if (raw.snippet !== undefined) {
    const snippet = raw.snippet;
    if (!isRecord(snippet)) fail('snippet must be a mapping');
    const { file, section, line } = snippet as Record<string, unknown>;
    if (typeof section !== 'string' || !section.startsWith('#')) fail('snippet.section must be a heading line starting with #');
    if (typeof line !== 'string' || line.includes('\n')) fail('snippet.line must be a single line');
    if (file !== undefined && typeof file !== 'string') fail('snippet.file must be a string');
    part.snippet = { ...(file === undefined ? {} : { file: file as string }), section, line } as Snippet;
  }

  if (raw.recipes !== undefined) {
    if (!isRecord(raw.recipes)) fail('recipes must be a mapping');
    const recipes: Recipes = {};
    for (const key of ['init', 'uninit'] as const) {
      const list = raw.recipes[key];
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.some((l) => typeof l !== 'string')) fail(`recipes.${key} must be a list of strings`);
      recipes[key] = list as string[];
    }
    part.recipes = recipes;
  }

  if (raw.vars !== undefined) {
    if (!isRecord(raw.vars) || Object.values(raw.vars).some((v) => typeof v !== 'string')) fail('vars must be a mapping of strings');
    part.vars = raw.vars as Record<string, string>;
  }

  if (raw.requires !== undefined) {
    if (!Array.isArray(raw.requires) || raw.requires.some((r) => typeof r !== 'string')) fail('requires must be a list of part names');
    part.requires = raw.requires as string[];
  }

  if (raw.envVars !== undefined) {
    if (!Array.isArray(raw.envVars)) fail('envVars must be a list');
    part.envVars = (raw.envVars as unknown[]).map((v): EnvVar => {
      if (!isRecord(v) || typeof v.name !== 'string' || typeof v.description !== 'string' || typeof v.url !== 'string') {
        return fail('every envVar needs name, description and url');
      }
      return { name: v.name, description: v.description, url: v.url };
    });
  }

  return part;
}

/** skill and tool parts map agents/X.md to .claude/agents/X.md and the rest to .claude/skills/<name>/X. */
function defaultTarget(name: string, type: PartType, source: string): string | null {
  if (type !== 'skill' && type !== 'tool') return null;
  if (source.startsWith('agents/')) return path.join('.claude', source);
  return path.join('.claude/skills', name, source);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
