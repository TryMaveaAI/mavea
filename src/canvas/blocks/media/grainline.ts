interface GrainSegment {
  x: number;
  y1: number;
  y2: number;
  start: boolean;
  end: boolean;
}

/**
 * The grainline for a piece, routed around its label. A piece's name sits at its centre, which is
 * exactly where a centred grainline runs, so the line is broken into an upper run (arrowhead at
 * the top) and a lower run (arrowhead at the bottom) that stop short of the label block; a run too
 * short to read as an arrow is dropped. When neither run survives (a short, wide piece such as a
 * strap) the line moves beside the label instead, if the piece is wide enough to hold both.
 * Pure, so the "never through the label" guarantee is testable for any piece shape.
 */
export function grainSegments(
  piece: { x: number; y: number; w: number; h: number },
  label: { top: number; bottom: number; halfWidth: number } | null,
  minRun: number,
): GrainSegment[] {
  const midX = piece.x + piece.w / 2;
  const inset = piece.h * 0.14;
  const top = piece.y + inset;
  const bottom = piece.y + piece.h - inset;
  if (!label) return [{ x: midX, y1: top, y2: bottom, start: true, end: true }];
  const runs: GrainSegment[] = [];
  if (label.top - top >= minRun)
    runs.push({ x: midX, y1: top, y2: label.top, start: true, end: false });
  if (bottom - label.bottom >= minRun)
    runs.push({ x: midX, y1: label.bottom, y2: bottom, start: false, end: true });
  if (runs.length) return runs;
  // Beside the label: halfway between its right edge and the piece's, if that gap is real.
  const room = piece.w / 2 - label.halfWidth;
  if (room >= minRun && bottom - top > 0)
    return [{ x: midX + label.halfWidth + room / 2, y1: top, y2: bottom, start: true, end: true }];
  return [];
}
