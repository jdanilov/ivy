#!/usr/bin/env bun
/**
 * The one real spawn: a scratch project with the Factory installed, a mission, and a headless
 * Claude Code session told to run one @Worker. The Worker's handoff carries a `Decisions:` block,
 * so `hook-factory` files a waiting decision and the `PostToolUse` hook injects it. Prints the
 * `additionalContext` the parent session received after the Agent tool result.
 *
 *   REAL_HOME=$HOME HOME=$(mktemp -d /private/tmp/vspawn.XXXXXX) bun scripts/spawn.ts
 *
 * Costs one real model run.
 */
import path from 'node:path';
import { homedir } from 'node:os';
import { readdir } from 'node:fs/promises';
import { makeRepo, run } from '../.factory/validator/repo.js';

const HOME = homedir();
const CLI = '/opt/ed/ivy/src/cli.ts';
const session = crypto.randomUUID();
const REAL = process.env.REAL_HOME!;
if (!REAL) throw new Error('set REAL_HOME: the session authenticates from the real config dir');

const repo = await makeRepo('spawn', true);

// Claude Code authenticates only from the real config dir — a scratch HOME, a copied .claude.json
// and CLAUDE_CONFIG_DIR all read "Not logged in". So the session runs with the real HOME and the
// hook is handed the scratch one in its own command line: every Factory write stays sandboxed and
// the only real-home artefact is the transcript, which is what this assertion reads.
const settingsPath = path.join(repo, '.claude', 'settings.local.json');
const settings = JSON.parse(await Bun.file(settingsPath).text());
for (const group of Object.values(settings.hooks ?? {}) as any[]) {
  for (const entry of group) for (const h of entry.hooks ?? []) h.command = `HOME=${HOME} ${h.command}`;
}
await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
const made = run(['bun', CLI, 'mission', 'new', 'dec', '--workflow', 'chore', '--no-open'], repo);
if (made.code !== 0) throw new Error(made.out);
const dir = (await readdir(path.join(repo, '.factory', 'missions'))).find((d) => d.endsWith('-dec'))!;
const mission = path.join(repo, '.factory', 'missions', dir);
console.log(`mission ${mission}\nsession ${session}`);

const prompt = [
  'Spawn exactly one Worker sub-agent with the Agent tool. Give it this task, verbatim:',
  '"Append the line `harness ok` to README.md in this repo. Nothing else.',
  'Your final message must be the handoff template, and it must include a Decisions block:',
  'Decisions:',
  '- LOW: Appended at the end of README.md rather than under a heading, no heading fits one line"',
  '',
  'When the Agent tool returns, reply with the text of any additional context you were handed',
  'alongside its result, verbatim, and nothing else. Do not spawn a second agent.',
].join('\n');

const p = Bun.spawnSync([
  'claude', '-p', prompt,
  '--session-id', session,
  '--model', 'sonnet',
  '--permission-mode', 'bypassPermissions',
], { cwd: repo, env: { ...process.env, HOME: REAL, FACTORY_MISSION: mission }, stdin: 'ignore' });

console.log(`\n=== claude exit ${p.exitCode} ===\n${p.stdout.toString()}\n--- stderr ---\n${p.stderr.toString().slice(0, 2000)}`);

// Claude Code mangles both separators and dots out of the cwd for the project folder name.
const projects = path.join(REAL, '.claude', 'projects', repo.replaceAll(/[/.]/g, '-'));
const file = path.join(projects, `${session}.jsonl`);
console.log(`\n=== transcript ${file} ===`);
const text = await Bun.file(file).text().catch(() => '');
for (const line of text.split('\n').filter(Boolean)) {
  const rec = JSON.parse(line);
  // The injection lands as an `attachment`, not a message block: one `hook_success` record holding
  // the hook's stdout, then a `hook_additional_context` one rendered into a <system-reminder>.
  if (rec.type === 'attachment') {
    const a = rec.attachment;
    if (a?.hookEvent === 'PostToolUse') console.log(`\n[attachment ${a.type}] tool ${a.toolUseID}\n${JSON.stringify(a.type === 'hook_additional_context' ? rec.rendered : a.stdout, null, 1)}`);
    continue;
  }
  const blocks = rec.message?.content;
  if (!Array.isArray(blocks) || rec.isSidechain) continue;
  for (const b of blocks) {
    if (b.type === 'tool_use') console.log(`\n[${rec.type} tool_use ${b.name}] ${JSON.stringify(b.input).slice(0, 200)}`);
    if (b.type === 'tool_result') console.log(`\n[${rec.type} tool_result] ${JSON.stringify(b.content).slice(0, 300)}`);
    if (b.type === 'text') console.log(`\n[${rec.type} text] ${b.text.slice(0, 800)}`);
  }
}
console.log(`\n=== ${mission}/decisions.md ===\n${await Bun.file(path.join(mission, 'decisions.md')).text().catch(() => '(none)')}`);
