import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chunkPages,
  parseSkimPages,
  selectGroundedClaims,
  selectedPagesToPrompt,
  skimPagesToPrompt,
} from '../src/live/prism/mapping';
import {
  groundedPageOf,
  isClaimGrounded,
  isVerbatimOnPage,
  normalizePdfText,
} from '../src/live/prism/grounding';
import { CARD_H, CARD_W, layout, seedFrom } from '../src/live/prism/layout';
import type { Attachment } from '../src/live/attachments';
import type { ModelConfig } from '../src/live/providers/types';
import type { Claim, PrismSpec } from '../src/live/prism/types';

let modelReply: string | object = '';
let networkDown = false;
// For multi-PDF tests: a queue of replies, consumed one per generate() call in order. When set, it
// takes precedence over the single `modelReply`. Each document's map call + the cross-compare call
// each pull one entry.
let replyQueue: (string | object)[] | null = null;
// Whether the connected model can read a document/image itself. Only a vision provider can read a
// SCAN (a PDF that opens but carries no text); mapClaims checks this before spending a call.
let visionCapable = true;

vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({
    capabilities: {
      get vision() {
        return visionCapable;
      },
    },
    generate: async () => {
      if (networkDown) throw new Error('network');
      if (replyQueue) return { raw: replyQueue.shift() ?? '{}' };
      return { raw: modelReply };
    },
  }),
}));

const { mapClaims } = await import('../src/live/prism/mapClaims');

