/**
 * Nudge position discs apart until no two are closer than `minDist`, each pair moving equally along
 * the line between them, and keep every disc inside the pitch. Positions are coaching-board
 * coordinates, not survey data: a shifted infield puts the shortstop and second baseman a disc
 * apart, and two overlapping discs say less than two discs a hair from where they were authored.
 */
export function separateTokens(
  points: { x: number; y: number }[],
  minDist: number,
  bounds: { w: number; h: number },
  margin: number,
): { x: number; y: number }[] {
  const out = points.map((p) => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const dx = out[j].x - out[i].x;
        const dy = out[j].y - out[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= minDist - 1e-6) continue;
        // Coincident discs have no direction between them; part them sideways.
        const ux = d > 1e-6 ? dx / d : 1;
        const uy = d > 1e-6 ? dy / d : 0;
        const push = (minDist - d) / 2;
        out[i].x -= ux * push;
        out[i].y -= uy * push;
        out[j].x += ux * push;
        out[j].y += uy * push;
        moved = true;
      }
    }
    for (const p of out) {
      p.x = Math.min(bounds.w - margin, Math.max(margin, p.x));
      p.y = Math.min(bounds.h - margin, Math.max(margin, p.y));
    }
    if (!moved) break;
  }
  return out;
}

type Pt = { x: number; y: number };

/**
 * Map an authored board coordinate onto a pitch's viewBox. Positions and plays are authored on a
 * 0–100 board on BOTH axes, whatever the pitch's shape, while the viewBoxes are 100 wide but 55,
 * 65 or 90 tall — so a raw y of 80 sat past a 65-tall touchline. A missing coordinate reads as the
 * middle of the board, and an out-of-range one as its edge.
 */
export function toPitch(x: number, y: number, pitch: { w: number; h: number }): Pt {
  const board = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50);
  return { x: (board(x) / 100) * pitch.w, y: (board(y) / 100) * pitch.h };
}

/** How close an authored play end has to be to a position to count as that player. */
const SAME_SPOT = 0.5;

/**
 * A play's ends on the pitch. An end authored at a player's spot follows that player's disc
 * wherever `separateTokens` moved it, so a pass leaves the passer rather than a point beside
 * them; an end that lands on a player stops at the disc's rim, where its arrowhead can still be
 * seen. Arrows are drawn under the discs, so a start at the centre reads as leaving the rim.
 */
export function playLine(
  from: readonly [number, number],
  to: readonly [number, number],
  authored: readonly Pt[],
  placed: readonly Pt[],
  pitch: { w: number; h: number },
  tokenR: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const at = ([x, y]: readonly [number, number]) => {
    const i = authored.findIndex((p) => Math.hypot(p.x - x, p.y - y) <= SAME_SPOT);
    return i >= 0 ? { pt: placed[i], onToken: true } : { pt: toPitch(x, y, pitch), onToken: false };
  };
  const a = at(from);
  const b = at(to);
  const len = Math.hypot(b.pt.x - a.pt.x, b.pt.y - a.pt.y);
  const trim = b.onToken ? tokenR : 0;
  if (len <= trim + 1e-6) return null;
  const k = (len - trim) / len;
  return {
    x1: a.pt.x,
    y1: a.pt.y,
    x2: a.pt.x + (b.pt.x - a.pt.x) * k,
    y2: a.pt.y + (b.pt.y - a.pt.y) * k,
  };
}

/** Breathing room a name keeps from the pitch edge, in viewBox units. */
const NAME_EDGE = 0.8;

/**
 * Where a player's name sits. It hangs under the disc, unless that would run past the bottom
 * touchline — a keeper on the goal line — when it sits over it instead; and it slides inward
 * rather than off a sideline. The disc never moves for its name: where a player stands is the
 * claim, the caption is only attached to it.
 */
export function nameSpot(
  disc: Pt,
  tokenR: number,
  fontSize: number,
  textWidth: number,
  pitch: { w: number; h: number },
): Pt {
  const below = disc.y + tokenR + fontSize * 1.1;
  // A baseline leaves ~0.25em of descender under it.
  const y =
    below + fontSize * 0.25 <= pitch.h - NAME_EDGE ? below : disc.y - tokenR - fontSize * 0.35;
  const half = Math.min(textWidth, pitch.w - NAME_EDGE * 2) / 2;
  const x = Math.min(pitch.w - NAME_EDGE - half, Math.max(NAME_EDGE + half, disc.x));
  return { x, y };
}
