export interface PartFile {
  source: string;   // relative to the Factory root (e.g., "parts/commit/skill.md")
  target: string;   // relative to the target project root
  /** Template file: install it only when the project has nothing there yet. */
  skipIfExists?: boolean;
}

export interface EnvVar {
  name: string;
  description: string;
  url: string;      // where to get the key
}

export const HOOK_EVENTS = [
  'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop',
  'SubagentStart', 'SubagentStop', 'PreCompact', 'SessionStart', 'SessionEnd',
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface HookConfig {
  event: HookEvent;
  /** Omitted for events Claude Code does not match on (UserPromptSubmit, Stop). */
  matcher?: string;
  command: string;
}

export interface McpConfig {
  serverName: string;
  config: {
    type?: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
}

/** A line a part owns in the project's agent file, added on install and taken back on uninstall. */
export interface Snippet {
  /** Overrides the AGENTS.md / CLAUDE.md resolution. */
  file?: string;
  section: string;   // an ATX heading line, e.g. "## Important Files"
  line: string;
}

/** Where the line actually went, plus the project's own line about the same path it displaced. */
export interface SnippetRecord extends Required<Snippet> {
  replaced?: string;
  /** The install created the file to hold this line, so an uninstall that empties it may delete it. */
  created?: true;
}

/** Shell lines run once in the project root: init when the part lands, uninit when it goes. */
export interface Recipes {
  init?: string[];
  uninit?: string[];
}

export type PartType = 'skill' | 'tool' | 'fixture' | 'mcp';

/** A fragment merged into `.claude/settings.json`: string lists union, scalars overwrite. */
export type Settings = Record<string, unknown>;

export interface Part {
  name: string;
  type: PartType;
  description: string;
  default: boolean;        // enabled by default in install menu
  files: PartFile[];
  envVars?: EnvVar[];
  hooks?: HookConfig[];
  mcp?: McpConfig;
  settings?: Settings;
  snippet?: Snippet;
  recipes?: Recipes;
  /** Defaults for `${name}` in hooks, mcp and recipes. `~/.factory/config.yaml` wins. */
  vars?: Record<string, string>;
}

export type PartStatus = 'installed' | 'modified' | 'not-installed' | 'conflict' | 'skipped';

export interface PartState {
  part: Part;
  status: PartStatus;
  files: Record<string, { exists: boolean; isSymlink: boolean; hashMatch: boolean }>;
}

export interface Manifest {
  version: number;
  factory: string;         // path to the Factory installation
  installedAt: string;
  updatedAt: string;
  parts: Record<string, ManifestPart>;
  /** Parts this project owns itself: `update --skip` never installs or touches them again. */
  skipped?: string[];
}

export interface ManifestPart {
  files: string[];
  hashes: Record<string, string>;
  hooks?: HookConfig[];
  mcp?: { serverName: string; config: object };
  settings?: Settings;
  /** Resolved at install time: uninstall removes this line from this file, no fresh guess. */
  snippet?: SnippetRecord;
  /** Resolved uninit lines, kept here so a part the registry dropped can still clean up. */
  uninit?: string[];
  /** Set once `recipes.init` succeeded. Its absence is what makes `update` run init. */
  initAt?: string;
}

export interface EnvWarning {
  partName: string;
  envVar: EnvVar;
}

// ── Workflows and missions ───────────────────────────────────────────────────

export interface WorkflowStep {
  name: string;
  role?: string;
  gate?: 'human' | 'orchestrator';
  parallel?: string[];
  loop?: { back: string; max: number; human_from: number };
}

export interface Workflow {
  name: string;
  steps: WorkflowStep[];
}

export type Attention = 'full' | 'light' | 'unattended';
export type StepStatus = 'pending' | 'running' | 'done' | 'skipped';
export type GateAnswer = 'accept' | 'amend' | 'reject';

export interface GateState {
  status: 'open' | 'answered';
  file?: string;
  answer?: GateAnswer;
  note?: string;
  at: string;
}

export interface StepState {
  status: StepStatus;
  startedAt?: string;
  endedAt?: string;
  reason?: string;
}

export interface Deviation {
  at: string;
  what: string;
  reason: string;
}

export interface MissionState {
  name: string;
  title: string;
  workflow: string;
  attention: Attention;
  /** A stub has intent and no branch: `mission open` promotes it. */
  status: 'stub' | 'open' | 'closed';
  step: string;
  round: number;
  session: string | null;
  branch: string | null;
  worktree: string | null;
  gates: Record<string, GateState>;
  steps: Record<string, StepState>;
  deviations: Deviation[];
  created: string;
  updated: string;
}

export interface Claim {
  mission: string;
  session: string | null;
  at: string;
}

/** A mission on disk: the folder in the main checkout plus its parsed state. */
export interface Mission {
  dir: string;
  state: MissionState;
}

// ── Presets ──────────────────────────────────────────────────────────────────

/** A spawn-time bundle: presets/<name>/{preset.yaml,prompt.md,settings.json,mcp.json}. */
export interface Preset {
  name: string;
  dir: string;
  model: string;
  effort: string;
  mcp: string[];
  sendMessage: boolean;
}
