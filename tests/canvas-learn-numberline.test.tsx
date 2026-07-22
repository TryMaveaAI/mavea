import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NumberLine } from '../src/canvas/blocks/learn/NumberLine';

// Regression coverage for a real bug: point and interval labels were drawn at a single fixed
// y-offset above the axis with no wrapping or collision handling, so densely packed points (or
// long interval labels sharing the same x-neighbourhood) rendered illegibly on top of each
// other. Densely packed/long labels now stack onto alternating rows instead of colliding, and
// the SVG viewBox grows to fit whatever row count that produced.

// Mirrors the component's own LABEL_CHAR_W (px per glyph at the 9.5px label font) so the test's
// overlap check reasons in the same units the collision-avoidance pass does.
const LABEL_CHAR_W = 5.4;

/** A label's centre x from its `text-anchor="middle"` x attribute, and its approximate rendered
 *  half-width in pixels — enough to detect two same-row labels whose boxes truly overlap. */
function box(node: SVGTextElement): { cx: number; y: number; halfWidth: number } {
  const cx = Number(node.getAttribute('x'));
  const y = Number(node.getAttribute('y'));
  const halfWidth = ((node.textContent?.length ?? 0) * LABEL_CHAR_W) / 2;
  return { cx, y, halfWidth };
}

function overlaps(a: ReturnType<typeof box>, b: ReturnType<typeof box>): boolean {
  if (a.y !== b.y) return false; // different rows never collide
  const aLeft = a.cx - a.halfWidth;
  const aRight = a.cx + a.halfWidth;
  const bLeft = b.cx - b.halfWidth;
  const bRight = b.cx + b.halfWidth;
  return aLeft < bRight && bLeft < aRight;
}

describe('NumberLine', () => {
  it('staggers densely packed point labels instead of overlapping them', () => {
    // Eight labelled points packed tightly into a 0-10 range with longer labels than the
    // two-point demo fixture uses — at a single fixed y, neighbouring labels' text boxes would
    // overlap illegibly.
    const points = Array.from({ length: 8 }, (_, i) => ({
      value: i * 1.2,
      label: `Point ${i}`,
    }));
    const { container } = render(
      <NumberLine title="Dense points" min={0} max={10} points={points} />,
    );
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('.lr-nl-plbl')).map(box);
    expect(labels).toHaveLength(8);
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        expect(overlaps(labels[i], labels[j])).toBe(false);
      }
    }
    // Collisions were resolved by stacking onto more than one row, not by coincidence.
    const rowYs = new Set(labels.map((l) => l.y));
    expect(rowYs.size).toBeGreaterThan(1);
  });

  it('staggers long interval labels that would otherwise overlap neighbouring points', () => {
    const { container } = render(
      <NumberLine
        title="Long interval label"
        min={0}
        max={100}
        points={[{ value: 62, label: 'Current standing' }]}
        intervals={[{ from: 55, to: 75, label: 'Passing range for this assessment' }]}
      />,
    );
    const ivLabels = Array.from(container.querySelectorAll<SVGTextElement>('.lr-nl-ivlbl')).map(
      box,
    );
    const ptLabels = Array.from(container.querySelectorAll<SVGTextElement>('.lr-nl-plbl')).map(box);
    expect(ivLabels).toHaveLength(1);
    expect(ptLabels).toHaveLength(1);
    expect(overlaps(ivLabels[0], ptLabels[0])).toBe(false);
  });

  it('grows the viewBox to fit stacked label rows instead of clipping them', () => {
    const points = Array.from({ length: 6 }, (_, i) => ({
      value: i * 1.2,
      label: `Value ${i}`,
    }));
    const { container } = render(
      <NumberLine title="Tall stack" min={0} max={10} points={points} />,
    );
    const svg = container.querySelector('svg.lr-nl-svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const [, , , vbHeight] = viewBox;
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('.lr-nl-plbl'));
    // Every label's y must fall inside the viewBox — nothing stacked above row 0 renders
    // outside the box the surrounding card actually reserves.
    for (const label of labels) {
      const y = Number(label.getAttribute('y'));
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(vbHeight);
    }
    // With this many densely packed labels the box must have grown past the unlabelled base
    // height (92) to make room for the extra row(s).
    expect(vbHeight).toBeGreaterThan(92);
  });

  it('renders a single point/interval with no stacking needed', () => {
    const { container } = render(
      <NumberLine title="Simple" min={0} max={10} points={[{ value: 5, label: 'x' }]} />,
    );
    const label = container.querySelector<SVGTextElement>('.lr-nl-plbl')!;
    expect(label.getAttribute('y')).toBe('42'); // AXIS_Y(54) - 12, row 0
    const svg = container.querySelector('svg.lr-nl-svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 320 92');
  });
});
