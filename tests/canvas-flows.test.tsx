import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChronologicalTimeline } from '../src/canvas/blocks/flows/ChronologicalTimeline';
import { MilestoneTrack } from '../src/canvas/blocks/flows/MilestoneTrack';
import { SkillTree } from '../src/canvas/blocks/flows/SkillTree';
import type { ChronoEvent, Milestone, SkillNode } from '../src/canvas/blocks/flows/types';

// Regression coverage for a real bug: date labels under each axis marker had no width
// constraint or overflow handling, sized for the ~5-6 short-date demo fixture ("1969", "Q3").
// A longer date string, or a denser event list packing markers closer together, both make
// neighboring `.fl-ct-date` labels collide and become illegible.
describe('ChronologicalTimeline', () => {
  function events(n: number, dateFactory: (i: number) => string): ChronoEvent[] {
    return Array.from({ length: n }, (_, i) => ({
      at: i,
      date: dateFactory(i),
      title: `Event ${i + 1}`,
      detail: `Detail for event ${i + 1}`,
    }));
  }

  it('shrinks the per-marker date width as event count grows past the demo-sized fixture', () => {
    const { container: small } = render(
      <ChronologicalTimeline title="History" events={events(4, (i) => `Q${i + 1}`)} />,
    );
    const { container: big } = render(
      <ChronologicalTimeline title="History" events={events(14, (i) => `Q${i + 1}`)} />,
    );

    const smallWidth = Number(
      small
        .querySelector<HTMLButtonElement>('.fl-ct-mark')!
        .style.getPropertyValue('--dw')
        .replace('px', ''),
    );
    const bigWidth = Number(
      big
        .querySelector<HTMLButtonElement>('.fl-ct-mark')!
        .style.getPropertyValue('--dw')
        .replace('px', ''),
    );

    // A dense timeline must claim a narrower per-marker slice than a sparse one — otherwise
    // adjacent date labels bleed into each other.
    expect(bigWidth).toBeLessThan(smallWidth);
    // ...but never collapse to unreadable/zero — there's a floor.
    expect(bigWidth).toBeGreaterThan(0);
  });

  it('preserves the full date as a tooltip when the string is longer than the demo fixture', () => {
    const longDates = events(5, (i) => `September ${i + 1}, 1969 — full announcement`);
    const { container } = render(<ChronologicalTimeline title="History" events={longDates} />);
    const labels = Array.from(container.querySelectorAll<HTMLSpanElement>('.fl-ct-date'));
    expect(labels).toHaveLength(5);
    for (const label of labels) {
      // The rendered text and the tooltip must match exactly — a truncating CSS rule (max-width
      // + ellipsis) clips the on-screen box without silently losing the full string.
      expect(label.getAttribute('title')).toBe(label.textContent);
      expect(label.getAttribute('title')?.length).toBeGreaterThan(20);
    }
  });

  it('renders every marker at a distinct axis position without duplicated slots', () => {
    const n = 12;
    const { container } = render(
      <ChronologicalTimeline title="History" events={events(n, (i) => `Y${i}`)} />,
    );
    const marks = Array.from(container.querySelectorAll<HTMLButtonElement>('.fl-ct-mark'));
    expect(marks).toHaveLength(n);
    const lefts = marks.map((m) => m.style.left);
    expect(new Set(lefts).size).toBe(n);
  });
});

// Regression coverage for a real bug: milestone point buttons used a fixed 80px width with
// translateX(-50%) centering, sized for the ~5-6 item demo fixture. With 10+ milestones, each
// point's slice of the track shrinks well below 80px, so neighboring captions overlapped and
// became illegible.
describe('MilestoneTrack', () => {
  function track(n: number): Milestone[] {
    return Array.from({ length: n }, (_, i) => ({
      label: `Milestone number ${i + 1} with a fairly long descriptive name`,
      date: `Q${(i % 4) + 1}`,
      status: i === 0 ? 'done' : i === n - 1 ? 'todo' : 'active',
    }));
  }

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

// Regression coverage for a real bug: node buttons were capped at a fixed `max-width: 38%`,
// which only fit the 2-3-item-per-tier demo fixture. A tier with 4+ nodes (or a tier with
// long labels) needs each node's max-width to shrink with its actual band size, or adjacent
// buttons overlap illegibly.
describe('SkillTree', () => {
  function wideBand(n: number): SkillNode[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      label: `Skill ${i + 1} Long Name`,
      tier: 0,
      state: 'unlocked' as const,
    }));
  }

  it('shrinks each node max-width to its band share instead of a fixed 38%', () => {
    const { container } = render(<SkillTree title="Tree" nodes={wideBand(5)} />);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.fl-sk-node'));
    expect(buttons).toHaveLength(5);
    for (const b of buttons) {
      const maxW = b.style.getPropertyValue('--max-node-w');
      expect(maxW).not.toBe('');
      const pct = parseFloat(maxW);
      // 5 nodes in one band: an even share is 20% each. A fixed 38% cap would let each
      // button claim nearly double its slot and collide with its neighbors.
      expect(pct).toBeLessThan(38);
      expect(pct).toBeGreaterThan(0);
    }
  });

  it('keeps a small band close to its old fixed-width footprint', () => {
    const { container } = render(<SkillTree title="Tree" nodes={wideBand(2)} />);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.fl-sk-node'));
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      const pct = parseFloat(b.style.getPropertyValue('--max-node-w'));
      // Two nodes share a row generously — the cap should stay well clear of overlap (< 50%
      // combined would guarantee no touch) while still being roomier than a crowded 5-up row.
      expect(pct).toBeLessThanOrEqual(50);
      expect(pct).toBeGreaterThan(20);
    }
  });

  it('never lets a node claim the whole band width, even with just one node in a tier', () => {
    const { container } = render(
      <SkillTree
        title="Tree"
        nodes={[{ id: 'solo', label: 'Solo Skill With A Very Long Descriptive Name', tier: 0 }]}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>('.fl-sk-node')!;
    const pct = parseFloat(button.style.getPropertyValue('--max-node-w'));
    // A lone node in a sparse band must still be floored well under 100% so its pill never
    // spans the full card edge-to-edge.
    expect(pct).toBeLessThanOrEqual(60);
  });

  it('sizes independent multi-tier bands by their own counts, not a shared global count', () => {
    const nodes: SkillNode[] = [
      ...wideBand(2).map((n) => ({ ...n, tier: 0 })),
      ...wideBand(6).map((n, i) => ({ ...n, id: `t1-${i}`, tier: 1 })),
    ];
    const { container } = render(<SkillTree title="Tree" nodes={nodes} />);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.fl-sk-node'));
    expect(buttons).toHaveLength(8);
    const tier0Max = Math.max(
      ...buttons.slice(0, 2).map((b) => parseFloat(b.style.getPropertyValue('--max-node-w'))),
    );
    const tier1Max = Math.max(
      ...buttons.slice(2).map((b) => parseFloat(b.style.getPropertyValue('--max-node-w'))),
    );
    // The crowded 6-up tier must be capped tighter than the roomy 2-up tier.
    expect(tier1Max).toBeLessThan(tier0Max);
  });
});
