import path from 'node:path';
import { FACTORY_ROOT } from './registry.js';
import type { Workflow, WorkflowStep } from '../types.js';

const GATES = ['human', 'orchestrator'];

/**
 * The workflow named `name` for a project: the Factory default from `workflows/<name>.yaml`,
 * replaced wholesale by an entry under `workflows:` in `<project>/.factory/factory.yaml`.
 */
export async function loadWorkflow(name: string, projectDir: string): Promise<Workflow> {
  const config = await readFactoryConfig(projectDir);
  const override = isRecord(config.workflows) ? config.workflows[name] : undefined;
  if (override !== undefined) return validate(parseWorkflow(name, override, `${projectDir}/.factory/factory.yaml`));

  const file = Bun.file(path.join(FACTORY_ROOT, 'workflows', `${name}.yaml`));
  if (!(await file.exists())) throw new Error(`no workflow "${name}" in workflows/ or .factory/factory.yaml`);
  return validate(parseWorkflow(name, Bun.YAML.parse(await file.text()), `workflows/${name}.yaml`));
}

/** The mission's own copy, already validated when it was written. */
export async function readWorkflowFile(file: string): Promise<Workflow> {
  const raw = Bun.YAML.parse(await Bun.file(file).text());
  const name = isRecord(raw) && typeof raw.name === 'string' ? raw.name : path.basename(file, '.yaml');
  return validate(parseWorkflow(name, raw, file));
}

/**
 * Project command lists (`verify`, `e2e`, `deliver`) kept beside the workflows. A recipe may nest,
 * and a nested one reads back under its dotted path: `e2e: { ready: [...] }` is `e2e.ready`.
 */
export async function loadRecipes(projectDir: string): Promise<Record<string, string[]>> {
  const config = await readFactoryConfig(projectDir);
  if (!isRecord(config.recipes)) return {};
  const recipes: Record<string, string[]> = {};
  const add = (name: string, value: unknown): void => {
    if (isRecord(value)) for (const [key, nested] of Object.entries(value)) add(`${name}.${key}`, nested);
    else recipes[name] = Array.isArray(value) ? value.map(String) : [String(value)];
  };
  for (const [name, value] of Object.entries(config.recipes)) add(name, value);
  return recipes;
}

async function readFactoryConfig(projectDir: string): Promise<Record<string, unknown>> {
  const file = Bun.file(path.join(projectDir, '.factory', 'factory.yaml'));
  if (!(await file.exists())) return {};
  const raw = Bun.YAML.parse(await file.text());
  return isRecord(raw) ? raw : {};
}

/** `steps:` is an ordered list of bare names or single-key mappings. Order is the sequence. */
export function parseWorkflow(name: string, raw: unknown, where: string): Workflow {
  const fail: (msg: string) => never = (msg) => {
    throw new Error(`${where}: ${msg}`);
  };

  if (!isRecord(raw)) return fail('expected a mapping');
  if (!Array.isArray(raw.steps)) fail('steps must be a list');

  const steps = (raw.steps as unknown[]).map((entry): WorkflowStep => {
    if (typeof entry === 'string') return { name: entry };
    if (!isRecord(entry)) return fail('a step is a name or a single-key mapping');

    const keys = Object.keys(entry);
    if (keys.length !== 1) fail(`step mapping must have one key, got ${keys.join(', ') || 'none'}`);
    const stepName = keys[0]!;
    const body = entry[stepName];
    const step: WorkflowStep = { name: stepName };
    if (body === null || body === undefined) return step;
    if (!isRecord(body)) fail(`step "${stepName}" must map to a mapping`);

    if (body.role !== undefined) {
      if (typeof body.role !== 'string') fail(`step "${stepName}": role must be a string`);
      step.role = body.role;
    }
    if (body.gate !== undefined) {
      if (typeof body.gate !== 'string' || !GATES.includes(body.gate)) fail(`step "${stepName}": gate must be ${GATES.join(' or ')}`);
      step.gate = body.gate as WorkflowStep['gate'];
    }
    if (body.parallel !== undefined) {
      if (!Array.isArray(body.parallel) || body.parallel.some((m) => typeof m !== 'string')) {
        fail(`step "${stepName}": parallel must be a list of step names`);
      }
      step.parallel = body.parallel as string[];
    }
    if (body.loop !== undefined) {
      const loop = body.loop;
      if (!isRecord(loop) || typeof loop.back !== 'string') fail(`step "${stepName}": loop needs a back step`);
      step.loop = { back: loop.back as string, max: typeof loop.max === 'number' ? loop.max : 1 };
    }
    return step;
  });

  return { name: typeof raw.name === 'string' ? raw.name : name, steps };
}

