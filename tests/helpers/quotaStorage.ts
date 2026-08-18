// tests/helpers/quotaStorage.ts — a localStorage stand-in with a REAL ceiling.
//
// jsdom's storage is unbounded, so nothing in the suite could otherwise exercise the one failure
// the shared budget (src/lib/localBudget.ts) exists for: a browser refusing a write because the
// origin's ~5MB quota is spent. This installs a memory storage that throws the same error shape a
// browser does (`QuotaExceededError` / code 22) once the stored key+value units would pass
// `limit`, and hands back an uninstall that restores whatever was there before.

export interface QuotaStorage {
  /** Units (UTF-16 code units of key + value) currently stored, across every key. */
  used(): number;
  /** Restore the storage that was installed before. */
  uninstall(): void;
}

function quotaError(): Error {
  const err = new Error('The quota has been exceeded.') as Error & { code: number };
  err.name = 'QuotaExceededError';
  err.code = 22;
  return err;
}

/** Install a quota-limited localStorage on the global, replacing whatever is there. */
export function installQuotaStorage(limit: number): QuotaStorage {
  const values = new Map<string, string>();
  const used = () => {
    let total = 0;
    for (const [k, v] of values) total += k.length + v.length;
    return total;
  };
  const storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      const replacing = values.has(key) ? key.length + values.get(key)!.length : 0;
      if (used() - replacing + key.length + value.length > limit) throw quotaError();
      values.set(key, value);
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
    writable: true,
  });
  return {
    used,
    uninstall() {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    },
  };
}
