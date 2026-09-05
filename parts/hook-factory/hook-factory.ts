#!/usr/bin/env bun
/**
 * Factory event hook. Run as `bun hook-factory.ts <event>`, hook JSON on stdin.
 *
 * Appends one line to ~/.factory/events/<session>.jsonl, binds an unclaimed mission to the session
 * that shows up, keeps the Mac awake while a mission-bound session is mid-turn, injects mission
 * focus before a compaction, and saves a sub-agent's final message as the step handoff.
 *
 * It never fails a hook: every step is guarded and the process always exits 0.
 */
import path from 'node:path';
import { homedir } from 'node:os';
import { appendFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';

const HOME = path.join(homedir(), '.factory');
const EVENTS = path.join(HOME, 'events');
const PIDS = path.join(HOME, 'caffeinate');

interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  source?: string;
  prompt?: string;
  message?: string;
  notification_type?: string;
  trigger?: string;
  agent_type?: string;
  agent_transcript_path?: string;
  last_assistant_message?: string;
}

interface Bound {
  dir: string;
  name: string;
  title: string;
  step: string;
  session: string | null;
  round: number;
  gates: Record<string, { status?: string; file?: string }>;
}

const clip = (text: unknown, max = 160): string | null => {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  return line === '' ? null : line.length > max ? `${line.slice(0, max)}…` : line;
};

// ── mission binding ──────────────────────────────────────────────────────────

async function readMission(dir: string): Promise<Bound | null> {
  const state = await Bun.file(path.join(dir, 'state.json')).json().catch(() => null);
  if (!state) return null;
  const name = state.name ?? path.basename(dir).replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return { dir, name, title: state.title ?? name, step: state.step ?? '', session: state.session ?? null, round: state.round ?? 0, gates: state.gates ?? {} };
}

