import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChronologicalTimeline } from '../src/canvas/blocks/flows/ChronologicalTimeline';
import type { ChronoEvent } from '../src/canvas/blocks/flows/types';

// Regression coverage for a real bug: date labels under each axis marker had no width
// constraint or overflow handling, sized for the ~5-6 short-date demo fixture ("1969", "Q3").
// A longer date string, or a denser event list packing markers closer together, both make
// neighboring `.fl-ct-date` labels collide and become illegible.

function events(n: number, dateFactory: (i: number) => string): ChronoEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    at: i,
    date: dateFactory(i),
    title: `Event ${i + 1}`,
    detail: `Detail for event ${i + 1}`,
  }));
}

describe('ChronologicalTimeline', () => {
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
