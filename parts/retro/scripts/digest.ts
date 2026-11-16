#!/usr/bin/env bun
/**
 * Condenses Claude Code transcripts for /retro. A session's JSONL runs to tens of megabytes, mostly
 * tool output; the digest keeps the prompts, the replies, one line per tool call and the signals
 * worth a look, one file per session and per sub-agent, and prints an index of them.
 *
 *   digest.ts [since|last|<session id prefix>...] [--skip <id>] [--out <dir>]
 *   digest.ts --mark      the next `since` starts from now
 */

import os from 'node:os';
import path from 'node:path';
import { mkdir, readdir, stat } from 'node:fs/promises';

interface Block {
  type?: string; id?: string; text?: string; name?: string; input?: Record<string, unknown>;
  tool_use_id?: string; content?: string | { text?: string }[]; is_error?: boolean;
}

interface Line {
  type?: string; subtype?: string; timestamp?: string; isMeta?: boolean; isCompactSummary?: boolean;
  durationMs?: number; aiTitle?: string; customTitle?: string;
  message?: { id?: string; content?: Block[] | string; usage?: Record<string, number> };
}

const SLOW_MS = 60_000;
const SHOWN_MS = 10_000;
const PROMPT_MAX = 1500;
const REPLY_MAX = 600;

const oneLine = (raw: string, max: number): string => {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const blockText = (block: Block): string =>
  typeof block.content === 'string' ? block.content : (block.content ?? []).map((c) => c.text ?? '').join('\n');
const clock = (at: number): string => new Date(at).toTimeString().slice(0, 5);
const span = (ms: number): string => (ms >= 3_600_000 ? `${Math.floor(ms / 3_600_000)}h${Math.round((ms % 3_600_000) / 60_000)}m` : `${Math.round(ms / 60_000)}m`);
const kilo = (n: number): string => `${Math.round(n / 1000)}k`;

/** The tool call's one argument that says what it did. */
function brief(name: string, input: Record<string, unknown>): string {
  if (name === 'Agent') return `${input.subagent_type ?? 'general-purpose'} · ${input.description ?? ''}`;
  const key = input.command ?? input.file_path ?? input.pattern ?? input.skill ?? input.url ?? input.query;
  return oneLine(typeof key === 'string' ? key : JSON.stringify(input), 200);
}

/** One transcript, read in order: the timeline rows plus the counts its signals line is made of. */
class Digest {
  rows: string[] = [];
  title = '';
  first = 0;
  last = 0;
  activeMs = 0;
  count = { tools: 0, errors: 0, denials: 0, interrupts: 0, slow: 0, agents: 0 };
  private open = new Map<string, { row: number; at: number }>();
  private runs = new Map<string, number>();
  private edits = new Map<string, number>();
  private usage = new Map<string, Record<string, number>>();

  add(line: Line): void {
    const at = Date.parse(line.timestamp ?? '') || this.last;
    if (at && new Date(at).toDateString() !== new Date(this.last).toDateString()) this.rows.push(`── ${new Date(at).toDateString()} ──`);
    if (at) { this.first ||= at; this.last = at; }
    if (line.customTitle) this.title = line.customTitle;
    if (line.aiTitle && !this.title) this.title = line.aiTitle;
    if (line.subtype === 'turn_duration') this.activeMs += line.durationMs ?? 0;
    if (line.isCompactSummary) return void this.rows.push(`${clock(at)} ── compacted ──`);
    const content = line.message?.content;
    if (line.type === 'assistant' && Array.isArray(content)) {
      if (line.message?.id && line.message.usage) this.usage.set(line.message.id, line.message.usage);
      content.forEach((block) => this.said(block, at));
    }
    if (line.type === 'user' && !line.isMeta) this.heard(content, at);
  }

  private said(block: Block, at: number): void {
    if (block.type === 'text' && block.text?.trim()) {
      const words = block.text.split(/\s+/).length;
      this.rows.push(`${clock(at)} A  (${words}w) ${oneLine(block.text, REPLY_MAX)}`);
    }
    if (block.type !== 'tool_use' || !block.name || !block.id) return;
    const input = block.input ?? {};
    this.count.tools++;
    if (block.name === 'Agent') this.count.agents++;
    if (block.name === 'Bash') this.bump(this.runs, oneLine(String(input.command ?? ''), 80));
    if (['Edit', 'Write'].includes(block.name)) this.bump(this.edits, String(input.file_path ?? ''));
    this.open.set(block.id, { row: this.rows.length, at });
    this.rows.push(`${clock(at)} T  ${block.name}  ${brief(block.name, input)}`);
  }

  private heard(content: Block[] | string | undefined, at: number): void {
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : (content ?? []);
    for (const block of blocks) {
      if (block.type === 'tool_result') this.settle(block, at);
      if (block.type === 'text' && block.text) this.prompt(block.text, at);
    }
    const images = blocks.filter((b) => b.type === 'image').length;
    if (images) this.rows.push(`${clock(at)} U  [+${images} images]`);
  }

  private settle(block: Block, at: number): void {
    const call = this.open.get(block.tool_use_id ?? '');
    if (!call) return;
    this.open.delete(block.tool_use_id ?? '');
    const text = blockText(block);
    const took = at - call.at;
    if (took >= SLOW_MS) this.count.slow++;
    let mark = took >= SHOWN_MS ? `  ${Math.round(took / 1000)}s` : '';
    if (/doesn't want to proceed|was rejected/.test(text)) { this.count.denials++; mark += '  ⊘ denied'; }
    else if (block.is_error) { this.count.errors++; mark += `  ✗ ${oneLine(text.replace(/<\/?tool_use_error>/g, ''), 160)}`; }
    this.rows[call.row] += mark;
  }

  private prompt(raw: string, at: number): void {
    const text = raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
    if (!text || /^<(local-command|command-message)/.test(text)) return;
    if (text.includes('[Request interrupted')) { this.count.interrupts++; return void this.rows.push(`${clock(at)} ⏸  interrupted`); }
    const done = text.match(/^<task-notification>[\s\S]*?<summary>([\s\S]*?)<\/summary>/);
    if (done) return void this.rows.push(`${clock(at)} ↩  ${oneLine(done[1]!, 160)}`);
    if (text.startsWith('<task-notification>')) return;
    const command = text.match(/<command-name>(.*?)<\/command-name>[\s\S]*?<command-args>([\s\S]*?)<\/command-args>/);
    this.rows.push(`${clock(at)} U  ${command ? `${command[1]} ${oneLine(command[2]!, PROMPT_MAX)}` : oneLine(text, PROMPT_MAX)}`);
  }

  private bump(map: Map<string, number>, key: string): void {
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
  }

  signals(): string {
    const totals = [...this.usage.values()];
    const out = totals.reduce((sum, u) => sum + (u.output_tokens ?? 0), 0);
    const peak = Math.max(0, ...totals.map((u) => (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)));
    const c = this.count;
    return [
      `${span(this.last - this.first)} wall`, this.activeMs ? `${span(this.activeMs)} active` : '',
      `${c.tools} tools`, c.errors ? `${c.errors} ✗` : '', c.denials ? `${c.denials} ⊘` : '',
      c.interrupts ? `${c.interrupts} ⏸` : '', c.slow ? `${c.slow} slow` : '', c.agents ? `${c.agents} agents` : '',
      `out ${kilo(out)}`, `ctx peak ${kilo(peak)}`,
    ].filter(Boolean).join(' · ');
  }

  repeats(): string[] {
    const top = (map: Map<string, number>, min: number): string[] =>
      [...map].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, n]) => `\`${key}\` ×${n}`);
    const reruns = top(this.runs, 3);
    const churn = top(this.edits, 4);
    return [reruns.length ? `reruns: ${reruns.join(', ')}` : '', churn.length ? `churn: ${churn.join(', ')}` : ''].filter(Boolean);
  }
}

