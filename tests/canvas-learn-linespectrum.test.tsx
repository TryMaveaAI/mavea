import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LineSpectrum } from '../src/canvas/blocks/learn/LineSpectrum';
import type { SpectrumLine } from '../src/canvas/blocks/learn/types';

// Regression coverage for a real bug: spectral line labels were placed with a single fixed
// y-offset above the strip and no collision detection, so a dense series (many lines close
// together in wavelength — well beyond the sparse demo fixture) printed overlapping, illegible
// text. Labels close enough to collide must alternate onto a further-back row instead.

const VIEWBOX_W = 340; // must track LineSpectrum.tsx's internal W

/** Approximate rendered half-width of a centred SVG text label at the .ls-label font-size,
 *  matching the component's own LABEL_CHAR_W estimate. */
function halfWidth(text: string): number {
  return (text.length * 5.2) / 2;
}

function readLabels(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGTextElement>('text.ls-label')).map((t) => ({
    x: Number(t.getAttribute('x')),
    y: Number(t.getAttribute('y')),
    text: t.textContent ?? '',
  }));
}

/** A dense run of full "###.# nm" labels spread evenly across the visible range — the
 *  labels are wide enough, and packed close enough, that a single unstaggered row can't
 *  fit them without overlap (verified against the component's own width estimate). */
function denseFixture(n = 20): SpectrumLine[] {
  return Array.from({ length: n }, (_, i) => {
    const wavelength = 400 + i * (300 / (n - 1));
    return { wavelength, label: `${wavelength.toFixed(1)} nm` };
  });
}

describe('LineSpectrum', () => {
  it('alternates rows for closely spaced labels instead of overlapping them', () => {
    // 20 wide labels spread across the full visible range — well beyond the 3-line demo
    // fixture — collide with their neighbours at a single fixed y if rows weren't staggered.
    const lines = denseFixture();
    const { container } = render(<LineSpectrum title="Dense series" lines={lines} />);

    const labels = readLabels(container);
    expect(labels).toHaveLength(lines.length);

    // Group by y (row) and confirm no two labels sharing a row have overlapping text boxes.
    const rows = new Map<number, { x: number; text: string }[]>();
    for (const l of labels) {
      const row = rows.get(l.y) ?? [];
      row.push({ x: l.x, text: l.text });
      rows.set(l.y, row);
    }
    // 20 "###.# nm" labels can't all fit a single row without collision — the fix must have
    // used more than one row.
    expect(rows.size).toBeGreaterThan(1);

    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const prevRight = sorted[i - 1].x + halfWidth(sorted[i - 1].text);
        const curLeft = sorted[i].x - halfWidth(sorted[i].text);
        expect(curLeft).toBeGreaterThanOrEqual(prevRight);
      }
    }
  });

  it('keeps every label within the chart viewBox width', () => {
    const lines = denseFixture();
    const { container } = render(<LineSpectrum title="Dense series" lines={lines} />);
    const labels = readLabels(container);
    for (const l of labels) {
      expect(l.x - halfWidth(l.text)).toBeGreaterThanOrEqual(0);
      expect(l.x + halfWidth(l.text)).toBeLessThanOrEqual(VIEWBOX_W);
    }
  });

  it('grows the viewBox height to fit stacked label rows without clipping', () => {
    const sparse: SpectrumLine[] = [
      { wavelength: 434, label: 'Hγ' },
      { wavelength: 486, label: 'Hβ' },
      { wavelength: 656, label: 'Hα' },
    ];
    const dense = denseFixture();

    const { container: sparseContainer } = render(
      <LineSpectrum title="Balmer series" lines={sparse} />,
    );
    const { container: denseContainer } = render(
      <LineSpectrum title="Dense series" lines={dense} />,
    );

    const sparseSvg = sparseContainer.querySelector('svg.ls-svg')!;
    const denseSvg = denseContainer.querySelector('svg.ls-svg')!;
    const sparseH = Number(sparseSvg.getAttribute('viewBox')!.split(' ')[3]);
    const denseH = Number(denseSvg.getAttribute('viewBox')!.split(' ')[3]);

    // The dense case needed extra label rows, so its viewBox must be taller — a fixed height
    // would have let the second row's text clip past the top edge of the card.
    expect(denseH).toBeGreaterThan(sparseH);

    // And every label — including the stacked-back ones — still sits at or below the top edge.
    for (const svg of [sparseSvg, denseSvg]) {
      for (const t of Array.from(svg.querySelectorAll<SVGTextElement>('text.ls-label'))) {
        expect(Number(t.getAttribute('y'))).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('renders a sparse, well-separated series on a single row (no regression for the common case)', () => {
    const lines: SpectrumLine[] = [
      { wavelength: 434, label: 'Hγ' },
      { wavelength: 486, label: 'Hβ' },
      { wavelength: 656, label: 'Hα' },
    ];
    const { container } = render(<LineSpectrum title="Balmer series" lines={lines} />);
    const labels = readLabels(container);
    expect(labels).toHaveLength(3);
    const ys = new Set(labels.map((l) => l.y));
    expect(ys.size).toBe(1);
  });
});
