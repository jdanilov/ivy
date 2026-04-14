import { spawn } from 'bun'

export interface RunResult {
  success: boolean
}

export interface RunOptions {
  cwd: string
  maxTurns?: number
  model?: string
}

export async function runClaude(
  prompt: string,
  opts: RunOptions,
  onChunk: (chunk: string) => void,
): Promise<RunResult> {
  const args = [
    '-p',
    '--model',
    opts.model ?? 'opus',
    '--permission-mode',
    'acceptEdits',
    '--dangerously-skip-permissions',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    String(opts.maxTurns ?? 200),
  ]

  const proc = spawn({
    cmd: ['claude', ...args],
    cwd: opts.cwd,
    stdin: new Response(prompt),
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const decoder = new TextDecoder()
  let resultSeen = false
  let stdoutBuffer = ''

  const readStdout = async () => {
    const reader = proc.stdout.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        onChunk(chunk)

        // Detect the result event — signals claude -p is done
        stdoutBuffer += chunk
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.type === 'result') {
              resultSeen = true
            }
          } catch {
            // not JSON, ignore
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  const readStderr = async () => {
    const reader = proc.stderr.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        if (text.trim()) {
          console.error(text.trimEnd())
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  // Race: wait for normal exit OR result event + grace period
  const EXIT_GRACE_MS = 5_000

  const streamDone = Promise.all([readStdout(), readStderr()])

  const exitOrTimeout = async (): Promise<number> => {
    // Wait for streams to finish (normal path)
    await streamDone

    if (resultSeen) {
      // Result event seen — give process a short grace period to exit
      const exit = await Promise.race([
        proc.exited,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), EXIT_GRACE_MS)),
      ])

      if (exit !== null) return exit

      // Process didn't exit in time — kill it
      proc.kill('SIGTERM')
      const afterKill = await Promise.race([
        proc.exited,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
      ])
      if (afterKill !== null) return afterKill

      proc.kill('SIGKILL')
      return await proc.exited
    }

    // No result event — just wait for exit
    return await proc.exited
  }

  const exitCode = await exitOrTimeout()

  return { success: exitCode === 0 || resultSeen }
}
