/// <reference lib="webworker" />
import { extractOfficeDiagnosticFromBytes } from './officeDoc';
import { extractTextPagesFromBytes } from './textDoc';

interface ExtractRequest {
  id: number;
  kind: 'office' | 'text';
  name: string;
  mime: string;
  file?: File;
  bytes?: ArrayBuffer;
  data?: string;
  returnBytes?: boolean;
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A worker that reads its payload outside its try has no way to answer the caller waiting on that
 *  id, so every field the handler branches on is checked here rather than trusted: `new Uint8Array`
 *  reads a `bytes` of the wrong type as zero bytes, which would come back as a confident `ok: true`
 *  over an empty document. The byte sources themselves stay the try block's business — a structured
 *  clone can only ever hand them data, never something to call. */
function asRequest(id: number, payload: Record<string, unknown>): ExtractRequest | null {
  const { kind, name, mime, file, bytes, data, returnBytes } = payload;
  if (kind !== 'office' && kind !== 'text') return null;
  if (typeof name !== 'string' || typeof mime !== 'string') return null;
  if (file !== undefined && !(file instanceof File)) return null;
  if (bytes !== undefined && !(bytes instanceof ArrayBuffer)) return null;
  if (data !== undefined && typeof data !== 'string') return null;
  return { id, kind, name, mime, file, bytes, data, returnBytes: returnBytes === true };
}

self.onmessage = async (event: MessageEvent<unknown>) => {
  // A dedicated worker is reachable only from the page that constructed it, and those
  // messages carry an empty origin — anything else was opened by somebody else.
  if (event.origin && event.origin !== self.location.origin) return;
  const payload = event.data;
  // The main thread matches every reply by id, so a payload carrying none has no caller to answer
  // and is dropped. Worth being careful about: this handler is async, so a throw out of it is an
  // unhandled rejection that posts nothing — the client's pending entry for that id never settles
  // and the attachment hangs, where a posted failure would have fallen back to the main thread.
  if (!isRecord(payload) || typeof payload.id !== 'number') return;
  const id = payload.id;
  const request = asRequest(id, payload);
  if (!request) {
    self.postMessage({ id, ok: false, error: 'Malformed extraction request' });
    return;
  }
  // The failure path below reads only these locals: a catch that reaches back into the payload it is
  // handling the failure of can throw out of itself, and a throw here posts no reply at all.
  const { returnBytes } = request;
  let buffer: ArrayBuffer | undefined;
  try {
    const sourceBuffer: ArrayBuffer = request.file
      ? await request.file.arrayBuffer()
      : (request.bytes ?? (decodeBase64(request.data ?? '').buffer as ArrayBuffer));
    buffer = sourceBuffer;
    const bytes = new Uint8Array(sourceBuffer);
    const result =
      request.kind === 'office'
        ? await extractOfficeDiagnosticFromBytes(request.name, bytes)
        : extractTextPagesFromBytes(request.name, request.mime, bytes);
    const transfer: Transferable[] = returnBytes ? [sourceBuffer] : [];
    self.postMessage(
      { id, ok: true, result, bytes: returnBytes ? sourceBuffer : undefined },
      { transfer },
    );
  } catch (error) {
    const transfer: Transferable[] = returnBytes && buffer ? [buffer] : [];
    self.postMessage(
      {
        id,
        ok: false,
        error: error instanceof Error ? error.message : 'Document extraction failed',
        bytes: returnBytes ? buffer : undefined,
      },
      { transfer },
    );
  }
};

export {};
