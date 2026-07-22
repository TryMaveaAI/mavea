// ground/now.ts — the "what time is it really" anchor every live-data call needs. A model reasons
// about "today", "this week", or whether something scheduled at a given time is upcoming, live, or
// already finished only as well as it knows the actual current date and clock time — without this
// it has to guess from its training cutoff, which is silently wrong the moment that cutoff has
// passed. Knowing the date/time is NOT itself live data (only real web grounding is) — it just lets
// the model reason correctly about timing once grounded facts are in hand.
//
// This runs in the user's browser (the Live prompt is assembled client-side; the proxy only injects
// the API key), so every value below resolves to their DEVICE timezone. That's deliberate — the
// device zone is what the best assistants use: it's accurate, needs no network round-trip, leaks
// nothing (unlike IP geolocation), and follows the user when they travel because modern OSes update
// it automatically. We hand the model three things it needs to reason without guessing: the local
// clock time, the IANA zone name, and an explicit ±HH:MM offset — a bare abbreviation like "CST"
// (US Central / China / Cuba) or "IST" (India / Ireland / Israel) is ambiguous and can't be
// converted from. Whether to answer in the user's local zone or some other place's is left to the
// model per question (guidance below), since only it can tell what the ask is about.
export function currentDateTimeLine(): string {
  const now = new Date();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. "America/New_York"
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  // getTimezoneOffset() is minutes BEHIND UTC (positive when west of it), so negate to get the
  // signed offset a human writes ("UTC-04:00" for New York, "UTC+05:30" for India).
  const offMin = -now.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const offset = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  const zonePart = zone ? `${zone}, ${offset}` : offset;
  return (
    `CURRENT DATE AND TIME — Right now it is ${timeStr} on ${dateStr}. The user's device timezone ` +
    `is ${zonePart}; it follows them when they travel, so treat it as where they are now. Use this ` +
    `local frame for anything relative — "today", "this week", or whether something scheduled at a ` +
    `given time is upcoming, in progress, or already finished. When a question is about a specific ` +
    `place or event elsewhere, reason in THAT location's timezone and give the user's local ` +
    `equivalent when it helps them act (e.g. "8pm GMT = 3pm your time"). Knowing the date and time ` +
    `does NOT give you live data on its own — only web grounding provides real-time facts (a score, ` +
    `a live status); reason about timing, don't invent an outcome.`
  );
}
