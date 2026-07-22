import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TeachDiagram } from '../src/canvas/blocks/learn/TeachDiagram';
import { layoutLabels } from '../src/canvas/blocks/learn/teachDiagramLayout';
import type { DiagLabel } from '../src/canvas/blocks/media/types';

// Label glyphs render as one or more <tspan> lines inside the <text> node (long labels wrap), and a
// <title> tooltip may also sit inside — so the actually-drawn copy is the joined <tspan> text.
function visibleText(node: Element): string {
  const tspans = node.querySelectorAll('tspan');
  if (tspans.length)
    return Array.from(tspans)
      .map((t) => t.textContent)
      .join('');
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for real bugs from the screenshots: a callout label positioned with a fixed
// offset in a viewBox only 100 units wide ran far past the stage edge, and two callouts at nearby
// X overlapped because de-collision only worked on the Y axis. layoutLabels wraps, caps, keeps every
// box inside the frame, and stacks any that genuinely overlap in both axes.

describe('TeachDiagram', () => {
  it('caps and wraps a long callout label instead of letting it overflow the stage', () => {
    const longLabel: DiagLabel = {
      x: 50,
      y: 30,
      text: 'Electromagnetic induction across the coil windings',
      side: 'right',
    };
    const { container } = render(
      <TeachDiagram
        title="Circuit"
        steps={[{ caption: 'Step one', add: [], labels: [longLabel] }]}
      />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.lr-td-lbl'));
    expect(labelNodes).toHaveLength(1);
    // The visible glyphs stay within the hard character cap so the label fits the 100-unit viewBox.
    expect(visibleText(labelNodes[0]).length).toBeLessThanOrEqual(26);
    expect(visibleText(labelNodes[0]).endsWith('…')).toBe(true);
    // The untruncated string is still present, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Electromagnetic induction across the coil windings');
  });

  it('leaves a short callout label untouched', () => {
    const shortLabel: DiagLabel = { x: 40, y: 20, text: 'Nucleus', side: 'left' };
    const { container } = render(
      <TeachDiagram
        title="Cell"
        steps={[{ caption: 'Step one', add: [], labels: [shortLabel] }]}
      />,
    );
    const labelNodes = Array.from(container.querySelectorAll('text.lr-td-lbl'));
    expect(labelNodes.map((n) => visibleText(n))).toEqual(['Nucleus']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('stacks two same-side callouts at the same height so their text does not overlap', () => {
    // The "Submit Request" / "Refund Processed" collision from the screenshots.
    const labels: DiagLabel[] = [
      { x: 50, y: 40, text: 'Submit Request', side: 'right' },
      { x: 50, y: 40, text: 'Refund Processed', side: 'right' },
    ];
    const placed = layoutLabels(labels, 62.5);
    expect(Math.abs(placed[0].ty - placed[1].ty)).toBeGreaterThanOrEqual(4.6);
  });

  it('leaves no two callouts overlapping in a crowded figure (the address-space case)', () => {
    // The exact bug: two "… (its VM)" top labels and two long bottom labels ("Separate processes…",
    // "Threads within a process…") crowded together. Whether resolved by wrapping (so they fit
    // side-by-side) or by stacking, NO two label boxes may overlap in both axes once placed.
    const CHAR_W = 3.4 * 0.52;
    const LINE_H = 3.4 * 1.2;
    const box = (p: { tx: number; ty: number; anchor: string; lines: string[] }) => {
      const w = Math.max(1, ...p.lines.map((l) => l.length)) * CHAR_W;
      const h = p.lines.length * LINE_H;
      const x0 = p.anchor === 'start' ? p.tx : p.anchor === 'end' ? p.tx - w : p.tx - w / 2;
      return { x0, x1: x0 + w, y0: p.ty - h / 2, y1: p.ty + h / 2 };
    };
    const labels: DiagLabel[] = [
      { x: 25, y: 20, text: 'Process A (its VM)', side: 'top' },
      { x: 80, y: 20, text: 'Process B (its VM)', side: 'top' },
      { x: 25, y: 60, text: 'Separate processes = separate VMs', side: 'bottom' },
      { x: 58, y: 60, text: 'Threads within a process share VM', side: 'bottom' },
    ];
    const boxes = layoutLabels(labels, 62.5).map(box);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a];
        const B = boxes[b];
        // Overlap on BOTH axes (with a hair of tolerance for float rounding) is the collision.
        const overlap =
          A.x1 - 0.1 > B.x0 && B.x1 - 0.1 > A.x0 && A.y1 - 0.1 > B.y0 && B.y1 - 0.1 > A.y0;
        expect(overlap).toBe(false);
      }
    }
  });

  it('keeps every callout box inside the frame', () => {
    // A label hard against each edge must be nudged inward, never left bleeding off the card.
    const labels: DiagLabel[] = [
      { x: 2, y: 2, text: 'Top left corner label', side: 'left' },
      { x: 98, y: 60, text: 'Bottom right corner label', side: 'right' },
    ];
    const placed = layoutLabels(labels, 62.5);
    for (const p of placed) {
      expect(p.tx).toBeGreaterThanOrEqual(0);
      expect(p.tx).toBeLessThanOrEqual(100);
      expect(p.ty).toBeGreaterThanOrEqual(0);
      expect(p.ty).toBeLessThanOrEqual(62.5);
    }
  });

  it('leaves callouts on opposite sides at the same height untouched', () => {
    const labels: DiagLabel[] = [
      { x: 30, y: 40, text: 'Left', side: 'left' },
      { x: 70, y: 40, text: 'Right', side: 'right' },
    ];
    const placed = layoutLabels(labels, 62.5);
    expect(placed[0].ty).toBeCloseTo(40);
    expect(placed[1].ty).toBeCloseTo(40);
  });

  it('re-centres a figure the model drew off in one corner (content-fit)', () => {
    const { container } = render(
      <TeachDiagram
        title="Flow"
        baseShapes={[
          { kind: 'circle', cx: 65, cy: 20, r: 3 },
          { kind: 'circle', cx: 75, cy: 45, r: 3 },
          { kind: 'line', x1: 65, y1: 20, x2: 75, y2: 45 },
        ]}
        steps={[{ caption: 'x', add: [] }]}
      />,
    );
    const g = container.querySelector('svg.lr-td-svg > g[transform]');
    expect(g).not.toBeNull();
    // A right-heavy figure gets a negative x translation (shifted left toward centre).
    expect(g!.getAttribute('transform')).toMatch(/translate\(-\d/);
  });

  it('shrinks a figure the model drew larger than the frame so it does not bleed off the card', () => {
    // The address-space boxes spanned nearly the whole width and ran off the bottom/right. computeFit
    // used to floor the scale at 1 (enlarge-only), so an oversized drawing was never pulled in.
    const { container } = render(
      <TeachDiagram
        title="Address space"
        baseShapes={[
          { kind: 'rect', x: 5, y: 5, w: 90, h: 70 },
          { kind: 'rect', x: 5, y: 80, w: 42, h: 18 },
          { kind: 'rect', x: 52, y: 80, w: 43, h: 18 },
        ]}
        steps={[{ caption: 'x', add: [] }]}
      />,
    );
    const g = container.querySelector('svg.lr-td-svg > g[transform]');
    expect(g).not.toBeNull();
    const scale = Number(g!.getAttribute('transform')?.match(/scale\(([\d.]+)\)/)?.[1]);
    expect(scale).toBeLessThan(1);
  });
});
