// "Adding below" appears only while the cards a follow-up is adding are forming out of sight
// below the fold, takes the reader there on a click, stays gone once they have seen that point,
// and clears when the cards land.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BoardCuePill } from '../src/live/turnstate/BoardCuePill';

type Report = (entry: Partial<IntersectionObserverEntry>) => void;
let report: Report = () => {};
let observers = 0;

class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    observers += 1;
    report = (entry) =>
      cb(
        [
          {
            isIntersecting: false,
            boundingClientRect: { top: 0 } as DOMRectReadOnly,
            rootBounds: { bottom: 600 } as DOMRectReadOnly,
            ...entry,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver,
      );
  }
  observe(): void {}
  disconnect(): void {
    report = () => {};
  }
}

const offBelow = { isIntersecting: false, boundingClientRect: { top: 900 } as DOMRectReadOnly };
const inView = { isIntersecting: true, boundingClientRect: { top: 300 } as DOMRectReadOnly };

function setup(active = true) {
  const target = createRef<HTMLDivElement>();
  const ui = (on: boolean) => (
    <>
      <div ref={target} />
      <BoardCuePill target={target} active={on} />
    </>
  );
  const view = render(ui(active));
  return { target, rerender: (on: boolean) => view.rerender(ui(on)) };
}

beforeEach(() => {
  observers = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BoardCuePill', () => {
  it('shows only while the insertion point is below the visible area', () => {
    setup();
    act(() => report(offBelow));
    expect(screen.getByRole('button', { name: /adding below/i })).toBeInTheDocument();
  });

  it('stays hidden when the insertion point is already on screen, and after it has been seen', () => {
    setup();
    act(() => report(inView));
    expect(screen.queryByRole('button', { name: /adding below/i })).toBeNull();
    // Scrolling back up does not bring it back: the reader already knows.
    act(() => report(offBelow));
    expect(screen.queryByRole('button', { name: /adding below/i })).toBeNull();
  });

  it('says nothing about a point ABOVE the view', () => {
    setup();
    act(() =>
      report({ isIntersecting: false, boundingClientRect: { top: -400 } as DOMRectReadOnly }),
    );
    expect(screen.queryByRole('button', { name: /adding below/i })).toBeNull();
  });

  it('scrolls to the insertion point on a click', () => {
    const { target } = setup();
    const scrollIntoView = vi.fn();
    target.current!.scrollIntoView = scrollIntoView;
    act(() => report(offBelow));
    fireEvent.click(screen.getByRole('button', { name: /adding below/i }));
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
  });

  it('clears when the cards land, and never observes while inactive', () => {
    const { rerender } = setup();
    act(() => report(offBelow));
    expect(screen.getByRole('button', { name: /adding below/i })).toBeInTheDocument();
    rerender(false);
    expect(screen.queryByRole('button', { name: /adding below/i })).toBeNull();
    cleanup();
    observers = 0;
    setup(false);
    expect(observers).toBe(0);
  });
});

describe('the pill sizes itself from the design tokens', () => {
  it('its spacing and height scale with the viewport, never a fixed px', () => {
    const css = readFileSync(join(__dirname, '../src/live/turnstate/turnstate.css'), 'utf8');
    const rules = css.match(/\.board-cue-(?:stage|pill) \{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThanOrEqual(2);
    // A hairline border and a var() fallback of 0px are not sizes.
    const sizes = rules
      .join('\n')
      .replace(/\b1px solid\b/g, '')
      .replace(/, 0px\)/g, ')')
      .match(/\b\d+(?:\.\d+)?px\b/g);
    expect(sizes).toBeNull();
  });
});
