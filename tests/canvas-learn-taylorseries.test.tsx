import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TaylorSeries } from '../src/canvas/blocks/learn/TaylorSeries';

// Regression coverage for a real bug: the formula row (built from the function label plus a
// repeated "(x−center)^n/n!" term per shown power) had no wrapping CSS, so a large center value
// or a high shown-term count produced a long monospace string that overflowed the fixed-width
// card on narrow screens instead of wrapping onto multiple lines.

describe('TaylorSeries', () => {
  it('wraps a long formula string instead of overflowing the card', () => {
    // A large multi-digit center ("(x−123456)") repeated across several shown terms produces a
    // formula string far longer than the demo fixture's default center=0, single-digit case.
    const { container } = render(
      <TaylorSeries title="Long expansion" fn="cos" center={123456} showTerms={3} />,
    );
    const formula = container.querySelector('p');
    expect(formula).toBeTruthy();
    expect(formula!.textContent!.length).toBeGreaterThan(30);

    // The container that must not overflow: a fixed-width, non-scrolling card.
    const card = container.querySelector('.card') as HTMLElement;
    expect(card).toBeTruthy();

    // The formula paragraph must declare wrapping so long monospace text breaks onto new
    // lines rather than growing wider than its container — the actual bug.
    const style = formula!.getAttribute('style') || '';
    expect(style).toMatch(/overflow-wrap:\s*anywhere/);
    expect(style).toMatch(/word-break:\s*break-word/);
  });

  it('keeps a short default formula centered and untouched', () => {
    const { container } = render(<TaylorSeries title="sin x" fn="sin" showTerms={2} />);
    const formula = container.querySelector('p');
    expect(formula!.textContent).toContain('sin x');
    const style = formula!.getAttribute('style') || '';
    expect(style).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
