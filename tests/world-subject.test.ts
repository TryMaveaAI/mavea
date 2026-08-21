// What a living answer is ABOUT. A reader deep in a thread about refinancing pressed "tell me more"
// and got a causal web about Systems Thinking, Logic Mapping and Causal World Building — the builder,
// handed the bare phrase, explained the act of explaining. These pin the resolution that stops it.
import { describe, expect, it } from 'vitest';
import { namesSubject, worldSubject } from '../src/live/world/subject';

describe('does an utterance name anything?', () => {
  it.each([
    'tell me more',
    'why?',
    'go on',
    'can you explain that a bit more',
    'more',
    'ok, and then?',
    'I want to understand this better',
  ])('%j names nothing of its own', (text) => {
    expect(namesSubject(text)).toBe(false);
  });

  it.each([
    'tell me about refinancing',
    'why did the 2008 financial crisis happen',
    'how does photosynthesis work',
    'what is a CDO',
    'refinancing',
  ])('%j names a subject', (text) => {
    expect(namesSubject(text)).toBe(true);
  });
});

describe('the subject a living answer is offered on', () => {
  it('uses the reader’s own words whenever they name something', () => {
    expect(worldSubject('why did the crash happen', 'Something else entirely')).toBe(
      'why did the crash happen',
    );
  });

  it('falls back to the thread’s subject on a follow-up that names nothing', () => {
    // The reported bug, in one assertion.
    expect(worldSubject('tell me more', 'Refinancing: when it pays')).toBe(
      'Refinancing: when it pays',
    );
  });

  it('offers NOTHING when neither the question nor the answer names a subject', () => {
    // No card at all beats a card that opens onto the wrong thing.
    expect(worldSubject('tell me more', undefined)).toBeNull();
    expect(worldSubject('go on', '   ')).toBeNull();
    expect(worldSubject('', undefined)).toBeNull();
  });
});
