#!/usr/bin/env bun
/**
 * Factory event hook. Run as `bun hook-factory.ts <event>`, hook JSON on stdin.
 *
 * Appends one line to ~/.factory/events/<session>.jsonl, binds an unclaimed mission to the session
 * that shows up, keeps the Mac awake as ~/.factory/config.yaml says to, rings when the
 * session is waiting on the human, injects mission focus before a compaction, saves a sub-agent's
 * final message as the step handoff, files the decisions that message carries, and tells the
 * Orchestrator which of them wait on the human.
 *
 * It never fails a hook: every step is guarded and the process always exits 0.
 */
import path from 'node:path';
import { homedir } from 'node:os';
import { appendFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';

const HOME = path.join(homedir(), '.factory');
const EVENTS = path.join(HOME, 'events');
const PIDS = path.join(HOME, 'caffeinate');
const CONFIG = path.join(HOME, 'config.yaml');

interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  source?: string;
  prompt?: string;
  message?: string;
  notification_type?: string;
  stop_hook_active?: boolean;
  trigger?: string;
  agent_type?: string;
  agent_transcript_path?: string;
  last_assistant_message?: string;
}

interface Bound {
  dir: string;
  name: string;
  step: string;
  session: string | null;
  round: number;
  autonomy: string;
  gates: Record<string, { status?: string; file?: string }>;
}

// Two lines of a wide ACTIVITY row: what the foot wraps a prompt to before it cuts.
const clip = (text: unknown, max = 320): string | null => {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  return line === '' ? null : line.length > max ? `${line.slice(0, max)}…` : line;
};

// ── mission binding ──────────────────────────────────────────────────────────