async function digestFile(file: string): Promise<Digest> {
  const digest = new Digest();
  for (const raw of (await Bun.file(file).text()).split('\n')) {
    if (!raw) continue;
    try { digest.add(JSON.parse(raw) as Line); } catch { /* a line cut by a live write */ }
  }
  return digest;
}

async function write(digest: Digest, file: string, heading: string): Promise<void> {
  const body = [`# ${heading}`, '', digest.signals(), ...digest.repeats(), '', ...digest.rows].join('\n');
  await Bun.write(file, `${body}\n`);
}

/** Main transcript first, then every sub-agent it spawned, one digest file each. */
async function digestSession(dir: string, id: string, out: string): Promise<string[]> {
  const main = await digestFile(path.join(dir, `${id}.jsonl`));
  const folder = path.join(out, id.slice(0, 8));
  await mkdir(folder, { recursive: true });
  await write(main, path.join(folder, 'main.md'), `${main.title || 'untitled'} · ${id}`);
  const index = [`${id.slice(0, 8)} · ${main.title || 'untitled'} · ${new Date(main.first).toISOString().slice(0, 16)} · ${main.signals()}`, `  ${folder}/main.md`];
  const agentsDir = path.join(dir, id, 'subagents');
  const agents = (await readdir(agentsDir).catch(() => [])).filter((f) => f.endsWith('.jsonl'));
  for (const name of agents) {
    const meta = await Bun.file(path.join(agentsDir, name.replace('.jsonl', '.meta.json'))).json().catch(() => ({}));
    const digest = await digestFile(path.join(agentsDir, name));
    const file = path.join(folder, name.replace('.jsonl', '.md'));
    await write(digest, file, `${meta.agentType ?? 'agent'} · ${meta.description ?? ''}`);
    index.push(`  ${meta.agentType ?? 'agent'} · ${oneLine(meta.description ?? '', 60)} · ${digest.signals()}`, `    ${file}`);
  }
  return index;
}

async function pick(dir: string, picks: string[], skip: string[]): Promise<string[]> {
  const ids = (await readdir(dir)).filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, -6)).filter((id) => !skip.includes(id));
  const dated = await Promise.all(ids.map(async (id) => ({ id, at: (await stat(path.join(dir, `${id}.jsonl`))).mtimeMs })));
  const recent = dated.sort((a, b) => b.at - a.at);
  const mode = picks[0] ?? 'since';
  if (mode === 'last') return recent.slice(0, 1).map((s) => s.id);
  if (mode !== 'since') return picks.map((p) => ids.find((id) => id.startsWith(p)) ?? '').filter(Boolean);
  const since = Date.parse(await Bun.file(path.join(dir, '.retro')).text().catch(() => ''));
  return (Number.isNaN(since) ? recent.slice(0, 1) : recent.filter((s) => s.at > since)).map((s) => s.id);
}

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const dir = path.join(os.homedir(), '.claude', 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));

if (args.includes('--mark')) {
  await Bun.write(path.join(dir, '.retro'), new Date().toISOString());
  console.log(`marked ${dir}/.retro`);
} else {
  const flagged = new Set(['--skip', '--out'].flatMap((f) => [f, option(f)]));
  const picks = args.filter((a) => !flagged.has(a));
  const out = option('--out') ?? path.join(os.tmpdir(), 'retro');
  const ids = await pick(dir, picks, [option('--skip') ?? '']);
  if (!ids.length) console.log('no sessions to review');
  for (const id of ids) console.log((await digestSession(dir, id, out)).join('\n'));
}
