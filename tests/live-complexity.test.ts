import { describe, it, expect } from 'vitest';
import { classifyAsk, isTeachingAsk } from '../src/live/select';

describe('classifyAsk', () => {
  it('treats genuinely trivial asks as lean', () => {
    for (const ask of [
      '1+1',
      'what is 1+1',
      "what's 12 * 9",
      'calculate 15% of 200',
      '15% of 80',
      'convert 5 miles to km',
      'how many cm in an inch',
      'define osmosis',
      'what does osmosis mean',
      'capital of France',
    ]) {
      expect(classifyAsk(ask), ask).toBe('lean');
    }
  });

  it('treats substantive / broad / exploratory asks as rich (the default)', () => {
    for (const ask of [
      'tell me about New Jersey',
      'how does photosynthesis work',
      'how should I budget my monthly money',
      'plan three days in tokyo',
      'compare the train vs flying to Boston',
      'give me an overview of the solar system',
      'New Jersey', // a bare topic deserves a rich canvas, not a one-liner
      '',
    ]) {
      expect(classifyAsk(ask), ask).toBe('rich');
    }
  });

  it('lets a broad framing override a trivial keyword', () => {
    // "calculate" alone would be lean, but this is a rich explainer.
    expect(classifyAsk('explain how to calculate compound interest')).toBe('rich');
  });

  it('honors an explicit brevity request as brief', () => {
    for (const ask of [
      'just tell me what photosynthesis is',
      'in one line, what is inflation',
      'tl;dr how does the stock market work',
      'briefly, how do vaccines work',
      'explain quantum entanglement in short',
      "what's the gist of the french revolution",
    ]) {
      expect(classifyAsk(ask), ask).toBe('brief');
    }
  });

  it('keeps brevity subordinate to triviality and superior to breadth', () => {
    // A bare trivial fact stays lean (tightest + most precise) even when phrased "briefly".
    expect(classifyAsk('define osmosis briefly')).toBe('lean');
    // An explicit brevity cue beats a broad framing — they asked for short, honor it.
    expect(classifyAsk('briefly compare python and javascript')).toBe('brief');
    // A depth-up request stays rich.
    expect(classifyAsk('give me a deep dive on black holes')).toBe('rich');
  });

  it('treats a teaching ask as rich — even with a time-pressure word like "quickly"', () => {
    for (const ask of [
      'teach me linked lists and graphs for a FAANG interview quickly',
      'teach me how recursion works fast',
      'help me understand the krebs cycle',
      'give me a crash course on react hooks',
      'walk me through how TCP works',
      'get me up to speed on transformers',
      'prep me for my system design interview',
    ]) {
      expect(classifyAsk(ask), ask).toBe('rich');
    }
  });

  it('still honors an EXPLICIT short-answer cue, even on a teaching ask', () => {
    // "quick answer/version" is a genuine make-it-short request; "teach me X in one line" is brief.
    expect(classifyAsk('give me a quick answer: who won the 2022 world cup')).toBe('brief');
    expect(classifyAsk('teach me what a hash map is in one line')).toBe('brief');
  });

  it('does not false-positive on words that merely contain a teaching token', () => {
    expect(classifyAsk('latest teachers union news')).toBe('rich'); // not a teaching ASK, still rich by default
    expect(isTeachingAsk('latest teachers union news')).toBe(false);
    expect(isTeachingAsk('teach me binary search')).toBe(true);
    expect(isTeachingAsk('teach me X quickly')).toBe(true);
  });
});
