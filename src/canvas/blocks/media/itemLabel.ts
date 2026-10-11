import { estimateTextWidth } from '../../lib/fitText';

/**
 * The largest label that fits inside a piece of furniture, on one line or broken at a space onto
 * two: a long name on a narrow piece ("Coffee table") reads better wrapped than shrunk or cut.
 * `room` is the inner box the text may use. Below `minFs` the name is cut with an ellipsis at that
 * size, and null means not even that fits (the piece keeps a native tooltip instead).
 */
export function fitItemLabel(
  label: string,
  room: { w: number; h: number },
  maxFs: number,
  minFs: number,
): { lines: string[]; fs: number } | null {
  const LINE = 1.2;
  const fsFor = (lines: string[]) =>
    Math.min(
      maxFs,
      room.h / (lines.length * LINE),
      ...lines.map((l) => room.w / Math.max(estimateTextWidth(l, 1, true), 1e-6)),
    );
  const layouts: string[][] = [[label]];
  const spaces = [...label.matchAll(/ /g)].map((m) => m.index ?? 0);
  if (spaces.length) {
    // The break nearest the middle keeps the two lines closest in length.
    const mid = spaces.reduce((a, b) =>
      Math.abs(b - label.length / 2) < Math.abs(a - label.length / 2) ? b : a,
    );
    layouts.push([label.slice(0, mid), label.slice(mid + 1)]);
  }
  let best: { lines: string[]; fs: number } | null = null;
  for (const lines of layouts) {
    const fs = fsFor(lines);
    // A second line is only worth it when it buys a visibly larger name.
    if (!best || fs > best.fs * 1.08) best = { lines, fs };
  }
  if (best && best.fs >= minFs) return best;
  if (room.h < minFs * LINE) return null;
  for (let n = label.length - 1; n >= 2; n--) {
    const cut = label.slice(0, n).trimEnd() + '…';
    if (estimateTextWidth(cut, minFs, true) <= room.w) return { lines: [cut], fs: minFs };
  }
  return null;
}
