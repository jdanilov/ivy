import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import type { Activity } from './model.js';
import { home } from '../core/projects.js';

/**
 * Claude Code's live transcript, one JSON object per line. The screen reads the tail only: a byte
 * offset per file, never a line twice, and a first read of a long file starts near its end — a
 * mission's transcript reaches ten megabytes and none of it older than the last rows is on screen.
 */

/** `~/.claude/projects/<cwd with every / turned into ->/<session>.jsonl`. */
export function transcriptPath(cwd: string, session: string): string {
  return path.join(home(), '.claude', 'projects', cwd.replaceAll('/', '-'), `${session}.jsonl`);
}

/** One API turn's spend. `agent` names the sub-agent that spent it; absent, the session's own. */
export interface Usage { at: number; input: number; cached: number; output: number; agent?: string }

export interface Tail {
  activity: Activity[];
  usage: Usage[];
  /** The last text block of an **assistant** record, never a user one: a skill preamble is
   *  injected as user text and would otherwise read as the session's last word. It is the last
   *  text seen, not the last of one turn — the fallback for a Stop that recorded no message. */
  text: string;
  offset: number;
  /** One API response is written as one line per content block, each repeating the usage with
   *  the output count as it stood: the entry per message id takes the last, which is the whole. */
  seen: Map<string, Usage>;
  /** Sub-agent id → role, from the Agent call that spawned it and the result that named it. */
  agents: Map<string, string>;
  /** Agent tool_use id → role, until its result arrives with the agent id. */
  spawns: Map<string, string>;
  /** Sub-agents launched in the background whose task notification has not come back: while one
   *  is out, the turn that ended is not the session asking anything. */
  running: Set<string>;
  /** Tool_use id → its `bash` or `sub` row, until a result or a task notification settles it. */
  pending: Map<string, Activity>;
  /** What `--name` or `/rename` called the session, from Claude Code's own `custom-title` record. */
  title: string;
}

/** A first read never parses more than this, and a session never keeps more rows than that. */
const FIRST_READ = 2 * 1024 * 1024;
const MAX_ROWS = 400;

const tails = new Map<string, Tail>();

interface Block {
  type?: string; id?: string; text?: string; name?: string; input?: Record<string, unknown>;
  tool_use_id?: string; content?: string | { text?: string }[]; is_error?: boolean;
}

interface Line {
  type?: string; timestamp?: string; isSidechain?: boolean; agentId?: string; customTitle?: string;
  message?: { id?: string; content?: Block[] | string; usage?: Record<string, number> };
  /** Claude Code's own record of a result: a command sent to the background names its task, an
   *  agent launched there is `isAsync`. Either way the row is still out. */
  toolUseResult?: { backgroundTaskId?: string; isAsync?: boolean };
}

const VERB: Record<string, Activity['verb']> = {
  Bash: 'bash', Edit: 'edit', Write: 'edit', Read: 'read', Glob: 'read', Grep: 'read',
  Agent: 'sub', AskUserQuestion: 'ask',
};

/** The rows that have a result to wait for: a command's exit, a sub-agent's report. */
const TRACKED = new Set<Activity['verb']>(['bash', 'sub']);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** What an `agent` row holds: two lines of a wide pane, since the foot wraps a row to two. */
const TEXT_MAX = 320;

/** Prose on one line, cut where the foot would stop wrapping it anyway. */
function flat(raw: string): string {
  const one = raw.trim().replace(/\s+/g, ' ');
  return one.length > TEXT_MAX ? `${one.slice(0, TEXT_MAX - 1)}…` : one;
}

/** One sentence of prose: a question row is the question, not its preamble. */
function sentence(raw: string): string {
  const one = flat(raw);
  const end = one.search(/[.?!](\s|$)/);
  return end === -1 ? one : one.slice(0, end + 1);
}

/** The activity table from spec.md: what the tool was, in the words the human would use. */
function detail(block: Block, cwd: string): string {
  const input = block.input ?? {};
  const file = text(input.file_path);
  switch (block.name) {
    // The description is what the model said it was doing; the command is what it typed.
    case 'Bash': return text(input.description) || (text(input.command).split('\n')[0] ?? '');
    case 'Edit': case 'Write': return file.startsWith(cwd) ? path.relative(cwd, file) : file;
    case 'Read': case 'Glob': case 'Grep': return file || text(input.pattern);
    case 'Agent': return `→ ${[text(input.subagent_type), text(input.description)].filter((s) => s !== '').join(' · ')}`;
    case 'AskUserQuestion': {
      const first = Array.isArray(input.questions) ? (input.questions[0] as { question?: string }) : undefined;
      return sentence(text(first?.question));
    }
    default: return text(block.name);
  }
}

function parse(line: string): Line | null {
  try {
    return JSON.parse(line) as Line;
  } catch {
    return null;
  }
}

const fresh = (): Tail => ({
  activity: [], usage: [], text: '', offset: 0, seen: new Map(), agents: new Map(), spawns: new Map(), running: new Set(),
  pending: new Map(), title: '',
});

/** A result settles the row that asked for it — unless it only says the work went to the
 *  background, in which case the task notification that ends it does. */
function settle(tail: Tail, id: string, failed: boolean, background = false): void {
  const row = tail.pending.get(id);
  if (!row) return;
  if (!failed && background) return;
  row.status = failed ? 'failed' : 'ok';
  tail.pending.delete(id);
}

/** The text of a tool result, whichever shape Claude Code wrote it in. */
const resultText = (block: Block): string =>
  typeof block.content === 'string' ? block.content : (block.content ?? []).map((c) => text(c.text)).join(' ');

