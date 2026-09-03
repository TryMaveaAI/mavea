// veracity/standingLine.ts — the deterministic "Standing line": the one screenshottable sentence that
// summarizes how a document's headline claims fared against the public record. Pure (a count over the
// verdicts, zero tokens, zero model calls), so it costs nothing to compose and re-show.
import type { Verdict } from './types';
import { TROUBLED } from './types';

/** Singular/plural a noun by count. */
function plural(n: number, one: string, many = one + 's'): string {
  return n === 1 ? one : many;
}

/**
 * Compose the Standing line from the verdicts of the claims that were CHECKED. Honest by construction:
 * it counts only what was verified, lists only the non-empty trouble buckets, and never overclaims.
 *
 *   []                                  → ''                       (nothing was checked → no line)
 *   all holds                           → "All 6 checked claims hold up against the public record."
 *   2 of 6 troubled                     → "2 of 6 checked claims need a second look: 1 outdated · 1 contradicted."
 */
export function standingLine(verdicts: readonly Verdict[]): string {
  const total = verdicts.length;
  if (total === 0) return '';

  const troubled = verdicts.filter((v) => (TROUBLED as string[]).includes(v));
  if (troubled.length === 0) {
    const verb = total === 1 ? 'holds' : 'hold';
    return `All ${total} checked ${plural(total, 'claim')} ${verb} up against the public record.`;
  }

  // count each trouble bucket, in a stable, severity-first order
  const order: Verdict[] = ['contradicted', 'outdated', 'disputed', 'unsupported'];
  const wording: Record<string, string> = {
    contradicted: 'contradicted',
    outdated: 'outdated',
    disputed: 'disputed',
    unsupported: 'unsupported',
  };
  const parts: string[] = [];
  for (const v of order) {
    const n = troubled.filter((t) => t === v).length;
    if (n > 0) parts.push(`${n} ${wording[v]}`);
  }

  // The verb agrees with the COUNT that needs looking at, not the pool it came from: "1 of 6
  // checked claims need a second look" was the reading every single-trouble document got.
  return `${troubled.length} of ${total} checked ${plural(total, 'claim')} ${
    troubled.length === 1 ? 'needs' : 'need'
  } a second look: ${parts.join(' · ')}.`;
}
