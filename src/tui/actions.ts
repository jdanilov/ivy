import path from 'node:path';
import { appendFile, readdir, readFile, unlink } from 'node:fs/promises';
import { install } from '../commands/install.js';
import { update } from '../commands/update.js';
import { removeParts } from '../core/parts.js';
import { readManifest } from '../core/manifest.js';
import { archiveMission, createMission, readyToOpen, resolveMission, sessionLive, sessionPid, setAutonomy as writeAutonomy, setTitle } from '../core/mission.js';
import { loadPreset, openSession, stopSession } from '../core/spawn.js';
import { inboxOf, post } from '../core/peer.js';
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
 * A session `mission open` started belongs to Claude Code's own daemon, and `claude stop` is how
 * it ends: the conversation stays, and `claude attach` opens it again. A session the human
 * started by hand has only the pid the hook logged, and gets the signal.
 */
export async function killSession(session: string): Promise<string> {
  const stopped = await stopSession(session);
  if (stopped !== null) return `${stopped} · ${id(session)}`;

  const logged = await sessionPid(session);
  const pids = logged === null || logged === process.pid ? [] : [logged];
  if (pids.length === 0) return `no process for ${id(session)}`;

  const hard = Date.now() - (termed.get(session) ?? 0) < ESCALATE;
  const signal = hard ? 'SIGKILL' : 'SIGTERM';
  const killed: number[] = [];
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
      killed.push(pid);
    } catch {
      // Gone between the lookup and the signal: nothing left to kill.
    }
  }
  termed.set(session, Date.now());
  return killed.length === 0 ? `no process for ${id(session)}` : `${signal} ${killed.join(' ')} · ${id(session)}`;
}

/** Claude Code hands the session a message from outside as one from another session, so the
 *  first line says whose words these are. */
const FROM = 'From the user, via Mission Control:';

/** Into the session's inbox: a turn if it is idle, read between tool calls if it is not. */
export async function sendMessage(session: string, text: string): Promise<string> {
  const sock = await inboxOf(session);
  if (sock === null) throw new Error(`${id(session)} has no inbox — is it running?`);
  await post(sock, `${FROM}\n${text}`);
  return `sent to ${id(session)}`;
}

// ── parts ────────────────────────────────────────────────────────────────────

/** The `--parts` install for what was ticked, the `uninstall` removal for what was unticked. */
export async function applyParts(project: string, add: string[], drop: string[]): Promise<string> {
  if (add.length > 0) await quiet(() => install(project, false, add));
  if (drop.length > 0) await removeParts(project, drop);
  const said = [add.length > 0 ? `installed ${add.join(', ')}` : '', drop.length > 0 ? `removed ${drop.join(', ')}` : ''];
  return said.filter((s) => s !== '').join(' · ');
}

/** The parts a manifest lists: what a target holds, read before and after a move. */
const held = async (dir: string): Promise<string[]> => Object.keys((await readManifest(dir))?.parts ?? {});

/** `−a +b`: what a target lost and gained, the move before what came in beside it. Empty when the run changed nothing there. */
function moved(before: string[], after: string[]): string {
  return [...before.filter((n) => !after.includes(n)).map((n) => `−${n}`), ...after.filter((n) => !before.includes(n)).map((n) => `+${n}`)].join(' ');
}

/**
 * A scope change is a move, and a move is only done once both ends have run: the choices land in
 * `~/.factory/config.yaml`, then `update` on every project whose manifest still lists one of them
 * — that is what drops a part that left the project — and last the home dir, refreshed for what
 * left it and installed for what became global. The toast says what each target gained and lost,
 * `update` seeding a part beside the moved one included: that it ran is not news.
 */
export async function applyScopes(changes: { name: string; choice: ScopeChoice }[]): Promise<string> {
  for (const { name, choice } of changes) await writePartScope(name, choice);
  resetConfig();

  const names = changes.map((c) => c.name);
  const report: string[] = [];
  for (const project of await existingProjects()) {
    const before = await held(project);
    if (!names.some((name) => before.includes(name))) continue;
    await quiet(() => update(project));
    const diff = moved(before, await held(project));
    if (diff) report.push(`${path.basename(project)} ${diff}`);
  }

  const global = changes.filter((c) => c.choice === 'global').map((c) => c.name);
  const before = await held(home());
  if (global.length < changes.length) await quiet(() => update(home()));
  if (global.length > 0) await quiet(() => install(home(), false, global));
  const diff = moved(before, await held(home()));
  if (diff) report.push(`~/.claude ${diff}`);
  return report.length ? report.join(' · ') : 'scopes written · nothing moved';
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
