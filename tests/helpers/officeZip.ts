// tests/helpers/officeZip.ts — build minimal in-memory ZIP archives (the format .docx/.pptx/.xlsx
// are) so Office-extraction tests don't need a real Word/PowerPoint/Excel file on disk. Two builders:
// a STORED (uncompressed) ZIP for quick cases, and a DEFLATE + data-descriptor ZIP that mimics exactly
// how real PowerPoint/Word/Excel/Google exports stream their entries (local header sizes zeroed, true
// sizes only in the central directory + a trailing descriptor) — the shape that once broke the reader.
import type { Attachment } from '../../src/live/attachments';

/** Build a minimal STORED-method ZIP from {name: contents}. Enough of the spec for our reader. */
export function makeZip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
  const u32 = (n: number) =>
    new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
  const concat = (arrs: Uint8Array[]) => {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const a of arrs) {
      out.set(a, p);
      p += a.length;
    }
    return out;
  };

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(content);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0), // method 0 (stored)
      u16(0),
      u16(0), // time/date
      u32(0), // crc (ignored by our reader)
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    parts.push(local);
    central.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    offset += local.length;
  }

  const cd = concat(central);
  const cdStart = offset;
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(central.length),
    u16(central.length),
    u32(cd.length),
    u32(cdStart),
    u16(0),
  ]);
  return concat([...parts, cd, eocd]);
}

export function toAttachment(name: string, zip: Uint8Array): Attachment {
  let bin = '';
  for (const b of zip) bin += String.fromCharCode(b);
  return { name, mime: '', data: btoa(bin), size: zip.length };
}

/** CRC-32 (the ZIP polynomial) — needed for a spec-valid data descriptor. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    let c = (crc ^ bytes[i]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Compress with the platform's deflate-raw (the inverse of what officeDoc inflates with). */
export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  });
  const buf = await new Response(
    src.pipeThrough(cs as unknown as ReadableWritablePair),
  ).arrayBuffer();
  return new Uint8Array(buf);
}

/** Build a DEFLATE ZIP with the data-descriptor flag set and the LOCAL header sizes ZEROED — exactly
 *  how PowerPoint/Word/Excel/Google streaming-export write real files. The true sizes live only in the
 *  central directory + a trailing descriptor, so a reader that trusts the local header gets nothing. */
export async function makeDeflateDataDescriptorZip(
  files: Record<string, string>,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
  const u32 = (n: number) =>
    new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
  const concat = (arrs: Uint8Array[]) => {
    const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
    let p = 0;
    for (const a of arrs) {
      out.set(a, p);
      p += a.length;
    }
    return out;
  };

  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(content);
    const comp = await deflateRaw(data);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0008), // GP flag bit 3 → data descriptor present
      u16(8), // method 8 (deflate)
      u16(0),
      u16(0),
      u32(0), // crc 0 in local header
      u32(0), // compSize 0 in local header  ← the real-world trap
      u32(0), // uncompSize 0 in local header
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      comp,
      // data descriptor (sig + crc + compSize + uncompSize) AFTER the data
      u32(0x08074b50),
      u32(crc),
      u32(comp.length),
      u32(data.length),
    ]);
    parts.push(local);
    central.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0008),
        u16(8),
        u16(0),
        u16(0),
        u32(crc),
        u32(comp.length), // central dir carries the REAL compressed size
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    offset += local.length;
  }
  const cd = concat(central);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(central.length),
    u16(central.length),
    u32(cd.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...parts, cd, eocd]);
}
