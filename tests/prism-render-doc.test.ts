import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRenderDoc, destroyRenderDoc, pickRasterWidth } from '../src/live/prism/extractPdf';
import type { Attachment } from '../src/live/attachments';

// getRenderDoc caches ONE open pdf.js document (by attachment data) so flipping between claims on
// the same PDF doesn't re-parse it. Two bugs lived in that cache:
//   1. A rapid click from one document to ANOTHER (multi-PDF mode) while the first was still
//      opening used to hand back the FIRST document's promise regardless of which one was asked
//      for — the second claim's page would render against the wrong PDF.
//   2. Closing the panel (destroyRenderDoc) while an open was still in flight didn't stop that
//      open from landing in the cache afterward — a document could be resurrected past its
//      owner's lifetime and never get released.
// These pin the fix: a different document's open is serialized behind the current one, and a
// superseded open destroys itself instead of caching.

function attachment(name: string, data: string): Attachment {
  return { name, mime: 'application/pdf', data, size: 4 };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeDoc(): { destroy: ReturnType<typeof vi.fn> } {
  return { destroy: vi.fn().mockResolvedValue(undefined) };
}

afterEach(async () => {
  await destroyRenderDoc();
});

describe('getRenderDoc', () => {
  it('serializes opens across different documents instead of racing to the wrong one', async () => {
    const docA = fakeDoc();
    const docB = fakeDoc();
    const openA = deferred<typeof docA>();
    const openB = deferred<typeof docB>();
    const getDocument = vi
      .fn()
      .mockReturnValueOnce({ promise: openA.promise })
      .mockReturnValueOnce({ promise: openB.promise });
    const pdfjs = { getDocument };

    const a = attachment('a.pdf', 'AA==');
    const b = attachment('b.pdf', 'AQ==');

    const pA = getRenderDoc(a, pdfjs);
    const pB = getRenderDoc(b, pdfjs); // fired before A settles — must wait, not race in

    await Promise.resolve(); // let both microtask chains start
    expect(getDocument).toHaveBeenCalledTimes(1); // B hasn't opened yet — it's waiting on A

    openA.resolve(docA);
    expect(await pA).toBe(docA);

    openB.resolve(docB);
    expect(await pB).toBe(docB); // B gets its OWN document, never A's
    expect(getDocument).toHaveBeenCalledTimes(2);
    expect(docA.destroy).toHaveBeenCalledTimes(1); // the stale cached doc was released for B
  });

  it('reuses the cached document for the same attachment without reopening', async () => {
    const doc = fakeDoc();
    const getDocument = vi.fn().mockReturnValue({ promise: Promise.resolve(doc) });
    const pdfjs = { getDocument };
    const a = attachment('a.pdf', 'Ag==');

    const first = await getRenderDoc(a, pdfjs);
    const second = await getRenderDoc(a, pdfjs);
    expect(first).toBe(doc);
    expect(second).toBe(doc);
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it('releases a document whose open was still in flight when the panel closed', async () => {
    const doc = fakeDoc();
    const open = deferred<typeof doc>();
    const pdfjs = { getDocument: vi.fn().mockReturnValue({ promise: open.promise }) };
    const a = attachment('a.pdf', 'Aw==');

    const pending = getRenderDoc(a, pdfjs);
    await destroyRenderDoc(); // the panel closes before the open resolves
    open.resolve(doc);

    await expect(pending).rejects.toThrow();
    expect(doc.destroy).toHaveBeenCalledTimes(1); // released immediately, never cached
  });

  it('lets a new session open immediately when the previous document is still hung', async () => {
    const staleDoc = fakeDoc();
    const freshDoc = fakeDoc();
    const staleOpen = deferred<typeof staleDoc>();
    const getDocument = vi
      .fn()
      .mockReturnValueOnce({ promise: staleOpen.promise })
      .mockReturnValueOnce({ promise: Promise.resolve(freshDoc) });
    const pdfjs = { getDocument };

    const stale = getRenderDoc(attachment('stale.pdf', 'BA=='), pdfjs);
    await destroyRenderDoc();
    await expect(getRenderDoc(attachment('fresh.pdf', 'BQ=='), pdfjs)).resolves.toBe(freshDoc);

    staleOpen.resolve(staleDoc);
    await expect(stale).rejects.toThrow('superseded');
    expect(staleDoc.destroy).toHaveBeenCalledTimes(1);
    expect(getDocument).toHaveBeenCalledTimes(2);
  });
});

// pickRasterWidth sizes the source-page canvas for the panel it's ACTUALLY shown in, instead of a
// fixed guess. The old fixed 1200px target went soft (upscaled) the moment a panel — a generous
// divider split, or the whole page on an ultrawide monitor — rendered wider than that in CSS pixels;
// it also over-rasterized a narrow phone panel for no benefit. These pin the three regimes.
describe('pickRasterWidth', () => {
  it('gives a narrow panel headroom without a huge canvas', () => {
    expect(pickRasterWidth(320)).toBe(600); // floored — 320*1.15 would undershoot readability
  });

  it('scales up for a wide panel instead of upscaling a fixed-size bitmap', () => {
    // a panel comfortably past the old fixed 1200px guess must raster WIDER than that guess, or the
    // page renders soft on exactly the screens most likely to show it large.
    expect(pickRasterWidth(1500)).toBeGreaterThan(1200);
    expect(pickRasterWidth(1500)).toBe(1725);
  });

  it('caps an extreme width (ultrawide, divider dragged to "PDF-only") so raster stays bounded', () => {
    expect(pickRasterWidth(4000)).toBe(1900);
  });

  it('falls back to a sane default for a non-positive or not-yet-measured width', () => {
    expect(pickRasterWidth(0)).toBe(pickRasterWidth(1200));
    expect(pickRasterWidth(-50)).toBe(pickRasterWidth(1200));
    expect(pickRasterWidth(NaN)).toBe(pickRasterWidth(1200));
  });
});
