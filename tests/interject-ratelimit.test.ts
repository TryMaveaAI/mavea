import {
  allow,
  record,
  freshLimiter,
  MIN_GAP_MS,
  MIN_GAP_TURNS,
} from '../src/live/interject/rateLimit';

describe('interjection rate limiter', () => {
  it('allows the first interjection of a session', () => {
    expect(allow(freshLimiter(), { type: 'clipShared', now: 1000, turnCount: 2 })).toBe(true);
  });

  it('blocks a second interjection inside the time gap, allows it once both gaps clear', () => {
    const s = record(freshLimiter(), { type: 'clipShared', now: 1000, turnCount: 2 });
    // plenty of turns later, but only 1s later → the time gate blocks it
    expect(allow(s, { type: 'clipShared', now: 2000, turnCount: 9 })).toBe(false);
    // both the time and the turn gap satisfied → allowed
    expect(
      allow(s, { type: 'clipShared', now: 1000 + MIN_GAP_MS, turnCount: 2 + MIN_GAP_TURNS }),
    ).toBe(true);
  });

  it('blocks inside the turn gap even after plenty of time', () => {
    const s = record(freshLimiter(), { type: 'clipShared', now: 0, turnCount: 10 });
    expect(allow(s, { type: 'clipShared', now: MIN_GAP_MS * 5, turnCount: 11 })).toBe(false);
  });

  it('lets a recurring moment fire again once both gaps clear', () => {
    const s = record(freshLimiter(), { type: 'clipShared', now: 1000, turnCount: 3 });
    expect(
      allow(s, { type: 'clipShared', now: 1000 + MIN_GAP_MS, turnCount: 3 + MIN_GAP_TURNS }),
    ).toBe(true);
  });

  it('record returns new state without mutating the input', () => {
    const s = freshLimiter();
    const next = record(s, { type: 'clipShared', now: 5, turnCount: 1 });
    expect(s.lastAt).toBe(0);
    expect(next.lastAt).toBe(5);
    expect(next.lastTurn).toBe(1);
  });
});
