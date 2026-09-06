import type { RunState, StepKind } from './model.js';

/** Truecolor palette from docs/design.md. Weight is colour: nothing here is bold or italic.
 *  No background: the screen draws on whatever the terminal already paints. */
export const C = {
  // design.md samples the separator at #232323; that vanishes on a terminal background lighter
  // than the screenshots'. One step up keeps every rule and the column divider visible.
  rule: '#3a3a3a',
  dim: '#6e6e6e',
  bright: '#e4e4e4',
  accent: '#d97757',
  success: '#a8a968',
  warning: '#d7af5f',
  error: '#cc5555',
  selBg: '#b8b8b8',
  selFg: '#141414',
  track: '#404040',
  // Agent work, desaturated to sit beside the olive and the amber.
  agent: '#6b8fd9',
};

export const GLYPH: Record<RunState, string> = {
  pending: '○', running: '●', done: '✓', failed: '✗', blocked: '⊘', skipped: '·',
};

export function stateColor(state: RunState): string {
  if (state === 'running') return C.accent;
  if (state === 'done') return C.success;
  if (state === 'failed') return C.error;
  if (state === 'blocked') return C.warning;
  return C.dim;
}

/** Four families, one colour each: the human's own gates in the olive, gatekeeping in the amber,
 *  agent work in the blue, everything technical in the label grey. */
const KIND: Record<StepKind, string> = {
  human: C.success, gatekeeper: C.warning, agent: C.agent, technical: C.dim,
};

/** A step's name reads as what kind of work it is, its glyph as where it is in its life. */
export function stepColor(kind: StepKind): string {
  return KIND[kind];
}
