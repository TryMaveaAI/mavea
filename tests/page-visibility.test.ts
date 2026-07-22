import { describe, it, expect, afterEach } from 'vitest';
import { isHidden, onVisibility, untilVisible } from '../src/lib/pageVisibility';

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('pageVisibility', () => {
  afterEach(() => {
    setVisibility('visible');
  });

  it('isHidden reflects document.visibilityState', () => {
    setVisibility('visible');
    expect(isHidden()).toBe(false);
    setVisibility('hidden');
    expect(isHidden()).toBe(true);
  });

  it('onVisibility fires on a visibilitychange event and the disposer unsubscribes it', () => {
    const seen: boolean[] = [];
    const dispose = onVisibility((hidden) => seen.push(hidden));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(seen).toEqual([true, false]);

    dispose();
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen).toEqual([true, false]); // no new entry — the disposer worked
  });

  it('untilVisible resolves immediately when already visible', async () => {
    setVisibility('visible');
    await expect(untilVisible()).resolves.toBeUndefined();
  });

  it('untilVisible waits for the tab to become visible again', async () => {
    setVisibility('hidden');
    let resolved = false;
    const p = untilVisible().then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await p;
    expect(resolved).toBe(true);
  });
});
