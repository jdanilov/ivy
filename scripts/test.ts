#!/usr/bin/env bun
// The e2e walk in one process: the commands and core functions imported, not spawned. One line per
// case, non-zero when any of them fails. `scripts/e2e.sh` stays as the black-box check.
import path from 'node:path';
import { lstat, mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// The scratch HOME lands before any module that reads it loads. `$TMPDIR` is honoured, so a caller
// with a slow temp folder can point the whole run somewhere small. Resolved, because macOS hands
// back `/var/folders/...` for `/private/var/folders/...` and a project is compared against the
// path it really has.
const TMP = await realpath(await mkdtemp(path.join(tmpdir(), 'factory-test-')));
process.env.HOME = path.join(TMP, 'home');

// The whole run writes under this home. If it does not resolve here, nothing else may happen.
const { factoryHome, loadProjects, saveProject } = await import('../src/core/projects.js');
if (!factoryHome().startsWith(TMP + path.sep)) {
  console.log(`✗ refusing to write: factoryHome() is ${factoryHome()}, not under ${TMP}`);
  process.exit(1);
}

await mkdir(path.join(process.env.HOME, '.factory'), { recursive: true });
// The config is read once and cached, so it lands before anything resolves a part. `codegraph` as
// the bare command keeps the codegraph case off the network; `off` keeps every hook event a case
// fires from starting a real caffeinate this run would never stop.
await writeFile(path.join(process.env.HOME, '.factory', 'config.yaml'), 'caffeinate: "off"\nvars:\n  codegraph: codegraph\n');

const { install } = await import('../src/commands/install.js');
const { status } = await import('../src/commands/status.js');
const { hashFile, scanProject } = await import('../src/core/scanner.js');
const { update, updateAll } = await import('../src/commands/update.js');
const { uninstall } = await import('../src/commands/uninstall.js');
const { step } = await import('../src/commands/step.js');
const { gate } = await import('../src/commands/gate.js');
const { decision } = await import('../src/commands/decision.js');
const { answerDecision, readDecisions, waits } = await import('../src/core/decision.js');
const { mission } = await import('../src/commands/mission.js');
const { archiveMission, closeMission, createMission, currentBranch, ensureIgnored, git, listArchived, listMissions, missionWorkflow, promoteMission, resolveMission, writeState } = await import('../src/core/mission.js');
const { dropCreated, removeSnippet, writeSnippet } = await import('../src/core/linker.js');
const { resolvePart } = await import('../src/core/recipes.js');
const { dependants, ignoredScopes, loadParts, FACTORY_ROOT } = await import('../src/core/registry.js');
const { readManifest, writeManifest } = await import('../src/core/manifest.js');
const { loadConfig, resetConfig, writePartScope } = await import('../src/core/config.js');

let failed = 0;
const ok = (cond: unknown, msg: string): void => { if (!cond) throw new Error(msg); };
const exists = (p: string): Promise<boolean> => Bun.file(p).exists();
const alive = (pid: number): boolean => { try { return process.kill(pid, 0); } catch { return false; } };
const branchGone = async (dir: string, b: string): Promise<boolean> => (await git(dir, 'branch', '--list', b)) === '';

/** What a command printed, for a case that asserts on the report and not only on the disk. */
async function printed(fn: () => Promise<void>): Promise<string> {
  const log = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => { lines.push(args.join(' ')); };
  try { await fn(); } finally { console.log = log; }
  return lines.join('\n');
}

/** The commands talk to a human; a case only cares about what they left behind. */
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  const log = console.log;
  console.log = () => {};
  const err = await fn().then(() => null, (e: Error) => e);
  console.log = log;
  if (err) failed++;
  console.log(err ? `✗ ${name} — ${err.message}` : `✓ ${name}`);
}

