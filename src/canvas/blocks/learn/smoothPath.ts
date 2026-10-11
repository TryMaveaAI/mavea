/**
 * An SVG path through points in increasing x, drawn as a monotone cubic (Fritsch–Carlson).
 *
 * The curve passes through every sample and never overshoots between two of them, so a peak
 * stays where the data put it and an intensity that bottoms out at zero never dips below its
 * own axis — the two things a Catmull-Rom spline gets wrong. Where a polyline turns a coarse
 * sampling into a row of spikes, this rounds each extremum the way the underlying function is.
 */
export function monotonePath(pts: readonly { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return '';
  const f = (v: number) => v.toFixed(2);
  if (n < 3) return pts.map((p, i) => `${i ? 'L' : 'M'} ${f(p.x)},${f(p.y)}`).join(' ');

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push(dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]);
  }

  // Tangents: the secant slope at the ends; inside, the weighted harmonic mean of the two
  // neighbouring secants, or flat where they disagree in sign (a local extremum).
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1];
    const b = slope[i];
    if (a * b <= 0) {
      m.push(0);
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m.push((w1 + w2) / (w1 / a + w2 / b));
    }
  }
  m.push(slope[n - 2]);

  let d = `M ${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      ` C ${f(pts[i].x + h)},${f(pts[i].y + m[i] * h)}` +
      ` ${f(pts[i + 1].x - h)},${f(pts[i + 1].y - m[i + 1] * h)}` +
      ` ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
  }
  return d;
}
