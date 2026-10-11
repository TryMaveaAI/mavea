const AGE_TICK_GAP = 36; // px between age labels, enough for "100" at the tick size

/** The age at which the latest claim's running total overtakes the earliest one's — solved
 *  from the plotted benefits, so the marker always sits where the two lines actually cross.
 *  Null when no crossing exists (the later claim never pays more, or fewer than two ages). */
export function claimBreakeven(ages: { age: number; monthly: number }[]): number | null {
  if (ages.length < 2) return null;
  const sorted = [...ages].sort((a, b) => a.age - b.age);
  const early = sorted[0];
  const late = sorted[sorted.length - 1];
  if (late.age === early.age || late.monthly <= early.monthly) return null;
  // monthly·12·(t − claimAge) equal for both: t = (mL·aL − mE·aE) / (mL − mE).
  const t = (late.monthly * late.age - early.monthly * early.age) / (late.monthly - early.monthly);
  return Number.isFinite(t) && t >= late.age ? t : null;
}

/** Age ticks from the first claim age at the smallest round step that keeps labels apart. */
export function ageTicks(from: number, to: number, plotW: number): number[] {
  const perYear = plotW / Math.max(1, to - from);
  const step = [1, 2, 4, 5, 10, 20].find((s) => s * perYear >= AGE_TICK_GAP) ?? 20;
  const out: number[] = [];
  for (let a = from; a <= to; a += step) out.push(a);
  return out;
}
