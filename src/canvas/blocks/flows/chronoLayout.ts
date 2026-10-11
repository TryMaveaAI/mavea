/** Where each event's caption sits under a chronological axis, in px.
 *
 *  A caption owns the stretch of axis between the midpoints to its neighbours (the axis ends for
 *  the first and last), less a little air, so no two captions can overlap however the events are
 *  spaced: a dense cluster gets narrow captions, a lone event a wide one. Inside that stretch it
 *  centres on its marker when it can, and otherwise reads off it from the side with room, which
 *  is what keeps the first and last captions on the card. */
export interface CaptionSlot {
  /** Left edge and width of the caption box. */
  left: number;
  width: number;
  /** Which way the text reads off its marker: centred under it, or flush from it at an edge. */
  align: 'center' | 'start' | 'end';
  /** Caption row under the axis: 0 unless events crowd too close to caption on one row. */
  row: number;
}

/** Air between two neighbouring captions. */
const CAPTION_AIR = 8;
/** Half the marker dot, so flush text lines up with the dot's outer edge. */
const DOT_R = 6;

/** Most caption rows a crowded axis staggers into before it lets captions overlap. */
export const MAX_CAPTION_ROWS = 3;

/** Captions for every event, at least `minW` wide (a date's width) wherever that can be had.
 *  Events too close to share a row — three in one year on a century-long axis, or two on the
 *  same date — alternate rows, the fewest that gives every caption its date; each row is laid
 *  out on its own, so neighbours in one row never overlap. Past `MAX_CAPTION_ROWS` a caption is
 *  widened to `minW` anyway: a date drawn over its neighbour can still be read, a 0px one cannot,
 *  and it would leave its marker with nothing to press. */
export function captionSlots(
  xs: readonly number[],
  axisW: number,
  cap: number,
  minW = 0,
): CaptionSlot[] {
  const need = Math.min(minW, cap, axisW);
  let out: CaptionSlot[] = [];
  for (let rows = 1; rows <= MAX_CAPTION_ROWS; rows++) {
    out = new Array<CaptionSlot>(xs.length);
    for (let r = 0; r < rows; r++) {
      const idx = xs.map((_, i) => i).filter((i) => i % rows === r);
      const slots = rowSlots(
        idx.map((i) => xs[i]),
        axisW,
        cap,
      );
      idx.forEach((i, k) => (out[i] = { ...slots[k], row: r }));
    }
    if (out.every((s) => s.width >= need)) return out;
  }
  return out.map((s, i) => {
    if (s.width >= need) return s;
    const left = Math.min(axisW - need, Math.max(0, xs[i] - need / 2));
    return { ...s, left, width: need, align: 'center' };
  });
}

function rowSlots(xs: readonly number[], axisW: number, cap: number): Omit<CaptionSlot, 'row'>[] {
  return xs.map((x, i) => {
    const lo = i === 0 ? 0 : (xs[i - 1] + x) / 2 + CAPTION_AIR / 2;
    const hi = i === xs.length - 1 ? axisW : (x + xs[i + 1]) / 2 - CAPTION_AIR / 2;
    const width = Math.max(0, Math.min(cap, hi - lo));
    const centred = x - width / 2;
    if (centred >= lo && centred + width <= hi) return { left: centred, width, align: 'center' };
    // Too near an end of its stretch to centre: read off the marker instead, the text starting
    // (or finishing) flush with the dot rather than out at the card's edge.
    // When that would leave the caption under half its room, it gives the alignment up and takes
    // the whole stretch instead.
    if (centred < lo) {
      const from = Math.max(lo, x - DOT_R);
      const w = Math.min(width, hi - from);
      return w >= width / 2
        ? { left: from, width: w, align: 'start' }
        : { left: lo, width, align: 'start' };
    }
    const to = Math.min(hi, x + DOT_R);
    const w = Math.min(width, to - lo);
    return w >= width / 2
      ? { left: to - w, width: w, align: 'end' }
      : { left: hi - width, width, align: 'end' };
  });
}

/** An axis-end label that only repeats the date already printed under the nearest marker
 *  ("900 AD" beside "~900 AD") says nothing; compare them on their letters and digits. */
export function repeatsDate(end: string | undefined, date: string | undefined): boolean {
  if (!end || !date) return false;
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return key(end) !== '' && key(end) === key(date);
}
