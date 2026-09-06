import type { RunState, StepKind } from './model.js';

/** Truecolor palette from docs/design.md. Weight is colour: nothing here is bold or italic.
 *  No background: the screen draws on whatever the terminal already paints. */
export const C = {
  rule: '#232323',
  dim: '#6e6e6e',
  bright: '#e4e4e4',
  accent: '#d97757',
  success: '#a8a968',
  warning: '#d7af5f',
  error: '#cc5555',
  selBg: '#b8b8b8',
  selFg: '#141414',
  track: '#404040',
  // Semantic step colours, desaturated to sit beside the olive and the amber.
  implement: '#6b8fd9',
  gatekeeper: '#5fb0b0',
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

const KIND: Record<StepKind, string> = { plain: '', gate: C.warning, implement: C.implement, gatekeeper: C.gatekeeper };

/** A step's name reads as its role, its glyph reads as its life. Plain steps carry the life colour. */
export function stepColor(kind: StepKind, state: RunState): string {
  return KIND[kind] || stateColor(state);
}
