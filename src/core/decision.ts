import path from 'node:path';
import { rename } from 'node:fs/promises';
import type { Autonomy, MissionState } from '../types.js';
import { Refusal } from './mission.js';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type DecisionStatus = 'auto' | 'waiting' | 'accepted' | 'overruled';
export type Verdict = 'accept' | 'overrule';

export const CONFIDENCES: Confidence[] = ['HIGH', 'MEDIUM', 'LOW'];
export const VERDICTS: Verdict[] = ['accept', 'overrule'];

/** One fork an agent took, filed as it happened. The summary carries the reason. */
export interface Decision {
  id: string;
  step: string;
  by: string;
  confidence: Confidence;
  summary: string;
  status: DecisionStatus;
  note: string;
}

export interface NewDecision {
  step: string;
  by: string;
  confidence: Confidence;
  summary: string;
}

const HEADER = [
  '# Decisions',
  '',
  '| id | step | by | confidence | summary | status | note |',
  '|----|------|----|------------|---------|--------|------|',
].join('\n');

const filePath = (dir: string): string => path.join(dir, 'decisions.md');

/**
 * Three levels, monotonic: `full` decides everything itself, `none` hands everything over.
 * `parts/hook-factory/hook-factory.ts` carries the same rule; a hook imports nothing from here.
 */
export function waits(autonomy: Autonomy, confidence: Confidence): boolean {
  if (autonomy === 'full') return false;
  if (autonomy === 'none') return true;
  return confidence === 'LOW';
}

/** A row is one line: a `|` would open a cell, a newline would end the row. */
const cell = (text: string): string => text.replaceAll('|', '/').replace(/\s+/g, ' ').trim();

export async function readDecisions(dir: string): Promise<Decision[]> {
  const text = await Bun.file(filePath(dir)).text().catch(() => '');
  const rows: Decision[] = [];

  for (const line of text.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6 || !cells[0]!.startsWith('D')) continue;
    rows.push({
      id: cells[0]!,
      step: cells[1]!,
      by: cells[2]!,
      confidence: cells[3] as Confidence,
      summary: cells[4]!,
      status: cells[5] as DecisionStatus,
      note: cells[6] ?? '',
    });
  }
  return rows;
}

/** Temp file plus rename, like state.json: a killed process never leaves half a table. */
async function writeDecisions(dir: string, rows: Decision[]): Promise<void> {
  const body = rows.map((d) => `| ${d.id} | ${d.step} | ${d.by} | ${d.confidence} | ${d.summary} | ${d.status} | ${d.note} |`);
  const temp = path.join(dir, `.decisions.md.${process.pid}`);
  await Bun.write(temp, `${[HEADER, ...body].join('\n')}\n`);
  await rename(temp, filePath(dir));
}

const nextNumber = (rows: Decision[]): number =>
  rows.reduce((max, d) => Math.max(max, Number(d.id.slice(1)) || 0), 0) + 1;

/** Status at filing is the whole point of the dial: `waiting` stops the mission, `auto` is a record. */
export async function fileDecisions(dir: string, state: MissionState, items: NewDecision[]): Promise<Decision[]> {
  const rows = await readDecisions(dir);
  let number = nextNumber(rows);
  const filed = items.map((item): Decision => ({
    id: `D${number++}`,
    step: item.step,
    by: item.by,
    confidence: item.confidence,
    summary: cell(item.summary),
    status: waits(state.autonomy, item.confidence) ? 'waiting' : 'auto',
    note: '',
  }));

  if (filed.length > 0) await writeDecisions(dir, [...rows, ...filed]);
  return filed;
}

/**
 * First answer wins, as on a gate: the same verdict again changes nothing, a different one is
 * refused. An `auto` row is still answerable — reading the table late is how an overrule happens.
 */
export async function answerDecision(dir: string, id: string, verdict: Verdict, note?: string): Promise<{ decision: Decision; changed: boolean }> {
  const rows = await readDecisions(dir);
  const decision = rows.find((d) => d.id === id);
  if (!decision) throw new Refusal(`no decision ${id} in ${filePath(dir)}`);

  const status: DecisionStatus = verdict === 'accept' ? 'accepted' : 'overruled';
  if (decision.status === 'accepted' || decision.status === 'overruled') {
    if (decision.status === status) return { decision, changed: false };
    throw new Refusal(`decision ${id} was already ${decision.status}${decision.note === '' ? '' : ` — "${decision.note}"`}`);
  }

  decision.status = status;
  if (note !== undefined) decision.note = cell(note);
  await writeDecisions(dir, rows);
  return { decision, changed: true };
}

export async function waitingDecisions(dir: string): Promise<Decision[]> {
  return (await readDecisions(dir)).filter((d) => d.status === 'waiting');
}
