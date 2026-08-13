import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('keyVault — transient IndexedDB failures', () => {
  it('evicts a rejected key promise so the next encryption can retry', async () => {
    vi.resetModules();
    class FakeCryptoKey {}
    const generatedKey = new FakeCryptoKey();
    const stored = new Map<string, unknown>();
    const close = vi.fn();
    const request = (run: () => unknown) => {
      const req: Record<string, unknown> = {};
      queueMicrotask(() => {
        req.result = run();
        (req.onsuccess as (() => void) | undefined)?.();
      });
      return req;
    };
    const db = {
      close,
      transaction: () => ({
        objectStore: () => ({
          get: (key: string) => request(() => stored.get(key)),
          put: (value: unknown, key: string) =>
            request(() => {
              stored.set(key, value);
            }),
        }),
      }),
    };
    let opens = 0;
    const indexedDb = {
      open: () => {
        const req: Record<string, unknown> = {};
        opens += 1;
        queueMicrotask(() => {
          if (opens === 1) {
            req.error = new Error('temporary failure');
            (req.onerror as (() => void) | undefined)?.();
          } else {
            req.result = db;
            (req.onsuccess as (() => void) | undefined)?.();
          }
        });
        return req;
      },
    };
    const subtle = {
      generateKey: vi.fn(async () => generatedKey),
      encrypt: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    };
    const cryptoMock = {
      subtle,
      getRandomValues: (bytes: Uint8Array) => bytes.fill(7),
    };
    vi.stubGlobal('CryptoKey', FakeCryptoKey);
    vi.stubGlobal('indexedDB', indexedDb);
    vi.stubGlobal('crypto', cryptoMock);

    const { encryptWithKey } = await import('../src/live/keyVault');
    await expect(encryptWithKey('first', 'retry-key')).rejects.toThrow('temporary failure');
    await expect(encryptWithKey('second', 'retry-key')).resolves.toEqual(expect.any(String));

    expect(opens).toBe(2);
    expect(subtle.generateKey).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
