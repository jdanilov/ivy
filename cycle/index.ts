/**
 * Cycle — Claude Code agent orchestration harness.
 *
 * Loop: Developer → Critic → Fixer (if findings) → Committer
 *
 * Usage:
 *   ivy cycle <plan-name>     Run a specific plan
 *   ivy cycle                 Pick from available plans
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, watch } from 'fs'
import { resolve, basename } from 'path'
import { parsePlan, markItem } from './plan.js'
import { runClaude } from './runner.js'
import { OutputFormatter } from './formatter.js'
import { colors, symbols, agentConfig } from './theme.js'
import type { AgentRole } from './theme.js'
import {
  printHeader,
  printAgentStart,
  printPlanSummary,
  printPlanDiff,
  printDone,
  printWatching,
  printPaused,
  pickPlan,
  pickStartAgent,
  askUserQuestions,
} from './ui.js'
import type { PlanItem } from './plan.js'

const CYCLE_ROOT = resolve(import.meta.dir)
const PROMPTS_DIR = resolve(CYCLE_ROOT, 'prompts')

let PROJECT_ROOT = ''
let PLANS_DIR = ''
let LOGS_DIR = ''

function initPaths(projectDir?: string) {
  PROJECT_ROOT = projectDir || process.cwd()
  PLANS_DIR = resolve(PROJECT_ROOT, 'docs/plans')
  LOGS_DIR = resolve(PROJECT_ROOT, '.claude/cycle/logs')
}

// --- Log persistence ---

interface IvyLogs {
  iteration: number
  devLog?: string
  criticLog?: string
  fixerLog?: string
}

function logsPath(planPath: string): string {
  return resolve(LOGS_DIR, `${basename(planPath, '.md')}.json`)
}

function loadLogs(planPath: string): IvyLogs {
  const p = logsPath(planPath)
  if (!existsSync(p)) return { iteration: 0 }
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return { iteration: 0 }
  }
}

function saveLogs(planPath: string, logs: IvyLogs): void {
  mkdirSync(LOGS_DIR, { recursive: true })
  writeFileSync(logsPath(planPath), JSON.stringify(logs, null, 2))
}

// --- Prompt builders ---

function loadPrompt(name: string, vars: Record<string, string>): string {
  const path = resolve(PROMPTS_DIR, `${name}.md`)
  try {
    const raw = readFileSync(path, 'utf-8')
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), raw)
  } catch {
    throw new Error(`Prompt template not found: cycle/prompts/${name}.md`)
  }
}

const baseVars = (planPath: string) => ({ projectDir: PROJECT_ROOT, planPath })

function buildDeveloperPrompt(planPath: string, prevDevLog?: string): string {
  let prompt = loadPrompt('developer', baseVars(planPath))
  if (prevDevLog) {
    prompt += `\n\n---\n## Previous Developer iteration log\n\`\`\`\n${prevDevLog}\n\`\`\``
  }
  return prompt
}

function buildCriticPrompt(planPath: string, devLog?: string, prevCriticLog?: string): string {
  let prompt = loadPrompt('critic', baseVars(planPath))
  if (devLog) {
    prompt += `\n\n---\n## Developer log (this iteration)\n\`\`\`\n${devLog}\n\`\`\``
  }
  if (prevCriticLog) {
    prompt += `\n\n## Previous Critic iteration log\n\`\`\`\n${prevCriticLog}\n\`\`\``
  }
  return prompt
}

function buildFixerPrompt(planPath: string, criticLog?: string, prevFixerLog?: string): string {
  let prompt = loadPrompt('fixer', baseVars(planPath))
  if (criticLog) {
    prompt += `\n\n---\n## Critic log (this iteration)\n\`\`\`\n${criticLog}\n\`\`\``
  }
  if (prevFixerLog) {
    prompt += `\n\n## Previous Fixer iteration log\n\`\`\`\n${prevFixerLog}\n\`\`\``
  }
  return prompt
}

// --- Plan resolution ---

async function resolvePlanPath(arg?: string): Promise<string | null> {
  if (arg) {
    const direct = resolve(arg)
    if (await Bun.file(direct).exists()) return direct

    const named = resolve(PLANS_DIR, `${arg}.md`)
    if (await Bun.file(named).exists()) return named

    console.error(`${colors.red}${symbols.fail}${colors.reset} Plan not found: ${arg}`)
    return null
  }

  return pickPlan(PLANS_DIR)
}

// --- Agent runner ---

async function runAgent(
  role: AgentRole,
  prompt: string,
  iteration: number,
  model?: string,
): Promise<{ success: boolean; log: string }> {
  const cfg = agentConfig[role]
  printAgentStart(role, iteration)

  const formatter = new OutputFormatter(PROJECT_ROOT, cfg.symbol)
  const opts = model ? { cwd: PROJECT_ROOT, model } : { cwd: PROJECT_ROOT }
  const result = await runClaude(prompt, opts, (chunk) => {
    formatter.processChunk(chunk)
  })
  formatter.flush()

  console.log()
  return { success: result.success, log: formatter.getLog() }
}

// --- Watch mode ---

function watchForNewTodos(planPath: string): Promise<void> {
  return new Promise((resolve) => {
    const watcher = watch(planPath, { persistent: true }, () => {
      try {
        const plan = parsePlan(planPath)
        if (plan.pending.length > 0) {
          watcher.close()
          resolve()
        }
      } catch {
        // File may be mid-write; next watch event will retry
      }
    })
  })
}

// --- Main loop ---

const AGENT_ORDER: AgentRole[] = ['developer', 'critic', 'fixer', 'committer']

function shouldSkip(role: AgentRole, startWith: AgentRole): boolean {
  return AGENT_ORDER.indexOf(role) < AGENT_ORDER.indexOf(startWith)
}

// Auto-run when executed directly (not imported)
const isDirectRun = import.meta.path === Bun.main
if (isDirectRun) {
  const args = process.argv.slice(2)
  main(args[0]).catch((err) => {
    console.error(`${colors.red}Fatal:${colors.reset}`, err)
    process.exit(1)
  })
}

export async function main(planArg?: string, projectDir?: string) {
  initPaths(projectDir)
  const planPath = await resolvePlanPath(planArg)

  if (!planPath) {
    process.exit(0)
  }

  const slug = basename(planPath, '.md')
  const planName = parsePlan(planPath).name || slug

  // Restore logs from previous session
  const saved = loadLogs(planPath)
  let iteration = saved.iteration
  let prevDevLog: string | undefined = saved.devLog
  let prevCriticLog: string | undefined = saved.criticLog
  let prevFixerLog: string | undefined = saved.fixerLog
  let prevItems: PlanItem[] | undefined

  // Pick which agent to start with
  const startWith = await pickStartAgent()
  if (!startWith) process.exit(0)

  if (iteration > 0) {
    console.log(
      `\n${colors.gray}Resuming from iteration ${iteration} (logs recovered)${colors.reset}`,
    )
  }

  process.on('SIGINT', () => {
    printPaused(slug)
    process.exit(0)
  })

  // Closure to persist current state
  const persist = () =>
    saveLogs(planPath, {
      iteration,
      devLog: prevDevLog,
      criticLog: prevCriticLog,
      fixerLog: prevFixerLog,
    })

  let firstIteration = true

  while (true) {
    iteration++
    const plan = parsePlan(planPath)

    printHeader(planName, iteration, plan.pending.length, plan.completed.length)

    if (prevItems) {
      printPlanDiff(prevItems, plan.items)
    } else {
      printPlanSummary(plan.items)
    }

    prevItems = plan.items

    // Handle ask-user questions first
    if (plan.askUser.length > 0) {
      const questions = plan.askUser.map((q) => ({
        line: q.line,
        text: q.text.replace(/^Ask user:\s*/i, ''),
      }))
      const answers = await askUserQuestions(questions)
      for (const a of answers) {
        markItem(planPath, a.line, a.answer)
      }
      continue
    }

    const skip = (role: AgentRole) => firstIteration && shouldSkip(role, startWith)

    // Nothing pending — enter watch mode, wait for new todos
    if (plan.pending.length === 0) {
      printDone(planName, plan.items.length)
      printWatching(planPath)
      await watchForNewTodos(planPath)
      continue
    }

    // --- Developer ---
    if (!skip('developer')) {
      const devPrompt = buildDeveloperPrompt(planPath, prevDevLog)
      const dev = await runAgent('developer', devPrompt, iteration)

      if (!dev.success) {
        console.log(`${colors.red}${symbols.fail} Developer agent failed${colors.reset}`)
        persist()
        process.exit(1)
      }

      prevDevLog = dev.log
      persist()

      // Re-read plan — developer may have added ask-user items
      const postDev = parsePlan(planPath)
      if (postDev.askUser.length > 0) continue
    }

    // --- Critic ---
    if (!skip('critic')) {
      const criticPrompt = buildCriticPrompt(planPath, prevDevLog, prevCriticLog)
      const critic = await runAgent('critic', criticPrompt, iteration)

      if (!critic.success) {
        console.log(
          `${colors.yellow}${symbols.fail} Critic agent failed — continuing${colors.reset}`,
        )
      }

      prevCriticLog = critic.log
      persist()
    }

    // --- Fixer (only if Critic filed findings) ---
    if (!skip('fixer')) {
      const postCritic = parsePlan(planPath)
      const fixItems = postCritic.pending.filter((i) => i.type === 'fix')

      if (fixItems.length > 0) {
        const fixerPrompt = buildFixerPrompt(planPath, prevCriticLog, prevFixerLog)
        const fixer = await runAgent('fixer', fixerPrompt, iteration)

        if (!fixer.success) {
          console.log(
            `${colors.yellow}${symbols.fail} Fixer agent failed — continuing${colors.reset}`,
          )
        }

        prevFixerLog = fixer.log
        persist()
      }
    }

    // --- Committer (sonnet, just runs /commit) ---
    const committer = await runAgent('committer', '/commit', iteration, 'sonnet')

    if (!committer.success) {
      console.log(`${colors.yellow}${symbols.fail} Committer failed — continuing${colors.reset}`)
    }

    persist()
    firstIteration = false

    // Re-check after full agent sequence — enter watch if all done
    const postCommit = parsePlan(planPath)
    if (postCommit.pending.length === 0) {
      printDone(planName, postCommit.items.length)
      printWatching(planPath)
      await watchForNewTodos(planPath)
    }
  }
}
