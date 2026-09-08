import path from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';
import type { KeyEvent } from '@opentui/core';
import {
  applyParts, applyScopes, archive, killSession, newMission, openTab, renameMission, renameSession, sendMessage, setAutonomy, setCaffeinate, setLaunch,
} from './actions.js';
import { writeOrder } from '../core/config.js';
import { factoryHome } from '../core/projects.js';
import { id } from './format.js';
import { clamp, itemKey, leftItems, select, type LeftItem, type Ui } from './panes/pane.js';
import { changes, nextScope, partStatus, pending, scopeChanges } from './panes/parts.js';
import { draftOf, editKey, insert, targetOf, type Draft } from './panes/compose.js';
import { act, draw, toast, type App } from './screen.js';
import type { Autonomy, Caffeinate, Launch, Mission, Project } from './model.js';

/** What every key does. The screen draws; this is the only place a keypress changes anything. */

const CAFFEINATE: Caffeinate[] = ['auto', 'on', 'off'];
const AUTONOMY: Autonomy[] = ['full', 'partial', 'none'];
const LAUNCH: Launch[] = ['fg', 'bg'];

/** The one focusable value in the MISSION pane. Turned at once and written behind that: the
 *  rebuild that follows reads state.json back. */
function cycleAutonomy(app: App, project: Project, m: Mission): void {
  m.autonomy = AUTONOMY[(AUTONOMY.indexOf(m.autonomy) + 1) % AUTONOMY.length]!;
  act(app, `${m.name} autonomy ${m.autonomy}…`, () => setAutonomy(project.path, m.name, m.autonomy));
}

/** A line typed on the status bar. `done` gets it on ↵, trimmed, and empty when nothing was typed. */
function ask(app: App, label: string, done: (value: string) => void): void {
  app.ui.input = { label, value: '', done };
  draw(app);
}

/** Every key is a character while the line is open, but the three that end or edit it. */
function typing(app: App, key: KeyEvent): void {
  const input = app.ui.input!;
  if (key.name === 'escape') app.ui.input = null;
  else if (key.name === 'return') {
    app.ui.input = null;
    input.done(input.value.trim());
  } else if (key.name === 'backspace') input.value = input.value.slice(0, -1);
  else if (!key.ctrl && !key.meta && key.sequence.length === 1 && key.sequence >= ' ') input.value += key.sequence;
  else return;
  draw(app);
}

/** The chord that sends: ⇧↵ where the terminal tells shift from plain, ^S everywhere. */
const sends = (key: KeyEvent): boolean => (key.name === 'return' && key.shift) || (key.ctrl && key.name === 's');

/** `^V` reads the clipboard itself: the terminal pastes on ⌘V through its own paste event, and
 *  `^V` reaches the screen as a key like any other. */
function pasteClipboard(app: App, d: Draft): void {
  void new Response(Bun.spawn(['pbpaste'], { stdout: 'pipe', stderr: 'ignore' }).stdout).text().then(
    (text) => { insert(d, text); draw(app); },
    (e: unknown) => toast(app, `✗ ${e instanceof Error ? e.message : String(e)}`),
  );
}

/** The message box has the keys: `↵` breaks a line, `Esc` keeps the draft and hands them back. */
function composing(app: App, key: KeyEvent): void {
  const { ui } = app;
  const { here } = select(app.snap, ui);
  const target = targetOf(here);
  const d = draftOf(ui, here);
  if (key.name === 'escape' || target === null) ui.compose = false;
  else if (sends(key)) {
    const text = d.text.trim();
    if (text === '') return toast(app, 'nothing to send');
    ui.compose = false;
    return act(app, `sending to ${target.name}…`, async () => {
      const said = await sendMessage(target.session, text);
      d.text = '';
      d.cursor = 0;
      return said;
    });
  } else if (key.ctrl && key.name === 'u') {
    d.text = '';
    d.cursor = 0;
  } else if (key.ctrl && key.name === 'v') return pasteClipboard(app, d);
  else if (!editKey(d, key, app.r.terminalWidth - 2)) return;
  draw(app);
}

