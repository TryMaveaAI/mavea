import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { AnalogyMap } from '../src/canvas/blocks/diagrams/AnalogyMap';
import type { AnalogyMapProps } from '../src/canvas/blocks/diagrams/types';

// The whole figure is one connector per pair, so the invariant that matters is structural:
// however many pairs arrive, however lopsided their two sides, every row carries exactly one
// rail — and a pair that only filled one side never draws a line to nothing. The second theme
// here is that malformed props degrade instead of throwing: BlockBoundary's fallback is `null`,
// so a throw inside a block deletes the whole card silently.

const KEYS: AnalogyMapProps = {
  title: 'A private key is like a house key',
  familiar: 'A house and its keys',
  target: 'Public-key cryptography',
  pairs: [
    { familiar: 'Your house key', target: 'The private key', note: 'the secret you never share' },
    { familiar: 'Your street address', target: 'The public key' },
  ],
};

/** Rows and rails should always come in equal numbers — one connector per correspondence. */
function shape(container: HTMLElement) {
  return {
    rows: container.querySelectorAll('.ana-row').length,
    rails: container.querySelectorAll('.ana-rail').length,
    notes: container.querySelectorAll('.ana-note').length,
  };
}

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.ana-row'));
}

const CSS = readFileSync(resolve(__dirname, '../src/canvas/blocks/diagrams/styles.css'), 'utf8');

