import path from 'node:path';
import { Refusal } from './mission.js';
import { home } from './projects.js';
import { FACTORY_ROOT } from './registry.js';

/** The two OS adapters the supervisor needs, and the only place either OS is named. */

const LABEL = 'com.factory.supervisor';

/** A missing or failing tool is no reading, never a throw: idle is an input, not a requirement. */
async function out(cmd: string[]): Promise<string> {
  try {
    const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'ignore' });
    const text = await new Response(proc.stdout).text();
    return (await proc.exited) === 0 ? text : '';
  } catch {
    return '';
  }
}

/** Seconds since the last human input. An OS with no adapter reads 0: always active. */
export async function idleSeconds(): Promise<number> {
  if (process.platform === 'darwin') {
    const ns = /"HIDIdleTime"\s*=\s*(\d+)/.exec(await out(['ioreg', '-c', 'IOHIDSystem', '-d', '4']))?.[1];
    return ns === undefined ? 0 : Number(ns) / 1e9;
  }

  if (process.platform === 'linux') {
    const ms = (await out(['xprintidle'])).trim();
    if (/^\d+$/.test(ms)) return Number(ms) / 1000;
    // logind's hint is a CLOCK_REALTIME stamp in microseconds; 0 is a session that is not idle.
    const hint = Number((await out(['loginctl', 'show-session', 'self', '-p', 'IdleSinceHint', '--value'])).trim());
    return hint > 0 ? Math.max(0, Date.now() / 1000 - hint / 1e6) : 0;
  }

  return 0;
}

/** The one OS unit that keeps the supervisor alive at login, written and loaded by `supervisor install`. */
export function unitFile(): { path: string; body: string; load: string[][]; unload: string[][] } {
  // A launch agent inherits almost no PATH: both the runtime and the entry point are absolute.
  const argv = [Bun.which('bun') ?? process.execPath, path.join(FACTORY_ROOT, 'src', 'cli.ts'), 'supervisor', 'start', '--foreground'];

  if (process.platform === 'darwin') {
    const file = path.join(home(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
    const domain = `gui/${process.getuid?.() ?? 0}`;
    return { path: file, body: plist(argv), load: [['launchctl', 'bootstrap', domain, file]], unload: [['launchctl', 'bootout', `${domain}/${LABEL}`]] };
  }

  if (process.platform === 'linux') {
    const unit = 'factory-supervisor.service';
    const body = `[Unit]\nDescription=Factory supervisor\n\n[Service]\nExecStart=${argv.join(' ')}\nRestart=always\n\n[Install]\nWantedBy=default.target\n`;
    return {
      path: path.join(home(), '.config', 'systemd', 'user', unit),
      body,
      load: [['systemctl', '--user', 'enable', '--now', unit]],
      unload: [['systemctl', '--user', 'disable', '--now', unit]],
    };
  }

  throw new Refusal(`no unit adapter for ${process.platform}`);
}

const plist = (argv: string[]): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argv.map((a) => `    <string>${a}</string>`).join('\n')}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
`;
