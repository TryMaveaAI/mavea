import { describe, it, expect } from 'vitest';
import { paginate, expandOversized, auditPages } from '../src/export/paginate/paginate';
import { SECTION_GAP } from '../src/export/paginate/geometry';
import { measureDoc } from '../src/export/paginate/measure';
import { layoutDoc, buildExportDoc } from '../src/export/render/buildDoc';
import { SKINS } from '../src/export/skins/registry';
import { frameHeight } from '../src/export/skins/sections/figureFrame';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { Section } from '../src/export/model/ExportDoc';

describe('frameHeight — the flow-vs-fluid figure frame contract', () => {
  it('gives a FLOW figure (a code listing) no height cap, so it measures at its true size', () => {
    expect(frameHeight('flow')).toBe(Infinity);
  });

  it('keeps the fixed shrink-to-fit cap for a FLUID figure (a chart/diagram), unchanged', () => {
    expect(Number.isFinite(frameHeight('fluid'))).toBe(true);
    expect(frameHeight('fluid')).toBeGreaterThan(0);
  });
});

/** A prose section of a given height with a one-character body — too short to usefully split, so
 *  it stays atomic even when it's taller than a whole page (the `body: 'x'` is deliberate). */
function prose(id: string, h: number, source = 0, lead = false): Section {
  return { kind: 'prose', id, source, lead, measuredH: h, data: { heading: id, body: 'x' } };
}

/** A ranked list of N equal rows totalling `h` — the splittable case. */
function list(id: string, rows: number, h: number): Section {
  return {
    kind: 'rankedList',
    id,
    source: 0,
    measuredH: h,
    data: {
      heading: 'Big list',
      items: Array.from({ length: rows }, (_, i) => ({ name: `row ${i}` })),
    },
  };
}

/** A figure grid of N cells totalling `h` — newly splittable, so a tall one spills by its cells. */
function figure(id: string, cells: number, h: number): Section {
  return {
    kind: 'figureGrid',
    id,
    source: 0,
    measuredH: h,
    data: {
      heading: 'Big figure',
      fig: '1',
      cells: Array.from({ length: cells }, (_, i) => ({ title: `cell ${i}`, pct: 0.5 })),
    },
  };
}

const OPTS = { contentH1: 600, contentHRest: 800 };

/** The total height a page consumes = sum of section heights + gaps between them. */
function pageHeight(sections: Section[]): number {
  const h = sections.reduce((s, x) => s + (x.measuredH ?? 0), 0);
  return h + Math.max(0, sections.length - 1) * SECTION_GAP;
}

