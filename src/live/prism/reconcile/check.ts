// reconcile/check.ts — the pure arithmetic at the heart of Reconcile. Given two (or three) figures the
// document relates, decide whether they CONTRADICT — entirely in code, so the verdict is something a
// reader can redo on a calculator. No model and no network sit in this path. (This is also the seed of
// the dependency executor Live Levers will extend.) Conservative tolerances so a rounding difference
// never reads as a contradiction; returns null when the figures are consistent or not comparable.
import type { NumberAtom } from './types';

/** Format a computed percentage for display (drops a trailing .0). */
function fmtPct(v: number): string {
  return `${+v.toFixed(1)}%`;
}

/** A computed contradiction: the quantity, what the document stated, what the math gives, the receipt. */
export interface Verdict {
  label: string;
  stated: string;
  computed: string;
  detail: string;
}

/**
 * Two figures the document asserts are the SAME quantity (e.g. a prose "40% growth" and a table cell).
 * A contradiction if they differ beyond a small tolerance; null when consistent (stay silent) or not
 * comparable (different units).
 */
export function equalityVerdict(a: NumberAtom, b: NumberAtom, label: string): Verdict | null {
  if (a.unit !== b.unit) return null;
  const diff = Math.abs(a.value - b.value);
  const tol = a.unit === '%' ? 0.5 : a.unit === 'x' ? 0.05 : Math.max(1, Math.abs(a.value) * 0.02);
  if (diff <= tol) return null;
  return {
    label,
    stated: a.raw,
    computed: b.raw,
    detail: `p.${a.page}: ${a.raw}  ✕  p.${b.page}: ${b.raw}`,
  };
}

/**
 * A stated "% change" vs the change actually implied by the two values it's computed from (e.g. "40%
 * growth" alongside "$10M → $13M", which is really 30%). A contradiction if the stated percent is off
 * by more than ~1 point (or 5%); null when consistent or the inputs aren't usable (non-percent, mixed
 * units, or a zero base).
 */
export function growthVerdict(
  pct: NumberAtom,
  from: NumberAtom,
  to: NumberAtom,
  label: string,
): Verdict | null {
  if (pct.unit !== '%') return null;
  if (from.unit !== to.unit || (from.unit !== 'currency' && from.unit !== 'count')) return null;
  if (from.value === 0) return null;
  const expected = ((to.value - from.value) / from.value) * 100;
  const tol = Math.max(1, Math.abs(pct.value) * 0.05);
  if (Math.abs(expected - pct.value) <= tol) return null;
  return {
    label,
    stated: pct.raw,
    computed: fmtPct(expected),
    detail: `p.${pct.page}: ${pct.raw}  ✕  p.${from.page}: ${from.raw}→${to.raw} = ${fmtPct(expected)}`,
  };
}
