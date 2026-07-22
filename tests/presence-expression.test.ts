// The face should express the answer, but only honestly: warmth on a genuine positive, concern
// on a genuine caution, neutral otherwise. These lock that the read comes from structured block
// signals (stance / tone / confidence) and never over-fires.
import { describe, it, expect } from 'vitest';
import { responseToMood, moodToEmotion, emotionForSpec } from '../src/presence/expression';
import type { Block } from '../src/data/conversation';

// Minimal block literals — responseToMood only reads type + props.{tone,stance,conf}.
const block = (type: string, props: Record<string, unknown>): Block =>
  ({ type, props }) as unknown as Block;

describe('responseToMood', () => {
  it('is neutral for a missing or empty answer', () => {
    expect(responseToMood(null)).toBe('neutral');
    expect(responseToMood({ blocks: [] })).toBe('neutral');
  });

  it('stays neutral on a plain informational answer', () => {
    expect(responseToMood({ blocks: [block('chart', { title: 'x' }), block('list', {})] })).toBe(
      'neutral',
    );
  });

  it('reads a positive verdict or tone as warm', () => {
    expect(responseToMood({ blocks: [block('verdictcard', { stance: 'Yes' })] })).toBe('warm');
    expect(responseToMood({ blocks: [block('quoteblock', { tone: 'pos' })] })).toBe('warm');
  });

  it('reads a caution stance or warn tone as concerned', () => {
    expect(responseToMood({ blocks: [block('verdictcard', { stance: 'caution' })] })).toBe(
      'concerned',
    );
    expect(responseToMood({ blocks: [block('quoteblock', { tone: 'warn' })] })).toBe('concerned');
  });

  it('treats an unverified headline as concerned but routine inferred as neutral', () => {
    expect(responseToMood({ blocks: [block('insight', { conf: 'inferred' })] })).toBe('neutral');
    expect(responseToMood({ blocks: [block('insight', { conf: 'unverified' })] })).toBe(
      'concerned',
    );
  });

  it('lets concern win over warmth when both signals are present', () => {
    expect(
      responseToMood({
        blocks: [block('verdictcard', { stance: 'yes' }), block('quoteblock', { tone: 'warn' })],
      }),
    ).toBe('concerned');
  });
});

describe('moodToEmotion / emotionForSpec', () => {
  it('maps moods to the face emotion vocabulary', () => {
    expect(moodToEmotion('warm')).toBe('warm');
    expect(moodToEmotion('concerned')).toBe('concerned');
    expect(moodToEmotion('neutral')).toBe('neutral');
  });

  it('derives the emotion straight from a spec', () => {
    expect(emotionForSpec({ blocks: [block('verdictcard', { stance: 'no' })] })).toBe('concerned');
    expect(emotionForSpec({ blocks: [] })).toBe('neutral');
  });
});
