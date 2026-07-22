import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StoryArc } from '../src/canvas/blocks/layout/StoryArc';
import type { ArcBeat } from '../src/canvas/blocks/layout/types';

// Regression coverage for a real bug: beat labels are pinned next to their stage marker at a
// fixed pixel offset with no wrap or length constraint, so a beat label longer than the demo
// fixture's short words ("Climax", "Debate") rendered far wider than its neighbours' spacing
// and collided with the tension curve, adjacent pins, or stage labels. Every rendered beat
// label must stay under a fixed character budget so it never grows past its slot.

const LONG_LABEL = 'A dramatically overlong beat description that keeps going and going';

const BEAT_LABEL_MAX = 22;

function longBeats(stages: readonly string[]): ArcBeat[] {
  return stages.map((stage) => ({ stage, label: LONG_LABEL }));
}

describe('StoryArc', () => {
  it.each([
    ['freytag', ['Exposition', 'Climax', 'Dénouement']],
    ['threeact', ['Act I — Setup', 'Act III — Resolution']],
    ['herojourney', ['Ordinary World', 'Ordeal', 'Return']],
    ['savethecat', ['Opening Image', 'Midpoint', 'Final Image']],
  ] as const)('truncates long beat labels instead of overflowing for %s', (framework, stages) => {
    const { container } = render(
      <StoryArc title="Arc" framework={framework} beats={longBeats(stages)} />,
    );
    const labels = Array.from(container.querySelectorAll('text.sa-beat-lbl'));
    expect(labels.length).toBeGreaterThan(0);
    for (const node of labels) {
      // Only the node's own direct text (a nested <title> tooltip carries the untruncated
      // string and is part of textContent too, so it must be excluded from the visible check).
      const visible = Array.from(node.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join('');
      expect(visible.length).toBeLessThanOrEqual(BEAT_LABEL_MAX);
      expect(visible.endsWith('…')).toBe(true);
    }
    // The full text survives as a native tooltip, same as EtymTree's truncation pattern.
    const titles = Array.from(container.querySelectorAll('text.sa-beat-lbl title')).map(
      (t) => t.textContent,
    );
    expect(titles.length).toBeGreaterThan(0);
    expect(titles).toContain(LONG_LABEL);
  });

  it('leaves a short beat label untouched', () => {
    const { container } = render(
      <StoryArc
        title="Arc"
        framework="freytag"
        beats={[{ stage: 'Climax', label: 'Big twist' }]}
      />,
    );
    const label = container.querySelector('text.sa-beat-lbl');
    expect(label?.textContent).toBe('Big twist');
    expect(container.querySelector('text.sa-beat-lbl title')).toBeNull();
  });
});
