import { select, text, isCancel } from '@clack/prompts'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { parsePlan, type PlanItem } from './plan.js'
import { colors, symbols, agentConfig, SEPARATOR } from './theme.js'
import type { AgentRole } from './theme.js'

function relativeTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function printHeader(
  planName: string,
  iteration: number,
  pending: number,
  completed: number,
): void {
  const total = pending + completed
  process.stdout.write('\n')
  console.log(
    `${colors.cyan}${colors.bright}Cycle${colors.reset} ${colors.gray}\u00b7${colors.reset} ${planName} ${colors.gray}\u00b7 iteration ${iteration}${colors.reset}`,
  )
  console.log(SEPARATOR)
  console.log(
    `  ${completed}/${total} tasks ${colors.gray}\u00b7${colors.reset} ${completed} done ${colors.gray}\u00b7${colors.reset} ${pending} remaining`,
  )
  process.stdout.write('\n')
}

export function printAgentStart(agent: AgentRole, iteration: number): void {
  const cfg = agentConfig[agent]
  process.stdout.write('\n')
  console.log(
    `${cfg.color}${cfg.symbol} ${cfg.label}${colors.reset} ${colors.gray}\u00b7 iteration ${iteration}${colors.reset}`,
  )
}

export function printPlanSummary(
  items: Array<{ text: string; checked: boolean; type: string }>,
): void {
  for (const item of items) {
    if (item.type === 'ask-user') {
      console.log(`  ${colors.yellow}${symbols.ask}${colors.reset} ${item.text}`)
    } else if (item.checked) {
      console.log(
        `  ${colors.green}${symbols.done}${colors.reset} ${colors.dim}${item.text}${colors.reset}`,
      )
    } else {
      console.log(`  ${symbols.pending} ${item.text}`)
    }
  }
  console.log()
}

export function printPlanDiff(prev: PlanItem[], curr: PlanItem[]): void {
  const prevMap = new Map(prev.map((i) => [i.text, i]))
  const currMap = new Map(curr.map((i) => [i.text, i]))
  let changes = 0

  // Newly checked
  for (const item of curr) {
    const old = prevMap.get(item.text)
    if (old && !old.checked && item.checked) {
      const isWontfix = item.type === 'wontfix'
      const sym = isWontfix ? symbols.fail : symbols.ok
      const color = isWontfix ? colors.yellow : colors.green
      console.log(`  ${color}${sym}${colors.reset} ${colors.dim}${item.text}${colors.reset}`)
      changes++
    }
  }

  // Newly added
  for (const item of curr) {
    if (!prevMap.has(item.text)) {
      if (item.checked) {
        const isWontfix = item.type === 'wontfix'
        const sym = isWontfix ? symbols.fail : symbols.ok
        const color = isWontfix ? colors.yellow : colors.green
        console.log(
          `  ${color}${sym}${colors.reset} ${colors.dim}${item.text}${colors.reset} ${colors.dim}(new)${colors.reset}`,
        )
      } else {
        const sym =
          item.type === 'ask-user' ? symbols.ask : item.type === 'fix' ? symbols.fail : symbols.step
        const color =
          item.type === 'ask-user' ? colors.yellow : item.type === 'fix' ? colors.red : colors.cyan
        console.log(
          `  ${color}${sym}${colors.reset} ${item.text} ${colors.dim}(new)${colors.reset}`,
        )
      }
      changes++
    }
  }

  // Removed
  for (const item of prev) {
    if (!currMap.has(item.text)) {
      console.log(`  ${colors.dim}${symbols.fail} ${item.text} (removed)${colors.reset}`)
      changes++
    }
  }

  if (changes === 0) {
    console.log(`  ${colors.dim}no changes${colors.reset}`)
  }
  console.log()
}

export async function pickPlan(plansDir: string): Promise<string | null> {
  let files: string[]
  try {
    files = readdirSync(plansDir).filter((f) => f.endsWith('.md'))
  } catch {
    files = []
  }
  if (!files.length) {
    console.log()
    console.log(
      `${colors.cyan}${colors.bright}Cycle${colors.reset} ${colors.gray}\u00b7 no plans found${colors.reset}`,
    )
    console.log()
    console.log(`  Create a plan first:`)
    console.log(
      `  ${colors.dim}${symbols.step} claude /brainstorm <task description>${colors.reset}`,
    )
    console.log(
      `  ${colors.dim}${symbols.step} or manually create docs/plans/<name>.md${colors.reset}`,
    )
    console.log()
    return null
  }

  const entries = files.map((f) => {
    const fullPath = join(plansDir, f)
    const mtime = statSync(fullPath).mtimeMs
    const plan = parsePlan(fullPath)
    const total = plan.pending.length + plan.completed.length
    const done = plan.completed.length
    return { name: plan.name || f.replace(/\.md$/, ''), fullPath, mtime, total, done }
  })

  entries.sort((a, b) => b.mtime - a.mtime)

  const now = Date.now()
  const result = await select({
    message: 'Pick a plan',
    options: entries.map((e) => {
      const time = relativeTime(now - e.mtime)
      const status = e.done === e.total && e.total > 0 ? 'complete' : `${e.done}/${e.total} done`
      return {
        value: e.fullPath,
        label: e.name,
        hint: `${status} \u00b7 ${time}`,
      }
    }),
  })

  if (isCancel(result)) return null
  return result as string
}

export async function askUserQuestions(
  questions: Array<{ line: number; text: string }>,
): Promise<Array<{ line: number; answer: string }>> {
  const answers: Array<{ line: number; answer: string }> = []

  for (const q of questions) {
    console.log(`  ${colors.yellow}${symbols.ask}${colors.reset} Developer needs your input:`)
    console.log(`    ${q.text}`)

    const response = await text({
      message: q.text,
      placeholder: "Press Enter for 'up to you'",
    })

    if (isCancel(response)) break

    const answer = (response as string)?.trim() || 'Up to you, pick the best route'
    answers.push({ line: q.line, answer })
  }

  return answers
}

export function printDone(planName: string, total: number): void {
  console.log(
    `${colors.green}${symbols.ok} Cycle${colors.reset} ${colors.gray}\u00b7${colors.reset} ${planName} ${colors.gray}\u00b7 all ${total} tasks complete${colors.reset}`,
  )
}

export function printWatching(planPath: string): void {
  console.log(
    `\n${colors.cyan}${symbols.pending} Cycle${colors.reset} ${colors.gray}\u00b7 watching for new todos in${colors.reset} ${planPath}`,
  )
  console.log(
    `  ${colors.dim}Add a - [ ] item to the plan to continue, Ctrl+C to exit${colors.reset}`,
  )
}

export async function pickStartAgent(): Promise<AgentRole | null> {
  const result = await select({
    message: 'Start with',
    options: [
      {
        value: 'developer' as AgentRole,
        label: `${symbols.developer} Developer`,
        hint: 'implement next tasks',
      },
      {
        value: 'critic' as AgentRole,
        label: `${symbols.critic} Critic`,
        hint: 'review & validate dev work',
      },
      {
        value: 'fixer' as AgentRole,
        label: `${symbols.fixer} Fixer`,
        hint: 'address critic findings',
      },
      {
        value: 'committer' as AgentRole,
        label: `${symbols.committer} Committer`,
        hint: 'commit accepted work',
      },
    ],
  })

  if (isCancel(result)) return null
  return result as AgentRole
}

export function printPaused(planSlug: string): void {
  console.log(
    `\n${colors.yellow}Cycle paused.${colors.reset} Resume: ${colors.dim}ivy cycle ${planSlug}${colors.reset}`,
  )
}
