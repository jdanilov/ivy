import path from 'node:path';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, unlink } from 'node:fs/promises';
import type { Autonomy, Claim, Deviation, Mission, MissionState, Workflow } from '../types.js';
import { factoryHome, loadProjects, saveProject } from './projects.js';
import { dumpWorkflow, loadWorkflow, readWorkflowFile } from './workflow.js';

/** A refusal is an expected "no" from the CLI: one line, exit 1, no stack. */
export class Refusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Refusal';
  }
}

/** A stub has no branch, so every command that needs one stops here. */
export function notStub(state: MissionState): asserts state is MissionState & { branch: string } {
  if (state.status === 'stub' || state.branch === null) throw new Refusal(`mission ${state.name} is a stub, open it first`);
}

const LIVE_WINDOW_MS = 10 * 60 * 1000;
const eventsDir = (): string => path.join(factoryHome(), 'events');

// ── git ──────────────────────────────────────────────────────────────────────

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if ((await proc.exited) !== 0) throw new Refusal(`git ${args.join(' ')}: ${(err.trim() || out.trim()).split('\n')[0]}`);
  // Only the trailing newline goes: porcelain lines carry their status in the leading two columns.
  return out.trimEnd();
}

async function gitOk(cwd: string, ...args: string[]): Promise<boolean> {
  return git(cwd, ...args).then(() => true, () => false);
}

export interface WorktreeEntry {
  dir: string;
  branch: string | null;
}

/** The first entry of `git worktree list` is always the main checkout. */
export async function listWorktrees(cwd: string): Promise<WorktreeEntry[]> {
  const entries: WorktreeEntry[] = [];
  for (const block of (await git(cwd, 'worktree', 'list', '--porcelain')).split('\n\n')) {
    const dir = block.split('\n').find((l) => l.startsWith('worktree '))?.slice(9);
    if (!dir) continue;
    const ref = block.split('\n').find((l) => l.startsWith('branch '))?.slice(7);
    entries.push({ dir, branch: ref ? ref.replace('refs/heads/', '') : null });
  }
  return entries;
}

/** Mission folders always live in the main checkout, whatever worktree we are called from. */
export async function mainCheckout(cwd: string): Promise<string> {
  const first = (await listWorktrees(cwd))[0];
  if (!first) throw new Refusal(`${cwd} is not a git repository`);
  return first.dir;
}

export async function currentCheckout(cwd: string): Promise<string> {
  return git(cwd, 'rev-parse', '--show-toplevel');
}

export async function currentBranch(cwd: string): Promise<string> {
  return git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
}

/** The branch a mission merges into. */
export async function trunkBranch(cwd: string): Promise<string> {
  for (const name of ['main', 'master']) {
    if (await gitOk(cwd, 'rev-parse', '--verify', `refs/heads/${name}`)) return name;
  }
  throw new Refusal('no main or master branch to merge into');
}

// ── state.json ───────────────────────────────────────────────────────────────

export const now = (): string => new Date().toISOString();

/** Tolerant read: a hand-written state.json keeps working, missing fields take folder defaults. */
export async function readState(dir: string): Promise<MissionState> {
  const raw = (await Bun.file(path.join(dir, 'state.json')).json()) as Partial<MissionState>;
  const name = raw.name ?? path.basename(dir).replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const status = raw.status ?? 'open';
  return {
    name,
    title: raw.title ?? name,
    workflow: raw.workflow ?? 'story',
    autonomy: raw.autonomy ?? 'partial',
    status,
    step: raw.step ?? '',
    round: raw.round ?? 0,
    session: raw.session ?? null,
    branch: raw.branch ?? (status === 'stub' ? null : `mission/${name}`),
    worktree: raw.worktree ?? null,
    gates: raw.gates ?? {},
    steps: raw.steps ?? {},
    deviations: raw.deviations ?? [],
    created: raw.created ?? now(),
    updated: raw.updated ?? now(),
  };
}

/** Temp file plus rename: a killed process never leaves half a state.json on disk. */
export async function writeState(dir: string, state: MissionState): Promise<void> {
  state.updated = now();
  const target = path.join(dir, 'state.json');
  const temp = path.join(dir, `.state.json.${process.pid}`);
  await Bun.write(temp, JSON.stringify(state, null, 2) + '\n');
  await rename(temp, target);
}

export function deviate(state: MissionState, what: string, reason: string): void {
  const entry: Deviation = { at: now(), what, reason };
  state.deviations.push(entry);
}