// mapClaims extracts the document's per-page text client-side (pdf.js) and asks the model only for
// claims, then runs every candidate through the strict grounding gate against that real text before
// a claim exists. We mock the provider so the test controls the "model" output, and inject the
// extracted page text via mapClaims' pagesOverride (so the test needs no real PDF / pdf.js). We
// assert: ungrounded claims are dropped, regions derive from survivors, and a contradiction thread
// is drawn ONLY between two grounded claims.
describe('mapClaims — model output through the grounding gate', () => {
  const cfg = { provider: 'anthropic', model: 'claude' } as unknown as ModelConfig;
  const pdf: Attachment = { name: 'report.pdf', mime: 'application/pdf', data: 'AA==', size: 4 };

  /** Run mapClaims with the model returning `claims` and the (mock-extracted) page text injected. */
  function run(pages: string[], claims: unknown[], asNoise = false) {
    const body = JSON.stringify({ regions: [], claims });
    modelReply = asNoise
      ? 'Sure! Here is the map:\n```json\n' + body + '\n```\nHope that helps.'
      : body;
    return mapClaims(pdf, cfg, undefined, pages);
  }

  beforeEach(() => {
    modelReply = '';
    networkDown = false;
    replyQueue = null;
  });

  /** A minimal STORED (uncompressed) ZIP from {name: bytes|string}, enough for officeDoc's reader. */
  function makeZip(files: Record<string, string | Uint8Array>): Uint8Array {
    const enc = new TextEncoder();
    const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
    const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
    const parts: number[] = [];
    const central: number[] = [];
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
      const nameB = [...enc.encode(name)];
      const data = [...(typeof content === 'string' ? enc.encode(content) : content)];
      const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0), ...nameB, ...data]; // prettier-ignore
      parts.push(...local);
      central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameB); // prettier-ignore
      offset += local.length;
    }
    const eocd = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(Object.keys(files).length), ...u16(Object.keys(files).length), ...u32(central.length), ...u32(offset), ...u16(0)]; // prettier-ignore
    return new Uint8Array([...parts, ...central, ...eocd]);
  }
  function toB64(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }

  describe('mapClaims', () => {
    it('drops fabricated quotes; keeps real quotes; corrects a mis-cited page to the truth', async () => {
      const res = await run(
        ['The market reaches $87B by 2030.', 'Cost parity with beef was reached in Q1.'],
        [
          {
            quote: 'reaches $87B by 2030',
            page: 1,
            kind: 'forecast',
            title: '$87B market',
            region: 'Market',
          },
          {
            quote: 'cost parity with beef was reached in Q1',
            page: 2,
            kind: 'finding',
            title: 'Cost parity',
            region: 'Technology',
          },
          // fabricated — not verbatim on any page → must be dropped
          {
            quote: 'profits tripled overnight',
            page: 1,
            kind: 'stat',
            title: 'Fake',
            region: 'Market',
          },
          // mis-cited — the quote is real but cited on the wrong page. The text genuinely lives on
          // page 1, so grounding self-corrects the page rather than dropping a real claim.
          {
            quote: 'Cost parity with beef',
            page: 1,
            kind: 'finding',
            title: 'Mis-cited',
            region: 'Technology',
          },
        ],
      );
      expect(res.error).toBeUndefined();
      expect(res.proposed).toBe(4);
      expect(res.spec).not.toBeNull();
      // the fabricated one is gone; the three real quotes survive
      expect(res.spec!.claims).toHaveLength(3);
      expect(res.spec!.claims.map((c) => c.title).sort()).toEqual([
        '$87B market',
        'Cost parity',
        'Mis-cited',
      ]);
      // the mis-cited claim's page was corrected from 2 to its true page (2, where "Cost parity..." lives)
      const corrected = res.spec!.claims.find((c) => c.title === 'Mis-cited')!;
      expect(corrected.page).toBe(2);
      expect(res.spec!.pageCount).toBe(2);
    });

    it('derives regions in first-seen order from the grounded claims only', async () => {
      const res = await run(
        ['alpha beta', 'gamma delta'],
        [
          { quote: 'alpha beta', page: 1, kind: 'stat', title: 'A', region: 'R1' },
          { quote: 'gamma delta', page: 2, kind: 'stat', title: 'B', region: 'R2' },
          // GhostRegion has no grounded claim → must not appear in regions
          { quote: 'not on any page', page: 1, kind: 'stat', title: 'C', region: 'GhostRegion' },
        ],
      );
      expect(res.spec!.regions).toEqual(['R1', 'R2']);
    });

    it('draws a contradiction thread only between two grounded claims', async () => {
      const res = await run(
        ['Cost parity reached in the US.', 'In the EU parity is years away.'],
        [
          {
            quote: 'Cost parity reached in the US',
            page: 1,
            kind: 'finding',
            title: 'US parity',
            region: 'Findings',
            contradictsPage: 2,
          },
          {
            quote: 'In the EU parity is years away',
            page: 2,
            kind: 'risk',
            title: 'EU lag',
            region: 'Findings',
          },
        ],
      );
      expect(res.spec!.threads).toHaveLength(1);
      const t = res.spec!.threads[0];
      expect(t.relation).toBe('contradicts');
      const ids = new Set(res.spec!.claims.map((c) => c.id));
      expect(ids.has(t.a)).toBe(true);
      expect(ids.has(t.b)).toBe(true);
    });

    it('draws a same-page contradiction thread between two different grounded claims', async () => {
      const res = await run(
        [
          'Remote work is unquestionably the best system. Admittedly, it can create distractions and slower communication.',
        ],
        [
          {
            quote: 'Remote work is unquestionably the best system',
            page: 1,
            kind: 'finding',
            title: 'Best system',
            region: 'Conclusion',
            contradictsPage: 1,
          },
          {
            quote: 'it can create distractions and slower communication',
            page: 1,
            kind: 'risk',
            title: 'Remote work limits',
            region: 'Conclusion',
          },
        ],
      );
      expect(res.spec!.threads).toHaveLength(1);
      expect(new Set([res.spec!.threads[0].a, res.spec!.threads[0].b]).size).toBe(2);
      expect(res.spec!.threads[0].relation).toBe('contradicts');
    });

    it('backfills a same-document contradiction when the initial map omitted contradictsPage', async () => {
      replyQueue = [
        JSON.stringify({
          regions: [],
          claims: [
            {
              quote: 'remote work is unquestionably the best system',
              page: 1,
              kind: 'finding',
              title: 'Best system',
              region: 'Conclusion',
            },
            {
              quote: 'they directly challenge almost every part of it',
              page: 1,
              kind: 'risk',
              title: 'Problems challenge case',
              region: 'Conclusion',
            },
          ],
        }),
        JSON.stringify({ pairs: [{ a: 'd0c0', b: 'd0c1', relation: 'contradicts' }] }),
      ];
      const res = await mapClaims(pdf, cfg, undefined, [
        'For these reasons, remote work is unquestionably the best system. These problems, however, do not weaken the argument, except that they directly challenge almost every part of it.',
      ]);
      expect(res.spec!.threads).toEqual([{ a: 'd0c0', b: 'd0c1', relation: 'contradicts' }]);
    });

    it('does not draw a thread when the contradiction target has no grounded claim', async () => {
      const res = await run(
        ['Cost parity reached in the US.', 'unrelated text here'],
        [
          {
            quote: 'Cost parity reached in the US',
            page: 1,
            kind: 'finding',
            title: 'US parity',
            region: 'Findings',
            contradictsPage: 2,
          },
        ],
      );
      expect(res.spec!.threads).toHaveLength(0);
    });

    it('returns an honest error when nothing grounds', async () => {
      const res = await run(
        ['real page text'],
        [{ quote: 'totally invented quote', page: 1, kind: 'stat', title: 'X', region: 'R' }],
      );
      expect(res.spec).toBeNull();
      expect(res.error).toMatch(/grounded/i);
    });

    it('carries a valid role through, defaulting unknown/missing to "supporting"', async () => {
      const res = await run(
        ['the thesis holds', 'a supporting fact', 'some background', 'another detail'],
        [
          {
            quote: 'the thesis holds',
            page: 1,
            title: 'Thesis',
            region: 'R',
            role: 'load-bearing',
          },
          { quote: 'a supporting fact', page: 2, title: 'Fact', region: 'R', role: 'supporting' },
          { quote: 'some background', page: 3, title: 'Bg', region: 'R', role: 'context' },
          // garbage role → coerced to the neutral middle; missing role → same
          { quote: 'another detail', page: 4, title: 'Detail', region: 'R', role: 'wildly-wrong' },
        ],
      );
      const byTitle = new Map(res.spec!.claims.map((c) => [c.title, c.role]));
      expect(byTitle.get('Thesis')).toBe('load-bearing');
      expect(byTitle.get('Fact')).toBe('supporting');
      expect(byTitle.get('Bg')).toBe('context');
      expect(byTitle.get('Detail')).toBe('supporting');
    });

    it('defaults role to "supporting" when the model omits it entirely', async () => {
      const res = await run(
        ['a grounded line'],
        [{ quote: 'a grounded line', page: 1, kind: 'stat', title: 'X', region: 'R' }],
      );
      expect(res.spec!.claims[0].role).toBe('supporting');
    });

    it('survives noisy model output (prose around the JSON)', async () => {
      const res = await run(
        ['the answer is 42'],
        [{ quote: 'the answer is 42', page: 1, kind: 'stat', title: '42', region: 'R' }],
        true,
      );
      expect(res.spec).not.toBeNull();
      expect(res.spec!.claims).toHaveLength(1);
    });

    // A PDF yields NO pages only when pdf.js couldn't open it at all (corrupt, encrypted, mislabelled).
    // A scan is a different failure — it opens, with blank pages — so the old "it may be a scan with no
    // selectable text" line was wrong in every case it could fire, and sent people off to re-scan a
    // document whose real problem was that it wasn't a readable PDF.
    it('says the PDF could not be OPENED when extraction yields no pages (not "it may be a scan")', async () => {
      const res = await run(
        [],
        [{ quote: 'anything', page: 1, kind: 'stat', title: 'X', region: 'R' }],
      );
      expect(res.spec).toBeNull();
      expect(res.error).toMatch(/couldn't open this pdf/i);
      expect(res.error).toMatch(/corrupt|password/i);
      expect(res.error).not.toMatch(/scan/i);
    });

    // The picker offers images, so a reader drops a screenshot and expects it to be read. It used
    // to fall through to the PDF reader, which cannot open a PNG, and they were told their image
    // was a corrupt PDF. A picture is a one-page deck: it takes the vision path.
    it('reads a dropped image instead of calling it a corrupt PDF', async () => {
      const png: Attachment = { name: 'chart.png', mime: 'image/png', data: 'AA==', size: 4 };
      modelReply = JSON.stringify({
        regions: [],
        claims: [{ quote: 'Revenue doubled', page: 1, kind: 'stat', title: 'X', region: 'R' }],
      });
      const res = await mapClaims(png, cfg);
      expect(res.error ?? '').not.toMatch(/corrupt|not a pdf/i);
    });

    // Mapping the picture was only half of it: the DOCUMENT has to carry the picture too, or the
    // source panel falls through every surface to the PDF reader (DocPageView selects ImageSurface
    // on slideImages) and pdf.js is handed a PNG — the same wrong cause, one layer down.
    it("publishes a dropped image as the document's page image, so the source panel shows it", async () => {
      const png: Attachment = { name: 'chart.png', mime: 'image/png', data: 'AA==', size: 4 };
      modelReply = JSON.stringify({
        regions: [],
        claims: [{ quote: 'Revenue doubled', page: 1, kind: 'stat', title: 'X', region: 'R' }],
      });
      const res = await mapClaims(png, cfg);
      expect(res.spec).not.toBeNull();
      expect(res.spec!.documents[0].slideImages).toEqual([{ data: 'AA==', mime: 'image/png' }]);
    });

    it('tells a non-vision model’s user that a picture needs a model that can see it', async () => {
      visionCapable = false;
      try {
        const png: Attachment = { name: 'chart.png', mime: 'image/png', data: 'AA==', size: 4 };
        const res = await mapClaims(png, cfg);
        expect(res.spec).toBeNull();
        expect(res.error).toMatch(/picture/i);
        expect(res.error).toMatch(/anthropic or gemini/i);
      } finally {
        visionCapable = true;
      }
    });

    // A real scan (pages open, but every one is blank) can only be read by a model that takes the
    // document itself. On a model that can't, we used to send it anyway and then blame grounding
    // ("no claims were grounded in the page text") — true, useless, and not the user's fault.
    it('tells a non-vision model’s user that a scanned PDF needs a document-reading model', async () => {
      visionCapable = false;
      try {
        const res = await run(
          ['', '', ''],
          [{ quote: 'anything', page: 1, kind: 'stat', title: 'X', region: 'R' }],
        );
        expect(res.spec).toBeNull();
        expect(res.error).toMatch(/no selectable text/i);
        expect(res.error).toMatch(/anthropic or gemini/i);
      } finally {
        visionCapable = true;
      }
    });

    // The same scan on a model that CAN read documents is not an error at all — it takes the vision
    // path (the PDF itself goes to the model), so the guard above must not fire there.
    it('still sends a scanned PDF to a vision model instead of erroring', async () => {
      const res = await run(
        ['', '', ''],
        [{ quote: 'anything', page: 1, kind: 'stat', title: 'X', region: 'R' }],
      );
      // Nothing grounds against blank pages, so there's no spec — but the failure is the grounding
      // gate doing its job, NOT the "connect a document-reading model" refusal.
      expect(res.error ?? '').not.toMatch(/no selectable text/i);
    });

    it('reports the error when the model call fails', async () => {
      networkDown = true;
      const res = await mapClaims(pdf, cfg, undefined, ['some page text']);
      expect(res.spec).toBeNull();
      expect(res.error).toMatch(/network/);
    });
  });

  describe('mapClaims — multiple documents', () => {
    const pdfA: Attachment = {
      name: 'Paper A.pdf',
      mime: 'application/pdf',
      data: 'AA==',
      size: 4,
    };
    const pdfB: Attachment = {
      name: 'Paper B.pdf',
      mime: 'application/pdf',
      data: 'BB==',
      size: 4,
    };

    it('tags each claim with its source document and names documents', async () => {
      replyQueue = [
        JSON.stringify({
          claims: [{ quote: 'A finding here', page: 1, title: 'A', region: 'Intro' }],
        }),
        JSON.stringify({
          claims: [{ quote: 'B finding here', page: 1, title: 'B', region: 'Intro' }],
        }),
        JSON.stringify({ pairs: [] }), // cross-compare: no relations
      ];
      const res = await mapClaims([pdfA, pdfB], cfg, undefined, [
        ['A finding here'],
        ['B finding here'],
      ]);
      expect(res.error).toBeUndefined();
      expect(res.spec!.documents.map((d) => d.fileName)).toEqual(['Paper A.pdf', 'Paper B.pdf']);
      const bySource = res.spec!.claims.map((c) => c.source).sort();
      expect(bySource).toEqual([0, 1]);
      // regions are namespaced by document so identical section names don't merge
      expect(res.spec!.regions).toEqual(['Paper A · Intro', 'Paper B · Intro']);
      expect(res.spec!.pageCount).toBe(2); // summed across documents
    });

    it('draws a verified cross-document thread between two real claims from different docs', async () => {
      replyQueue = [
        JSON.stringify({
          claims: [{ quote: 'meat grows in months', page: 1, title: 'A', region: 'R' }],
        }),
        JSON.stringify({
          claims: [{ quote: 'meat grows in years', page: 1, title: 'B', region: 'R' }],
        }),
        // cross-compare returns one contradiction between the two docs' claims
        JSON.stringify({ pairs: [{ a: 'd0c0', b: 'd1c0', relation: 'contradicts' }] }),
      ];
      const res = await mapClaims([pdfA, pdfB], cfg, undefined, [
        ['meat grows in months'],
        ['meat grows in years'],
      ]);
      expect(res.spec!.threads).toHaveLength(1);
      const t = res.spec!.threads[0];
      expect(t.relation).toBe('contradicts');
      expect(t.crossDoc).toBe(true);
      // the two ends genuinely come from different documents
      const a = res.spec!.claims.find((c) => c.id === t.a)!;
      const b = res.spec!.claims.find((c) => c.id === t.b)!;
      expect(a.source).not.toBe(b.source);
    });

    it('drops a cross-document pair that references a non-existent or same-doc claim', async () => {
      replyQueue = [
        JSON.stringify({ claims: [{ quote: 'alpha here', page: 1, title: 'A', region: 'R' }] }),
        JSON.stringify({ claims: [{ quote: 'beta here', page: 1, title: 'B', region: 'R' }] }),
        JSON.stringify({
          pairs: [
            { a: 'd0c0', b: 'nope', relation: 'agrees' }, // b doesn't exist
            { a: 'd0c0', b: 'd0c0', relation: 'agrees' }, // same claim
          ],
        }),
      ];
      const res = await mapClaims([pdfA, pdfB], cfg, undefined, [['alpha here'], ['beta here']]);
      expect(res.spec!.threads).toHaveLength(0);
    });

    it('still produces a world when one of several documents grounds nothing', async () => {
      replyQueue = [
        JSON.stringify({
          claims: [{ quote: 'real grounded text', page: 1, title: 'A', region: 'R' }],
        }),
        JSON.stringify({
          claims: [{ quote: 'totally invented', page: 1, title: 'B', region: 'R' }],
        }),
        JSON.stringify({ pairs: [] }),
      ];
      // doc B's only claim is not on its page → grounds nothing; doc A still stands.
      const res = await mapClaims([pdfA, pdfB], cfg, undefined, [
        ['real grounded text'],
        ['some other page text'],
      ]);
      expect(res.spec).not.toBeNull();
      expect(res.spec!.claims).toHaveLength(1);
      expect(res.spec!.claims[0].source).toBe(0);
    });

    it('reads an IMAGE-ONLY deck via vision: model OCRs slides, claims ground on their slide', async () => {
      // A deck exported as pictures — slides are <p:pic>, no text. The mapper sends the slide images to
      // the (mock) vision model, which transcribes the visible text; claims ground against their slide.
      const pic =
        '<p:sld><p:cSld><p:spTree><p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic></p:spTree></p:cSld></p:sld>';
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
      const zip = makeZip({
        'ppt/presentation.xml': '<p:presentation/>',
        'ppt/slides/slide1.xml': pic,
        'ppt/slides/slide2.xml': pic,
        'ppt/media/image1.png': png,
        'ppt/media/image2.png': png,
      });
      const deck: Attachment = {
        name: 'blueprint.pptx',
        mime: '',
        data: toB64(zip),
        size: zip.length,
      };

      // The "vision model" transcribes a line off slide 1 and a fabricated one off a nonexistent slide,
      // and returns a bounding box for where each sits on the slide (normalized 0–1000).
      modelReply = JSON.stringify({
        regions: ['Slide 1', 'Slide 2'],
        claims: [
          {
            quote: 'Lead response under five minutes',
            page: 1,
            kind: 'finding',
            title: 'Fast response',
            region: 'Slide 1',
            box: { x: 100, y: 200, w: 600, h: 80 },
          },
          {
            quote: 'Automation recovers 30% of cold leads',
            page: 2,
            kind: 'stat',
            title: 'Recovery',
            region: 'Slide 2',
            box: { x: 0, y: 0, w: 2000, h: 2000 }, // covers the whole slide → must be rejected
          },
          // hallucinated page beyond the deck → must be dropped
          { quote: 'Imaginary metric', page: 9, kind: 'stat', title: 'Nope', region: 'Slide 9' },
        ],
      });

      const res = await mapClaims(deck, cfg, undefined);
      expect(res.spec, res.spec ? '' : 'spec was null').not.toBeNull();
      // The two real per-slide quotes survive; the out-of-range page is dropped.
      expect(res.spec!.claims.map((c) => c.page).sort()).toEqual([1, 2]);
      // The slide images ride along so the source panel can show the real slide.
      expect(res.spec!.documents[0].slideImages).toHaveLength(2);
      // The well-formed box flows through; the whole-slide box is rejected (no useless full-frame mark).
      expect(res.spec!.claims.find((c) => c.page === 1)!.box).toEqual({
        x: 100,
        y: 200,
        w: 600,
        h: 80,
      });
      expect(res.spec!.claims.find((c) => c.page === 2)!.box).toBeUndefined();
    });

    it('explodes a CSV directly: text fed into the prompt, claims ground on the rows', async () => {
      const csv = 'Region,Deals,ARR\nEMEA,12,$3.4M\nAPAC,8,$2.1M\nAMER,21,$9.8M';
      const enc = new TextEncoder().encode(csv);
      const file: Attachment = {
        name: 'pipeline.csv',
        mime: 'text/csv',
        data: toB64(enc),
        size: enc.length,
      };
      // The model quotes a row verbatim (grounds) and invents one (dropped).
      modelReply = JSON.stringify({
        regions: ['Pipeline'],
        claims: [
          {
            quote: 'AMER,21,$9.8M',
            page: 1,
            kind: 'stat',
            title: 'AMER leads',
            region: 'Pipeline',
          },
          { quote: 'LATAM,99,$50M', page: 1, kind: 'stat', title: 'Fake', region: 'Pipeline' },
        ],
      });
      const res = await mapClaims(file, cfg, undefined);
      expect(res.spec, res.spec ? '' : 'spec was null').not.toBeNull();
      // Only the real row survives; the fabricated one is dropped by grounding.
      expect(res.spec!.claims).toHaveLength(1);
      expect(res.spec!.claims[0].quote).toBe('AMER,21,$9.8M');
      // No images, no vision — a plain data file.
      expect(res.spec!.documents[0].slideImages).toBeUndefined();
    });
  });
});