async function readMission(dir: string): Promise<Bound | null> {
  const state = await Bun.file(path.join(dir, 'state.json')).json().catch(() => null);
  if (!state) return null;
  const name = state.name ?? path.basename(dir).replace(/^\d{4}-\d{2}-\d{2}-/, '');
  return {
    dir, name, step: state.step ?? '', session: state.session ?? null,
    round: state.round ?? 0, autonomy: state.autonomy ?? 'partial', gates: state.gates ?? {},
  };
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

/** FACTORY_MISSION is set by `factory mission open`; the claim covers adopted sessions — and a
 *  session whose env still names a mission since archived, which then adopted the next one. */
async function bind(cwd: string, session: string): Promise<Bound | null> {
  const fromEnv = process.env.FACTORY_MISSION;
  const named = fromEnv ? await readMission(path.resolve(fromEnv)) : null;
  if (named) return named;

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

/**
 * The Claude process this hook runs under: a session the human started by hand carries no
 * `--session-id` in its argv, so its pid on the event line is the only handle `X` has on it. The
 * hook is a child of the shell Claude Code spawned, so walk up until the command is `claude`.
 */
async function claudePid(): Promise<number | null> {
  let pid = process.ppid;
  for (let hop = 0; hop < 6 && pid > 1; hop++) {
    const proc = Bun.spawn(['ps', '-o', 'ppid=,comm=', '-p', String(pid)], { stdout: 'pipe', stderr: 'ignore' });
    const [ppid, comm] = (await new Response(proc.stdout).text()).trim().split(/\s+/, 2);
    await proc.exited;
    if (!comm) return null;
    if (path.basename(comm) === 'claude') return pid;
    pid = Number(ppid);
  }
  return null;
}

const pidFile = (session: string): string => path.join(PIDS, `${session}.pid`);

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * `auto` holds the machine awake for the length of a turn, `on` from the session's first event
 * until something else lets go, `off` never. Read per event, so Mission Control's `c` lands on
 * the next hook without restarting anything.
 */
type Mode = 'auto' | 'on' | 'off';

async function caffeinateMode(): Promise<Mode> {
  const raw = await readFile(CONFIG, 'utf-8').catch(() => '');
  try {
    const value = raw === '' ? null : (Bun.YAML.parse(raw) as { caffeinate?: unknown } | null)?.caffeinate;
    return value === 'on' || value === 'off' ? value : 'auto';
  } catch {
    // A hand-broken config is no config, as `loadConfig` reads it: a parse throw here is swallowed
    // by main() and the machine silently stops being held awake.
    return 'auto';
  }
}

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

// ── sound ────────────────────────────────────────────────────────────────────

/** SOUND: `off` or empty is silence, a bare name is a macOS system sound, anything else a path. */
function soundFile(): string | null {
  const value = (process.env.SOUND ?? '').trim();
  if (value === '' || value === 'off') return null;
  return value.includes('/') ? value : `/System/Library/Sounds/${value}.aiff`;
}

/** Seconds since the session's last UserPromptSubmit; null when it has none on record. */
async function turnSeconds(session: string): Promise<number | null> {
  const text = await readFile(path.join(EVENTS, `${session}.jsonl`), 'utf-8').catch(() => '');
  let last: number | null = null;
  for (const line of text.split('\n')) {
    if (!line.includes('"UserPromptSubmit"')) continue;
    const at = Date.parse((JSON.parse(line) as { at?: string }).at ?? '');
    if (!Number.isNaN(at)) last = at;
  }
  return last === null ? null : (Date.now() - last) / 1000;
}

/**
 * The human is waited on at the end of a turn they walked away from, and at a permission prompt,
 * which blocks however short the turn was. A sub-agent finishing, or a turn the human sat through,
 * is not news.
 */
async function waitsOnHuman(event: string, input: HookInput, session: string): Promise<boolean> {
  if (event === 'Notification') return input.notification_type === 'permission_prompt';
  if (event !== 'Stop' || input.stop_hook_active === true) return false;

  const seconds = await turnSeconds(session);
  const quiet = Number(process.env.QUIET);
  return seconds !== null && seconds >= (Number.isNaN(quiet) ? 30 : quiet);
}

async function ring(event: string, input: HookInput, session: string): Promise<void> {
  const file = soundFile();
  if (file === null || !(await waitsOnHuman(event, input, session))) return;
  // The player outlives this hook and is never waited on: a hook that blocks blocks the session.
  Bun.spawn(['afplay', file], { stdio: ['ignore', 'ignore', 'ignore'] }).unref();
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

/** A handoff already written is evidence: it is never overwritten, the next free `-2`, `-3` takes it. */
async function freeName(dir: string, base: string): Promise<string> {
  for (let n = 1; ; n++) {
    const file = path.join(dir, n === 1 ? `${base}.md` : `${base}-${n}.md`);
    const existing = (await readFile(file, 'utf-8').catch(() => '')).trim();
    if (existing === '') return file;
  }
}

/** The sub-agent's last word, from the hook when it carries one, else from its transcript. */
async function finalText(input: HookInput): Promise<string> {
  const final = (input.last_assistant_message ?? '').trim();
  if (final !== '') return final;
  if (!input.agent_transcript_path) return '';
  return (await lastAssistantText(input.agent_transcript_path)).trim();
}

async function saveHandoff(mission: Bound, input: HookInput, text: string): Promise<void> {
  if (!input.agent_transcript_path) return;
  // A sign-off is not a handoff: the template alone runs longer than this.
  if (mission.step === '' || text.split('\n').length < 5) return;

  // Every agent gets its own file, so a Worker and a gatekeeper in one step never collide.
  const agent = (input.agent_type ?? '').trim().replace(/[^A-Za-z0-9_-]+/g, '-');
  const round = mission.round > 0 ? `-r${mission.round}` : '';
  const dir = path.join(mission.dir, 'handoffs');
  await mkdir(dir, { recursive: true });
  const file = await freeName(dir, `${mission.step}${agent === '' ? '' : `-${agent}`}${round}`);
  await writeFile(file, `${text}\n`);
}

// ── decisions ────────────────────────────────────────────────────────────────

/**
 * `decisions.md` is written here rather than through `factory`: a hook never fails, and a binary
 * missing from PATH would lose a decision silently. The format is the one `src/core/decision.ts`
 * reads back, so both writers append to the same table.
 */
const DECISIONS_HEADER = [
  '# Decisions',
  '',
  '| id | step | by | confidence | summary | status | note |',
  '|----|------|----|------------|---------|--------|------|',
].join('\n');

const CONFIDENCE = /^-\s*(HIGH|MEDIUM|LOW)\s*:\s*(.+)$/;

/** Rows are the lines whose first cell starts with `D`; everything else in the file is furniture. */
function decisionRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 6 && cells[0]!.startsWith('D')) rows.push(cells);
  }
  return rows;
}

/** The dial: `full` decides everything itself, `partial` hands over LOW, `none` hands over all. */
const waits = (autonomy: string, confidence: string): boolean =>
  autonomy === 'full' ? false : autonomy === 'none' ? true : confidence === 'LOW';

/** The handoff's `Decisions:` block: its lines until a blank one or the next `Word:` header. */
function parseDecisions(text: string): Array<{ confidence: string; summary: string }> {
  const found: Array<{ confidence: string; summary: string }> = [];
  let inside = false;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!inside) {
      inside = /^Decisions:/.test(line);
      continue;
    }
    if (line === '') break;
    const hit = CONFIDENCE.exec(line);
    if (hit) found.push({ confidence: hit[1]!, summary: hit[2]! });
    else if (/^[A-Za-z][A-Za-z ]*:/.test(line)) break;
  }
  return found;
}

