/** What Mission Control draws. `live.ts` fills these from state.json, events and manifests. */

import type { Caffeinate, Launch } from '../core/config.js';
import { stepRole } from '../core/workflow.js';
import type { Decision } from '../core/decision.js';
import type { ScopeChoice, Scope, WorkflowStep } from '../types.js';

export type { Caffeinate, Decision, Launch, Scope, ScopeChoice };

export type RunState = 'pending' | 'running' | 'done' | 'blocked' | 'skipped';

/** Which colour family a step belongs to, independent of where it is in its life. */
export type StepKind = 'human' | 'gatekeeper' | 'agent' | 'technical';

/** Steps a closed mission's workflow copy still carries, from before the graph was folded. */
const OLD: Record<string, StepKind> = { grill: 'human', accept: 'gatekeeper', condense: 'technical' };

/**
 * What kind of work a step is. `stepRole` settles who runs it and the runner settles the family;
 * a parallel group is whatever its members are; a gate the human answers is the human's own.
 * One mapping for the live snapshot and the fixture both, so a review reads the real colours.
 */
export function stepKind(step: WorkflowStep): StepKind {
  const role = stepRole(step);
  if (role === 'worker' || role === 'investigator') return 'agent';
  if (role === 'verifier' || role === 'validator') return 'gatekeeper';
  if ((step.parallel ?? []).some((name) => stepKind({ name }) === 'gatekeeper')) return 'gatekeeper';
  if (step.gate === 'human') return 'human';
  return OLD[step.name] ?? 'technical';
}

export interface StepRow {
  name: string;
  kind: StepKind;
  status: RunState;
  /** Who runs it, from `stepRole` and never guessed here; the model follows through `runnerLabel`. */
  role: string;
  /** How many times `step start` has run it. Absent or 1 on a step the mission never looped back to. */
  runs?: number;
  wall?: number;
  /** Transcript usage inside the step's own window. */
  tokens?: { input: number; cached: number; output: number };
  gateOpen?: boolean;
}

/** One line of a session's progress log. Wiring reads these from Claude Code's transcript jsonl. */
export interface Activity {
  at: number;
  session: string;
  verb: 'user' | 'bash' | 'edit' | 'read' | 'sub' | 'agent' | 'ask' | 'tool' | 'stop';
  text: string;
  /** A `bash`, `sub` or `ask` row: out until its result lands, then what the result said. */
  status?: 'running' | 'ok' | 'failed';
}

/** How much of what this mission decides waits on the human. */
export type Autonomy = 'full' | 'partial' | 'none';

export interface Mission {
  name: string;
  /** The line `mission new --title` gave it, or the name again. */
  title: string;
  /** The first paragraph under `## Why` in `intent.md`, read for a stub: the one row that has no steps to say what it is. */
  why?: string;
  workflow: string;
  status: 'open' | 'stub' | 'closed';
  state: RunState;
  autonomy: Autonomy;
  /** Moved to `.factory/archive/`: off the list until `Z` asks for it. */
  archived: boolean;
  step: string | null;
  round: number;
  session: string | null;
  /** The bound session runs under Claude Code's daemon, with a tab attached or none. */
  bg?: boolean;
  /** The preset the bound session was spawned with, from the hook's own SessionStart line. */
  preset: string | null;
  branch: string | null;
  worktree: string | null;
  wall: number;
  tokens: { input: number; cached: number; output: number };
  /** Lines the branch adds and removes against the trunk. Absent until the first `git diff` lands. */
  diff?: { added: number; removed: number };
  steps: StepRow[];
  /** One `<what>: <reason>` per entry, so the pane shows why and not only how many. */
  deviations: string[];
  decisions: Decision[];
  closedAt?: number;
}

/** A session known through hook events with no mission bound to it. */
export interface Session {
  id: string;
  /** What `--name` or `/rename` called it; absent, the row shows the id. */
  name?: string;
  /** A turn in progress: a prompt after the last Stop, or a sub-agent still out in the background. */
  busy: boolean;
  /** The role of the sub-agent out in the background, when that is what keeps it busy. */
  agent?: string;
  preset: string;
  /** Runs under Claude Code's daemon, with a tab attached or none. */
  bg?: boolean;
  cwd: string;
  /** When its last turn ended. Meaningless while busy. */
  idleSince: number;
  /** The `bash`, `sub` or `ask` row still out, if one is: an `ask` is a picker waiting on the human. */
  now?: Activity;
  /** The open turn, or the last one: when it began, its tool count, and its length once it ended. */
  turn?: { at: number; tools: number; wall?: number };
  tokens: { input: number; output: number };
  /** What the last turn re-sent: how full the window is. */
  context: number;
}

export interface PartRow {
  name: string;
  type: string;
  description: string;
  status: 'installed' | 'not-installed' | 'modified';
  /** Where the machine has it: the config's choice, else what the part recommends. */
  scope: ScopeChoice;
  recommended: Scope;
  /** Global row only: a part with a snippet or recipes has no global choice to cycle to. */
  projectOnly?: boolean;
  files: string[];
}

export interface Project {
  name: string;
  path: string;
  missions: Mission[];
  sessions: Session[];
  parts: PartRow[];
}

export interface InboxItem {
  kind: 'gate' | 'decision' | 'question';
  project: string;
  origin: string;
  label: string;
  at: number;
  /** The command that answers it in the session. Mission Control shows it and answers nothing. */
  answer?: string;
  file?: string;
  lines?: number;
  body?: string[];
  text?: string;
  tab?: string;
}

export interface Snapshot {
  projects: Project[];
  /** The user's own parts, under `~/.claude/`: the `~ global` row's PARTS. */
  global: PartRow[];
  inbox: InboxItem[];
  activity: Activity[];
  caffeinate: Caffeinate;
  launch: Launch;
}
