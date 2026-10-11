// Pure label and placement math for the charts1 family, kept out of the component files so it can
// be unit-tested without a DOM and so the components stay Fast Refresh boundaries.

import { withUnit } from '../../lib/format';

/** A value with its unit and a real minus sign in front of any currency symbol: `withUnit` alone
 *  writes −148 as "$-148k". `plus` also marks a gain, for figures that read as a change. */
export function signedUnit(value: number, unit: string | undefined, plus = false): string {
  const sign = value < 0 ? '−' : plus && value > 0 ? '+' : '';
  return sign + withUnit(Math.abs(value), unit);
}

/** A step reads as a change ("+$712k", "−$148k"); a total reads as a level ("$5,404k"). */
export function waterfallLabel(value: number, unit: string, total?: boolean): string {
  return signedUnit(value, unit, !total);
}

export interface RadialLabel {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  baseline: 'auto' | 'middle' | 'hanging';
}

/**
 * Where a ring node's label goes: straight out from the ring's centre, past the node. Every edge
 * between ring nodes is a chord, and a chord lies inside the circle, so a label set outward can
 * never be crossed by an edge — one set above the node is crossed by every edge arriving from
 * above. The anchor turns with the angle so the text grows away from the ring, not over it.
 */
export function radialLabel(
  node: { x: number; y: number },
  centre: { x: number; y: number },
  radius: number,
  gap = 5,
): RadialLabel {
  const dx = node.x - centre.x;
  const dy = node.y - centre.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const reach = radius + gap;
  // Within ~25° of vertical the label centres over/under the node; elsewhere it hangs to the side.
  const side = Math.abs(ux) > 0.42;
  return {
    x: node.x + ux * reach,
    y: node.y + uy * reach,
    anchor: !side ? 'middle' : ux > 0 ? 'start' : 'end',
    baseline: side ? 'middle' : uy < 0 ? 'auto' : 'hanging',
  };
}
