import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allowsSpeculativePreload,
  createPreloadableLazy,
  scheduleIdlePreload,
} from '../src/lib/preloadableLazy';

afterEach(() => {
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
