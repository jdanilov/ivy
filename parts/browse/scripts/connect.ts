#!/usr/bin/env bun

// Attach agent-browser (default session) to the user's running Chromium browser, or start the headless lab session.
//
//   bun connect.ts            # user browser via chrome://inspect/#remote-debugging (Chrome/Brave/Edge/Chromium 144+)
//   bun connect.ts lab        # headless Chrome for Testing, --session lab
//   bun connect.ts status     # no side effects
//
// Exit: 0 ok · 2 debug server unreachable (user must enable it) · 1 other.
// Override user data dir: BROWSE_USER_DATA_DIR=/path  (DevToolsActivePort lives there).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, platform } from 'node:os'

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(SKILL, 'out', 'cdp-url')
const HOST = '127.0.0.1'
const PORT = 9222
const SOCK = (s: string) => join(homedir(), '.agent-browser', `${s}.sock`)

const H = homedir()
const DATA_DIRS =
  platform() === 'darwin'
    ? ['Google/Chrome', 'BraveSoftware/Brave-Browser', 'Microsoft Edge', 'Chromium'].map((d) => join(H, 'Library/Application Support', d))
    : ['google-chrome', 'BraveSoftware/Brave-Browser', 'microsoft-edge', 'chromium'].map((d) => join(H, '.config', d))
if (process.env.BROWSE_USER_DATA_DIR) DATA_DIRS.unshift(process.env.BROWSE_USER_DATA_DIR)

const ENABLE = `
Browser debug server not reachable.
  1. In the browser profile you want to drive open  chrome://inspect/#remote-debugging  (brave:// for Brave)
  2. Enable remote debugging → "Server running at: ${HOST}:${PORT}"
  3. Re-run; approve the browser's "allow debugging" dialog.
`

type Run = { ok: boolean; out: string; err: string }
function ab(args: string[], timeoutMs = 60_000, session?: string): Run {
  const p = Bun.spawnSync(['agent-browser', ...(session ? ['--session', session] : []), ...args], { timeout: timeoutMs, stdout: 'pipe', stderr: 'pipe' })
  return { ok: p.exitCode === 0, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() }
}
const listening = () => Bun.spawnSync(['lsof', '-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN'], { stdout: 'pipe', stderr: 'pipe' }).stdout.toString().trim().length > 0

function candidates(): string[] {
  const list: string[] = []
  for (const dir of DATA_DIRS) {
    const f = join(dir, 'DevToolsActivePort')
    if (!existsSync(f)) continue
    const [port, path] = readFileSync(f, 'utf8').trim().split('\n')
    if (port && path) list.push(`ws://${HOST}:${port}${path}`)
  }
  if (existsSync(CACHE)) {
    const c = readFileSync(CACHE, 'utf8').trim()
    if (c && !list.includes(c)) list.push(c)
  }
  return list
}
const tabCount = (json: string) => {
  try {
    const d = JSON.parse(json), t = d?.data?.tabs ?? d?.tabs ?? d?.data ?? []
    return Array.isArray(t) ? t.length : 0
  } catch { return 0 }
}
const saveCache = (ws: string) => { mkdirSync(dirname(CACHE), { recursive: true }); writeFileSync(CACHE, ws + '\n') }

function user(): number {
  // Any agent-browser command auto-starts a daemon + headless Chrome, so probe only if a daemon socket exists.
  if (existsSync(SOCK('default'))) {
    const cur = ab(['get', 'cdp-url'], 15_000)
    const live = cur.ok && cur.out.includes(`${HOST}:${PORT}/`) ? ab(['tab', 'list', '--json'], 20_000) : null
    if (live?.ok) { console.log(`✓ browser connected (default session) · ${tabCount(live.out)} tabs · ${cur.out}`); return 0 }
    ab(['close'], 15_000) // stale daemon or stray headless Chrome
  }
  if (!listening()) { console.error(ENABLE); return 2 }
  const tried = candidates()
  for (const ws of tried) {
    console.log(`→ ${ws}\n  approve the browser's "allow debugging" dialog if shown`)
    const r = ab(['--cdp', ws, '--pin-tab', 'tab', 'list', '--json'], 90_000)
    if (r.ok) { saveCache(ws); console.log(`✓ browser connected (default session) · ${tabCount(r.out)} tabs`); return 0 }
    ab(['close'], 15_000)
    console.log(`  ✗ ${(r.err || r.out).split('\n')[0] || 'failed'}`)
  }
  console.error(`\n${tried.length ? 'All endpoints failed. GUID rotates on server restart.' : 'No DevToolsActivePort in ' + DATA_DIRS.join(', ') + ' and no cache.'}\nToggle remote debugging off/on at chrome://inspect/#remote-debugging (rewrites DevToolsActivePort), then re-run.`)
  return 2
}

function lab(): number {
  const r = ab(['open', 'about:blank'], 60_000, 'lab')
  if (!r.ok) { console.error(`✗ lab failed: ${r.err || r.out}\nTry: agent-browser doctor`); return 1 }
  console.log('✓ lab connected (--session lab, headless)')
  return 0
}

function status(): number {
  const b = existsSync(SOCK('default')) ? ab(['get', 'cdp-url'], 15_000) : null
  const ok = b?.ok && b.out.includes(`${HOST}:${PORT}/`)
  console.log(`browser (default): ${ok ? 'connected · ' + b!.out : b ? `daemon up, not attached to user browser (${(b.err || b.out).split('\n')[0]})` : 'not connected'}`)
  console.log(`lab:               ${existsSync(SOCK('lab')) ? 'daemon running' : 'not running'}`)
  console.log(`debug server:      ${listening() ? `${HOST}:${PORT} listening` : 'not listening'}`)
  return 0
}

const mode = Bun.argv[2] ?? 'browser'
process.exit(mode === 'browser' ? user() : mode === 'lab' ? lab() : mode === 'status' ? status() : (console.error(`unknown mode: ${mode}`), 1))
