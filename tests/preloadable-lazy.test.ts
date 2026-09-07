import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, Suspense } from 'react';
import { cleanup, render } from '@testing-library/react';
import {
  allowsSpeculativePreload,
  createPreloadableLazy,
  scheduleIdlePreload,
} from '../src/lib/preloadableLazy';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: undefined,
  });
});

describe('preloadable lazy modules', () => {
  it('deduplicates pointer/focus/mount callers onto one import promise', async () => {
    let finish!: (value: { default: () => null }) => void;
    const factory = vi.fn(
      () =>
        new Promise<{ default: () => null }>((resolve) => {
          finish = resolve;
        }),
    );
    const module = createPreloadableLazy(factory);

    const pointer = module.preload();
    const focus = module.preload();
    expect(factory).toHaveBeenCalledTimes(1);

    finish({ default: () => null });
    await Promise.all([pointer, focus]);
    await module.preload();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  // React.lazy suspends on its first render even when the module is already in hand (its
  // initializer only learns the promise settled a microtask later), and React holds the retry
  // commit 300ms behind the fallback it just showed. A preloaded surface must skip all of that:
  // first commit, real content, no fallback ever mounted.
  it('renders a preloaded module straight through, without ever mounting the fallback', async () => {
    const module = createPreloadableLazy(async () => ({
      default: () => createElement('p', null, 'ready'),
    }));
    await module.preload();

    const { container } = render(
      createElement(
        Suspense,
        { fallback: createElement('i', { 'data-fallback': '' }) },
        createElement(module.Component),
      ),
    );

    expect(container.querySelector('p')?.textContent).toBe('ready');
    expect(container.querySelector('[data-fallback]')).toBeNull();
  });

  it('still mounts a surface nothing preloaded, through the fallback', async () => {
    const module = createPreloadableLazy(async () => ({
      default: () => createElement('p', null, 'ready'),
    }));

    const { container, findByText } = render(
      createElement(
        Suspense,
        { fallback: createElement('i', { 'data-fallback': '' }) },
        createElement(module.Component),
      ),
    );

    expect(container.querySelector('[data-fallback]')).not.toBeNull();
    expect((await findByText('ready')).tagName).toBe('P');
  });

  it('honors Save-Data and slow connection hints', () => {
    expect(allowsSpeculativePreload({ saveData: true, effectiveType: '4g' })).toBe(false);
    expect(allowsSpeculativePreload({ effectiveType: '2g' })).toBe(false);
    expect(allowsSpeculativePreload({ effectiveType: '4g' })).toBe(true);
  });

  it('does not run idle warmups under Save-Data', () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true, effectiveType: '4g' },
    });
    const preload = vi.fn(async () => undefined);
    scheduleIdlePreload(preload, 10);
    vi.advanceTimersByTime(1000);
    expect(preload).not.toHaveBeenCalled();
  });
});
