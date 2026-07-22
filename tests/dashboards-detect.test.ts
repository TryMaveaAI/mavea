// The "Track it" nudge must be rare and earned — a one-off number is not a dashboard. The decision
// is the model's (a 0–100 score on the spec), and the surface only offers tracking above a high
// threshold. shouldOfferTrack is that gate; these tests pin the boundary.
import { describe, it, expect } from 'vitest';
import { shouldOfferTrack, TRACK_THRESHOLD } from '../src/live/dashboards/detect';
import type { ConversationSpec } from '../src/data/conversation';

// shouldOfferTrack only reads spec.track, so a minimal stub is enough.
function spec(track?: { score: number; reason: string }) {
  return { track } as ConversationSpec;
}

describe('shouldOfferTrack — earned, not eager', () => {
  it('offers tracking only at or above the threshold', () => {
    expect(shouldOfferTrack(spec({ score: TRACK_THRESHOLD, reason: 'weekly burn rate' }))).toBe(
      true,
    );
    expect(shouldOfferTrack(spec({ score: 100, reason: 'ongoing metric' }))).toBe(true);
  });

  it('does not offer tracking below the threshold', () => {
    expect(shouldOfferTrack(spec({ score: TRACK_THRESHOLD - 1, reason: 'maybe' }))).toBe(false);
    expect(shouldOfferTrack(spec({ score: 0, reason: 'one-off fact' }))).toBe(false);
  });

  it('does not offer tracking when the model emitted no judgement', () => {
    expect(shouldOfferTrack(spec(undefined))).toBe(false);
    expect(shouldOfferTrack(null)).toBe(false);
    expect(shouldOfferTrack(undefined)).toBe(false);
  });
});
