// calc.ts — the ONLY producer of Computed numbers. A calculated value exists exactly when its
// recorded formula evaluates over inputs that are themselves trustworthy: grounded (the number
// comes from the receipted resolution) or calculated (re-derived here, never taken on faith).
// An illustrative or structure input poisons the whole derivation — CALCULATED must never launder
// an illustrative magnitude into something that reads as real. Any failure (cycle, missing input,
// malformed formula, non-finite result) is null, never a wrong number. Pure + deterministic.
import { safeEval } from '../../canvas/blocks/everyday/expr';
import { formatValue } from '../../canvas/lib/format';
import type { CalcTrace, Computed, WorldValue } from './types';

/** A claimed value must reproduce the computed one to within this relative tolerance to survive
 *  (the levers self-consistency gate's idiom). */
export const SELF_CONSISTENCY_TOL = 0.02;

/** The one place a plain number earns the brand — everything above it in this file is the proof.
 *  A source pin test asserts this assertion exists in no other file. */
const brand = (n: number): Computed => n as Computed;

/** Identifier tokens as safeEval reads them (dotted value ids can't appear in a formula, so a calc
 *  over one correctly fails closed). */
const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

export interface CalcResult {
  value: Computed;
  raw: string;
}

/** Resolve one input id to a trustworthy number, or null. A calculated input is RE-DERIVED from
 *  its own trace (memoization-free, cycle-safe via the visiting set — the levers/dag.ts idiom)
 *  rather than read off, so a stale or hand-assembled value can't feed a new derivation. */
function resolveNumber(
  id: string,
  resolveInput: (id: string) => WorldValue | undefined,
  visiting: Set<string>,
): number | null {
  const v = resolveInput(id);
  if (!v) return null;
  if (v.kind === 'grounded') return v.resolution.value;
  if (v.kind !== 'calculated') return null; // illustrative/structure never feed a calculation
  if (visiting.has(id)) return null; // cycle
  visiting.add(id);
  const env: Record<string, number> = {};
  for (const dep of v.calc.inputs) {
    const n = resolveNumber(dep, resolveInput, visiting);
    if (n === null) {
      visiting.delete(id);
      return null;
    }
    env[dep] = n;
  }
  visiting.delete(id);
  const out = safeEval(v.calc.formula, env);
  return Number.isFinite(out) ? out : null;
}

/**
 * Evaluate a calc trace. Returns null unless EVERY declared input resolves to a grounded or
 * calculated number and the formula yields a finite result — a formula must also actually read
 * each declared input (and at least one), so a constant "formula" can't smuggle a model-authored
 * number in under the calculated badge.
 */
export function computeCalc(
  trace: CalcTrace,
  resolveInput: (id: string) => WorldValue | undefined,
): CalcResult | null {
  const identifiers = new Set(trace.formula.match(IDENT_RE) ?? []);
  if (identifiers.size === 0) return null;
  if (trace.inputs.length === 0) return null;
  const env: Record<string, number> = {};
  for (const id of trace.inputs) {
    if (!identifiers.has(id)) return null; // a declared input the formula never reads is padding
    const n = resolveNumber(id, resolveInput, new Set());
    if (n === null) return null;
    env[id] = n;
  }
  const value = safeEval(trace.formula, env);
  if (!Number.isFinite(value)) return null;
  return { value: brand(value), raw: formatValue(value) };
}

/** Whether the model's claimed value agrees with the computed one, relative to the computed value
 *  (the trustworthy side). Used by the coercer: on disagreement the claim is rejected outright. */
export function selfConsistent(computed: number, claimed: number): boolean {
  const denom = Math.abs(computed) > 1e-9 ? Math.abs(computed) : 1;
  return Math.abs(computed - claimed) / denom <= SELF_CONSISTENCY_TOL;
}
