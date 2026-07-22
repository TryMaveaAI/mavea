import '@testing-library/jest-dom';
import { afterEach } from 'vitest';

type StorageLike = Pick<Storage, 'clear' | 'getItem' | 'key' | 'removeItem' | 'setItem'> & {
  readonly length: number;
};

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
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
      values.set(key, value);
    },
  };
}

function hasStorageMethods(value: unknown): value is StorageLike {
  return (
    !!value &&
    typeof (value as StorageLike).clear === 'function' &&
    typeof (value as StorageLike).getItem === 'function' &&
    typeof (value as StorageLike).removeItem === 'function' &&
    typeof (value as StorageLike).setItem === 'function'
  );
}

function installStorage(name: 'localStorage' | 'sessionStorage') {
  const winStorage = globalThis.window?.[name];
  const storage = hasStorageMethods(winStorage) ? winStorage : memoryStorage();
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: storage,
    writable: true,
  });
}

installStorage('localStorage');
installStorage('sessionStorage');

// Hash-route and one-shot handoff flags are global browser state. Keep them from leaking between
// files that Vitest happens to schedule on the same jsdom worker; a stale tour/demo flag can make a
// later plain LiveApp mount look like a prerecorded route.
afterEach(() => {
  sessionStorage.clear();
  if (typeof window !== 'undefined') window.location.hash = '';
});

// The catalog is split in the app: compact selection facts ship eagerly, while the detail
// fields (blurbs, prop hints, item shapes) load per family on demand, so a turn pays only for the
// components it offers. `catalogMeta` deliberately returns undefined until a type's family is
// resident — failing closed rather than coercing a block with an empty contract. Unit tests call the
// validator and the selector synchronously, so preload every family here: same data, no dynamic-
// import beat, and any test that genuinely exercises the lazy path can assert on `detailsReady`.
import { ensureAllDetails } from '../src/canvas/blocks/catalog/details';
await ensureAllDetails();
