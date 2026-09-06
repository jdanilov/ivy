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

/** One line of a session's progress log. Wiring reads these from Claude Code's transcript jsonl. */
export interface Activity {
  at: number;
  session: string;
  verb: 'Bash' | 'Edit' | 'Read' | 'Agent' | 'Text' | 'Ask' | 'Stop';
  text: string;
}

/** Which gates and rounds reach the human on this mission. */
export type Attention = 'full' | 'light' | 'unattended';

export interface Mission {
  name: string;
  workflow: string;
  status: 'open' | 'stub' | 'closed';
  state: RunState;
  attention: Attention;
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
  activity: Activity[];
  caffeinate: Caffeinate;
}