/**
 * Shift+↑↓ swaps the row with its neighbour of the same kind — the one shown, so a hidden archived
 * mission is stepped over — and keeps the whole list's order in config. The snapshot is swapped in
 * place too, so the row moves under the selection before the rebuild that reads config lands.
 */
function moveRow(app: App, here: LeftItem, delta: number): void {
  const { snap, ui } = app;
  const move = <T>(list: T[], shown: T[], item: T, key: string, nameOf: (t: T) => string): void => {
    const other = shown[shown.indexOf(item) + delta];
    if (other === undefined) return;
    const i = list.indexOf(item);
    const j = list.indexOf(other);
    [list[i], list[j]] = [list[j]!, list[i]!];
    ui.left = leftItems(snap, ui.showArchived).findIndex((row) => itemKey(row) === itemKey(here));
    void writeOrder(key, list.map(nameOf)).catch((e: unknown) => toast(app, `✗ ${e instanceof Error ? e.message : String(e)}`));
  };
  if (here.kind === 'project') move(snap.projects, snap.projects, here.project, 'projects', (p) => p.name);
  else if (here.kind === 'mission') {
    const shown = here.project.missions.filter((m) => ui.showArchived || !m.archived);
    move(here.project.missions, shown, here.mission, `${here.project.name}/missions`, (m) => m.name);
  } else if (here.kind === 'session') move(here.project.sessions, here.project.sessions, here.session, `${here.project.name}/sessions`, (s) => s.id);
  draw(app);
}