/** Walk up from the session's cwd looking for the checkout that holds `.factory/`. */
async function findFactoryDir(from: string): Promise<string | null> {
  let dir = path.resolve(from);
  for (;;) {
    if (await Bun.file(path.join(dir, '.factory', 'claim')).exists()) return path.join(dir, '.factory');
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** FACTORY_MISSION is set by `factory mission open`; the claim covers adopted sessions. */
async function bind(cwd: string, session: string): Promise<Bound | null> {
  const fromEnv = process.env.FACTORY_MISSION;
  if (fromEnv) return readMission(path.resolve(fromEnv));

  const factory = await findFactoryDir(cwd);
  if (!factory) return null;

  const claim = await Bun.file(path.join(factory, 'claim')).json().catch(() => null);
  if (!claim) return null;

  const missions = path.join(factory, 'missions');
  for (const entry of await readdir(missions).catch(() => [])) {
    const found = await readMission(path.join(missions, entry));
    if (!found || found.name !== claim.mission) continue;
    // Ours when the claim or the state names this session, and a mission nobody holds binds to it.
    return claim.session === session || found.session === session || found.session === null ? found : null;
  }
  return null;
}

/** A mission opened without a tab of its own has no session: the first event of one adopts it. */
async function adoptSession(mission: Bound, session: string): Promise<void> {
  if (mission.session !== null || session === 'unknown') return;

  const target = path.join(mission.dir, 'state.json');
  const state = await Bun.file(target).json().catch(() => null);
  if (!state || state.session != null) return;

  state.session = session;
  state.updated = new Date().toISOString();
  const temp = path.join(mission.dir, `.state.json.${process.pid}`);
  await Bun.write(temp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temp, target);
  mission.session = session;
}

// ── caffeinate ───────────────────────────────────────────────────────────────

const pidFile = (session: string): string => path.join(PIDS, `${session}.pid`);

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function caffeinateStart(session: string): Promise<void> {
  const file = pidFile(session);
  const running = Number(await readFile(file, 'utf-8').catch(() => ''));
  if (running > 0 && alive(running)) return;

  // nohup detaches the process from this short-lived hook, so it outlives the script.
  const proc = Bun.spawn(['/bin/sh', '-c', 'nohup caffeinate -dims >/dev/null 2>&1 & printf %s "$!"'], { stdout: 'pipe', stderr: 'ignore' });
  const pid = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  if (pid === '') return;

  await mkdir(PIDS, { recursive: true });
  await writeFile(file, pid);
}

async function caffeinateStop(session: string): Promise<void> {
  const file = pidFile(session);
  const pid = Number(await readFile(file, 'utf-8').catch(() => ''));
  if (pid > 0 && alive(pid)) process.kill(pid);
  await unlink(file).catch(() => {});
}

// ── handoffs ─────────────────────────────────────────────────────────────────

/** Last assistant text of a sub-agent transcript, used when the hook carries no final message. */
async function lastAssistantText(transcript: string): Promise<string> {
  const text = await readFile(transcript, 'utf-8').catch(() => '');
  let out = '';
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const entry = JSON.parse(line) as { type?: string; message?: { role?: string; content?: unknown } };
    if (entry.type !== 'assistant' && entry.message?.role !== 'assistant') continue;
    const content = entry.message?.content;
    const parts = Array.isArray(content)
      ? content.filter((c): c is { type: string; text: string } => (c as { type?: string }).type === 'text').map((c) => c.text)
      : [String(content ?? '')];
    if (parts.join('').trim() !== '') out = parts.join('\n');
  }
  return out;
}

/** A handoff is never traded for a shorter one: the next free `-2`, `-3` name takes it instead. */
async function freeName(dir: string, base: string, text: string): Promise<string> {
  for (let n = 1; ; n++) {
    const file = path.join(dir, n === 1 ? `${base}.md` : `${base}-${n}.md`);
    const existing = (await readFile(file, 'utf-8').catch(() => '')).trim();
    if (existing.length <= text.length) return file;
  }
}

async function saveHandoff(mission: Bound, input: HookInput): Promise<string | null> {
  if (!input.agent_transcript_path) return null;
  const final = (input.last_assistant_message ?? '').trim();
  const text = final !== '' ? final : (await lastAssistantText(input.agent_transcript_path)).trim();
  // A sign-off is not a handoff: the template alone runs longer than this.
  if (mission.step === '' || text.split('\n').length < 5) return null;

  // Every agent gets its own file, so a Worker and a gatekeeper in one step never collide.
  const agent = (input.agent_type ?? '').trim().replace(/[^A-Za-z0-9_-]+/g, '-');
  const round = mission.round > 0 ? `-r${mission.round}` : '';
  const dir = path.join(mission.dir, 'handoffs');
  await mkdir(dir, { recursive: true });
  const file = await freeName(dir, `${mission.step}${agent === '' ? '' : `-${agent}`}${round}`, text);
  await writeFile(file, `${text}\n`);
  return file;
}

// ── main ─────────────────────────────────────────────────────────────────────

/** Injected as context before a compaction, so the mission survives the summary. */
function focus(mission: Bound): string {
  const open = Object.entries(mission.gates).filter(([, g]) => g.status === 'open').map(([step]) => step);
  return [
    `Mission: ${mission.title}`,
    `Step: ${mission.step || '—'}${mission.round > 0 ? ` r${mission.round}` : ''}`,
    `Open gates: ${open.length > 0 ? open.join(', ') : 'none'}`,
    `Folder: ${mission.dir}`,
  ].join('\n');
}

function detailOf(event: string, input: HookInput): string | null {
  switch (event) {
    case 'SessionStart':
      return clip(input.source);
    case 'UserPromptSubmit':
      return clip(input.prompt);
    case 'Stop':
      return clip(input.last_assistant_message);
    case 'SubagentStart':
    case 'SubagentStop':
      return clip(input.agent_type);
    case 'Notification':
      return clip(input.notification_type ? `${input.notification_type}: ${input.message ?? ''}` : input.message);
    case 'PreCompact':
      return clip(input.trigger);
    default:
      return null;
  }
}

async function main(): Promise<void> {
  const raw = await Bun.stdin.text().catch(() => '');
  const input = (raw.trim() === '' ? {} : JSON.parse(raw)) as HookInput;

  const event = process.argv[2] ?? input.hook_event_name ?? 'Unknown';
  const session = input.session_id ?? 'unknown';
  const cwd = input.cwd ?? process.cwd();
  const mission = await bind(cwd, session).catch(() => null);

  await mkdir(EVENTS, { recursive: true });
  const line = {
    at: new Date().toISOString(),
    event,
    session,
    cwd,
    mission: mission?.name ?? null,
    step: mission?.step ?? null,
    detail: detailOf(event, input),
  };
  await appendFile(path.join(EVENTS, `${session}.jsonl`), `${JSON.stringify(line)}\n`);

  if (!mission) return;

  if (event === 'SessionStart' || event === 'UserPromptSubmit') await adoptSession(mission, session);
  if (event === 'PreCompact') console.log(focus(mission));
  if (event === 'UserPromptSubmit') await caffeinateStart(session);
  if (event === 'Stop') await caffeinateStop(session);
  if (event === 'SubagentStop') await saveHandoff(mission, input);
}

await main().catch(() => {});
