import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PatternPiece } from '../src/canvas/blocks/media/PatternPiece';
import type { PatternPart } from '../src/canvas/blocks/media/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s
// (mirrors CutList/FloorPlan in this same family).
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage: a piece label was rendered as plain, unbounded SVG text centered on the
// piece with no width constraint, so a long piece name in a narrow piece rendered wider than its
// rectangle and bled past its edges — the exact bug class already fixed for CutList/FloorPlan in
// this same family.
describe('PatternPiece', () => {
  it('truncates a long piece label instead of letting it overflow its rectangle', () => {
    const pieces: PatternPart[] = [
      // 24 chars, well past what fits at the default font-size in a narrow 14-unit-wide piece.
      { label: 'Left Front Bodice Lining', w: 14, h: 30, x: 0, y: 0, qty: 1 },
    ];
    const { container } = render(
      <PatternPiece title="Layout" fabric={{ w: 100, h: 60 }} pieces={pieces} />,
    );

    const labels = Array.from(container.querySelectorAll('text.pat-piece-lbl'));
    expect(labels).toHaveLength(1);

    const label = labels[0];
    const tspan = label.querySelector('tspan');
    expect(tspan).toBeTruthy();

    const rendered = visibleText(tspan!);
    expect(rendered.length).toBeLessThan('Left Front Bodice Lining'.length);
    expect(rendered.endsWith('…')).toBe(true);

    // The untruncated label survives as a native <title> tooltip — nothing silently lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Left Front Bodice Lining');

    // The visible glyph count must fit the piece's own width at the label's own font-size —
    // no unbounded text.
    const rect = Array.from(container.querySelectorAll('svg rect')).find(
      (r) => r.getAttribute('width') === '14',
    );
    expect(rect).toBeTruthy();
    const boxW = Number(rect!.getAttribute('width'));
    const fontSize = parseFloat((label as SVGTextElement).style.fontSize) || 10;
    const maxChars = Math.max(3, Math.floor((boxW - fontSize) / (fontSize * 0.6)));
    expect(rendered.length).toBeLessThanOrEqual(maxChars);
  });

  it('truncates long labels across many narrow pieces without illegible overlap, and stays within the card', () => {
    // A dense layout: many small pieces, each with a long, distinct name — the kind of input a
    // fixed-length (or absent) cutoff would let overflow past several piece edges at once.
    const pieces: PatternPart[] = Array.from({ length: 8 }, (_, i) => ({
      label: `Structural Panel Component ${i + 1}`,
      w: 10,
      h: 10,
      x: (i % 4) * 12,
      y: Math.floor(i / 4) * 12,
      qty: 1,
    }));
    const { container } = render(
      <PatternPiece title="Layout" fabric={{ w: 60, h: 30 }} pieces={pieces} />,
    );

    const labels = Array.from(container.querySelectorAll('text.pat-piece-lbl'));
    expect(labels.length).toBeGreaterThan(0);

    labels.forEach((label) => {
      const tspan = label.querySelector('tspan');
      const rendered = visibleText(tspan!);
      const full = pieces.find((p) => p.label.startsWith(rendered.replace('…', '')))?.label ?? '';
      if (full) expect(rendered.length).toBeLessThanOrEqual(full.length);
    });

    // At least one truncated label leaves an ellipsis and a recoverable tooltip — never silent
    // data loss, only a visual shortening.
    const truncated = labels.filter((l) => visibleText(l.querySelector('tspan')!).endsWith('…'));
    expect(truncated.length).toBeGreaterThan(0);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles.some((t) => t?.startsWith('Structural Panel Component'))).toBe(true);

    // No <text> node's rendered glyph run exceeds what its own piece width can hold — the
    // overflow-past-the-card bug would show up here as a mismatch between glyph budget and rect
    // width for at least one piece.
    const rects = Array.from(container.querySelectorAll('svg rect')).filter(
      (r) => r.getAttribute('width') === '10',
    );
    expect(rects.length).toBeGreaterThan(0);
  });

  it('leaves a short label in a large piece untouched', () => {
    const pieces: PatternPart[] = [{ label: 'Sleeve', w: 40, h: 30, x: 0, y: 0, qty: 1 }];
    const { container } = render(
      <PatternPiece title="Layout" fabric={{ w: 100, h: 60 }} pieces={pieces} />,
    );
    const label = container.querySelector('text.pat-piece-lbl');
    const tspan = label?.querySelector('tspan');
    expect(visibleText(tspan!)).toBe('Sleeve');
    expect(container.querySelector('title')).toBeNull();
  });
});
