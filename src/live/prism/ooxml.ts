// ooxml.ts — the ZIP + XML plumbing every Office reader in prism/ shares: reading a .docx/.pptx/
// .xlsx's ZIP central directory, inflating its entries, and decoding an OOXML part to text. Kept apart
// from officeDoc.ts (which owns the docx/pptx text readers) and sheetModel.ts (which owns workbook/
// sheet structure) so neither has to import the other — both import this instead. Zero new runtime
// dependencies: the browser's native DecompressionStream does the inflating.

/** Decode a base64 attachment body into bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Read a ZIP archive into a name→bytes map. Parses the End Of Central Directory record and the
 * central directory so we get every entry's name, compression method, and offset, then inflates each
 * with DecompressionStream. Supports the only two methods Office uses: 0 (stored) and 8 (deflate).
 * Returns null if the bytes aren't a ZIP we can read.
 */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array> | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find the End Of Central Directory signature (0x06054b50), scanning back from the end (the EOCD
  // has a variable-length comment, so it isn't at a fixed offset).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entryCount = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true); // start of central directory

  // Read sizes + method from the CENTRAL DIRECTORY, which is authoritative. Real PowerPoint/Word
  // files are written in streaming mode (general-purpose flag bit 3 set), so the LOCAL header's
  // compressed/uncompressed sizes are 0 — the true sizes live here and in a trailing data descriptor.
  // Trusting the local header's compSize there yields an empty slice and an empty document.
  const entries: { name: string; method: number; offset: number; compSize: number }[] = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, offset: localOffset, compSize });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const out = new Map<string, Uint8Array>();
  let inflated = 0;
  for (const e of entries) {
    // Local file header: 30 bytes + name + extra, then the (compressed) data. The header's own
    // name/extra lengths can differ from the central directory's, so read them from the local record;
    // the compressed SIZE comes from the central directory (see above).
    const lo = e.offset;
    if (view.getUint32(lo, true) !== 0x04034b50) continue;
    const nameLen = view.getUint16(lo + 26, true);
    const extraLen = view.getUint16(lo + 28, true);
    const dataStart = lo + 30 + nameLen + extraLen;
    // Copy (not subarray) so each entry is a standalone, tightly-bounded buffer — see inflateRaw.
    const comp = bytes.slice(dataStart, dataStart + e.compSize);
    try {
      const body = e.method === 0 ? comp : await inflateRaw(comp, MAX_INFLATED_BYTES - inflated);
      inflated += body.byteLength;
      // The archive as a whole has now claimed more room than any real document could need. Stop
      // rather than keep feeding it: an attacker controls the ratio, not us.
      if (inflated > MAX_INFLATED_BYTES) return null;
      out.set(e.name, body);
    } catch {
      /* skip an entry we can't inflate — text from the others is still useful */
    }
  }
  return out;
}

/** What the whole archive may expand to. The upload gate caps the file at 40MB COMPRESSED, which
 *  says nothing about what it becomes: DEFLATE reaches ~1000:1 on adversarially repetitive input, so
 *  an innocuous-looking 40MB .docx can ask the tab for tens of gigabytes and take it down. No real
 *  Office document or data room comes anywhere near this, so a file that does is not a document. */
const MAX_INFLATED_BYTES = 200 * 1024 * 1024;

/** Inflate raw DEFLATE data using the browser's native DecompressionStream, refusing to produce more
 *  than `limit` bytes. Read chunk by chunk rather than with Response.arrayBuffer(), because the whole
 *  point is to stop mid-stream — buffering the result first and measuring it afterwards is exactly
 *  the allocation we are trying not to make. */
async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  if (limit <= 0) throw new Error('inflate budget exhausted');
  const ds = new DecompressionStream('deflate-raw');
  // `data` is a subarray VIEW into the whole-file buffer. Some engines (Chromium's
  // DecompressionStream among them) read the enqueued chunk's entire backing ArrayBuffer, ignoring
  // byteOffset/byteLength — which feeds the inflater the rest of the ZIP and corrupts the result (or
  // throws). Copy into a fresh, tightly-sized buffer so exactly compSize bytes are decompressed.
  const exact = data.slice();
  const src = new ReadableStream({
    start(controller) {
      controller.enqueue(exact);
      controller.close();
    },
  });

  const reader = (
    src.pipeThrough(ds as unknown as ReadableWritablePair) as ReadableStream<Uint8Array>
  ).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error('entry expands past the archive budget');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const outBuf = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    outBuf.set(c, at);
    at += c.byteLength;
  }
  return outBuf;
}

/**
 * Decode an OOXML part to a string, honoring its encoding. PowerPoint/Word frequently write parts as
 * UTF-16 (with a BOM); decoding those as UTF-8 yields text interleaved with NUL bytes, which then
 * collapses to nothing once tags are stripped — the "77 entries, real bytes, zero text" failure. We
 * sniff the byte-order mark first (authoritative), then fall back to the `encoding="…"` declaration,
 * then UTF-8. TextDecoder strips the BOM itself.
 */
export function decodeXml(bytes: Uint8Array): string {
  // BOM sniff: UTF-16 LE (FF FE), UTF-16 BE (FE FF), UTF-8 (EF BB BF) → default UTF-8.
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  // No UTF-16 BOM: decode as UTF-8 (covers a UTF-8 BOM too), then respect an explicit UTF-16
  // declaration in the prolog for the rare BOM-less UTF-16 file.
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  const decl = utf8.slice(0, 120).match(/encoding=["']([\w-]+)["']/i);
  if (decl && /^utf-?16/i.test(decl[1])) {
    try {
      return new TextDecoder('utf-16le').decode(bytes);
    } catch {
      /* fall through to the UTF-8 reading */
    }
  }
  return utf8;
}
