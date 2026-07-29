import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Storystrip } from '../src/canvas/blocks/layout/Storystrip';
import type { StorystripProps } from '../src/canvas/blocks/layout/types';
import type { IconKey } from '../src/icons/icons';

// The Next-button crash: a model-invented panel icon that isn't a registry key rendered
// `undefined` as a component the moment its panel came up — the click threw mid-render and
// BlockBoundary swapped the whole card for the fallback list, permanently. The schema now snaps
// nested icons at validation, but the component must hold up under whatever props reach it:
// an unknown icon falls back to the spark badge and the walkthrough keeps going.
describe('Storystrip panel navigation', () => {
  const props: StorystripProps = {
    title: 'Your Tokyo Food Journey',
    panels: [
      { heading: 'Day 1: Shinjuku', icon: 'spark', body: 'Neon energy.' },
      // Deliberately invalid at runtime — the exact shape that took the card down.
      { heading: 'Day 2: Shibuya', icon: 'yakitori-alley' as IconKey, body: 'The crossing.' },
      { heading: 'Day 3: Asakusa', body: 'Temples and tempura.' },
    ],
  };

  it('Next reveals the following panel even when its icon is not a real registry key', () => {
    const { getByText } = render(<Storystrip {...props} />);
    expect(getByText('Day 1: Shinjuku')).toBeTruthy();
    fireEvent.click(getByText('Next'));
    expect(getByText('Day 2: Shibuya')).toBeTruthy();
    fireEvent.click(getByText('Next'));
    expect(getByText('Day 3: Asakusa')).toBeTruthy();
    fireEvent.click(getByText('Back'));
    expect(getByText('Day 2: Shibuya')).toBeTruthy();
  });
});
