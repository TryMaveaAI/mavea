// The vesting arithmetic behind VestingSchedule, kept pure so it can be tested on its own.

/**
 * Percent of a grant vested `elapsed` months after its start, on a standard cliff schedule:
 * nothing before the cliff, then everything earned so far at once (the cliff tranche, e.g. 12/48
 * = 25% on a one-year cliff), then linear to 100% at `vestMonths`.
 */
export function pctVested(elapsed: number, cliffMonths: number, vestMonths: number): number {
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  if (vestMonths <= 0 || elapsed >= vestMonths) return elapsed >= Math.max(0, vestMonths) ? 100 : 0;
  if (elapsed < cliffMonths) return 0;
  return Math.min(100, (elapsed / vestMonths) * 100);
}
