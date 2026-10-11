// PlasmidMap label placement around the ring, spread so neighbouring features never overlap.
import { spreadLabels } from '../../lib/spreadLabels';

export const CX = 100;

export const CY = 100;

export const R_BACKBONE = 72;

export const R_TICK_OUT = R_BACKBONE + 7;

const R_LABEL = R_BACKBONE + 16;

/** Vertical pitch between two labels on the same side: one 5-unit line plus air. */
const LABEL_GAP = 6.6;

/** The viewBox's vertical extent (see the <svg> below) less half a line, so no label clips. */
const LABEL_TOP = -4;

const LABEL_BOTTOM = 204;

export function polar(deg: number, r: number): { x: number; y: number } {
  const ang = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(ang), y: CY + r * Math.sin(ang) };
}

export interface LabelSpec {
  key: string;
  deg: number;
  text: string;
  color: string;
  bold?: boolean;
}

interface PlacedLabel extends LabelSpec {
  /** Where the leader leaves the ring, and where the text starts. */
  from: { x: number; y: number };
  x: number;
  y: number;
  anchor: 'start' | 'end';
  /** True when the label had to move off its own radial line, so it needs a leader to say
   *  which mark it names. */
  moved: boolean;
}

/** Labels run down each side of the ring in angular order, spread just far enough apart to read
 *  (canvas/lib/spreadLabels) and joined to their marks by a leader where they had to move. A
 *  multiple cloning site packs four or five enzymes into a few degrees; sorting them onto two
 *  radial tiers still stacked them into one unreadable cluster, while a ladder down the side holds
 *  any number of them. Each side keeps its own order, so leaders never cross. */
export function placeLabels(labels: LabelSpec[]): PlacedLabel[] {
  const sides = [
    labels.filter((l) => wrapDeg(l.deg) <= 180),
    labels.filter((l) => wrapDeg(l.deg) > 180),
  ];
  return sides.flatMap((side, si) => {
    const right = si === 0;
    const natural = side.map((l) => ({ l, at: polar(l.deg, R_LABEL) }));
    const ys = spreadLabels(
      natural.map(({ l, at }) => ({ id: l.key, y: at.y })),
      { gap: LABEL_GAP, top: LABEL_TOP, bottom: LABEL_BOTTOM },
    );
    return natural.map(({ l, at }) => {
      const y = ys.get(l.key) ?? at.y;
      // Keep the label on the label circle where it can be, and just clear of the ring's
      // centre line past the poles, so the text always runs outward from its side.
      const dy = y - CY;
      const reach = Math.sqrt(Math.max(0, R_LABEL * R_LABEL - dy * dy));
      const x = CX + (right ? 1 : -1) * Math.max(3, reach);
      return {
        ...l,
        from: polar(l.deg, R_TICK_OUT + 1.5),
        x,
        y,
        anchor: right ? 'start' : 'end',
        moved: Math.hypot(x - at.x, y - at.y) > 1.5,
      };
    });
  });
}

function wrapDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
