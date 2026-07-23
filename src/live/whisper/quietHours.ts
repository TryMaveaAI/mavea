// Whisper in, whisper out — the quiet-hours half. Late at night Mavéa dims its chrome and
// drops its voice to an ember instead of broadcasting at full daytime energy. The trigger
// is the local clock (a mic-amplitude "whisper detected" needs mic-side energy the VAD
// doesn't expose yet — honest scope, noted in settings copy). OFF unless the user opts in:
// an unexplained late-night dim + near-silent voice reads as "the sound is broken", so the
// softer behavior has to be chosen, never discovered.
import { useEffect, useState } from 'react';

/** Quiet hours run from 22:00 to 06:00 local. */
export function isQuietHour(hour: number): boolean {
  return hour >= 22 || hour < 6;
}

const OPT_IN_KEY = 'mavea-live-quiet-hours-on';
/** Broadcast when the toggle flips, so the live surface re-dims without waiting a minute. */
export const QUIET_HOURS_EVENT = OPT_IN_KEY;

export function quietHoursEnabled(): boolean {
  try {
    return localStorage.getItem(OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setQuietHoursEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(OPT_IN_KEY, '1');
    else localStorage.removeItem(OPT_IN_KEY);
  } catch {
    /* storage unavailable — session-only behavior */
  }
  try {
    window.dispatchEvent(new CustomEvent(QUIET_HOURS_EVENT));
  } catch {
    /* no window */
  }
}

/** How much softer the voice speaks during quiet hours (multiplies the TTS gain). */
export const WHISPER_GAIN = 0.45;

/** Re-check the clock this often — crossing 22:00 mid-session should dim without a reload. */
const CLOCK_MS = 60_000;

/** Whether whisper mode is active right now: quiet hours on the clock AND not opted out.
 *  Re-evaluates each minute (crossing 22:00 dims mid-session) and instantly on toggle. */
export function useWhisper(): boolean {
  const [active, setActive] = useState(
    () => quietHoursEnabled() && isQuietHour(new Date().getHours()),
  );
  useEffect(() => {
    const tick = (): void => setActive(quietHoursEnabled() && isQuietHour(new Date().getHours()));
    tick();
    const t = window.setInterval(tick, CLOCK_MS);
    window.addEventListener(QUIET_HOURS_EVENT, tick);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(QUIET_HOURS_EVENT, tick);
    };
  }, []);
  return active;
}
