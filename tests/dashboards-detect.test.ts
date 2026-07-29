// The "Track it" nudge must be rare and earned — a one-off number is not a dashboard. Two gates
// compose: the model's own 0–100 trackability score above a high threshold, AND the answer being
// grounded in real sources — an ungrounded answer is the model's memory, and a dashboard seeded
// from memory starts life as a made-up number wearing a live badge.
import { describe, it, expect } from 'vitest';
import { shouldOfferTrack, TRACK_THRESHOLD } from '../src/live/dashboards/detect';
import type { ConversationSpec } from '../src/data/conversation';

function spec(
  track?: { score: number; reason: string },
  sources: { title: string; url: string }[] = [{ title: 'MLB', url: 'https://mlb.com' }],
) {
  return { track, sources } as ConversationSpec;
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

  it('does not offer tracking on an UNGROUNDED answer, however trackable it scored', () => {
    expect(shouldOfferTrack(spec({ score: 100, reason: 'live scores' }, []))).toBe(false);
    const noSources = { track: { score: 100, reason: 'live scores' } } as ConversationSpec;
    expect(shouldOfferTrack(noSources)).toBe(false);
  });
});
