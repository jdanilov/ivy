import path from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';
import type { KeyEvent } from '@opentui/core';
import {
  addEntry, applyParts, applyScopes, archive, killSession, newProject, openTab, readLog, renameProject,
  renameSession, runNow, saveIntent, sendMessage, setAutonomy, setCaffeinate, setLaunch, stopRow, uninstallProject,
} from './actions.js';
import { LOG_LINES } from '../commands/daemon.js';
import { parseDuration, type NewEntry, type Service } from '../core/daemons.js';
import { writeOrder } from '../core/config.js';
import { factoryHome } from '../core/projects.js';
import { id } from './format.js';
import { clamp, itemKey, leftItems, select, type LeftItem, type Ui } from './panes/pane.js';
import { changes, nextScope, partStatus, pending, scopeChanges } from './panes/parts.js';
import { seedTail } from './panes/foot.js';
import { draftOf, editKey, insert, targetOf, type Draft } from './panes/compose.js';
import { defOf, draftFor, fieldAt, showsParts, stops, untouched, type FormDraft, type FormKind } from './panes/form.js';
import { AUTONOMY, intentForm, shapeOf, workflowOf, type Shape } from './panes/intent.js';
import { act, draw, rightWidth, toast, type App } from './screen.js';
import type { Autonomy, Caffeinate, Intent, Launch, Mission, Project } from './model.js';

/** What every key does. The screen draws; this is the only place a keypress changes anything. */

const CAFFEINATE: Caffeinate[] = ['auto', 'on', 'off'];
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
 * A form has the keys: `⇥` and `⇧↵` walk its stops, `↵` breaks a line inside a field and walks on
 * a one-line one, `←→` turn a dial, `^S` — or `⇧↵` on the last stop — saves, `Esc` hands the keys
 * back and keeps what was typed. Which form it is decides two things and no more: the definition
 * whose fields these are, and the save. Every field is a message-box draft, so the editing below
 * the field level is `editKey`'s and nothing here repeats it.
 */
function forming(app: App, key: KeyEvent): void {
  const { ui } = app;
  const { here } = select(app.snap, ui);
  const kind = ui.form!;
  const def = defOf(kind);
  // The row moved out from under the form — an archived stub, a promoted one: the keys go back.
  if (def.key(here) === null) {
    ui.form = null;
    return draw(app);
  }
  const d = draftFor(ui, kind, here);
  const fields = def.fields(here, d);
  // The stops the walk knows: a field the entry has no use for, or one the form only draws, is
  // not one of them. A cursor that has fallen off them lands back on the first.
  const walk = stops(fields);
  const at = Math.max(0, walk.indexOf(d.field));
  const field = fields[d.field];
  // The draft under the cursor; nothing while it is on a dial, which has no text to edit.
  const text = field && field.options === undefined ? d.texts[field.key] : undefined;
  // `⇧↵` walks the fields the way `⇥` does, so the chord that ends a message ends a field too,
  // and on the last stop it saves — the form is finished where the eye already is. `↵` walks a
  // one-line field for the same reason it cannot break a line there: a name is a folder, a branch
  // and half a daemon's key.
  const shifted = key.name === 'return' && key.shift;
  const walks = key.name === 'tab' || shifted || (key.name === 'return' && field?.line === true);

  if (key.name === 'escape') {
    ui.form = null;
    // A draft still equal to what it was made from leaves nothing behind: the project row goes
    // back to its parts, a stub's pane back to following its file. A changed one is kept, and
    // the pane keeps showing it.
    if (untouched(kind, d, here)) delete ui.forms[def.key(here)!];
  } else if (shifted && d.field === walk.at(-1)) return SAVES[kind](app, here, d);
  else if (walks) {
    const back = key.name === 'tab' && key.shift;
    d.field = walk[(at + (back ? walk.length - 1 : 1)) % walk.length]!;
  } else if (key.ctrl && key.name === 's') return SAVES[kind](app, here, d);
  else if (key.ctrl && key.name === 'u') {
    if (field && text) d.texts[field.key] = { text: '', cursor: 0 };
  } else if (field?.options && (key.name === 'left' || key.name === 'right')) {
    d.dials[field.key] = turn(field.options, d.dials[field.key]!, key.name === 'right');
  } else if (text === undefined) return;
  else if (key.ctrl && key.name === 'v') return pasteClipboard(app, text);
  else if (!editKey(text, key, rightWidth(app.r))) return;
  draw(app);
}

