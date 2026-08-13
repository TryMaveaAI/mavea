import type * as Mediabunny from 'mediabunny';

const MAX_BUFFERED_VIDEO_BYTES = 192 * 1024 * 1024;
const STALE_TEMPORARY_VIDEO_MS = 24 * 60 * 60 * 1_000;
const MAX_SCANNED_TEMPORARY_ENTRIES = 256;
const MAX_REMOVED_TEMPORARY_VIDEOS = 32;
const TEMPORARY_VIDEO_NAME = /^mavea-video-(\d{13})-[a-z0-9]+[.](?:webm|mp4)$/;
const scavengedRoots = new WeakSet<FileSystemDirectoryHandle>();

interface TemporaryFile {
  handle: FileSystemFileHandle;
  name: string;
  root: FileSystemDirectoryHandle;
  writable: FileSystemWritableFileStream;
}

/**
 * Best-effort crash recovery for video files that normal disposal never got to remove. The exact
 * name, age, scan, and removal bounds are all deliberate: an export must never walk or erase an
 * operator's unrelated origin-private data without limit.
 */
export async function scavengeStaleTemporaryVideoFiles(
  root: FileSystemDirectoryHandle,
  now = Date.now(),
): Promise<number> {
  let scanned = 0;
  let removed = 0;
  try {
    const entries = root.entries();
    try {
      while (scanned < MAX_SCANNED_TEMPORARY_ENTRIES) {
        const next = await entries.next();
        if (next.done) break;
        scanned += 1;
        const [name, handle] = next.value;
        if (removed >= MAX_REMOVED_TEMPORARY_VIDEOS || handle.kind !== 'file') continue;
        const match = TEMPORARY_VIDEO_NAME.exec(name);
        if (!match) continue;
        const createdAt = Number(match[1]);
        if (!Number.isSafeInteger(createdAt) || now - createdAt < STALE_TEMPORARY_VIDEO_MS)
          continue;
        try {
          await root.removeEntry(name);
          removed += 1;
        } catch {
          // A concurrent tab may already have removed it, or storage access may have changed.
        }
      }
    } finally {
      await entries.return?.();
    }
  } catch {
    // Enumeration is optional browser storage work; it must never block a new export.
  }
  return removed;
}

function scheduleStaleTemporaryVideoScavenge(root: FileSystemDirectoryHandle): void {
  if (scavengedRoots.has(root)) return;
  scavengedRoots.add(root);
  void scavengeStaleTemporaryVideoFiles(root);
}

async function temporaryFile(extension: 'webm' | 'mp4' = 'webm'): Promise<TemporaryFile | null> {
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (!storage?.getDirectory) return null;
  try {
    const root = await storage.getDirectory();
    scheduleStaleTemporaryVideoScavenge(root);
    const name = `mavea-video-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const handle = await root.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    return { handle, name, root, writable };
  } catch {
    return null;
  }
}

export interface FileBackedTarget {
  target: Mediabunny.Target;
  finish: () => Promise<{ blob: Blob; dispose: () => Promise<void> }>;
  discard: () => Promise<void>;
}

/** Stream a muxer directly into origin-private storage so file size never becomes JS heap size. */
export async function fileBackedTarget(
  StreamTarget: typeof Mediabunny.StreamTarget,
  container: 'webm' | 'mp4' = 'webm',
): Promise<FileBackedTarget | null> {
  const file = await temporaryFile(container);
  if (!file) return null;
  return {
    target: new StreamTarget(
      file.writable as unknown as WritableStream<Mediabunny.StreamTargetChunk>,
      { chunked: true, chunkSize: 4 * 1024 * 1024 },
    ),
    async finish() {
      const blob = await file.handle.getFile();
      return {
        blob,
        dispose: () => file.root.removeEntry(file.name).catch(() => {}),
      };
    },
    async discard() {
      await file.writable.abort().catch(() => {});
      await file.root.removeEntry(file.name).catch(() => {});
    },
  };
}

export interface RecorderChunkStore {
  write: (chunk: Blob) => void;
  finish: () => Promise<{ blob: Blob; dispose?: () => Promise<void> }>;
  discard: () => Promise<void>;
}

/** MediaRecorder has no encoder backpressure API. OPFS keeps its periodic chunks off-heap; where
 *  OPFS is unavailable, a hard cap prevents a long recording from exhausting the process. */
export async function recorderChunkStore(): Promise<RecorderChunkStore> {
  const file = await temporaryFile();
  if (file) {
    let discarded = false;
    let failure: Error | null = null;
    let writes = Promise.resolve();
    return {
      write(chunk) {
        if (discarded || !chunk.size) return;
        writes = writes
          .then(() => file.writable.write(chunk))
          .catch((error: unknown) => {
            failure = error instanceof Error ? error : new Error('temporary-video-write-failed');
          });
      },
      async finish() {
        await writes;
        if (failure) throw failure;
        await file.writable.close();
        return {
          blob: await file.handle.getFile(),
          dispose: () => file.root.removeEntry(file.name).catch(() => {}),
        };
      },
      async discard() {
        discarded = true;
        await writes.catch(() => {});
        await file.writable.abort().catch(() => {});
        await file.root.removeEntry(file.name).catch(() => {});
      },
    };
  }

  const chunks: Blob[] = [];
  let total = 0;
  let failure: Error | null = null;
  let discarded = false;
  return {
    write(chunk) {
      if (discarded || !chunk.size || failure) return;
      total += chunk.size;
      if (total > MAX_BUFFERED_VIDEO_BYTES) {
        failure = new Error('temporary-video-storage-unavailable');
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    },
    async finish() {
      if (failure) throw failure;
      return { blob: new Blob(chunks, { type: 'video/webm' }) };
    },
    async discard() {
      discarded = true;
      chunks.length = 0;
    },
  };
}