function handleKey(app: App, key: KeyEvent): void {
  const { snap, ui } = app;

  if (ui.input) return typing(app, key);
  if (ui.compose) return composing(app, key);

  // The panel holds the right pane until it is asked to leave; nothing else acts behind it.
  if (ui.help) {
    if (key.name !== '?' && key.name !== 'escape') return;
    ui.help = false;
    return draw(app);
  }
  if (key.name === '?') { ui.help = true; return draw(app); }

  // The foot has the screen to itself: the arrows walk back through it, three keys hand it back.
  if (ui.full) {
    if (key.name === 'up') ui.scroll += 1;
    else if (key.name === 'down') ui.scroll = Math.max(0, ui.scroll - 1);
    else if (key.name === 'return' || key.name === 'escape') ui.full = false;
    // The tab's own key: switch to it, or, pressed on the tab already drawn, hand the screen back.
    else if (key.name === 'a' || key.name === 'd') footKey(ui, key.name === 'a' ? 'activity' : 'decisions');
    else return;
    return draw(app);
  }

  const { items, here } = select(snap, ui);
  const right = ui.focus === 'right';
  const inMessages = right && here.kind === 'inbox';
  const inGlobal = here.kind === 'global';
  const inParts = right && (here.kind === 'project' || inGlobal);
  const inMission = right && here.kind === 'mission';
  const move = (i: number, n: number, delta: number) => clamp(i + delta, n);

  if (inParts && ui.confirm) {
    if (key.name === 'y') {
      const scopes = scopeChanges(here.project, ui);
      const { add, drop } = changes(here.project, ui);
      const count = inGlobal ? scopes.length : add.length + drop.length;
      ui.toggles = {};
      ui.confirm = false;
      return act(app, `applying ${count} change(s)…`, () =>
        inGlobal ? applyScopes(scopes) : applyParts(here.project.path, add, drop));
    }
    if (key.name === 'n' || key.name === 'escape') ui.confirm = false;
    return draw(app);
  }

  switch (key.name) {
    case 'up': case 'down': {
      const d = key.name === 'up' ? -1 : 1;
      if (key.shift && !right) return moveRow(app, here, d);
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
      if (inParts && pending(here.project, ui, inGlobal).length > 0) ui.toggles = {};
      else ui.focus = 'left';
      break;
    case 'space':
      if (inParts) {
        const part = here.project.parts[ui.part];
        // The global row picks where a part lives, a project row whether it is installed here.
        if (part) ui.toggles[part.name] = inGlobal ? nextScope(part, ui) : partStatus(part.name, part.status, ui) !== 'installed';
      }
      break;
    case 'return': {
      // Every message is answered in the session that raised it; the row says which command.
      if (inMessages) return;
      if (inParts) {
        if (!pending(here.project, ui, inGlobal).length) return;
        ui.confirm = true;
        break;
      }
      // A row with a session behind it is written to; the arrows already enter the right pane.
      if (!right && (here.kind === 'session' || here.kind === 'mission')) {
        if (targetOf(here) === null) return toast(app, `${here.kind === 'mission' ? here.mission.name : id(here.session.id)} has no session — O opens one`);
        ui.compose = true;
        break;
      }
      if (!right) ui.focus = 'right';
      break;
    }
    case 'a':
      footKey(ui, 'activity');
      break;
    case 'd':
      footKey(ui, 'decisions');
      break;
    case 's': {
      ui.showArchived = !ui.showArchived;
      const next = leftItems(snap, ui.showArchived);
      const found = next.findIndex((item) => itemKey(item) === itemKey(here));
      ui.left = found >= 0 ? found : clamp(ui.left, next.length);
      break;
    }
    case 'e': {
      if (right) break;
      if (here.kind !== 'mission') return toast(app, 'select a mission to archive it');
      const m = here.mission;
      if (m.status === 'open') return toast(app, `${m.name} is open — close it first`);
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
    case 'l': {
      snap.launch = LAUNCH[(LAUNCH.indexOf(snap.launch) + 1) % LAUNCH.length]!;
      const mode = snap.launch;
      return act(app, `launch ${mode.toUpperCase()}…`, () => setLaunch(mode));
    }
    case 'o':
      if (right) break;
      if (here.kind !== 'mission') return toast(app, 'select a mission to open its tab');
      return act(app, `opening ${here.mission.name}…`, () => openTab(here.project.path, here.mission.name));
    case 'r': {
      // In Parts the toggles are what `r` resets; on a row it is the name.
      if (inParts) {
        ui.toggles = {};
        break;
      }
      if (right) break;
      if (here.kind === 'mission') {
        const { project, mission } = here;
        return ask(app, `title for ${mission.name}:`, (title) =>
          title === '' ? draw(app) : act(app, `titling ${mission.name}…`, () => renameMission(project.path, mission.name, title)));
      }
      if (here.kind === 'session') {
        const { session } = here;
        return ask(app, `name for ${id(session.id)}:`, (name) =>
          name === '' ? draw(app) : act(app, `naming ${id(session.id)}…`, () => renameSession(session.id, name)));
      }
      return toast(app, 'select a mission or a session to rename it');
    }
    case 'm': {
      if (right || here.kind === 'inbox' || here.kind === 'global') return toast(app, 'select a project to add a mission to');
      const { project } = here;
      // Two lines: the name, which is the folder and later the branch, then the title a human reads.
      return ask(app, `new mission in ${project.name} · name:`, (name) => {
        if (name === '') return draw(app);
        ask(app, `title for ${name}:`, (title) => act(app, `creating ${name}…`, () => newMission(project.path, name, title)));
      });
    }
    case 'k': {
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

/** `A` and `D` each name a foot tab: the first press draws it, the second gives it the screen,
 *  the third hands the screen back. */
function footKey(ui: Ui, tab: Ui['foot']): void {
  if (ui.foot !== tab) ui.foot = tab;
  else ui.full = !ui.full;
  ui.scroll = 0;
}

/** A terminal paste, bracketed so it arrives whole: into the message box, or onto the line being
 *  typed on the status bar as one line. Anywhere else it is nothing. */
export function onPaste(app: App, text: string): void {
  const { ui } = app;
  if (ui.input) ui.input.value += text.replace(/\s+/g, ' ').trim();
  else if (ui.compose) insert(draftOf(ui, select(app.snap, ui).here), text);
  else return;
  draw(app);
}

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
