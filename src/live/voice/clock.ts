// Bare clock readings for the session chrome ("9:41") — the session rail and the recap
// both timestamp moments, and a repeated meridiem down a column is just noise.
export function fmtClock(at: number | undefined): string {
  if (!at) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
      .formatToParts(new Date(at))
      .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
      .map((p) => p.value)
      .join('')
      .trim();
  } catch {
    return '';
  }
}
