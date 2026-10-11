// Where ScriptStroke pins each stroke's order number, kept apart from the component so the
// geometry can be tested on its own.
import type { ScriptStrokeStep } from './types';

/** Pull the first "M x y" / "x y" coordinate out of an SVG path so we can pin a stroke badge. */
function pathStart(d: string): { x: number; y: number } | null {
  // match the first two numbers in the path data (the initial moveto target)
  const m = d.match(/-?\d*\.?\d+/g);
  if (!m || m.length < 2) return null;
  const x = Number(m[0]);
  const y = Number(m[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/** The direction a stroke sets off in, from its first segment, or null when that cannot be read.
 *  Only the commands a stroke path realistically opens with are understood. */
function pathHeading(d: string, start: { x: number; y: number }): { x: number; y: number } | null {
  const segs = [...d.matchAll(/([MLHVCSQTmlhvcsqt])([^A-Za-z]*)/g)];
  const next = segs[1];
  if (!next) return null;
  const n = (next[2].match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  const rel = next[1] === next[1].toLowerCase();
  const ox = rel ? start.x : 0;
  const oy = rel ? start.y : 0;
  let to: { x: number; y: number } | null;
  switch (next[1].toUpperCase()) {
    case 'H':
      to = n.length ? { x: ox + n[0], y: start.y } : null;
      break;
    case 'V':
      to = n.length ? { x: start.x, y: oy + n[0] } : null;
      break;
    default:
      to = n.length >= 2 ? { x: ox + n[0], y: oy + n[1] } : null;
  }
  if (!to) return null;
  const len = Math.hypot(to.x - start.x, to.y - start.y);
  return len > 0 ? { x: (to.x - start.x) / len, y: (to.y - start.y) / len } : null;
}

export const BADGE_R = 4.6;

/** Badge positions in writing order. Strokes often share a start (木's two roots both leave the
 *  trunk at one point), and a later badge drawn there hid the earlier number completely; it is
 *  moved along its own stroke until it clears every badge already placed. */
export function strokeBadges(strokes: ScriptStrokeStep[]): ({ x: number; y: number } | null)[] {
  const placed: { x: number; y: number }[] = [];
  return strokes.map((s) => {
    const start = s.path ? pathStart(s.path) : null;
    if (!start || !s.path) return null;
    const heading = pathHeading(s.path, start);
    let at = start;
    for (let step = 1; heading && step <= 4; step++) {
      if (placed.every((p) => Math.hypot(p.x - at.x, p.y - at.y) >= BADGE_R * 2 + 0.6)) break;
      at = {
        x: start.x + heading.x * BADGE_R * 1.3 * step,
        y: start.y + heading.y * BADGE_R * 1.3 * step,
      };
    }
    placed.push(at);
    return at;
  });
}
