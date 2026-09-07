#!/usr/bin/env bun
// The e2e walk in one process: the commands and core functions imported, not spawned. One line per
// case, non-zero when any of them fails. `scripts/e2e.sh` stays as the black-box check.
import path from 'node:path';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// The scratch HOME lands before any module that reads it loads. `$TMPDIR` is honoured, so a caller
// with a slow temp folder can point the whole run somewhere small. Resolved, because macOS hands
// back a symlink and the linker builds relative symlink targets a logical path leaves dangling.
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
// the bare command keeps the codegraph case off the network.
await writeFile(path.join(process.env.HOME, '.factory', 'config.yaml'), 'vars:\n  codegraph: codegraph\n');

const { install } = await import('../src/commands/install.js');
const { scanProject } = await import('../src/core/scanner.js');
const { update } = await import('../src/commands/update.js');
const { uninstall } = await import('../src/commands/uninstall.js');
const { step } = await import('../src/commands/step.js');
const { gate } = await import('../src/commands/gate.js');
const { decision } = await import('../src/commands/decision.js');
const { answerDecision, readDecisions, waits } = await import('../src/core/decision.js');
const { mission } = await import('../src/commands/mission.js');
const { archiveMission, closeMission, createMission, currentBranch, ensureIgnored, git, listArchived, listMissions, missionWorkflow, promoteMission, resolveMission, writeState } = await import('../src/core/mission.js');
const { dropCreated, removeSnippet, writeSnippet } = await import('../src/core/linker.js');
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

await check('install --yes links, snippets and records every source', async () => {
  await install(main, true);
  ok(await exists(path.join(main, '.claude/skills/mission/skill.md')), 'no mission skill');
  ok((await Bun.file(path.join(main, 'AGENTS.md')).text()).includes('@.claude/docs-format.md'), 'no snippet');
  const manifest = await readManifest(main);
  ok(manifest?.parts.mission?.sources?.['.claude/skills/mission/skill.md'] === 'parts/mission/skill.md', 'no source recorded');
  ok(!manifest?.parts.commit, 'a global part landed in a project');
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

await check('a session asks with its last Stop, and only a prompt clears it', async () => {
  const { transcriptPath } = await import('../src/tui/transcript.js');
  const { buildSnapshot } = await import('../src/tui/live.js');
  const dir = await repo('asks');
  const session = 'Q';
  const at = (back: number): string => new Date(Date.now() - back * 60_000).toISOString();

  // The shape H-7 came off: a skill preamble is a user record, and it is the last text on file.
  const file = transcriptPath(dir, session);
  await mkdir(path.dirname(file), { recursive: true });
  const said = (type: string, text: string, back: number): string =>
    `${JSON.stringify({ type, timestamp: at(back), message: { id: `${type}${back}`, content: [{ type: 'text', text }] } })}\n`;
  await writeFile(file, said('assistant', 'An earlier turn', 30) + said('user', 'Base directory for this skill', 20));

  const events = path.join(process.env.HOME!, '.factory', 'events', `${session}.jsonl`);
  await mkdir(path.dirname(events), { recursive: true });
  const logged = (event: string, detail: string | null, back: number): string =>
    `${JSON.stringify({ at: at(back), event, session, cwd: dir, mission: null, step: null, detail })}\n`;
  await writeFile(events, logged('Stop', 'An earlier turn', 8) + logged('UserPromptSubmit', 'carry on', 6)
    + logged('Stop', 'Reply sent, thread labeled DONE', 2));

  const asks = async (): Promise<string[]> =>
    (await buildSnapshot()).inbox.filter((i) => i.kind === 'question' && i.project === 'asks').map((i) => i.text ?? '');
  ok((await asks()).join() === 'Reply sent, thread labeled DONE', `asks reads ${(await asks()).join() || 'nothing'}`);

  // An idle notification is the same question asked again, not a second one.
  await writeFile(events, logged('Notification', 'idle_prompt: waiting for your input', 1), { flag: 'a' });
  ok((await asks()).join() === 'Reply sent, thread labeled DONE', 'an idle notification changed the question');

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

await check('a step the mission looped back to counts its runs', async () => {
  const dir = await repo('runs');
  await mission('new', ['t'], { workflow: 'fix', 'no-open': true }, dir);
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
});

await check('the Factory\'s own files are ignored, once and committed', async () => {
  const dir = await repo('ignore');
  const file = path.join(dir, '.gitignore');
  ok((await Bun.file(file).text()) === '.factory/claim\n.factory/missions/\n.factory/archive/\n',
    `the ignore file reads ${JSON.stringify(await Bun.file(file).text())}`);
  ok((await git(dir, 'status', '--porcelain')) === '', 'the lines were left uncommitted on a clean tree');
  ok((await ensureIgnored(dir)) === null, 'a second call wrote the lines again');
});

await check('open refuses a mission a session is already bound to', async () => {
  const dir = await repo('bound');
  await mission('new', ['b1'], { 'no-open': true }, dir);
  const m = await resolveMission(dir, 'b1');
  m.state.session = 'S-1';
  await writeState(m.dir, m.state);

  const refused = await mission('open', ['b1'], {}, dir).then(() => null, (e: Error) => e);
  ok(refused?.message === 'mission b1 is bound to session S-1 — factory mission adopt b1 --session <id> to rebind',
    `open rebound it: ${refused?.message ?? 'no refusal'}`);
  ok((await resolveMission(dir, 'b1')).state.session === 'S-1', 'the refusal still rewrote the session');
  // resume is the way back into a mission whose tab is gone, and it never touches the binding.
  await mission('resume', ['b1'], {}, dir);
  ok((await resolveMission(dir, 'b1')).state.session === 'S-1', 'resume rebound the mission');
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

  // `update --global` relinks the home dir without ever reaching for a project part.
  await update(home);
  ok(Object.keys((await readManifest(home))!.parts).length === 5, 'update --global changed the home manifest');

  await uninstall(home, true);
  ok(!(await exists(path.join(home, '.claude'))), 'uninstall left the home .claude behind');
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