/**
 * Everything the screen takes from one session's transcript, plus the spend of every sub-agent
 * it spawned: Claude Code writes those under `<session>/subagents/`, one file each, and the
 * Agent call that started one is the only place its role is named.
 */
export async function readTranscript(file: string, session: string, cwd: string): Promise<Tail> {
  const own = await readTail(file, session, cwd);
  const dir = path.join(file.replace(/\.jsonl$/, ''), 'subagents');
  const subs: Usage[] = [];
  for (const name of await readdir(dir).catch(() => [])) {
    if (name.endsWith('.jsonl')) subs.push(...(await readTail(path.join(dir, name), session, cwd)).usage);
  }
  return subs.length ? { ...own, usage: [...own.usage, ...subs] } : own;
}

async function readTail(file: string, session: string, cwd: string): Promise<Tail> {
  let tail = tails.get(file);
  if (!tail) tails.set(file, (tail = fresh()));

  const info = await stat(file).catch(() => null);
  if (!info || info.size === tail.offset) return tail;
  // Shorter than what we read means a different file under the same name: start over.
  if (info.size < tail.offset) Object.assign(tail, fresh());

  const first = tail.offset === 0;
  const from = first ? Math.max(0, info.size - FIRST_READ) : tail.offset;
  const chunk = await Bun.file(file).slice(from, info.size).text();
  const lines = chunk.split('\n');
  // A write in flight leaves the last line unterminated; the offset stops in front of it.
  const partial = lines.pop() ?? '';
  tail.offset = info.size - new TextEncoder().encode(partial).length;
  if (first && from > 0) lines.shift(); // the two-megabyte cut lands mid-line

  for (const raw of lines) {
    const line = raw === '' ? null : parse(raw);
    if (!line) continue;
    // A background sub-agent reports back as a task notification, written as an attachment line.
    if (line.type !== 'assistant') {
      for (const [, done] of raw.matchAll(/<task-id>([a-z0-9]+)<\/task-id>/g)) tail.running.delete(done!);
      for (const [, id, status] of raw.matchAll(/<tool-use-id>([^<]+)<\/tool-use-id>[\s\S]*?<status>(\w+)<\/status>/g)) settle(tail, id!, status !== 'completed');
    }
    if (line.type === 'custom-title') {
      tail.title = text(line.customTitle);
      continue;
    }
    const blocks = Array.isArray(line.message?.content) ? line.message.content : [];
    // An Agent result comes back as a user line naming the id its file is written under.
    if (line.type === 'user') {
      for (const block of blocks) {
        if (block.type !== 'tool_result' || !block.tool_use_id) continue;
        const body = resultText(block);
        settle(tail, block.tool_use_id, block.is_error === true, line.toolUseResult?.backgroundTaskId !== undefined || line.toolUseResult?.isAsync === true);
        const role = tail.spawns.get(block.tool_use_id);
        const agent = /agentId: ([a-z0-9]+)/.exec(body)?.[1];
        if (role && agent) {
          tail.agents.set(agent, role);
          if (body.includes('in the background')) tail.running.add(agent);
        }
      }
      continue;
    }
    if (line.type !== 'assistant') continue;
    const at = Date.parse(line.timestamp ?? '');
    if (Number.isNaN(at)) continue;

    const usage = line.message?.usage;
    const key = line.message?.id ?? String(at);
    const counted = usage ? tail.seen.get(key) : undefined;
    if (usage && counted) counted.output = Math.max(counted.output, usage.output_tokens ?? 0);
    else if (usage) {
      // A cache write is a prompt token the model saw for the first time; only a cache read is
      // context re-sent, and that is what grows with every turn. `input` is what the turn added.
      const entry: Usage = {
        at,
        input: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        cached: usage.cache_read_input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        ...(line.agentId ? { agent: line.agentId } : {}),
      };
      tail.seen.set(key, entry);
      tail.usage.push(entry);
    }
    // A sub-agent's lines are its spend, never the session's log.
    if (line.isSidechain) continue;

    for (const block of blocks) {
      if (block.type === 'tool_use' && block.name === 'Agent' && block.id) {
        tail.spawns.set(block.id, text(block.input?.subagent_type).toLowerCase());
      }
      if (block.type === 'text') {
        const body = text(block.text).trim();
        if (body === '') continue;
        tail.text = body.slice(0, 1000);
        tail.activity.push({ at, session, verb: 'agent', text: flat(body) });
      } else if (block.type === 'tool_use') {
        const row: Activity = { at, session, verb: VERB[block.name ?? ''] ?? 'tool', text: detail(block, cwd) };
        if (TRACKED.has(row.verb) && block.id) {
          row.status = 'running';
          tail.pending.set(block.id, row);
        }
        tail.activity.push(row);
      }
    }
  }

  if (tail.activity.length > MAX_ROWS) tail.activity.splice(0, tail.activity.length - MAX_ROWS);
  return tail;
}

/**
 * Usage between two instants, or all of it: the mission total is the window nobody bounded. With
 * a role, only that role's turns: the session's own for `orchestrator`, a sub-agent's for the rest.
 */
export function sumUsage(usage: Usage[], from = -Infinity, to = Infinity, role?: string, agents?: Map<string, string>): { input: number; cached: number; output: number } {
  const total = { input: 0, cached: 0, output: 0 };
  for (const u of usage) {
    if (u.at < from || u.at > to) continue;
    if (role && (u.agent ? agents?.get(u.agent) : 'orchestrator') !== role) continue;
    total.input += u.input;
    total.cached += u.cached;
    total.output += u.output;
  }
  return total;
}

/** Every transcript the screen is reading: what the watcher has to keep an eye on. */
export function openTranscripts(): string[] {
  return [...tails.keys()];
}
