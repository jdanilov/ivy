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
  /** What `--name` or `/rename` called the session, from Claude Code's own `custom-title` record. */
  title: string;
}

/** A first read never parses more than this, and a session never keeps more rows than that. */
const FIRST_READ = 2 * 1024 * 1024;
const MAX_ROWS = 400;

const tails = new Map<string, Tail>();

interface Block {
  type?: string; id?: string; text?: string; name?: string; input?: Record<string, unknown>;
  tool_use_id?: string; content?: string | { text?: string }[];
}

interface Line {
  type?: string; timestamp?: string; isSidechain?: boolean; agentId?: string; customTitle?: string;
  message?: { id?: string; content?: Block[] | string; usage?: Record<string, number> };
}

const VERB: Record<string, Activity['verb']> = {
  Bash: 'Bash', Edit: 'Edit', Write: 'Edit', Read: 'Read', Glob: 'Read', Grep: 'Read',
  Agent: 'Agent', AskUserQuestion: 'Ask',
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** One line of prose: the log has one row per block, not a paragraph. */
function sentence(raw: string): string {
  const flat = raw.trim().replace(/\s+/g, ' ');
  const end = flat.search(/[.?!](\s|$)/);
  const cut = end === -1 ? flat : flat.slice(0, end + 1);
  return cut.length > 160 ? `${cut.slice(0, 159)}…` : cut;
}

/** The activity table from spec.md: what the tool was, in the words the human would use. */
function detail(block: Block, cwd: string): string {
  const input = block.input ?? {};
  const file = text(input.file_path);
  switch (block.name) {
    case 'Bash': return text(input.command).split('\n')[0] ?? '';
    case 'Edit': case 'Write': return file.startsWith(cwd) ? path.relative(cwd, file) : file;
    case 'Read': case 'Glob': case 'Grep': return file || text(input.pattern);
    case 'Agent': return `${text(input.subagent_type)} ${text(input.description)}`.trim();
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
  activity: [], usage: [], text: '', offset: 0, seen: new Map(), agents: new Map(), spawns: new Map(), running: new Set(), title: '',
});

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
    if (line.type === 'custom-title') {
      tail.title = text(line.customTitle);
      continue;
    }
    const blocks = Array.isArray(line.message?.content) ? line.message.content : [];
    // An Agent result comes back as a user line naming the id its file is written under; one
    // launched in the background reports back later as a task notification on a user line too.
    if (line.type === 'user') {
      for (const block of blocks) {
        const role = block.type === 'tool_result' && block.tool_use_id ? tail.spawns.get(block.tool_use_id) : undefined;
        const body = role ? resultText(block) : '';
        const agent = /agentId: ([a-z0-9]+)/.exec(body)?.[1];
        if (role && agent) {
          tail.agents.set(agent, role);
          if (body.includes('in the background')) tail.running.add(agent);
        }
      }
      const whole = typeof line.message?.content === 'string' ? line.message.content : blocks.map((b) => text(b.text)).join(' ');
      for (const [, done] of whole.matchAll(/<task-id>([a-z0-9]+)<\/task-id>/g)) tail.running.delete(done!);
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
        tail.activity.push({ at, session, verb: 'Text', text: sentence(body) });
      } else if (block.type === 'tool_use') {
        tail.activity.push({ at, session, verb: VERB[block.name ?? ''] ?? 'Tool', text: detail(block, cwd) });
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
