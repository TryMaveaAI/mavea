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

describe('StoryArc axis labels', () => {
  const stageRows = (container: HTMLElement) => {
    // Freytag draws the axis as a baseline; three-act marks it only where its act dividers end.
    const axis =
      container.querySelector('.sa-baseline')?.getAttribute('y1') ??
      container.querySelector('.sa-transition')?.getAttribute('y2');
    const base = Number(axis);
    return {
      base,
      labels: [...container.querySelectorAll('text.sa-stage-lbl')].map((n) => ({
        y: Number(n.getAttribute('y')),
        anchor: n.getAttribute('text-anchor'),
      })),
    };
  };

  it.each(['freytag', 'threeact'] as const)(
    'sets %s stage names just under the baseline, all centred on their points',
    (framework) => {
      const { container } = render(<StoryArc title="Arc" framework={framework} beats={[]} />);
      const { base, labels } = stageRows(container);
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) {
        // Within two label rows of the axis, never pinned down at the foot of the frame.
        expect(l.y).toBeGreaterThan(base);
        expect(l.y - base).toBeLessThanOrEqual(14 + 11);
        expect(l.anchor).toBe('middle');
      }
    },
  );

  it('sets Freytag beat names on the open side of the slope they sit on', () => {
    const { container } = render(
      <StoryArc
        title="Arc"
        framework="freytag"
        beats={[
          { stage: 'Rising Action', label: 'Rise' },
          { stage: 'Climax', label: 'Peak' },
          { stage: 'Falling Action', label: 'Fall' },
        ]}
      />,
    );
    const anchor = (text: string) =>
      [...container.querySelectorAll('text.sa-beat-lbl')]
        .find((n) => n.textContent === text)
        ?.getAttribute('text-anchor');
    expect(anchor('Rise')).toBe('end');
    expect(anchor('Peak')).toBe('middle');
    expect(anchor('Fall')).toBe('start');
  });
});
