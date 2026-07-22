// synthesis/ingestZip.ts — turn a dropped .zip (a "data room" / a folder of papers) into the many
// per-file sources a Synthesis World needs, entirely client-side. It reuses Prism's own zero-dependency
// ZIP reader (officeDoc.readZip — the same DecompressionStream path that reads .docx/.pptx), so a data
// room becomes a corpus with no new runtime dependency and nothing sent to a server. Only explodable
// entries (PDF / Office / text-data) survive; junk (directories, dotfiles, __MACOSX) is dropped.
import { readZip, base64ToBytes } from '../officeDoc';
import { attachmentBytes, isExplodable, type Attachment } from '../../attachments';
import { MAX_CORPUS_SOURCES, SKIP_PATH } from './ingest';

const OFFICE_MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** A MIME good enough for the type guards: PDFs need the real MIME (isPdf checks it), Office/text are
 *  detected by extension too, so an empty MIME still routes them correctly. */
function mimeForName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  return OFFICE_MIME[ext] ?? '';
}

/** Base64-encode bytes in chunks so a large file never overflows the call stack of String.fromCharCode. */
/** Expand a .zip attachment into its explodable member files as corpus sources. Returns [] when the
 *  bytes aren't a readable ZIP. Never throws — a bad entry is skipped, the rest still come through.
 *
 *  Two bounds keep an archive honest. The junk filter (SKIP_PATH, the same one a folder drop uses)
 *  drops a zipped project's node_modules/, dist/ and .git/ — they're explodable by extension, so
 *  without it a zipped repo silently filled the corpus with dependency source. And the source cap
 *  stops encoding once the corpus is full: every member survives as a base64 copy in memory, so an
 *  archive of thousands of files would otherwise pay for all of them before the staging cap threw
 *  the surplus away. */
export async function expandZip(zip: Attachment): Promise<Attachment[]> {
  let map: Map<string, Uint8Array> | null;
  try {
    map = await readZip(zip.data ? base64ToBytes(zip.data) : await attachmentBytes(zip));
  } catch {
    return [];
  }
  if (!map) return [];
  const out: Attachment[] = [];
  for (const [path, data] of map) {
    if (out.length >= MAX_CORPUS_SOURCES) break;
    if (path.endsWith('/') || data.length === 0) continue; // directory / empty
    if (SKIP_PATH.test(path)) continue; // dependency tree / build output / VCS / OS cruft
    const name = path.split('/').pop() ?? path;
    if (!name || name.startsWith('.')) continue; // dotfile
    const att: Attachment = {
      name,
      mime: mimeForName(name),
      data: '',
      size: data.length,
      bytes: Uint8Array.from(data).buffer as ArrayBuffer,
    };
    if (isExplodable(att)) out.push(att);
  }
  return out;
}

/** True when an attachment is a ZIP archive (by MIME or extension) — the "synthesize this archive" gate. */
export function isZip(a: Attachment): boolean {
  return (
    a.mime === 'application/zip' ||
    a.mime === 'application/x-zip-compressed' ||
    /\.zip$/i.test(a.name)
  );
}
