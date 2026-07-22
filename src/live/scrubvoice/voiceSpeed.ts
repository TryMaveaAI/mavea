// Shared voice-speed rules for the live dock chip and replay scrubber. Keeping these helpers in a
// non-component module preserves React Fast Refresh for the chip while both controls use one rate
// ladder and one formatter.

/** Playback speeds the chip cycles through, in order. Starts (and returns) at 1×; covers the
 *  requested 0.75×–2× span. */
export const SPEED_RATES = [1, 1.25, 1.5, 2, 0.75] as const;

/** Render a rate like 1.25 as "1.25×" (drops a trailing ".0" so 1 reads "1×", not "1.0×"). */
export function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
}

/** Clamp any stored or typed value into the supported 0.75× to 2× span. */
export function clampSpeed(rate: number): number {
  return Math.min(2, Math.max(0.75, rate));
}

/** The next speed on the ladder, wrapping back to 1× after the last. */
export function nextRate(rate: number): number {
  const i = SPEED_RATES.indexOf(clampSpeed(rate) as (typeof SPEED_RATES)[number]);
  return SPEED_RATES[(i < 0 ? 0 : i + 1) % SPEED_RATES.length];
}
