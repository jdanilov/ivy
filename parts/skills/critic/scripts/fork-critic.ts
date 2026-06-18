#!/usr/bin/env bun

/**
 * fork-critic — spawn a fresh-context Claude critic, collect findings, output ranked JSON.
 *
 * Usage:
 *   bun fork-critic.ts [focus-area]
 *
 * Runs `claude -p` with the /critic skill prompt against the current git diff.
 * Parses the numbered findings, ranks them (major → minor → suggestion → testing),
 * and writes ranked JSON to stdout for the calling skill to present.
 */

import { spawn } from 'bun'

const PROJECT_ROOT = process.cwd()
const focusArea = process.argv.slice(2).join(' ')

// --- Build the critic prompt ---

function buildPrompt(diff: string, cached: string, focus: string): string {
  let prompt = `Act as a solution critic and code refactoring engineer. Review uncommitted changes against the existing codebase.

${focus ? `Focus area: ${focus}\n` : ''}
## Context — git diff

\`\`\`diff
${diff}
\`\`\`

## Context — git diff --cached

\`\`\`diff
${cached}
\`\`\`

## Review Checklist

**Integration with Existing Code**
- Does new code break existing functionality?
- Does new code duplicate patterns that already exist and should be reused?
- Should old code be removed or refactored given these changes?
- Does new code complicate what was working simply before?
- Does this code have happy-path bias?

**Code Quality Principles**
- **DRY**: Repeated logic that should be extracted?
- **KISS**: Over-engineered or unnecessarily complex?
- **Performance**: Inefficient operations, missing memoization and caching, redundant computations?
- **Separation of Concerns**: Mixed responsibilities, tight coupling?

**Correctness & Testing**
- Logic errors, edge cases, type safety issues?
- Is the code properly tested? Does it need unit or e2e tests?

## Output Format

You MUST output ONLY a valid JSON array. No markdown, no fences, no commentary.

Each element:
{
  "severity": "major" | "minor" | "suggestion" | "testing",
  "file": "path/to/file",
  "line": 42,
  "title": "Short description",
  "body": "Detailed explanation and suggested fix."
}

If code is clean, output an empty array: []`

  return prompt
}

// --- Collect git diff ---

async function gitDiff(args: string[]): Promise<string> {
  const proc = spawn({
    cmd: ['git', ...args],
    cwd: PROJECT_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const text = await new Response(proc.stdout).text()
  await proc.exited
  return text.trim()
}

// --- Run claude -p ---

async function runCritic(prompt: string): Promise<string> {
  const { CLAUDECODE: _, ...env } = process.env

  const proc = spawn({
    cmd: [
      'claude', '-p',
      '--model', 'opus',
      '--output-format', 'text',
      '--max-turns', '5',
      '--permission-mode', 'plan',
    ],
    cwd: PROJECT_ROOT,
    env,
    stdin: new Response(prompt),
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const text = await new Response(proc.stdout).text()
  const code = await proc.exited

  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`claude -p exited ${code}: ${stderr}`)
  }

  return text.trim()
}

// --- Parse findings from Claude output ---

interface Finding {
  severity: 'major' | 'minor' | 'suggestion' | 'testing'
  file: string
  line: number | null
  title: string
  body: string
}

const SEVERITY_RANK: Record<string, number> = {
  major: 0,
  minor: 1,
  suggestion: 2,
  testing: 3,
}

function parseFindings(raw: string): Finding[] {
  // Try to extract JSON from the response — Claude may wrap it in markdown fences
  let jsonStr = raw

  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim()
  }

  // Try to find a JSON array in the output
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
  if (!arrayMatch) return []

  try {
    const parsed = JSON.parse(arrayMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((f: any) => f && typeof f === 'object' && f.title)
      .map((f: any) => ({
        severity: SEVERITY_RANK[f.severity] !== undefined ? f.severity : 'suggestion',
        file: f.file || '',
        line: typeof f.line === 'number' ? f.line : null,
        title: String(f.title),
        body: String(f.body || ''),
      }))
  } catch {
    return []
  }
}

function rankFindings(findings: Finding[]): Finding[] {
  return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

// --- Main ---

const [diff, cached] = await Promise.all([
  gitDiff(['diff']),
  gitDiff(['diff', '--cached']),
])

if (!diff && !cached) {
  console.log(JSON.stringify([]))
  process.exit(0)
}

const prompt = buildPrompt(diff, cached, focusArea)

try {
  const raw = await runCritic(prompt)
  const findings = rankFindings(parseFindings(raw))
  console.log(JSON.stringify(findings, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    error: true,
    message: error instanceof Error ? error.message : 'Unknown error',
  }))
  process.exit(1)
}