/** The dial that decides which decisions wait. Moving it mid-mission is a deviation, with its source. */
export async function setAutonomy(cwd: string, name: string | undefined, autonomy: Autonomy, from: string): Promise<Mission> {
  const mission = await resolveMission(cwd, name);
  mission.state.autonomy = autonomy;
  deviate(mission.state, `autonomy set to ${autonomy}`, from);
  await writeState(mission.dir, mission.state);
  return mission;
}

/**
 * The pointer follows work that was inserted into the graph, whether by `step add` or by `mission
 * shape`: with the step before it finished, standing on that step or on the one the insert displaced
 * means the new step is what runs next. Anywhere else the pointer is where the human put it.
 */
export function pointAtInserted(state: MissionState, workflow: Workflow, name: string): void {
  const at = workflow.steps.findIndex((s) => s.name === name);
  const before = workflow.steps[at - 1]?.name;
  const displaced = workflow.steps[at + 1]?.name;
  const status = before ? state.steps[before]?.status : undefined;
  if (status !== 'done' && status !== 'skipped') return;
  if (state.step === before || (displaced !== undefined && state.step === displaced)) state.step = name;
}

// ── claim ────────────────────────────────────────────────────────────────────

export const claimPath = (main: string): string => path.join(main, '.factory', 'claim');

export async function readClaim(main: string): Promise<Claim | null> {
  return Bun.file(claimPath(main)).json().then((c) => c as Claim, () => null);
}

export async function writeClaim(main: string, claim: Claim): Promise<void> {
  await mkdir(path.dirname(claimPath(main)), { recursive: true });
  await Bun.write(claimPath(main), JSON.stringify(claim, null, 2) + '\n');
}

export async function clearClaim(main: string): Promise<void> {
  await unlink(claimPath(main)).catch(() => {});
}

/** What the Factory writes into a project and the project never tracks: the claim it holds the
 *  checkout with, and every mission folder — live and archived — which belong to the machine
 *  that ran them, not to the history of the code. */
const IGNORED = ['.factory/claim', '.factory/missions/', '.factory/archive/'];

/**
 * A tracked claim or mission folder reads as dirty and blocks every close, so the project ignores
 * all three. Missing lines are committed on the spot when `.gitignore` is otherwise clean, since
 * the edit would itself be the dirt that blocks the close. Returns what happened, for one printed line.
 */
export async function ensureIgnored(checkout: string): Promise<'added' | 'committed' | null> {
  const missing: string[] = [];
  for (const line of IGNORED) if (!(await gitOk(checkout, 'check-ignore', '-q', line))) missing.push(line);
  if (missing.length === 0) return null;

  const clean = (await git(checkout, 'status', '--porcelain', '--', '.gitignore')) === '';
  const file = path.join(checkout, '.gitignore');
  const current = await Bun.file(file).text().catch(() => '');
  await Bun.write(file, `${current}${current === '' || current.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`);
  if (!clean) return 'added';

  const done = await gitOk(checkout, 'add', '--', '.gitignore')
    && await gitOk(checkout, 'commit', '-m', '🧹 chore: ignore the Factory\'s own files', '--', '.gitignore');
  return done ? 'committed' : 'added';
}

// ── sessions ─────────────────────────────────────────────────────────────────

/** Live means the session's events file was touched inside the last ten minutes. */
export async function sessionLive(session: string | null): Promise<boolean> {
  if (!session) return false;
  const info = await stat(path.join(eventsDir(), `${session}.jsonl`)).catch(() => null);
  return info !== null && Date.now() - info.mtimeMs < LIVE_WINDOW_MS;
}

/**
 * The Claude process behind a session, from the pid the hook logs on every event line. A session
 * started by hand has no `--session-id` in its argv, so this is the only way to find it; the pid
 * counts only while a process named `claude` still holds it, since pids get reused.
 */
export async function sessionPid(session: string): Promise<number | null> {
  const text = await readFile(path.join(eventsDir(), `${session}.jsonl`), 'utf-8').catch(() => '');
  const last = text.trimEnd().split('\n').at(-1) ?? '';
  let pid: unknown;
  try {
    pid = (JSON.parse(last) as { pid?: unknown }).pid;
  } catch {
    return null;
  }
  if (typeof pid !== 'number' || pid <= 0) return null;
  const proc = Bun.spawn(['ps', '-o', 'comm=', '-p', String(pid)], { stdout: 'pipe', stderr: 'ignore' });
  const comm = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return path.basename(comm) === 'claude' ? pid : null;
}

