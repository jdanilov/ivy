import path from 'node:path';
import type { Part, PartFile } from '../types.js';

// Resolve IVY_ROOT from this file's location: src/core/ -> project root
export const IVY_ROOT = path.resolve(import.meta.dir, '..', '..');

/** Derive { source, target } from just a source path.
 *  parts/X  → .claude/X
 *  cycle/X  → .claude/skills/cycle/X
 */
function src(source: string): PartFile {
  if (source.startsWith('parts/')) return { source, target: '.claude/' + source.slice('parts/'.length) };
  if (source.startsWith('cycle/')) return { source, target: '.claude/skills/cycle/' + source.slice('cycle/'.length) };
  throw new Error(`Cannot derive target for source: ${source}`);
}

export const PARTS: Part[] = [
  {
    name: 'brainstorm',
    type: 'skill',
    description: 'interactive planning (opus)',
    default: true,
    files: [
      src('parts/skills/brainstorm/skill.md'),
    ],
  },
  {
    name: 'explain',
    type: 'skill',
    description: 'visual code explanations and flow diagrams (sonnet)',
    default: true,
    files: [
      src('parts/skills/explain/skill.md'),
    ],
  },
  {
    name: 'critic',
    type: 'skill',
    description: 'reviews uncommitted changes and works through findings (opus)',
    default: true,
    files: [
      src('parts/skills/critic/skill.md'),
      src('parts/agents/Critic.md'),
    ],
  },
  {
    name: 'commit',
    type: 'skill',
    description: 'structured git commits (sonnet)',
    default: true,
    files: [
      src('parts/skills/commit/skill.md'),
      src('parts/agents/Commit.md'),
    ],
  },
  {
    name: 'research',
    type: 'tool',
    description: 'web research via Grok',
    default: true,
    files: [
      src('parts/skills/research/skill.md'),
      src('parts/skills/research/scripts/research.ts'),
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
      src('parts/skills/capture/skill.md'),
      src('parts/skills/capture/scripts/capture.js'),
    ],
  },
  {
    name: 'cycle',
    type: 'tool',
    description: 'develop ↔ critic ↔ fix loop',
    default: true,
    files: [
      src('parts/skills/cycle/skill.md'),
      src('cycle/index.ts'),
      src('cycle/runner.ts'),
      src('cycle/plan.ts'),
      src('cycle/formatter.ts'),
      src('cycle/ui.ts'),
      src('cycle/theme.ts'),
      src('cycle/prompts/developer.md'),
      src('cycle/prompts/critic.md'),
      src('cycle/prompts/fixer.md'),
    ],
  },
  {
    name: 'hook-safe-bash',
    type: 'fixture',
    description: 'block destructive commands',
    default: true,
    files: [
      src('parts/scripts/safe-bash.sh'),
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
    name: 'hook-sounds',
    type: 'fixture',
    description: 'sonar notification on session end',
    default: true,
    files: [
      src('parts/sounds/sonar-deep.mp3'),
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
