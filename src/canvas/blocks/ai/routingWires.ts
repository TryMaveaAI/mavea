// Where Routing's wires start and end, in the wire column's own pixels. The query and each
// choice are measured rather than assumed: choices differ in height (a sub-line, a meter), the
// classifier pill hangs under the query, and the choice list scrolls once it is long.

export interface Span {
  top: number;
  bottom: number;
}

export interface WireGeometry {
  height: number;
  from: number;
  to: number[];
}

const mid = (s: Span) => (s.top + s.bottom) / 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Each end is the centre of what it joins, clamped into the column so a choice scrolled out of
 *  view pins its wire to the edge it left by instead of drawing off the card. */
export function wireGeometry(column: Span, source: Span, choices: Span[]): WireGeometry | null {
  const height = column.bottom - column.top;
  if (height <= 0) return null;
  const at = (s: Span) => clamp(mid(s) - column.top, 1, height - 1);
  return { height, from: at(source), to: choices.map(at) };
}
