#!/usr/bin/env bun

import { createXai } from "@ai-sdk/xai"
import { generateText } from "ai"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"

const PROJECT_ROOT = process.cwd()
const OUTPUT_DIR = join(PROJECT_ROOT, "docs/research")

const KEY_NAMES = ["XAI_API_KEY", "xai_api_key", "XAPI_KEY", "xapi_key", "X_AI_API_KEY", "x_ai_api_key"]

async function tryFile(path: string, parser: (content: string) => string | null): Promise<string | null> {
  try {
    const content = await readFile(path, "utf-8")
    return parser(content)
  } catch {
    return null
  }
}

async function loadApiKey(): Promise<string> {
  // Try .env file
  const envKey = await tryFile(join(PROJECT_ROOT, ".env"), (content) => {
    for (const line of content.split("\n")) {
      for (const name of KEY_NAMES) {
        const match = line.match(new RegExp(`^${name}=(.+)$`))
        if (match) return match[1].trim()
      }
    }
    return null
  })
  if (envKey) return envKey

  // Try environment variables
  for (const name of KEY_NAMES) {
    if (process.env[name]) return process.env[name]!
  }

  throw new Error("XAI API key not found. Set it in .env or as an environment variable.")
}

const apiKey = await loadApiKey()
const xai = createXai({ apiKey })

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50)
}

function getDatePrefix(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

async function saveOutput(query: string, content: string): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const filename = `${getDatePrefix()}-${toKebabCase(query)}.md`
  const filepath = join(OUTPUT_DIR, filename)
  await writeFile(filepath, content, "utf-8")
  return filepath
}

async function research(query: string, useX: boolean): Promise<void> {
  try {
    const systemPrompt =
      "You are a research assistant. Search the web thoroughly, synthesize findings into clear Markdown, and cite sources." +
      (useX ? " Also search X/Twitter for relevant posts, discussions, and insights." : "")

    const options = {
      model: xai.responses("grok-4.20-beta-0309-reasoning"),
      // model: xai.responses("grok-4-1-fast-reasoning"),
      prompt: query,
      system: systemPrompt,
    } as Parameters<typeof generateText>[0]

    options.tools = { web_search: xai.tools.webSearch() } as any
    if (useX) (options.tools as any).x_search = xai.tools.xSearch()

    const { text, sources } = await generateText(options)

    let output = `# Research Results\n\n`
    output += `**Query:** ${query}\n\n`
    output += `---\n\n`
    output += text

    if (sources && sources.length > 0) {
      const seen = new Set<string>()
      const urlSources = sources.filter((s) => s.sourceType === "url") as Array<{
        sourceType: "url"
        url: string
        title?: string
      }>
      const uniqueSources = urlSources.filter((s) => {
        if (seen.has(s.url)) return false
        seen.add(s.url)
        return true
      })
      if (uniqueSources.length > 0) {
        output += `\n\n---\n\n## Sources\n\n`
        for (const source of uniqueSources) {
          output += `- [${source.title || source.url}](${source.url})\n`
        }
      }
    }

    const savedPath = await saveOutput(query, output)
    console.log(output)
    console.error(`\n[Saved to: ${savedPath}]`)
  } catch (error) {
    const errorResponse = {
      error: true,
      message: error instanceof Error ? error.message : "Unknown error occurred",
      code:
        error instanceof Error && "code" in error
          ? (error as Error & { code: string }).code
          : "UNKNOWN",
    }
    console.error(JSON.stringify(errorResponse, null, 2))
    process.exit(1)
  }
}

const args = process.argv.slice(2)
const useX = args.includes("--x")
const query = args.filter((a) => a !== "--x").join(" ")

if (!query) {
  console.error(
    JSON.stringify(
      {
        error: true,
        message: "No search query provided",
        code: "MISSING_QUERY",
        usage: 'bun research.ts "your search query" [--x]',
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

research(query, useX)
