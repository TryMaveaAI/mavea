import { describe, expect, it } from 'vitest';
import { answerSignature, type Block } from '../src/data/conversation';

function answer(props: unknown): string {
  return answerSignature({
    id: 'live',
    blocks: [{ type: 'insight', id: 'live-1', props }] as unknown as Block[],
  });
}

describe('answerSignature', () => {
  it('distinguishes answers with the same block silhouette but different content', () => {
    expect(answer({ title: 'Alpha', value: 12 })).not.toBe(answer({ title: 'Beta', value: 12 }));
  });

  it('does not walk an unbounded table to identify an answer', () => {
    const rows = Array.from({ length: 200 }, (_, index) => {
      if (index !== 100) return { label: `Row ${index}`, value: index };
      return Object.defineProperty({}, 'label', {
        enumerable: true,
        get(): never {
          throw new Error('walked past the bounded prefix');
        },
      });
    });
    expect(() => answer({ title: 'Large table', rows })).not.toThrow();
  });
});
