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

self.onmessage = async (event: MessageEvent<ExtractRequest>) => {
  const request = event.data;
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
    const transfer: Transferable[] = request.returnBytes ? [sourceBuffer] : [];
    self.postMessage(
      { id: request.id, ok: true, result, bytes: request.returnBytes ? sourceBuffer : undefined },
      { transfer },
    );
  } catch (error) {
    const transfer: Transferable[] = request.returnBytes && buffer ? [buffer] : [];
    self.postMessage(
      {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Document extraction failed',
        bytes: request.returnBytes ? buffer : undefined,
      },
      { transfer },
    );
  }
};

export {};
