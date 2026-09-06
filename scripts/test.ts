#!/usr/bin/env bun
// The e2e walk in one process: the commands and core functions imported, not spawned. One line per
// case, non-zero when any of them fails. `scripts/e2e.sh` stays as the black-box check.
import path from 'node:path';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// Every module that reads HOME reads it at import time: scratch it before any of them load.
// Resolved, because a relative symlink computed through /var would not point where it says.
const TMP = await realpath(await mkdtemp(path.join(tmpdir(), 'factory-test-')));
process.env.HOME = path.join(TMP, 'home');
await mkdir(path.join(process.env.HOME, '.factory'), { recursive: true });
// The config is read once and cached, so it lands before anything resolves a part. `codegraph` as
// the bare command keeps the codegraph case off the network.
await writeFile(path.join(process.env.HOME, '.factory', 'config.yaml'), 'vars:\n  codegraph: codegraph\n');

const { install } = await import('../src/commands/install.js');
const { update } = await import('../src/commands/update.js');
const { uninstall } = await import('../src/commands/uninstall.js');
const { step } = await import('../src/commands/step.js');
const { gate } = await import('../src/commands/gate.js');
const { closeMission, createMission, currentBranch, git, promoteMission, resolveMission } = await import('../src/core/mission.js');
const { removeSnippet, writeSnippet } = await import('../src/core/linker.js');
const { resolvePart } = await import('../src/core/recipes.js');
const { dependants, loadParts } = await import('../src/core/registry.js');
const { readManifest, writeManifest } = await import('../src/core/manifest.js');

let failed = 0;
const ok = (cond: unknown, msg: string): void => { if (!cond) throw new Error(msg); };
const exists = (p: string): Promise<boolean> => Bun.file(p).exists();
const branchGone = async (dir: string, b: string): Promise<boolean> => (await git(dir, 'branch', '--list', b)) === '';

/** The commands talk to a human; a case only cares about what they left behind. */
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  const log = console.log;
  console.log = () => {};
  const err = await fn().then(() => null, (e: Error) => e);
  console.log = log;
  if (err) failed++;
  console.log(err ? `✗ ${name} — ${err.message}` : `✓ ${name}`);
}

