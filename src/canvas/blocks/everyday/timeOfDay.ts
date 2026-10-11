/** The 24-hour clock hour a dose time names: "14:00", "2:00 PM", "2pm", "12:00 AM" (0), "12 PM"
 *  (12). Words such as "noon" and "midnight" count too. Undefined when the text names no hour. */
export function clockHour(t: string): number | undefined {
  const lo = t.toLowerCase();
  if (/\bnoon\b|\bmidday\b/.test(lo)) return 12;
  if (/\bmidnight\b/.test(lo)) return 0;
  const m = /(\d{1,2})(?::\d{2})?\s*([ap])\.?\s*m\b/.exec(lo) ?? /\b(\d{1,2})(?::\d{2})/.exec(lo);
  if (!m) return undefined;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h > 23) return undefined;
  const meridiem = m[2];
  if (!meridiem) return h;
  if (h < 1 || h > 12) return undefined;
  return (h % 12) + (meridiem === 'p' ? 12 : 0);
}

/** Sun for a daytime dose, moon for an overnight one, a plain clock when the time is vague.
 *  The hour has to be read with its AM/PM: taking the leading digits alone put a moon on
 *  "2:00 PM" and a sun on "10:00 PM". */
export function timeIcon(t: string): 'sun' | 'moon' | 'clock' {
  const h = clockHour(t);
  if (h !== undefined) return h >= 6 && h < 20 ? 'sun' : 'moon';
  const lo = t.toLowerCase();
  if (/morning|afternoon|breakfast|lunch|with meals/.test(lo)) return 'sun';
  if (/night|evening|bedtime|dinner/.test(lo)) return 'moon';
  return 'clock';
}
