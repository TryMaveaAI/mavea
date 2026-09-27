import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { glideScroll } from '../src/live/hooks/useKeepSpotInView';

// The walk's camera. A voiced stop glides its card into view under the line's first syllables and
// only draws once the glide has resolved, so it has to be awaitable, finish on the motion token's
// clock, and never move at all when motion is reduced.
function scroller(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: 4000 });
  Object.defineProperty(el, 'clientHeight', { value: 800 });
  el.scrollTo = ((opts: ScrollToOptions) => {
    el.scrollTop = opts.top ?? el.scrollTop;
  }) as HTMLElement['scrollTo'];
  document.body.appendChild(el);
  return el;
}

describe('glideScroll', () => {
  let now = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb((now += 16)), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('jumps straight there when motion is reduced', async () => {
    const el = scroller();
    await glideScroll(el, 600, { instant: true });
    expect(el.scrollTop).toBe(600);
  });

  it('eases to the target within the motion token and resolves at rest', async () => {
    const el = scroller();
    let done = false;
    void glideScroll(el, 600).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(64);
    // Ease-out: well past a linear share of the way after a quarter of the time.
    expect(el.scrollTop).toBeGreaterThan(150);
    expect(el.scrollTop).toBeLessThan(600);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(320);
    expect(el.scrollTop).toBe(600);
    expect(done).toBe(true);
  });

  it('stops where it is when the walk is aborted', async () => {
    const el = scroller();
    const ctl = new AbortController();
    let done = false;
    void glideScroll(el, 600, { signal: ctl.signal }).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(48);
    ctl.abort();
    await vi.advanceTimersByTimeAsync(0);
    const at = el.scrollTop;
    await vi.advanceTimersByTimeAsync(400);
    expect(done).toBe(true);
    expect(el.scrollTop).toBe(at);
  });

  it('clamps to what the scroller can actually reach', async () => {
    const el = scroller();
    await glideScroll(el, 99_999, { instant: true });
    expect(el.scrollTop).toBe(3200);
  });
});
