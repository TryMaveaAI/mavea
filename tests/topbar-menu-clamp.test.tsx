import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopbarMenu, type TopbarMenuItem } from '../src/live/TopbarMenu';

// The topbar dropdowns are right-anchored to their trigger (CSS `right: 0`). For a leftmost
// category (Create) on a narrow bar that pushed the panel's left edge off-screen — the menu items
// were clipped. TopbarMenu now measures the opened panel and nudges it back inside the viewport's
// left margin. jsdom has no layout, so we feed it the geometry: a trigger near the left edge with a
// panel wider than the space must gain a positive translateX; one with room must gain none.

const ITEMS: TopbarMenuItem[] = [
  { label: 'New', blurb: 'Start a fresh session', onClick: () => {}, show: true },
  { label: 'Dashboard', blurb: 'Turn this into a dashboard', onClick: () => {}, show: true },
];

function mockGeometry(triggerRight: number, panelWidth: number): void {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('more-menu') ? panelWidth : 0;
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const right = this.classList.contains('more-menu-root') ? triggerRight : 0;
    return { right, left: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} };
  });
}

describe('TopbarMenu viewport clamp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error — drop the offsetWidth override so other suites see jsdom's default.
    delete HTMLElement.prototype.offsetWidth;
    cleanup();
  });

  it('nudges a leftmost menu back on-screen when it would overflow the left edge', () => {
    // Trigger's right edge at 260px, panel 320px wide → natural left = -60px (off-screen).
    mockGeometry(260, 320);
    const { getByRole, container } = render(<TopbarMenu label="Create" items={ITEMS} />);
    fireEvent.click(getByRole('button', { name: /Create/ }));

    const panel = container.querySelector<HTMLElement>('.more-menu');
    expect(panel).not.toBeNull();
    const shift = parseFloat(
      /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(panel!.style.transform)?.[1] ?? '0',
    );
    expect(shift).toBeGreaterThan(0); // pushed right, back into view
  });

  it('leaves a menu with room to the left untouched', () => {
    // Trigger's right edge at 900px, panel 320px wide → natural left = 580px (well inside).
    mockGeometry(900, 320);
    const { getByRole, container } = render(<TopbarMenu label="Explore" items={ITEMS} />);
    fireEvent.click(getByRole('button', { name: /Explore/ }));

    const panel = container.querySelector<HTMLElement>('.more-menu');
    expect(panel).not.toBeNull();
    expect(panel!.style.transform).toBe(''); // no nudge needed
  });
});
