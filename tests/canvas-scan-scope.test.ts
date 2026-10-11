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
import {
  ENTRANCE_SETTLE_MS,
  useAccessibleScrollRegions,
} from '../src/canvas/hooks/useAccessibleScrollRegions';
import { useTruncatedTextDisclosures } from '../src/canvas/hooks/useTruncatedTextDisclosures';

/** Let pending mutation records deliver (microtask), then run the scheduled rAF scan. */
async function flushScan(): Promise<void> {
  await vi.advanceTimersByTimeAsync(32);
}

/** Let a card's entrance go quiet, then run the rescan it owes. */
async function settleEntrance(): Promise<void> {
  await vi.advanceTimersByTimeAsync(ENTRANCE_SETTLE_MS + 32);
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

function svgWithSmallLabel(
  scroller: HTMLElement,
  label: string,
  nestedSize?: number,
  size: { width: number; height: number } = { width: 200, height: 100 },
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 400 200');
  svg.getBoundingClientRect = () =>
    ({
      width: size.width,
      height: size.height,
      left: 0,
      top: 0,
      right: size.width,
      bottom: size.height,
    }) as DOMRect;
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.style.fontSize = '10px';
  text.getScreenCTM = () => ({ a: 0.5, b: 0, c: 0, d: 0.5 }) as unknown as DOMMatrix;
  if (nestedSize) {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.textContent = label;
    tspan.style.fontSize = `${nestedSize}px`;
    tspan.getScreenCTM = text.getScreenCTM;
    text.append(tspan);
  } else {
    text.textContent = label;
  }
  svg.append(text);
  scroller.append(svg);
  return svg;
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

  it('keeps SVG labels legible through one shared accessible pan region', async () => {
    const scroller = document.createElement('div');
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(scroller, 'scrollWidth', {
      configurable: true,
      get: () =>
        Math.max(
          200,
          ...[...scroller.querySelectorAll('svg')].map(
            (svg) => parseFloat(svg.style.minWidth) || 0,
          ),
        ),
    });
    const first = svgWithSmallLabel(scroller, 'First axis');
    const second = svgWithSmallLabel(scroller, 'Second axis', 5);
    host.append(scroller);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'svg'));
    await flushScan();

    expect(parseFloat(first.style.minWidth)).toBeGreaterThanOrEqual(364);
    expect(parseFloat(first.style.minHeight)).toBeGreaterThanOrEqual(182);
    expect(parseFloat(second.style.minWidth)).toBeGreaterThanOrEqual(728);
    expect(parseFloat(second.style.minHeight)).toBeGreaterThanOrEqual(364);
    expect(first.hasAttribute('data-legibility-guard')).toBe(true);
    expect(scroller.classList.contains('canvas-svg-scroll')).toBe(true);
    expect(scroller.classList.contains('canvas-hscroll')).toBe(true);
    expect(scroller.getAttribute('role')).toBe('region');
    expect(scroller.tabIndex).toBe(0);

    first.remove();
    await flushScan();
    // Both diagrams share this viewport. Removing one must not tear down the other's guard.
    expect(scroller.classList.contains('canvas-svg-scroll')).toBe(true);
    expect(second.hasAttribute('data-legibility-guard')).toBe(true);

    second.remove();
    await flushScan();
    expect(scroller.classList.contains('canvas-svg-scroll')).toBe(false);
    hook.unmount();
  });

  // A streamgraph 17px short of legible in a 700px window turned its whole card — eyebrow,
  // title and prose — into a sideways scroller. The card's padding holds that much; only a
  // figure the padding cannot hold is panned, and a card that narrows past it falls back.
  it('widens a figure into its card padding instead of panning a few pixels', async () => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '0 22px';
    let width = 642;
    Object.defineProperty(card, 'clientWidth', { configurable: true, get: () => width });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 540 240');
    svg.getBoundingClientRect = () => ({ width: 598, height: 266 }) as DOMRect;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.style.fontSize = '10px';
    text.textContent = 'Week 12';
    text.getScreenCTM = () => ({ a: 0.89, b: 0, c: 0, d: 0.89 }) as unknown as DOMMatrix;
    svg.append(text);
    card.append(svg);
    host.append(card);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'bleed'));
    await flushScan();

    // 598 × 9.1 / 8.9 → 612: 14px over, 7px into each 22px side.
    expect(svg.style.minWidth).toBe('612px');
    expect(svg.style.marginInline).toBe('-7px');
    expect(card.style.overflowX).toBe('');
    expect(card.classList.contains('canvas-svg-scroll')).toBe(false);

    width = 444;
    card.append(document.createElement('span'));
    await flushScan();

    expect(svg.style.marginInline).toBe('');
    expect(svg.style.minWidth).toBe('612px');
    expect(card.style.overflowX).toBe('auto');
    expect(card.classList.contains('canvas-svg-scroll')).toBe(true);

    hook.unmount();
    expect(svg.style.minWidth).toBe('');
    expect(card.style.overflowX).toBe('');
  });

  // When the padding cannot hold the figure, the pan region must be the figure alone: a card
  // scroller slid the eyebrow and the prose off a phone screen with it. A figure-only wrapper is
  // that region, and it still bleeds into the card's padding while the padding is enough.
  it('pans a wrapped figure inside its wrapper and leaves the card still', async () => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '0 22px';
    let width = 642;
    Object.defineProperty(card, 'clientWidth', { configurable: true, get: () => width });
    const eyebrow = document.createElement('div');
    eyebrow.className = 'card-eyebrow';
    eyebrow.textContent = 'Weekly load';
    const figure = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 540 240');
    svg.getBoundingClientRect = () => ({ width: 598, height: 266 }) as DOMRect;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.style.fontSize = '10px';
    text.textContent = 'Week 12';
    text.getScreenCTM = () => ({ a: 0.89, b: 0, c: 0, d: 0.89 }) as unknown as DOMMatrix;
    svg.append(text);
    figure.append(svg);
    const summary = document.createElement('p');
    summary.textContent = 'Load peaks in week 12.';
    card.append(eyebrow, figure, summary);
    host.append(card);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'wrapped'));
    await flushScan();
    expect(svg.style.marginInline).toBe('-7px');
    expect(figure.style.overflowX).toBe('');

    width = 444;
    card.append(document.createElement('span'));
    await flushScan();
    expect(figure.style.overflowX).toBe('auto');
    expect(figure.classList.contains('canvas-svg-scroll')).toBe(true);
    expect(card.style.overflowX).toBe('');
    expect(card.classList.contains('canvas-svg-scroll')).toBe(false);
    hook.unmount();
  });

  // A stage held to `overflow: hidden` clipped the very pixels the bleed won back (sequence and
  // five-forces diagrams lost 9-12px at 390), and a framed well let the drawing hang past its
  // border. The stage opens while the bleed holds; the framed well pans inside its frame.
  it('opens a clipping figure wrapper for the bleed, and pans inside a framed one', async () => {
    const figureCard = (wrapperStyle: Partial<CSSStyleDeclaration>) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.padding = '0 22px';
      Object.defineProperty(card, 'clientWidth', { configurable: true, get: () => 642 });
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, wrapperStyle);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 540 240');
      svg.getBoundingClientRect = () => ({ width: 598, height: 266 }) as DOMRect;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.style.fontSize = '10px';
      text.textContent = 'Week 12';
      text.getScreenCTM = () => ({ a: 0.89, b: 0, c: 0, d: 0.89 }) as unknown as DOMMatrix;
      svg.append(text);
      wrapper.append(svg);
      card.append(wrapper);
      host.append(card);
      return { wrapper, svg };
    };
    const stage = figureCard({ overflowX: 'hidden', overflowY: 'hidden' });
    const well = figureCard({
      overflowX: 'hidden',
      overflowY: 'hidden',
      padding: '10px',
      border: '1px solid',
    });

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'stages'));
    await flushScan();

    expect(stage.svg.style.marginInline).toBe('-7px');
    expect(stage.wrapper.style.overflowX).toBe('visible');
    // 266 × 9.1 / 8.9 → 272: the stage holds the grown height rather than clipping it.
    expect(stage.wrapper.style.minHeight).toBe(stage.svg.style.minHeight);
    expect(stage.wrapper.style.minWidth).toBe('min(612px, 100%)');
    expect(well.svg.style.marginInline).toBe('');
    expect(well.wrapper.classList.contains('canvas-svg-scroll')).toBe(true);

    hook.unmount();
    expect(stage.wrapper.style.overflowX).toBe('hidden');
    expect(stage.wrapper.style.minHeight).toBe('');
    expect(stage.wrapper.style.minWidth).toBe('');
  });

  // The other side of the floor: a small fixed viewBox stretched to a wide card scales its labels
  // into display type (a season calendar's 10px row names reached the screen at ~40px and ran off
  // the card). The figure is held to 1.5x and centred; a numeral authored large is left alone.
  it('holds a stretched figure back from blowing its labels up, and leaves display type be', async () => {
    const figure = (fontSize: number) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 320 120');
      svg.getBoundingClientRect = () => ({ width: 1024, height: 384 }) as DOMRect;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.style.fontSize = `${fontSize}px`;
      text.textContent = 'Sweet potato';
      text.getScreenCTM = () => ({ a: 3.2, b: 0, c: 0, d: 3.2 }) as unknown as DOMMatrix;
      svg.append(text);
      const card = document.createElement('div');
      card.className = 'card';
      card.append(svg);
      host.append(card);
      return svg;
    };
    const chart = figure(10);
    const numeral = figure(28);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'blown'));
    await flushScan();

    // 1024 x 1.5 / 3.2 → 480 (and 384 → 180): the labels paint at 15px, not 32. Both axes, so a
    // figure sized by its height is held too.
    expect(chart.style.maxWidth).toBe('480px');
    expect(chart.style.maxHeight).toBe('180px');
    expect(chart.style.marginInline).toBe('auto');
    expect(chart.hasAttribute('data-scale-cap')).toBe(true);
    expect(numeral.style.maxWidth).toBe('');

    hook.unmount();
    expect(chart.style.maxWidth).toBe('');
    expect(chart.style.maxHeight).toBe('');
    expect(chart.hasAttribute('data-scale-cap')).toBe(false);
  });

  // A hover tip placed in % of the figure's wrapper stayed spread across the full card when only
  // the SVG was narrowed, so it pointed at empty space beside the chart. The cap now narrows the
  // wrapper — but only one whose other children are overlays, never one holding in-flow content.
  it('narrows the figure wrapper with its overlay, never a wrapper with content of its own', async () => {
    const figure = (withCaption: boolean) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 320 120');
      svg.getBoundingClientRect = () => ({ width: 1024, height: 384 }) as DOMRect;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.style.fontSize = '10px';
      text.textContent = 'Max Sharpe';
      text.getScreenCTM = () => ({ a: 3.2, b: 0, c: 0, d: 3.2 }) as unknown as DOMMatrix;
      svg.append(text);
      const plot = document.createElement('div');
      plot.getBoundingClientRect = () => ({ width: 1024, height: 384 }) as DOMRect;
      const tip = document.createElement('div');
      tip.style.position = 'absolute';
      plot.append(svg, tip);
      if (withCaption) plot.append(document.createElement('p'));
      const card = document.createElement('div');
      card.className = 'card';
      card.append(plot);
      host.append(card);
      return { svg, plot };
    };
    const tipped = figure(false);
    const captioned = figure(true);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'wrapper'));
    await flushScan();

    expect(tipped.plot.style.maxWidth).toBe('480px');
    expect(tipped.plot.style.marginInline).toBe('auto');
    expect(tipped.svg.style.maxWidth).toBe('');
    expect(tipped.svg.style.maxHeight).toBe('180px');
    expect(captioned.plot.style.maxWidth).toBe('');
    expect(captioned.svg.style.maxWidth).toBe('480px');

    hook.unmount();
    expect(tipped.plot.style.maxWidth).toBe('');
    expect(tipped.plot.hasAttribute('data-scale-cap')).toBe(false);
  });

  // The size test that decides whether a figure is even LOOKED at used to be
  // `width < 80 || height < 24`, so a chart that is wide and short was skipped as if it were an
  // inline glyph. A dotplot whose tallest stack is one dot is exactly that shape — a 520x55
  // viewBox painting 208x22 in a phone-width card — and its tick labels reached the screen at
  // 3.6px. An icon is small in BOTH axes; that is the argued case, and the only one.
  it('guards a wide, short figure and still skips an inline glyph', async () => {
    const host = document.createElement('div');
    const scroller = document.createElement('div');
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 208 });
    host.append(scroller);

    const strip = svgWithSmallLabel(scroller, '25', undefined, { width: 208, height: 22 });
    const glyph = svgWithSmallLabel(scroller, '+', undefined, { width: 20, height: 20 });

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'wide-short'));
    await flushScan();

    expect(strip.hasAttribute('data-legibility-guard')).toBe(true);
    expect(parseFloat(strip.style.minWidth)).toBeGreaterThan(208);
    expect(glyph.hasAttribute('data-legibility-guard')).toBe(false);
    expect(glyph.style.minWidth).toBe('');
    hook.unmount();
  });

  it('cues a capped list that scrolls down, and drops the cue at its end', async () => {
    const card = document.createElement('div');
    card.className = 'card';
    const list = document.createElement('ul');
    list.style.overflowY = 'auto';
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 900 });
    card.append(list);
    host.append(card);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'tall'));
    await flushScan();
    expect(list.classList.contains('canvas-vscroll')).toBe(true);
    expect(list.classList.contains('canvas-hscroll')).toBe(false);
    expect(list.classList.contains('canvas-vscroll--end')).toBe(false);
    expect(list.getAttribute('role')).toBe('region');

    list.scrollTop = 600;
    list.dispatchEvent(new Event('scroll'));
    expect(list.classList.contains('canvas-vscroll--end')).toBe(true);
    hook.unmount();
    expect(list.classList.contains('canvas-vscroll')).toBe(false);
  });

  it('drops the cue from a table that fits once its rows have risen into place', async () => {
    // Measured live: a rubric's rows rise in on a transform, which counts toward scroll overflow,
    // so the first scan read it 10px over its cap — and the fade it got hid its last row for good.
    const card = document.createElement('div');
    card.className = 'card';
    const table = document.createElement('div');
    table.style.overflowY = 'auto';
    const row = document.createElement('div');
    table.append(row);
    let scrollHeight = 355;
    Object.defineProperty(table, 'clientHeight', { configurable: true, value: 345 });
    Object.defineProperty(table, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    card.append(table);
    host.append(card);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'rise'));
    await flushScan();
    expect(table.classList.contains('canvas-vscroll')).toBe(true);

    scrollHeight = 345;
    row.dispatchEvent(new Event('animationend', { bubbles: true }));
    await settleEntrance();
    expect(table.classList.contains('canvas-vscroll')).toBe(false);
    expect(table.hasAttribute('role')).toBe(false);
    expect(table.hasAttribute('tabindex')).toBe(false);

    // A region that starts to overflow again is cued again.
    scrollHeight = 500;
    row.dispatchEvent(new Event('animationend', { bubbles: true }));
    await settleEntrance();
    expect(table.classList.contains('canvas-vscroll')).toBe(true);
    hook.unmount();
  });

  it('judges a staggered entrance once, after its last step', async () => {
    // A heatmap's cells end their entrance 35ms apart; a rescan per cell re-measured the whole
    // card a hundred times over three and a half seconds.
    const card = document.createElement('div');
    const table = document.createElement('div');
    table.style.overflowY = 'auto';
    const cells = Array.from({ length: 20 }, () => document.createElement('span'));
    table.append(...cells);
    let reads = 0;
    Object.defineProperty(table, 'clientHeight', { configurable: true, value: 345 });
    Object.defineProperty(table, 'scrollHeight', {
      configurable: true,
      get: () => {
        reads += 1;
        return 500;
      },
    });
    card.append(table);
    host.append(card);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'stagger'));
    // Past the mount scan and the late one for async paint, so only the entrance is counted.
    await vi.advanceTimersByTimeAsync(1000);
    reads = 0;
    cells[0].dispatchEvent(new Event('animationend', { bubbles: true }));
    await settleEntrance();
    const oneScan = reads;
    expect(oneScan).toBeGreaterThan(0);

    reads = 0;
    for (const cell of cells) {
      cell.dispatchEvent(new Event('animationend', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(35);
    }
    expect(reads).toBe(0);
    await settleEntrance();
    expect(reads).toBe(oneScan);
    hook.unmount();
  });

  it('keeps a focused region a focus stop until the reader moves on', async () => {
    const table = document.createElement('div');
    table.style.overflowY = 'auto';
    const row = document.createElement('div');
    table.append(row);
    let scrollHeight = 500;
    Object.defineProperty(table, 'clientHeight', { configurable: true, value: 345 });
    Object.defineProperty(table, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    host.append(table);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'focus'));
    await flushScan();
    table.focus();
    expect(document.activeElement).toBe(table);

    scrollHeight = 345;
    row.dispatchEvent(new Event('animationend', { bubbles: true }));
    await settleEntrance();
    expect(table.classList.contains('canvas-vscroll')).toBe(false);
    expect(table.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(table);

    // Leaving it is enough; nothing else has to happen on the card for the stop to go.
    table.blur();
    await flushScan();
    expect(table.hasAttribute('tabindex')).toBe(false);
    hook.unmount();
  });

  it('re-judges the board when a web font reflows it', async () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    const list = document.createElement('ul');
    list.style.overflowY = 'auto';
    let scrollHeight = 300;
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    host.append(list);

    const hook = renderHook(() => useAccessibleScrollRegions({ current: host }, 'fonts'));
    await flushScan();
    expect(list.classList.contains('canvas-vscroll')).toBe(false);

    scrollHeight = 420;
    fonts.dispatchEvent(new Event('loadingdone'));
    await flushScan();
    expect(list.classList.contains('canvas-vscroll')).toBe(true);
    hook.unmount();
    Reflect.deleteProperty(document, 'fonts');
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

  it('never discloses decoration the page hides from assistive tech', async () => {
    // A terminal's title bar is aria-hidden ornament; a disclosure there is a focusable button
    // inside a subtree told not to exist, and an 11px tap target on a phone.
    const ornament = document.createElement('div');
    ornament.setAttribute('aria-hidden', 'true');
    const { card, label } = labelCard(
      'backend-server $ ~/proj…',
      'backend-server $ ~/projects/mavea',
    );
    ornament.appendChild(card);
    host.appendChild(ornament);
    const ref = { current: host };
    const hook = renderHook(() => useTruncatedTextDisclosures(ref, 'r1'));
    await flushScan();
    expect(label.hasAttribute('data-text-disclosure')).toBe(false);
    expect(label.hasAttribute('role')).toBe(false);
    expect(label.hasAttribute('tabindex')).toBe(false);
    hook.unmount();
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
