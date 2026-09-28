import { render, cleanup, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FitBox } from '../src/canvas/layout/FitBox';

afterEach(cleanup);

// The Study sweeps a card in on a 0.9s transform transition. A height fit read during that flight
// measures the host at a scale it is only passing through, and nothing resizes when the flight
// lands, so that read stood until something unrelated re-measured — just after the pen had
// anchored, which then moved with it. jsdom has no layout or animations, so the ancestor
// reports both the way a browser would.
const geometry = (el: Element, values: Record<string, number>) => {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(el, key, { configurable: true, get: () => value });
  }
};
const scaleOf = (el: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? 1);

function flight(property: string, playState: AnimationPlayState) {
  let land = () => {};
  const finished = new Promise<void>((r) => (land = r));
  const anim = {
    playState,
    transitionProperty: property,
    effect: { getComputedTiming: () => ({ endTime: 900 }) },
    finished,
  } as unknown as Animation;
  return { anim, land };
}

/** A block 800 tall with 20px type in a box that leaves it 400, on a card mid-flight at 0.75 of
 *  its landed size: the type paints at 15px there, so the legibility floor holds the fit at 0.6;
 *  landed it paints at 20px and the free fit, 0.5, is legible. */
function stage(property: string, playState: AnimationPlayState = 'running') {
  const { anim, land } = flight(property, playState);
  let flying = true;
  const tree = () => (
    <div className="box" style={{ overflowY: 'auto', maxHeight: '400px' }}>
      <FitBox fitHeight>
        <p style={{ fontSize: 20 }}>x y</p>
      </FitBox>
    </div>
  );
  const { container, rerender } = render(tree());
  const box = container.querySelector('.box') as HTMLElement;
  const host = container.querySelector('.fit-box') as HTMLElement;
  const inner = host.firstElementChild as HTMLElement;
  geometry(box, { clientHeight: 400, scrollHeight: 800, scrollTop: 0 });
  geometry(host, { clientWidth: 400, offsetWidth: 400 });
  geometry(inner, { scrollWidth: 400, scrollHeight: 800 });
  host.getBoundingClientRect = () =>
    ({ top: 0, left: 0, width: flying ? 300 : 400, height: 800 }) as DOMRect;
  box.getBoundingClientRect = () => ({ top: 0, left: 0, width: 400, height: 400 }) as DOMRect;
  box.getAnimations = () => (flying ? [anim] : []);
  rerender(tree());
  return {
    inner,
    land: async () => {
      flying = false;
      land();
      await act(() => new Promise((r) => setTimeout(r, 0)));
    },
  };
}

describe('FitBox — a fit read in flight', () => {
  it('takes no read while an ancestor flies, and fits where it lands', async () => {
    const { inner, land } = stage('transform');
    // Read in flight, the floor would have held this at 0.6.
    expect(scaleOf(inner)).toBe(1);
    await land();
    expect(scaleOf(inner)).toBe(0.5);
  });

  it('waits on nothing that does not move the host', async () => {
    const { inner, land } = stage('opacity');
    // An opacity fade is no flight: the read is taken during it, and nothing re-reads after.
    expect(scaleOf(inner)).toBe(0.6);
    await land();
    expect(scaleOf(inner)).toBe(0.6);
  });

  it('does not wait on a flight the video export has paused', () => {
    // The export pauses every animation and seeks it frame by frame, so a paused flight's
    // `finished` never comes: waiting on it would leave the block unfitted for the whole clip.
    const { inner } = stage('transform', 'paused');
    expect(scaleOf(inner)).toBe(0.6);
  });
});
