/**
 * A move arrow's drawn segment. It leaves from the edge of the moving piece rather than its centre,
 * so the shaft never sits on the piece's own glyph, and stops at the edge of a piece standing on
 * the target (a capture) or at the target's centre when the square is empty.
 */
export function arrowSegment(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  targetOccupied: boolean,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const startTrim = radius;
  const endTrim = targetOccupied ? radius : 0;
  if (len <= startTrim + endTrim + radius * 0.5) return null;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: from.x + ux * startTrim,
    y1: from.y + uy * startTrim,
    x2: to.x - ux * endTrim,
    y2: to.y - uy * endTrim,
  };
}
