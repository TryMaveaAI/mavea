import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Hero } from '../src/flagship/sections/Hero';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.documentElement.dataset.perf;
});

/** The example prompt renders as the ghost overlay span (so rotations can cross-fade), not the
 *  native placeholder attribute. */
function ghostText(container: HTMLElement): string | null {
  return container.querySelector('.fl-composer-ghost')?.textContent ?? null;
}

describe('landing hero idle budget', () => {
  it('uses a useful static prompt instead of rotating prompts in lite mode', () => {
    vi.useFakeTimers();
    document.documentElement.dataset.perf = 'lite';
    const { container } = render(<Hero onEnterLive={() => {}} />);

    expect(ghostText(container)).toBe("Explain compound interest like I'm 12.");

    act(() => vi.advanceTimersByTime(20_000));
    expect(ghostText(container)).toBe("Explain compound interest like I'm 12.");
  });

  it('stops prompt rotation immediately when the runtime tier demotes to lite', async () => {
    vi.useFakeTimers();
    document.documentElement.dataset.perf = 'full';
    const { container } = render(<Hero onEnterLive={() => {}} />);

    act(() => vi.advanceTimersByTime(7_000));
    expect(ghostText(container)).not.toBe("Explain compound interest like I'm 12.");

    await act(async () => {
      document.documentElement.dataset.perf = 'lite';
      // MutationObserver delivery happens at the next microtask checkpoint.
      await Promise.resolve();
    });
    expect(ghostText(container)).toBe("Explain compound interest like I'm 12.");
  });
});
