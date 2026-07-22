import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MilestoneTrack } from '../src/canvas/blocks/flows/MilestoneTrack';
import type { Milestone } from '../src/canvas/blocks/flows/types';

// Regression coverage for a real bug: milestone point buttons used a fixed 80px width with
// translateX(-50%) centering, sized for the ~5-6 item demo fixture. With 10+ milestones, each
// point's slice of the track shrinks well below 80px, so neighboring captions overlapped and
// became illegible.

function track(n: number): Milestone[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `Milestone number ${i + 1} with a fairly long descriptive name`,
    date: `Q${(i % 4) + 1}`,
    status: i === 0 ? 'done' : i === n - 1 ? 'todo' : 'active',
  }));
}

describe('MilestoneTrack', () => {
  it('shrinks point width as milestone count grows past the demo-sized fixture', () => {
    const { container: small } = render(<MilestoneTrack title="Plan" milestones={track(4)} />);
    const { container: big } = render(<MilestoneTrack title="Plan" milestones={track(14)} />);

    const smallWidth = Number(
      small
        .querySelector<HTMLButtonElement>('.fl-ms-point')!
        .style.getPropertyValue('--w')
        .replace('px', ''),
    );
    const bigWidth = Number(
      big
        .querySelector<HTMLButtonElement>('.fl-ms-point')!
        .style.getPropertyValue('--w')
        .replace('px', ''),
    );

    // A dense track must claim a narrower per-point slice than a sparse one — otherwise
    // adjacent captions bleed into each other exactly as the fixed-80px bug did.
    expect(bigWidth).toBeLessThan(smallWidth);
    // ...but never collapse to unreadable/zero — there's a floor.
    expect(bigWidth).toBeGreaterThan(0);
  });

  it('renders every milestone point without duplicated/overlapping slice positions', () => {
    const n = 12;
    const { container } = render(<MilestoneTrack title="Plan" milestones={track(n)} />);
    const points = Array.from(container.querySelectorAll<HTMLButtonElement>('.fl-ms-point'));
    expect(points).toHaveLength(n);

    // Each point sits at a distinct percentage along the line — none share a slot.
    const lefts = points.map((p) => p.style.left);
    expect(new Set(lefts).size).toBe(n);
  });

  it('clips long labels to one line with a tooltip once the track is too dense to wrap', () => {
    const { container } = render(<MilestoneTrack title="Plan" milestones={track(12)} />);
    const labels = Array.from(container.querySelectorAll<HTMLSpanElement>('.fl-ms-label'));
    expect(labels).toHaveLength(12);
    for (const label of labels) {
      // Single-line ellipsis, not multi-line wrap, once there's no room left in the shrunken box.
      expect(label.classList.contains('is-clipped')).toBe(true);
      // The full text must not be silently lost — it survives as a native tooltip.
      expect(label.getAttribute('title')).toBe(label.textContent);
    }
  });

  it('leaves a small, demo-sized track unclipped and untitled', () => {
    const { container } = render(<MilestoneTrack title="Plan" milestones={track(4)} />);
    const labels = Array.from(container.querySelectorAll<HTMLSpanElement>('.fl-ms-label'));
    expect(labels).toHaveLength(4);
    for (const label of labels) {
      expect(label.classList.contains('is-clipped')).toBe(false);
      expect(label.hasAttribute('title')).toBe(false);
    }
  });
});
