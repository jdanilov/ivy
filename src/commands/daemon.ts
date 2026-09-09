import path from 'node:path';
import type { Row } from '../core/daemons.js';
import { listRows, logFile, manifestFile, readLogTail, readState, writeRequest, writeState } from '../core/daemons.js';
import { writeDaemonEnabled } from '../core/config.js';
import { Refusal } from '../core/mission.js';
import { supervisorPid } from '../core/supervisor.js';
import { field, headerRow, rule } from '../ui/format.js';
import { I, colors } from '../ui/theme.js';

/** The machine's daemons, from the CLI. Every verb Mission Control's keys need is exported here,
 *  so a key and its CLI twin are the same call and neither surface can drift from the other. */

const KEY = '<project>/<name>';
const need = (value: string | undefined, usage: string): string => {
  if (!value) throw new Refusal(usage);
  return value;
};

export async function daemon(sub: string, args: string[]): Promise<void> {
  switch (sub) {
    case 'list':
      return list(args[0]);
    case 'status':
      return show(need(args[0], `daemon status ${KEY}`));
    case 'run':
      return say(await runNow(need(args[0], `daemon run ${KEY}`)));
    case 'stop':
      return say(await stopRow(need(args[0], `daemon stop ${KEY}`)));
    case 'log':
      return tail(need(args[0], `daemon log ${KEY} [-f] [-n N]`), args);
    default:
      throw new Refusal(`daemon: unknown subcommand "${sub ?? ''}" — list, status, run, stop, log`);
  }
}

const say = (text: string): void => console.log(`${I}${colors.green}✓${colors.reset} ${text}`);

/** An unknown key names the manifest it is missing from: that is the file the human has to edit. */
async function findRow(key: string): Promise<Row> {
  const { rows, errors } = await listRows();
  const row = rows.find((r) => r.key === key);
  if (row) return row;
  const project = key.split('/')[0] ?? '';
  const error = errors[project];
  throw new Refusal(error
    ? `${key}: ${manifestFile(project)} does not parse — ${error}`
    : `no daemon "${key}" — it is not in ${manifestFile(project)}`);
}

// ── what a key and its CLI twin both call ────────────────────────────────────

/** Run is the way on: enabled is the whole desired state, so the verb that asks for a run says
 *  the row runs from now on too, and bypasses the cadence and the idle gate on top of it. */
export async function runNow(key: string): Promise<string> {
  const row = await findRow(key);
  await writeDaemonEnabled(key, 'on');
  await writeRequest(key, row.entry.kind === 'service' ? 'start' : 'run');
  return `${key} ${row.entry.kind === 'service' ? 'starting' : 'queued'}`;
}

/** Stop is the way off: the request kills what runs, and the row stops being scheduled — a row
 *  left on would be started again by the next tick, or by its own restart policy. */
export async function stopRow(key: string): Promise<string> {
  await findRow(key);
  await writeRequest(key, 'stop');
  await writeDaemonEnabled(key, 'off');
  return `${key} stopping`;
}

/** Reading the log is the acknowledgement: the inbox row goes when the human has seen why. */
export async function readLog(key: string, n: number): Promise<string[]> {
  await findRow(key);
  const state = await readState(key);
  if (state.alert !== undefined) await writeState(key, { ...state, alert: undefined });
  return readLogTail(key, n);
}

// ── printing ─────────────────────────────────────────────────────────────────

/** `3h`, `20m`, `45s` — the manifest's own units, so a row reads like the entry behind it. */
export function short(ms: number): string {
  for (const [size, suffix] of [[86_400_000, 'd'], [3_600_000, 'h'], [60_000, 'm'], [1000, 's']] as const) {
    if (ms >= size) return `${Math.round(ms / size)}${suffix}`;
  }
  return '0s';
}

const GLYPH = { ok: '✓', skip: '○', fail: '✗' };

/** The row tail Mission Control draws too: what the entry does and what it last did. */
export function rowTail(row: Row): string {
  const s = row.state;
  if (row.entry.kind === 'service') {
    if (s.pid === undefined) return s.alert ? `✗ ${s.alert}` : 'stopped';
    const up = s.startedAt ? `up ${short(Date.now() - Date.parse(s.startedAt))}` : '';
    return [`pid ${s.pid}`, up, row.entry.port ? `:${row.entry.port}` : '', s.tabFallback ? 'tab→detached' : ''].filter(Boolean).join(' · ');
  }
  const last = s.lastStatus === undefined || s.lastEnd === undefined ? 'never'
    : `last ${GLYPH[s.lastStatus]} ${s.lastStatus === 'ok' ? '' : `${s.lastSummary ?? ''} `}${short(Date.now() - Date.parse(s.lastEnd))} ago`;
  const next = s.pid !== undefined ? 'running'
    : s.nextDue === undefined ? '' : `next ${short(Math.max(0, Date.parse(s.nextDue) - Date.now()))}`;
  return [`every ${short(row.entry.every)}`, last, next].filter(Boolean).join(' · ');
}

