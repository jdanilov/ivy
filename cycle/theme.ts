export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

export const symbols = {
  developer: '\u25b6', // ▶
  critic: '\u21c4', // ⇄
  fixer: '\u2692', // ⚒
  committer: '\u2726', // ✦
  ok: '\u2713', // ✓
  fail: '\u2717', // ✗
  step: '\u2192', // →
  pending: '\u25cb', // ○
  done: '\u25cf', // ●
  ask: '?',
}

export type AgentRole = 'developer' | 'critic' | 'fixer' | 'committer'

export const agentConfig: Record<AgentRole, { symbol: string; label: string; color: string }> = {
  developer: { symbol: symbols.developer, label: 'Developer', color: colors.cyan },
  critic: { symbol: symbols.critic, label: 'Critic', color: colors.cyan },
  fixer: { symbol: symbols.fixer, label: 'Fixer', color: colors.cyan },
  committer: { symbol: symbols.committer, label: 'Committer', color: colors.cyan },
}

export const SEPARATOR = `${colors.gray}${'─'.repeat(50)}${colors.reset}`
