import path from 'node:path';
import { mkdir, unlink } from 'node:fs/promises';
import type { Flags } from '../core/args.js';
import { listRows } from '../core/daemons.js';
import { Refusal } from '../core/mission.js';
import { unitFile } from '../core/platform.js';
import { runSupervisor, startSupervisor, stopSupervisor, supervisorPid, supervisorStarted } from '../core/supervisor.js';
import { field, headerRow, rule } from '../ui/format.js';
import { I, colors, duration } from '../ui/theme.js';

/** The loop's own commands. `install` is the one place the Factory touches the OS scheduler:
 *  `start` and the loop itself know nothing about launchd or systemd. */

export async function supervisor(sub: string, flags: Flags): Promise<void> {
  switch (sub) {
    case 'start':
      return start(flags.foreground === true);
    case 'stop':
      return stopSupervisor();
    case 'status':
      return status();
    case 'install':
      return install();
    case 'uninstall':
      return remove();
    default:
      throw new Refusal(`supervisor: unknown subcommand "${sub ?? ''}" — start, stop, status, install, uninstall`);
  }
}

/** `--foreground` is what the unit and the detached start both run: the loop, in this process. */
async function start(foreground: boolean): Promise<void> {
  if (foreground) return runSupervisor();
  const pid = await startSupervisor();
  console.log(`${I}${colors.green}✓${colors.reset} supervisor running as ${colors.bold}${pid}${colors.reset}`);
}

async function status(): Promise<void> {
  const pid = await supervisorPid();
  const started = pid === null ? null : await supervisorStarted();
  const { rows } = await listRows();
  const on = rows.filter((r) => r.state.enabled);

  console.log('');
  headerRow(
    `${pid === null ? colors.dim : colors.cyan}●${colors.reset} ${colors.bold}supervisor${colors.reset}`,
    pid === null ? `${colors.dim}not running${colors.reset}` : `${colors.dim}pid ${pid} · up ${duration(started ?? undefined)}${colors.reset}`,
  );
  rule();
  field('rows', `${rows.length} · ${on.length} on · ${on.filter((r) => r.state.pid !== undefined).length} running · ${rows.filter((r) => r.state.alert !== undefined).length} alert`);
  field('unit', await unitLine());
  console.log('');
}

/** A machine with no adapter still gets a status line, because `status` never refuses. */
async function unitLine(): Promise<string> {
  try {
    const unit = unitFile();
    return (await Bun.file(unit.path).exists()) ? `installed · ${unit.path}` : `${colors.dim}not installed — factory supervisor install${colors.reset}`;
  } catch (err) {
    return `${colors.dim}${err instanceof Refusal ? err.message : String(err)}${colors.reset}`;
  }
}

async function install(): Promise<void> {
  const unit = unitFile();
  if (await Bun.file(unit.path).exists()) throw new Refusal(`a unit is already at ${unit.path} — factory supervisor uninstall first`);
  await mkdir(path.dirname(unit.path), { recursive: true });
  await Bun.write(unit.path, unit.body);
  for (const argv of unit.load) await os(argv);
  console.log(`${I}${colors.green}✓${colors.reset} unit loaded ${colors.dim}${unit.path}${colors.reset}`);
}

async function remove(): Promise<void> {
  const unit = unitFile();
  if (!(await Bun.file(unit.path).exists())) throw new Refusal(`no unit at ${unit.path}`);
  // A unit that was never loaded still has a file to remove, so an unload that fails is not fatal.
  for (const argv of unit.unload) await os(argv).catch(() => {});
  await unlink(unit.path);
  console.log(`${I}${colors.green}✓${colors.reset} unit removed ${colors.dim}${unit.path}${colors.reset}`);
}

/** Whatever the platform adapter named, and what it said when it would not do it. */
async function os(argv: string[]): Promise<void> {
  const proc = Bun.spawn(argv, { stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) throw new Refusal(`${argv.join(' ')} failed: ${err.trim().split('\n')[0] ?? ''}`);
}
