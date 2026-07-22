// Tiny date helpers shared by the calendar-flavored pickers (datepicker, calendarpick,
// daterange). Pure functions, no deps — all within the pickers folder.

export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A normalized in-grid day cell. */
export interface DayCell {
  /** ISO yyyy-mm-dd */
  iso: string;
  day: number;
  /** belongs to the rendered month (false = leading/trailing filler) */
  inMonth: boolean;
}

export function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** Parse "yyyy-mm" → {y, m} (m is 0-based). Falls back to a fixed June 2026. */
export function parseMonth(s?: string): { y: number; m: number } {
  if (s) {
    const [y, m] = s.split('-').map(Number);
    if (y && m) return { y, m: m - 1 };
  }
  return { y: 2026, m: 5 };
}

/** Parse ISO "yyyy-mm-dd" → {y, m, d} (m 0-based) or null. */
export function parseISO(s?: string): { y: number; m: number; d: number } | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

export function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Build a 6×7 grid of DayCells for the given month (Sunday-first). */
export function buildGrid(y: number, m: number): DayCell[] {
  const first = new Date(y, m, 1).getDay(); // 0=Sun
  const daysIn = new Date(y, m + 1, 0).getDate();
  const prevDaysIn = new Date(y, m, 0).getDate();
  const cells: DayCell[] = [];
  // leading filler
  for (let i = first - 1; i >= 0; i--) {
    const d = prevDaysIn - i;
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    cells.push({ iso: toISO(py, pm, d), day: d, inMonth: false });
  }
  // this month
  for (let d = 1; d <= daysIn; d++) cells.push({ iso: toISO(y, m, d), day: d, inMonth: true });
  // trailing filler to fill 42
  let nd = 1;
  while (cells.length < 42) {
    const nm = m === 11 ? 0 : m + 1;
    const ny = m === 11 ? y + 1 : y;
    cells.push({ iso: toISO(ny, nm, nd), day: nd, inMonth: false });
    nd++;
  }
  return cells;
}

export function addMonth(
  { y, m }: { y: number; m: number },
  delta: number,
): { y: number; m: number } {
  const total = y * 12 + m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

export function monthLabel(y: number, m: number): string {
  return `${MONTHS[m]} ${y}`;
}

/** Pretty-print an ISO date, e.g. "Mon, Jun 8, 2026". */
export function prettyISO(iso: string): string {
  const p = parseISO(iso);
  if (!p) return '';
  const dt = new Date(p.y, p.m, p.d);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
  return `${wd}, ${MONTHS[p.m].slice(0, 3)} ${p.d}, ${p.y}`;
}

/** Compare two ISO strings as dates: -1 / 0 / 1. */
export function cmpISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Shift an ISO date by a number of days and/or months (Date normalises month/day overflow). */
function shiftISO(iso: string, days: number, months = 0): string {
  const p = parseISO(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m + months, p.d + days);
  return toISO(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * Interpret a date-range preset label ("Last 7 days", "This month", "YTD") relative to an
 * `anchor` ISO date — the reference "today". These canvas pickers carry no real clock, so the
 * anchor is the latest known date (honouring real-data-only: we never invent the current date).
 * Returns the resolved `{ a, b }` ISO range, or null when the label isn't a range expression.
 */
export function presetRange(label: string, anchor: string): { a: string; b: string } | null {
  const p = parseISO(anchor);
  if (!p) return null;
  const s = label.toLowerCase().trim();
  const n = Number.parseInt(s.match(/\d+/)?.[0] ?? '', 10);

  if (/\bthis month\b|\bcurrent month\b/.test(s)) {
    const last = new Date(p.y, p.m + 1, 0).getDate();
    return { a: toISO(p.y, p.m, 1), b: toISO(p.y, p.m, last) };
  }
  if (/month to date|\bmtd\b/.test(s)) return { a: toISO(p.y, p.m, 1), b: anchor };
  if (/\bthis week\b/.test(s)) {
    const dow = new Date(p.y, p.m, p.d).getDay(); // 0=Sun
    return { a: shiftISO(anchor, -dow), b: shiftISO(anchor, 6 - dow) };
  }
  if (/year to date|\bytd\b/.test(s)) return { a: toISO(p.y, 0, 1), b: anchor };
  if (/\bthis year\b/.test(s)) return { a: toISO(p.y, 0, 1), b: toISO(p.y, 11, 31) };
  if (Number.isFinite(n) && n > 0) {
    if (/week/.test(s)) return { a: shiftISO(anchor, -(n * 7 - 1)), b: anchor };
    if (/month/.test(s)) return { a: shiftISO(anchor, 0, -n), b: anchor };
    if (/day/.test(s)) return { a: shiftISO(anchor, -(n - 1)), b: anchor };
  }
  return null;
}