/** Appends verbatim: rows already on disk are never reparsed into a rewrite. */
async function fileDecisions(mission: Bound, input: HookInput, text: string): Promise<void> {
  const found = parseDecisions(text);
  if (found.length === 0 || mission.step === '') return;

  const target = path.join(mission.dir, 'decisions.md');
  const existing = await readFile(target, 'utf-8').catch(() => '');
  const rows = decisionRows(existing);
  let number = rows.reduce((max, cells) => Math.max(max, Number(cells[0]!.slice(1)) || 0), 0) + 1;
  const by = ((input.agent_type ?? '').trim().toLowerCase() || 'agent').replace(/\s+/g, '-');

  const lines = found.map(({ confidence, summary }) => {
    const status = waits(mission.autonomy, confidence) ? 'waiting' : 'auto';
    const one = summary.replaceAll('|', '/').replace(/\s+/g, ' ').trim();
    return `| D${number++} | ${mission.step} | ${by} | ${confidence} | ${one} | ${status} |  |`;
  });

  const body = [DECISIONS_HEADER, ...rows.map((cells) => `| ${cells.join(' | ')} |`), ...lines].join('\n');
  const temp = path.join(mission.dir, `.decisions.md.${process.pid}`);
  await writeFile(temp, `${body}\n`);
  await rename(temp, target);
}

/** What the Orchestrator is told the moment a decision needs the human, or '' when none does. */
async function waitingText(mission: Bound): Promise<string> {
  const text = await readFile(path.join(mission.dir, 'decisions.md'), 'utf-8').catch(() => '');
  const waiting = decisionRows(text).filter((cells) => cells[5] === 'waiting');
  if (waiting.length === 0) return '';

  const list = waiting.map((cells) => `${cells[0]} ${cells[3]} ${cells[4]}`).join('; ');
  return `Decisions waiting on the human (autonomy ${mission.autonomy}): ${list}. Surface each in the chat, `
    + 'record with factory decision answer <id> accept|overrule --note N, then continue.';
}

// ── main ─────────────────────────────────────────────────────────────────────

/** Injected as context before a compaction, so the mission survives the summary. */
function focus(mission: Bound): string {
  const open = Object.entries(mission.gates).filter(([, g]) => g.status === 'open').map(([step]) => step);
  return [
    `Mission: ${mission.name}`,
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

  // A background sub-agent reports back as a prompt nobody typed: the bus names it what it is,
  // the agent's return, so the log never shows the human saying `<task-notification>`.
  const report = event === 'UserPromptSubmit' ? /<summary>Agent "([^"]*)" finished<\/summary>/.exec(input.prompt ?? '')?.[1] : undefined;

  // PostToolUse fires on every Agent result: logging it would drown the bus for one line of context.
  if (event !== 'PostToolUse') {
    await mkdir(EVENTS, { recursive: true });
    const line = {
      at: new Date().toISOString(),
      event: report === undefined ? event : 'SubagentReport',
      session,
      pid: await claudePid(),
      cwd,
      mission: mission?.name ?? null,
      step: mission?.step ?? null,
      detail: report ?? detailOf(event, input),
    };
    await appendFile(path.join(EVENTS, `${session}.jsonl`), `${JSON.stringify(line)}\n`);
  }

  // Sound is about the human at the keyboard, not about a mission: every session rings.
  await ring(event, input, session).catch(() => {});

  if (!mission) return;

  if (event === 'SessionStart' || event === 'UserPromptSubmit') await adoptSession(mission, session);
  if (event === 'PreCompact') console.log(focus(mission));
  if (event === 'SubagentStop') {
    const text = await finalText(input);
    await saveHandoff(mission, input, text);
    await fileDecisions(mission, input, text);
  }
  if (event === 'PostToolUse' || event === 'UserPromptSubmit') await inject(event, mission);

  const mode = await caffeinateMode();
  if (mode === 'off') return;
  if (event === (mode === 'on' ? 'SessionStart' : 'UserPromptSubmit')) await caffeinateStart(session);
  if (event === 'Stop' && mode === 'auto') await caffeinateStop(session);
}

/** UserPromptSubmit takes stdout as context; a tool hook has to name the field it fills. */
async function inject(event: string, mission: Bound): Promise<void> {
  const text = await waitingText(mission);
  if (text === '') return;
  console.log(event === 'UserPromptSubmit'
    ? text
    : JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

await main().catch(() => {});
