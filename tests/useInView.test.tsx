import { render, act } from '@testing-library/react';
import { useInView } from '../src/hooks/useInView';

function Probe() {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="probe">
      {inView ? 'in' : 'out'}
    </div>
  );
}

function KnownVisibleProbe() {
  const [ref, inView] = useInView<HTMLDivElement>({
    initiallyVisible: true,
    measureInitial: false,
  });
  return (
    <div ref={ref} data-testid="known-visible">
      {inView ? 'in' : 'out'}
    </div>
  );
}

describe('useInView', () => {
  const realIO = globalThis.IntersectionObserver;
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  afterEach(() => {
    globalThis.IntersectionObserver = realIO;
    HTMLElement.prototype.getBoundingClientRect = realRect;
  });

  it('reveals immediately when IntersectionObserver is unavailable', () => {
    // jsdom ships no IntersectionObserver — content must never be left hidden behind the check.
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe')).toHaveTextContent('in');
  });

  it('reveals on intersection and disconnects (fire-once)', () => {
    let trigger: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
    const disconnect = vi.fn();
    class MockIO {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        trigger = cb;
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    }
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = MockIO;

    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe')).toHaveTextContent('out');

    act(() => trigger!([{ isIntersecting: true }]));
    expect(getByTestId('probe')).toHaveTextContent('in');
    expect(disconnect).toHaveBeenCalled();
  });

  it('reveals already-on-screen content immediately, without waiting on the observer', () => {
    // Regression guard: an above-the-fold section (a hero, say) is on screen from the first
    // frame — it must never sit hidden/offset waiting on IntersectionObserver's inherently-async
    // first callback, which is what left a load-bearing CTA fading in (and physically
    // translating) under a click that landed in that window. Mock the layout position BEFORE
    // mounting so the synchronous check (in useLayoutEffect, flushed on this same commit) sees
    // an on-screen rect the moment it runs — not a later, separate render pass.
    class MockIO {
      constructor(_cb: unknown) {}
      observe() {}
      disconnect() {}
    }
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = MockIO;
    HTMLElement.prototype.getBoundingClientRect = () => ({
      top: 10,
      bottom: 100,
      left: 0,
      right: 100,
      width: 100,
      height: 90,
      x: 0,
      y: 10,
      toJSON() {},
    });

    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe')).toHaveTextContent('in');
  });

  it('can reveal a position-known hero without forcing a geometry read', () => {
    class MockIO {
      constructor(_cb: unknown) {}
      observe() {}
      disconnect() {}
    }
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = MockIO;
    const readRect = vi.fn(realRect);
    HTMLElement.prototype.getBoundingClientRect = readRect;

    const { getByTestId } = render(<KnownVisibleProbe />);
    expect(getByTestId('known-visible')).toHaveTextContent('in');
    expect(readRect).not.toHaveBeenCalled();
  });

  it('reveals sections the observer never reported, once scrolling settles', () => {
    // Regression guard for the black-page bug: IntersectionObserver only reports at rendered
    // frames, so a scroll that lands in a single frame (scrollbar drag, End key, an instant
    // programmatic jump) — or one performed while the tab renders no frames at all — can leave
    // a section sitting in the viewport with no intersection ever delivered. Fire-once
    // observation then kept it invisible forever. The rect check on scroll-settle is the
    // arrival guarantee.
    vi.useFakeTimers();
    class SilentIO {
      static lastOptions: IntersectionObserverInit | undefined;
      constructor(_cb: unknown, options?: IntersectionObserverInit) {
        SilentIO.lastOptions = options;
      }
      observe() {}
      disconnect() {}
    }
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = SilentIO;

    function DeferProbe() {
      const [ref, inView] = useInView<HTMLDivElement>({
        rootMargin: '480px 0px',
        threshold: 0,
        nearestScrollRoot: true,
        measureInitial: false,
      });
      return (
        <div ref={ref} data-testid="defer-probe">
          {inView ? 'in' : 'out'}
        </div>
      );
    }

    try {
      const { getByTestId } = render(
        <div data-testid="scroller" style={{ overflowY: 'auto' }}>
          <DeferProbe />
        </div>,
      );
      const scroller = getByTestId('scroller');
      const probe = getByTestId('defer-probe');
      const rect = (top: number, bottom: number) =>
        ({
          top,
          bottom,
          left: 0,
          right: 100,
          width: 100,
          height: bottom - top,
          x: 0,
          y: top,
          toJSON() {},
        }) as DOMRect;
      scroller.getBoundingClientRect = () => rect(0, 800);
      probe.getBoundingClientRect = () => rect(2000, 2100);

      // The observer must watch the scroller the page actually scrolls in — against the
      // implicit window root, the pre-mount margin never applies (targets are clipped by
      // the inner scroller before intersecting the margin-expanded window rect).
      expect(SilentIO.lastOptions?.root).toBe(scroller);

      // Mount-settle check runs, but the section is beyond even the 480px margin: stays out.
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(probe).toHaveTextContent('out');

      // An instant jump lands the section in view without the observer ever reporting.
      probe.getBoundingClientRect = () => rect(100, 200);
      act(() => {
        scroller.dispatchEvent(new Event('scrollend'));
        scroller.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(200);
      });
      expect(probe).toHaveTextContent('in');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reveals in-view sections when the tab becomes visible again', () => {
    // A scroll performed while the window is occluded or the tab hidden delivers no
    // intersection entries at all; the first thing the user should see on return is the
    // page, not a black band.
    vi.useFakeTimers();
    class SilentIO {
      constructor(_cb: unknown) {}
      observe() {}
      disconnect() {}
    }
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = SilentIO;

    function DeferProbe() {
      const [ref, inView] = useInView<HTMLDivElement>({
        rootMargin: '480px 0px',
        threshold: 0,
        nearestScrollRoot: true,
        measureInitial: false,
      });
      return (
        <div ref={ref} data-testid="defer-probe">
          {inView ? 'in' : 'out'}
        </div>
      );
    }

    try {
      const { getByTestId } = render(
        <div style={{ overflowY: 'auto' }}>
          <DeferProbe />
        </div>,
      );
      const probe = getByTestId('defer-probe');
      const inViewRect = {
        top: 100,
        bottom: 200,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 100,
        toJSON() {},
      } as DOMRect;
      probe.getBoundingClientRect = () => inViewRect;

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(probe).toHaveTextContent('in');
    } finally {
      vi.useRealTimers();
    }
  });
});
