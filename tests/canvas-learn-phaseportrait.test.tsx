import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PhasePortrait } from '../src/canvas/blocks/learn/PhasePortrait';

// Regression coverage for two real bugs: equilibrium type labels ("SN"/"Sa"/"C"/…) were drawn at
// a single fixed offset (px+6, py-5) from their marker, so any system whose equilibria cluster
// closer together than that offset — a saddle flanked by two nearby centers is a textbook case —
// rendered overlapping, illegible label text. Separately, the nullcline legend text sat at
// hardcoded pixel offsets from the card's right edge with no width containment, so a label wider
// than the "ẋ=0"/"ẏ=0" demo fixture could bleed past the card boundary.

const W = 320;
const PAD_RIGHT = 16;

// dx/dt = 6y, dy/dt = -40x(x² - 0.09) has three equilibria on y=0 at x = -0.3, 0, 0.3 — a saddle
// (x=0) flanked by two centers (x=±0.3). At the component's fixed viewBox they land ~8.8px apart
// on the SAME horizontal line, which is exactly the configuration the old fixed offset (always
// px+6, py-5) could not separate: all three labels would start at the same y and overlap in x.
const CLUSTERED_SYSTEM = {
  fx: '6*y',
  gy: '-40*x*(x^2 - 0.09)',
  xDomain: [-4, 4] as [number, number],
  yDomain: [-4, 4] as [number, number],
};

function equilibriumMarkers(container: HTMLElement) {
  // Each equilibrium's <g> holds its marker (circle or ×) followed by its label <text>.
  const groups = Array.from(container.querySelectorAll('svg > g')).filter((g) =>
    g.querySelector('text'),
  );
  return groups
    .map((g) => {
      const text = g.querySelector('text');
      const marker = g.querySelector('circle') ?? g.querySelector('line');
      return {
        label: text?.textContent ?? '',
        lx: Number(text?.getAttribute('x')),
        ly: Number(text?.getAttribute('y')),
        markerX: marker ? Number(marker.getAttribute('cx') ?? marker.getAttribute('x1')) : NaN,
      };
    })
    .filter((m) => m.label.length > 0 && !m.label.includes('='));
}

describe('PhasePortrait', () => {
  it('finds multiple distinct equilibria in the clustered demo system', () => {
    const { container } = render(<PhasePortrait title="Clustered" {...CLUSTERED_SYSTEM} />);
    const markers = equilibriumMarkers(container);
    // The exact count depends on the numeric grid search; the clustered fixture is built to
    // yield at least 2 distinct (unmerged) equilibria close enough to collide under the old
    // fixed-offset placement.
    expect(markers.length).toBeGreaterThanOrEqual(2);
  });

  it('separates equilibrium labels instead of stacking them when equilibria cluster', () => {
    const { container } = render(<PhasePortrait title="Clustered" {...CLUSTERED_SYSTEM} />);
    const markers = equilibriumMarkers(container);
    expect(markers.length).toBeGreaterThanOrEqual(2);

    // No two label anchors may land within illegible distance of each other — the old code
    // placed every label at (markerX+6, markerY-5), so any two markers within ~11px produced
    // labels stacked directly on top of one another.
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        const dist = Math.hypot(markers[i].lx - markers[j].lx, markers[i].ly - markers[j].ly);
        expect(dist).toBeGreaterThanOrEqual(11);
      }
    }
  });

  it('keeps a single, well-separated label for an isolated equilibrium (no regression)', () => {
    // A single unstable spiral at the origin, steep enough that only one grid cell qualifies as
    // "near zero" — the demo-fixture shape with only one equilibrium, where collision avoidance
    // must be a no-op and the label still renders at its default offset.
    const { container } = render(<PhasePortrait title="Spiral" fx="-x - 3*y" gy="3*x - y" />);
    const markers = equilibriumMarkers(container);
    expect(markers).toHaveLength(1);
    expect(markers[0].lx).toBe(markers[0].markerX + 6);
  });

  it('constrains the nullcline legend text to the strip inside the card boundary', () => {
    const { container } = render(<PhasePortrait title="Legend" {...CLUSTERED_SYSTEM} />);
    const legendTexts = Array.from(container.querySelectorAll('svg > g > text')).filter((t) =>
      t.textContent?.includes('='),
    );
    expect(legendTexts.length).toBe(2);
    for (const t of legendTexts) {
      const x = Number(t.getAttribute('x'));
      // Visible text (excluding the <title> tooltip, which carries the untruncated string but
      // isn't rendered) must be short enough that even a generous per-character width estimate
      // keeps it inside the card's right edge.
      const visible = Array.from(t.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join('');
      expect(visible.length).toBeLessThanOrEqual(6);
      const estimatedWidth = visible.length * 5; // conservative px/char at fontSize 7
      expect(x + estimatedWidth).toBeLessThanOrEqual(W - PAD_RIGHT);
    }
  });

  it('omits the legend entirely when nullclines are turned off (no stray overflow risk)', () => {
    const { container } = render(
      <PhasePortrait title="No nullclines" {...CLUSTERED_SYSTEM} showNullclines={false} />,
    );
    const legendTexts = Array.from(container.querySelectorAll('svg text')).filter((t) =>
      t.textContent?.includes('='),
    );
    expect(legendTexts).toHaveLength(0);
  });
});
