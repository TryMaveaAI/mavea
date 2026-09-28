import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FitBox } from '../src/canvas/layout/FitBox';

afterEach(cleanup);

// The Lens's sheet hugs the card it holds, so a one-row stat card is not an island in a
// window-tall frame. What that must not cost is the fit: the card's scroll box now stands only as
// tall as the card, so the room a card may be fitted into is read off the sheet's percentage cap
// (`max-height: 100%` of the scrim, less the strip stacked under it), not off the box that shrank
// with it. jsdom has no layout, so each box reports the geometry a browser gives this stage.
const CHROME = 120; // the sheet's toolbar + notes
const STRIP = 140; // the strip under the sheet
const GAP = 14;

function stage(room: { h: number }, card: { h: number }, readingPx?: number) {
  const view = () => (
    <div className="zoom-scrim" style={{ display: 'flex', flexDirection: 'column', rowGap: GAP }}>
      <div className="zoom-sheet" style={{ maxHeight: '100%', overflowY: 'hidden' }}>
        <div className="zoom-sheet-scroll" style={{ overflowY: 'auto' }}>
          <FitBox fitHeight readingPx={readingPx}>
            <p style={{ fontSize: 32 }}>card</p>
          </FitBox>
        </div>
      </div>
      <div className="lens-strip" />
    </div>
  );
  const utils = render(view());
  const q = (s: string) => utils.container.querySelector(s) as HTMLElement;
  const scrim = q('.zoom-scrim');
  const sheet = q('.zoom-sheet');
  const scroll = q('.zoom-sheet-scroll');
  const strip = q('.lens-strip');
  const host = q('.fit-box');
  const inner = host.firstElementChild as HTMLElement;
  // The scale on screen. FitBox lifts its transform while it measures, so the fake layout reads
  // the committed scale rather than the live style.
  let drawn = 1;
  const committed = () => {
    const m = /scale\(([\d.]+)\)/.exec(inner.style.transform);
    return m ? Number(m[1]) : 1;
  };
  // The scroll box hugs the card as it is DRAWN, up to what the room leaves it.
  const scrollH = () => Math.min(card.h * drawn, room.h - STRIP - GAP - CHROME);
  const def = (el: HTMLElement, key: string, get: () => number) =>
    Object.defineProperty(el, key, { get, configurable: true });
  const rect = (el: HTMLElement, height: () => number, width = 800) =>
    (el.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width, height: height(), right: width, bottom: height() }) as DOMRect);
  def(scrim, 'clientHeight', () => room.h);
  rect(strip, () => STRIP);
  rect(sheet, () => scrollH() + CHROME);
  def(scroll, 'clientHeight', scrollH);
  def(scroll, 'scrollHeight', scrollH);
  rect(scroll, scrollH);
  // A browser reports a laid-out flex child's used height, which is what makes it the bounded box.
  scroll.style.height = '1px';
  def(host, 'clientWidth', () => 800);
  def(host, 'offsetWidth', () => 800);
  rect(host, () => card.h * drawn);
  def(inner, 'scrollWidth', () => 800);
  // Reflowed narrower to grow, the card wraps to more lines: its height at the candidate width.
  def(inner, 'scrollHeight', () => card.h * (100 / parseFloat(inner.style.width || '100')));
  const refit = () => {
    utils.rerender(view());
    drawn = committed();
  };
  refit();
  return { scale: () => drawn, refit };
}

describe('the Lens stage hugs a short card and still fits a tall one', () => {
  it('leaves a card that fits at its own size', () => {
    const { scale } = stage({ h: 700 }, { h: 180 });
    expect(scale()).toBe(1);
  });

  it('fits a card taller than the room to the room less the strip, not to the box hugging it', () => {
    // 700 - 140 strip - 14 gap - 120 chrome = 426px of room for an 852px card.
    const { scale } = stage({ h: 700 }, { h: 852 });
    expect(scale()).toBeCloseTo(0.5, 2);
  });

  it('lets a card fitted down for a short window grow back when the window grows', () => {
    const room = { h: 700 };
    const { scale, refit } = stage(room, { h: 852 });
    expect(scale()).toBeCloseTo(0.5, 2);
    // The scroll box still stands at the SHRUNK card's height; only the room knows it grew.
    room.h = 1400;
    refit();
    expect(scale()).toBe(1);
  });

  it('magnifies a short card toward the reading size, capped, when the stage has room', () => {
    // 32px body toward 40px: 1.25x, and the room holds it.
    const { scale } = stage({ h: 900 }, { h: 180 }, 40);
    expect(scale()).toBeCloseTo(1.25, 2);
    // Toward 80px would be 2.5x; the grow is capped at 1.5x.
    expect(stage({ h: 900 }, { h: 180 }, 80).scale()).toBeCloseTo(1.5, 2);
  });
});