// ── finding missions ─────────────────────────────────────────────────────────

export const missionsDir = (main: string): string => path.join(main, '.factory', 'missions');
export const archiveDir = (main: string): string => path.join(main, '.factory', 'archive');

/**
 * Mission work only happens in a checkout `~/.factory/projects` knows: the projects list lives
 * under HOME, so this is what makes a scratch HOME a sandbox instead of a suggestion.
 */
export async function registered(main: string): Promise<void> {
  const real = await realpath(main).catch(() => main);
  for (const project of await loadProjects()) {
    if (project === main || project === real) return;
    if ((await realpath(project).catch(() => null)) === real) return;
  }
  throw new Refusal(`${main} is not a registered project — run: factory install ${main}`);
}

/** The missions in a folder, newest name last. Missing folder reads as none. */
async function readMissions(dir: string): Promise<Mission[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const missions: Mission[] = [];
  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const folder = path.join(dir, entry.name);
    const state = await readState(folder).catch(() => null);
    if (state) missions.push({ dir: folder, state });
  }
  return missions;
}

export async function listMissions(cwd: string): Promise<Mission[]> {
  const main = await mainCheckout(cwd);
  await registered(main);
  return readMissions(missionsDir(main));
}

/** Archived missions: closed work moved aside, read by `mission list --all` and nothing else. */
export async function listArchived(cwd: string): Promise<Mission[]> {
  const main = await mainCheckout(cwd);
  await registered(main);
  return readMissions(archiveDir(main));
}

/**
 * Name given: match the mission name or the folder. No name: the mission bound to this
 * worktree, else the claimed one, else the only open mission, else a lone stub.
 */
export async function resolveMission(cwd: string, name?: string): Promise<Mission> {
  const main = await mainCheckout(cwd);
  const missions = await listMissions(cwd);

  if (name) {
    const hit = missions.find((m) => m.state.name === name) ?? missions.find((m) => path.basename(m.dir) === name);
    if (!hit) throw new Refusal(`no mission "${name}" in ${missionsDir(main)}`);
    return hit;
  }

  const fromEnv = process.env.FACTORY_MISSION;
  if (fromEnv) {
    const hit = missions.find((m) => m.dir === path.resolve(fromEnv));
    if (hit) return hit;
  }

  const checkout = await currentCheckout(cwd);
  if (checkout !== main) {
    const hit = missions.find((m) => m.state.worktree === checkout);
    if (hit) return hit;
  }

  const claim = await readClaim(main);
  if (claim) {
    const hit = missions.find((m) => m.state.name === claim.mission);
    if (hit) return hit;
  }

  const open = missions.filter((m) => m.state.status === 'open');
  if (open.length === 1) return open[0]!;
  if (open.length > 1) throw new Refusal(`several open missions here, name one: ${open.map((m) => m.state.name).join(', ')}`);

  // A lone stub answers too: the caller then says it is a stub instead of claiming there is no mission.
  const stubs = missions.filter((m) => m.state.status === 'stub');
  if (stubs.length === 1) return stubs[0]!;
  throw new Refusal('no open mission here, name one or run mission new');
}

/** The row state of a whole mission, per docs/design.md. An open gate outranks a running step. */
export function missionRowState(state: MissionState): string {
  if (state.status === 'stub') return 'pending';
  if (state.status === 'closed') return 'done';
  if (Object.values(state.gates).some((g) => g.status === 'open')) return 'blocked';
  if (Object.values(state.steps).some((s) => s.status === 'running')) return 'running';
  return 'pending';
}

/** The mission's own copy, or the named default when the copy was never written. */
export async function missionWorkflow(mission: Mission): Promise<Workflow> {
  const copy = path.join(mission.dir, 'workflow.yaml');
  if (await Bun.file(copy).exists()) return readWorkflowFile(copy);
  return loadWorkflow(mission.state.workflow, path.resolve(mission.dir, '..', '..', '..'));
}

// ── mission new ──────────────────────────────────────────────────────────────

export interface NewMission {
  name: string;
  title?: string;
  workflow: string;
  autonomy: Autonomy;
  worktree: boolean;
  stub: boolean;
}

/**
 * Branch and folder first, state.json last: an interrupted run leaves an orphan branch,
 * which the next run detects and reuses, never a state.json naming a branch that is not there.
 */