function rule(selector: string): string {
  const match = CSS.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`, 'g'));
  expect(match, `expected a ${selector} rule`).toBeTruthy();
  return (match ?? []).join('\n');
}

describe('AnalogyMap', () => {
  it('maps each pair across the two labelled columns', () => {
    const { container, getByText } = render(<AnalogyMap {...KEYS} />);
    expect(shape(container)).toEqual({ rows: 2, rails: 2, notes: 1 });
    expect(getByText('A house and its keys')).toBeTruthy();
    expect(getByText('Public-key cryptography')).toBeTruthy();
    expect(getByText('The private key')).toBeTruthy();
  });

  it('keeps one connector per pair at two pairs and at eight', () => {
    const pairs = Array.from({ length: 8 }, (_, i) => ({
      familiar: `familiar ${i}`,
      target: `target ${i}`,
      note: i % 2 ? `note ${i}` : undefined,
    }));
    const { container } = render(<AnalogyMap {...KEYS} pairs={pairs} />);
    expect(shape(container)).toEqual({ rows: 8, rails: 8, notes: 4 });
    // The stagger index is the row's own position, not a value derived from the pair count.
    expect(rows(container)[7].style.getPropertyValue('--i')).toBe('7');
  });

  it('places every row by layout alone — no inline geometry derived from the pair count', () => {
    // Two pairs and eight must produce identical row markup apart from the stagger index: the
    // connector is centred on its row by the shared `--ana-cols` grid, never by placement math.
    for (const n of [2, 8, 24]) {
      const pairs = Array.from({ length: n }, (_, i) => ({ familiar: `f${i}`, target: `t${i}` }));
      const { container } = render(<AnalogyMap {...KEYS} pairs={pairs} />);
      expect(shape(container)).toEqual({ rows: n, rails: n, notes: 0 });
      for (const row of rows(container)) {
        expect(row.getAttribute('style')).toMatch(/^--i:\s*\d+;?$/);
      }
      // Past the cap the tail still animates in with the rest instead of waiting on the count.
      expect(Number(rows(container).at(-1)?.style.getPropertyValue('--i'))).toBeLessThanOrEqual(11);
    }
  });

  it('shares one column template between the headers and every row, and wraps long text', () => {
    // Geometry lives in CSS, so this is where the "holds at any pair count" promise is pinned:
    // one template variable for the header strip and the rows, and no fixed-width text cell.
    expect(rule('.ana')).toMatch(/--ana-cols:/);
    expect(rule('.ana-heads')).toMatch(/grid-template-columns:\s*var\(--ana-cols\)/);
    expect(rule('.ana-row')).toMatch(/grid-template-columns:\s*var\(--ana-cols\)/);
    for (const sel of ['.ana-side', '.ana-note', '.ana-head-name']) {
      expect(rule(sel), `${sel} must wrap`).toMatch(/overflow-wrap:\s*anywhere/);
    }
    for (const sel of ['.ana-side', '.ana-note', '.ana-head']) {
      expect(rule(sel), `${sel} must be shrinkable`).toMatch(/min-width:\s*0/);
    }
  });

  it('renders a long label in full rather than truncating it', () => {
    const long = `A ${'very '.repeat(60)}long correspondence`;
    const { getByText } = render(
      <AnalogyMap {...KEYS} pairs={[{ familiar: long, target: 'The private key', note: long }]} />,
    );
    // Wrapping is CSS's job; the component must never shave characters off the model's text.
    expect(getByText(long, { selector: '.ana-side' }).textContent).toBe(long);
  });

  it('drops a half-filled pair rather than drawing a connector to nothing', () => {
    const pairs = [
      ...KEYS.pairs,
      { familiar: 'orphan', target: '   ' },
      { familiar: '', target: 'orphan' },
    ];
    const { container, queryByText } = render(<AnalogyMap {...KEYS} pairs={pairs} />);
    expect(shape(container).rows).toBe(2);
    expect(queryByText('orphan')).toBeNull();
  });

  it('degrades instead of throwing when the props are not the shape they claim', () => {
    // Every one of these reached React before: `pairs` as an object threw ".filter is not a
    // function", a numeric `breaksDown` entry threw ".trim is not a function" — and the card
    // vanished, because BlockBoundary renders `null`.
    const loose = {
      title: 'Malformed',
      familiar: 42,
      target: null,
      pairs: { 0: { familiar: 'a', target: 'b' } },
      breaksDown: 'not an array',
      caption: 7,
    } as unknown as AnalogyMapProps;
    const { container, getByText } = render(<AnalogyMap {...loose} />);
    expect(shape(container).rows).toBe(0);
    expect(container.querySelector('.ana-limits')).toBeNull();
    expect(container.querySelector('.ana-caption')).toBeNull();
    expect(getByText('Malformed')).toBeTruthy();
    expect(container.querySelector('.cx-empty')).toBeTruthy();
  });

  it('ignores non-string members inside the arrays', () => {
    const loose = {
      ...KEYS,
      pairs: [null, { familiar: 1, target: 2 }, { familiar: 'Your house key', target: 3 }],
      breaksDown: [42, { text: 'nope' }, '   ', 'Keys wear out; key pairs do not.'],
    } as unknown as AnalogyMapProps;
    const { container, getByText } = render(<AnalogyMap {...loose} />);
    expect(shape(container).rows).toBe(0);
    expect(container.querySelectorAll('.ana-limits-list li')).toHaveLength(1);
    expect(getByText('Keys wear out; key pairs do not.')).toBeTruthy();
  });

  it('drops a note that is not text but keeps the correspondence it belongs to', () => {
    const loose = {
      ...KEYS,
      pairs: [{ familiar: 'Your house key', target: 'The private key', note: { gloss: 'secret' } }],
    } as unknown as AnalogyMapProps;
    const { container } = render(<AnalogyMap {...loose} />);
    expect(shape(container)).toEqual({ rows: 1, rails: 1, notes: 0 });
  });

  it('skips the whole stage when nothing maps, but still states the limits', () => {
    const { container, getByText } = render(
      <AnalogyMap {...KEYS} pairs={[]} breaksDown={['Keys wear out; key pairs do not.']} />,
    );
    expect(container.querySelector('.ana')).toBeNull();
    expect(getByText('Keys wear out; key pairs do not.')).toBeTruthy();
    // The limits panel is real content, so the card is not empty.
    expect(container.querySelector('.cx-empty')).toBeNull();
  });

  it('says it has nothing to map rather than leaving a title over blank space', () => {
    const bare = render(<AnalogyMap {...KEYS} pairs={[]} />);
    expect(bare.container.querySelector('.cx-empty')).toBeTruthy();

    // Same for pairs that all lost a side: they map nothing, so they leave nothing behind.
    const halves = render(
      <AnalogyMap {...KEYS} pairs={[{ familiar: 'Your house key', target: '' }]} />,
    );
    expect(halves.container.querySelector('.ana')).toBeNull();
    expect(halves.container.querySelector('.cx-empty')).toBeTruthy();

    // A caption alone is still something to read, so it holds the card on its own.
    const captioned = render(<AnalogyMap {...KEYS} pairs={[]} caption="Analogy pending." />);
    expect(captioned.container.querySelector('.cx-empty')).toBeNull();
    expect(captioned.getByText('Analogy pending.')).toBeTruthy();
  });

  it('marks an approximate correspondence and explains the dashed line only then', () => {
    const solid = render(<AnalogyMap {...KEYS} />);
    expect(solid.container.querySelector('.ana-link--loose')).toBeNull();
    expect(solid.container.querySelector('.ana-legend')).toBeNull();

    const loose = render(
      <AnalogyMap
        {...KEYS}
        pairs={[{ familiar: 'Changing the locks', target: 'Rotating a key pair', loose: true }]}
      />,
    );
    expect(loose.container.querySelectorAll('.ana-link--loose')).toHaveLength(1);
    expect(loose.container.querySelector('.ana-legend')).toBeTruthy();
  });

  it('renders model text as escaped nodes, never as markup', () => {
    const { container, getByText } = render(
      <AnalogyMap
        {...KEYS}
        pairs={[{ familiar: '<img src=x onerror=alert(1)>', target: 'The private key' }]}
        breaksDown={['<script>alert(2)</script>']}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
});
