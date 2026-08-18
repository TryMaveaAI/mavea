// canvas-scan-scope.test.ts — the card grid's two interaction hooks (accessible scroll regions,
// truncated-text disclosures) rescan on DOM mutations. A streamed answer inserts blocks one at a
// time, so these cases pin the two properties that keep a long turn cheap: an appended card is
// processed WITHOUT re-walking the cards already on the grid, and a removed card's bookkeeping is
// dropped mid-answer instead of pinning the detached DOM (and its listeners) until unmount.
//
// The scans run on requestAnimationFrame; fake timers drive them exactly instead of waiting on
// the real clock. Microtasks stay real so MutationObserver delivery is untouched.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAccessibleScrollRegions } from '../src/canvas/hooks/useAccessibleScrollRegions';
import { useTruncatedTextDisclosures } from '../src/canvas/hooks/useTruncatedTextDisclosures';

/** Let pending mutation records deliver (microtask), then run the scheduled rAF scan. */
async function flushScan(): Promise<void> {
  await vi.advanceTimersByTimeAsync(32);
}

/** jsdom computes no layout, so overflow is staged: geometry via property overrides, overflow-x
 * inline so getComputedStyle reports it. */
function makeOverflow(el: HTMLElement): void {
  el.style.overflowX = 'auto';
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: 200 });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: 400 });
}

/** A non-overflowing element whose scrollWidth getter counts reads. The scan's geometry check
 * touches scrollWidth for every element it walks, so the count reveals whether a card was
 * re-walked at all. */
function countScrollWidthReads(el: HTMLElement): { reads: number } {
  const counter = { reads: 0 };
  Object.defineProperty(el, 'scrollWidth', {
    configurable: true,
    get() {
      counter.reads += 1;
      return 0;
    },
  });
  return counter;
}

function scrollCard(name: string): { card: HTMLElement; scroller: HTMLElement } {
  const card = document.createElement('div');
  card.className = 'card';
  const eyebrow = document.createElement('div');
  eyebrow.className = 'card-eyebrow';
  eyebrow.textContent = name;
  const scroller = document.createElement('div');
  makeOverflow(scroller);
  card.append(eyebrow, scroller);
  return { card, scroller };
}

function labelCard(visible: string, full: string): { card: HTMLElement; label: HTMLElement } {
  const card = document.createElement('div');
  card.className = 'card';
  const label = document.createElement('span');
  label.textContent = visible;
  label.setAttribute('title', full);
  card.append(label);
  return { card, label };
}

let host: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  vi.useRealTimers();
  host.remove();
});

describe('useAccessibleScrollRegions', () => {
  it('enhances an appended card without re-walking the cards already on the grid', async () => {
    const first = scrollCard('First card');
    const sentinel = document.createElement('div');
    first.card.appendChild(sentinel);
    const reads = countScrollWidthReads(sentinel);
    host.appendChild(first.card);

    const ref = { current: host };
    const hook = renderHook(() => useAccessibleScrollRegions(ref, 'r1'));
    await flushScan();
    expect(first.scroller.getAttribute('role')).toBe('region');
    expect(first.scroller.tabIndex).toBe(0);
    expect(first.scroller.getAttribute('aria-label')).toContain('First card');
    expect(first.scroller.classList.contains('canvas-hscroll')).toBe(true);
    expect(reads.reads).toBeGreaterThan(0);
    const readsAfterMount = reads.reads;

    const second = scrollCard('Second card');
    host.appendChild(second.card);
    await flushScan();
    expect(second.scroller.getAttribute('role')).toBe('region');
    expect(second.scroller.getAttribute('aria-label')).toContain('Second card');
    // The append was scoped to the new card: nothing re-read the first card's geometry.
    expect(reads.reads).toBe(readsAfterMount);
    hook.unmount();
  });

  it('undoes a removed card mid-answer instead of holding it until unmount', async () => {
    const first = scrollCard('First card');
    host.appendChild(first.card);
    const ref = { current: host };
    const hook = renderHook(() => useAccessibleScrollRegions(ref, 'r1'));
    await flushScan();
    expect(first.scroller.classList.contains('canvas-hscroll')).toBe(true);

    first.card.remove();
    await flushScan();
    expect(first.scroller.classList.contains('canvas-hscroll')).toBe(false);
    expect(first.scroller.hasAttribute('role')).toBe(false);
    expect(first.scroller.hasAttribute('tabindex')).toBe(false);
    expect(first.scroller.hasAttribute('aria-label')).toBe(false);
    hook.unmount();
  });
});

describe('useTruncatedTextDisclosures', () => {
  it('discloses an appended card without re-inspecting the cards already on the grid', async () => {
    const first = labelCard('Quarterly revenue by seg…', 'Quarterly revenue by segment and region');
    host.appendChild(first.card);
    const ref = { current: host };
    const hook = renderHook(() => useTruncatedTextDisclosures(ref, 'r1'));
    await flushScan();
    expect(first.label.getAttribute('data-text-disclosure')).toBe('true');
    expect(first.label.getAttribute('role')).toBe('button');
    expect(first.label.getAttribute('aria-label')).toBe('Quarterly revenue by segment and region');

    const styleSpy = vi.spyOn(window, 'getComputedStyle');
    const second = labelCard(
      'Latency at the 99th perc…',
      'Latency at the 99th percentile by service',
    );
    host.appendChild(second.card);
    await flushScan();
    expect(second.label.getAttribute('data-text-disclosure')).toBe('true');
    expect(second.label.getAttribute('aria-label')).toBe(
      'Latency at the 99th percentile by service',
    );
    // Every inked element a scan visits pays a style read, so the spy maps the walk: the append
    // touched only the new card's subtree, never the first card's.
    const styled = styleSpy.mock.calls.map(([el]) => el);
    expect(styled.length).toBeGreaterThan(0);
    expect(styled.some((el) => first.card.contains(el))).toBe(false);
    expect(styled.some((el) => second.card.contains(el))).toBe(true);
    styleSpy.mockRestore();
    hook.unmount();
    expect(document.querySelector('.canvas-text-popover')).toBeNull();
  });

  it('releases a removed card mid-answer instead of holding six listeners until unmount', async () => {
    const first = labelCard('Quarterly revenue by seg…', 'Quarterly revenue by segment and region');
    host.appendChild(first.card);
    const ref = { current: host };
    const hook = renderHook(() => useTruncatedTextDisclosures(ref, 'r1'));
    await flushScan();
    expect(first.label.getAttribute('data-text-disclosure')).toBe('true');

    first.card.remove();
    await flushScan();
    expect(first.label.hasAttribute('data-text-disclosure')).toBe(false);
    expect(first.label.hasAttribute('tabindex')).toBe(false);
    expect(first.label.hasAttribute('role')).toBe(false);
    expect(first.label.hasAttribute('aria-label')).toBe(false);
    expect(first.label.hasAttribute('aria-describedby')).toBe(false);
    hook.unmount();
  });
});