/** Unique step names, `loop.back` earlier in the list, unique parallel members. */
export function validate(wf: Workflow): Workflow {
  const seen = new Set<string>();
  const fail: (msg: string) => never = (msg) => {
    throw new Error(`workflow "${wf.name}": ${msg}`);
  };

  if (wf.steps.length === 0) fail('needs at least one step');

  for (const step of wf.steps) {
    if (seen.has(step.name)) fail(`duplicate step "${step.name}"`);
    seen.add(step.name);

    for (const member of step.parallel ?? []) {
      if (seen.has(member)) fail(`step "${step.name}": parallel member "${member}" is not unique`);
      seen.add(member);
    }

    // `back` must already be behind us, otherwise the loop never returns.
    if (step.loop && !seen.has(step.loop.back)) fail(`step "${step.name}": loop.back "${step.loop.back}" is not an earlier step`);
  }

  return wf;
}

/** Every name a transition may name: the steps plus their parallel members. */
export function allStepNames(wf: Workflow): string[] {
  return wf.steps.flatMap((s) => [s.name, ...(s.parallel ?? [])]);
}

/**
 * Who runs a step. The workflow's own `role` settles it; the two gatekeeping names carry their
 * runner in the name; everything else is the Orchestrator's own work. One place, so the CLI, the
 * screen and a spawn never disagree about who a step belongs to.
 */
export function stepRole(step: WorkflowStep): string {
  if (step.role) return step.role;
  if (step.name === 'verify') return 'verifier';
  if (step.name === 'validate') return 'validator';
  return 'orchestrator';
}

/** The model a role is spawned with. `model` is passed on every spawn: frontmatter is not honoured. */
export const ROLE_MODEL: Record<string, string> = {
  orchestrator: 'fable',
  worker: 'opus',
  validator: 'opus',
  verifier: 'sonnet',
  investigator: 'sonnet',
  summarizer: 'sonnet',
};

export function findStep(wf: Workflow, name: string): WorkflowStep | undefined {
  return wf.steps.find((s) => s.name === name);
}

/** The step that owns `name`, whether `name` is the step itself or one of its parallel members. */
export function ownerStep(wf: Workflow, name: string): WorkflowStep | undefined {
  return wf.steps.find((s) => s.name === name || (s.parallel ?? []).includes(name));
}

export function nextStep(wf: Workflow, after: string): WorkflowStep | undefined {
  const idx = wf.steps.findIndex((s) => s.name === after);
  return idx === -1 ? undefined : wf.steps[idx + 1];
}

export function isFinalStep(wf: Workflow, name: string): boolean {
  return wf.steps[wf.steps.length - 1]?.name === name;
}

/** Block-style YAML, written back when the orchestrator amends the mission's copy. */
export function dumpWorkflow(wf: Workflow): string {
  const lines = [`name: ${wf.name}`, 'steps:'];
  for (const step of wf.steps) {
    const attrs: string[] = [];
    if (step.role) attrs.push(`role: ${step.role}`);
    if (step.gate) attrs.push(`gate: ${step.gate}`);
    if (step.parallel) attrs.push(`parallel: [${step.parallel.join(', ')}]`);
    if (step.loop) attrs.push(`loop: { back: ${step.loop.back}, max: ${step.loop.max} }`);
    lines.push(attrs.length === 0 ? `  - ${step.name}` : `  - ${step.name}: { ${attrs.join(', ')} }`);
  }
  return lines.join('\n') + '\n';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
