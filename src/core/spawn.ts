import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import type { Mission, Preset } from '../types.js';
import { Refusal, mainCheckout, now, readClaim, sessionLive, writeClaim, writeState } from './mission.js';
import { FACTORY_ROOT } from './registry.js';
import { home } from './projects.js';
import { readLaunch, type Launch } from './config.js';

/** Warp reads tab configs from here and opens them with warp://tab_config/<file stem>. */
const tabConfigs = (): string => path.join(home(), '.warp', 'tab_configs');
/** Where `claude --bg` keeps one record per session it started, under the short id it printed. */
const jobFile = (short: string): string => path.join(home(), '.claude', 'jobs', short, 'state.json');

export interface Spawn {
  preset: Preset;
  launch: Launch;
  /** The session's id: chosen here for a direct launch, read back from the daemon for `bg`, empty on
   *  a `bg` dry run, where nothing was started. */
  session: string;
  cwd: string;
  /** What starts the session, and what the tab runs: the same line for a direct launch. */
  command: string;
  tab: string;
  configPath: string;
  uri: string;
  warp: boolean;
}

// ── preset ───────────────────────────────────────────────────────────────────

export async function loadPreset(name: string): Promise<Preset> {
  const dir = path.join(FACTORY_ROOT, 'presets', name);
  const file = Bun.file(path.join(dir, 'preset.yaml'));
  if (!(await file.exists())) throw new Refusal(`no preset "${name}" in ${path.join(FACTORY_ROOT, 'presets')}`);

  const raw = Bun.YAML.parse(await file.text()) as Record<string, unknown>;
  const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

  return {
    name,
    dir,
    model: String(raw.model ?? 'fable'),
    effort: String(raw.effort ?? 'high'),
    mcp: list(raw.mcp),
    sendMessage: raw.sendMessage === true,
  };
}

// ── the claude command ───────────────────────────────────────────────────────

/** The shell sees the command on a dry run's printout, so anything unusual is single-quoted. */
const quote = (value: string): string =>
  /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;

/** The session is the human's own, so it runs the way they run `claude` by hand. */
const HUMAN_FLAGS = ['--permission-mode', 'acceptEdits', '--dangerously-skip-permissions'];

/** The first prompt, so the session opens already reading the intent and nobody has to type it:
 *  the system prompt says what an Orchestrator is, the skill is the manual it runs from. */
const KICKOFF = '/mission';

/** The preset's overlay with what only this mission knows, written beside its state. */
const settingsPath = (mission: Mission): string => path.join(mission.dir, 'settings.json');

/**
 * A direct launch runs in the tab under an id chosen here. `--bg` hands the session to a daemon,
 * so no id can be chosen for it and no variable on the command line reaches it: the id is read
 * back from the daemon's record. Either way the mission dir goes in through the settings overlay,
 * which the hooks of both inherit.
 */
export function assembleArgs(preset: Preset, mission: Mission, launch: Launch, session: string): string[] {
  return [
    'claude', ...(launch === 'bg' ? ['--bg'] : ['--session-id', session]),
    '--name', mission.state.name,
    '--model', preset.model,
    '--effort', preset.effort,
    ...HUMAN_FLAGS,
    '--append-system-prompt-file', path.join(preset.dir, 'prompt.md'),
    '--settings', settingsPath(mission),
    '--mcp-config', path.join(preset.dir, 'mcp.json'),
    '--strict-mcp-config',
    KICKOFF,
  ];
}

export const assembleCommand = (preset: Preset, mission: Mission, launch: Launch, session: string): string =>
  assembleArgs(preset, mission, launch, session).map(quote).join(' ');

/**
 * `accept` lets Mission Control's messages in: a session that bypasses permission prompts would
 * otherwise hold a message from a sender that claims no permission class behind a dialog.
 */
async function writeSettings(preset: Preset, mission: Mission): Promise<void> {
  const base = await Bun.file(path.join(preset.dir, 'settings.json')).json().catch(() => ({})) as Record<string, unknown>;
  const env = { ...(base.env as Record<string, string> | undefined), FACTORY_MISSION: mission.dir };
  await Bun.write(settingsPath(mission), `${JSON.stringify({ ...base, env, crossSessionInbound: 'accept' }, null, 2)}\n`);
}

