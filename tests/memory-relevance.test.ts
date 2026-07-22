import { describe, it, expect } from 'vitest';
import { isCreativeAsk, memoryRelevant } from '../src/live/memory/relevance';

describe('memory relevance gate', () => {
  it('treats creative-writing asks as creative (no memory, no track-it nudge)', () => {
    for (const ask of [
      'make a funny poem',
      'write me a haiku about the ocean',
      'tell me a joke',
      'compose a short story about a dragon',
      'write a song about summer',
      'give me a limerick',
    ]) {
      expect(isCreativeAsk(ask)).toBe(true);
      expect(memoryRelevant(ask)).toBe(false);
    }
  });

  it('keeps personal/factual/contextual asks memory-relevant', () => {
    for (const ask of [
      "what's the story with my taxes this year", // "story" but not a creative request
      'how is my business doing',
      'remember that I prefer dense answers',
      'what should I cook for dinner tonight',
      'summarize the Pacific Ocean',
      'what song is playing', // asking about a song, not to write one
    ]) {
      expect(isCreativeAsk(ask)).toBe(false);
      expect(memoryRelevant(ask)).toBe(true);
    }
  });
});
