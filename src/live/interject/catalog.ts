// The words Mavéa says when it steps into the conversation. Kept short, human, and strictly
// real-data-only — an aside never claims anything the app can't stand behind (no invented
// numbers, no flattery about content we didn't see). One small set per moment, picked with a
// no-immediate-repeat rule so a recurring moment doesn't say the same thing twice in a row.
import type { MomentType } from './types';

/** Soft upper bound so an aside stays a glance, never a paragraph (tested). */
export const MAX_LINE_LEN = 60;

const LINES: Record<MomentType, readonly string[]> = {
  clipShared: ["Nice — that one's worth sharing.", 'Off it goes.', 'Clipped and ready to share.'],
};

/** Every moment we know how to react to (handy for tests + iteration). */
export const MOMENT_TYPES = Object.keys(LINES) as MomentType[];

export { LINES as INTERJECTION_LINES };

/**
 * Pick a line for `type`. `seed` makes the choice deterministic (the caller passes a timestamp),
 * and `lastLine` is skipped so a moment that fires twice doesn't repeat itself back-to-back.
 */
export function pickLine(type: MomentType, seed: number, lastLine?: string): string {
  const opts = LINES[type];
  if (opts.length === 0) return ''; // defensive — never expected
  let i = Math.abs(Math.trunc(seed)) % opts.length;
  if (opts.length > 1 && opts[i] === lastLine) i = (i + 1) % opts.length;
  return opts[i];
}
