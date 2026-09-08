import path from 'node:path';
import { appendFile, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import type { Daemon, DaemonState, Request, Row, Service } from './daemons.js';
import { daemonDir, due, listRows, logFile, manifestFile, readRequest, readState, requestFile, verdict, writeState } from './daemons.js';
import { Refusal } from './mission.js';
import { idleSeconds } from './platform.js';
import { existingProjects, factoryHome } from './projects.js';
import { FACTORY_ROOT } from './registry.js';
import { tabConfig, tabConfigs, warpInstalled } from './spawn.js';

/**
 * One process per machine runs what every project's manifest declares. It holds no truth of its
 * own: the manifests, the machine config and the state files are read again every tick, so the
 * CLI and Mission Control steer it by writing files and nothing is ever told twice.
 */

const TICK = 30_000;
const DEBOUNCE = 200;
const ROTATE = 5 * 1024 * 1024;
/** Restarts are counted inside this window, and the sixth one inside it gives up. */
const WINDOW = 10 * 60_000;
const GIVE_UP = 5;

const dir = (): string => path.join(factoryHome(), 'supervisor');
const pidFile = (): string => path.join(dir(), 'pid');
/** PATH with bun and nvm's node is the login shell's, so every command goes through one. */
const shell = (): string => process.env.SHELL ?? '/bin/sh';
const iso = (t: number = Date.now()): string => new Date(t).toISOString();
const oneLine = (err: unknown): string => (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;
const isAlive = (pid: number): boolean => { try { return process.kill(pid, 0); } catch { return false; } };
/** Everything is spawned detached, so the negative pid reaches whatever the command started. */
const killGroup = (pid: number, signal: NodeJS.Signals = 'SIGTERM'): void => {
  try { process.kill(-pid, signal); } catch { /* already gone */ }
};

// ── the singleton ────────────────────────────────────────────────────────────

/** The pid file is the lock; a pid nobody answers to is a supervisor that crashed, and goes. */
export async function supervisorPid(): Promise<number | null> {
  const pid = Number((await Bun.file(pidFile()).text().catch(() => '')).trim());
  if (pid > 0 && isAlive(pid)) return pid;
  if (pid > 0) await unlink(pidFile()).catch(() => {});
  return null;
}

/** When it came up: the pid file is written once, at the top of the loop. */
export const supervisorStarted = (): Promise<string | null> => stat(pidFile()).then((s) => s.mtime.toISOString(), () => null);

/** Detached, output in the supervisor log: it outlives the shell or the screen that started it. */
export async function startSupervisor(): Promise<number> {
  const live = await supervisorPid();
  if (live !== null) throw new Refusal(`supervisor already running as pid ${live} — factory supervisor stop`);
  await mkdir(dir(), { recursive: true });
  const fh = await open(path.join(dir(), 'log'), 'a');
  const argv = [Bun.which('bun') ?? process.execPath, path.join(FACTORY_ROOT, 'src', 'cli.ts'), 'supervisor', 'start', '--foreground'];
  // The env is passed by hand: Bun hands a child the environment this process started with, and a
  // HOME set at run time — a test's scratch home — would otherwise never reach the loop.
  const proc = Bun.spawn(argv, { env: { ...process.env }, stdin: 'ignore', stdout: fh.fd, stderr: fh.fd, detached: true });
  await fh.close();
  proc.unref();
  // The child writes the pid file and the caller's next command reads it: wait for it to land.
  for (let i = 0; i < 60 && (await supervisorPid()) === null; i++) await Bun.sleep(50);
  const pid = await supervisorPid();
  // A child that never reported in is not a supervisor: it goes, rather than run unaccounted for.
  if (pid === null) {
    killGroup(proc.pid, 'SIGKILL');
    throw new Refusal(`supervisor did not start — see ${path.join(dir(), 'log')}`);
  }
  return pid;
}

/** SIGTERM and nothing more: the daemons and services it started were told to outlive it. */
export async function stopSupervisor(): Promise<void> {
  const pid = await supervisorPid();
  if (pid === null) throw new Refusal('no supervisor is running');
  process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 40 && (await supervisorPid()) !== null; i++) await Bun.sleep(50);
}

// ── the loop ─────────────────────────────────────────────────────────────────

/** Daemon runs this process owns: the tick leaves them alone and a stop request reaches them. */
const runs = new Map<string, { pid: number; stopped: boolean; timedOut: boolean }>();
/** Services this process spawned, whose `exited` is the death it observes. */
const services = new Map<string, number>();
/** A start, stop or backoff in flight — the tick must not race it. */
const busy = new Set<string>();
/** A stop that was asked for, so its exit files no alert. */
const stopping = new Set<string>();
const logged = new Map<string, string>();
const watchers = new Map<string, FSWatcher>();
let ticking = false;
let debounce: ReturnType<typeof setTimeout> | null = null;

export async function runSupervisor(): Promise<never> {
  const live = await supervisorPid();
  if (live !== null) throw new Refusal(`supervisor already running as pid ${live}`);
  await mkdir(dir(), { recursive: true });
  await Bun.write(pidFile(), `${process.pid}\n`);
  // The signal takes the loop down and nothing else: a service outlives the supervisor by design.
  for (const s of ['SIGTERM', 'SIGINT'] as const) process.on(s, () => void unlink(pidFile()).catch(() => {}).then(() => process.exit(0)));
  await note(`up as ${process.pid}`);
  await adopt();
  setInterval(schedule, TICK);
  schedule();
  return new Promise<never>(() => {});
}

/** One tick per burst of changes, and one every 30 s under it: a watcher that never fired costs
 *  half a minute, not the machine's whole schedule. */
function schedule(): void {
  if (debounce) return;
  debounce = setTimeout(() => { debounce = null; void tick(); }, DEBOUNCE);
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const { rows, errors } = await listRows();
    for (const id of logged.keys()) if (!(id in errors)) logged.delete(id);
    for (const [project, error] of Object.entries(errors)) await noteOnce(project, `${manifestFile(project)}: ${error}`);
    let idle: number | null = null;
    for (const row of rows) {
      // One bad row is one alert and one log line; every other row keeps running.
      try {
        if (row.entry.kind === 'service') await visitService(row as Row & { entry: Service });
        else {
          idle ??= await idleSeconds();
          await visitDaemon(row as Row & { entry: Daemon }, idle);
        }
      } catch (err) {
        await fail(row.key, err);
      }
    }
    await syncWatchers();
  } catch (err) {
    await note(`tick: ${oneLine(err)}`);
  } finally {
    ticking = false;
  }
}

