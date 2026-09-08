import path from 'node:path';
import { appendFile, readdir, readFile, unlink } from 'node:fs/promises';
import { install } from '../commands/install.js';
import { update } from '../commands/update.js';
import { removeParts } from '../core/parts.js';
import { readManifest } from '../core/manifest.js';
import { archiveMission, createMission, readyToOpen, resolveMission, sessionLive, sessionPid, setAutonomy as writeAutonomy, setTitle } from '../core/mission.js';
import { loadPreset, openSession } from '../core/spawn.js';
import { resetConfig, writeCaffeinate, writePartScope, type Caffeinate } from '../core/config.js';
import { existingProjects, factoryHome, home } from '../core/projects.js';
import { id } from './format.js';
import type { Autonomy, ScopeChoice } from './model.js';

/**
 * What a key actually does. Every action goes through the same functions the CLI runs —
 * `install`, `removeParts`, `openSession`, `archiveMission` — so the screen can never write a
 * mission a command would have written differently. Each returns the line the toast shows; a
 * refusal throws, and the caller toasts that instead. Gates and decisions are answered in the
 * session, never here: one answer path, and the CLI records it.
 */

/** The commands talk to a human on stdout, and stdout is the screen. */
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const log = console.log;
  console.log = (): void => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
}

// ── sessions ─────────────────────────────────────────────────────────────────

/** The preset `mission open` uses with no flag: a mission's session is the Orchestrator's. */
const PRESET = 'orchestrator';

/**
 * A mission whose tab is still live is not reopened; one whose session died gets a new tab. A
 * stub is promoted first, as the CLI's `open` does: the tab's session must find a mission, not a
 * stub, or its own `open` refuses itself as live.
 */
export async function openTab(project: string, name: string): Promise<string> {
  const mission = await resolveMission(project, name);
  if (await sessionLive(mission.state.session)) return `factory-${name} is already open — switch to that tab`;
  await readyToOpen(project, mission);

  const spawn = await openSession(project, mission, await loadPreset(PRESET), false);
  return spawn.warp ? `opened tab factory-${name}` : `no warp — run it from ${spawn.configPath}`;
}

/** A second `x` inside this window means the human watched SIGTERM do nothing. */
const ESCALATE = 5000;
const termed = new Map<string, number>();

/**
 * A process whose argv carries this session id, the flag `claude` was spawned with, so no other
 * process on the machine can match it by accident; or the pid the hook logged, for a session the
 * human started by hand and the Factory only adopted.
 */
export async function killSession(session: string): Promise<string> {
  const proc = Bun.spawn(['pgrep', '-f', '--', `--session-id ${session}`], { stdout: 'pipe', stderr: 'ignore' });
  const out = await new Response(proc.stdout).text();
  await proc.exited;

  const logged = await sessionPid(session);
  const pids = [...new Set([...out.split('\n').map(Number), logged ?? 0])].filter((pid) => pid > 0 && pid !== process.pid);
  if (pids.length === 0) return `no process for ${id(session)}`;

  const hard = Date.now() - (termed.get(session) ?? 0) < ESCALATE;
  const signal = hard ? 'SIGKILL' : 'SIGTERM';
  const killed: number[] = [];
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
      killed.push(pid);
    } catch {
      // Gone between the pgrep and the signal: nothing left to kill.
    }
  }
  termed.set(session, Date.now());
  return killed.length === 0 ? `no process for ${id(session)}` : `${signal} ${killed.join(' ')} · ${id(session)}`;
}

// ── parts ────────────────────────────────────────────────────────────────────

/** The `--parts` install for what was ticked, the `uninstall` removal for what was unticked. */
export async function applyParts(project: string, add: string[], drop: string[]): Promise<string> {
  if (add.length > 0) await quiet(() => install(project, false, add));
  if (drop.length > 0) await removeParts(project, drop);
  const said = [add.length > 0 ? `installed ${add.join(', ')}` : '', drop.length > 0 ? `removed ${drop.join(', ')}` : ''];
  return said.filter((s) => s !== '').join(' · ');
}

/**
 * A scope change is a move, and a move is only done once both ends have run: the choices land in
 * `~/.factory/config.yaml`, then `update` on every project whose manifest still lists one of them
 * — that is what drops a part that left the project — and last the home dir, refreshed for what
 * left it and installed for what became global.
 */
