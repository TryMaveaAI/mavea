import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EtymTree } from '../src/canvas/blocks/reference/EtymTree';

// Regression coverage for a real bug from a live screenshot: a descendant's "language · gloss"
// line (e.g. "Astrophysics · Bending of light by gravity") is plain SVG text with no wrap or
// clip, rendered centred on a fixed 120px-wide box — a long gloss rendered far wider than the
// box and visually bled into the neighbouring box. Every rendered label must fit the box.

describe('EtymTree', () => {
  it('wraps a long descendant gloss inside its box rather than cutting it', () => {
    const { container } = render(
      <EtymTree
        word="Lensing"
        roots={[{ form: 'lens', lang: 'Latin', gloss: 'lentil (shape similarity)' }]}
        descendants={[
          {
            form: 'Gravitational Lensing',
            lang: 'Astrophysics',
            gloss: 'Bending of light by gravity',
          },
        ]}
      />,
    );
    // Every word is drawn, on as many lines as the box needs; box fit is pinned in
    // canvas-reference-etymtree-layout.
    const langNodes = Array.from(container.querySelectorAll('text.et-lang'));
    expect(langNodes).toHaveLength(2);
    const lines = Array.from(langNodes[1].querySelectorAll('tspan'), (t) => t.textContent);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('Astrophysics · Bending of light by gravity');
  });

  it('leaves a short gloss untouched', () => {
    const { container } = render(
      <EtymTree
        word="ped-"
        roots={[{ form: '*ped-', lang: 'PIE', gloss: 'foot' }]}
        descendants={[{ form: 'pedal', lang: 'Latin', gloss: 'foot' }]}
      />,
    );
    const langNodes = Array.from(container.querySelectorAll('text.et-lang'));
    expect(langNodes.map((n) => n.textContent)).toEqual(['PIE · foot', 'Latin · foot']);
    expect(container.querySelector('title')).toBeNull();
  });
});