/** A request is consumed once: the file is a message, not a flag to be re-read next tick. */
async function take(key: string): Promise<Request | null> {
  const request = await readRequest(key);
  if (request) await unlink(requestFile(key)).catch(() => {});
  return request;
}

// ── daemons ──────────────────────────────────────────────────────────────────

async function visitDaemon(row: Row & { entry: Daemon }, idle: number): Promise<void> {
  const { key, state } = row;
  const request = await take(key);
  const run = runs.get(key);
  if (run) {
    if (request === 'stop') { run.stopped = true; killGroup(run.pid, 'SIGKILL'); }
    return;
  }
  if (state.pid !== undefined) {
    if (isAlive(state.pid)) {
      if (request === 'stop') killGroup(state.pid, 'SIGKILL');
      return;
    }
    // Adopted from a supervisor that is gone, and dead since: nobody saw its exit code.
    return patch(key, { pid: undefined, lastEnd: iso(), lastStatus: 'fail', lastSummary: 'interrupted', alert: 'run interrupted' });
  }
  if (!state.enabled) return;
  // A run asked for by hand bypasses the cadence and the idle gate, never the enablement.
  if (request !== 'run' && !due(row.entry, state, Date.now(), idle).due) return;
  void runDaemon(row).catch((err) => void fail(key, err));
}

