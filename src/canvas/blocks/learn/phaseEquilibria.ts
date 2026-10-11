// Where a planar system dx/dt = f, dy/dt = g comes to rest, for PhasePortrait.

type Field = (x: number, y: number) => number;

/** Newton's method on (f, g) from a starting guess, with a central-difference Jacobian.
 *  Null when it does not converge inside the box or the Jacobian goes singular — a line of
 *  equilibria, say, where no single root exists to find. */
export function refineEquilibrium(
  f: Field,
  g: Field,
  x0: number,
  y0: number,
  box: { xMin: number; xMax: number; yMin: number; yMax: number },
): { x: number; y: number } | null {
  const scale = Math.max(box.xMax - box.xMin, box.yMax - box.yMin);
  const h = scale * 1e-6;
  const tol = scale * 1e-9;
  let x = x0;
  let y = y0;
  for (let i = 0; i < 40; i++) {
    const fv = f(x, y);
    const gv = g(x, y);
    if (!Number.isFinite(fv) || !Number.isFinite(gv)) return null;
    const a = (f(x + h, y) - f(x - h, y)) / (2 * h);
    const b = (f(x, y + h) - f(x, y - h)) / (2 * h);
    const c = (g(x + h, y) - g(x - h, y)) / (2 * h);
    const d = (g(x, y + h) - g(x, y - h)) / (2 * h);
    const det = a * d - b * c;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
    const dx = (d * fv - b * gv) / det;
    const dy = (a * gv - c * fv) / det;
    x -= dx;
    y -= dy;
    if (Math.hypot(dx, dy) < tol) {
      const inside = x >= box.xMin && x <= box.xMax && y >= box.yMin && y <= box.yMax;
      return inside ? { x, y } : null;
    }
  }
  return null;
}

/** The distinct equilibria behind a set of near-zero grid points. Each point is polished to the
 *  root it leads to, so the whole patch of near-zero cells around one equilibrium collapses to
 *  that one point however wide the patch is; roots closer than `minSep` are the same root.
 *  A point Newton cannot polish (a degenerate equilibrium) is kept as found. */
export function distinctEquilibria(
  f: Field,
  g: Field,
  candidates: readonly { x: number; y: number }[],
  box: { xMin: number; xMax: number; yMin: number; yMax: number },
  minSep: number,
): { x: number; y: number }[] {
  const roots: { x: number; y: number }[] = [];
  for (const c of candidates) {
    const r = refineEquilibrium(f, g, c.x, c.y, box) ?? c;
    if (!roots.some((q) => Math.hypot(q.x - r.x, q.y - r.y) < minSep)) roots.push(r);
  }
  return roots;
}
