#!/usr/bin/env bun
/**
 * A scratch world for Mission Control: three registered git repos, one open story mission with a
 * running `implement`, one stub, one project with no missions at all, a dead project path, a live
 * unbound session and a stale one,
 * each with a Claude Code transcript. Everything the read-side assertions need in one run.
 *
 *   HOME=$(mktemp -d) bun /opt/ed/ivy/.factory/validator/scratch.ts
 *
 * Refuses unless HOME is under /private/tmp — a temp dir with no symlink in it, so the part
 * symlinks the linker writes with `..` hops resolve (a /tmp HOME makes every part read `modified`).
 */
import path from 'node:path';
import { homedir } from 'node:os';
import { mkdir, utimes, appendFile } from 'node:fs/promises';

const HOME = homedir();
if (!/^\/private\/tmp\//.test(HOME)) throw new Error(`refusing: HOME=${HOME} is not under /private/tmp`);
const CLI = '/opt/ed/ivy/src/cli.ts';
const env = { ...process.env, HOME };

export function run(args: string[], cwd: string): { code: number; out: string } {
  const p = Bun.spawnSync(args, { cwd, env, stdin: 'ignore' });
  return { code: p.exitCode, out: `${p.stdout.toString()}${p.stderr.toString()}` };
}
const cli = (args: string[], cwd: string) => run(['bun', CLI, ...args], cwd);

async function repo(name: string): Promise<string> {
  const dir = path.join(HOME, name);
  await mkdir(dir, { recursive: true });
  run(['git', 'init', '-b', 'main'], dir);
  run(['git', 'config', 'user.email', 'v@example.com'], dir);
  run(['git', 'config', 'user.name', 'validator'], dir);
  await Bun.write(path.join(dir, 'README.md'), `# ${name}\n`);
  run(['git', 'add', '-A'], dir);
  run(['git', 'commit', '-m', 'init'], dir);
  cli(['status', dir], '/opt/ed/ivy'); // registers the project in ~/.factory/projects
  return dir;
}

/** One hook events file. `age` in minutes sets both the last line and the mtime sessionLive reads. */
export async function events(session: string, cwd: string, lines: [event: string, detail?: string][], age = 0): Promise<void> {
  const dir = path.join(HOME, '.factory', 'events');
  await mkdir(dir, { recursive: true });
  const at = (i: number) => new Date(Date.now() - age * 60_000 - (lines.length - i) * 1000).toISOString();
  const body = lines.map(([event, detail], i) => JSON.stringify({ at: at(i), event, cwd, detail: detail ?? null })).join('\n');
  const file = path.join(dir, `${session}.jsonl`);
  await Bun.write(file, `${body}\n`);
  const t = new Date(Date.now() - age * 60_000);
  await utimes(file, t, t);
}

/** A transcript with every block kind the activity table maps, plus one sidechain line. */
export async function transcript(session: string, cwd: string): Promise<string> {
  const dir = path.join(HOME, '.claude', 'projects', cwd.replaceAll('/', '-'));
  await mkdir(dir, { recursive: true });
  const t = (n: number) => new Date(Date.now() - (10 - n) * 60_000).toISOString();
  const use = (n: number, name: string, input: unknown, sidechain = false) => JSON.stringify({
    type: 'assistant', timestamp: t(n), sessionId: session, isSidechain: sidechain,
    message: { id: `m${n}`, content: [{ type: 'tool_use', name, input }], usage: { input_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 50 } },
  });
  const lines = [
    use(1, 'Bash', { command: 'bun scripts/test.ts\nsecond line' }),
    use(2, 'Edit', { file_path: `${cwd}/README.md` }),
    use(9, 'Bash', { command: 'sidechain only' }, true),
    use(3, 'Agent', { subagent_type: 'Worker', description: 'wire the read side' }),
    use(4, 'AskUserQuestion', { questions: [{ question: 'Ship the amber gates?' }] }),
    JSON.stringify({ type: 'assistant', timestamp: t(5), sessionId: session, isSidechain: false, message: { id: 'm5', content: [{ type: 'text', text: 'Waiting on you: pick the trunk branch. More prose.' }], usage: { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 5 } } }),
  ];
  const file = path.join(dir, `${session}.jsonl`);
  await Bun.write(file, `${lines.join('\n')}\n`);
  return file;
}

/** More rows than the full-height log has room for, so the scroll can be seen moving. */
export async function bulk(session: string, cwd: string, n: number): Promise<void> {
  const dir = path.join(HOME, '.claude', 'projects', cwd.replaceAll('/', '-'));
  await mkdir(dir, { recursive: true });
  const lines = Array.from({ length: n }, (_, i) => JSON.stringify({
    type: 'assistant', timestamp: new Date(Date.now() - (n - i) * 1000).toISOString(), sessionId: session,
    isSidechain: false, message: { id: `b${i}`, content: [{ type: 'tool_use', name: 'Bash', input: { command: `echo row ${String(i).padStart(3, '0')}` } }] },
  }));
  await appendFile(path.join(dir, `${session}.jsonl`), `${lines.join('\n')}\n`);
}

if (import.meta.main && process.argv[2] === 'bulk') {
  await bulk(process.argv[3]!, path.join(HOME, 'alpha'), Number(process.argv[4] ?? 60));
  console.log('bulk ok');
} else if (import.meta.main) {
  const alpha = await repo('alpha');
  const beta = await repo('beta');

  cli(['mission', 'new', 'alpha', '--workflow', 'story', '--no-open'], alpha);
  for (const args of [
    ['step', 'start', 'grill'], ['step', 'done', 'grill'],
    ['step', 'start', 'intent'], ['gate', 'open', 'intent', '--file', 'intent.md'],
    ['gate', 'answer', 'intent', 'accept'], ['step', 'done', 'intent'],
    ['step', 'skip', 'research', '--reason', 'nothing to research'],
    ['step', 'start', 'spec'], ['step', 'done', 'spec'],
    ['step', 'start', 'implement'],
    ['gate', 'open', 'merge', '--file', 'intent.md'],
  ]) {
    const r = cli(args, alpha);
    if (r.code !== 0) console.log(`✗ ${args.join(' ')} → ${r.code}\n${r.out}`);
  }
  cli(['mission', 'new', 'bstub', '--stub', '--workflow', 'chore'], beta);
  await repo('gamma'); // registered, never missioned: the empty-project hint has somewhere to draw

  await appendFile(path.join(HOME, '.factory', 'projects'), `${path.join(HOME, 'gone')}\n`);

  const live = 'bbbbbbbb-1111-2222-3333-444444444444';
  const stale = 'cccccccc-1111-2222-3333-444444444444';
  await events(live, alpha, [['SessionStart', 'quick'], ['UserPromptSubmit'], ['Stop']]);
  await events(stale, alpha, [['SessionStart', 'quick'], ['Stop']], 120);
  await transcript(live, alpha);
  await transcript(stale, alpha);

  console.log(JSON.stringify({ HOME, alpha, beta, gamma: path.join(HOME, 'gamma'), live, stale }, null, 2));
}