async function repo(name: string): Promise<string> {
  const dir = path.join(TMP, name);
  await mkdir(dir, { recursive: true });
  await git(dir, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.email', 'test@factory.local'], ['user.name', 'test']]) await git(dir, 'config', k!, v!);
  await writeFile(path.join(dir, 'README.md'), '# test\n');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-qm', 'init');
  return dir;
}

/** chore start to finish, with the one gate it does not declare opened by hand. */
async function walk(dir: string, name: string): Promise<void> {
  for (const s of ['grill', 'implement', 'merge']) {
    await step('start', [s], { mission: name }, dir);
    if (s === 'grill') {
      await gate('open', ['grill'], { mission: name, file: 'intent.md' }, dir);
      await gate('answer', ['grill', 'accept'], { mission: name }, dir);
    }
    await step('done', [s], { mission: name }, dir);
  }
}

/** Two missions in their own worktrees, closed in the given order: neither may strand the other. */
async function worktreePair(order: string[]): Promise<void> {
  const dir = await repo(`wt-${order.join('')}`);
  for (const name of ['a', 'b']) {
    await createMission(dir, { name, workflow: 'chore', attention: 'light', worktree: true, stub: false });
    await walk(dir, name);
  }
  for (const name of order) {
    await closeMission(dir, await resolveMission(dir, name));
    ok(await branchGone(dir, `mission/${name}`), `mission/${name} survived its close`);
    ok(!(await exists(path.join(TMP, `wt-${order.join('')}-${name}`))), `worktree of ${name} left behind`);
  }
  ok((await git(dir, 'status', '--porcelain')) === '', 'the pair left the tree dirty');
}

const main = await repo('main');

await check('install --yes links, snippets and records every source', async () => {
  await install(main, true);
  ok(await exists(path.join(main, '.claude/skills/commit/skill.md')), 'no commit skill');
  ok((await Bun.file(path.join(main, 'AGENTS.md')).text()).includes('@.claude/docs-format.md'), 'no snippet');
  const manifest = await readManifest(main);
  ok(manifest?.parts.commit?.sources?.['.claude/skills/commit/skill.md'] === 'parts/commit/skill.md', 'no source recorded');
});

await check('resolvePart expands the hooks shorthand', async () => {
  const part = (await loadParts()).find((p) => p.name === 'hook-factory')!;
  const hooks = (await resolvePart(part)).hooks ?? [];
  ok(hooks.length === 7, `expected 7 hooks, got ${hooks.length}`);
  ok(hooks.every((h) => h.command.endsWith(` ${h.event}`)), 'a hook command does not name its event');
});

await check('the hook rings only when the parent session waits on the human', async () => {
  const dir = path.join(TMP, 'ring');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const log = path.join(dir, 'afplay.log');
  const events = path.join(home, '.factory', 'events', 'S.jsonl');
  await mkdir(path.dirname(events), { recursive: true });
  await mkdir(bin, { recursive: true });
  // A fake player first on PATH: the case proves the decision, never a sound on this machine.
  await writeFile(path.join(bin, 'afplay'), `#!/bin/sh\necho "$@" >> ${log}\n`, { mode: 0o755 });

  const hook = path.join(import.meta.dir, '..', 'parts', 'hook-factory', 'hook-factory.ts');
  const sound = path.join(import.meta.dir, '..', 'parts', 'hook-factory', 'sounds', 'sonar-deep.mp3');
  const prompted = (secondsAgo: number): Promise<void> =>
    writeFile(events, `${JSON.stringify({ at: new Date(Date.now() - secondsAgo * 1000).toISOString(), event: 'UserPromptSubmit', session: 'S' })}\n`);

  /** Fires one hook and returns how many times the player has been called in all. */
  const fire = async (event: string, input: object, SOUND = sound): Promise<number> => {
    const proc = Bun.spawn(['bun', hook, event], {
      cwd: dir,
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, SOUND, QUIET: '30' },
      stdin: new TextEncoder().encode(JSON.stringify({ session_id: 'S', cwd: dir, ...input })),
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await proc.exited;
    await Bun.sleep(300); // the player is detached, so its line lands after the hook is gone
    return (await Bun.file(log).text().catch(() => '')).split('\n').filter((l) => l !== '').length;
  };

  await prompted(40);
  ok((await fire('Stop', {})) === 1, 'a long turn ending did not ring');
  await prompted(5);
  ok((await fire('Stop', {})) === 1, 'a short turn rang');
  ok((await fire('Notification', { notification_type: 'permission_prompt' })) === 2, 'a permission prompt did not ring');
  ok((await fire('SubagentStop', { agent_type: 'Worker' })) === 2, 'a sub-agent finishing rang');
  await prompted(40);
  ok((await fire('Stop', {}, 'off')) === 2, 'SOUND=off rang');
});

await check('the transcript tail parses each line once', async () => {
  const { readTranscript } = await import('../src/tui/transcript.js');
  const file = path.join(TMP, 'tail.jsonl');
  const row = (n: number): string => `${JSON.stringify({ type: 'assistant', timestamp: new Date(1e12 + n * 1000).toISOString(),
    message: { id: `m${n}`, usage: { output_tokens: 1 }, content: [{ type: 'tool_use', name: 'Bash', input: { command: `cmd ${n}` } }] } })}\n`;
  await writeFile(file, row(1) + row(2));
  ok((await readTranscript(file, 's', TMP)).activity.length === 2, 'two rows on the first read');
  await writeFile(file, row(3), { flag: 'a' });
  const tail = await readTranscript(file, 's', TMP);
  ok(tail.activity.map((a) => a.text).join() === 'cmd 1,cmd 2,cmd 3', `each line once, got ${tail.activity.map((a) => a.text).join()}`);
  ok(tail.offset === Bun.file(file).size && tail.usage.length === 3, 'offset and usage follow the file');
});

await check('writeSnippet and removeSnippet round trip', async () => {
  const snippet = { section: '## Scratch', line: '- Scratch: @docs/scratch.md' };
  const { record } = await writeSnippet(snippet, main);
  ok((await Bun.file(path.join(main, record.file)).text()).includes(snippet.line), 'line not written');
  ok(await removeSnippet(record, main), 'line not removed');
  ok(!(await Bun.file(path.join(main, record.file)).text()).includes('## Scratch'), 'section left behind');
});

await check('update reinstalls a part its dependant requires', async () => {
  const manifest = (await readManifest(main))!;
  delete manifest.parts.mission;
  await writeManifest(main, manifest);
  await update(main);
  ok((await readManifest(main))?.parts.mission, '/mission was not reinstalled');
  ok(dependants(await loadParts(), 'mission', ['mission']).includes('retro'), '/retro does not require /mission');
});

await git(main, 'add', '-A'); await git(main, 'commit', '-qm', 'install factory');

await check('a stub takes no branch and promote gives it one', async () => {
  const m = await createMission(main, { name: 'x', workflow: 'chore', attention: 'light', worktree: false, stub: true });
  ok(m.state.branch === null, 'the stub took a branch');
  ok((await currentBranch(main)) === 'main', 'the stub left the trunk');
  await promoteMission(main, m);
  ok((await currentBranch(main)) === 'mission/x', 'promote did not branch');
});

await check('close merges, cleans the tree and drops the branch', async () => {
  await walk(main, 'x');
  await closeMission(main, await resolveMission(main, 'x'));
  ok((await currentBranch(main)) === 'main', 'close left the mission branch');
  ok(await branchGone(main, 'mission/x'), 'close kept the branch');
  ok((await git(main, 'status', '--porcelain')) === '', 'close left the tree dirty');
  ok((await git(main, 'log', '--format=%s', 'main')).includes('close mission x'), 'close did not land on main');
});

await check('--keep-branch keeps it', async () => {
  await createMission(main, { name: 'y', workflow: 'chore', attention: 'light', worktree: false, stub: false });
  await walk(main, 'y');
  await closeMission(main, await resolveMission(main, 'y'), true);
  ok(!(await branchGone(main, 'mission/y')), '--keep-branch deleted the branch anyway');
});

await check('two worktree missions close a then b', () => worktreePair(['a', 'b']));
await check('two worktree missions close b then a', () => worktreePair(['b', 'a']));

await check('install --parts takes exactly the named parts', async () => {
  const dir = await repo('parts');
  const refused = await install(dir, false, ['nope']).then(() => null, (e: Error) => e);
  ok(refused?.name === 'Refusal', 'an unknown part did not refuse');

  await install(dir, false, ['codegraph']);
  const names = Object.keys((await readManifest(dir))!.parts);
  ok(names.join(',') === 'codegraph', `expected codegraph alone, got ${names.join(',') || 'nothing'}`);
  ok((await Bun.file(path.join(dir, '.mcp.json')).text()).includes('"codegraph"'), 'no mcp server entry');

  await uninstall(dir, true);
  ok(!(await exists(path.join(dir, '.claude/scripts/codegraph-gate.sh'))), 'the gate script was left behind');
});

await check('uninstall --yes leaves nothing behind', async () => {
  await uninstall(main, true);
  ok(!(await exists(path.join(main, '.claude/skills/commit/skill.md'))), 'a skill was left behind');
  ok(!(await exists(path.join(main, '.claude/.factory-manifest.json'))), 'the manifest was left behind');
  ok(!(await exists(path.join(main, '.mcp.json'))), 'an empty .mcp.json was left behind');
});

await rm(TMP, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