describe('paginate', () => {
  it('never lets a page of fitting sections exceed its cap', () => {
    const sections = [
      prose('a', 200),
      prose('b', 200),
      prose('c', 200), // page 1 cap 600 → a+b fit (424), c spills
      prose('d', 300),
      prose('e', 300),
    ];
    const pages = paginate(sections, OPTS);
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((p, i) => {
      const cap = i === 0 ? OPTS.contentH1 : OPTS.contentHRest;
      expect(pageHeight(p.sections)).toBeLessThanOrEqual(cap);
    });
  });

  it('places the first section on page 1 even when it alone exceeds the cap (atomic)', () => {
    const pages = paginate([prose('huge', 5000)], OPTS);
    expect(pages).toHaveLength(1);
    expect(pages[0].sections[0].id).toBe('huge');
  });

  it('splits an over-tall list across pages by its rows', () => {
    // 40 rows totalling 2000px → far taller than an 800px page.
    const pages = paginate([list('big', 40, 2000)], OPTS);
    expect(pages.length).toBeGreaterThan(1);
    // Every chunk fits its page, and the rows are conserved across the chunks.
    const totalRows = pages
      .flatMap((p) => p.sections)
      .reduce((n, s) => n + (s.kind === 'rankedList' ? s.data.items.length : 0), 0);
    expect(totalRows).toBe(40);
    pages.forEach((p, i) => {
      const cap = i === 0 ? OPTS.contentH1 : OPTS.contentHRest;
      expect(pageHeight(p.sections)).toBeLessThanOrEqual(cap + 1);
    });
    // Continuation chunks mark their heading.
    const conts = pages
      .flatMap((p) => p.sections)
      .filter((s) => s.kind === 'rankedList' && /\(cont\.\)/.test(s.data.heading ?? ''));
    expect(conts.length).toBeGreaterThan(0);
  });

  it('splits an over-tall figure grid across pages by its cells (no clipping)', () => {
    // 20 cells totalling 1800px → taller than an 800px page; must spill, not clip.
    const pages = paginate([figure('grid', 20, 1800)], OPTS);
    expect(pages.length).toBeGreaterThan(1);
    const totalCells = pages
      .flatMap((p) => p.sections)
      .reduce((n, s) => n + (s.kind === 'figureGrid' ? s.data.cells.length : 0), 0);
    expect(totalCells).toBe(20);
    pages.forEach((p, i) => {
      const cap = i === 0 ? OPTS.contentH1 : OPTS.contentHRest;
      expect(pageHeight(p.sections)).toBeLessThanOrEqual(cap + 1);
    });
  });

  it('starts a new page when a later answer leads', () => {
    const pages = paginate([prose('a1', 100, 0), prose('b1', 100, 1, true)], OPTS);
    expect(pages).toHaveLength(2);
    expect(pages[1].sections[0].id).toBe('b1');
  });

  it('always returns at least one page', () => {
    expect(paginate([], OPTS)).toHaveLength(1);
  });

  it('rebalances a near-empty last page by pulling sections back from the previous page', () => {
    // Greedy packing fills page 2 to 776 and strands one 100px section on page 3 (12% full).
    // The balance pass moves whole trailing sections back so the closing page carries weight.
    const sections = [
      prose('a', 600), // page 1 (cap 600)
      prose('b', 300),
      prose('c', 200),
      prose('d', 228), // b+c+d = 776 ≤ 800
      prose('e', 100), // stranded widow
    ];
    const pages = paginate(sections, OPTS);
    expect(pages).toHaveLength(3);
    const last = pages[2].sections.map((s) => s.id);
    expect(last).toEqual(['d', 'e']); // d moved back; order preserved
    pages.forEach((p, i) => {
      const cap = i === 0 ? OPTS.contentH1 : OPTS.contentHRest;
      expect(pageHeight(p.sections)).toBeLessThanOrEqual(cap);
    });
  });

  it('leaves a healthy last page alone', () => {
    const sections = [prose('a', 600), prose('b', 700), prose('c', 400)];
    const pages = paginate(sections, OPTS);
    expect(pages[pages.length - 1].sections.map((s) => s.id)).toEqual(['c']);
  });

  it('never rebalances content above a chapter lead — the fresh-page start wins', () => {
    const sections = [
      prose('a', 600),
      prose('b', 500),
      prose('lead', 100, 1, true), // light chapter opener: deliberate, not a widow
    ];
    const pages = paginate(sections, OPTS);
    expect(pages[pages.length - 1].sections.map((s) => s.id)).toEqual(['lead']);
  });

  it('avoids a lone widow row on the final split chunk', () => {
    // 7 rows that pack 3-per-page would split 3 / 3 / 1 — the widow guard rebalances to 3 / 2 / 2.
    const chunks = expandOversized([list('w', 7, 1200)], 600);
    expect(chunks.length).toBeGreaterThan(1);
    const counts = chunks.map((s) => (s.kind === 'rankedList' ? s.data.items.length : 0));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(7); // every row conserved
    expect(counts[counts.length - 1]).toBeGreaterThanOrEqual(2); // no orphaned widow row
  });
});

