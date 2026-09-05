import path from 'node:path';
import { readdir } from 'node:fs/promises';
import type { EnvVar, HookConfig, HookEvent, McpConfig, Part, PartFile, PartType } from '../types.js';
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
    parts.push(parsePart(entry.name, Bun.YAML.parse(await file.text())));
  }

  cache = parts;
  return parts;
}

function parsePart(name: string, raw: unknown): Part {
  const fail: (msg: string) => never = (msg) => {
    throw new Error(`parts/${name}/part.yaml: ${msg}`);
  };

  if (!isRecord(raw)) return fail('expected a mapping');

  const type = raw.type as PartType;
  if (!TYPES.includes(type)) fail(`type must be one of ${TYPES.join(', ')}`);
  if (typeof raw.description !== 'string') fail('description must be a string');
  if (typeof raw.default !== 'boolean') fail('default must be a boolean');
  if (!Array.isArray(raw.files)) fail('files must be a list');

  const files = (raw.files as unknown[]).map((f): PartFile => {
    if (!isRecord(f) || typeof f.source !== 'string') return fail('every files entry needs a source');
    if (f.target !== undefined && typeof f.target !== 'string') fail(`files entry "${f.source}" has a non-string target`);
    if (f.skipIfExists !== undefined && typeof f.skipIfExists !== 'boolean') fail(`files entry "${f.source}" has a non-boolean skipIfExists`);
    return {
      source: path.join('parts', name, f.source),
      target: (f.target as string | undefined) ?? defaultTarget(name, type, f.source) ?? fail(`files entry "${f.source}" needs a target`),
      ...(f.skipIfExists === true ? { skipIfExists: true } : {}),
    };
  });

  const part: Part = { name, type, description: raw.description, default: raw.default, files };

  if (raw.hooks !== undefined) {
    if (!Array.isArray(raw.hooks)) fail('hooks must be a list');
    part.hooks = (raw.hooks as unknown[]).map((h): HookConfig => {
      if (!isRecord(h) || typeof h.event !== 'string' || typeof h.command !== 'string') return fail('every hook needs event and command');
      if (!HOOK_EVENTS.includes(h.event as HookEvent)) fail(`hook event must be one of ${HOOK_EVENTS.join(', ')}`);
      if (h.matcher !== undefined && typeof h.matcher !== 'string') fail(`hook on ${h.event} has a non-string matcher`);
      return { event: h.event as HookEvent, ...(h.matcher === undefined ? {} : { matcher: h.matcher }), command: h.command };
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