describe('prism mapping — page windows, skim, grounded selection', () => {
  describe('chunkPages', () => {
    it('groups pages into windows with 1-indexed ranges', () => {
      const pages = Array.from({ length: 10 }, (_, i) => `page ${i + 1} text`);
      const windows = chunkPages(pages, 4);
      expect(windows).toHaveLength(3);
      expect(windows[0]).toMatchObject({ startPage: 1, endPage: 4 });
      expect(windows[1]).toMatchObject({ startPage: 5, endPage: 8 });
      expect(windows[2]).toMatchObject({ startPage: 9, endPage: 10 }); // short final window
    });

    it('marks each page with its number so the model can attribute claims', () => {
      const windows = chunkPages(['alpha', 'beta'], 4);
      expect(windows[0].text).toContain('[p.1]');
      expect(windows[0].text).toContain('[p.2]');
      expect(windows[0].text).toContain('alpha');
    });

    it('clamps a degenerate window size to 1', () => {
      expect(chunkPages(['a', 'b'], 0)).toHaveLength(2);
    });

    it('returns no windows for an empty document', () => {
      expect(chunkPages([])).toEqual([]);
    });
  });

  describe('selectGroundedClaims', () => {
    const pages = ['cost parity with beef in Q1', 'EU rules add three years'];

    it('keeps real claims and drops fabricated or mis-cited ones', () => {
      const candidates = [
        { id: 'a', quote: 'cost parity with beef', page: 1 }, // real, right page
        { id: 'b', quote: 'cost parity with chicken', page: 1 }, // fabricated → drop
        { id: 'c', quote: 'EU rules add three years', page: 1 }, // real text, wrong page → drop
        { id: 'd', quote: 'EU rules add three years', page: 2 }, // real, right page
      ];
      expect(selectGroundedClaims(candidates, pages).map((c) => c.id)).toEqual(['a', 'd']);
    });

    it('preserves the original claim objects (carries title/kind/etc. through)', () => {
      const candidates = [
        { quote: 'cost parity with beef', page: 1, kind: 'finding', title: 'Parity' },
      ];
      const kept = selectGroundedClaims(candidates, pages);
      expect(kept[0]).toMatchObject({ kind: 'finding', title: 'Parity' });
    });
  });

  // Skim-then-deep: the cheap first pass reads a thin outline of the whole document; the deep pass
  // reads only the chosen pages, keeping their real page numbers.

  describe('skimPagesToPrompt', () => {
    it('slices every page thin and collapses whitespace so the outline stays small', () => {
      const pages = ['a'.repeat(1000), 'b\n\n  b   b'];
      const out = skimPagesToPrompt(pages, 50);
      expect(out).toContain('[page 1] ' + 'a'.repeat(50));
      expect(out).toContain('[page 2] b b b'); // whitespace collapsed
      expect(out).not.toContain('a'.repeat(51)); // capped per page
    });
  });

  describe('parseSkimPages', () => {
    it('keeps valid in-range integers, deduped, sorted, and capped', () => {
      expect(parseSkimPages('{"pages":[3,1,3,2,99,0,-1]}', 10, 40)).toEqual([1, 2, 3]);
    });
    it('caps to the requested count', () => {
      expect(parseSkimPages('{"pages":[1,2,3,4,5]}', 10, 3)).toEqual([1, 2, 3]);
    });
    it('reads JSON embedded in surrounding prose', () => {
      expect(parseSkimPages('Sure! {"pages":[2,4]} done', 10, 40)).toEqual([2, 4]);
    });
    it('falls back to an even spread when the model returns nothing usable', () => {
      const spread = parseSkimPages('{}', 20, 4);
      expect(spread.length).toBeGreaterThan(0);
      expect(spread.length).toBeLessThanOrEqual(4);
      expect(spread[0]).toBe(1);
      expect(spread.every((n) => n >= 1 && n <= 20)).toBe(true);
    });
    it('falls back on malformed JSON rather than throwing', () => {
      expect(() => parseSkimPages('not json at all', 10, 40)).not.toThrow();
      expect(parseSkimPages('not json at all', 10, 40).length).toBeGreaterThan(0);
    });
  });

  describe('selectedPagesToPrompt', () => {
    it('emits only the chosen pages but with their ORIGINAL page numbers in the markers', () => {
      const pages = Array.from({ length: 100 }, (_, i) => `PAGE-${i + 1}-BODY`);
      const out = selectedPagesToPrompt(pages, [3, 42], 2000);
      expect(out).toContain('[page 3]\nPAGE-3-BODY');
      expect(out).toContain('[page 42]\nPAGE-42-BODY');
      expect(out).not.toContain('PAGE-1-BODY'); // unchosen pages are not sent
      expect(out).not.toContain('[page 1]');
    });
    it('annotates a marker with a sheet label when present', () => {
      const out = selectedPagesToPrompt(['x', 'y'], [2], 2000, ['Sheet A', 'Revenue']);
      expect(out).toContain('[page 2 — "Revenue"]');
    });
  });
});

