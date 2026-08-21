// How many sentences the synthesizer sees at once.
//
// Queued one at a time, Kokoro reads each sentence in ISOLATION: a full utterance-initial onset and
// sentence-final falling contour on every one, with the queue's gap between them. Three sentences
// become three little speeches — which is what made the voice sound like a list being read. Only
// the FIRST sentence's latency is audible to a listener, so it still goes out alone and everything
// after it is gathered into a breath.
import { describe, it, expect } from 'vitest';
import { createSpeechPacer, COALESCE_MIN_CHARS } from '../src/live/speechPacer';

/** Comfortably past the gathering threshold on its own, so a single push releases. */
const LONG =
  'This sentence runs long enough on its own to fill a whole breath of speech and then some, ' +
  'which is exactly what the pacer is gathering toward before it hands anything to the voice.';

describe('the opening sentence is never delayed', () => {
  it('hands the first chunk straight through, however short', () => {
    expect(createSpeechPacer().push('Yes.')).toBe('Yes.');
  });

  it('holds the second until there is a breath to say', () => {
    const p = createSpeechPacer();
    p.push('First.');
    expect(p.push('Second.')).toBe('');
  });
});

describe('later sentences gather into breath-sized utterances', () => {
  it('releases once the gathered text reaches the threshold', () => {
    const p = createSpeechPacer();
    expect(p.push('First.')).toBe('First.');
    expect(p.push('Short.')).toBe('');
    const out = p.push(LONG);
    expect(out).toBe(`Short. ${LONG}`);
    expect(out.length).toBeGreaterThanOrEqual(COALESCE_MIN_CHARS);
  });

  it('starts gathering again after a release', () => {
    const p = createSpeechPacer();
    p.push('First.');
    p.push(LONG); // releases
    expect(p.push('Next.')).toBe('');
    expect(p.flush()).toBe('Next.');
  });
});

describe('nothing is ever swallowed', () => {
  it('releases everything held on the final chunk', () => {
    const p = createSpeechPacer();
    p.push('First.');
    p.push('Second.');
    expect(p.push('Third.', true)).toBe('Second. Third.');
  });

  it('releases what is held even when the final chunk is empty', () => {
    const p = createSpeechPacer();
    p.push('First.');
    p.push('Second.');
    expect(p.push('', true)).toBe('Second.');
  });

  it('flush empties, and empties only once', () => {
    const p = createSpeechPacer();
    p.push('First.');
    p.push('Second.');
    expect(p.flush()).toBe('Second.');
    expect(p.flush()).toBe('');
  });

  it('ignores whitespace-only chunks without spending the opener', () => {
    const p = createSpeechPacer();
    expect(p.push('   ')).toBe('');
    expect(p.push('First.')).toBe('First.'); // the first REAL chunk is still the opener
  });
});

describe('coalescing can be turned off entirely', () => {
  it('passes every chunk straight through at a zero threshold', () => {
    const p = createSpeechPacer(0);
    expect(p.push('First.')).toBe('First.');
    expect(p.push('Second.')).toBe('Second.');
    expect(p.push('Third.')).toBe('Third.');
  });
});
