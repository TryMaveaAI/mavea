import { describe, it, expect } from 'vitest';
import { tableLook, type TablePhase } from '../src/live/delegate/tableLook';

// tableLook is the pure mapping from a moment at the table to how each seat looks. The two
// seats are deliberately asymmetric — only "yours" ever tables an offer with `acting` or closes
// a run with `celebrate`; the stand-in reacts (curious, focused, warm) but never gets the real
// thing. These tests pin every row of that table plus the two structural invariants a
// choreography bug could silently violate.

const running = (over: Partial<Extract<TablePhase, { kind: 'running' }>> = {}): TablePhase => ({
  kind: 'running',
  whoseTurn: 'yours',
  guarded: false,
  speaking: null,
  ...over,
});

describe('tableLook — running phase', () => {
  it('yours thinking: focused when clean, concerned when guarded', () => {
    expect(tableLook(running({ whoseTurn: 'yours' })).yours).toEqual({
      state: 'thinking',
      emotion: 'focused',
      gaze: 'right',
    });
    expect(tableLook(running({ whoseTurn: 'yours', guarded: true })).yours).toEqual({
      state: 'thinking',
      emotion: 'concerned',
      gaze: 'right',
    });
  });

  it('theirs watches yours think: neutral normally, curious while guarded', () => {
    expect(tableLook(running({ whoseTurn: 'yours' })).theirs).toEqual({
      state: 'idle',
      emotion: 'neutral',
      gaze: 'left',
    });
    expect(tableLook(running({ whoseTurn: 'yours', guarded: true })).theirs).toEqual({
      state: 'idle',
      emotion: 'curious',
      gaze: 'left',
    });
  });

  it('theirs thinking is plain neutral — the boundary system never applies to that side', () => {
    const look = tableLook(running({ whoseTurn: 'theirs' }));
    expect(look.theirs).toEqual({ state: 'thinking', emotion: 'neutral', gaze: 'left' });
    expect(look.yours).toEqual({ state: 'idle', emotion: 'neutral', gaze: 'right' });
  });

  it('yours speaks without an offer: speaking/focused, theirs stays neutral', () => {
    const look = tableLook(running({ speaking: { side: 'yours', offer: false, pointing: false } }));
    expect(look.yours).toEqual({ state: 'speaking', emotion: 'focused', gaze: 'right' });
    expect(look.theirs).toEqual({ state: 'idle', emotion: 'neutral', gaze: 'left' });
  });

  it('yours tables an offer: acting/focused while pointing, theirs turns curious', () => {
    const look = tableLook(running({ speaking: { side: 'yours', offer: true, pointing: true } }));
    expect(look.yours).toEqual({ state: 'acting', emotion: 'focused', gaze: 'right' });
    expect(look.theirs).toEqual({ state: 'idle', emotion: 'curious', gaze: 'left' });
  });

  it('yours has an offer but has not reached the pointing beat yet: still speaking, not acting', () => {
    const look = tableLook(running({ speaking: { side: 'yours', offer: true, pointing: false } }));
    expect(look.yours.state).toBe('speaking');
    expect(look.yours.emotion).toBe('focused');
  });

  it('theirs speaks without an offer: speaking/neutral, never acting', () => {
    const look = tableLook(
      running({ speaking: { side: 'theirs', offer: false, pointing: false } }),
    );
    expect(look.theirs).toEqual({ state: 'speaking', emotion: 'neutral', gaze: 'left' });
    expect(look.yours).toEqual({ state: 'idle', emotion: 'neutral', gaze: 'right' });
  });

  it('theirs tables an offer: speaking turns focused, but state is never acting; yours turns curious', () => {
    const look = tableLook(running({ speaking: { side: 'theirs', offer: true, pointing: false } }));
    expect(look.theirs).toEqual({ state: 'speaking', emotion: 'focused', gaze: 'left' });
    expect(look.yours).toEqual({ state: 'idle', emotion: 'curious', gaze: 'right' });
  });
});

describe('tableLook — terminal phases', () => {
  it('deal: the only celebrate on this surface, theirs warms without lighting up', () => {
    expect(tableLook({ kind: 'deal' })).toEqual({
      yours: { state: 'idle', emotion: 'celebrate', gaze: 'center' },
      theirs: { state: 'idle', emotion: 'warm', gaze: 'center' },
    });
  });

  it('approved', () => {
    expect(tableLook({ kind: 'approved' })).toEqual({
      yours: { state: 'idle', emotion: 'warm', gaze: 'center' },
      theirs: { state: 'idle', emotion: 'neutral', gaze: 'center' },
    });
  });

  it('nodeal: focused resolve when the line held, concerned when the sides just could not meet', () => {
    expect(tableLook({ kind: 'nodeal', boundaryHeld: true }).yours.emotion).toBe('focused');
    expect(tableLook({ kind: 'nodeal', boundaryHeld: false }).yours.emotion).toBe('concerned');
  });

  it('stopped: both seats go quiet', () => {
    expect(tableLook({ kind: 'stopped' })).toEqual({
      yours: { state: 'idle', emotion: 'sleepy', gaze: 'down' },
      theirs: { state: 'idle', emotion: 'sleepy', gaze: 'down' },
    });
  });
});

describe('tableLook — invariants', () => {
  const PHASES: TablePhase[] = [
    running({ whoseTurn: 'yours' }),
    running({ whoseTurn: 'yours', guarded: true }),
    running({ whoseTurn: 'theirs' }),
    running({ speaking: { side: 'yours', offer: false, pointing: false } }),
    running({ speaking: { side: 'yours', offer: true, pointing: false } }),
    running({ speaking: { side: 'yours', offer: true, pointing: true } }),
    running({ speaking: { side: 'theirs', offer: false, pointing: false } }),
    running({ speaking: { side: 'theirs', offer: true, pointing: false } }),
    { kind: 'deal' },
    { kind: 'approved' },
    { kind: 'nodeal', boundaryHeld: true },
    { kind: 'nodeal', boundaryHeld: false },
    { kind: 'stopped' },
  ];

  it('at most one seat is ever "speaking" (or its yours-only variant "acting") at a time', () => {
    for (const phase of PHASES) {
      const { yours, theirs } = tableLook(phase);
      const talking = [yours.state, theirs.state].filter((s) => s === 'speaking' || s === 'acting');
      expect(talking.length).toBeLessThanOrEqual(1);
    }
  });

  it('theirs never gets "acting" or "celebrate" — the real thing stays yours-only', () => {
    for (const phase of PHASES) {
      const { theirs } = tableLook(phase);
      expect(theirs.state).not.toBe('acting');
      expect(theirs.emotion).not.toBe('celebrate');
    }
  });
});