/** The form takes the keys with the cursor where its own definition opens it and the pane back at
 *  its first row: a window left where the last form was scrolled to would open on the middle of
 *  this one. */
function openForm(ui: Ui, kind: FormKind, here: LeftItem): void {
  ui.form = kind;
  ui.formTop = 0;
  draftFor(ui, kind, here).field = defOf(kind).fresh(here).field;
}

/** `M` and `P` are the project's, whichever of its rows is selected: the selection moves to the
 *  project row and the form opens there, so a draft is always shown by the row it belongs to. */
function openOnProject(app: App, items: LeftItem[], project: Project, kind: FormKind): void {
  app.ui.left = items.findIndex((item) => item.kind === 'project' && item.project === project);
  openForm(app.ui, kind, items[app.ui.left]!);
}

/** The next option on a dial, or the one before; the ends wrap. */
const turn = <T>(options: readonly T[], value: T, right: boolean): T =>
  options[(options.indexOf(value) + (right ? 1 : options.length - 1)) % options.length]!;

/** A save is on its way: the draft is gone and the keys are back, and the toast the write returns
 *  is the only thing left to wait for. */
function written(app: App, kind: FormKind, here: LeftItem, doing: string, run: () => Promise<string>): void {
  delete app.ui.forms[defOf(kind).key(here)!];
  app.ui.form = null;
  act(app, doing, run);
}

/** A save's refusal: the field is named on the status bar and the cursor put on it, so the next
 *  keystroke fixes it, and nothing is written. */
const refusing = (app: App, kind: FormKind, here: LeftItem, d: FormDraft) => (key: string, why: string): void => {
  d.field = fieldAt(kind, here, d, key);
  toast(app, why);
};

/** Which save `^S` runs. The only thing `forming` reads the form's kind for, beyond its fields. */
const SAVES: Record<FormKind, (app: App, here: LeftItem, d: FormDraft) => void> = {
  intent: saveIntentForm,
  service: saveServiceForm,
};

/** `^S` on the intent form: nothing is written until both required fields hold something. */
function saveIntentForm(app: App, here: LeftItem, d: FormDraft): void {
  const form = intentForm(here)!;
  const { project, create } = form;
  const refuse = refusing(app, 'intent', here, d);
  const name = create ? d.texts.name!.text.trim() : form.name;
  const goal = d.texts.goal!.text.trim();

  if (create && !/^[a-z0-9][a-z0-9-]*$/.test(name)) return refuse('name', 'the name is the folder and the branch — lowercase letters, digits and dashes');
  if (create && project.missions.some((m) => m.name === name)) return refuse('name', `${project.name} already has a mission called ${name}`);
  if (goal === '') return refuse('goal', 'goal is empty — say what the mission is for');

  const intent: Intent = { goal, done: d.texts.done!.text.trim(), extra: d.texts.extra!.text.trim() };
  const autonomy = d.dials.autonomy as Autonomy;
  // The graph is rewritten only when the dial was turned: a stub on a workflow the dial does not
  // list reads `auto` and keeps it, unless the human picks another.
  const shape = d.dials.shape as Shape;
  const workflow = shape === shapeOf(form.workflow) ? null : workflowOf(shape);
  written(app, 'intent', here, `saving ${name}…`, () => saveIntent(project.path, name, intent, autonomy, workflow, create));
}

/** `^S` on the service form: the manifest's own three rules — a name that is a key, a command to
 *  run, a cadence that parses — checked here so the cursor can land on what was refused, and
 *  checked again by `writeEntry`, which is the one that has the file in front of it. */
