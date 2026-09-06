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
const alive = (pid: number): boolean => { try { return process.kill(pid, 0); } catch { return false; } };
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

await check('the hook holds the machine awake only as the caffeinate mode says', async () => {
  const dir = path.join(TMP, 'caff');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const mission = path.join(dir, 'mission');
  const pid = path.join(home, '.factory', 'caffeinate', 'S.pid');
  await mkdir(bin, { recursive: true });
  await mkdir(mission, { recursive: true });
  await mkdir(path.join(home, '.factory'), { recursive: true });
  // A fake holder first on PATH: the case proves the decision, never this machine's sleep.
  await writeFile(path.join(bin, 'caffeinate'), '#!/bin/sh\nexec sleep 5\n', { mode: 0o755 });
  await writeFile(path.join(mission, 'state.json'), JSON.stringify({ name: 'c', session: 'S', step: 'implement' }));

  const hook = path.join(import.meta.dir, '..', 'parts', 'hook-factory', 'hook-factory.ts');
  const fire = async (event: string): Promise<boolean> => {
    const proc = Bun.spawn(['bun', hook, event], {
      cwd: dir,
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, SOUND: 'off', FACTORY_MISSION: mission },
      stdin: new TextEncoder().encode(JSON.stringify({ session_id: 'S', cwd: dir })),
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await proc.exited;
    return exists(pid);
  };
  const mode = (value: string): Promise<void> => writeFile(path.join(home, '.factory', 'config.yaml'), `caffeinate: "${value}"\n`);

  await mode('off');
  ok(!(await fire('SessionStart')) && !(await fire('UserPromptSubmit')), 'off started one anyway');
  await mode('on');
  ok(await fire('SessionStart'), 'on did not start at the session start');
  ok(await fire('Stop'), 'on let go at the end of a turn');
  await rm(pid, { force: true });
  await mode('auto');
  ok(!(await fire('SessionStart')), 'auto started before the first prompt');
  ok(await fire('UserPromptSubmit'), 'auto did not start on a prompt');
  ok(!(await fire('Stop')), 'auto held on past the turn');
});

await check('c writes the mode, keeps vars and holds only its own pid', async () => {
  const dir = path.join(TMP, 'caffc');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const pids = path.join(home, '.factory', 'caffeinate');
  await mkdir(bin, { recursive: true });
  await mkdir(path.join(home, '.factory'), { recursive: true });
  await writeFile(path.join(bin, 'caffeinate'), '#!/bin/sh\nexec sleep 60\n', { mode: 0o755 });
  await writeFile(path.join(home, '.factory', 'config.yaml'), 'vars:\n  codegraph: codegraph\n');
  // A pid the hook would have left behind: `auto` leaves it alone, `off` takes it down too.
  const other = Bun.spawn(['sleep', '60']);
  await Bun.write(path.join(pids, 'S.pid'), String(other.pid));

  // os.homedir() is fixed when the process starts, so a scratch ~/.factory only reaches a child.
  const script = path.join(dir, 'c.ts');
  const actions = path.join(import.meta.dir, '..', 'src', 'tui', 'actions.ts');
  await writeFile(script, `const { setCaffeinate } = await import('${actions}');\nawait setCaffeinate(process.argv[2] as never);\n`);
  const press = async (mode: string): Promise<void> => {
    const proc = Bun.spawn(['bun', script, mode], {
      env: { HOME: home, PATH: `${bin}:${process.env.PATH}` }, stdout: 'ignore', stderr: 'ignore',
    });
    ok((await proc.exited) === 0, `c ${mode} exited non-zero`);
  };
  const gone = (proc: { exited: Promise<unknown> }): Promise<boolean> =>
    Promise.race([proc.exited.then(() => true), Bun.sleep(1500).then(() => false)]);

  await press('on');
  const config = await Bun.file(path.join(home, '.factory', 'config.yaml')).text();
  ok(config.includes('caffeinate: "on"'), `the mode did not land, got ${JSON.stringify(config)}`);
  ok(config.includes('codegraph'), 'the rewrite lost vars');
  const held = Number(await Bun.file(path.join(pids, 'control.pid')).text());
  ok(held > 0 && alive(held), 'no live caffeinate behind control.pid');

  await press('auto');
  ok(!(await exists(path.join(pids, 'control.pid'))) && !alive(held), 'auto left control.pid running');
  ok(alive(other.pid), 'auto killed a pid that was not its own');

  await press('off');
  ok(await gone(other), 'off left a session pid running');
  ok(!(await exists(path.join(pids, 'S.pid'))), 'off left a pid file behind');
});

await check('a new inbox key is news, the first snapshot and an ageing item are not', async () => {
  const { arrivals, inboxKey } = await import('../src/tui/notify.js');
  const item = (origin: string, at: number) => ({ kind: 'gate' as const, project: 'p', origin, label: 'gate g', at });
  const first = [item('a', 1)];
  ok(inboxKey(item('a', 1)) === 'p/a/gate', `key is project/origin/kind, got ${inboxKey(item('a', 1))}`);
  ok(arrivals(null, first).length === 0, 'the first snapshot announced its own backlog');
  ok(arrivals(first, [item('a', 9)]).length === 0, 'an item that only aged read as new');
  ok(arrivals(first, [item('a', 9), item('b', 9)]).map((i) => i.origin).join() === 'b', 'the new item was missed');
});

await check('a step is coloured by what kind of work it is', async () => {
  const { stepKind } = await import('../src/tui/model.js');
  const { loadWorkflow } = await import('../src/core/workflow.js');
  const story = await loadWorkflow('story', TMP);
  // The story workflow names all four kinds; `early` is what the live mapping computes per step.
  const work = story.steps.findIndex((step) => step.role === 'worker');
  const kinds = story.steps.map((step, i) => `${step.name}:${stepKind(step, i < work)}`);
  const want = 'grill:human,intent:human,research:agent,spec:technical,implement:agent,'
    + 'accept:gatekeeper,condense:technical,merge:technical';
  ok(kinds.join() === want, `story reads ${kinds.join()}`);
  ok(stepKind({ name: 'verify' }) === 'gatekeeper' && stepKind({ name: 'validate' }) === 'gatekeeper',
    'a parallel gatekeeper row is not gatekeeping');
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
