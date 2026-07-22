import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PrayerTimes } from '../src/canvas/blocks/everyday/PrayerTimes';
import type { PrayerSlot } from '../src/canvas/blocks/everyday/types';

// Regression coverage for a real bug: the sun-arc's slot labels used a fixed font size and were
// centred on evenly-spaced points along a fixed-width viewBox with no regard for how much
// horizontal room each label actually gets. That's fine for the five-salah demo fixture, but a
// longer schedule (10+ canonical hours, a multi-service list) packs points close enough that
// same-size labels collide, and a long slot name runs past the viewBox edge horizontally.

const VB_W = 320; // must track PrayerTimes.tsx's internal VB_W — arc is fixed-viewBox, not measured live.

function slots(n: number, nameLen = 6): PrayerSlot[] {
  // Spread times evenly across the day so every slot lands at a distinct arc position.
  return Array.from({ length: n }, (_, i) => {
    const mins = Math.round((i * (23 * 60)) / (n - 1 || 1));
    const h = Math.floor(mins / 60)
      .toString()
      .padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return {
      name: `Slot${i}`.padEnd(nameLen, 'x'),
      time: `${h}:${m}`,
    };
  });
}

function nameNodes(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGTextElement>('text.pt-name'));
}

describe('PrayerTimes', () => {
  it('renders the demo-sized fixture with the base label size, untruncated', () => {
    const { container } = render(<PrayerTimes slots={slots(5)} />);
    const names = nameNodes(container);
    expect(names).toHaveLength(5);
    for (const n of names) {
      expect(n.getAttribute('font-size')).toBe('11');
    }
  });

  it.each([10, 16])(
    'shrinks label font size as slot count grows to %i, instead of holding a fixed size',
    (n) => {
      const { container } = render(<PrayerTimes slots={slots(n)} />);
      const names = nameNodes(container);
      expect(names).toHaveLength(n);
      const size = Number(names[0].getAttribute('font-size'));
      // Must have shrunk below the small-count baseline (11px) so labels don't collide once
      // there's far less horizontal room per slot.
      expect(size).toBeLessThan(11);
      // Every label shares the same size — no per-label special-casing left over.
      for (const el of names) {
        expect(Number(el.getAttribute('font-size'))).toBe(size);
      }
    },
  );

  it('truncates a slot name too long for its shrunk label budget, keeping the full text as a tooltip', () => {
    const long: PrayerSlot[] = [
      { name: 'First Vespers of Sunday', time: '5:00 AM' },
      { name: 'Morning Prayer', time: '7:15 AM' },
      { name: 'Midday Office', time: '12:00 PM' },
      { name: 'Evening Vespers', time: '6:30 PM' },
      { name: 'Night Compline', time: '9:45 PM' },
      { name: 'Vigil', time: '2:00 AM' },
      { name: 'Terce', time: '9:00 AM' },
      { name: 'Sext', time: '12:00 PM' },
      { name: 'None', time: '3:00 PM' },
      { name: 'Second Vespers of the Feast', time: '7:00 PM' },
    ];
    const { container } = render(<PrayerTimes slots={long} />);
    const names = nameNodes(container);
    expect(names).toHaveLength(10);

    // No rendered label may be long enough to spill into a neighbour: at 10 slots the arc gives
    // each label a fraction of its ~276px usable width, so the visible text must stay short.
    for (const el of names) {
      const visible = Array.from(el.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join('');
      expect(visible.length).toBeLessThanOrEqual(9);
    }

    // The longest names were actually shortened, and the untruncated string survives as a
    // native <title> tooltip rather than being silently lost.
    const longest = names.find((el) => el.textContent?.includes('First Vespers'));
    expect(longest).toBeTruthy();
    const title = longest!.querySelector('title');
    expect(title?.textContent).toBe('First Vespers of Sunday');
  });

  it('keeps the whole arc within its fixed viewBox regardless of slot count', () => {
    const { container } = render(<PrayerTimes slots={slots(16, 10)} />);
    const svg = container.querySelector('svg.pt-arc');
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${VB_W} 150`);
    // Dots must land within the arc's horizontal padding, not clipped off either edge.
    const dots = Array.from(container.querySelectorAll<SVGCircleElement>('circle.pt-dot'));
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      const cx = Number(dot.getAttribute('cx'));
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(VB_W);
    }
  });
});
