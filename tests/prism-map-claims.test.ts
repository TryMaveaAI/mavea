import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ModelConfig } from '../src/live/providers/types';
import type { Attachment } from '../src/live/attachments';

// mapClaims extracts the document's per-page text client-side (pdf.js) and asks the model only for
// claims, then runs every candidate through the strict grounding gate against that real text before
// a claim exists. We mock the provider so the test controls the "model" output, and inject the
// extracted page text via mapClaims' pagesOverride (so the test needs no real PDF / pdf.js). We
// assert: ungrounded claims are dropped, regions derive from survivors, and a contradiction thread
// is drawn ONLY between two grounded claims.

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
        { quote: 'the thesis holds', page: 1, title: 'Thesis', region: 'R', role: 'load-bearing' },
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
  const pdfA: Attachment = { name: 'Paper A.pdf', mime: 'application/pdf', data: 'AA==', size: 4 };
  const pdfB: Attachment = { name: 'Paper B.pdf', mime: 'application/pdf', data: 'BB==', size: 4 };

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
      JSON.stringify({ claims: [{ quote: 'totally invented', page: 1, title: 'B', region: 'R' }] }),
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
        { quote: 'AMER,21,$9.8M', page: 1, kind: 'stat', title: 'AMER leads', region: 'Pipeline' },
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
