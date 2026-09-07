import path from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';
import type { KeyEvent } from '@opentui/core';
import { applyParts, archive, killSession, openTab, setAutonomy, setCaffeinate } from './actions.js';
import { factoryHome } from '../core/projects.js';
import { id } from './format.js';
import { clamp, leftItems, itemKey } from './panes/pane.js';
import { changes, partStatus, pending } from './panes/parts.js';
import { act, draw, toast, type App } from './screen.js';
import type { Autonomy, Caffeinate, Mission, Project } from './model.js';

/** What every key does. The screen draws; this is the only place a keypress changes anything. */

const CAFFEINATE: Caffeinate[] = ['auto', 'on', 'off'];
const AUTONOMY: Autonomy[] = ['full', 'partial', 'none'];

/** The one focusable value in the MISSION pane. Turned at once and written behind that: the
 *  rebuild that follows reads state.json back. */
function cycleAutonomy(app: App, project: Project, m: Mission): void {
  m.autonomy = AUTONOMY[(AUTONOMY.indexOf(m.autonomy) + 1) % AUTONOMY.length]!;
  act(app, `${m.name} autonomy ${m.autonomy}…`, () => setAutonomy(project.path, m.name, m.autonomy));
}

export function handleKey(app: App, key: KeyEvent): void {
  const { snap, ui } = app;

  // The panel holds the right pane until it is asked to leave; nothing else acts behind it.
  if (ui.help) {
    if (key.name !== '?' && key.name !== 'escape') return;
    ui.help = false;
    return draw(app);
  }
  if (key.name === '?') { ui.help = true; return draw(app); }

  // The foot has the screen to itself: the arrows walk back through it, three keys hand it back.
  if (ui.full) {
    if (key.name === 'up' || key.name === 'k') ui.scroll += 1;
    else if (key.name === 'down' || key.name === 'j') ui.scroll = Math.max(0, ui.scroll - 1);
    else if (key.name === 'return' || key.name === 'f' || key.name === 'escape') ui.full = false;
    else if (key.name === 'a') ui.foot = 'activity';
    else if (key.name === 'd') ui.foot = 'decisions';
    else return;
    return draw(app);
  }

  const items = leftItems(snap, ui.showArchived);
  ui.left = clamp(ui.left, items.length);
  const here = items[ui.left]!;
  const right = ui.focus === 'right';
  const inMessages = right && here.kind === 'inbox';
  const inParts = right && (here.kind === 'project' || here.kind === 'global');
  const inMission = right && here.kind === 'mission';
  const move = (i: number, n: number, delta: number) => clamp(i + delta, n);

  if (inParts && ui.confirm) {
    if (key.name === 'y') {
      const { add, drop } = changes(here.project, ui);
      ui.toggles = {};
      ui.confirm = false;
      return act(app, `applying ${add.length + drop.length} change(s)…`, () => applyParts(here.project.path, add, drop));
    }
    if (key.name === 'n' || key.name === 'escape') ui.confirm = false;
    return draw(app);
  }

  switch (key.name) {
    case 'up': case 'k': case 'down': case 'j': {
      const d = key.name === 'up' || key.name === 'k' ? -1 : 1;
      if (inMessages) ui.msg = move(ui.msg, snap.inbox.length, d);
      else if (inParts) ui.part = move(ui.part, here.project.parts.length, d);
      else ui.left = move(ui.left, items.length, d);
      break;
    }
    case 'right':
      // `→` enters the right pane; in MISSION the dial is what it landed on, so it turns that.
      if (inMission) return cycleAutonomy(app, here.project, here.mission);
      ui.focus = 'right';
      break;
    case 'left':
      ui.focus = 'left';
      break;
    case 'escape':
      // Esc is the way out of a set of toggles nobody applied; a second one leaves the pane.
      if (inParts && pending(here.project, ui).length > 0) ui.toggles = {};
      else ui.focus = 'left';
      break;
    case 'space':
      if (inParts) {
        const part = here.project.parts[ui.part];
        if (part) ui.toggles[part.name] = partStatus(part.name, part.status, ui) !== 'installed';
      }
      break;
    case 'return': {
      // Every message is answered in the session that raised it; the row says which command.
      if (inMessages) return;
      if (inParts) {
        if (!pending(here.project, ui).length) return;
        ui.confirm = true;
        break;
      }
      if (!right) ui.focus = 'right';
      break;
    }
    case 'r':
      if (inParts) ui.toggles = {};
      break;
    case 'f':
      // The foot opens at its own foot, wherever the last visit left the scroll.
      ui.full = true;
      ui.scroll = 0;
      break;
    case 'a':
      ui.foot = 'activity';
      break;
    case 'd':
      ui.foot = 'decisions';
      break;
    case 'z': {
      ui.showArchived = !ui.showArchived;
      const next = leftItems(snap, ui.showArchived);
      const found = next.findIndex((item) => itemKey(item) === itemKey(here));
      ui.left = found >= 0 ? found : clamp(ui.left, next.length);
      break;
    }
    case 'h': {
      if (right) break;
      if (here.kind !== 'mission') return toast(app, 'select a mission to archive it');
      const m = here.mission;
      if (m.status !== 'closed') return toast(app, `${m.name} is ${m.status} — close it first`);
      return act(app, `${m.archived ? 'unarchiving' : 'archiving'} ${m.name}…`,
        () => archive(here.project.path, m.name, m.archived));
    }
    case 't':
      if (here.kind !== 'mission') break;
      return cycleAutonomy(app, here.project, here.mission);
    case 'c': {
      snap.caffeinate = CAFFEINATE[(CAFFEINATE.indexOf(snap.caffeinate) + 1) % CAFFEINATE.length]!;
      const mode = snap.caffeinate;
      return act(app, `caffeinate ${mode.toUpperCase()}…`, () => setCaffeinate(mode));
    }
    case 'o':
      if (right) break;
      if (here.kind !== 'mission') return toast(app, 'select a mission to open its tab');
      return act(app, `opening ${here.mission.name}…`, () => openTab(here.project.path, here.mission.name));
    case 'x': {
      if (right) break;
      const session = here.kind === 'mission' ? here.mission.session : here.kind === 'session' ? here.session.id : null;
      if (!session) return toast(app, 'no session on this row');
      return act(app, `killing ${id(session)}…`, () => killSession(session));
    }
    default:
      return;
  }
  draw(app);
}

/** A key must never take the screen down: the toast says what broke, the log says where. */
export function onKey(app: App, key: KeyEvent): void {
  try {
    handleKey(app, key);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const log = path.join(factoryHome(), 'control.log');
    const entry = `${new Date().toISOString()} key=${key.name}\n${err.stack ?? err.message}\n\n`;
    void mkdir(path.dirname(log), { recursive: true }).then(() => appendFile(log, entry)).catch(() => {});
    try {
      toast(app, `error: ${err.message}`);
    } catch {
      // The renderer itself is gone; the log already has the stack.
    }
  }
}