export async function applyScopes(changes: { name: string; choice: ScopeChoice }[]): Promise<string> {
  for (const { name, choice } of changes) await writePartScope(name, choice);
  resetConfig();

  const names = changes.map((c) => c.name);
  const updated: string[] = [];
  for (const project of await existingProjects()) {
    const manifest = await readManifest(project);
    if (!names.some((name) => manifest?.parts[name])) continue;
    await quiet(() => update(project));
    updated.push(path.basename(project));
  }

  const global = changes.filter((c) => c.choice === 'global').map((c) => c.name);
  if (global.length < changes.length) await quiet(() => update(home()));
  if (global.length > 0) await quiet(() => install(home(), false, global));

  const said = [
    updated.length > 0 ? `updated ${updated.join(', ')}` : '',
    global.length > 0 ? `installed ${global.join(', ')} in ~/.claude` : 'refreshed ~/.claude',
  ];
  return said.filter((s) => s !== '').join(' · ');
}

// ── caffeinate ───────────────────────────────────────────────────────────────

const PIDS = (): string => path.join(factoryHome(), 'caffeinate');
/** Mission Control's own hold, next to the hook's one file per session. */
const CONTROL = (): string => path.join(PIDS(), 'control.pid');

async function stop(file: string): Promise<void> {
  const pid = Number(await readFile(file, 'utf-8').catch(() => ''));
  try {
    if (pid > 0) process.kill(pid);
  } catch {
    // Already dead; the file is the only thing left to clear.
  }
  await unlink(file).catch(() => {});
}

async function start(): Promise<void> {
  const pid = Number(await readFile(CONTROL(), 'utf-8').catch(() => ''));
  try {
    if (pid > 0 && process.kill(pid, 0)) return;
  } catch {
    // Not running: fall through and spawn one.
  }
  // nohup detaches it from this process, so quitting the screen does not put the Mac back to sleep.
  const proc = Bun.spawn(['/bin/sh', '-c', 'nohup caffeinate -i >/dev/null 2>&1 & printf %s "$!"'], { stdout: 'pipe', stderr: 'ignore' });
  const spawned = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  if (spawned !== '') await Bun.write(CONTROL(), spawned);
}

/**
 * The mode is the file: the hook reads it on its next event and the screen on its next rebuild.
 * `off` also takes down what is already holding the machine awake, hook pids included — otherwise
 * OFF would not read as off until every session ended.
 */
export async function setCaffeinate(mode: Caffeinate): Promise<string> {
  await writeCaffeinate(mode);
  if (mode === 'on') await start();
  else if (mode === 'auto') await stop(CONTROL());
  else for (const name of await readdir(PIDS()).catch(() => [])) await stop(path.join(PIDS(), name));
  return `caffeinate ${mode.toUpperCase()}`;
}

// ── missions ─────────────────────────────────────────────────────────────────

export async function setAutonomy(project: string, name: string, autonomy: Autonomy): Promise<string> {
  await writeAutonomy(project, name, autonomy, 'set from Mission Control');
  return `${name} autonomy ${autonomy}`;
}

/** What `mission new --stub` makes: a folder and an intent skeleton, no branch. `O` promotes it. */
export async function newMission(project: string, name: string, title: string): Promise<string> {
  const created = await createMission(project, { name, title: title || undefined, workflow: 'intent', autonomy: 'partial', worktree: false, stub: true });
  return `stub ${created.state.name} · O opens it`;
}

/** The title moves; the name is the branch and the folder, and stays. */
export async function renameMission(project: string, name: string, title: string): Promise<string> {
  await setTitle(project, name, title);
  return `${name} titled "${title}"`;
}

/**
 * Claude Code keeps a session's name in its own transcript, which nothing else may write, so the
 * Factory's copy is one line on the session's own events file: `Rename`, carrying everything the
 * last hook line carried, because the pid and the cwd the screen reads come off the last line.
 */
export async function renameSession(session: string, name: string): Promise<string> {
  const file = path.join(factoryHome(), 'events', `${session}.jsonl`);
  const lines = (await readFile(file, 'utf-8')).split('\n').filter((l) => l !== '');
  const last = JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>;
  await appendFile(file, `${JSON.stringify({ ...last, at: new Date().toISOString(), event: 'Rename', detail: name })}\n`);
  return `${id(session)} named ${name}`;
}

/** A rename between `.factory/missions/` and `.factory/archive/`; the closed-only rule is the core's. */
export async function archive(project: string, name: string, back: boolean): Promise<string> {
  const log = await archiveMission(project, name, back);
  return log.length > 0 ? log.join(' · ') : `${name} is already ${back ? 'in missions' : 'archived'}`;
}
