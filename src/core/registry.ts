import path from 'node:path';
import type { Part } from '../types.js';

// Resolve IVY_ROOT from this file's location: src/core/ -> project root
export const IVY_ROOT = path.resolve(import.meta.dir, '..', '..');

export const PARTS: Part[] = [
  {
    name: 'brainstorm',
    type: 'skill',
    description: 'interactive planning (opus)',
    default: true,
    files: [
      { source: 'parts/skills/brainstorm/skill.md', target: '.claude/skills/brainstorm/skill.md' },
    ],
  },
  {
    name: 'flow',
    type: 'skill',
    description: 'system flow diagrams (sonnet)',
    default: true,
    files: [
      { source: 'parts/skills/flow/skill.md', target: '.claude/skills/flow/skill.md' },
    ],
  },
  {
    name: 'dry',
    type: 'skill',
    description: 'code critic review (opus)',
    default: true,
    files: [
      { source: 'parts/skills/dry/skill.md', target: '.claude/skills/dry/skill.md' },
    ],
  },
  {
    name: 'commit',
    type: 'skill',
    description: 'structured git commits (sonnet)',
    default: true,
    files: [
      { source: 'parts/skills/commit/skill.md', target: '.claude/skills/commit/skill.md' },
    ],
  },
  {
    name: 'research',
    type: 'tool',
    description: 'web research via Grok',
    default: true,
    files: [
      { source: 'parts/skills/research/skill.md', target: '.claude/skills/research/skill.md' },
      { source: 'parts/skills/research/scripts/research.ts', target: '.claude/skills/research/scripts/research.ts' },
    ],
    envVars: [
      { name: 'XAI_API_KEY', description: 'Grok AI API key', url: 'https://console.x.ai' },
    ],
  },
  {
    name: 'capture',
    type: 'tool',
    description: 'screenshot capture',
    default: false,
    files: [
      { source: 'parts/skills/capture/skill.md', target: '.claude/skills/capture/skill.md' },
      { source: 'parts/skills/capture/scripts/capture.js', target: '.claude/skills/capture/scripts/capture.js' },
    ],
  },
  {
    name: 'cycle',
    type: 'tool',
    description: 'develop ↔ critic ↔ fix loop',
    default: true,
    files: [
      { source: 'parts/skills/cycle/skill.md', target: '.claude/skills/cycle/skill.md' },
      { source: 'cycle/index.ts', target: '.claude/skills/cycle/index.ts' },
      { source: 'cycle/runner.ts', target: '.claude/skills/cycle/runner.ts' },
      { source: 'cycle/plan.ts', target: '.claude/skills/cycle/plan.ts' },
      { source: 'cycle/formatter.ts', target: '.claude/skills/cycle/formatter.ts' },
      { source: 'cycle/ui.ts', target: '.claude/skills/cycle/ui.ts' },
      { source: 'cycle/theme.ts', target: '.claude/skills/cycle/theme.ts' },
      { source: 'cycle/prompts/developer.md', target: '.claude/skills/cycle/prompts/developer.md' },
      { source: 'cycle/prompts/critic.md', target: '.claude/skills/cycle/prompts/critic.md' },
      { source: 'cycle/prompts/fixer.md', target: '.claude/skills/cycle/prompts/fixer.md' },
    ],
  },
  {
    name: 'safe-bash',
    type: 'fixture',
    description: 'block destructive commands',
    default: true,
    files: [
      { source: 'parts/scripts/safe-bash.sh', target: '.claude/scripts/safe-bash.sh' },
    ],
    hooks: [
      {
        event: 'PreToolUse',
        matcher: 'Bash',
        command: '$CLAUDE_PROJECT_DIR/.claude/scripts/safe-bash.sh',
      },
    ],
  },
  {
    name: 'sounds',
    type: 'fixture',
    description: 'sonar notification on session end',
    default: true,
    files: [
      { source: 'parts/sounds/sonar-deep.mp3', target: '.claude/sounds/sonar-deep.mp3' },
    ],
    hooks: [
      {
        event: 'Stop',
        matcher: '*',
        command: 'afplay $CLAUDE_PROJECT_DIR/.claude/sounds/sonar-deep.mp3 &',
      },
    ],
  },
  {
    name: 'glm',
    type: 'mcp',
    description: 'GLM model proxy',
    default: false,
    files: [],
    mcp: {
      serverName: 'glm',
      config: {
        command: 'bun',
        args: [path.join(IVY_ROOT, 'mcps/glm/index.ts')],
      },
    },
    envVars: [
      { name: 'GLM_API_KEY', description: 'GLM API key for z.ai', url: 'https://open.bigmodel.cn' },
    ],
  },
];

export function getPartByName(name: string): Part | undefined {
  return PARTS.find((p) => p.name === name);
}
