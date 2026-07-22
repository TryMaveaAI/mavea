import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Gantt } from '../src/canvas/blocks/charts2/Gantt';
import type { GanttTask } from '../src/canvas/blocks/charts2/types';

// Regression coverage for a real bug: the hover tooltip was centered on the task bar via
// `left: ${left + width / 2}%` with no clamping, so a bar sitting near the timeline's right
// edge (start + span close to the column count) centered its tooltip past 100% — clipped by
// the card's overflow:hidden. Any task whose bar extends to (or past) the last column must
// still produce a tooltip that stays inside the track.

// Ten columns — wider than the ~5-6 column demo fixture — so a last-column bar's unclamped
// center (100 - 50/n percent) actually lands past the 92% clamp bound and would fail the
// assertion below without the fix, rather than happening to still fit by coincidence.
const cols = Array.from({ length: 10 }, (_, i) => `W${i + 1}`);

function tasksEndingAt(lastCol: number): GanttTask[] {
  return [
    { name: 'Kickoff', start: 0, span: 1, pct: 100 },
    // Flush against the right edge — the exact shape that overflowed before clamping.
    { name: 'Final rollout', start: lastCol, span: 1, pct: 40 },
  ];
}

describe('Gantt', () => {
  it('keeps the hover tooltip left offset within the track for a bar flush against the right edge', () => {
    const { container } = render(
      <Gantt title="Plan" cols={cols} tasks={tasksEndingAt(cols.length - 1)} />,
    );
    const bars = Array.from(container.querySelectorAll<HTMLButtonElement>('.c2-gantt-bar'));
    expect(bars).toHaveLength(2);
    const lastBar = bars[bars.length - 1];

    fireEvent.mouseEnter(lastBar);
    const tip = container.querySelector<HTMLElement>('.c2-gantt-tip');
    expect(tip).toBeTruthy();

    // The tooltip is centered via `transform: translateX(-50%)`, so its `left` percentage must
    // stay clear of both edges — otherwise half of it renders outside the card and gets clipped.
    const leftPct = parseFloat(tip!.style.left);
    expect(leftPct).toBeGreaterThanOrEqual(8);
    expect(leftPct).toBeLessThanOrEqual(92);
  });

  it('still centers the tooltip over bars nowhere near an edge', () => {
    const midTasks: GanttTask[] = [{ name: 'Design', start: 2, span: 1, pct: 60 }];
    const { container } = render(<Gantt title="Plan" cols={cols} tasks={midTasks} />);
    const bar = container.querySelector<HTMLButtonElement>('.c2-gantt-bar')!;
    fireEvent.mouseEnter(bar);
    const tip = container.querySelector<HTMLElement>('.c2-gantt-tip')!;
    const unit = 100 / cols.length;
    const expectedCenter = 2 * unit + unit / 2;
    expect(parseFloat(tip.style.left)).toBeCloseTo(expectedCenter, 5);
  });

  it('clamps every task in a long, edge-hugging schedule without leaving the track', () => {
    // A larger task list than the ~2-task demo fixture, deliberately packing tasks across the
    // full width including both extremes, to catch any per-index regression in the clamp.
    const longCols = Array.from({ length: 10 }, (_, i) => `Week ${i + 1}`);
    const tasks: GanttTask[] = Array.from({ length: 10 }, (_, i) => ({
      name: `Task ${i + 1}`,
      start: i,
      span: 1,
      pct: 50,
    }));
    const { container } = render(<Gantt title="Plan" cols={longCols} tasks={tasks} />);
    const bars = Array.from(container.querySelectorAll<HTMLButtonElement>('.c2-gantt-bar'));
    expect(bars).toHaveLength(10);

    for (const bar of bars) {
      fireEvent.mouseEnter(bar);
      const tip = container.querySelector<HTMLElement>('.c2-gantt-tip')!;
      const leftPct = parseFloat(tip.style.left);
      expect(leftPct).toBeGreaterThanOrEqual(8);
      expect(leftPct).toBeLessThanOrEqual(92);
      fireEvent.mouseLeave(bar);
    }
  });
});
