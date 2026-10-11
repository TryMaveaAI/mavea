import { spreadLabels } from '../../lib/spreadLabels';

/** Round scale ticks between lo and hi, spaced so labels `minGap` px apart never touch. */
export function scaleTicks(lo: number, hi: number, plotW: number, minGap: number): number[] {
  const span = hi - lo;
  if (!(span > 0) || !(plotW > 0)) return [];
  const raw = (span * minGap) / plotW;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

/**
 * Where each peak's value label sits above the strip. Labels keep their peaks' order and are
 * nudged apart by the least needed; when the strip is too narrow for one row they alternate
 * across as many rows as it takes, so two close shifts (the usual case in a ¹³C spectrum) never
 * print on top of each other.
 */
export function placePeakLabels(
  xs: number[],
  widths: number[],
  left: number,
  right: number,
  gap = 6,
): { x: number; row: number; rows: number }[] {
  const n = xs.length;
  if (n === 0) return [];
  const widest = Math.max(...widths);
  const pitch = widest + gap;
  const lo = left + widest / 2;
  const hi = right - widest / 2;
  const room = Math.max(1, hi - lo);
  const rows = Math.min(n, Math.max(1, Math.ceil(((n - 1) * pitch) / room)));
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out: { x: number; row: number; rows: number }[] = new Array(n);
  for (let r = 0; r < rows; r++) {
    const members = order.filter((_, k) => k % rows === r);
    const spread = spreadLabels(
      members.map((m) => ({ id: m.i, y: m.x })),
      { gap: pitch, top: lo, bottom: hi },
    );
    for (const m of members) out[m.i] = { x: spread.get(m.i) ?? m.x, row: r, rows };
  }
  return out;
}
