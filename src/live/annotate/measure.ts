// measure.ts — the pen computes the figure it writes, instead of taking the model's word for it.
//
// A bracket may carry a written delta; the prompt's own worked example is a "+38%". Nothing
// verifies that figure. It is a number the model typed, drawn between two numbers the reader can
// see, and the reader has no way to tell which is which — exactly the class of claim the living
// world refuses to render.
//
// So derive it instead. A bracket only reaches this code once BOTH of its anchors located in the
// rendered DOM, and `findSaidMatch` only matches when the anchor's digits actually appear there —
// so the two values are on screen, in front of the reader, and the figure between them is provable
// by construction. The anchor STRINGS are read rather than the matched screen text because the
// match normalizes '$' and '%' away: the digits are guaranteed to be the reader's, and the unit
// marker that survives only in the model's string is what tells points apart from a ratio.
//
// Pure — no DOM, no model call, no tokens.
import { formatValue } from '../../canvas/lib/format';
import { parseAmount } from '../ground/number';

/** At or above this, a multiple reads better than a percentage: "2.3×" beats "+130%". Below it —
 *  including every shrink — a percentage reads better than a fraction: "−57%" beats "0.4×". */
const RATIO_FLOOR = 2;
/** Under half a point / half a percent there is nothing worth writing down; the bracket draws bare
 *  rather than captioning a move the reader cannot see. */
const NOISE = 0.5;
/** The cap `liveSchema` already applies to a model-authored label — matched so a computed one can
 *  never be the reason a caption overflows its clear-space box. */
const MAX_LABEL = 28;
/** A label that is nothing but a figure — optionally signed, optionally with a currency mark or a
 *  unit suffix. "+38%", "2.3×", "$1,560", "12 pts" match; "Q4 gap" and "2 weeks out" do not. */
const FIGURE_ONLY = /^[+\-\u2212]?\s*[$€£¥₹]?\s*\d[\d,]*(?:\.\d+)?\s*(?:%|pts?|×|x|k|m|bn)?$/i;

/** One decimal at most, never a trailing ".0", and locale-aware via the canvas formatter — the one
 *  place a number becomes a string. Magnitudes here are small, so grouping never applies. */
function short(n: number): string {
  const rounded = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return formatValue(rounded, { decimals: Number.isInteger(rounded) ? 0 : 1 });
}

/** A signed magnitude with a true minus, so the caption reads as typeset rather than typed. */
function signed(value: number, suffix: string): string {
  return `${value < 0 ? '−' : '+'}${short(Math.abs(value))}${suffix}`;
}

/**
 * The caption a bracket should write between `at` and `to`.
 *
 * Returns `modelLabel` untouched whenever the span cannot be measured honestly — either anchor
 * unparseable, the two anchors measuring different things, a zero base, or a move inside the noise
 * floor. So the worst case is exactly today's behaviour.
 *
 * A model label that IS a figure gives way to the computed one: a figure nothing proves loses to a
 * figure the screen proves. Anything else is a name the model chose — "the premium", and equally
 * "Q4 gap", which carries a digit without measuring anything — and is always kept. The test is the
 * label's SHAPE, not the mere presence of a digit: clobbering a name is a certain, visible defect,
 * while leaving prose alone is only the status quo, and the prompt now tells the model not to put a
 * figure in this label at all.
 */
export function measuredLabel(at: string, to: string, modelLabel?: string): string | undefined {
  if (modelLabel && !FIGURE_ONLY.test(modelLabel)) return modelLabel;

  const a = parseAmount(at);
  const b = parseAmount(to);
  if (!a || !b || a.kind !== b.kind) return modelLabel;

  const cap = (s: string): string => (s.length > MAX_LABEL ? s.slice(0, MAX_LABEL) : s);

  // Percentages compare in POINTS. "36% is 1.5× 24%" is a different claim from the one a bracket
  // spanning two bars makes, and the wrong one to put in the reader's hands.
  if (a.kind === 'pct') {
    const points = b.value - a.value;
    return Math.abs(points) < NOISE ? modelLabel : cap(signed(points, ' pts'));
  }

  if (a.value === 0) return modelLabel; // no ratio and no percentage change off a zero base
  const ratio = b.value / a.value;
  if (ratio >= RATIO_FLOOR) return cap(`${short(ratio)}×`);
  const pct = ((b.value - a.value) / Math.abs(a.value)) * 100;
  return Math.abs(pct) < NOISE ? modelLabel : cap(signed(pct, '%'));
}
