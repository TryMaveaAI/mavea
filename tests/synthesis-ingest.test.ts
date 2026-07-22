import { describe, expect, it } from 'vitest';
import { expandZip, isZip } from '../src/live/prism/synthesis/ingestZip';
import { MAX_CORPUS_SOURCES } from '../src/live/prism/synthesis/ingest';
import type { Attachment } from '../src/live/attachments';

// Expanding a dropped .zip ("a data room") into per-file sources reuses Prism's zero-dep ZIP reader.
// This builds a real STORED zip (method 0, no dependency on DecompressionStream) and pins that only
// the explodable members survive, decoded correctly.

/** Build a minimal STORED (uncompressed) ZIP from name→text entries. */
function makeStoredZip(files: { name: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.content);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); // method 0 (stored)
    lv.setUint32(18, data.length, true); // compSize
    lv.setUint32(22, data.length, true); // uncompSize
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true); // method 0
    cv.setUint32(20, data.length, true); // compSize
    cv.setUint32(24, data.length, true); // uncompSize
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const cdOffset = offset;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);

  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const l of locals) {
    out.set(l, p);
    p += l.length;
  }
  for (const c of centrals) {
    out.set(c, p);
    p += c.length;
  }
  out.set(eocd, p);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

describe('expandZip', () => {
  it('keeps only explodable members and decodes their bytes', async () => {
    const zipBytes = makeStoredZip([
      { name: 'paper.txt', content: 'efficacy improved markedly in the trial' },
      { name: 'notes.md', content: '# meeting notes\ncost dispute' },
      { name: 'logo.png', content: 'PNGDATA' }, // an image → not explodable → dropped
      { name: '__MACOSX/paper.txt', content: 'junk' }, // macOS cruft → dropped
    ]);
    const zip: Attachment = {
      name: 'data-room.zip',
      mime: 'application/zip',
      data: bytesToBase64(zipBytes),
      size: zipBytes.length,
    };
    const out = await expandZip(zip);
    expect(out.map((a) => a.name).sort()).toEqual(['notes.md', 'paper.txt']);
    const paper = out.find((a) => a.name === 'paper.txt')!;
    expect(new TextDecoder().decode(paper.bytes)).toBe('efficacy improved markedly in the trial');
  });

  it('recognizes a zip by mime or extension, and returns [] on garbage', async () => {
    expect(isZip({ name: 'x.zip', mime: '', data: '', size: 0 })).toBe(true);
    expect(isZip({ name: 'x.pdf', mime: 'application/pdf', data: '', size: 0 })).toBe(false);
    expect(
      await expandZip({
        name: 'bad.zip',
        mime: 'application/zip',
        data: btoa('not a zip'),
        size: 8,
      }),
    ).toEqual([]);
  });

  // A zipped PROJECT folder is a data room people really drop, and its noise is explodable by
  // extension: node_modules/*.js, dist/*.js and .git internals all sailed through as "sources",
  // crowding the real documents out from under the corpus cap. A folder drop has always filtered
  // them (ingest.ts's SKIP_PATH); the archive path now uses the very same rule.
  it('drops a zipped project’s dependency tree, build output and VCS internals', async () => {
    const zipBytes = makeStoredZip([
      { name: 'papers/alpha.txt', content: 'efficacy improved markedly in the trial' },
      { name: 'node_modules/left-pad/index.js', content: 'module.exports = 1;' },
      { name: 'dist/bundle.js', content: 'var a=1;' },
      { name: 'build/out.js', content: 'var b=2;' },
      { name: '.git/config', content: '[core]' },
      { name: 'src/.venv/lib/thing.py', content: 'x = 1' },
      { name: 'reports/__MACOSX/paper.txt', content: 'junk' }, // nested cruft, not just at the root
    ]);
    const out = await expandZip({
      name: 'repo.zip',
      mime: 'application/zip',
      data: bytesToBase64(zipBytes),
      size: zipBytes.length,
    });
    expect(out.map((a) => a.name)).toEqual(['alpha.txt']);
  });

  // Every surviving member is held in memory, so an archive of thousands of files must stop at the
  // corpus cap rather than decode them all and let the staging step throw the surplus away later.
  it('stops at the corpus source cap instead of decoding the whole archive', async () => {
    const zipBytes = makeStoredZip(
      Array.from({ length: MAX_CORPUS_SOURCES + 25 }, (_, i) => ({
        name: `notes/n${i}.txt`,
        content: `note ${i}`,
      })),
    );
    const out = await expandZip({
      name: 'huge.zip',
      mime: 'application/zip',
      data: bytesToBase64(zipBytes),
      size: zipBytes.length,
    });
    expect(out).toHaveLength(MAX_CORPUS_SOURCES);
  });
});
