// The desk's fit reserves the handwritten takeaway's MEASURED band before it solves how tall the
// front card may be. The sentence changes with the object on the desk, and a longer one takes a
// line more without moving a single box the ResizeObserver watches — so the fit has to re-run on a
// re-cast, or the card's lower edge is solved against the previous sentence and lands in the
// handwriting. jsdom has no layout, so the boxes the hook reads are stated here.
import { COMPACT_H, STAGE_H_MIN } from '../src/canvas/study/slots';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStudyScale } from '../src/canvas/study/useStudyScale';

// A window tall enough to keep the desk (over COMPACT_H), holding a 760px canvas column.
const WINDOW_H = 900;
const VIEWPORT_H = 760;

class InertResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function box(top: number, height: number, width: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** A scroll column holding a desk-wide stage with a takeaway of `takeawayH` design px. */
function mountStage(takeawayH: () => number): HTMLElement {
  const scroll = document.createElement('div');
  scroll.className = 'canvas-scroll';
  scroll.getBoundingClientRect = () => box(0, VIEWPORT_H, 1700);

  const host = document.createElement('div');
  host.getBoundingClientRect = () => box(0, VIEWPORT_H, 1600);

  const stage = document.createElement('section');
  stage.className = 'study-stage';
  stage.getBoundingClientRect = () => box(0, VIEWPORT_H, 1600);
  Object.defineProperty(stage, 'clientWidth', { value: 1600 });

  const takeaway = document.createElement('div');
  takeaway.className = 'study-takeaway';
  Object.defineProperty(takeaway, 'offsetHeight', { get: takeawayH });

  stage.append(takeaway);
  host.append(stage);
  scroll.append(host);
  document.body.append(scroll);
  return stage;
}

describe('the Study desk re-fits when the takeaway does', () => {
  const realObserver = globalThis.ResizeObserver;
  const realInnerHeight = window.innerHeight;

  beforeEach(() => {
    globalThis.ResizeObserver = InertResizeObserver as unknown as typeof ResizeObserver;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: WINDOW_H });
  });

  afterEach(() => {
    globalThis.ResizeObserver = realObserver;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: realInnerHeight });
    document.body.replaceChildren();
  });

  it('publishes how much room the spoken bubble has beside the front card', () => {
    const stage = mountStage(() => 90);
    const stageRef = { current: stage };
    renderHook(({ rev }: { rev: string }) => useStudyScale(stageRef, rev), {
      initialProps: { rev: 'live:live-1' },
    });
    // A 1600px stage leaves well over 230px left of the card at any in-canvas scale; the bubble
    // may take its full width. (The floored desk in a 1366px window leaves ~120px — `none`.)
    expect(stage.getAttribute('data-voice-room')).toBe('open');
  });

  it('gives the front card less room once the sentence takes another line', () => {
    let takeawayH = 90;
    const stage = mountStage(() => takeawayH);
    const stageRef = { current: stage };

    const { rerender } = renderHook(({ rev }: { rev: string }) => useStudyScale(stageRef, rev), {
      initialProps: { rev: 'live:live-1' },
    });
    const twoLines = Number(stage.style.getPropertyValue('--study-front-max').replace('px', ''));
    expect(twoLines).toBeGreaterThan(0);

    // The next beat's takeaway wraps to a third line. Nothing the observer watches has moved.
    takeawayH = 130;
    rerender({ rev: 'live:live-2' });
    const threeLines = Number(stage.style.getPropertyValue('--study-front-max').replace('px', ''));

    // The card gives back the whole extra line — twice over, since the reserve is half the
    // projected card's height either side of its centre.
    expect(twoLines - threeLines).toBeGreaterThan(2 * (130 - 90) * 0.9);
  });

  it('leaves the fit alone while the desk is showing the same object', () => {
    let takeawayH = 90;
    const stage = mountStage(() => takeawayH);
    const stageRef = { current: stage };

    const { rerender } = renderHook(({ rev }: { rev: string }) => useStudyScale(stageRef, rev), {
      initialProps: { rev: 'live:live-1' },
    });
    const first = stage.style.getPropertyValue('--study-front-max');

    takeawayH = 130;
    rerender({ rev: 'live:live-1' });
    expect(stage.style.getPropertyValue('--study-front-max')).toBe(first);
  });

  it('gives a wide but short laptop window the flat column, so a card is read whole', () => {
    // At the floored desk a real card needs ~1.5× the front slot's cap in a 730px window: it
    // scrolled inside itself with Mavéa's note across the desk. The flat column shows it whole
    // with the note beside it.
    for (const height of [657, 730, 789, COMPACT_H]) {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
      const stage = mountStage(() => 70);

      renderHook(() => useStudyScale({ current: stage }, `short-laptop-${height}`));

      expect(stage.hasAttribute('data-compact')).toBe(true);
      expect(stage.style.getPropertyValue('--study-scale')).toBe('1');
      expect(stage.style.getPropertyValue('--study-front-max')).toBe('');
      document.body.replaceChildren();
    }
  });

  it('keeps the authored desk in a tall window whose canvas column is short', () => {
    // A tall window can still hand the Study a short column (a docked panel). The desk holds its
    // floor height there and the canvas scrolls it, rather than swapping the UI.
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: COMPACT_H + 1 });
    const stage = mountStage(() => 70);
    stage.closest<HTMLElement>('.canvas-scroll')!.getBoundingClientRect = () => box(0, 500, 1700);

    renderHook(() => useStudyScale({ current: stage }, 'short-column'));

    expect(stage.hasAttribute('data-compact')).toBe(false);
    expect(stage.style.getPropertyValue('--study-scale')).not.toBe('1');
    expect(stage.style.getPropertyValue('--study-stage-height')).toBe(`${STAGE_H_MIN}px`);
    expect(stage.hasAttribute('data-shallow')).toBe(false);
  });
});
