import { colors, symbols } from './theme.js'

interface StreamEvent {
  type: string
  message?: {
    content?: ContentBlock[]
  }
  subtype?: string
}

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
}

export class OutputFormatter {
  private projectRoot: string
  private agentSymbol: string
  private buffer: string = ''
  private lastMessage: string = ''
  private logLines: string[] = []

  constructor(projectRoot: string, agentSymbol: string) {
    this.projectRoot = projectRoot.endsWith('/') ? projectRoot : projectRoot + '/'
    this.agentSymbol = agentSymbol
  }

  getLog(): string {
    return this.logLines.join('\n')
  }

  processChunk(chunk: string): void {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      this.processLine(line)
    }
  }

  flush(): void {
    if (this.buffer.trim()) {
      this.processLine(this.buffer)
      this.buffer = ''
    }
  }

  getLastMessage(): string {
    return this.lastMessage
  }

  private processLine(line: string): void {
    let event: StreamEvent
    try {
      event = JSON.parse(line)
    } catch {
      return
    }

    if (event.type !== 'assistant') return
    if (!event.message?.content) return

    for (const block of event.message.content) {
      if (block.type === 'text' && block.text) {
        this.formatText(block.text)
        this.lastMessage = block.text
        continue
      }

      if (block.type === 'tool_use' && block.name) {
        this.formatToolUse(block.name, block.input ?? {})
      }
    }
  }

  private formatText(text: string): void {
    const lines = text.split('\n')
    const first = lines[0]?.trim()
    if (!first) return

    process.stdout.write('\n')
    const prefix = `${colors.cyan}${this.agentSymbol}${colors.reset}`
    console.log(`${prefix} ${first}`)
    this.logLines.push(`${this.agentSymbol} ${first}`)

    for (let i = 1; i < lines.length; i++) {
      const l = lines[i]?.trim()
      if (l) {
        console.log(`  ${l}`)
        this.logLines.push(`  ${l}`)
      }
    }
  }

  private formatToolUse(name: string, input: Record<string, unknown>): void {
    const detail = this.extractDetail(name, input)
    const logEntry = detail ? `  ${symbols.step} ${name} ${detail}` : `  ${symbols.step} ${name}`
    this.logLines.push(logEntry)

    const label = `${colors.gray}  ${symbols.step}${colors.reset} ${name}`
    if (detail) {
      console.log(`${label} ${colors.gray}${detail}${colors.reset}`)
    } else {
      console.log(label)
    }
  }

  private extractDetail(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case 'Read':
        return this.shorten(input.file_path as string)

      case 'Write': {
        const path = this.shorten(input.file_path as string)
        const content = input.content as string | undefined
        if (!content) return path
        const lineCount = content.split('\n').length
        return `${path}(${lineCount})`
      }

      case 'Edit':
        return this.shorten(input.file_path as string)

      case 'Bash': {
        const cmd = input.command as string | undefined
        if (!cmd) return ''
        return cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd
      }

      case 'Glob':
        return (input.pattern as string) ?? ''

      case 'Grep': {
        const pattern = input.pattern as string | undefined
        const path = input.path as string | undefined
        if (!pattern) return ''
        const short = path ? this.shorten(path) : ''
        return short ? `${pattern} ${short}` : pattern
      }

      case 'Agent': {
        const prompt = input.prompt as string | undefined
        if (!prompt) return ''
        const firstLine =
          prompt
            .split('\n')
            .find((l) => l.trim())
            ?.trim() ?? ''
        return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine
      }

      case 'ToolSearch':
        return (input.query as string) ?? ''

      case 'TodoWrite': {
        const todos = input.todos as Array<{ content?: string; status?: string }> | undefined
        if (!todos?.length) return ''
        const active = todos.find((t) => t.status === 'in_progress')
        return active?.content ?? `${todos.length} items`
      }

      case 'WebSearch':
        return (input.query as string) ?? ''

      case 'WebFetch':
        return (input.url as string) ?? ''

      case 'Skill': {
        const skill = input.skill as string | undefined
        const skillArgs = input.args as string | undefined
        if (!skill) return ''
        return skillArgs ? `${skill} ${skillArgs}` : skill
      }

      default:
        return ''
    }
  }

  private shorten(filePath: string | undefined): string {
    if (!filePath) return ''
    if (filePath.startsWith(this.projectRoot)) {
      return filePath.slice(this.projectRoot.length)
    }
    return filePath
  }
}
