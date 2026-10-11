import { estimateTextWidth } from '../../lib/fitText';

// The wheel is drawn in a 100-unit viewBox around this centre.
export const CX = 50;
export const CY = 50;

const norm = (deg: number) => ((deg % 360) + 360) % 360;

// A point on the wheel for angle `deg` (0° at the top, clockwise).
export function polar(deg: number, r: number): [number, number] {
  const a = (norm(deg) - 90) * (Math.PI / 180);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

// A donut wedge spanning [a0, a1] degrees between the inner and outer radius.
export function wedgePath(a0: number, a1: number, rIn: number, rOut: number): string {
  const [ox0, oy0] = polar(a0, rOut);
  const [ox1, oy1] = polar(a1, rOut);
  const [ix1, iy1] = polar(a1, rIn);
  const [ix0, iy0] = polar(a0, rIn);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${ox0} ${oy0} A${rOut} ${rOut} 0 ${large} 1 ${ox1} ${oy1} L${ix1} ${iy1} A${rIn} ${rIn} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

/** The largest wedge-name size, in viewBox units: it reads as a label at the wheel's usual
 *  ~240px. The smallest is the caller's, since it depends on the measured width. */
const LABEL_UNITS = 4.6;

export interface WedgeLabel {
  /** The arc the label runs along — reversed on the lower half so the text reads upright. */
  d: string;
  fontSize: number;
}

/** Fit `label` along the centre arc of a wedge, or null when even the floor size overflows the
 *  arc or the band is too thin to hold a line of type. Pure, so the fit is testable. */
export function wedgeLabel(
  label: string,
  mid: number,
  span: number,
  rIn: number,
  rOut: number,
  minUnits: number,
): WedgeLabel | null {
  const r = (rIn + rOut) / 2;
  // Leave a little air at each end of the arc so neighbouring names never read as one word.
  const room = (Math.min(span, 359) * Math.PI * r) / 180 - 2;
  const fits = (size: number) =>
    size <= (rOut - rIn) * 0.7 && estimateTextWidth(label, size, true) <= room;
  let size = LABEL_UNITS;
  while (size > minUnits && !fits(size)) size = Math.max(minUnits, size - 0.25);
  if (!fits(size)) return null;
  const half = Math.min(span, 359) / 2;
  const lower = norm(mid) > 90 && norm(mid) < 270;
  const [x0, y0] = polar(lower ? mid + half : mid - half, r);
  const [x1, y1] = polar(lower ? mid - half : mid + half, r);
  const large = half * 2 > 180 ? 1 : 0;
  return { d: `M${x0} ${y0} A${r} ${r} 0 ${large} ${lower ? 0 : 1} ${x1} ${y1}`, fontSize: size };
}