const glyphOf = (row: Row): string => (row.entry.kind === 'daemon' ? '↻' : '▶');

/** Warning after a failure, then dim off, accent while it runs: the colours the TUI row uses.
 *  The failure reads first because a service the supervisor turned off for dying is an off row
 *  the human still has to look at, and a dim one says nothing happened. */
export function colourOf(row: Row): string {
  const s = row.state;
  if (s.alert !== undefined || s.lastStatus === 'fail') return colors.yellow;
  if (!s.enabled) return colors.dim;
  return s.pid === undefined ? colors.green : colors.cyan;
}

async function list(project?: string): Promise<void> {
  const { rows, errors } = await listRows();
  const mine = rows.filter((r) => project === undefined || r.key.startsWith(`${project}/`));

  console.log('');
  if ((await supervisorPid()) === null) console.log(`${I}${colors.dim}supervisor not running — factory supervisor start${colors.reset}`);
  for (const [name, error] of Object.entries(errors)) {
    if (project === undefined || project === name) console.log(`${I}${colors.red}✗${colors.reset} ${manifestFile(name)} ${colors.dim}${error}${colors.reset}`);
  }
  for (const row of mine) {
    const head = `${colourOf(row)}${glyphOf(row)}${colors.reset} ${row.key.padEnd(28)}${colors.dim}${rowTail(row)}${colors.reset}`;
    headerRow(head, row.state.enabled ? '' : `${colors.dim}off${colors.reset}`);
  }
  if (mine.length === 0) console.log(`${I}${colors.dim}No daemons — declare them in ${manifestFile('<project>')}.${colors.reset}`);
  console.log('');
}

async function show(key: string): Promise<void> {
  const row = await findRow(key);
  const { entry: e, state: s } = row;

  console.log('');
  headerRow(
    `${colourOf(row)}${glyphOf(row)}${colors.reset} ${colors.bold}${row.key}${colors.reset} ${colors.dim}${e.description ?? ''}${colors.reset}`,
    `${colors.dim}${s.enabled ? 'on' : 'off'}${colors.reset}`,
  );
  rule();
  field('cmd', e.cmd);
  field('cwd', path.join(row.project, e.cwd ?? '.'));
  if (e.env) field('env', Object.entries(e.env).map(([k, v]) => `${k}=${v}`).join(' '));
  if (e.kind === 'daemon') {
    field('every', [short(e.every), e.atMost ? `at most ${e.atMost.n}/${short(e.atMost.window)}` : '', `when ${e.when}`, e.timeout ? `timeout ${short(e.timeout)}` : ''].filter(Boolean).join(' · '));
  } else {
    field('run', [e.run, `restart ${e.restart}`, e.port ? `port ${e.port}` : '', s.tabFallback ? 'tab→detached' : ''].filter(Boolean).join(' · '));
  }
  if (s.pid !== undefined) field('pid', `${s.pid}${s.startedAt ? ` · since ${s.startedAt}` : ''}`);
  if (s.lastStart) field('ran', `${s.lastStart}${s.lastEnd ? ` → ${s.lastEnd}` : ''}`);
  if (s.lastStatus) field('last', `${GLYPH[s.lastStatus]} ${s.lastStatus} · ${s.lastSummary ?? ''}`);
  if (s.nextDue) field('next', s.nextDue);
  if (s.alert) field('alert', `${colors.yellow}${s.alert}${colors.reset}`);

  for (const line of await readLogTail(key, 5)) console.log(`${I}${colors.dim}${line}${colors.reset}`);
  console.log('');
}

/** `-f` and `-n N`, the flags `tail` has: nobody types `--follow` at a log. */
async function tail(key: string, args: string[]): Promise<void> {
  const n = Number(args[args.indexOf('-n') + 1]);
  for (const line of await readLog(key, args.includes('-n') && n > 0 ? n : 30)) console.log(`${I}${line}`);
  if (!args.includes('-f')) return;

  // Whatever the supervisor appends, until the human quits; a rotation starts the tail over.
  let size = Bun.file(logFile(key)).size;
  for (;;) {
    await Bun.sleep(500);
    const file = Bun.file(logFile(key));
    if (file.size < size) size = 0;
    if (file.size > size) {
      process.stdout.write(await file.slice(size).text());
      size = file.size;
    }
  }
}
