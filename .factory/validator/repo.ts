#!/usr/bin/env bun
/**
 * One scratch git repo under $HOME, registered with the Factory, ready for mission commands.
 * Prints its path. Every CLI assertion starts here.
 *
 *   HOME=$(mktemp -d /private/tmp/vhome.XXXXXX) bun /opt/ed/ivy/.factory/validator/repo.ts [name] [--install]
 *
 * Refuses a HOME outside /private/tmp: mission commands act on the checkout, and `install --yes`
 * writes real files. `--install` runs the full part install; without it the repo is only
 * registered through `status`, which is all `mission new` needs.
 */
import path from 'node:path';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';

const HOME = homedir();
if (!/^\/private\/tmp\//.test(HOME)) throw new Error(`refusing: HOME=${HOME} is not under /private/tmp`);
const CLI = '/opt/ed/ivy/src/cli.ts';

export function run(args: string[], cwd: string): { code: number; out: string } {
  const p = Bun.spawnSync(args, { cwd, env: { ...process.env, HOME, WARP_MISSING: '1' }, stdin: 'ignore' });
  return { code: p.exitCode, out: `${p.stdout.toString()}${p.stderr.toString()}` };
}

export async function makeRepo(name: string, install = false): Promise<string> {
  const dir = path.join(HOME, name);
  await mkdir(dir, { recursive: true });
  run(['git', 'init', '-b', 'main'], dir);
  run(['git', 'config', 'user.email', 'v@example.com'], dir);
  run(['git', 'config', 'user.name', 'validator'], dir);
  await Bun.write(path.join(dir, 'README.md'), `# ${name}\n`);
  run(['git', 'add', '-A'], dir);
  run(['git', 'commit', '-m', 'init'], dir);
  const reg = run(['bun', CLI, ...(install ? ['install', dir, '--yes'] : ['status', dir])], '/opt/ed/ivy');
  if (reg.code !== 0) throw new Error(`register failed:\n${reg.out}`);
  if (install) { run(['git', 'add', '-A'], dir); run(['git', 'commit', '-m', 'install factory'], dir); }
  return dir;
}

if (import.meta.main) {
  const name = process.argv[2] ?? 'repo';
  console.log(await makeRepo(name.startsWith('--') ? 'repo' : name, process.argv.includes('--install')));
}
