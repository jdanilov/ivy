/** What Mission Control draws. `live.ts` fills these from state.json, events and manifests. */

import type { Caffeinate } from '../core/config.js';

export type { Caffeinate };

export type RunState = 'pending' | 'running' | 'done' | 'blocked' | 'skipped';

/** Which colour family a step belongs to, independent of where it is in its life. */
export type StepKind = 'human' | 'gatekeeper' | 'agent' | 'technical';

/** As much of a workflow step as the kind is read from. */
export interface KindOf { name: string; role?: string; gate?: string; parallel?: string[] }

const GATEKEEPING = ['verify', 'validate', 'accept'];

/**
 * What kind of work a step is. The role settles it where the workflow gives one, then the three
 * names every workflow gatekeeps under, then the human's own: a gate before the work starts is a
 * decision, the same gate after it is bookkeeping. `early` is false past the first worker step.
 * One mapping for the live snapshot and the fixture both, so a review reads the real colours.
 */
export function stepKind(step: KindOf, early = false): StepKind {
  if (step.role === 'worker' || step.role === 'investigator') return 'agent';
  if (GATEKEEPING.includes(step.name) || (step.parallel ?? []).some((n) => GATEKEEPING.includes(n))) return 'gatekeeper';
  if (step.name === 'grill' || step.name === 'intent' || (step.gate === 'human' && early)) return 'human';
  return 'technical';
}

export interface StepRow {
  name: string;
  kind: StepKind;
  status: RunState;
  role?: string;
  wall?: number;
  /** Transcript usage inside the step's own window. */
  tokens?: { input: number; cached: number; output: number };
  gateOpen?: boolean;
}

export interface EventRow {
  at: number;
  verb: string;
  detail: string;
}

/** One line of a session's progress log. Wiring reads these from Claude Code's transcript jsonl. */
export interface Activity {
  at: number;
  session: string;
  verb: 'Bash' | 'Edit' | 'Read' | 'Agent' | 'Text' | 'Ask' | 'Tool' | 'Stop';
  text: string;
}

/** How much of what this mission decides waits on the human. */
export type Autonomy = 'full' | 'partial' | 'none';

export interface Mission {
  name: string;
  workflow: string;
  status: 'open' | 'stub' | 'closed';
  state: RunState;
  autonomy: Autonomy;
  step: string | null;
  round: number;
  session: string | null;
  branch: string | null;
  worktree: string | null;
  caffeinate: boolean;
  wall: number;
  tokens: { input: number; cached: number; output: number };
  /** Lines the branch adds and removes against the trunk. Absent until the first `git diff` lands. */
  diff?: { added: number; removed: number };
  steps: StepRow[];
  deviations: number;
  closedAt?: number;
}

/** A session known through hook events with no mission bound to it. */
export interface Session {
  id: string;
  preset: string;
  cwd: string;
  idleSince: number;
  last?: EventRow;
  question?: string;
}

export interface PartRow {
  name: string;
  type: string;
  status: 'installed' | 'not-installed' | 'modified';
  files: string[];
}

export interface Project {
  name: string;
  path: string;
  missions: Mission[];
  sessions: Session[];
  parts: PartRow[];
}

export interface TriageLine {
  action: 'fix' | 'skip';
  text: string;
}

export interface InboxItem {
  kind: 'gate' | 'question' | 'triage';
  project: string;
  origin: string;
  /** The workflow step an answer is recorded against; absent on a question. */
  step?: string;
  label: string;
  at: number;
  answered?: boolean;
  file?: string;
  lines?: number;
  body?: string[];
  text?: string;
  tab?: string;
  plan?: TriageLine[];
}

export interface Snapshot {
  projects: Project[];
  inbox: InboxItem[];
  activity: Activity[];
  caffeinate: Caffeinate;
}