describe('prism grounding — the verbatim gate', () => {
  describe('groundedPageOf', () => {
    const pages = ['intro about widgets', 'the market reaches $87B by 2030', 'closing remarks'];

    it('returns the claimed page when the quote is there', () => {
      expect(groundedPageOf('reaches $87B', pages, 2)).toBe(2);
    });

    it('corrects a wrong page to the page that actually has the quote', () => {
      expect(groundedPageOf('reaches $87B', pages, 1)).toBe(2);
    });

    it('finds the page even with no claimed page', () => {
      expect(groundedPageOf('closing remarks', pages)).toBe(3);
    });

    it('returns 0 when the quote appears on no page (fabricated)', () => {
      expect(groundedPageOf('profits tripled overnight', pages, 1)).toBe(0);
    });

    it('returns 0 for an empty quote', () => {
      expect(groundedPageOf('   ', pages, 1)).toBe(0);
    });
  });

  describe('isVerbatimOnPage', () => {
    it('accepts a quote that appears verbatim on the page', () => {
      expect(
        isVerbatimOnPage('cost parity with beef', 'In Q1 it reached cost parity with beef.'),
      ).toBe(true);
    });

    it('rejects a fabricated quote that is not on the page', () => {
      expect(
        isVerbatimOnPage('cost parity with chicken', 'In Q1 it reached cost parity with beef.'),
      ).toBe(false);
    });

    it('rejects a high-overlap fabrication (shares most words but is not a real substring)', () => {
      const page = 'revenue increased by twelve percent in the third quarter of the year';
      // Differs only at "twenty" vs "twelve" — the loose mindshape grounder would pass this; we must not.
      expect(
        isVerbatimOnPage('revenue increased by twenty percent in the third quarter', page),
      ).toBe(false);
    });

    it('matches across the ﬁ/ﬂ ligatures (NFKC), where the ASCII-only grounder would fail', () => {
      expect(isVerbatimOnPage('the ﬁnal report', 'Here is the final report summary.')).toBe(true);
    });

    it('preserves accented letters (café stays café, not "caf")', () => {
      expect(isVerbatimOnPage('café revenue grew', 'The café revenue grew sharply.')).toBe(true);
      expect(isVerbatimOnPage('cafe revenue grew', 'The naïve model failed.')).toBe(false);
    });

    it('rejoins line-wrap hyphenation', () => {
      expect(
        isVerbatimOnPage('improved management of costs', 'improved manage- ment of costs here'),
      ).toBe(true);
    });

    it('binds a currency symbol to its number, so "$10,253" matches a table\'s "$ 10,253"', () => {
      // pdf.js puts the "$" column and the number in separate cells, so the extracted row reads
      // "Total net revenue $ 10,253"; the model writes "$10,253". Both must ground.
      const row = 'Total net revenue $ 10,253 $ 10,270 $ 7,438';
      expect(isVerbatimOnPage('Total net revenue $10,253', row)).toBe(true);
      expect(
        isVerbatimOnPage('Data Center Segment $5,775', 'Data Center Segment $ 5,775 $ 5,380'),
      ).toBe(true);
    });

    it('flattens smart quotes and dashes, and NBSP', () => {
      expect(
        isVerbatimOnPage("the firm's q3–q4 results", 'The firm’s Q3—Q4 results were strong.'),
      ).toBe(true);
      expect(isVerbatimOnPage('cost of goods sold', 'cost of goods sold rose')).toBe(true);
    });

    it('never grounds an empty quote', () => {
      expect(isVerbatimOnPage('', 'anything at all')).toBe(false);
      expect(isVerbatimOnPage('   ', 'anything at all')).toBe(false);
    });
  });

  describe('normalizePdfText', () => {
    it('is idempotent', () => {
      const once = normalizePdfText('The  ﬁrm’s  Q3—Q4 results');
      expect(normalizePdfText(once)).toBe(once);
    });
  });

  describe('isClaimGrounded', () => {
    const pages = ['alpha intro text', 'the management plan is on this page', 'closing remarks'];

    it('grounds a claim whose quote is verbatim on its cited page', () => {
      expect(isClaimGrounded({ quote: 'the management plan', page: 2 }, pages)).toBe(true);
    });

    it('rejects a quote that exists, but on a different page than claimed (mis-citation)', () => {
      expect(isClaimGrounded({ quote: 'the management plan', page: 1 }, pages)).toBe(false);
    });

    it('rejects out-of-range, zero, negative, and non-integer pages', () => {
      expect(isClaimGrounded({ quote: 'closing remarks', page: 4 }, pages)).toBe(false);
      expect(isClaimGrounded({ quote: 'alpha intro text', page: 0 }, pages)).toBe(false);
      expect(isClaimGrounded({ quote: 'alpha intro text', page: -1 }, pages)).toBe(false);
      expect(isClaimGrounded({ quote: 'alpha intro text', page: 1.5 }, pages)).toBe(false);
    });
  });
});

