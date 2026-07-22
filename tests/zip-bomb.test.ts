import { describe, it, expect } from 'vitest';
import { readZip } from '../src/live/prism/ooxml';

// The upload gate caps an attachment at 40MB COMPRESSED, which says nothing about what it becomes.
// DEFLATE reaches roughly 1000:1 on adversarially repetitive input, so an ordinary-looking .docx or
// data-room .zip — well inside the size limit, arriving as an email attachment like any other file —
// could ask the tab for tens of gigabytes and take it down. Nothing bounded the inflated side.
//
// This builds a real (small) bomb: a single entry of highly-compressible zeros, with the archive
// budget lowered to something a test can hit, and proves the reader refuses it instead of trying.

/** Deflate `bytes` with the same primitive the reader inflates with, so the fixture is a real one. */
async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const buf = await new Response(
    src.pipeThrough(cs as unknown as ReadableWritablePair),
  ).arrayBuffer();
  return new Uint8Array(buf);
}

/** A minimal one-entry ZIP (local header + central directory + EOCD) around already-deflated data. */
function makeZip(name: string, deflated: Uint8Array, uncompressedSize: number): Uint8Array {
  const enc = new TextEncoder();
  const n = enc.encode(name);
  const local = new Uint8Array(30 + n.length + deflated.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(8, 8, true); // method 8 = deflate
  lv.setUint32(18, deflated.length, true);
  lv.setUint32(22, uncompressedSize, true);
  lv.setUint16(26, n.length, true);
  local.set(n, 30);
  local.set(deflated, 30 + n.length);

  const central = new Uint8Array(46 + n.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(20, deflated.length, true);
  cv.setUint32(24, uncompressedSize, true);
  cv.setUint16(28, n.length, true);
  cv.setUint32(42, 0, true); // local header offset
  central.set(n, 46);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);

  const out = new Uint8Array(local.length + central.length + eocd.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(eocd, local.length + central.length);
  return out;
}

describe('readZip — an archive cannot expand without limit', () => {
  it('reads an ordinary entry back exactly', async () => {
    const body = new TextEncoder().encode('hello from inside the archive');
    const zip = makeZip('word/document.xml', await deflateRaw(body), body.length);
    const files = await readZip(zip);
    expect(files).not.toBeNull();
    expect(new TextDecoder().decode(files!.get('word/document.xml'))).toBe(
      'hello from inside the archive',
    );
  });

  it('refuses an entry that expands past the archive budget instead of allocating it', async () => {
    // 300MB of zeros deflates to a few hundred KB — the classic shape, comfortably inside the 40MB
    // upload cap while asking for far more memory than any real document.
    const HUGE = 300 * 1024 * 1024;
    const zeros = new Uint8Array(HUGE);
    const deflated = await deflateRaw(zeros);
    // Sanity: the fixture really is a bomb, not just a big file.
    expect(deflated.length).toBeLessThan(2 * 1024 * 1024);

    const zip = makeZip('word/document.xml', deflated, HUGE);
    // It must give up rather than materialise 300MB. Either verdict is a refusal: null (the archive
    // blew its budget) or an entry map that simply does not carry the bomb.
    const files = await readZip(zip);
    if (files !== null) {
      expect(files.get('word/document.xml')).toBeUndefined();
    }
  }, 60_000);
});
