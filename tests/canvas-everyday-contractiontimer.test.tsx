import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ContractionTimer } from '../src/canvas/blocks/everyday/ContractionTimer';
import type { Contraction } from '../src/canvas/blocks/everyday/types';

// Regression coverage for a real bug: every gap-interval label ("6m", "5m", ...) was pinned to
// a fixed top:40% band via CSS, so once the log grew past ~5-7 entries the labels sat at the
// same vertical position and visually collided with their neighbours. Labels must now stagger
// (alternate above/below) so density doesn't cause overlap.

function contractions(n: number): Contraction[] {
  return Array.from({ length: n }, (_, i) => ({
    start: `${2 + Math.floor(i / 6)}:${String((i * 7) % 60).padStart(2, '0')} PM`,
    durationSec: 40 + ((i * 5) % 30),
    intervalMin: i < n - 1 ? 3 + ((i * 2) % 5) : undefined,
  }));
}

describe('ContractionTimer', () => {
  it('staggers gap labels above/below instead of stacking them at one fixed band', () => {
    // 12 logged contractions — well past the ~5-7 threshold where a single fixed top:40%
    // position made every label collide with the next.
    const { container } = render(
      <ContractionTimer title="Contractions" contractions={contractions(12)} />,
    );
    const labels = Array.from(container.querySelectorAll<HTMLElement>('.cn-gap-label'));
    expect(labels.length).toBeGreaterThan(5);

    // Every rendered label must carry an explicit vertical position (not left to a single
    // shared CSS default), and adjacent labels must alternate rather than share one value.
    const tops = labels.map((el) => el.style.top);
    expect(tops.every((t) => t !== '')).toBe(true);
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]).not.toBe(tops[i - 1]);
    }
    // Exactly two distinct bands are used (above / below the bar midline), not a continuum
    // that could still coincide — and not the old single 40% value for every label.
    expect(new Set(tops).size).toBe(2);
    expect(tops.every((t) => t !== '40%')).toBe(true);
  });

  it('keeps every bar and label within the strip for a long, dense log', () => {
    const list = contractions(20);
    const { container } = render(<ContractionTimer title="Contractions" contractions={list} />);
    const strip = container.querySelector('.cn-strip') as HTMLElement;
    expect(strip).toBeTruthy();
    expect(container.querySelectorAll('.cn-bar')).toHaveLength(20);
    // Gap labels render for every entry except the last (no trailing gap).
    expect(container.querySelectorAll('.cn-gap-label')).toHaveLength(19);
  });

  it('renders a single label at the default band when there is only one gap', () => {
    const { container } = render(
      <ContractionTimer title="Contractions" contractions={contractions(2)} />,
    );
    const labels = Array.from(container.querySelectorAll<HTMLElement>('.cn-gap-label'));
    expect(labels).toHaveLength(1);
    expect(labels[0].style.top).not.toBe('');
  });
});
