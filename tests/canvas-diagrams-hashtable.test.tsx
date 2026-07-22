import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HashTable } from '../src/canvas/blocks/diagrams/HashTable';

// Regression coverage: node text is centred in a fixed NODE_W box with no width constraint,
// so an entry like "14: Christopher" rendered far wider than the box and bled past it. Long
// labels must now shrink/compress to fit instead of overflowing.

describe('HashTable', () => {
  it('compresses a long entry label to fit the node box', () => {
    const { container } = render(
      <HashTable size={4} entries={[{ key: 14, value: 'Christopher' }]} />,
    );
    const text = container.querySelector('text.ht-node-text');
    expect(text).toBeTruthy();
    expect(text!.textContent).toBe('14: Christopher');
    expect(text!.getAttribute('textLength')).toBeTruthy();
    expect(text!.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
  });

  it('leaves a short entry label unconstrained', () => {
    const { container } = render(<HashTable size={4} entries={[{ key: 1, value: 'a' }]} />);
    const text = container.querySelector('text.ht-node-text');
    expect(text).toBeTruthy();
    expect(text!.textContent).toBe('1: a');
    expect(text!.getAttribute('textLength')).toBeNull();
  });
});
