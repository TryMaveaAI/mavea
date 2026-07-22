import { describe, expect, it } from 'vitest';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { reducer, INITIAL } from '../src/live/useLiveTurn';

// The "edit its mind" + self-healing fields ride the same validator as everything else:
// junk is dropped, lengths are bounded, and a half-stated correction never survives.

const BASE = {
  title: 'Tokyo trip',
  sub: '',
  narration: 'Late April works best.',
  blocks: [{ type: 'insight', props: { title: 'Peak bloom is Mar 28 – Apr 6' } }],
};

describe('understood (edit its mind)', () => {
  it('keeps clean chips, bounded in count and length', () => {
    const v = validateLiveResponse({
      ...BASE,
      understood: ['Tokyo trip', 'late April', '~$2,500 each', '', 'x'.repeat(60)],
    });
    expect(v?.understood).toEqual(['Tokyo trip', 'late April', '~$2,500 each']);
  });

  it('drops a lone chip — one constraint cannot show "what it understood"', () => {
    const v = validateLiveResponse({ ...BASE, understood: ['Tokyo trip'] });
    expect(v?.understood).toBeUndefined();
  });

  it('absent field stays absent', () => {
    expect(validateLiveResponse(BASE)?.understood).toBeUndefined();
  });
});

describe('understood through the turn reducer', () => {
  it('show carries the chips; a new start clears them', () => {
    const shown = reducer(INITIAL, {
      type: 'show',
      spec: { title: 'T', blocks: [] } as never,
      narration: 'n',
      history: [],
      mode: 'replace',
      spot: null,
      prior: { question: 'q', narration: '', title: '', blockTypes: [] },
      tour: [],
      priorSpec: null,
      streamed: false,
      frame: {
        question: 'q',
        narration: 'n',
        mode: 'replace',
        tour: [],
        spec: { title: 'T', blocks: [] } as never,
        at: 0,
      },
      understood: ['Tokyo trip', 'late April'],
    });
    expect(shown.understood).toEqual(['Tokyo trip', 'late April']);
    expect(reducer(shown, { type: 'start' }).understood).toEqual([]);
  });
});

describe('corrects (self-healing history)', () => {
  it('keeps a complete correction, trimmed and bounded', () => {
    const v = validateLiveResponse({
      ...BASE,
      corrects: { what: '  the refi rate ', was: '6.4%', now: '5.9%' },
    });
    expect(v?.corrects).toEqual({ what: 'the refi rate', was: '6.4%', now: '5.9%' });
  });

  it('drops a correction missing any of its three parts', () => {
    const v = validateLiveResponse({ ...BASE, corrects: { what: 'the rate', now: '5.9%' } });
    expect(v?.corrects).toBeUndefined();
  });
});
