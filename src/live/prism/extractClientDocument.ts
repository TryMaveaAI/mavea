import { attachmentBytes, type Attachment } from '../attachments';
import { extractOfficeDiagnosticFromBytes, type OfficeExtract } from './officeDoc';
import { extractTextPagesFromBytes } from './textDoc';

type ExtractionKind = 'office' | 'text';
interface ExtractionReply {
  id: number;
  ok: boolean;
  result?: OfficeExtract | string[] | null;
  error?: string;
  bytes?: ArrayBuffer;
}

interface Pending {
  attachment: Attachment;
  resolve: (value: OfficeExtract | string[] | null) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./prismExtract.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ExtractionReply>) => {
      const reply = event.data;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.bytes) entry.attachment.bytes = reply.bytes;
      if (reply.ok) entry.resolve(reply.result ?? null);
      else entry.reject(new Error(reply.error ?? 'Document extraction failed'));
    };
    worker.onerror = () => {
      const error = new Error('Document extraction worker failed');
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

function runWorker(
  kind: ExtractionKind,
  attachment: Attachment,
): Promise<OfficeExtract | string[] | null> | null {
  const target = getWorker();
  if (!target) return null;
  const id = (nextId += 1);
  const transferableBytes = attachment.bytes;
  const request = {
    id,
    kind,
    name: attachment.name,
    mime: attachment.mime,
    ...(attachment.file ? { file: attachment.file } : {}),
    ...(transferableBytes ? { bytes: transferableBytes, returnBytes: true } : {}),
    ...(!attachment.file && !transferableBytes ? { data: attachment.data } : {}),
  };
  const transfer = transferableBytes ? [transferableBytes] : [];
  if (transferableBytes) attachment.bytes = undefined;
  return new Promise((resolve, reject) => {
    pending.set(id, { attachment, resolve, reject });
    try {
      target.postMessage(request, transfer);
    } catch (error) {
      pending.delete(id);
      if (transferableBytes && transferableBytes.byteLength > 0) {
        attachment.bytes = transferableBytes;
      }
      reject(error instanceof Error ? error : new Error('Could not start document extraction'));
    }
  });
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function fallback(
  kind: ExtractionKind,
  attachment: Attachment,
): Promise<OfficeExtract | string[] | null> {
  await yieldToMain();
  const bytes = await attachmentBytes(attachment);
  await yieldToMain();
  return kind === 'office'
    ? extractOfficeDiagnosticFromBytes(attachment.name, bytes)
    : extractTextPagesFromBytes(attachment.name, attachment.mime, bytes);
}

export async function extractOfficeOffMain(attachment: Attachment): Promise<OfficeExtract> {
  const task = runWorker('office', attachment);
  try {
    return (task ? await task : await fallback('office', attachment)) as OfficeExtract;
  } catch {
    return (await fallback('office', attachment)) as OfficeExtract;
  }
}

export async function extractTextOffMain(attachment: Attachment): Promise<string[] | null> {
  const task = runWorker('text', attachment);
  try {
    return (task ? await task : await fallback('text', attachment)) as string[] | null;
  } catch {
    return (await fallback('text', attachment)) as string[] | null;
  }
}
