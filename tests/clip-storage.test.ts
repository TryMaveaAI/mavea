import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Mediabunny from 'mediabunny';
import {
  fileBackedTarget,
  recorderChunkStore,
  scavengeStaleTemporaryVideoFiles,
} from '../src/clip/storage';

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');

function setStorage(value: unknown): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value });
}

afterEach(() => {
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage);
  else Reflect.deleteProperty(navigator, 'storage');
  vi.restoreAllMocks();
});

describe('video temporary storage', () => {
  it('removes only old Mavéa video files and leaves recent, unrelated, and directory entries alone', async () => {
    const now = new Date('2026-08-11T12:00:00Z').getTime();
    const old = now - 25 * 60 * 60 * 1_000;
    const recent = now - 23 * 60 * 60 * 1_000;
    const entries: Array<[string, { kind: 'file' | 'directory' }]> = [
      [`mavea-video-${old}-old.webm`, { kind: 'file' }],
      [`mavea-video-${old}-old.mp4`, { kind: 'file' }],
      [`mavea-video-${recent}-recent.webm`, { kind: 'file' }],
      [`another-app-${old}-old.webm`, { kind: 'file' }],
      [`mavea-video-${old}-folder.webm`, { kind: 'directory' }],
      ['mavea-video-not-a-timestamp.webm', { kind: 'file' }],
    ];
    const removeEntry = vi.fn(async (_name: string) => {});
    const root = {
      async *entries() {
        yield* entries;
      },
      removeEntry,
    } as unknown as FileSystemDirectoryHandle;

    await expect(scavengeStaleTemporaryVideoFiles(root, now)).resolves.toBe(2);
    expect(removeEntry.mock.calls.map(([name]) => name)).toEqual([
      `mavea-video-${old}-old.webm`,
      `mavea-video-${old}-old.mp4`,
    ]);
  });

  it('bounds stale-file removals in one pass', async () => {
    const now = new Date('2026-08-11T12:00:00Z').getTime();
    const old = now - 25 * 60 * 60 * 1_000;
    const removeEntry = vi.fn(async () => {});
    const root = {
      async *entries() {
        for (let index = 0; index < 40; index += 1) {
          yield [`mavea-video-${old}-${index}.webm`, { kind: 'file' }] as const;
        }
      },
      removeEntry,
    } as unknown as FileSystemDirectoryHandle;

    await expect(scavengeStaleTemporaryVideoFiles(root, now)).resolves.toBe(32);
    expect(removeEntry).toHaveBeenCalledTimes(32);
  });

  it('bounds the number of origin-private directory entries scanned in one pass', async () => {
    let visited = 0;
    const root = {
      async *entries() {
        for (let index = 0; index < 300; index += 1) {
          visited += 1;
          yield [`unrelated-${index}`, { kind: 'file' }] as const;
        }
      },
      removeEntry: vi.fn(async (_name: string) => {}),
    } as unknown as FileSystemDirectoryHandle;

    await expect(scavengeStaleTemporaryVideoFiles(root)).resolves.toBe(0);
    expect(visited).toBe(256);
  });

  it('streams muxer output into a chunked origin-private file and removes it on disposal', async () => {
    const writable = { abort: vi.fn(async () => {}) };
    const file = new Blob(['webm'], { type: 'video/webm' });
    const handle = {
      createWritable: vi.fn(async () => writable),
      getFile: vi.fn(async () => file),
    };
    const root = {
      entries: vi.fn(() => ({
        [Symbol.asyncIterator]() {
          return {
            next: async () => {
              throw new Error('storage enumeration denied');
            },
          };
        },
      })),
      getFileHandle: vi.fn(async () => handle),
      removeEntry: vi.fn(async () => {}),
    };
    setStorage({ getDirectory: vi.fn(async () => root) });

    class FakeStreamTarget {
      constructor(
        public readonly stream: unknown,
        public readonly options: unknown,
      ) {}
    }

    const target = await fileBackedTarget(
      FakeStreamTarget as unknown as typeof Mediabunny.StreamTarget,
    );
    expect(root.entries).toHaveBeenCalledOnce();
    expect(target?.target).toEqual(
      expect.objectContaining({
        stream: writable,
        options: { chunked: true, chunkSize: 4 * 1024 * 1024 },
      }),
    );
    const stored = await target?.finish();
    expect(stored?.blob).toBe(file);
    await stored?.dispose();
    expect(root.removeEntry).toHaveBeenCalledTimes(1);
  });

  it('serializes MediaRecorder writes before closing the temporary file', async () => {
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const writable = {
      write: vi
        .fn()
        .mockImplementationOnce(() => firstWrite)
        .mockImplementationOnce(async () => {}),
      close: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
    };
    const handle = {
      createWritable: vi.fn(async () => writable),
      getFile: vi.fn(async () => new Blob(['complete'], { type: 'video/webm' })),
    };
    const root = {
      getFileHandle: vi.fn(async () => handle),
      removeEntry: vi.fn(async () => {}),
    };
    setStorage({ getDirectory: vi.fn(async () => root) });

    const store = await recorderChunkStore();
    store.write(new Blob(['one']));
    store.write(new Blob(['two']));
    await Promise.resolve();
    expect(writable.write).toHaveBeenCalledTimes(1);

    releaseFirst();
    const stored = await store.finish();
    expect(writable.write).toHaveBeenCalledTimes(2);
    expect(writable.close).toHaveBeenCalledTimes(1);
    expect(stored.blob.size).toBeGreaterThan(0);
  });

  it('fails closed instead of growing memory without bound when private storage is unavailable', async () => {
    setStorage(undefined);
    const store = await recorderChunkStore();
    store.write({ size: 193 * 1024 * 1024 } as Blob);
    await expect(store.finish()).rejects.toThrow('temporary-video-storage-unavailable');
  });

  it('ignores a final recorder event that arrives after cancellation', async () => {
    setStorage(undefined);
    const store = await recorderChunkStore();
    await store.discard();
    store.write(new Blob(['late encoder chunk']));
    await expect(store.finish()).resolves.toEqual({
      blob: expect.objectContaining({ size: 0 }),
    });
  });
});