/** `backgrounded · <short id> · <name>` is the one line `--bg` prints; the full id is in its record. */
async function startSession(args: string[], cwd: string): Promise<{ short: string; session: string }> {
  const proc = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const short = /backgrounded · ([0-9a-f]{8})/.exec(out)?.[1];
  if ((await proc.exited) !== 0 || !short) throw new Refusal(`claude --bg did not start a session: ${(err || out).trim().split('\n')[0] ?? ''}`);
  const job = await Bun.file(jobFile(short)).json().catch(() => null) as { sessionId?: string } | null;
  if (typeof job?.sessionId !== 'string') throw new Refusal(`claude --bg started ${short} but wrote no record at ${jobFile(short)}`);
  return { short, session: job.sessionId };
}

/** A session `--bg` started has the daemon's record under its short id, naming the full one. */
export async function isBackground(session: string): Promise<boolean> {
  const job = await Bun.file(jobFile(session.slice(0, 8))).json().catch(() => null) as { sessionId?: string } | null;
  return job?.sessionId === session;
}

/** A session `--bg` started is the daemon's to stop. */
export async function stopSession(session: string): Promise<string | null> {
  if (!(await isBackground(session))) return null;
  const short = session.slice(0, 8);
  const proc = Bun.spawn(['claude', 'stop', short], { stdout: 'pipe', stderr: 'pipe' });
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return out || `stopped ${short}`;
}

// ── the Warp tab config ──────────────────────────────────────────────────────

const tomlString = (value: string): string => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** Tab Config TOML: docs.warp.dev/terminal/windows/tab-configs — flat panes, one terminal leaf. */
export function tabConfig(name: string, cwd: string, command: string): string {
  return [
    `name = ${tomlString(name)}`,
    `title = ${tomlString(name)}`,
    'color = "cyan"',
    '',
    '[[panes]]',
    'id = "main"',
    'type = "terminal"',
    `directory = ${tomlString(cwd)}`,
    `commands = [${tomlString(command)}]`,
    'is_focused = true',
    '',
  ].join('\n');
}

/** No Warp, no tab: the human runs the command by hand instead. */
export async function warpInstalled(): Promise<boolean> {
  if (process.env.WARP_MISSING === '1') return false;
  if (await stat('/Applications/Warp.app').then(() => true, () => false)) return true;
  return (await Bun.spawn(['open', '-Ra', 'Warp'], { stdout: 'ignore', stderr: 'ignore' }).exited) === 0;
}

// ── open ─────────────────────────────────────────────────────────────────────

/**
 * The session id is in state.json before the tab exists, so the first hook event the session
 * emits finds a mission bound to it: chosen here for a direct launch, and under `bg` read back
 * from the daemon that started it, the tab then only attaching. A mission carrying a *live*
 * session is never rebound here: the old tab keeps sending events at a mission that has moved on,
 * and every one of them goes nowhere. `mission adopt` is the deliberate rebind, and it says so. A
 * recorded session that is gone is simply replaced, or the mission could never be reopened.
 */
export async function openSession(cwd: string, mission: Mission, preset: Preset, dryRun: boolean): Promise<Spawn> {
  const bound = mission.state.session;
  const mine = mission.state.name;
  if (bound && (await sessionLive(bound))) {
    throw new Refusal(`mission ${mine} is bound to session ${bound} — factory mission adopt ${mine} --session <id> to rebind`);
  }

  const checkout = mission.state.worktree ?? (await mainCheckout(cwd));
  const name = `factory-${mission.state.name}`;
  const launch = await readLaunch();
  const chosen = launch === 'direct' ? crypto.randomUUID() : '';
  const command = assembleCommand(preset, mission, launch, chosen);
  const configPath = path.join(tabConfigs(), `${name}.toml`);
  const uri = `warp://tab_config/${encodeURIComponent(name)}`;
  const warp = await warpInstalled();
  const spawn = { preset, launch, session: chosen, cwd: checkout, command, tab: launch === 'direct' ? command : 'claude attach <id>', configPath, uri, warp };

  if (dryRun) return spawn;

  await writeSettings(preset, mission);
  if (launch === 'bg') {
    const { short, session } = await startSession(assembleArgs(preset, mission, launch, ''), checkout);
    spawn.session = session;
    spawn.tab = `claude attach ${short}`;
  }
  const { session, tab } = spawn;

  mission.state.session = session;
  await writeState(mission.dir, mission.state);

  const main = await mainCheckout(cwd);
  const claim = await readClaim(main);
  if (claim?.mission === mission.state.name) await writeClaim(main, { ...claim, session, at: now() });

  await mkdir(path.dirname(configPath), { recursive: true });
  await Bun.write(configPath, tabConfig(name, checkout, tab));

  if (warp) await Bun.spawn(['open', uri], { stdout: 'ignore', stderr: 'ignore' }).exited;

  return spawn;
}
