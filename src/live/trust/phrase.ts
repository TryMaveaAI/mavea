// phrase.ts — words for a what-if delta. When a projection has no grounded number behind it, the
// honest rendering is a direction and a rough magnitude in PROSE — this function can never emit a
// digit, so an ungrounded change can never be mistaken for a measurement.

/** Relative-change thresholds for the three spoken magnitudes. */
const MEANINGFUL = 0.33;
const SOMEWHAT = 0.1;

/** Below this relative move there is nothing to report. Exported because a surface that PAINTS a
 *  change has to agree with the one that words it: a card wearing "would barely change" on every
 *  untouched node is noise, and a card painted as moved while the phrase says it barely did is a
 *  contradiction the reader has to resolve. */
export const DELTA_NOISE = 0.005;
const BARELY = DELTA_NOISE;

/**
 * Phrase how a value moved from `base` to `cur`, relative to the base's own magnitude.
 * Non-finite input, or a move within noise, reads as "would barely change" — the weakest claim.
 */
export function relativeDeltaPhrase(base: number, cur: number): string {
  if (!Number.isFinite(base) || !Number.isFinite(cur)) return 'would barely change';
  const denom = Math.abs(base) > 1e-9 ? Math.abs(base) : 1;
  const rel = (cur - base) / denom;
  const magnitude = Math.abs(rel);
  if (magnitude <= BARELY) return 'would barely change';
  const direction = rel > 0 ? 'rise' : 'fall';
  if (magnitude >= MEANINGFUL) return `would ${direction} meaningfully`;
  if (magnitude >= SOMEWHAT) return `would ${direction} somewhat`;
  return `would ${direction} slightly`;
}

/** A fourth step, above `MEANINGFUL`, that exists only for the chip below. The sentence form is read
 *  ONE at a time in the rail, where three magnitudes are plenty; the chip is read across a dozen
 *  cards at once, and there a cause cut to a quarter and a cause cut by a third saying exactly the
 *  same thing is the difference the reader most wants and cannot get. */
const SUBSTANTIAL = 0.6;

/**
 * The same judgement as `relativeDeltaPhrase`, sized for a card: two words, not a clause. `shift` is
 * a RATIO of relative strength (1 = untouched), which is how a what-if reaches a node. Null when the
 * move is within noise — the caller renders nothing rather than "unchanged" on every card.
 *
 * Shares this module's thresholds with the sentence form deliberately: a card that says "much
 * weaker" beside a rail that says "would barely change" is a contradiction the reader has to
 * resolve, and two copies of the same ladder is how that happens.
 */
export function shiftChip(shift: number): string | null {
  if (!Number.isFinite(shift)) return null;
  const rel = shift - 1;
  const magnitude = Math.abs(rel);
  if (magnitude <= DELTA_NOISE) return null;
  const direction = rel > 0 ? 'stronger' : 'weaker';
  if (magnitude >= SUBSTANTIAL) return `much ${direction}`;
  if (magnitude >= MEANINGFUL) return direction;
  return `slightly ${direction}`;
}