async function repo(name: string, register = true): Promise<string> {
  const dir = path.join(TMP, name);
  await mkdir(dir, { recursive: true });
  await git(dir, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.email', 'test@factory.local'], ['user.name', 'test']]) await git(dir, 'config', k!, v!);
  await writeFile(path.join(dir, 'README.md'), '# test\n');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-qm', 'init');
  // What `mission new` does to a project on its first mission: the Factory's own files, ignored.
  await ensureIgnored(dir);
  // Mission commands refuse outside `~/.factory/projects`, which is what the scratch HOME sandboxes.
  if (register) await saveProject(dir);
  return dir;
}

/** chore start to finish: intent is a human gate, so the walk opens and answers it. */
async function walk(dir: string, name: string): Promise<void> {
  for (const s of ['intent', 'implement', 'merge']) {
    await step('start', [s], { mission: name }, dir);
    if (s === 'intent') {
      await gate('open', ['intent'], { mission: name, file: 'intent.md' }, dir);
      await gate('answer', ['intent', 'accept'], { mission: name }, dir);
    }
    await step('done', [s], { mission: name }, dir);
  }
}

/** Two missions in their own worktrees, closed in the given order: neither may strand the other. */
async function worktreePair(order: string[]): Promise<void> {
  const dir = await repo(`wt-${order.join('')}`);
  for (const name of ['a', 'b']) {
    await createMission(dir, { name, workflow: 'chore', autonomy: 'partial', worktree: true, stub: false });
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

await check('install --yes copies, snippets and records every source', async () => {
  await install(main, true);
  ok(await exists(path.join(main, '.claude/skills/mission/skill.md')), 'no mission skill');
  ok((await Bun.file(path.join(main, 'AGENTS.md')).text()).includes('@.claude/docs-format.md'), 'no snippet');
  const manifest = await readManifest(main);
  ok(manifest?.parts.mission?.sources?.['.claude/skills/mission/skill.md'] === 'parts/mission/skill.md', 'no source recorded');
  ok(!manifest?.parts.commit, 'a global part landed in a project');

  // Nothing the project keeps may point back at this checkout: a plain file is the whole contract.
  for (const [name, entry] of Object.entries(manifest!.parts)) {
    for (const file of entry.files) {
      ok((await lstat(path.join(main, file))).isFile(), `${name} put something other than a regular file at ${file}`);
    }
  }
});

await check('resolvePart expands the hooks shorthand and roots it in the project', async () => {
  const part = (await loadParts()).find((p) => p.name === 'hook-factory')!;
  const hooks = (await resolvePart(part, main)).hooks ?? [];
  ok(hooks.length === 8, `expected 8 hooks, got ${hooks.length}`);
  ok(hooks.every((h) => h.command.endsWith(` ${h.event}`)), 'a hook command does not name its event');
  ok(hooks.some((h) => h.event === 'PostToolUse' && h.matcher === 'Agent'), 'no PostToolUse hook on the Agent tool');
  ok(hooks.every((h) => h.command.includes('$CLAUDE_PROJECT_DIR/.claude/scripts/')), '${root} did not resolve to the project dir');
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

  const played = async (): Promise<number> =>
    (await Bun.file(log).text().catch(() => '')).split('\n').filter((l) => l !== '').length;

  /**
   * Fires one hook and returns how many times the player has been called in all. The player is
   * detached and never waited on — by design, a hook must not block the session — so the count is
   * polled up to a second for the one `want` expects instead of raced against a fixed sleep. A
   * case that expects no new ring reads the count straight back, and the next one that does
   * expect one would see a late line as its own.
   */
  const fire = async (event: string, input: object, want: number, SOUND = sound): Promise<number> => {
    const proc = Bun.spawn(['bun', hook, event], {
      cwd: dir,
      env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, SOUND, QUIET: '30' },
      stdin: new TextEncoder().encode(JSON.stringify({ session_id: 'S', cwd: dir, ...input })),
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await proc.exited;
    for (let waited = 0; waited < 1000 && (await played()) < want; waited += 20) await Bun.sleep(20);
    return played();
  };

  await prompted(40);
  ok((await fire('Stop', {}, 1)) === 1, 'a long turn ending did not ring');
  await prompted(5);
  ok((await fire('Stop', {}, 1)) === 1, 'a short turn rang');
  ok((await fire('Notification', { notification_type: 'permission_prompt' }, 2)) === 2, 'a permission prompt did not ring');
  ok((await fire('SubagentStop', { agent_type: 'Worker' }, 2)) === 2, 'a sub-agent finishing rang');
  await prompted(40);
  ok((await fire('Stop', {}, 2, 'off')) === 2, 'SOUND=off rang');
});

await check('a handoff never overwrites the one before it', async () => {
  const dir = path.join(TMP, 'handoff');
  const home = path.join(dir, 'home');
  const mission = path.join(dir, 'mission');
  const handoffs = path.join(mission, 'handoffs');
  await mkdir(path.join(home, '.factory'), { recursive: true });
  await mkdir(mission, { recursive: true });
  await writeFile(path.join(mission, 'state.json'), JSON.stringify({ name: 'h', session: 'S', step: 'implement' }));

  const hook = path.join(import.meta.dir, '..', 'parts', 'hook-factory', 'hook-factory.ts');
  const save = async (message: string): Promise<void> => {
    const proc = Bun.spawn(['bun', hook, 'SubagentStop'], {
      cwd: dir,
      env: { PATH: process.env.PATH, HOME: home, SOUND: 'off', FACTORY_MISSION: mission },
      stdin: new TextEncoder().encode(JSON.stringify({
        session_id: 'S', cwd: dir, agent_type: 'Worker',
        agent_transcript_path: path.join(dir, 'agent.jsonl'), last_assistant_message: message,
      })),
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await proc.exited;
  };
  const body = (worker: number, lines: number): string =>
    Array.from({ length: lines }, (_, i) => `W${worker} line ${i}`).join('\n');
  const head = (file: string): Promise<string> => Bun.file(path.join(handoffs, file)).text().catch(() => '');

  // The longest first: a rule that compares lengths would trade it for either of the next two.
  await save(body(1, 12));
  await save(body(2, 6));
  await save(body(3, 20));
  ok((await head('implement-Worker.md')).startsWith('W1 '), 'the first handoff was overwritten');
  ok((await head('implement-Worker-2.md')).startsWith('W2 '), 'the second did not take -2');
  ok((await head('implement-Worker-3.md')).startsWith('W3 '), 'the third did not take -3');
  await save('Step: implement\nDone: nothing');
  ok(!(await exists(path.join(handoffs, 'implement-Worker-4.md'))), 'a sign-off under five lines was saved');
});

/** A scratch mission the hook can bind to through FACTORY_MISSION, with nothing else around it. */
async function hookMission(name: string, autonomy: string): Promise<{ dir: string; home: string; mission: string; fire: (event: string, input: object) => Promise<string> }> {
  const dir = path.join(TMP, name);
  const home = path.join(dir, 'home');
  const mission = path.join(dir, 'mission');
  await mkdir(path.join(home, '.factory'), { recursive: true });
  // A home of its own reads `auto` by default, and a prompt event would start a real caffeinate.
  await writeFile(path.join(home, '.factory', 'config.yaml'), 'caffeinate: "off"\n');
  await mkdir(mission, { recursive: true });
  await writeFile(path.join(mission, 'state.json'), JSON.stringify({ name, session: 'S', step: 'implement', autonomy }));

  const hook = path.join(import.meta.dir, '..', 'parts', 'hook-factory', 'hook-factory.ts');
  const fire = async (event: string, input: object): Promise<string> => {
    const proc = Bun.spawn(['bun', hook, event], {
      cwd: dir,
      env: { PATH: process.env.PATH, HOME: home, SOUND: 'off', FACTORY_MISSION: mission },
      stdin: new TextEncoder().encode(JSON.stringify({ session_id: 'S', cwd: dir, ...input })),
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out.trim();
  };
  return { dir, home, mission, fire };
}

await check("the hook files a sub-agent's decisions from its handoff", async () => {
  const { dir, mission, fire } = await hookMission('filed', 'partial');
  const message = [
    'Step: implement', 'Done: the work', 'Acceptance: A-1 pass', 'Issues: one', 'Decisions:',
    '- HIGH: Reuse readJson | for the manifest', '- LOW: Do not implement auth, KISS and YAGNI',
    '', 'Prose after the block, - MEDIUM: not a decision',
  ].join('\n');
  await fire('SubagentStop', { agent_type: 'Worker', agent_transcript_path: path.join(dir, 'agent.jsonl'), last_assistant_message: message });

  const rows = await readDecisions(mission);
  ok(rows.length === 2, `expected two rows, got ${rows.length}`);
  ok(rows.every((d) => d.by === 'worker' && d.step === 'implement'), 'by or step did not come from the hook input');
  ok(rows[0]!.id === 'D1' && rows[0]!.status === 'auto' && rows[0]!.summary.includes('readJson / for'), 'the HIGH row is wrong');
  ok(rows[1]!.id === 'D2' && rows[1]!.status === 'waiting', 'the LOW row did not wait under partial');
});

await check('the hook names the waiting decisions until they are answered', async () => {
  const { mission, home, fire } = await hookMission('inject', 'partial');
  const message = ['Step: implement', 'Done: the work', 'Acceptance: A-1 pass', 'Issues: one', 'Decisions:', '- LOW: Do not implement auth'].join('\n');
  await fire('SubagentStop', { agent_type: 'Worker', agent_transcript_path: path.join(mission, 'agent.jsonl'), last_assistant_message: message });

  const injected = await fire('PostToolUse', { tool_name: 'Agent' });
  const parsed = JSON.parse(injected) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  ok(parsed.hookSpecificOutput.hookEventName === 'PostToolUse', 'the JSON does not name its event');
  ok(parsed.hookSpecificOutput.additionalContext.includes('D1 LOW Do not implement auth'), `the context misses the row: ${injected}`);
  ok((await fire('UserPromptSubmit', { prompt: 'go on' })).startsWith('Decisions waiting on the human (autonomy partial): D1'), 'a prompt did not carry the plain text');

  await answerDecision(mission, 'D1', 'accept');
  ok((await fire('PostToolUse', { tool_name: 'Agent' })) === '', 'an answered decision was still injected');

  const events = await Bun.file(path.join(home, '.factory', 'events', 'S.jsonl')).text();
  ok(!events.includes('PostToolUse'), 'PostToolUse landed on the event bus');
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
  ok(inboxKey(item('a', 1)) === 'p/a/gate g', `key is project/origin/label, got ${inboxKey(item('a', 1))}`);
  ok(arrivals(null, first).length === 0, 'the first snapshot announced its own backlog');
  ok(arrivals(first, [item('a', 9)]).length === 0, 'an item that only aged read as new');
  ok(arrivals(first, [item('a', 9), item('b', 9)]).map((i) => i.origin).join() === 'b', 'the new item was missed');
});

await check('a step is coloured by what kind of work it is', async () => {
  const { stepKind } = await import('../src/tui/model.js');
  const { loadWorkflow } = await import('../src/core/workflow.js');
  const story = await loadWorkflow('story', TMP);
  // The story workflow names all four kinds; the runner decides, the human's gates are their own.
  const kinds = story.steps.map((step) => `${step.name}:${stepKind(step)}`);
  const want = 'intent:human,research:agent,spec:technical,implement:agent,review:gatekeeper,merge:human';
  ok(kinds.join() === want, `story reads ${kinds.join()}`);
  ok(stepKind({ name: 'verify' }) === 'gatekeeper' && stepKind({ name: 'validate' }) === 'gatekeeper',
    'a parallel gatekeeper row is not gatekeeping');
  // A closed mission's workflow copy still names the folded steps; they keep the colours they had.
  ok(stepKind({ name: 'grill' }) === 'human' && stepKind({ name: 'accept' }) === 'gatekeeper'
    && stepKind({ name: 'condense' }) === 'technical', 'an old step name lost its colour');
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

await check('a bash or sub row is out until its result lands, and reads how it went', async () => {
  const { readTranscript } = await import('../src/tui/transcript.js');
  const file = path.join(TMP, 'status.jsonl');
  const at = (n: number): string => new Date(1e12 + n * 1000).toISOString();
  const call = (n: number, id: string, name: string, input: Record<string, unknown>): string =>
    `${JSON.stringify({ type: 'assistant', timestamp: at(n), message: { id: `m${n}`, content: [{ type: 'tool_use', id, name, input }] } })}\n`;
  const result = (id: string, content: string, is_error = false, toolUseResult?: object): string =>
    `${JSON.stringify({ type: 'user', toolUseResult, message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error }] } })}\n`;
  await writeFile(file, call(1, 't1', 'Bash', { description: 'run tests' }) + result('t1', 'ok')
    + call(2, 't2', 'Bash', { description: 'typecheck' }) + result('t2', 'Exit code 2', true)
    + call(3, 't3', 'Agent', { subagent_type: 'Commit', description: 'commit it' })
    + result('t3', 'Async agent launched successfully. agentId: abc123', false, { isAsync: true })
    + call(4, 't4', 'Bash', { description: 'still running' }));
  const rows = (await readTranscript(file, 's', TMP)).activity;
  ok(rows.map((a) => `${a.verb} ${a.status}`).join() === 'bash ok,bash failed,sub running,bash running', `read ${rows.map((a) => `${a.verb} ${a.status}`).join()}`);
  ok(rows[2]!.text === '→ Commit · commit it', `a launch row reads ${rows[2]!.text}`);
  await writeFile(file, `${JSON.stringify({ type: 'user', message: { content: '<task-notification><task-id>abc123</task-id><tool-use-id>t3</tool-use-id><status>completed</status></task-notification>' } })}\n`, { flag: 'a' });
  const later = (await readTranscript(file, 's', TMP)).activity;
  ok(later[2]!.status === 'ok' && later[3]!.status === 'running', 'the task notification did not settle the sub, or settled the wrong row');
});

await check('a session asks with its last Stop, and only a prompt clears it', async () => {
  const { transcriptPath } = await import('../src/tui/transcript.js');
  const { buildSnapshot } = await import('../src/tui/live.js');
  const dir = await repo('asks');
  const session = 'Q';
  const at = (back: number): string => new Date(Date.now() - back * 60_000).toISOString();
  const final = 'Reply sent, thread labeled DONE. Anything else?';

  // The shape H-7 came off: a skill preamble is a user record, and it is the last text on file.
  // The turn ends on a question, which is the only shape that reaches the Inbox as one.
  const file = transcriptPath(dir, session);
  await mkdir(path.dirname(file), { recursive: true });
  const said = (type: string, text: string, back: number): string =>
    `${JSON.stringify({ type, timestamp: at(back), message: { id: `${type}${back}`, content: [{ type: 'text', text }] } })}\n`;
  await writeFile(file, said('assistant', 'An earlier turn', 30)
    + said('assistant', final, 20)
    + said('user', 'Base directory for this skill', 15));

  const events = path.join(process.env.HOME!, '.factory', 'events', `${session}.jsonl`);
  await mkdir(path.dirname(events), { recursive: true });
  const logged = (event: string, detail: string | null, back: number): string =>
    `${JSON.stringify({ at: at(back), event, session, cwd: dir, mission: null, step: null, detail })}\n`;
  await writeFile(events, logged('Stop', 'An earlier turn', 8) + logged('UserPromptSubmit', 'carry on', 6)
    + logged('Stop', final, 2));

  const asks = async (): Promise<string[]> =>
    (await buildSnapshot()).inbox.filter((i) => i.kind === 'question' && i.project === 'asks').map((i) => i.text ?? '');
  ok((await asks()).join() === final, `asks reads ${(await asks()).join() || 'nothing'}`);

  // An idle notification is the same question asked again, not a second one.
  await writeFile(events, logged('Notification', 'idle_prompt: waiting for your input', 1), { flag: 'a' });
  ok((await asks()).join() === final, 'an idle notification changed the question');

  await writeFile(events, logged('UserPromptSubmit', 'answered', 0), { flag: 'a' });
  ok((await asks()).length === 0, 'answering did not clear the question');
});

await check('writeSnippet and removeSnippet round trip', async () => {
  const snippet = { section: '## Scratch', line: '- Scratch: @docs/scratch.md' };
  const { record } = await writeSnippet(snippet, main);
  ok((await Bun.file(path.join(main, record.file)).text()).includes(snippet.line), 'line not written');
  ok(await removeSnippet(record, main), 'line not removed');
  ok(!(await Bun.file(path.join(main, record.file)).text()).includes('## Scratch'), 'section left behind');
});

await check('update replaces a link into the Factory with a copy and leaves the source alone', async () => {
  const file = '.claude/skills/mission/skill.md';
  const target = path.join(main, file);
  const source = path.join(FACTORY_ROOT, 'parts/mission/skill.md');
  const before = await hashFile(source);

  await unlink(target);
  await symlink(source, target);
  await update(main);

  ok((await lstat(target)).isFile(), 'the link is still a link');
  ok((await hashFile(source)) === before, 'writing the copy edited the Factory source');
  ok((await hashFile(target)) === before, 'the copy does not hold the source bytes');
});

await check('an edited copy reads modified and update restores it by name', async () => {
  const file = '.claude/skills/mission/skill.md';
  const target = path.join(main, file);
  const source = await Bun.file(target).text();
  await writeFile(target, source + '\nedited by the project\n');

  const state = (await scanProject(main)).find((s) => s.part.name === 'mission')!;
  ok(state.status === 'modified', `an edited copy reads ${state.status}`);

  const report = await printed(() => update(main));
  ok(report.includes(`restored ${file}`), `update did not name what it restored: ${report}`);
  ok((await Bun.file(target).text()) === source, 'update did not put the source bytes back');
});

await check('uninstall leaves an edited copy, names it and removes the rest', async () => {
  const dir = await repo('edited');
  await install(dir, false, ['verify']);
  const mine = path.join(dir, '.claude/skills/verify/skill.md');
  await writeFile(mine, 'mine now\n');

  // The report's removal block only: the listing above it names every file the part ships.
  const report = (await printed(() => uninstall(dir, true))).split('Uninstalling')[1]!;
  ok(await exists(mine), 'uninstall took a copy the project had edited');
  ok(report.includes('left in place: .claude/skills/verify/skill.md'), `uninstall did not name it: ${report}`);
  ok(report.split('.claude/skills/verify/skill.md').length === 2, `a file was named both removed and left: ${report}`);
  ok(!(await exists(path.join(dir, '.claude/agents/Verifier.md'))), 'an untouched copy was left behind');
});

await check('uninstall takes no credit for a part it left where it was', async () => {
  const dir = await repo('kept');
  await install(dir, false, ['verify']);
  const files = ['.claude/skills/verify/skill.md', '.claude/agents/Verifier.md'];
  for (const file of files) await writeFile(path.join(dir, file), 'mine now\n');

  const report = (await printed(() => uninstall(dir, true))).split('Uninstalling')[1]!;
  ok(files.every((f) => report.split(f).length === 2), `a file was named twice or not at all: ${report}`);
  ok(!report.includes('removed .claude/'), `uninstall claimed a file it never removed: ${report}`);
  ok(report.includes('0 parts removed'), `the summary counted a part it left: ${report}`);
});

await check('a directory at a target is the project\'s: refused on the way in, named on the way out', async () => {
  const dir = await repo('dirtarget');
  await install(dir, false, ['verify']);
  const file = '.claude/agents/Verifier.md';
  await unlink(path.join(dir, file));
  await mkdir(path.join(dir, file));

  const refused = await update(dir).then(() => null, (e: Error) => e);
  ok(refused?.message === `${path.join(dir, file)} is a directory — move it aside and rerun`,
    `update did not refuse the directory: ${refused?.message ?? 'none'}`);

  const report = (await printed(() => uninstall(dir, true))).split('Uninstalling')[1]!;
  ok(await lstat(path.join(dir, file)).then(() => true, () => false), 'uninstall took a directory of the project\'s');
  ok(report.includes(`left in place: ${file}`), `uninstall did not name it: ${report}`);
});

await check('install names an edited copy it had to restore when nobody was asked', async () => {
  const dir = await repo('clobber');
  await install(dir, false, ['verify']);
  const file = '.claude/skills/verify/skill.md';
  await writeFile(path.join(dir, file), 'mine now\n');

  const report = await printed(() => install(dir, false, ['verify']));
  const done = report.split('Installing')[1]!;
  ok(done.includes(`restored ${file}`), `install clobbered an edited copy in silence: ${report}`);
  const rows = done.split('\n').filter((l) => l.includes('/verify'));
  ok(rows.length === 1, `install named the part it restored on more than one row: ${rows.join(' | ')}`);
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
  const m = await createMission(main, { name: 'x', workflow: 'chore', autonomy: 'partial', worktree: false, stub: true });
  ok(m.state.branch === null, 'the stub took a branch');
  ok((await currentBranch(main)) === 'main', 'the stub left the trunk');
  await promoteMission(main, m);
  ok((await currentBranch(main)) === 'mission/x', 'promote did not branch');
});

await check('close merges, cleans the tree and drops the branch', async () => {
  await walk(main, 'x');
  const closed = await resolveMission(main, 'x');
  await closeMission(main, closed);
  ok((await currentBranch(main)) === 'main', 'close left the mission branch');
  ok(await branchGone(main, 'mission/x'), 'close kept the branch');
  ok((await git(main, 'status', '--porcelain')) === '', 'close left the tree dirty');
  // The folder is ignored: the state file says closed, and git was never told about any of it.
  ok((await resolveMission(main, 'x')).state.status === 'closed', 'close did not record the status');
  ok((await git(main, 'ls-files', '--', '.factory')) === '', 'close committed the mission folder');
  ok(await exists(path.join(closed.dir, 'state.json')), 'close took the folder with it');
});

await check('--keep-branch keeps it', async () => {
  await createMission(main, { name: 'y', workflow: 'chore', autonomy: 'partial', worktree: false, stub: false });
  await walk(main, 'y');
  await closeMission(main, await resolveMission(main, 'y'), true);
  ok(!(await branchGone(main, 'mission/y')), '--keep-branch deleted the branch anyway');
});

/** The step names of a mission's own workflow copy, in order. */
async function graph(dir: string, name: string): Promise<string[]> {
  return (await missionWorkflow(await resolveMission(dir, name))).steps.map((s) => s.name);
}

await check('a mission starts unshaped and shape appends a preset once', async () => {
  const dir = await repo('shape');
  await mission('new', ['s'], { 'no-open': true }, dir);
  ok((await graph(dir, 's')).join() === 'intent', `new took ${(await graph(dir, 's')).join()}, not intent alone`);
  ok((await resolveMission(dir, 's')).state.workflow === 'intent', 'new did not record the intent workflow');

  await mission('shape', ['story'], { autonomy: 'partial' }, dir);
  const shaped = await resolveMission(dir, 's');
  ok((await graph(dir, 's')).join() === 'intent,research,spec,implement,review,merge', `shape gave ${(await graph(dir, 's')).join()}`);
  ok(shaped.state.workflow === 'story' && shaped.state.autonomy === 'partial', 'shape recorded neither the preset nor the dial');
  ok(shaped.state.steps.research?.status === 'pending', 'an appended step has no pending entry');
  ok(shaped.state.step === 'intent', `the pointer left an unfinished intent for ${shaped.state.step}`);

  // Idempotent for the same preset: state.json is the same bytes, timestamp and all.
  const file = path.join(shaped.dir, 'state.json');
  const before = await Bun.file(file).text();
  await mission('shape', ['story'], {}, dir);
  ok((await Bun.file(file).text()) === before, 'a second shape story rewrote state.json');

  const refused = await mission('shape', ['quick'], {}, dir).then(() => null, (e: Error) => e);
  ok(refused?.name === 'Refusal', 'shape quick was not refused');

  await mission('new', ['q'], { quick: true, 'no-open': true, 'no-worktree': true }, dir);
  ok((await graph(dir, 'q')).join() === 'work', `--quick took ${(await graph(dir, 'q')).join()}`);
});

await check('an insert past a finished step takes the pointer with it', async () => {
  const dir = await repo('pointer');
  await mission('new', ['t'], { 'no-open': true }, dir);
  await step('start', ['intent'], { mission: 't' }, dir);
  await gate('open', ['intent'], { mission: 't', file: 'intent.md' }, dir);
  await gate('answer', ['intent', 'accept'], { mission: 't' }, dir);
  await step('done', ['intent'], { mission: 't' }, dir);

  await mission('shape', ['story'], {}, dir);
  ok((await resolveMission(dir, 't')).state.step === 'research', 'shape left the pointer on a finished intent');

  await step('add', ['x'], { mission: 't', after: 'intent', reason: 'the pointer rule' }, dir);
  ok((await resolveMission(dir, 't')).state.step === 'x', 'step add did not take the pointer');
});

await check('--verify puts a verifier loop behind implement, and only where one fits', async () => {
  const dir = await repo('verify');
  await mission('new', ['v'], { 'no-open': true }, dir);
  await mission('shape', ['chore'], { verify: true }, dir);
  const shaped = await resolveMission(dir, 'v');
  ok((await graph(dir, 'v')).join() === 'intent,implement,verify,merge', `shape chore --verify gave ${(await graph(dir, 'v')).join()}`);
  ok(shaped.state.workflow === 'chore' && shaped.state.steps.verify?.status === 'pending', 'the verify step is not a pending chore step');
  const wf = await missionWorkflow(shaped);
  ok(wf.steps[2]?.role === 'verifier' && wf.steps[2]?.loop?.back === 'implement' && wf.steps[2]?.loop?.max === 2, 'verify is not a verifier loop back to implement');

  for (const [preset, why] of [['story', 'already verifies'], ['research', 'no implement']] as const) {
    const refused = await createMission(dir, { name: `v-${preset}`, workflow: preset, verify: true, autonomy: 'partial', worktree: false, stub: true }).then(() => null, (e: Error) => e);
    ok(refused?.name === 'Refusal' && refused.message.includes(why), `${preset} --verify was not refused for ${why}: ${refused?.message}`);
  }
});

await check('a step the mission looped back to counts its runs', async () => {
  const dir = await repo('runs');
  await mission('new', ['t'], { workflow: 'chore', verify: true, 'no-open': true }, dir);
  await step('start', ['intent'], { mission: 't' }, dir);
  await gate('open', ['intent'], { mission: 't', file: 'intent.md' }, dir);
  await gate('answer', ['intent', 'accept'], { mission: 't' }, dir);
  await step('done', ['intent'], { mission: 't' }, dir);
  await step('start', ['implement'], { mission: 't' }, dir);
  ok((await resolveMission(dir, 't')).state.steps.implement?.runs === 1, 'the first start did not count a run');

  await step('done', ['implement'], { mission: 't' }, dir);
  await step('start', ['verify'], { mission: 't' }, dir);
  await step('loop', ['verify'], { mission: 't', reason: 'findings to fix' }, dir);
  ok((await resolveMission(dir, 't')).state.steps.implement?.runs === 1, 'the loop dropped the run count');

  await step('start', ['implement'], { mission: 't' }, dir);
  ok((await resolveMission(dir, 't')).state.steps.implement?.runs === 2, 'restarting after a loop did not count a second run');
});

await check('a waiting decision holds step start until it is answered', async () => {
  const dir = await repo('decisions');
  const m = await createMission(dir, { name: 'd', workflow: 'chore', autonomy: 'partial', worktree: false, stub: false });
  ok(!waits('full', 'LOW') && waits('partial', 'LOW') && !waits('partial', 'MEDIUM') && waits('none', 'HIGH'),
    'the dial does not map confidence to waiting');

  await decision('add', ['Do not implement auth | KISS and YAGNI'], { confidence: 'LOW', mission: 'd' }, dir);
  await decision('add', ['Reuse readJson'], { confidence: 'HIGH', by: 'worker', step: 'implement', mission: 'd' }, dir);
  const rows = await readDecisions(m.dir);
  ok(rows.map((d) => `${d.id}:${d.status}`).join() === 'D1:waiting,D2:auto', `the table reads ${rows.map((d) => `${d.id}:${d.status}`).join()}`);
  ok(rows[0]!.summary === 'Do not implement auth / KISS and YAGNI', 'a | in a summary was not swapped for /');
  ok(rows[0]!.step === 'intent' && rows[1]!.by === 'worker', 'add did not default the step or take --by');

  const held = await step('start', ['intent'], { mission: 'd' }, dir).then(() => null, (e: Error) => e);
  ok(held?.message.includes('D1'), `step start ran with D1 waiting: ${held?.message ?? 'no refusal'}`);

  await decision('answer', ['D1', 'overrule'], { mission: 'd', note: 'do it anyway' }, dir);
  const answered = (await readDecisions(m.dir))[0]!;
  ok(answered.status === 'overruled' && answered.note === 'do it anyway', 'the verdict or the note did not land');
  await step('start', ['intent'], { mission: 'd' }, dir);
  ok((await resolveMission(dir, 'd')).state.steps.intent?.status === 'running', 'step start still refused once nothing waited');

  await decision('answer', ['D1', 'overrule'], { mission: 'd' }, dir);
  ok((await readDecisions(m.dir))[0]!.note === 'do it anyway', 'the same verdict again rewrote the row');
  const conflict = await decision('answer', ['D1', 'accept'], { mission: 'd' }, dir).then(() => null, (e: Error) => e);
  ok(conflict?.name === 'Refusal', 'a conflicting second answer was accepted');
});

await check('two worktree missions close a then b', () => worktreePair(['a', 'b']));
await check('two worktree missions close b then a', () => worktreePair(['b', 'a']));

await check('a mission command refuses outside a registered project', async () => {
  const dir = await repo('stranger', false);
  const opts = { name: 'n', workflow: 'chore', autonomy: 'partial' as const, worktree: false, stub: false };
  const refused = await createMission(dir, opts).then(() => null, (e: Error) => e);
  ok(refused?.message.includes(`${dir} is not a registered project`), `no sandbox refusal: ${refused?.message ?? 'none'}`);
  await saveProject(dir);
  await createMission(dir, opts);
  ok((await listMissions(dir)).length === 1, 'registering the project did not let the mission through');
});

await check('open writes nothing on a dry run and never reopens a closed mission', async () => {
  const dir = await repo('reopen');
  await mission('new', ['s'], { stub: true }, dir);
  const file = path.join((await resolveMission(dir, 's')).dir, 'state.json');
  const before = await Bun.file(file).text();

  await mission('open', ['s'], { 'dry-run': true }, dir);
  ok((await Bun.file(file).text()) === before, 'a dry run rewrote state.json');
  ok((await currentBranch(dir)) === 'main', 'a dry run promoted the stub');
  ok(!(await exists(path.join(dir, '.factory', 'claim'))), 'a dry run claimed the checkout');

  await createMission(dir, { name: 'c', workflow: 'chore', autonomy: 'partial', worktree: false, stub: false });
  await walk(dir, 'c');
  await closeMission(dir, await resolveMission(dir, 'c'));
  const closed = path.join((await resolveMission(dir, 'c')).dir, 'state.json');
  const bytes = await Bun.file(closed).text();
  const refused = await mission('open', ['c'], { 'dry-run': true }, dir).then(() => null, (e: Error) => e);
  ok(refused?.message === 'mission c is closed', `a closed mission opened: ${refused?.message ?? 'no refusal'}`);
  ok((await Bun.file(closed).text()) === bytes, 'the refusal still rewrote state.json');
});

await check('a closed mission archives, comes back and is idempotent either way', async () => {
  const dir = await repo('archive');
  await createMission(dir, { name: 'a', workflow: 'chore', autonomy: 'partial', worktree: false, stub: false });
  await walk(dir, 'a');
  const early = await archiveMission(dir, 'a').then(() => null, (e: Error) => e);
  ok(early?.name === 'Refusal', 'an open mission was archived');

  await closeMission(dir, await resolveMission(dir, 'a'));
  const head = await git(dir, 'rev-parse', 'HEAD');
  const log = await archiveMission(dir, 'a');
  ok(log.length === 1 && log[0]!.startsWith('archived .factory/archive/'), `archive said ${log.join(' · ')}`);
  ok((await git(dir, 'rev-parse', 'HEAD')) === head, 'archive committed something');
  ok((await git(dir, 'status', '--porcelain')) === '', 'archive left the tree dirty');
  ok((await listArchived(dir)).map((m) => m.state.name).join() === 'a', 'the archive does not hold it');
  ok((await listMissions(dir)).length === 0, 'the missions folder still holds it');
  ok((await archiveMission(dir, 'a')).length === 0, 'a second archive was not a no-op');

  await archiveMission(dir, 'a', true);
  ok((await listMissions(dir)).length === 1 && (await listArchived(dir)).length === 0, 'unarchive did not put it back');

  // A stub has no branch, so it may go without being closed first.
  await createMission(dir, { name: 's', workflow: 'chore', autonomy: 'partial', worktree: false, stub: true });
  ok((await archiveMission(dir, 's')).length === 1, 'a stub did not archive');
  ok((await listArchived(dir)).map((m) => m.state.name).join() === 's', 'the archive does not hold the stub');
});

await check('the Factory\'s own files are ignored, once and committed', async () => {
  const dir = await repo('ignore');
  const file = path.join(dir, '.gitignore');
  ok((await Bun.file(file).text()) === '.factory/claim\n.factory/missions/\n.factory/archive/\n',
    `the ignore file reads ${JSON.stringify(await Bun.file(file).text())}`);
  ok((await git(dir, 'status', '--porcelain')) === '', 'the lines were left uncommitted on a clean tree');
  ok((await ensureIgnored(dir)) === null, 'a second call wrote the lines again');
});

await check('open replaces a dead session and refuses a live one', async () => {
  const dir = await repo('bound');
  await mission('new', ['b1'], { 'no-open': true }, dir);
  const m = await resolveMission(dir, 'b1');
  m.state.session = 'S-1';
  await writeState(m.dir, m.state);

  // No events file, so that tab is gone: the mission is opened again rather than stranded.
  const opened = await mission('open', ['b1'], { 'dry-run': true }, dir).then(() => null, (e: Error) => e);
  ok(opened === null, `a dead session was not replaced: ${opened?.message ?? ''}`);

  const events = path.join(process.env.HOME!, '.factory', 'events', 'S-1.jsonl');
  await mkdir(path.dirname(events), { recursive: true });
  await writeFile(events, `${JSON.stringify({ at: new Date().toISOString(), event: 'Stop', session: 'S-1' })}\n`);
  const refused = await mission('open', ['b1'], { 'dry-run': true }, dir).then(() => null, (e: Error) => e);
  ok(refused?.message === 'mission b1 is bound to session S-1 — factory mission adopt b1 --session <id> to rebind',
    `open rebound a live session: ${refused?.message ?? 'no refusal'}`);
  ok((await resolveMission(dir, 'b1')).state.session === 'S-1', 'the refusal still rewrote the session');
});

await check('a hand-copied template reads as installed with no manifest', async () => {
  const dir = await repo('seeded');
  await mkdir(path.join(dir, 'docs'), { recursive: true });
  await writeFile(path.join(dir, 'docs', 'terminology.md'), '# the project owns this\n');
  const states = await scanProject(dir);
  const status = (name: string): string | undefined => states.find((s) => s.part.name === name)?.status;
  ok(status('terminology') === 'installed', `a seeded template reads ${status('terminology')}`);
  ok(status('roadmap') === 'not-installed', 'a template nobody copied reads as installed');
});

await check('uninstall takes an emptied docs/ and leaves one holding the project\'s own', async () => {
  const dir = await repo('emptied');
  await mkdir(path.join(dir, 'docs'), { recursive: true });
  ok((await dropCreated([], dir)).includes('docs/'), 'an empty docs/ was left behind');

  await mkdir(path.join(dir, 'docs'), { recursive: true });
  await writeFile(path.join(dir, 'docs', 'terminology.md'), '# the project owns this\n');
  ok(!(await dropCreated([], dir)).includes('docs/'), 'a docs/ with something in it was removed');
});

await check('update --all walks every registered project and then the home dir', async () => {
  const home = process.env.HOME!;
  const a = await repo('all-a');
  const b = await repo('all-b');
  await install(a, false, ['verify']);
  await install(b, false, ['verify']);
  await install(home, false, ['commit']);

  const stamp = async (dir: string): Promise<string> => (await readManifest(dir))!.updatedAt;
  const before = await Promise.all([a, b, home].map(stamp));
  await Bun.sleep(5);
  await updateAll();

  const after = await Promise.all([a, b, home].map(stamp));
  ok(after.every((t, i) => t > before[i]!), `update --all skipped a target: ${before.join()} → ${after.join()}`);
});

await check('global parts install into the home dir and come back out', async () => {
  const home = process.env.HOME!;
  await install(home, true);
  const manifest = await readManifest(home);
  ok(Object.keys(manifest!.parts).sort().join() === 'commit,explain,hook-safe-bash,permissions,research',
    `the home manifest holds ${Object.keys(manifest?.parts ?? {}).join()}`);
  ok(await exists(path.join(home, '.claude/skills/commit/skill.md')), 'no commit skill under the home dir');

  const settings = (await Bun.file(path.join(home, '.claude/settings.json')).json()) as Record<string, any>;
  ok(JSON.stringify(settings.hooks).includes('$HOME/.claude/scripts/safe-bash.sh'), '${root} did not resolve to $HOME');
  ok(Array.isArray(settings.permissions?.allow), 'the allow list and the hooks are not in the one file');
  ok(!(await exists(path.join(home, '.claude/settings.local.json'))), 'a settings.local.json at user level');
  ok((await scanProject(home)).every((s) => s.part.scope === 'global' && s.status === 'installed'), 'status --global reads them back wrong');
  ok(!(await loadProjects()).includes(home), 'the home dir landed in the projects list');

  // A project still holding one of them is what `update` is for; until it runs, no global install.
  const project = await repo('holder');
  await install(project, false, ['mission']);
  const held = (await readManifest(project))!;
  held.parts.commit = { files: [], hashes: {} };
  await writeManifest(project, held);
  const clash = await install(home, true).then(() => null, (e: Error) => e);
  ok(clash?.message === `commit is installed in ${project} — run factory update on each first`, `no collision refusal: ${clash?.message ?? 'none'}`);
  const wrongScope = await install(project, false, ['commit']).then(() => null, (e: Error) => e);
  ok(wrongScope?.message === 'commit is a global part — factory install --global', `no scope refusal: ${wrongScope?.message ?? 'none'}`);

  await update(project);
  ok(!(await readManifest(project))?.parts.commit, 'update kept a part whose scope moved');
  await install(home, true);

  // `update --global` refreshes the home dir without ever reaching for a project part.
  await update(home);
  ok(Object.keys((await readManifest(home))!.parts).length === 5, 'update --global changed the home manifest');

  await uninstall(home, true);
  ok(!(await exists(path.join(home, '.claude'))), 'uninstall left the home .claude behind');
});

// ── scope per part ───────────────────────────────────────────────────────────

const CONFIG = path.join(process.env.HOME!, '.factory', 'config.yaml');
const BASE_CONFIG = 'vars:\n  codegraph: codegraph\n';

/** The config is cached and every scope resolves through it: a case that writes one drops the
 *  cache and puts the file back, or every case after it reads the override too. */
async function withConfig(text: string, fn: () => Promise<void>): Promise<void> {
  await writeFile(CONFIG, text);
  resetConfig();
  try {
    await fn();
  } finally {
    await writeFile(CONFIG, BASE_CONFIG);
    resetConfig();
  }
}

await check('an override wins over part.yaml, and off is in no scope at all', async () => {
  const home = process.env.HOME!;
  const dir = await repo('scope');
  await withConfig(`${BASE_CONFIG}parts:\n  commit: "project"\n  research: "off"\n`, async () => {
    const parts = await loadParts();
    const commit = parts.find((p) => p.name === 'commit');
    ok(commit?.scope === 'project' && commit.recommended === 'global',
      `commit resolved ${commit?.scope}, recommending ${commit?.recommended}`);
    ok(!parts.some((p) => p.name === 'research'), 'an off part is still in the registry');

    const inProject = (await scanProject(dir)).map((s) => s.part.name);
    const inHome = (await scanProject(home)).map((s) => s.part.name);
    ok(inProject.includes('commit') && !inHome.includes('commit'), 'commit did not move to the project scan');
    ok(!inProject.includes('research') && !inHome.includes('research'), 'an off part is in a scan');
  });
  ok((await loadParts()).find((p) => p.name === 'commit')?.scope === 'global', 'the override outlived its config');
});

await check('a snippet or recipes keeps a part out of global, whatever the config says', async () => {
  await withConfig(`${BASE_CONFIG}parts:\n  code-format: "global"\n  codegraph: "global"\n`, async () => {
    const parts = await loadParts();
    const snippet = parts.find((p) => p.name === 'code-format');
    ok(snippet?.scope === 'project' && snippet.recommended === 'project', `code-format resolved ${snippet?.scope}`);
    ok(parts.find((p) => p.name === 'codegraph')?.scope === 'project', 'a part with recipes took the override');

    const ignored = await ignoredScopes();
    ok(ignored.includes('code-format') && ignored.includes('codegraph'), `ignoredScopes read ${ignored.join(', ')}`);
    const said = await printed(() => status(main));
    ok(said.includes('ignored for code-format, codegraph'), `status never named the ignored override:\n${said}`);

    const { newUi } = await import('../src/tui/panes/pane.js');
    const { nextScope } = await import('../src/tui/panes/parts.js');
    const row = { name: 'code-format', type: 'fixture', description: '', status: 'not-installed' as const,
      scope: 'project' as const, recommended: 'project' as const, projectOnly: true, files: [] };
    ok(nextScope(row, newUi()) === 'off', 'Space offered global to a part that cannot take it');
  });
});

await check('update drops a part the config turned off', async () => {
  const home = process.env.HOME!;
  await install(home, false, ['research']);
  const skill = path.join(home, '.claude/skills/research/skill.md');
  ok(await exists(skill), 'research never reached the home dir');

  await withConfig(`${BASE_CONFIG}parts:\n  research: "off"\n`, async () => {
    await update(home);
    ok(!(await readManifest(home))?.parts.research, 'the manifest kept an off part');
    ok(!(await exists(skill)), 'an off part was left on disk');
  });
});

await check('install --parts refuses a part that is off or lives in the other scope', async () => {
  const dir = await repo('refuse');
  const elsewhere = await install(dir, false, ['commit']).then(() => null, (e: Error) => e);
  ok(elsewhere?.message === 'commit is a global part — factory install --global', `no scope refusal: ${elsewhere?.message ?? 'none'}`);

  await withConfig(`${BASE_CONFIG}parts:\n  research: "off"\n`, async () => {
    const off = await install(dir, false, ['research']).then(() => null, (e: Error) => e);
    ok(off?.message === 'research is off in ~/.factory/config.yaml', `no off refusal: ${off?.message ?? 'none'}`);
  });
});

await check('writePartScope rewrites one line and leaves the rest of the config byte for byte', async () => {
  const kept = 'caffeinate: "on"\nvars:\n  codegraph: codegraph\n';
  await withConfig(kept, async () => {
    await writePartScope('commit', 'project');
    await writePartScope('commit', 'off');
    await writePartScope('research', 'global');

    const text = await Bun.file(CONFIG).text();
    ok(text.startsWith(kept), `the rewrite moved what was already there: ${JSON.stringify(text)}`);
    ok(text.endsWith('parts:\n  commit: "off"\n  research: "global"\n'), `the block reads ${JSON.stringify(text)}`);

    resetConfig();
    const parts = (await loadConfig()).parts;
    ok(parts?.commit === 'off' && parts.research === 'global', `the choices read back as ${JSON.stringify(parts)}`);
  });
});

await check('writePartScope makes a block out of a flow-style parts line and keeps the rest', async () => {
  const kept = 'caffeinate: "on"\n';
  await withConfig(`${kept}parts: {commit: project}\n`, async () => {
    await writePartScope('research', 'off');

    const text = await Bun.file(CONFIG).text();
    ok(text === `${kept}parts:\n  commit: "project"\n  research: "off"\n`, `the flow block became ${JSON.stringify(text)}`);

    resetConfig();
    const parts = (await loadConfig()).parts;
    ok(parts?.commit === 'project' && parts.research === 'off', `the choices read back as ${JSON.stringify(parts)}`);
  });
});

await check('a config YAML cannot read is no config at all, and says so once', async () => {
  await withConfig('parts: {commit: project\nvars:\n  a: b\n', async () => {
    const said = await printed(async () => {
      ok(Object.keys(await loadConfig()).length === 0, 'a config that does not parse resolved to something');
      resetConfig();
      await loadConfig();
    });
    ok(said.includes(CONFIG), `the parse error never named the file: ${said}`);
    ok(said.split(CONFIG).length === 2, `the same broken config was named twice: ${said}`);
  });
});

await check('applyScopes moves a part, updates the project that held it and names both', async () => {
  const { applyScopes } = await import('../src/tui/actions.js');
  const home = process.env.HOME!;
  const dir = await repo('mover');
  await install(dir, false, ['browse']);
  ok(await exists(path.join(dir, '.claude/skills/browse/skill.md')), 'browse never reached the project');

  try {
    const said = await applyScopes([{ name: 'browse', choice: 'global' }]);
    ok((await loadConfig()).parts?.browse === 'global', 'the choice never reached the config');
    ok(!(await readManifest(dir))?.parts.browse, 'the project kept a part that went global');
    ok(await exists(path.join(home, '.claude/skills/browse/skill.md')), 'browse never reached the home dir');
    ok(said.includes('mover −browse') && said.includes('~/.claude +browse') && !said.includes('updated'), `the toast said ${JSON.stringify(said)}`);
  } finally {
    await writeFile(CONFIG, BASE_CONFIG);
    resetConfig();
    await update(home);
  }
});

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
  ok(!(await exists(path.join(main, '.claude/skills/mission/skill.md'))), 'a skill was left behind');
  ok(!(await exists(path.join(main, '.claude/.factory-manifest.json'))), 'the manifest was left behind');
  ok(!(await exists(path.join(main, '.mcp.json'))), 'an empty .mcp.json was left behind');
});

await rm(TMP, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
