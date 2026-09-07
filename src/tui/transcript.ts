import path from 'node:path';
import { stat } from 'node:fs/promises';
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

export interface Usage { at: number; input: number; cached: number; output: number }

export interface Tail {
  activity: Activity[];
  usage: Usage[];
  /** The last text block of an **assistant** record, never a user one: a skill preamble is
   *  injected as user text and would otherwise read as the session's last word. It is the last
   *  text seen, not the last of one turn — the fallback for a Stop that recorded no message. */
  text: string;
  offset: number;
  /** Message ids already counted: one API response is written as one line per content block. */
  seen: Set<string>;
}

/** A first read never parses more than this, and a session never keeps more rows than that. */
const FIRST_READ = 2 * 1024 * 1024;
const MAX_ROWS = 400;

const tails = new Map<string, Tail>();

interface Block { type?: string; text?: string; name?: string; input?: Record<string, unknown> }

interface Line {
  type?: string; timestamp?: string; isSidechain?: boolean;
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

/** Everything the screen takes from one session's transcript, read forward from where we stopped. */
export async function readTranscript(file: string, session: string, cwd: string): Promise<Tail> {
  let tail = tails.get(file);
  if (!tail) tails.set(file, (tail = { activity: [], usage: [], text: '', offset: 0, seen: new Set() }));

  const info = await stat(file).catch(() => null);
  if (!info || info.size === tail.offset) return tail;
  // Shorter than what we read means a different file under the same name: start over.
  if (info.size < tail.offset) Object.assign(tail, { activity: [], usage: [], text: '', offset: 0, seen: new Set() });

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
    if (!line || line.type !== 'assistant') continue;
    const at = Date.parse(line.timestamp ?? '');
    if (Number.isNaN(at)) continue;

    // Sidechain lines are a sub-agent's: not the session's log, but its spend all the same.
    const usage = line.message?.usage;
    const key = line.message?.id ?? String(at);
    if (usage && !tail.seen.has(key)) {
      tail.seen.add(key);
      tail.usage.push({
        at,
        input: usage.input_tokens ?? 0,
        cached: (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        output: usage.output_tokens ?? 0,
      });
    }
    if (line.isSidechain || !Array.isArray(line.message?.content)) continue;

    for (const block of line.message.content) {
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

/** Usage between two instants, or all of it: the mission total is the window nobody bounded. */
export function sumUsage(usage: Usage[], from = -Infinity, to = Infinity): { input: number; cached: number; output: number } {
  const total = { input: 0, cached: 0, output: 0 };
  for (const u of usage) {
    if (u.at < from || u.at > to) continue;
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
