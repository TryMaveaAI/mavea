// classifyRevision — does this ask REVISE what is already on the board?
//
// Asymmetric on purpose: a missed revision costs one extra card the reader can ignore, while a
// wrong one rewrites the card they were reading and loses their place. So everything below that
// is not clearly an instruction to change an on-screen value must come back false.
import { describe, it, expect } from 'vitest';
import { classifyRevision } from '../src/live/revise/classifyRevision';

describe('asks that revise what is on screen', () => {
  it.each([
    'make it $2,000',
    'Make that a week instead',
    'change the budget to 1500',
    'actually, it should be four days',
    'set it to 8%',
    'recalculate with a 20% deposit',
    'use Asakusa instead',
    'no, it’s 12 not 20',
    'that’s wrong — the total is 2,054',
    'drop the Kamakura day trip',
    'can you make it cheaper',
    'keep it under $2,000',
    'fix the flight number',
  ])('reads %j as a revision', (ask) => {
    expect(classifyRevision(ask)).toBe(true);
  });
});

describe('asks that are not revisions', () => {
  it.each([
    // New subjects, however imperative they sound.
    'tell me about Kyoto',
    'what is the weather that week',
    'how do I get in from the airport',
    'explain OAuth to me',
    'compare the two hotels',
    'show me both',
    // More of the same thing — an ADD, not an edit.
    'and the flights?',
    'tell me more',
    'what else should I know',
    // A question that merely contains "should be".
    'what should be the next step',
    // Nothing to go on.
    '',
    '   ',
    '?',
  ])('reads %j as not a revision', (ask) => {
    expect(classifyRevision(ask)).toBe(false);
  });

  it('never throws on junk', () => {
    expect(() => classifyRevision(undefined as unknown as string)).not.toThrow();
    expect(classifyRevision(undefined as unknown as string)).toBe(false);
    expect(classifyRevision('🙂'.repeat(500))).toBe(false);
  });
});
