#!/usr/bin/env bun
/**
 * Fires SubagentStop inputs at hook-factory the way Claude Code does, and lists what landed in
 * the mission's handoffs/. Checks the "never overwrite evidence" invariant end to end.
 *
 *   HOME=<scratch> bun /opt/ed/ivy/.factory/validator/handoff.ts <missionDir> <lines>...
 *
 * Each <lines> is the line count of one sub-agent final message (agent W1, W2, … in order).
 * Binding goes through FACTORY_MISSION, so no claim or session is needed.
 */
import path from 'node:path';
import { readdir, mkdir } from 'node:fs/promises';

const HOOK = '/opt/ed/ivy/parts/hook-factory/hook-factory.ts';
const mission = process.argv[2];
if (!mission) throw new Error('usage: handoff.ts <missionDir> <lines>...');
const counts = process.argv.slice(3).map(Number);

const tmp = path.join(process.env.HOME!, 'transcripts');
await mkdir(tmp, { recursive: true });

for (const [i, n] of counts.entries()) {
   const tag = `W${i + 1}`;
   const body = Array.from({ length: n }, (_, k) => `${tag} line ${k + 1}`).join('\n');
   const transcript = path.join(tmp, `${tag}.jsonl`);
   await Bun.write(transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: body }] } })}\n`);
   const input = {
      session_id: 'dddddddd-1111-2222-3333-444444444444',
      cwd: path.dirname(mission),
      hook_event_name: 'SubagentStop',
      agent_type: 'Worker',
      agent_transcript_path: transcript,
      last_assistant_message: body,
   };
   const p = Bun.spawnSync(['bun', HOOK, 'SubagentStop'], {
      env: { ...process.env, FACTORY_MISSION: mission },
      stdin: Buffer.from(JSON.stringify(input)),
   });
   console.log(`${tag} ${n} lines → hook exit ${p.exitCode} ${p.stderr.toString().trim()}`);
}

const dir = path.join(mission, 'handoffs');
for (const f of (await readdir(dir).catch(() => [])).sort()) {
   const text = await Bun.file(path.join(dir, f)).text();
   console.log(`  ${f}  ${text.trim().split('\n').length} lines  first=${JSON.stringify(text.split('\n')[0])}`);
}
