import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Contextmenu } from '../src/canvas/blocks/overlays/Contextmenu';
import type { MenuItem } from '../src/canvas/blocks/overlays/types';

// Regression coverage for a real bug: the pointer-position clamp in openAt() assumed the menu
// is always 196px wide (`host.width - 196`), but .ov-ctx only had a min-width — long item
// labels grew it past that assumed width, so the clamp under-corrected and the menu still
// overflowed past the host's right edge. The fix pins an explicit max-width on the menu and
// truncates label text to match, so both the clamp math and the rendered box stay in sync.

const HOST_WIDTH = 260;
const HOST_LEFT = 0;

function stubHostRect(host: HTMLElement) {
  host.getBoundingClientRect = () =>
    ({
      width: HOST_WIDTH,
      height: 160,
      top: 0,
      left: HOST_LEFT,
      right: HOST_LEFT + HOST_WIDTH,
      bottom: 160,
      x: HOST_LEFT,
      y: 0,
      toJSON() {},
    }) as DOMRect;
}

const LONG_ITEMS: MenuItem[] = [
  { label: 'Open in a brand-new dedicated browser tab', icon: 'external' as const },
  { label: 'Rename this file to something much longer', icon: 'edit' as const },
  { label: 'Copy the shareable link to clipboard now', icon: 'link' as const },
];

describe('Contextmenu', () => {
  it('caps the menu at the assumed clamp width even with long item labels', () => {
    const { container } = render(<Contextmenu title="Files" items={LONG_ITEMS} />);
    const host = container.querySelector('.ov-ctx-host') as HTMLElement;
    stubHostRect(host);

    // Open near the host's right edge — the exact spot where an unclamped, unbounded-width
    // menu would spill past the host boundary.
    const zone = container.querySelector('.ov-ctx-zone') as HTMLElement;
    fireEvent.click(zone, { clientX: HOST_WIDTH - 10, clientY: 20 });

    const menu = container.querySelector('.ov-ctx') as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.style.maxWidth).toBe('196px');

    // The clamped left position plus the capped width must stay within the host's box —
    // this is exactly what a fixed-196px clamp against an unbounded-width menu violated.
    const left = Number.parseFloat(menu.style.left);
    expect(left + 196).toBeLessThanOrEqual(HOST_WIDTH);

    // Every label must be set up to truncate rather than stretch the row wider than the menu.
    const labels = Array.from(menu.querySelectorAll<HTMLElement>('.ov-menu-text'));
    expect(labels).toHaveLength(LONG_ITEMS.length);
    for (const label of labels) {
      expect(label.style.whiteSpace).toBe('nowrap');
      expect(label.style.overflow).toBe('hidden');
      expect(label.style.textOverflow).toBe('ellipsis');
    }
  });

  it('still opens and clamps sanely with the short default items', () => {
    const { container } = render(<Contextmenu title="Files" />);
    const host = container.querySelector('.ov-ctx-host') as HTMLElement;
    stubHostRect(host);

    const zone = container.querySelector('.ov-ctx-zone') as HTMLElement;
    fireEvent.click(zone, { clientX: 40, clientY: 20 });

    const menu = container.querySelector('.ov-ctx') as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.style.maxWidth).toBe('196px');
    const left = Number.parseFloat(menu.style.left);
    expect(left + 196).toBeLessThanOrEqual(HOST_WIDTH);
  });
});
