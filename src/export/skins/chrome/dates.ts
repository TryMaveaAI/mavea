// Date formatting for mastheads. Pure (no components) so any chrome file can import it without
// tripping the react-refresh "only export components" rule.

const MONTHS = [
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

/** "June 2026" — the masthead date eyebrow. */
export function monthYear(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "June 18, 2026" — the long form used by the legal memo header. */
export function fullDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "01" / "03" — the masthead's zero-padded issue number. `meta.num` is only set when a document
 *  bundles more than one answer; a solo export has no ordinal to show, so every masthead defaults
 *  to "01" rather than inventing one. */
export function issueNumber(num: number | undefined): string {
  return String(num ?? 1).padStart(2, '0');
}
