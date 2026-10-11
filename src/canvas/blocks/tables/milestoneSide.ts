import type { SwimEvent } from './types';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Which side of its dot a milestone's name goes on, and how much of the lane it may take there.
 * The name reads into whichever side has more open track before the next bar, dot or the lane's
 * end, so it is written out in full where there is room and ellipsized only where there is not,
 * never run under a neighbouring bar.
 */
export function milestoneSide(
  events: SwimEvent[],
  index: number,
): { dir: 'right' | 'left'; room: number } {
  const at = clamp01(events[index].at);
  let right = 1 - at;
  let left = at;
  events.forEach((ev, i) => {
    if (i === index) return;
    const start = clamp01(ev.at);
    const end = ev.span && ev.span > 0 ? clamp01(ev.at + ev.span) : start;
    if (start > at) right = Math.min(right, start - at);
    else if (end < at) left = Math.min(left, at - end);
    // A bar the dot sits on has no clear side to avoid, so it does not narrow either.
  });
  // A small gap so the name stops short of whatever it runs toward.
  const GAP = 0.01;
  return right >= left
    ? { dir: 'right', room: Math.max(0, right - GAP) }
    : { dir: 'left', room: Math.max(0, left - GAP) };
}