export async function createMission(cwd: string, opts: NewMission): Promise<Mission> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(opts.name)) throw new Refusal(`mission name must be lowercase letters, digits and dashes, got "${opts.name}"`);

  const main = await mainCheckout(cwd);
  await registered(main);
  const checkout = await currentCheckout(cwd);
  const workflow = await loadWorkflow(opts.workflow, main);
  const title = opts.title ?? opts.name;
  const folder = path.join(missionsDir(main), `${today()}-${opts.name}`);

  const taken = opts.stub
    ? await stat(folder).then(() => true, () => false)
    : await Bun.file(path.join(folder, 'state.json')).exists();
  if (taken) throw new Refusal(`mission "${opts.name}" already exists at ${folder}`);

  // 1. branch, reusing an orphan from an interrupted run. A stub has none until `mission open`.
  const branch = opts.stub ? null : `mission/${opts.name}`;
  let worktree: string | null = null;

  if (branch) {
    const branchExists = await gitOk(main, 'rev-parse', '--verify', `refs/heads/${branch}`);
    if (opts.worktree) {
      worktree = path.join(path.dirname(main), `${path.basename(main)}-${opts.name}`);
      const existing = (await listWorktrees(main)).find((w) => w.dir === worktree);
      if (existing && existing.branch !== branch) throw new Refusal(`${worktree} is already a worktree on ${existing.branch ?? 'a detached HEAD'}`);
      if (!existing) await git(main, 'worktree', 'add', ...(branchExists ? [worktree, branch] : [worktree, '-b', branch]));
    } else if ((await currentBranch(checkout)) !== branch) {
      await git(checkout, 'checkout', ...(branchExists ? [branch] : ['-b', branch]));
    }
  }

  // 2. folder
  await mkdir(path.join(folder, 'handoffs'), { recursive: true });
  await Bun.write(path.join(folder, 'workflow.yaml'), dumpWorkflow(workflow));
  if (opts.stub) await Bun.write(path.join(folder, 'intent.md'), intentSkeleton(title));

  // 3. state.json last
  const state: MissionState = {
    name: opts.name,
    title,
    workflow: workflow.name,
    autonomy: opts.autonomy,
    status: opts.stub ? 'stub' : 'open',
    step: workflow.steps[0]!.name,
    round: 0,
    session: null,
    branch,
    worktree,
    gates: {},
    steps: {},
    deviations: [],
    created: now(),
    updated: now(),
  };
  await writeState(folder, state);

  // 4. claim, only when this mission works in the main checkout and nobody else holds it
  if (branch && !worktree && !(await readClaim(main))) await writeClaim(main, { mission: opts.name, session: null, at: now() });

  await saveProject(main);
  return { dir: folder, state };
}

/** The Why, Done looks like and Not in this mission the human fills in before opening the stub. */
function intentSkeleton(title: string): string {
  return `# Intent: ${title}\n\n## Why\n\n## Done looks like\n\n## Not in this mission\n`;
}

/** A stub becomes a real mission: branch from HEAD, claim, status open. `open` then proceeds as usual. */
export async function promoteMission(cwd: string, mission: Mission): Promise<void> {
  const state = mission.state;
  const main = await mainCheckout(cwd);
  const claim = await readClaim(main);
  if (claim && claim.mission !== state.name) throw new Refusal(`${main} is claimed by mission ${claim.mission}`);

  const checkout = await currentCheckout(cwd);
  const branch = `mission/${state.name}`;
  const branchExists = await gitOk(main, 'rev-parse', '--verify', `refs/heads/${branch}`);
  if ((await currentBranch(checkout)) !== branch) await git(checkout, 'checkout', ...(branchExists ? [branch] : ['-b', branch]));

  state.status = 'open';
  state.branch = branch;
  await writeState(mission.dir, state);

  if (!claim) await writeClaim(main, { mission: state.name, session: null, at: now() });
}

// ── mission close ────────────────────────────────────────────────────────────