// The four archetypes that could NOT split before this change: prose (long body text),
// findingCallout / spotlightCard (a header card whose summary/body ran long), and a FLOW-class
// figure (a code-family block that grows by line). Each gets its own fragment splitter in
// `paginate/split.ts`; these tests exercise them directly through `expandOversized`, the same way
// the array-splitter tests above do.
describe('fragment splitters — prose, findingCallout, spotlightCard, flow-class figure', () => {
  const SENTENCE = 'This is one real sentence in a long paragraph that keeps rolling right along. ';

  it('splits a long prose paragraph at sentence boundaries, never mid-word', () => {
    const body = SENTENCE.repeat(70); // ~5,600 chars — comfortably past one page
    const section: Section = {
      kind: 'prose',
      id: 'p',
      source: 0,
      measuredH: 6000,
      data: { heading: 'Long answer', body },
    };
    const chunks = expandOversized([section], 600);
    expect(chunks.length).toBeGreaterThan(1);
    // No content lost, and every cut landed on real whitespace — a mid-word cut would show up as
    // an extra space where rejoining fragments with a single space wouldn't reproduce the
    // original text.
    const rebuilt = chunks
      .map((c) => (c.kind === 'prose' ? c.data.body : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(rebuilt).toBe(body.replace(/\s+/g, ' ').trim());
    // Every fragment is a reasonable, page-fitting size.
    for (const c of chunks) expect(c.measuredH ?? 0).toBeLessThanOrEqual(600 * 1.2);
    // Continuation labeling matches the array splitters' existing "(cont.)" convention.
    expect(chunks[0].kind === 'prose' && chunks[0].data.heading).toBe('Long answer');
    expect(chunks[1].kind === 'prose' && chunks[1].data.heading).toBe('Long answer (cont.)');
  });

  it('splits an oversized finding callout, keeping the header only on the first fragment', () => {
    const summary = SENTENCE.repeat(30);
    const section: Section = {
      kind: 'findingCallout',
      id: 'f',
      source: 0,
      measuredH: 2600,
      data: { num: '01', conf: 'Inferred', title: 'A real finding', summary },
    };
    const chunks = expandOversized([section], 400);
    expect(chunks.length).toBeGreaterThan(1);
    const [first, ...rest] = chunks;
    expect(first.kind === 'findingCallout' && first.data.cont).toBeFalsy();
    expect(first.kind === 'findingCallout' && first.data.num).toBe('01');
    expect(first.kind === 'findingCallout' && first.data.title).toBe('A real finding');
    for (const c of rest) expect(c.kind === 'findingCallout' && c.data.cont).toBe(true);
    const rebuilt = chunks
      .map((c) => (c.kind === 'findingCallout' ? (c.data.summary ?? '') : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(rebuilt).toBe(summary.replace(/\s+/g, ' ').trim());
  });

  it('splits an oversized spotlight card the same way — header only on the first fragment', () => {
    const body = SENTENCE.repeat(25);
    const section: Section = {
      kind: 'spotlightCard',
      id: 's',
      source: 0,
      measuredH: 2200,
      data: { label: 'Callout', title: 'A pull quote', body },
    };
    const chunks = expandOversized([section], 400);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].kind === 'spotlightCard' && chunks[0].data.cont).toBeFalsy();
    for (const c of chunks.slice(1)) expect(c.kind === 'spotlightCard' && c.data.cont).toBe(true);
  });

  it('splits an oversized flow-class figure (a code listing) by its declared line array', () => {
    const lines = Array.from({ length: 80 }, (_, i) => ({ text: `console.log(${i});` }));
    const block: Block = { type: 'terminal', col: 12, props: { lines } };
    const section: Section = {
      kind: 'figure',
      id: 'fig',
      source: 0,
      measuredH: 3200,
      data: {
        block,
        embed: 'flow',
        heading: 'Session log',
        fig: '1',
        caption: 'A sample session',
      },
    };
    const chunks = expandOversized([section], 700);
    expect(chunks.length).toBeGreaterThan(1);
    const totalLines = chunks.reduce(
      (n, c) =>
        n + (c.kind === 'figure' ? (c.data.block.props as { lines: unknown[] }).lines.length : 0),
      0,
    );
    expect(totalLines).toBe(80); // every line conserved
    expect(chunks[0].kind === 'figure' && chunks[0].data.heading).toBe('Session log');
    expect(chunks[1].kind === 'figure' && chunks[1].data.heading).toBe('Session log (cont.)');
    // Only the LAST fragment keeps the original caption.
    for (const c of chunks.slice(0, -1)) {
      expect(c.kind === 'figure' && c.data.caption).toBeUndefined();
    }
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.kind === 'figure' && lastChunk.data.caption).toBe('A sample session');
    // The figure number stays the same across every fragment.
    for (const c of chunks) expect(c.kind === 'figure' && c.data.fig).toBe('1');
  });

  it('never splits a fluid-class figure — charts/diagrams stay atomic and shrink to fit', () => {
    const block: Block = {
      type: 'terminal',
      col: 12,
      props: { lines: [{ text: 'x' }, { text: 'y' }] },
    };
    const section: Section = {
      kind: 'figure',
      id: 'fluid',
      source: 0,
      measuredH: 3000,
      data: { block, embed: 'fluid', heading: 'A chart' },
    };
    expect(expandOversized([section], 400)).toEqual([section]);
  });
});

/* ── layoutDoc end-to-end: the zero-overflow invariant ────────────────────────────────────────── */

// jsdom never lays anything out (getBoundingClientRect/offsetHeight are always 0), so exercising
// the real measure → split → re-measure pipeline needs a content-sensitive stand-in for layout.
// An element with an explicit inline pixel height reports exactly that — the mechanism
// FigureEmbed's frame uses to carry a flow figure's real, un-shrunk height (see figure.tsx's
// `frameHeight`), so this is what actually exercises that fix; everything else is its own direct
// text plus the sum of its children, a fair stand-in for ordinary block-flow stacking.
const MOCK_PX_PER_CHAR = 0.6;

function ownTextLength(el: Element): number {
  let n = 0;
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) n += (child.textContent ?? '').length;
  }
  return n;
}

