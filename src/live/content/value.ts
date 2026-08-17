// content/value.ts — one figure, typed by what actually backs it.
//
// Its own module because both producers need it and they must not need each OTHER: fromWorld imports
// the morph adapter (for the drawn edges' ids), and an ordinary answer's producer — which the evidence
// drawer builds from — has no business pulling a spatial renderer into its chunk to type a number.
import { withUnit } from '../../canvas/lib/format';
import { isReal, type Receipt, type Tier } from '../ground/types';
import type { WorldValue } from '../trust';

const ILLUSTRATIVE_CAVEAT = 'Shows the shape, not your numbers.';

/**
 * One figure, typed by what actually backs it. An illustrative graph outranks whatever tier the
 * author wrote on the entity — the whole thing is a textbook explanation, so nothing on it may wear a
 * GROUNDED badge; the entity's own quote rides along as the caveat so the source wording survives.
 * A real figure with no receipt returns null and is never rendered: an unbacked number is not a
 * weaker number, it is no number.
 */
export function trustValue(
  id: string,
  label: string,
  num: number,
  tier: Tier,
  unit: string | undefined,
  receipt: Receipt | undefined,
  illustrative: boolean,
  period?: string,
): WorldValue | null {
  if (!Number.isFinite(num)) return null;
  const raw = withUnit(num, unit);
  const scope = { ...(unit ? { unit } : {}), ...(period ? { period } : {}) };
  const base = { id, label, ...(unit || period ? { scope } : {}) };
  if (illustrative || tier === 'T3') {
    return {
      ...base,
      kind: 'illustrative',
      resolution: {
        ok: true,
        tier: 'T3',
        value: num,
        raw,
        illustrative: receipt?.quote ?? ILLUSTRATIVE_CAVEAT,
        surface: 'model',
      },
    };
  }
  if (!receipt || !isReal(tier)) return null;
  return tier === 'T1'
    ? {
        ...base,
        kind: 'grounded',
        resolution: { ok: true, tier: 'T1', value: num, raw, receipt, surface: 'user' },
      }
    : {
        ...base,
        kind: 'grounded',
        resolution: { ok: true, tier: 'T2', value: num, raw, receipt, surface: 'web' },
      };
}
