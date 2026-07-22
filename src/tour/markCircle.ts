import type { Pt } from '../live/annotate/geometry';

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Build the walkthrough's closed, slightly overshot hand-drawn loop around a target rect. */
export function markCircleLoop(rect: RectLike, svgRect: RectLike): Pt[] {
  const centerX = rect.left - svgRect.left + rect.width / 2;
  const centerY = rect.top - svgRect.top + rect.height / 2;
  const radiusX = Math.min(rect.width / 2 + 14, svgRect.width * 0.45);
  const radiusY = rect.height / 2 + 10;
  const steps = 32;
  const sweep = Math.PI * 2 * 1.12;
  const points: Pt[] = [];
  for (let index = 0; index <= steps; index++) {
    const angle = -Math.PI / 2 + (sweep * index) / steps;
    points.push({
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    });
  }
  return points;
}
