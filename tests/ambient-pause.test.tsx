// Ambient CSS loops are supposed to stop when nobody can see them. Two drivers do that: the
// document one (hidden tab) and the per-section one (scrolled out of view). Both write the same
// `--ambient-play` custom property every ambient animation already declares, and both REMOVE it
// rather than setting `running`, so the stylesheet cascade — perf-lite's permanent pause included —
// stays in charge whenever a driver has nothing to say.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { installAmbientPlayDriver } from '../src/lib/pageVisibility';
import { Reveal } from '../src/flagship/parts';

/** jsdom ships no IntersectionObserver; this one lets a test drive intersection by hand. */
class ControllableObserver {
  static last: ControllableObserver | null = null;
  private cb: IntersectionObserverCallback;
  readonly targets: Element[] = [];
  disconnected = false;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    ControllableObserver.last = this;
  }
  observe(el: Element): void {
    this.targets.push(el);
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Report every observed target as on- or off-screen. */
  fire(isIntersecting: boolean): void {
    this.cb(
      this.targets.map((target) => ({ target, isIntersecting })) as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
}

const realIO = globalThis.IntersectionObserver;

afterEach(() => {
  globalThis.IntersectionObserver = realIO;
  document.documentElement.style.removeProperty('--ambient-play');
  document.documentElement.style.removeProperty('--reactive-play');
  delete document.documentElement.dataset.pageHidden;
  cleanup();
  vi.restoreAllMocks();
});

describe('hidden-tab driver', () => {
  const setVisibility = (state: DocumentVisibilityState): void => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('pauses every ambient loop while the tab is hidden and hands control back on return', () => {
    const stop = installAmbientPlayDriver();
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--ambient-play')).toBe('');

    setVisibility('hidden');
    expect(root.style.getPropertyValue('--ambient-play')).toBe('paused');
    expect(root.style.getPropertyValue('--reactive-play')).toBe('paused');
    expect(root.dataset.pageHidden).toBe('true');

    // Removed, not set to `running` — a lite tier's permanent pause must survive the tab coming
    // back, and it lives in the stylesheet, which an inline `running` would outrank.
    setVisibility('visible');
    expect(root.style.getPropertyValue('--ambient-play')).toBe('');
    expect(root.style.getPropertyValue('--reactive-play')).toBe('');
    expect(root.dataset.pageHidden).toBeUndefined();
    stop();
  });

  it('starts paused when installed on an already-hidden tab', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const stop = installAmbientPlayDriver();
    expect(document.documentElement.style.getPropertyValue('--ambient-play')).toBe('paused');
    expect(document.documentElement.style.getPropertyValue('--reactive-play')).toBe('paused');
    expect(document.documentElement.dataset.pageHidden).toBe('true');
    stop();
    expect(document.documentElement.style.getPropertyValue('--ambient-play')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--reactive-play')).toBe('');
    expect(document.documentElement.dataset.pageHidden).toBeUndefined();
  });
});

describe('the driver is actually installed', () => {
  it('boots with the app — a driver nothing calls is just a dead module', () => {
    // This was exactly the state it shipped in: both primitives written, tested in isolation, and
    // wired to nothing, so `--ambient-play` was still only ever set by the lite tier.
    const main = readFileSync(join(__dirname, '..', 'src/main.tsx'), 'utf8');
    expect(main).toMatch(/installAmbientPlayDriver\(\)/);
  });
});

describe('a landing section', () => {
  it('pauses its own loops once it has scrolled entirely out of view', () => {
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = ControllableObserver;
    const { container } = render(
      <Reveal className="fl-test-section">
        <p>section body</p>
      </Reveal>,
    );
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.getPropertyValue('--ambient-play')).toBe('');

    const io = ControllableObserver.last!;
    act(() => io.fire(false));
    expect(section.style.getPropertyValue('--ambient-play')).toBe('paused');

    act(() => io.fire(true));
    expect(section.style.getPropertyValue('--ambient-play')).toBe('');
  });

  it('leaves the property alone when the browser has no observer to ask', () => {
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = undefined;
    const { container } = render(
      <Reveal className="fl-test-section">
        <p>section body</p>
      </Reveal>,
    );
    // Never pause what we cannot see leaving: no observer means today's behaviour, loops running.
    expect(
      (container.querySelector('section') as HTMLElement).style.getPropertyValue('--ambient-play'),
    ).toBe('');
  });
});
