import { readFileSync, writeFileSync } from 'fs'

export interface PlanItem {
  line: number
  text: string
  type: 'task' | 'ask-user' | 'fix' | 'wontfix' | 'criteria'
  checked: boolean
  section: string
}

export interface PlanState {
  name: string
  path: string
  goal: string
  items: PlanItem[]
  pending: PlanItem[]
  completed: PlanItem[]
  askUser: PlanItem[]
}

const CHECKBOX = /^- \[([ x])\] (.+)$/
const SECTION_RE = /^## (.+)$/
const PLAN_NAME_RE = /^# Plan: (.+)$/
const FENCE = /^```/

function detectType(text: string, section: string): PlanItem['type'] {
  if (section === 'Acceptance Criteria') return 'criteria'
  if (/^Ask user:/i.test(text)) return 'ask-user'
  if (/^WONTFIX:/i.test(text)) return 'wontfix'
  if (/^Fix:/i.test(text)) return 'fix'
  return 'task'
}

export function parsePlan(path: string): PlanState {
  const content = readFileSync(path, 'utf-8')
  const lines = content.split('\n')

  let name = ''
  let goal = ''
  let section = ''
  let inCodeBlock = false
  let inGoal = false
  const items: PlanItem[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (FENCE.test(line.trim())) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const nameMatch = line.match(PLAN_NAME_RE)
    if (nameMatch) {
      name = nameMatch[1].trim()
      continue
    }

    const sectionMatch = line.match(SECTION_RE)
    if (sectionMatch) {
      inGoal = sectionMatch[1].trim() === 'Goal'
      section = sectionMatch[1].trim()
      continue
    }

    if (inGoal) {
      const trimmed = line.trim()
      if (trimmed) goal += (goal ? ' ' : '') + trimmed
      continue
    }

    const m = line.match(CHECKBOX)
    if (!m) continue

    const checked = m[1] === 'x'
    const text = m[2].trim()
    items.push({
      line: i,
      text,
      type: detectType(text, section),
      checked,
      section,
    })
  }

  const tasks = items.filter((i) => i.type !== 'criteria')
  const pending = tasks.filter((i) => !i.checked)
  const completed = tasks.filter((i) => i.checked)
  const askUser = pending.filter((i) => i.type === 'ask-user')

  return { name, path, goal, items, pending, completed, askUser }
}

export function markItem(path: string, line: number, answer?: string): void {
  const content = readFileSync(path, 'utf-8')
  const lines = content.split('\n')

  if (line < 0 || line >= lines.length) return

  let updated = lines[line].replace('- [ ]', '- [x]')
  if (answer) updated += ` → ${answer}`
  lines[line] = updated

  writeFileSync(path, lines.join('\n'))
}

export function addItem(path: string, section: string, text: string): void {
  const content = readFileSync(path, 'utf-8')
  const lines = content.split('\n')

  let inSection = false
  let inCodeBlock = false
  let lastItemLine = -1
  let sectionHeaderLine = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (FENCE.test(line.trim())) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const m = line.match(SECTION_RE)
    if (m) {
      if (inSection) break
      if (m[1].trim() === section) {
        inSection = true
        sectionHeaderLine = i
      }
      continue
    }

    if (inSection && CHECKBOX.test(line)) {
      lastItemLine = i
    }
  }

  const insertAt = lastItemLine >= 0 ? lastItemLine + 1 : sectionHeaderLine + 1
  if (insertAt <= 0) return

  lines.splice(insertAt, 0, `- [ ] ${text}`)
  writeFileSync(path, lines.join('\n'))
}
