export interface PartFile {
  source: string;   // relative to ivy project root (e.g., "parts/skills/commit/skill.md")
  target: string;   // relative to target project root (e.g., ".claude/skills/commit/skill.md")
}

export interface EnvVar {
  name: string;
  description: string;
  url: string;      // where to get the key
}

export interface HookConfig {
  event: 'PreToolUse' | 'PostToolUse' | 'Stop';
  matcher: string;
  command: string;
}

export interface McpConfig {
  serverName: string;
  config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
}

export type PartType = 'skill' | 'script' | 'mcp';

export interface Part {
  name: string;
  type: PartType;
  description: string;
  default: boolean;        // enabled by default in install menu
  files: PartFile[];
  envVars?: EnvVar[];
  hooks?: HookConfig[];
  mcp?: McpConfig;
}

export type PartStatus = 'installed' | 'modified' | 'not-installed' | 'conflict';

export interface PartState {
  part: Part;
  status: PartStatus;
  files: Record<string, { exists: boolean; isSymlink: boolean; hashMatch: boolean }>;
}

export interface Manifest {
  version: number;
  ivy: string;             // path to ivy installation
  installedAt: string;
  updatedAt: string;
  parts: Record<string, ManifestPart>;
}

export interface ManifestPart {
  files: string[];
  hashes: Record<string, string>;
  hooks?: HookConfig[];
  mcp?: { serverName: string; config: object };
}

export interface EnvWarning {
  partName: string;
  envVar: EnvVar;
}
