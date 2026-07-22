import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EtymTree } from '../src/canvas/blocks/reference/EtymTree';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug from a live screenshot: a descendant's "language · gloss"
// line (e.g. "Astrophysics · Bending of light by gravity") is plain SVG text with no wrap or
// clip, rendered centred on a fixed 120px-wide box — a long gloss rendered far wider than the
// box and visually bled into the neighbouring box. Every rendered label must fit the box.

describe('EtymTree', () => {
  it('truncates a long descendant gloss instead of letting it overflow the box', () => {
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
    // The full text is preserved (as a tooltip), but no rendered <text> node's visible
    // content may be long enough to overflow the 120px box at the class's font-size — both
    // the root's ("Latin · lentil (shape similarity)") and the descendant's need truncation.
    const langNodes = Array.from(container.querySelectorAll('text.et-lang'));
    expect(langNodes).toHaveLength(2);
    for (const node of langNodes) {
      expect(visibleText(node).length).toBeLessThanOrEqual(22);
    }
    expect(visibleText(langNodes[1]).endsWith('…')).toBe(true);
    // The untruncated string is still present, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Astrophysics · Bending of light by gravity');
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
