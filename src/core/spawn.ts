import path from 'node:path';
import { homedir } from 'node:os';
import { mkdir, stat } from 'node:fs/promises';
import type { Mission, Preset } from '../types.js';
import { Refusal, mainCheckout, now, readClaim, writeClaim, writeState } from './mission.js';
import { FACTORY_ROOT } from './registry.js';

/** Warp reads tab configs from here and opens them with warp://tab_config/<file stem>. */
const TAB_CONFIGS = path.join(homedir(), '.warp', 'tab_configs');

export interface Spawn {
  preset: Preset;
  session: string;
  cwd: string;
  command: string;
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

/** Warp runs the command string through the shell, so anything unusual is single-quoted. */
const quote = (value: string): string =>
  /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;

export function assembleCommand(preset: Preset, mission: Mission, session: string): string {
  const args = [
    'claude',
    '--session-id', session,
    '--name', mission.state.name,
    '--model', preset.model,
    '--effort', preset.effort,
    '--append-system-prompt-file', path.join(preset.dir, 'prompt.md'),
    '--settings', path.join(preset.dir, 'settings.json'),
    '--mcp-config', path.join(preset.dir, 'mcp.json'),
    '--strict-mcp-config',
  ];

  // Warp tab configs carry no env key, so the variable is inlined in the command.
  return `FACTORY_MISSION=${quote(mission.dir)} ${args.map(quote).join(' ')}`;
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
 * The session id is written to state.json before the tab exists, so the hook events the
 * new session emits always find a mission already bound to them.
 */
export async function openSession(cwd: string, mission: Mission, preset: Preset, dryRun: boolean): Promise<Spawn> {
  const session = crypto.randomUUID();
  const checkout = mission.state.worktree ?? (await mainCheckout(cwd));
  const name = `factory-${mission.state.name}`;
  const command = assembleCommand(preset, mission, session);
  const configPath = path.join(TAB_CONFIGS, `${name}.toml`);
  const uri = `warp://tab_config/${encodeURIComponent(name)}`;
  const spawn: Spawn = { preset, session, cwd: checkout, command, configPath, uri, warp: await warpInstalled() };

  if (dryRun) return spawn;

  mission.state.session = session;
  await writeState(mission.dir, mission.state);

  const main = await mainCheckout(cwd);
  const claim = await readClaim(main);
  if (claim?.mission === mission.state.name) await writeClaim(main, { ...claim, session, at: now() });

  await mkdir(TAB_CONFIGS, { recursive: true });
  await Bun.write(configPath, tabConfig(name, checkout, command));

  if (spawn.warp) await Bun.spawn(['open', uri], { stdout: 'ignore', stderr: 'ignore' }).exited;

  return spawn;
}