// The settled map must never stack claim cards on top of each other (the bug a screenshot caught:
// 15 cards piled into one corner). layout() runs a separation pass; these tests pin that no two
// cards overlap, the layout stays inside the world, and it's deterministic.
describe('prism map layout', () => {
  const PALETTE = ['a', 'b', 'c', 'd', 'e', 'f'];

  function makeSpec(count: number, regions = 5): PrismSpec {
    const regionNames = Array.from({ length: regions }, (_, i) => `Region ${i + 1}`);
    const claims: Claim[] = Array.from({ length: count }, (_, i) => ({
      id: `c${i}`,
      quote: `quote ${i}`,
      page: (i % 16) + 1,
      kind: 'finding',
      title: `Claim ${i}`,
      ask: 'why?',
      role: 'supporting',
      region: regionNames[i % regions],
      source: 0,
    }));
    return {
      documents: [{ fileName: 'doc.pdf', pageCount: 16 }],
      fileName: 'doc.pdf',
      pageCount: 16,
      claims,
      regions: regionNames,
      threads: [],
    };
  }

  /** Do two card rectangles (centre x/y, fixed CARD_W×CARD_H) overlap? */
  function overlaps(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    return Math.abs(a.x - b.x) < CARD_W && Math.abs(a.y - b.y) < CARD_H;
  }

  describe('prism layout', () => {
    for (const count of [1, 5, 15, 24, 40]) {
      it(`places ${count} cards with no two overlapping`, () => {
        const { claims } = layout(makeSpec(count), PALETTE);
        expect(claims).toHaveLength(count);
        for (let i = 0; i < claims.length; i += 1) {
          for (let j = i + 1; j < claims.length; j += 1) {
            expect(
              overlaps(claims[i], claims[j]),
              `cards ${i} and ${j} overlap at (${claims[i].x.toFixed(0)},${claims[i].y.toFixed(0)}) / (${claims[j].x.toFixed(0)},${claims[j].y.toFixed(0)})`,
            ).toBe(false);
          }
        }
      });
    }

    it('keeps every card inside the world bounds', () => {
      const { claims, width, height } = layout(makeSpec(20), PALETTE);
      for (const c of claims) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThanOrEqual(width);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThanOrEqual(height);
      }
    });

    it('is deterministic — the same spec lays out identically', () => {
      const spec = makeSpec(15);
      const a = layout(spec, PALETTE);
      const b = layout(spec, PALETTE);
      expect(a.claims.map((c) => [c.id, Math.round(c.x), Math.round(c.y)])).toEqual(
        b.claims.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]),
      );
    });

    it('assigns region colors from the palette in order', () => {
      const { regions } = layout(makeSpec(6, 3), PALETTE);
      expect(regions.map((r) => r.color)).toEqual(['a', 'b', 'c']);
    });

    it('anchors each region label above its cluster, clear of every card in that region', () => {
      const { regions, claims } = layout(makeSpec(20, 4), PALETTE);
      for (const region of regions) {
        const members = claims.filter((c) => c.region === region.name);
        if (members.length === 0) continue;
        const topCard = Math.min(...members.map((c) => c.y));
        // the label centre sits above the topmost card's centre (so the pill clears the card body)
        expect(
          region.cy,
          `region "${region.name}" label cy=${region.cy.toFixed(0)} not above its top card y=${topCard.toFixed(0)}`,
        ).toBeLessThan(topCard);
      }
    });

    it('links every claim into one connected backbone (no isolated cards)', () => {
      const { claims, links } = layout(makeSpec(15, 4), PALETTE);
      // union-find over the links: all claims should end in one component
      const parent = new Map(claims.map((c) => [c.id, c.id]));
      const find = (x: string): string => {
        let r = x;
        while (parent.get(r) !== r) r = parent.get(r)!;
        return r;
      };
      for (const l of links) parent.set(find(l.a), find(l.b));
      const roots = new Set(claims.map((c) => find(c.id)));
      expect(roots.size).toBe(1);
    });

    it('keeps every region label clear of EVERY card (not just its own region)', () => {
      const { regions, claims } = layout(makeSpec(24, 5), PALETTE);
      for (const region of regions) {
        // mirror layout's label box: width ≈ name length, fixed half-height
        const hw = Math.max(70, region.name.length * 7 + 24) / 2;
        const hh = 26;
        for (const c of claims) {
          const overlapX = CARD_W / 2 + hw - Math.abs(c.x - region.cx);
          const overlapY = CARD_H / 2 + hh - Math.abs(c.y - region.cy);
          expect(
            overlapX > 0 && overlapY > 0,
            `label "${region.name}" overlaps card "${c.title}" (overlapX=${overlapX.toFixed(0)}, overlapY=${overlapY.toFixed(0)})`,
          ).toBe(false);
        }
      }
    });
  });

  // ── seeded (incremental) layout ──────────────────────────────────────────────────────────────────
  // When the claim set grows (an interrogation surfaces a derived card, a veracity reflow, a data
  // finding lands), the cards already on the map must stay EXACTLY where they were — only the new cards
  // may move. Without this the whole map jumps on every change and spatial memory is lost.

  /** Return a copy of `spec` with `extra` further claims appended (new ids, into existing regions). */
  function withMoreClaims(spec: PrismSpec, extra: number): PrismSpec {
    const base = spec.claims.length;
    const more: Claim[] = Array.from({ length: extra }, (_, i) => ({
      id: `c${base + i}`,
      quote: `quote ${base + i}`,
      page: ((base + i) % 16) + 1,
      kind: 'finding',
      title: `Claim ${base + i}`,
      ask: 'why?',
      role: 'supporting',
      region: spec.regions[(base + i) % spec.regions.length],
      source: 0,
    }));
    return { ...spec, claims: [...spec.claims, ...more] };
  }

  describe('prism seeded layout', () => {
    it('pins every prior card exactly in place when claims are added', () => {
      const first = layout(makeSpec(15), PALETTE);
      const grown = withMoreClaims(makeSpec(15), 4);
      const next = layout(grown, PALETTE, seedFrom(first));

      const byId = new Map(next.claims.map((c) => [c.id, c]));
      for (const prior of first.claims) {
        const after = byId.get(prior.id)!;
        expect(after.x, `card ${prior.id} x moved`).toBe(prior.x);
        expect(after.y, `card ${prior.id} y moved`).toBe(prior.y);
      }
    });

    it('keeps prior region labels in place too', () => {
      const first = layout(makeSpec(15), PALETTE);
      const grown = withMoreClaims(makeSpec(15), 4);
      const next = layout(grown, PALETTE, seedFrom(first));
      const byName = new Map(next.regions.map((r) => [r.name, r]));
      for (const r of first.regions) {
        const after = byName.get(r.name)!;
        expect(after.cx).toBe(r.cx);
        expect(after.cy).toBe(r.cy);
      }
    });

    it('lands the new cards without overlapping any card (pinned or new)', () => {
      const first = layout(makeSpec(15), PALETTE);
      const grown = withMoreClaims(makeSpec(15), 5);
      const { claims } = layout(grown, PALETTE, seedFrom(first));
      expect(claims).toHaveLength(20);
      for (let i = 0; i < claims.length; i += 1) {
        for (let j = i + 1; j < claims.length; j += 1) {
          expect(
            overlaps(claims[i], claims[j]),
            `cards ${claims[i].id} and ${claims[j].id} overlap`,
          ).toBe(false);
        }
      }
    });

    it('reuses the seed world size (no regrow, so pinned coordinates stay valid)', () => {
      const first = layout(makeSpec(15), PALETTE);
      const grown = withMoreClaims(makeSpec(15), 6);
      const next = layout(grown, PALETTE, seedFrom(first));
      expect(next.width).toBe(first.width);
      expect(next.height).toBe(first.height);
    });

    it('is deterministic — same seed + same spec lays out identically', () => {
      const first = layout(makeSpec(15), PALETTE);
      const grown = withMoreClaims(makeSpec(15), 4);
      const a = layout(grown, PALETTE, seedFrom(first));
      const b = layout(grown, PALETTE, seedFrom(first));
      expect(a.claims.map((c) => [c.id, Math.round(c.x), Math.round(c.y)])).toEqual(
        b.claims.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]),
      );
    });
  });
});
