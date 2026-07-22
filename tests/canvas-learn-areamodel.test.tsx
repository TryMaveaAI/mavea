import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AreaModel } from '../src/canvas/blocks/learn/AreaModel';

// Regression coverage for a real bug: AreaModel's card carried the "c1" scoping class, which
// belongs to the charts1 family (it opts .card-eyebrow/.insight-summary into wrap-instead-of-
// overflow CSS scoped by `.c1 …` selectors in charts1/styles.css). Every other learn/ component
// renders a plain "card reveal" — AreaModel borrowing a sibling family's scoping class meant it
// silently rode CSS it doesn't own instead of the learn family's own containment rules.

describe('AreaModel', () => {
  it('renders the learn family\'s own card class, not a borrowed charts1 "c1" scope', () => {
    const { container } = render(<AreaModel title="Product" factorA={[20, 3]} factorB={[10, 4]} />);
    const card = container.querySelector('.card');
    expect(card).toBeTruthy();
    expect(card!.className).toBe('card reveal');
  });

  it('grows past the demo fixture (2x2) without losing a cell or breaking the grid shape', () => {
    // The demo fixture is a 2x2 binomial expansion. A caller can ask for far more terms per
    // factor (e.g. a trinomial times a 4-term polynomial) — every column/row header and body
    // cell must still render, one apiece, with no illegible collapse.
    const factorA = [10, 3, -2, 7];
    const factorB = [5, -4, 1];
    const labelsA = factorA.map((_, i) => `x${i}`);
    const labelsB = factorB.map((_, i) => `y${i}`);
    const { container } = render(
      <AreaModel
        title="Large polynomial product"
        factorA={factorA}
        factorB={factorB}
        labelsA={labelsA}
        labelsB={labelsB}
      />,
    );

    const colHeaders = container.querySelectorAll('.lr-am-col-hdr');
    const rowHeaders = container.querySelectorAll('.lr-am-row-hdr');
    const bodyCells = container.querySelectorAll('.lr-am-body-cell');
    expect(colHeaders).toHaveLength(factorA.length);
    expect(rowHeaders).toHaveLength(factorB.length);
    expect(bodyCells).toHaveLength(factorA.length * factorB.length);

    // Every rendered label is exactly one of the supplied terms — no two cells collapsed into
    // one another's text (the illegible-overlap failure mode for grids that outgrow a fixture).
    const colTexts = Array.from(colHeaders).map((n) => n.textContent);
    expect(colTexts).toEqual(labelsA);
    const rowTexts = Array.from(rowHeaders).map((n) => n.textContent);
    expect(rowTexts).toEqual(labelsB);

    // The grid stays a single CSS grid container that scrolls its own overflow rather than
    // pushing the card wider than its column — the containment the family actually relies on.
    const wrap = container.querySelector<HTMLElement>('.lr-am-wrap');
    expect(wrap).toBeTruthy();
    expect(wrap!.querySelector('.lr-am-grid')).toBeTruthy();
  });

  it('keeps a long algebraic label inside its cell text rather than duplicating/clipping siblings', () => {
    const longLabel = '(3x² - 4xy + 7)';
    const { container, getByText } = render(
      <AreaModel
        title="Long term"
        factorA={[1, 1]}
        factorB={[1]}
        labelsA={[longLabel, 'z']}
        labelsB={['w']}
      />,
    );
    // The long term renders verbatim exactly once as its own header cell, distinct from the
    // shorter sibling header — confirming cells don't bleed into or overwrite one another.
    expect(getByText(longLabel)).toBeInTheDocument();
    expect(getByText('z')).toBeInTheDocument();
    const colHeaders = container.querySelectorAll('.lr-am-col-hdr');
    expect(colHeaders).toHaveLength(2);
  });
});
