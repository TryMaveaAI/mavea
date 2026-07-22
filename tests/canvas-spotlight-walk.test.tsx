import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useState } from 'react';
import { useSpotlightWalk } from '../src/canvas/focus/useSpotlightWalk';

function Probe({ spotlight, count }: { spotlight: boolean; count: number }) {
  const [i, setI] = useState(2);
  useSpotlightWalk(spotlight, count, setI, 1000);
  return <span data-testid="i">{i}</span>;
}

function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (q: string) =>
      ({
        matches: q.includes('reduce') ? reduce : false,
        media: q,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// The hook drives a multi-step block's own index while the tour spotlights it — walking through the
// steps and looping — and stays out of the way otherwise. This is what makes a spotlighted stepper /
// wizard / teaching diagram demonstrate itself, then restart at the start.
describe('useSpotlightWalk', () => {
  it('restarts at 0 and walks through the steps, looping, while spotlighted', () => {
    stubMotion(false);
    vi.useFakeTimers();
    const { getByTestId } = render(<Probe spotlight count={3} />);
    expect(getByTestId('i').textContent).toBe('0'); // jumps to the start when the spotlight lands
    act(() => vi.advanceTimersByTime(1000));
    expect(getByTestId('i').textContent).toBe('1');
    act(() => vi.advanceTimersByTime(1000));
    expect(getByTestId('i').textContent).toBe('2');
    act(() => vi.advanceTimersByTime(1000));
    expect(getByTestId('i').textContent).toBe('0'); // loops back to the start
  });

  it('leaves the block alone when it is not spotlighted (user keeps control)', () => {
    stubMotion(false);
    vi.useFakeTimers();
    const { getByTestId } = render(<Probe spotlight={false} count={3} />);
    expect(getByTestId('i').textContent).toBe('2');
    act(() => vi.advanceTimersByTime(3000));
    expect(getByTestId('i').textContent).toBe('2');
  });

  it('is inert under reduced motion', () => {
    stubMotion(true);
    vi.useFakeTimers();
    const { getByTestId } = render(<Probe spotlight count={3} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(getByTestId('i').textContent).toBe('2'); // never even reset to 0
  });

  it('is inert for a single-step block', () => {
    stubMotion(false);
    vi.useFakeTimers();
    const { getByTestId } = render(<Probe spotlight count={1} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(getByTestId('i').textContent).toBe('2');
  });
});
