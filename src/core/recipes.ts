import type { ManifestPart, Part } from '../types.js';
import { loadConfig } from './config.js';
import { scopeOf } from './projects.js';
import { Refusal } from './mission.js';
import { I, colors } from '../ui/theme.js';

const VAR = /\$\{([A-Za-z_][A-Za-z0-9_-]*)\}/g;

/**
 * Substitutes `${name}` in hooks, mcp and recipes: `~/.factory/config.yaml` over the part's own
 * default over the built-in `${root}`, else a refusal. Callers resolve once and use the result
 * everywhere, so the manifest, `.mcp.json` and the hooks all hold the same strings and `update`
 * re-points a project.
 */
export async function resolvePart(part: Part, targetDir: string): Promise<Part> {
  if (!part.hooks && !part.mcp && !part.recipes) return part;

  const config = await loadConfig();
  // The one var the Factory itself defines: where the harness that runs the hook is rooted.
  const root = scopeOf(targetDir) === 'global' ? '$HOME' : '$CLAUDE_PROJECT_DIR';
  const sub = (text: string): string =>
    text.replace(VAR, (_, name: string) => {
      const value = config.vars?.[name] ?? part.vars?.[name] ?? (name === 'root' ? root : undefined);
      if (value === undefined) throw new Refusal(`part ${part.name} uses \${${name}} and nothing defines it`);
      return value;
    });

  const resolved: Part = { ...part };

  if (part.hooks) resolved.hooks = part.hooks.map((h) => ({ ...h, command: sub(h.command) }));

  if (part.mcp) {
    // A var is a command prefix and may carry arguments: the first word is the command, the rest lead the args.
    const [command, ...prefix] = sub(part.mcp.config.command).split(/\s+/).filter((w) => w !== '');
    resolved.mcp = {
      serverName: part.mcp.serverName,
      config: { ...part.mcp.config, command: command ?? '', args: [...prefix, ...part.mcp.config.args.map(sub)] },
    };
  }

  if (part.recipes) {
    resolved.recipes = {
      ...(part.recipes.init ? { init: part.recipes.init.map(sub) } : {}),
      ...(part.recipes.uninit ? { uninit: part.recipes.uninit.map(sub) } : {}),
    };
  }

  return resolved;
}

async function run(line: string, cwd: string): Promise<number> {
  console.log(`${I}${colors.dim}$ ${line}${colors.reset}`);
  return Bun.spawn(['sh', '-c', line], { cwd, stdio: ['inherit', 'inherit', 'inherit'] }).exited;
}

/**
 * Runs `recipes.init` once. `initAt` in the manifest is the record that it ran, so a rerun is a
 * no-op. A failing line refuses with the part's files already copied in: fix the cause and run
 * `update` again.
 */
export async function runInit(part: Part, prev: ManifestPart | undefined, entry: ManifestPart, cwd: string): Promise<void> {
  if (prev?.initAt) {
    entry.initAt = prev.initAt;
    return;
  }

  const lines = part.recipes?.init ?? [];
  if (lines.length === 0) return;

  for (const line of lines) {
    const code = await run(line, cwd);
    if (code !== 0) throw new Refusal(`${part.name} init: ${line} -> ${code}`);
  }

  entry.initAt = new Date().toISOString();
}

/** Runs the recorded `uninit`. A failure is a warning, never a reason to keep a part installed. */
export async function runUninit(name: string, lines: string[] | undefined, cwd: string): Promise<void> {
  for (const line of lines ?? []) {
    const code = await run(line, cwd);
    if (code !== 0) console.log(`${I}${colors.yellow}◈${colors.reset} ${name} uninit: ${line} -> ${code}`);
  }
}