/** Every action checks its own postcondition, so a rerun after a crash finishes the job. */
export async function closeMission(cwd: string, mission: Mission, keepBranch = false): Promise<string[]> {
  const state = mission.state;
  notStub(state);
  const main = await mainCheckout(cwd);
  const trunk = await trunkBranch(main);
  const log: string[] = [];

  // The mission folder is ignored, never committed and never checked out: `status: closed` in its
  // own state.json is what says this mission is finished, and a rerun after a crash reads it back.
  if (state.status !== 'closed') {
    const open = Object.entries(state.gates).filter(([, g]) => g.status === 'open').map(([s]) => s);
    if (open.length > 0) throw new Refusal(`gate open on ${open.join(', ')} — answer it with: factory gate answer <step> accept`);

    const workflow = await missionWorkflow(mission);
    const last = workflow.steps[workflow.steps.length - 1]!.name;
    const lastState = state.steps[last]?.status;
    if (lastState !== 'done' && lastState !== 'skipped') throw new Refusal(`step "${last}" is ${lastState ?? 'pending'} — the final step must be done or skipped before close`);

    // Work the branch is carrying would not survive the checkout back to the trunk.
    const dirty = [
      ...(await git(main, 'diff', '--name-only', 'HEAD')).split('\n'),
      ...(await git(main, 'ls-files', '--others', '--exclude-standard')).split('\n'),
    ].filter((f) => f !== '');
    // Everything under `.factory/` is the Factory's own: the claim this close clears, this
    // mission's folder, and a sibling's that belongs to whoever is running it in another worktree.
    const outside = dirty.filter((f) => !f.startsWith('.factory/'));
    if (outside.length > 0) throw new Refusal(`dirty outside the mission folder, commit or stash first: ${outside.join(', ')}`);
  }

  const merged = (await git(main, 'branch', '--merged', trunk, '--format=%(refname:short)')).split('\n').includes(state.branch);
  const was = await currentBranch(main);
  if (was !== trunk) await git(main, 'checkout', trunk);

  try {
    if (!merged) {
      await git(main, 'merge', '--no-ff', '-m', `🔀 merge: mission/${state.name}`, state.branch);
      log.push(`merged ${state.branch} into ${trunk}`);
    }

    if (state.status !== 'closed') {
      state.status = 'closed';
      await writeState(mission.dir, state);
      log.push(`closed ${path.relative(main, mission.dir)}`);
    }
  } finally {
    // Never leave the main checkout on a branch another mission is not using.
    if (was !== trunk && was !== state.branch) await git(main, 'checkout', was).catch(() => {});
  }

  const claim = await readClaim(main);
  if (claim?.mission === state.name) {
    await clearClaim(main);
    log.push('claim cleared');
  }

  if (state.worktree) {
    const live = (await listWorktrees(main)).some((w) => w.dir === state.worktree);
    if (live) {
      const removed = await gitOk(main, 'worktree', 'remove', state.worktree);
      log.push(removed ? `worktree removed ${state.worktree}` : `worktree left in place ${state.worktree} — remove it by hand`);
      if (removed) await rm(state.worktree, { recursive: true, force: true }).catch(() => {});
    }
  }

  // Merged, and the folder is on the trunk: the branch holds nothing the mission still needs.
  if (!keepBranch && (await gitOk(main, 'rev-parse', '--verify', '--quiet', `refs/heads/${state.branch}`))) {
    const gone = await gitOk(main, 'branch', '-d', state.branch);
    log.push(gone ? `branch ${state.branch} deleted` : `branch ${state.branch} left in place — delete it by hand`);
  }

  return log;
}

// ── archive ──────────────────────────────────────────────────────────────────

/**
 * A closed mission steps out of the way: one rename between `.factory/missions/` and
 * `.factory/archive/`. Both are ignored, so git has nothing to say about it — the folder is the
 * machine's record of a run, not part of the history of the code.
 */
export async function archiveMission(cwd: string, name: string, back = false): Promise<string[]> {
  const main = await mainCheckout(cwd);
  await registered(main);
  const from = back ? archiveDir(main) : missionsDir(main);
  const to = back ? missionsDir(main) : archiveDir(main);
  const named = (m: Mission): boolean => m.state.name === name || path.basename(m.dir) === name;

  const mission = (await readMissions(from)).find(named);
  if (!mission) {
    if ((await readMissions(to)).find(named)) return [];
    throw new Refusal(`no mission "${name}" in ${from}`);
  }
  if (mission.state.status !== 'closed') throw new Refusal(`mission ${name} is ${mission.state.status} — close it first`);

  const target = path.join(to, path.basename(mission.dir));
  await mkdir(to, { recursive: true });
  await rename(mission.dir, target);
  return [`${back ? 'unarchived' : 'archived'} ${path.relative(main, target)}`];
}

/** Local calendar date, so a folder matches the day the human started the mission. */
function today(): string {
  return new Date().toLocaleDateString('en-CA');
}