function mockMeasuredHeight(el: Element): number {
  const explicit = (el as HTMLElement).style?.height;
  const px = explicit ? parseFloat(explicit) : NaN;
  if (Number.isFinite(px) && px > 0) return px;
  let h = ownTextLength(el) * MOCK_PX_PER_CHAR;
  for (const child of Array.from(el.children)) h += mockMeasuredHeight(child);
  return h;
}

/** Install the layout stand-in for the duration of one test; returns the restorer. */
function installLayoutMock(): () => void {
  const origRect = Element.prototype.getBoundingClientRect;
  const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const height = mockMeasuredHeight(this);
    return {
      width: 700,
      height,
      top: 0,
      left: 0,
      right: 700,
      bottom: height,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect;
  };
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return mockMeasuredHeight(this);
    },
  });
  return () => {
    Element.prototype.getBoundingClientRect = origRect;
    if (origOffsetHeight)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origOffsetHeight);
  };
}

describe('layoutDoc — the zero-overflow invariant on torture-level content', () => {
  const SENTENCE = 'This is one real sentence in a long paragraph that keeps rolling right along. ';

  it('never leaves a page over its cap — a 5,000+ char paragraph, an 80-line code listing, and a giant finding callout, all in one document (the primary bug this track fixes)', async () => {
    const restore = installLayoutMock();
    try {
      const body = SENTENCE.repeat(Math.ceil(5000 / SENTENCE.length));
      const lines = Array.from({ length: 80 }, (_, i) => ({ text: `console.log("line ${i}");` }));
      const findingSummary = SENTENCE.repeat(35);

      const sections: Section[] = [
        {
          kind: 'prose',
          id: 'p',
          source: 0,
          lead: true,
          data: { heading: 'A very long answer', body },
        },
        {
          kind: 'figure',
          id: 'fig',
          source: 0,
          data: {
            block: { type: 'terminal', col: 12, props: { lines } },
            embed: 'flow',
            heading: 'Session log',
            fig: '1',
            caption: 'A sample session',
          },
        },
        {
          kind: 'findingCallout',
          id: 'find',
          source: 0,
          data: { num: '01', conf: 'Inferred', title: 'A giant finding', summary: findingSummary },
        },
      ];

      const meta = { title: 'Torture test', sources: [], generatedAt: Date.now() };
      const doc = await layoutDoc(meta, sections, SKINS.editorial);
      // Chrome heights don't depend on the section list, so measuring against an empty document
      // yields the same page caps `layoutDoc` used internally.
      const { contentH1, contentHRest } = await measureDoc(meta, [], SKINS.editorial);

      const overflow = auditPages(doc.pages, { contentH1, contentHRest });
      expect(overflow).toEqual([]);
      // The content actually had to spill across pages — proof the splitters engaged, not that
      // nothing was oversized to begin with.
      expect(doc.pages.length).toBeGreaterThan(1);
    } finally {
      restore();
    }
  });
});

describe('measureDoc — A4 page-capacity math', () => {
  const meta = { title: 'A4 capacity test', sources: [], generatedAt: Date.now() };

  it('an A4 page reports more usable content height than Letter, by exactly the two formats height delta', async () => {
    const restore = installLayoutMock();
    try {
      // The chrome (masthead/running header/footer) renders the same JSX either way, so under the
      // text-length layout mock its measured height doesn't depend on the page format — isolating
      // the one thing that should: the page's own height, 1123px (A4) vs 1056px (Letter).
      const letter = await measureDoc(meta, [], SKINS.editorial, undefined, 'letter');
      const a4 = await measureDoc(meta, [], SKINS.editorial, undefined, 'a4');

      expect(a4.contentH1).toBe(letter.contentH1 + (1123 - 1056));
      expect(a4.contentHRest).toBe(letter.contentHRest + (1123 - 1056));
      expect(a4.contentH1).toBeGreaterThan(letter.contentH1);
    } finally {
      restore();
    }
  });

  it('defaults to Letter capacity when no format is passed, unchanged from before A4 existed', async () => {
    const restore = installLayoutMock();
    try {
      const bare = await measureDoc(meta, [], SKINS.editorial);
      const explicitLetter = await measureDoc(meta, [], SKINS.editorial, undefined, 'letter');
      expect(bare.contentH1).toBe(explicitLetter.contentH1);
      expect(bare.contentHRest).toBe(explicitLetter.contentHRest);
    } finally {
      restore();
    }
  });
});

