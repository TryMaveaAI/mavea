import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IndifferenceCurve } from '../src/canvas/blocks/charts2/IndifferenceCurve';
import type { IdfCurve } from '../src/canvas/blocks/charts2/types';

// Regression coverage for three real bugs: every label the component parks in its plot margins
// (per-curve utility label, budget-line label, optimal-bundle readout) is plain SVG text with no
// wrap or clip, sized against the demo fixture's terse strings ("U₁", "budget", "(4, 6)"). A
// longer label than that fixture — a custom optimal.label, a verbose curve label, or a budget
// line whose intercept sits high on the Y-axis — must not bleed past the fixed 340×252 viewBox
// or climb into the y-axis title's row.

const W = 340; // must track IndifferenceCurve.tsx's internal W — fixed-viewBox, not measured live.
const H = 252;
const PAD_T = 14; // y-axis title baseline

function curve(label: string, points: { x: number; y: number }[]): IdfCurve {
  return { label, points };
}

/** A curve's own direct text (excludes a nested <title> tooltip's text). */
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

describe('IndifferenceCurve', () => {
  it('truncates a long curve label instead of letting it bleed past the viewBox', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('Marginal utility tier one — the low bundle', [
            { x: 1, y: 10 },
            { x: 5, y: 2 },
            { x: 10, y: 1 },
          ]),
        ]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.idf-curve-lbl'));
    expect(labels).toHaveLength(1);
    // Short enough that, combined with its end-anchored x (clamped to W-3) and the bold 10px
    // font, it can't extend past either viewBox edge.
    expect(visibleText(labels[0]).length).toBeLessThanOrEqual(10);
    expect(visibleText(labels[0]).endsWith('…')).toBe(true);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Marginal utility tier one — the low bundle');
  });

  it('leaves a short curve label untouched', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₁', [
            { x: 1, y: 10 },
            { x: 10, y: 1 },
          ]),
        ]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.idf-curve-lbl'));
    expect(labels.map((n) => visibleText(n))).toEqual(['U₁']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('keeps the optimal-bundle readout inside the frame with a long custom label', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₂', [
            { x: 1, y: 10 },
            { x: 12.5, y: 1 },
          ]),
        ]}
        optimal={{ x: 12, y: 1.2, label: 'Optimal bundle: 12 apples and 1.2 oranges' }}
      />,
    );
    const label = container.querySelector('text.idf-optimal-lbl');
    expect(label).toBeTruthy();
    const text = visibleText(label!);
    expect(text.length).toBeLessThanOrEqual(16);
    expect(text.endsWith('…')).toBe(true);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Optimal bundle: 12 apples and 1.2 oranges');
    // The point sits at the far right of the plot (x=12 against a ~13-wide window), so a long
    // label must have flipped to end-anchored and parked to the point's LEFT rather than
    // running its start-anchored x + text width past the viewBox's right edge.
    expect(label!.getAttribute('text-anchor')).toBe('end');
    expect(Number(label!.getAttribute('x'))).toBeLessThanOrEqual(W - 3);
  });

  it('keeps a short optimal-bundle readout right of the point, unflipped', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₂', [
            { x: 1, y: 10 },
            { x: 6, y: 1 },
          ]),
        ]}
        optimal={{ x: 4, y: 3 }}
      />,
    );
    const label = container.querySelector('text.idf-optimal-lbl');
    expect(label).toBeTruthy();
    expect(visibleText(label!)).toBe('(4, 3)');
    expect(label!.getAttribute('text-anchor')).toBe('start');
  });

  it('clamps the budget label below the y-axis title baseline for a steep budget line', () => {
    // A budget line with a very high Y-intercept (income mostly buys good Y) puts its left
    // endpoint near the top of the frame, where the old fixed "-4" offset would print the
    // "budget" label above PAD_T and into the y-axis title's own row.
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₁', [
            { x: 1, y: 5 },
            { x: 5, y: 1 },
          ]),
        ]}
        budget={{ intercept: 500, slope: -5 }}
      />,
    );
    const label = container.querySelector('text.idf-budget-lbl');
    expect(label).toBeTruthy();
    expect(Number(label!.getAttribute('y'))).toBeGreaterThanOrEqual(PAD_T + 8);

    const axisTitle = Array.from(container.querySelectorAll('text.idf-axis-lbl')).find(
      (t) => visibleText(t) === 'Good Y',
    );
    expect(axisTitle).toBeTruthy();
    expect(Number(label!.getAttribute('y'))).toBeGreaterThan(Number(axisTitle!.getAttribute('y')));
  });

  it('renders every label within the fixed viewBox for a shallow budget line too', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₁', [
            { x: 1, y: 5 },
            { x: 5, y: 1 },
          ]),
        ]}
        budget={{ intercept: 3, slope: -0.5 }}
        optimal={{ x: 2, y: 2 }}
      />,
    );
    const svg = container.querySelector('svg.idf-svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe(`0 0 ${W} ${H}`);
    for (const el of container.querySelectorAll('text')) {
      const x = Number(el.getAttribute('x'));
      const y = Number(el.getAttribute('y'));
      if (Number.isFinite(x)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(W);
      }
      if (Number.isFinite(y)) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(H);
      }
    }
  });
});
