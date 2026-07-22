import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CutList } from '../src/canvas/blocks/media/CutList';
import type { CutPart } from '../src/canvas/blocks/media/types';

// Regression coverage: a part label was rendered as plain, unbounded SVG text sized only from the
// sheet width (never the rect's own width), so a long part name (or the same name packed into a
// small shelf-packed rect) rendered wider than its rectangle and bled past its edges — the exact
// bug class already fixed for FloorPlan/SportsPitch in this same family. A <title> tooltip nested
// inside a <text> node is part of its DOM textContent too, so reading the actually-rendered
// glyphs means the node's own direct text children, not the <title>'s (mirrors FloorPlan/EtymTree).
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

describe('CutList', () => {
  it('truncates a long part label instead of letting it overflow its rectangle', () => {
    const parts: CutPart[] = [
      // 26 chars, well past what fits at the default font-size in a 60-unit-wide rect.
      { label: 'Cabinet Side Panel Assembly', w: 60, h: 40, qty: 1, x: 0, y: 0 },
    ];
    const { container } = render(
      <CutList title="Sheet Layout" stock={{ w: 240, h: 120 }} parts={parts} />,
    );

    const labels = Array.from(container.querySelectorAll('text.cut-piece-lbl'));
    expect(labels).toHaveLength(1);

    const rects = Array.from(container.querySelectorAll('svg rect')).filter(
      (r) => r.getAttribute('width') === '60',
    );
    expect(rects.length).toBeGreaterThan(0);

    const rendered = visibleText(labels[0]);
    expect(rendered.length).toBeLessThan('Cabinet Side Panel Assembly'.length);
    expect(rendered.endsWith('…')).toBe(true);

    // The untruncated label survives as a native <title> tooltip — nothing silently lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Cabinet Side Panel Assembly');

    // The visible glyph count must fit the rect's own width at the label's own font-size —
    // no fixed-length cutoff and no unbounded text.
    const boxW = Number(rects[0].getAttribute('width'));
    const fontSize = parseFloat((labels[0] as SVGTextElement).style.fontSize) || 10;
    const maxChars = Math.max(3, Math.floor((boxW - fontSize * 0.5) / (fontSize * 0.6)));
    expect(rendered.length).toBeLessThanOrEqual(maxChars);
  });

  it('truncates a long label even when shelf-packed into a small rectangle', () => {
    // No explicit x/y — many qty-1 parts with long names shelf-pack into whatever space remains,
    // which can be much narrower than the sheet itself.
    const parts: CutPart[] = Array.from({ length: 8 }, (_, i) => ({
      label: `Structural Support Bracket ${i + 1}`,
      w: 25,
      h: 25,
      qty: 1,
    }));
    const { container } = render(
      <CutList title="Sheet Layout" stock={{ w: 200, h: 100 }} parts={parts} />,
    );

    const labels = Array.from(container.querySelectorAll('text.cut-piece-lbl'));
    expect(labels.length).toBeGreaterThan(0);

    labels.forEach((label) => {
      const rendered = visibleText(label);
      // Every visible label must be materially shorter than its full source name — none is
      // allowed to render at full, unbounded length in a 25-unit-wide packed rectangle.
      const full = parts.find((p) => p.label.startsWith(rendered.replace('…', '')))?.label ?? '';
      if (full) expect(rendered.length).toBeLessThanOrEqual(full.length);
    });

    // At least one truncated label leaves an ellipsis and a recoverable tooltip.
    const truncated = labels.filter((l) => visibleText(l).endsWith('…'));
    expect(truncated.length).toBeGreaterThan(0);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles.some((t) => t?.startsWith('Structural Support Bracket'))).toBe(true);
  });

  it('leaves a short label in a large rectangle untouched', () => {
    const parts: CutPart[] = [{ label: 'Shelf', w: 60, h: 40, qty: 1, x: 0, y: 0 }];
    const { container } = render(
      <CutList title="Sheet Layout" stock={{ w: 240, h: 120 }} parts={parts} />,
    );
    const label = container.querySelector('text.cut-piece-lbl');
    expect(label?.textContent).toBe('Shelf');
    expect(container.querySelector('title')).toBeNull();
  });
});
