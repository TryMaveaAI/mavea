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

// The other way a subject goes missing — and the one that produced "This living answer didn't come
// back" rather than a wrong-but-present world.
//
// Some turns send the MODEL a composed instruction instead of the reader's words: an "edit its mind"
// correction, a block fuse, a morning brief. They name plenty of words, so `namesSubject` waves them
// through — and the world was then asked to build a causal web of the INSTRUCTION. A reader who
// corrected an answer and pressed the living answer got a failure, every time.
describe('a composed instruction is never mistaken for what the reader asked', () => {
  const CORRECTION =
    'Correction — you understood "iPad input mechanisms", but it\'s actually "the pen tips". ' +
    'Keep the rest of your understanding and update the answer wherever this changes it.';

  it('falls back to the thread’s headline for an “edit its mind” correction', () => {
    expect(worldSubject(CORRECTION, 'How Apple Pencil input works')).toBe(
      'How Apple Pencil input works',
    );
  });

  it('offers nothing rather than a world about the instruction, when there is no headline', () => {
    expect(worldSubject(CORRECTION, undefined)).toBeNull();
    expect(worldSubject(CORRECTION, '   ')).toBeNull();
  });

  it('covers the other composed prompts the same way', () => {
    const headline = 'Quarterly revenue drivers';
    for (const composed of [
      'Fuse these two blocks — the connection between "Churn" and "Pricing" is unexplained.',
      'You are Mavéa, an AI presence. Generate a concise morning brief for today.',
      'I just thought out loud for about four minutes. Sort it.',
    ]) {
      expect(worldSubject(composed, headline), composed.slice(0, 32)).toBe(headline);
    }
  });

  it('still lets a real question through untouched', () => {
    expect(worldSubject('Why did the 2008 financial crisis happen?', 'Something else')).toBe(
      'Why did the 2008 financial crisis happen?',
    );
  });
});
