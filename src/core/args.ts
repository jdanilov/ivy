export type Flags = Record<string, string | true>;

// Flags that never take a value, so `--worktree name` still reads `name` as a positional.
const BOOLEAN = new Set(['worktree', 'no-worktree', 'all', 'force', 'no-open', 'dry-run', 'stub', 'session', 'yes', 'global', 'keep-branch', 'fixture', 'waiting', 'verify', 'foreground']);

/** `--flag`, `--key value` and `--key=value`. Everything else is a positional. */
export function parseArgs(argv: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split(/=(.*)/s) as [string, string | undefined];
    const next = argv[i + 1];
    if (inline !== undefined) flags[key] = inline;
    else if (!BOOLEAN.has(key) && next !== undefined && !next.startsWith('--')) flags[key] = argv[++i]!;
    else flags[key] = true;
  }

  return { positionals, flags };
}

export function str(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}