async function runDaemon(row: Row & { entry: Daemon }): Promise<void> {
  const { key, entry } = row;
  const cwd = path.join(row.project, entry.cwd ?? '.');
  const proc = Bun.spawn([shell(), '-lc', entry.cmd], { cwd, env: { ...process.env, ...entry.env }, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', detached: true });
  const run = { pid: proc.pid, stopped: false, timedOut: false };
  runs.set(key, run);
  const timer = entry.timeout === undefined ? null : setTimeout(() => { run.timedOut = true; killGroup(proc.pid, 'SIGKILL'); }, entry.timeout);
  try {
    await patch(key, { pid: proc.pid, lastStart: iso() });
    await appendLog(key, `── ${iso()} run ${entry.cmd}\n`);
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const code = await proc.exited;
    await appendLog(key, out + err);
    const result = run.timedOut ? { status: 'fail' as const, summary: 'timeout' }
      : run.stopped ? { status: 'fail' as const, summary: 'stopped' } : verdict(code, out);
    const state = await readState(key);
    // Only what a window can still ask about is kept, so the file does not grow with the cadence.
    const successes = (result.status === 'ok' ? [...(state.successes ?? []), iso()] : state.successes ?? []).slice(-20);
    const settled = { ...state, pid: undefined, lastEnd: iso(), successes };
    await writeState(key, { ...settled, lastStatus: result.status, lastSummary: result.summary,
      nextDue: iso(due(entry, settled, Date.now(), 0).next), alert: result.status === 'fail' ? `run failed: ${result.summary}` : undefined });
  } finally {
    if (timer) clearTimeout(timer);
    runs.delete(key);
  }
}

// ── services ─────────────────────────────────────────────────────────────────

async function visitService(row: Row & { entry: Service }): Promise<void> {
  const { key, state } = row;
  const request = await take(key);
  if (busy.has(key)) return;
  if (request === 'stop') {
    busy.add(key);
    void stopService(row, state.pid).finally(() => busy.delete(key));
    return;
  }
  const wanted = request === 'start' || request === 'run' ? true : state.wanted === true;
  if (wanted && state.wanted !== true) await patch(key, { wanted: true });
  if (state.pid !== undefined) {
    // A pid this process never spawned has no `exited` to await: its death is noticed here.
    if (!isAlive(state.pid) && !services.has(key)) void onExit(row, null).catch((err) => void fail(key, err));
    return;
  }
  if (!state.enabled || !wanted) return;
  busy.add(key);
  void startService(row).finally(() => busy.delete(key));
}

async function startService(row: Row & { entry: Service }): Promise<void> {
  const { key, entry } = row;
  const cwd = path.join(row.project, entry.cwd ?? '.');
  await appendLog(key, `── ${iso()} start ${entry.cmd}\n`);
  const tab = entry.run === 'tab' ? await startInTab(key, cwd, entry) : null;
  if (tab !== null) return patch(key, { pid: tab, startedAt: iso(), wanted: true, alert: undefined, tabFallback: undefined });

  const fh = await open(logFile(key), 'a');
  const proc = Bun.spawn([shell(), '-lc', entry.cmd], { cwd, env: { ...process.env, ...entry.env }, stdin: 'ignore', stdout: fh.fd, stderr: fh.fd, detached: true });
  await fh.close();
  services.set(key, proc.pid);
  // A tab that could not be opened still runs, and the row says where it ended up.
  await patch(key, { pid: proc.pid, startedAt: iso(), wanted: true, alert: undefined, tabFallback: entry.run === 'tab' || undefined });
  void proc.exited.then((code) => onExit(row, code)).catch((err) => void fail(key, err));
}

/** The tab's shell writes its own pid before it execs, so the supervisor can stop what the human
 *  is watching. No Warp, or no pid within ten seconds, and the service runs detached instead. */
async function startInTab(key: string, cwd: string, entry: Service): Promise<number | null> {
  if (!(await warpInstalled())) return null;
  const file = path.join(daemonDir(key), 'tab.pid');
  await mkdir(daemonDir(key), { recursive: true });
  await unlink(file).catch(() => {});
  const name = `factory-${key.replace('/', '-')}`;
  const env = Object.entries(entry.env ?? {}).map(([k, v]) => `${k}=${quote(v)} `).join('');
  await mkdir(tabConfigs(), { recursive: true });
  await Bun.write(path.join(tabConfigs(), `${name}.toml`),
    tabConfig(name, cwd, `printf %s $$ > ${quote(file)} && ${env}exec ${quote(shell())} -lc ${quote(entry.cmd)}`));
  await Bun.spawn(['open', `warp://tab_config/${encodeURIComponent(name)}`], { stdout: 'ignore', stderr: 'ignore' }).exited;
  for (let i = 0; i < 50; i++) {
    const pid = Number((await Bun.file(file).text().catch(() => '')).trim());
    if (pid > 0) return pid;
    await Bun.sleep(200);
  }
  return null;
}

/** The one place a service's death is judged: what its policy says, or an inbox row for the human. */
async function onExit(row: Row & { entry: Service }, code: number | null): Promise<void> {
  const { key } = row;
  services.delete(key);
  const asked = stopping.delete(key);
  const now = Date.now();
  const state = await readState(key);
  const restarts = (state.restarts ?? []).filter((t) => now - Date.parse(t) < WINDOW);
  if (asked) return patch(key, { pid: undefined, wanted: false, restarts });
  // `never` drops `wanted` as well: the tick starts anything enabled and wanted that is not alive,
  // so a service left wanted would be restarted by the very policy that forbids restarting it.
  const retry = row.entry.restart === 'always' || (row.entry.restart === 'on-failure' && code !== 0);
  if (!retry) return patch(key, { pid: undefined, wanted: false, restarts, alert: code === 0 ? undefined : `died ${code ?? 'unobserved'}` });
  if (restarts.length >= GIVE_UP) return patch(key, { pid: undefined, wanted: false, restarts, alert: `gave up after ${GIVE_UP} restarts` });
  await patch(key, { pid: undefined, restarts: [...restarts, iso(now)] });
  busy.add(key);
  setTimeout(() => void startService(row).catch((err) => void fail(key, err)).finally(() => busy.delete(key)), Math.min(1000 * 2 ** restarts.length, 60_000));
}

/** SIGTERM the group, SIGKILL what is left after five seconds. `wanted` goes down first, so the
 *  tick does not start it again while it dies, `restart: always` included. */
async function stopService(row: Row & { entry: Service }, pid: number | undefined): Promise<void> {
  const { key } = row;
  stopping.add(key);
  await patch(key, { wanted: false });
  if (pid !== undefined) {
    killGroup(pid);
    for (let i = 0; i < 50 && isAlive(pid); i++) await Bun.sleep(100);
    if (isAlive(pid)) killGroup(pid, 'SIGKILL');
  }
  // An adopted pid has no exit to observe, so the stop files the death itself.
  if (pid === undefined || !isAlive(pid)) {
    stopping.delete(key);
    await patch(key, { pid: undefined, wanted: false });
  }
}

// ── adoption, watching, files ────────────────────────────────────────────────

/** A restart must not orphan what the last supervisor started, nor claim a pid the OS reused. */
async function adopt(): Promise<void> {
  const { rows } = await listRows();
  for (const { key, entry, state } of rows) {
    if (state.pid === undefined) continue;
    if (isAlive(state.pid) && (await psCommand(state.pid)).includes(entry.cmd)) continue;
    await patch(key, { pid: undefined });
  }
}

/** The command a pid is running, so an adopted pid is the daemon's and not whatever reused it. */
const psCommand = async (pid: number): Promise<string> =>
  new Response(Bun.spawn(['ps', '-o', 'command=', '-p', String(pid)], { stdout: 'pipe', stderr: 'ignore' }).stdout).text();

/** What a tick is built from: the machine's config and project list, every project's manifest,
 *  and the state tree the CLI and Mission Control write their requests into. */
async function syncWatchers(): Promise<void> {
  const want = new Map<string, boolean>([[factoryHome(), false], [path.join(factoryHome(), 'daemons'), true]]);
  for (const project of await existingProjects()) want.set(path.join(project, '.factory'), false);
  for (const [where, watcher] of watchers) {
    if (want.has(where)) continue;
    watcher.close();
    watchers.delete(where);
  }
  for (const [where, recursive] of want) {
    if (watchers.has(where)) continue;
    // A path that is not there yet is picked up by the 30 s tick and watched on the next sync.
    try { watchers.set(where, watch(where, { recursive, persistent: false }, schedule)); } catch { /* nothing to watch yet */ }
  }
}

/** One generation: the tail is all anyone reads, and a log nobody rotates fills the disk. */
async function appendLog(key: string, text: string): Promise<void> {
  if (text === '') return;
  await mkdir(daemonDir(key), { recursive: true });
  if ((await stat(logFile(key)).then((s) => s.size, () => 0)) >= ROTATE) await rename(logFile(key), `${logFile(key)}.1`);
  await appendFile(logFile(key), text);
}

async function note(text: string): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await appendFile(path.join(dir(), 'log'), `${iso()} ${text}\n`);
}

/** A manifest error reads the same every tick: logged when it changes, not 2 880 times a day. */
async function noteOnce(id: string, text: string): Promise<void> {
  if (logged.get(id) === text) return;
  logged.set(id, text);
  await note(text);
}

/** Read, modify, write: a run in flight and the tick both touch one row's file. */
async function patch(key: string, fields: Partial<DaemonState>): Promise<void> {
  await writeState(key, { ...(await readState(key)), ...fields });
}

async function fail(key: string, err: unknown): Promise<void> {
  await note(`${key}: ${oneLine(err)}`);
  await patch(key, { alert: oneLine(err) }).catch(() => {});
}