/** A minimal, real `ConversationSpec` — one `insight` block, enough for `normalize()` to place a
 *  single `findingCallout` lead section. */
function answerSpec(title: string): ConversationSpec {
  return {
    id: 'test',
    workspace: 'test',
    title,
    sub: '',
    opener: '',
    context: [],
    blocks: [{ type: 'insight', col: 12, props: { title, summary: `${title} — a real finding.` } }],
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
  } as unknown as ConversationSpec;
}

describe('buildExportDoc — table of contents (multi-answer only)', () => {
  it('never adds a contents section to a single-answer export', async () => {
    const restore = installLayoutMock();
    try {
      const doc = await buildExportDoc([answerSpec('Solo answer')], SKINS.editorial, Date.now());
      expect(doc.sections.some((s) => s.kind === 'contents')).toBe(false);
    } finally {
      restore();
    }
  });

  it('converges to a page-number map that matches where each answer actually landed', async () => {
    const restore = installLayoutMock();
    try {
      const titles = ['First answer', 'Second answer', 'Third answer'];
      const doc = await buildExportDoc(titles.map(answerSpec), SKINS.editorial, Date.now());

      const contents = doc.sections.find((s) => s.kind === 'contents');
      expect(contents?.kind).toBe('contents');
      if (contents?.kind !== 'contents') return;

      // Injected right after the document's own opening lead section, not buried or dropped.
      expect(doc.sections[1].id).toBe('contents');
      expect(contents.data.items.map((it) => it.title)).toEqual(titles);

      // Re-derive each answer's real landing page straight from the final, laid-out pages —
      // the ground truth the printed numbers must match.
      const realPageOf = (source: number): number => {
        for (const page of doc.pages) {
          if (page.sections.some((s) => s.lead && s.source === source)) return page.index + 1;
        }
        throw new Error(`answer ${source} has no lead section on any page`);
      };
      contents.data.items.forEach((it, i) => {
        expect(it.page).toBe(realPageOf(i));
      });

      // Every answer after the first starts its own fresh page (paginate's lead-flush rule) —
      // so three answers can never share fewer than three distinct pages.
      const pages = contents.data.items.map((it) => it.page);
      expect(new Set(pages).size).toBe(3);
      expect(pages).toEqual([...pages].sort((a, b) => a - b));

      // Converged, not just plausible-looking — nothing in the finished document clips (same
      // "measure against an empty document for the same caps" trick the torture test above uses).
      const meta = { title: 'x', sources: [], generatedAt: Date.now() };
      const { contentH1, contentHRest } = await measureDoc(meta, [], SKINS.editorial);
      expect(auditPages(doc.pages, { contentH1, contentHRest })).toEqual([]);
    } finally {
      restore();
    }
  });
});

describe('buildExportDoc — sources appendix', () => {
  /** A single-answer spec citing `n` real web sources — the masthead's own inline caption shows
   *  only the first 4, so anything past that earns the appendix. */
  function specWithSources(n: number): ConversationSpec {
    const spec = answerSpec('Researched answer');
    return {
      ...spec,
      sources: Array.from({ length: n }, (_, i) => ({
        title: `Source ${i + 1}`,
        url: `https://example.com/${i + 1}`,
      })),
    } as ConversationSpec;
  }

  it('omits the appendix when sources stay within the masthead inline caption', async () => {
    const restore = installLayoutMock();
    try {
      const doc = await buildExportDoc([specWithSources(4)], SKINS.editorial, Date.now());
      expect(doc.sections.some((s) => s.kind === 'sourcesAppendix')).toBe(false);
    } finally {
      restore();
    }
  });

  it('appends exactly one sources section, carrying every real url, once past the caption limit', async () => {
    const restore = installLayoutMock();
    try {
      const doc = await buildExportDoc([specWithSources(6)], SKINS.editorial, Date.now());
      const appendices = doc.sections.filter((s) => s.kind === 'sourcesAppendix');
      expect(appendices).toHaveLength(1);
      const appendix = appendices[0];
      if (appendix.kind !== 'sourcesAppendix') throw new Error('unreachable');
      expect(appendix.data.items).toHaveLength(6);
      expect(appendix.data.items[0]).toEqual({
        name: 'Source 1',
        url: 'https://example.com/1',
      });
      // Placed near the end, after every real content section.
      expect(doc.sections.at(-1)?.kind).toBe('sourcesAppendix');
    } finally {
      restore();
    }
  });
});