function saveServiceForm(app: App, here: LeftItem, d: FormDraft): void {
  const project = here.kind === 'project' ? here.project : null;
  if (project === null) return;
  const text = (key: string): string => d.texts[key]!.text.trim();
  const refuse = refusing(app, 'service', here, d);
  const daemon = d.dials.kind === 'daemon';
  const name = text('name');

  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return refuse('name', 'the name is half the row\'s key — lowercase letters, digits and dashes');
  if (project.daemons.some((row) => row.entry.name === name)) return refuse('name', `${project.name} already runs ${name}`);
  if (text('cmd') === '') return refuse('cmd', 'cmd is empty — say what to run');
  if (daemon) {
    try {
      parseDuration(text('every'));
    } catch (e) {
      return refuse('every', e instanceof Error ? e.message : String(e));
    }
  }
  if (!daemon && text('port') !== '' && !/^\d+$/.test(text('port'))) return refuse('port', 'a port is a number, or nothing');

  const entry: NewEntry = {
    name,
    kind: daemon ? 'daemon' : 'service',
    description: text('description'),
    cmd: text('cmd'),
    cwd: text('cwd'),
    ...(daemon ? { every: text('every') } : { restart: d.dials.restart as Service['restart'], port: text('port') }),
  };
  written(app, 'service', here, `adding ${name}…`, () => addEntry(project.path, entry));
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
  if (ui.form) return forming(app, key);
  if (ui.compose) return composing(app, key);

  // The panel holds the right pane until it is asked to leave; nothing else acts behind it.
  if (ui.help) {
    if (key.name !== '?' && key.name !== 'escape') return;
    ui.help = false;
    return draw(app);
  }
  if (key.name === '?') { ui.help = true; return draw(app); }

  // The foot has the screen to itself: the arrows walk back through it, three keys hand it back.
  if (ui.size === 'full') {
    if (key.name === 'up') ui.scroll += 1;
    else if (key.name === 'down') ui.scroll = Math.max(0, ui.scroll - 1);
    else if (key.name === 'return' || key.name === 'escape') ui.size = 'third';
    // The tab's own key: switch to it, or, pressed on the tab already drawn, walk the size on.
    else if (key.name === 'a' || key.name === 'd') footKey(ui, key.name === 'a' ? 'activity' : 'decisions');
    else return;
    return draw(app);
  }

  const { items, here } = select(snap, ui);
  const right = ui.focus === 'right';
  const inMessages = right && here.kind === 'inbox';
  const inGlobal = here.kind === 'global';
  // The form outranks Parts on a project row, so the Parts keys go where the pane went: `space`
  // must never toggle a part nobody can see.
  const inParts = right && showsParts(ui, here);
  // A stub has no graph and no dial in the pane: its right pane is the intent form.
  const inMission = right && here.kind === 'mission' && here.mission.status !== 'stub';
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
      // A stub is not written to, it is written: `↵` gives the intent form the keys, on the goal,
      // because the name is the folder and fixed once the folder is there.
      if (!right && here.kind === 'mission' && here.mission.status === 'stub') {
        openForm(ui, 'intent', here);
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
      // The first tab on a daemon row is its log, and reading the log is what acknowledges the
      // row's alert: the key that draws it makes the call `factory daemon log` makes, and
      // selecting the row makes none.
      if (here.kind === 'daemon') showLog(app, here.daemon.key);
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
      // A stub's autonomy is the form's dial, and a kept draft would write its own value back
      // over anything `T` did here: one writer per value.
      if (here.mission.status === 'stub') return toast(app, '↵ edits the intent, autonomy is in the form');
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
      // The Orchestrator's first act is to read the intent: an empty goal makes it interview the
      // human in the tab instead. The CLI's own `open` is untouched — that one is deliberate.
      if (here.mission.status === 'stub' && !here.mission.intent?.goal) return toast(app, `${here.mission.name} has no goal — ↵ fills the intent`);
      return act(app, `opening ${here.mission.name}…`, () => openTab(here.project.path, here.mission.name));
    case 'r': {
      // A daemon is run now, a service is started, and either way the row is turned on: Run is
      // the only way on, so there is no off row the key leaves the human staring at.
      if (here.kind === 'daemon') {
        const { key, entry } = here.daemon;
        return act(app, `${key} ${entry.kind === 'daemon' ? 'run' : 'start'}…`, () => runNow(key));
      }
      // In Parts the toggles are what `r` resets; on a row it is the name.
      if (inParts) {
        ui.toggles = {};
        break;
      }
      if (right) break;
      // A project's name is this machine's own word for the checkout, a session's is the Factory's
      // word for a conversation: two writers, one key, and the row says which.
      if (here.kind === 'project') {
        const { project } = here;
        return ask(app, `name for ${project.name}:`, (name) =>
          name === '' ? draw(app) : act(app, `renaming ${project.name}…`, () => renameProject(project.path, name)));
      }
      if (here.kind === 'session') {
        const { session } = here;
        return ask(app, `name for ${id(session.id)}:`, (name) =>
          name === '' ? draw(app) : act(app, `naming ${id(session.id)}…`, () => renameSession(session.id, name)));
      }
      return toast(app, 'select a project or a session to rename it');
    }
    case 'm': {
      if (here.kind === 'inbox' || here.kind === 'global') return toast(app, 'select a project to add a mission to');
      // The form belongs to the project, so any of its rows opens it and the selection moves there:
      // a new mission's draft is shown by the project row, the way a message draft is by its own.
      openOnProject(app, items, here.project, 'intent');
      break;
    }
    case 'p': {
      if (here.kind === 'inbox' || here.kind === 'global') return toast(app, 'select a project to add a daemon or a service to');
      // The manifest is the project's, so the form opens on the project's row, the way `M` does:
      // what `^S` writes is one entry of `.factory/daemons.yaml`, and `R` is what turns it on.
      openOnProject(app, items, here.project, 'service');
      break;
    }
    case 'n':
      // On any row, the Inbox and `Global` included: a machine with no projects yet still has to
      // be able to add the first one.
      return ask(app, 'path of the project:', (input) =>
        input === '' ? draw(app) : act(app, `installing ${input}…`, () => newProject(input)));
    case 'u': {
      if (here.kind !== 'project') return toast(app, 'select a project to uninstall it');
      // The one key that takes parts off a checkout, so it asks for the letter first; anything
      // else typed is a no, because a slip on this line is a reinstall.
      const { project } = here;
      return ask(app, `uninstall ${project.name}? Y to confirm:`, (answer) =>
        answer.toLowerCase() === 'y'
          ? act(app, `uninstalling ${project.name}…`, () => uninstallProject(project.path))
          : toast(app, 'kept'));
    }
    case 'x':
      if (here.kind !== 'daemon') return toast(app, 'select a daemon or a service to stop it');
      return act(app, `${here.daemon.key} stop…`, () => stopRow(here.daemon.key));
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

/**
 * `A`'s CLI twin is `factory daemon log`: the same call, once, as the log is drawn — which is what
 * acknowledges an alert and drops its Inbox row. The pane is drawn first and the refusal is
 * swallowed, because only a fixture row can refuse: a live one came from `listRows`.
 */
function showLog(app: App, key: string): void {
  void readLog(key, LOG_LINES).then((lines) => {
    seedTail(key, lines);
    draw(app);
  }, () => {});
}

/** A key must never take the screen down: the toast says what broke, the log says where. */

/** The sizes the foot walks, in the order the key gives them: what is drawn, then the whole
 *  screen, then the tab row alone. */
const SIZES: Ui['size'][] = ['third', 'full', 'min'];

/** `A` and `D` each name a foot tab: pressed on the other tab the key switches to it and the foot
 *  keeps its size, pressed on the tab already drawn it turns the size dial one step. */
function footKey(ui: Ui, tab: Ui['foot']): void {
  if (ui.foot !== tab) ui.foot = tab;
  else ui.size = SIZES[(SIZES.indexOf(ui.size) + 1) % SIZES.length]!;
  ui.scroll = 0;
}

/** A terminal paste, bracketed so it arrives whole: into the message box, or onto the line being
 *  typed on the status bar as one line. Anywhere else it is nothing. */
export function onPaste(app: App, text: string): void {
  const { ui } = app;
  if (ui.input) ui.input.value += text.replace(/\s+/g, ' ').trim();
  else if (ui.form !== null && defOf(ui.form).key(select(app.snap, ui).here) !== null) {
    const { here } = select(app.snap, ui);
    const d = draftFor(ui, ui.form, here);
    const field = defOf(ui.form).fields(here, d)[d.field];
    if (field && !field.options) insert(d.texts[field.key]!, text);
  } else if (ui.compose) insert(draftOf(ui, select(app.snap, ui).here), text);
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
