import { describe, it, expect, vi } from 'vitest';
import { lazyRetry } from '../src/lib/lazyRetry';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => (values.has(k) ? values.get(k)! : null),
    setItem: (k: string, v: string) => void values.set(k, v),
    removeItem: (k: string) => void values.delete(k),
  };
}

describe('lazyRetry', () => {
  it('resolves normally on the first try and never touches storage/reload', async () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    const factory = vi.fn().mockResolvedValue({ default: 'ok' });

    const result = await lazyRetry(factory, { reload, storage })();

    expect(result).toEqual({ default: 'ok' });
    expect(reload).not.toHaveBeenCalled();
    expect(storage.getItem('mavea-chunk-retry')).toBeNull();
  });

  it('reloads once on the first failure and never settles the returned promise', async () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    const factory = vi.fn().mockRejectedValue(new Error('chunk load failed'));

    const wrapped = lazyRetry(factory, { reload, storage })();
    // give the rejection handler a turn to run before asserting
    await Promise.race([wrapped, new Promise((r) => setTimeout(r, 0))]);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem('mavea-chunk-retry')).toBe('1');
  });

  it('rethrows on a second failure instead of reloading again', async () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    storage.setItem('mavea-chunk-retry', '1');
    const factory = vi.fn().mockRejectedValue(new Error('still broken'));

    await expect(lazyRetry(factory, { reload, storage })()).rejects.toThrow('still broken');
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears the retry flag on a later success so a fresh failure gets its own retry', async () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    storage.setItem('mavea-chunk-retry', '1');
    const factory = vi.fn().mockResolvedValue({ default: 'recovered' });

    await lazyRetry(factory, { reload, storage })();

    expect(storage.getItem('mavea-chunk-retry')).toBeNull();
  });
});
