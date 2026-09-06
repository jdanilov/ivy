/** What Mission Control draws. The wiring step fills these from state.json, events and manifests. */

export type RunState = 'pending' | 'running' | 'done' | 'failed' | 'blocked' | 'skipped';

/** Which colour family a step belongs to, independent of where it is in its life. */
export type StepKind = 'plain' | 'gate' | 'implement' | 'gatekeeper';

export interface StepRow {
  name: string;
  kind: StepKind;
  status: RunState;
  role?: string;
  wall?: number;
  gateOpen?: boolean;
}

export interface EventRow {
  at: number;
  verb: string;
  detail: string;
  mark?: string;
}

export interface Mission {
  name: string;
  workflow: string;
  status: 'open' | 'stub' | 'closed';
  state: RunState;
  step: string | null;
  round: number;
  session: string | null;
  branch: string | null;
  worktree: string | null;
  caffeinate: boolean;
  wall: number;
  tokens: { input: number; cached: number; output: number };
  steps: StepRow[];
  deviations: number;
  events: EventRow[];
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

/** AUTO holds the machine awake while a mission session runs, ON always, OFF never. */
export type Caffeinate = 'auto' | 'on' | 'off';

export interface Snapshot {
  projects: Project[];
  inbox: InboxItem[];
  caffeinate: Caffeinate;
}
