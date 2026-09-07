#!/usr/bin/env bun
/**
 * `hook-factory`'s decision paths, fired as a child exactly as Claude Code fires them: JSON on
 * stdin, the mission bound through `FACTORY_MISSION`, no claim and no session needed.
 *
 * With a mission folder it is a driver, printing exit code and stdout verbatim — stdout is what
 * would reach the model. With no arguments it builds its own scratch mission, walks a sub-agent
 * handoff through to the injection and exits 1 when the round trip does not hold.
 *
 *   bun scripts/hook-inject.ts                                  # self-check under a scratch HOME
 *   HOME=<scratch> bun scripts/hook-inject.ts <missionDir> subagent "<final text>"
 *   HOME=<scratch> bun scripts/hook-inject.ts <missionDir> post|prompt
 */
import path from 'node:path';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const HOOK = path.join(import.meta.dir, '..', 'parts', 'hook-factory', 'hook-factory.ts');
const EVENT: Record<string, string> = { subagent: 'SubagentStop', post: 'PostToolUse', prompt: 'UserPromptSubmit' };
const SESSION = 'eeeeeeee-1111-2222-3333-444444444444';

interface Fired { code: number; out: string; err: string }

async function fire(mission: string, kind: string, text = ''): Promise<Fired> {
  const event = EVENT[kind];
  if (!event) throw new Error(`hook-inject.ts <missionDir> subagent|post|prompt [text]`);
  // .../.factory/missions/<x> → the repo the hook resolves the mission from.
  const cwd = path.dirname(path.dirname(path.dirname(mission)));
  const input: Record<string, unknown> = { session_id: SESSION, cwd, hook_event_name: event };

  if (kind === 'subagent') {
    const file = path.join(mission, 'agent.jsonl');
    await writeFile(file, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`);
    Object.assign(input, { agent_type: 'Worker', agent_transcript_path: file, last_assistant_message: text });
  }
  if (kind === 'post') Object.assign(input, { tool_name: 'Agent' });
  if (kind === 'prompt') Object.assign(input, { prompt: 'carry on' });

  const p = Bun.spawnSync(['bun', HOOK, event], {
    env: { ...process.env, FACTORY_MISSION: mission },
    stdin: Buffer.from(JSON.stringify(input)),
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString().trim() };
}

const [mission, kind, text] = process.argv.slice(2);

if (mission && kind) {
  const fired = await fire(mission, kind, text ?? '');
  console.log(`exit=${fired.code}`);
  console.log(`stdout>${fired.out}<`);
  if (fired.err !== '') console.log(`stderr> ${fired.err}`);
  process.exit(fired.code === 0 ? 0 : 1);
}

// ── self-check: a scratch mission, a handoff, the injection it earns ──────────

const TMP = await realpath(await mkdtemp(path.join(tmpdir(), 'hook-inject-')));
process.env.HOME = path.join(TMP, 'home');
// The hook holds the Mac awake on a prompt under the default `auto`; a check has no business
// leaving a caffeinate behind it.
await mkdir(path.join(process.env.HOME, '.factory'), { recursive: true });
await writeFile(path.join(process.env.HOME, '.factory', 'config.yaml'), 'caffeinate: off\n');

const { createMission, git } = await import('../src/core/mission.js');
const { readDecisions } = await import('../src/core/decision.js');
const { saveProject } = await import('../src/core/projects.js');

const repo = path.join(TMP, 'repo');
await mkdir(repo, { recursive: true });
await git(repo, 'init', '-q', '-b', 'main');
for (const [k, v] of [['user.email', 'hook@factory.local'], ['user.name', 'hook']]) await git(repo, 'config', k!, v!);
await writeFile(path.join(repo, 'README.md'), '# hook-inject\n');
await git(repo, 'add', '-A');
await git(repo, 'commit', '-qm', 'init');
await saveProject(repo);

const m = await createMission(repo, { name: 'inject', workflow: 'chore', autonomy: 'partial', worktree: false, stub: false });
const handoff = ['Step: implement', 'Done: the work', 'Acceptance: A-1 pass', 'Decisions:',
  '- LOW: Do not implement auth here, KISS and YAGNI'].join('\n');

let broken = 0;
const ok = (cond: unknown, said: string): void => {
  if (!cond) { broken++; console.log(`✗ ${said}`); }
};

const filed = await fire(m.dir, 'subagent', handoff);
ok(filed.code === 0, `SubagentStop exited ${filed.code}: ${filed.err}`);
const rows = await readDecisions(m.dir);
ok(rows.length === 1 && rows[0]!.status === 'waiting', `decisions.md holds ${rows.map((d) => `${d.id}:${d.status}`).join() || 'nothing'}`);

const post = await fire(m.dir, 'post');
ok(post.out.includes('additionalContext') && post.out.includes('D1 LOW'), `PostToolUse injected >${post.out}<`);
const prompt = await fire(m.dir, 'prompt');
ok(prompt.out.startsWith('Decisions waiting on the human'), `UserPromptSubmit injected >${prompt.out}<`);

if (broken > 0) {
  console.log(`✗ hook-inject: ${broken} check(s) failed under ${TMP}`);
  process.exit(1);
}
console.log('✓ hook-inject: a handoff files its decision and every injection names it');
