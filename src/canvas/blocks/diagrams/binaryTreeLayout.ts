// Binary tree edge geometry, in viewBox units.

export const NODE_R = 16;

/** A parent→child edge trimmed to both discs' rims; null when the discs touch or overlap. */
export function rimToRim(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= NODE_R * 2) return null;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: a.x + ux * NODE_R,
    y1: a.y + uy * NODE_R,
    x2: b.x - ux * NODE_R,
    y2: b.y - uy * NODE_R,
  };
}
