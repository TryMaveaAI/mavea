// The export document model and its page layout: normalizing real answers into typed sections,
// the page geometry math (Letter vs A4), unclipping a scrolling figure so it measures at its true
// height, and the paginator that packs, splits and balances those sections across pages.
import { describe, it, expect } from 'vitest';
import { TOPIC_LIST } from '../src/data/topics';
import { DATA_SHAPES } from '../src/canvas/blocks/catalog/meta';
import { unclipScrollers } from '../src/canvas/embed/unclip';
import { buildMeta, normalize, CORE_EXTRACTOR_TYPES } from '../src/export/model/normalize';
import { CORE_ARCHETYPE, DATASHAPE_ARCHETYPE, archetypeFor } from '../src/export/model/mapping';
import {
  contentHeight,
  contentWidth,
  pageSize,
  PAGE_H,
  PAGE_W,
  SAFETY_GUTTER,
  SECTION_GAP,
} from '../src/export/paginate/geometry';
import { paginate, expandOversized, auditPages } from '../src/export/paginate/paginate';
import { measureDoc } from '../src/export/paginate/measure';
import { layoutDoc, buildExportDoc } from '../src/export/render/buildDoc';
import { SKINS } from '../src/export/skins/registry';
import { frameHeight } from '../src/export/skins/sections/figureFrame';
import type { Block, ConversationSpec } from '../src/data/conversation';
import type { Section, SectionKind } from '../src/export/model/ExportDoc';

/* ── normalize — blocks become typed sections ──────────────────────────────────────────────────────── */

const KINDS: SectionKind[] = [
  'findingCallout',
  'spotlightCard',
  'figureGrid',
  'figure',
  'rankedList',
  'ratingMatrix',
  'checklist',
  'metricTiles',
  'distributionBars',
  'verticalTimeline',
  'numberedMilestones',
  'specTable',
  'prose',
];

/** A section is structurally sound: a known kind whose payload carries its required field(s). */
function assertWellFormed(s: Section): void {
  expect(KINDS).toContain(s.kind);
  expect(typeof s.id).toBe('string');
  switch (s.kind) {
    case 'findingCallout':
    case 'spotlightCard':
      expect(typeof s.data.title).toBe('string');
      break;
    case 'prose':
      expect(typeof s.data.body).toBe('string');
      break;
    case 'figureGrid':
      expect(Array.isArray(s.data.cells)).toBe(true);
      expect(s.data.cells.length).toBeGreaterThan(0);
      break;
    case 'figure':
      expect(s.data.block).toBeTypeOf('object');
      expect(typeof s.data.block.type).toBe('string');
      expect(['fluid', 'flow']).toContain(s.data.embed);
      break;
    case 'rankedList':
      expect(s.data.items.length).toBeGreaterThan(0);
      break;
    case 'ratingMatrix':
      expect(s.data.rows.length).toBeGreaterThan(0);
      break;
    case 'checklist':
      expect(s.data.items.length).toBeGreaterThan(0);
      break;
    case 'metricTiles':
      expect(s.data.tiles.length).toBeGreaterThan(0);
      break;
    case 'distributionBars':
      expect(s.data.bars.length).toBeGreaterThan(0);
      break;
    case 'verticalTimeline':
      expect(s.data.events.length).toBeGreaterThan(0);
      break;
    case 'numberedMilestones':
      expect(s.data.items.length).toBeGreaterThan(0);
      break;
    case 'specTable':
      expect(s.data.rows.length).toBeGreaterThan(0);
      break;
  }
}

describe('mapping coverage', () => {
  it('routes every DataShape (to an archetype or an intentional drop)', () => {
    for (const shape of DATA_SHAPES) {
      expect(shape in DATASHAPE_ARCHETYPE).toBe(true);
      const target = DATASHAPE_ARCHETYPE[shape];
      if (target !== null) expect(KINDS).toContain(target);
    }
  });

  it('has a precise extractor for every core archetype entry', () => {
    for (const type of Object.keys(CORE_ARCHETYPE)) {
      expect(CORE_EXTRACTOR_TYPES).toContain(type);
    }
  });

  it('falls back to prose for an unknown block type', () => {
    const unknown = {
      type: 'totally-unknown-xyz',
      col: 6,
      props: { title: 'Hi', text: 'there' },
    } as unknown as Block;
    expect(archetypeFor(unknown)).toBe('prose');
    const sections = normalize([{ ...sampleSpec(), blocks: [unknown] }]);
    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe('prose');
    expect(sections[0].data).toMatchObject({ heading: 'Hi' });
  });
});

describe('normalize on real topic data', () => {
  it('never throws and yields well-formed, uniquely-keyed sections for every demo answer', () => {
    for (const spec of TOPIC_LIST) {
      const sections = normalize([spec]);
      expect(Array.isArray(sections)).toBe(true);
      const ids = new Set<string>();
      for (const s of sections) {
        assertWellFormed(s);
        expect(s.source).toBe(0);
        ids.add(s.id);
      }
      expect(ids.size).toBe(sections.length); // ids are unique
    }
  });

  it('keeps each answer addressable by source index when several are combined', () => {
    const pick = TOPIC_LIST.slice(0, 3);
    const sections = normalize(pick);
    const sources = new Set(sections.map((s) => s.source));
    expect(sources).toEqual(new Set([0, 1, 2]));
    // Each later answer opens with a lead section restating its real title.
    const intro = sections.find((s) => s.source === 1 && s.lead);
    expect(intro?.kind).toBe('prose');
  });
});

describe('precise core extractors', () => {
  it('insight → findingCallout with its title + confidence', () => {
    const block = {
      type: 'insight',
      id: 'x',
      num: '1',
      col: 4,
      props: { title: 'The strategy', summary: 'Lean on the train.', conf: 'inferred' },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('findingCallout');
    if (s.kind === 'findingCallout') {
      expect(s.data).toMatchObject({ num: '1', conf: 'Inferred', title: 'The strategy' });
    }
  });

  it('heat → ratingMatrix with numeric levels', () => {
    const block = {
      type: 'heat',
      col: 12,
      props: {
        title: 'Vibe',
        cols: ['A', 'B'],
        rows: [{ label: 'Loop', cells: [3, { lvl: 1 }] }],
        legend: ['low', 'high'],
      },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('ratingMatrix');
    if (s.kind === 'ratingMatrix') {
      expect(s.data.columns).toEqual(['A', 'B']);
      expect(s.data.rows[0]).toEqual({ label: 'Loop', values: [3, 1] });
      expect(s.data.scale).toBe(3);
    }
  });

  it('kpi → metricTiles', () => {
    const block = {
      type: 'kpi',
      col: 6,
      props: { title: 'Logistics', kpis: [{ val: 'CTA Ventra', label: 'Transit' }] },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('metricTiles');
    if (s.kind === 'metricTiles')
      expect(s.data.tiles[0]).toEqual({ value: 'CTA Ventra', label: 'Transit' });
  });

  it('strips HTML from list items', () => {
    const block = {
      type: 'list',
      col: 4,
      props: { title: 'Eat', items: ['<b>Deep-dish</b> &mdash; the classic'] },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('rankedList');
    if (s.kind === 'rankedList') expect(s.data.items[0].name).toBe('Deep-dish — the classic');
  });
});

describe('buildMeta', () => {
  it('derives masthead facts from the first answer', () => {
    const spec = {
      ...sampleSpec(),
      title: 'Chicago in Four Days',
      sub: 'A compact field guide.',
      topic: 'Travel',
      context: [{ name: 'notes.pdf', color: 'var(--text-muted)' as const }],
    };
    const meta = buildMeta([spec], 1_700_000_000_000);
    expect(meta).toMatchObject({
      title: 'Chicago in Four Days',
      sub: 'A compact field guide.',
      topic: 'Travel',
      sources: [{ name: 'notes.pdf' }],
      generatedAt: 1_700_000_000_000,
    });
  });

  it('carries each source as a {name, url?} object, preserving a real web citation URL', () => {
    const spec = {
      ...sampleSpec(),
      context: [{ name: 'notes.pdf', color: 'var(--text-muted)' as const }],
      sources: [{ title: 'Wikipedia: Chicago', url: 'https://en.wikipedia.org/wiki/Chicago' }],
    };
    const meta = buildMeta([spec], 1_700_000_000_000);
    // A context pill never carries a URL — the demo/scripted model has nowhere to put one.
    expect(meta.sources[0]).toEqual({ name: 'notes.pdf' });
    expect(meta.sources[0].url).toBeUndefined();
    // A real web citation's URL is kept verbatim, not discarded.
    expect(meta.sources[1]).toEqual({
      name: 'Wikipedia: Chicago',
      url: 'https://en.wikipedia.org/wiki/Chicago',
    });
  });
});

describe('document numbering & table humanization', () => {
  it('numbers findings 01/02/03 and figures 1/2 in document order', () => {
    const finding = (title: string) =>
      ({ type: 'insight', col: 4, props: { title } }) as unknown as Block;
    const chart = (title: string) =>
      ({
        type: 'chart',
        col: 6,
        props: { title, labels: ['A', 'B'], series: [{ name: 's', data: [1, 2] }] },
      }) as unknown as Block;
    const sections = normalize([
      {
        ...sampleSpec(),
        blocks: [finding('One'), chart('Fig A'), finding('Two'), chart('Fig B'), finding('Three')],
      },
    ]);
    const nums = sections.flatMap((s) => (s.kind === 'findingCallout' ? [s.data.num] : []));
    expect(nums).toEqual(['01', '02', '03']);
    const figs = sections.flatMap((s) => (s.kind === 'figureGrid' ? [s.data.fig] : []));
    expect(figs).toEqual(['1', '2']);
  });

  it('chart → figureGrid carries a real chart payload (labels + numeric series) for the doc renderer', () => {
    const block = {
      type: 'chart',
      col: 8,
      props: {
        title: 'Revenue trend',
        unit: 'M',
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [{ name: 'Revenue', data: [12, 13, 12, 15] }],
      },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('figureGrid');
    if (s.kind === 'figureGrid') {
      expect(s.data.chart).toBeDefined();
      expect(s.data.chart?.labels).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
      expect(s.data.chart?.series[0]).toEqual({ name: 'Revenue', data: [12, 13, 12, 15] });
      // The figure is still numbered, and cells remain as the fallback/slide representation.
      expect(s.data.fig).toBe('1');
      expect(s.data.cells.length).toBeGreaterThan(0);
    }
  });

  it('humanizes machine field-name table columns and drops internal keys', () => {
    const block = {
      type: 'datatable',
      col: 12,
      props: {
        rows: [
          { id: 'a1', orderName: 'Acme', unit_price: '9.00', created_at: '2026-01-01' },
          { id: 'a2', orderName: 'Globex', unit_price: '12.50', created_at: '2026-01-02' },
        ],
      },
    } as unknown as Block;
    const [s] = normalize([{ ...sampleSpec(), blocks: [block] }]);
    expect(s.kind).toBe('specTable');
    if (s.kind === 'specTable') {
      // id / created_at are dropped; orderName / unit_price become reader-facing headers.
      expect(s.data.columns).toEqual(['Order Name', 'Unit Price']);
      expect(s.data.rows[0]).toEqual(['Acme', '9.00']);
    }
  });
});

describe('figure routing — rich visuals render as their real component', () => {
  const mk = (type: string, props: Record<string, unknown>) =>
    ({ type, col: 8, props }) as unknown as Block;

  const sankey = () =>
    mk('sankey', {
      title: 'Energy flow',
      nodes: [
        { id: 'a', label: 'A', layer: 0 },
        { id: 'b', label: 'B', layer: 1 },
      ],
      links: [{ source: 'a', target: 'b', value: 5 }],
    });

  it('routes an embeddable chart to a figure that carries the real block', () => {
    const [s] = normalize([{ ...sampleSpec(), blocks: [sankey()] }]);
    expect(s.kind).toBe('figure');
    if (s.kind === 'figure') {
      expect(s.data.block.type).toBe('sankey');
      expect(s.data.embed).toBe('fluid');
      expect(s.data.heading).toBe('Energy flow');
      expect(s.data.fig).toBe('1');
    }
  });

  it('keeps a data table on its designed archetype (not every extended block embeds)', () => {
    expect(archetypeFor(mk('datatable', {}))).toBe('specTable');
  });

  it('numbers embedded figures in the same FIG. sequence as figure grids', () => {
    const chart = mk('chart', {
      title: 'Trend',
      labels: ['A', 'B'],
      series: [{ name: 's', data: [1, 2] }],
    });
    const sections = normalize([{ ...sampleSpec(), blocks: [sankey(), chart] }]);
    const figs = sections.flatMap((s) =>
      s.kind === 'figure' || s.kind === 'figureGrid' ? [s.data.fig] : [],
    );
    expect(figs).toEqual(['1', '2']);
  });

  it('falls back honestly when an embeddable block carries no real data', () => {
    // Missing nodes/links — no figure is drawn; the real-data-only guard never invents a blank one.
    const [s] = normalize([{ ...sampleSpec(), blocks: [mk('sankey', { title: 'Energy flow' })] }]);
    expect(s?.kind).not.toBe('figure');
  });
});

/** A minimal valid ConversationSpec scaffold for unit cases (blocks overridden per test). */
function sampleSpec() {
  return {
    id: 'test' as unknown as import('../src/types/mavea').TopicId,
    workspace: 'test',
    title: 'Test',
    sub: 'Sub',
    opener: '',
    context: [],
    blocks: [],
    proof: null,
    extras: {},
    group: 'home' as const,
    suggests: [],
    keywords: [],
  };
}

/* ── page geometry — Letter vs A4 ──────────────────────────────────────────────────────────────────── */

describe('pageSize', () => {
  it('returns Letter unchanged — byte-identical to the pre-existing PAGE_W/PAGE_H constants', () => {
    // Regression-critical: every export written before A4 support existed was laid out against
    // these exact numbers. Any drift here silently reflows every Letter document.
    expect(pageSize('letter')).toEqual({ width: 816, height: 1056 });
    expect(pageSize('letter')).toEqual({ width: PAGE_W, height: PAGE_H });
  });

  it('returns the correct A4 pixel dimensions at 96dpi (210mm × 297mm)', () => {
    expect(pageSize('a4')).toEqual({ width: 794, height: 1123 });
  });

  it('A4 is narrower and taller than Letter', () => {
    const letter = pageSize('letter');
    const a4 = pageSize('a4');
    expect(a4.width).toBeLessThan(letter.width);
    expect(a4.height).toBeGreaterThan(letter.height);
  });
});

describe('contentWidth / contentHeight — additive format parameter', () => {
  const PADDING = '64px 56px';

  it('omitting the format argument keeps the exact pre-existing Letter numbers', () => {
    expect(contentWidth(PADDING)).toBe(PAGE_W - 56 - 56);
    expect(contentWidth(PADDING)).toBe(contentWidth(PADDING, undefined, 'letter'));
    expect(contentHeight(PADDING, 100, 40)).toBe(PAGE_H - 64 - 64 - 100 - 40 - SAFETY_GUTTER);
    expect(contentHeight(PADDING, 100, 40)).toBe(contentHeight(PADDING, 100, 40, 'letter'));
  });

  it('scales down to A4s narrower/taller sheet when a format is passed', () => {
    const letterW = contentWidth(PADDING, undefined, 'letter');
    const a4W = contentWidth(PADDING, undefined, 'a4');
    expect(a4W).toBe(794 - 56 - 56);
    expect(a4W).toBeLessThan(letterW);

    const letterH = contentHeight(PADDING, 100, 40, 'letter');
    const a4H = contentHeight(PADDING, 100, 40, 'a4');
    expect(a4H).toBe(1123 - 64 - 64 - 100 - 40 - SAFETY_GUTTER);
    expect(a4H).toBeGreaterThan(letterH);
  });

  it('still honours a left page-rule border under A4', () => {
    expect(contentWidth(PADDING, '4px solid #000', 'a4')).toBe(794 - 56 - 56 - 4);
  });
});

/* ── unclipping a scrolling figure ─────────────────────────────────────────────────────────────────── */

// Regression: a figure embedded in an export is a static plate — paper and slides have no scrollbar
// to drag. A `terminal` block caps its own listing (`.term-body { max-height: 22rem; overflow: auto }`),
// so an 84-line deploy log PAINTED 17 lines and hid the other 67 behind a scrollbar nobody could
// reach. Worse, the capped box also MEASURES short, so the paginator read the figure as a tidy 385px
// section, never split it across pages, and the lost lines had nowhere to land: the produced PDF was
// simply missing them. `unclipScrollers` lifts the cap so the block renders — and measures — at its
// true height.
/** jsdom computes styles from real CSS, but reports no layout — `scrollHeight`/`clientHeight` are
 *  always 0. Stub them so the "still clipped by an explicit height" branch can be exercised. */
function withLayout(el: HTMLElement, scrollH: number, clientH: number): void {
  Object.defineProperty(el, 'scrollHeight', { value: scrollH, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientH, configurable: true });
}

function mount(html: string, css: string): HTMLElement {
  const style = document.createElement('style');
  style.textContent = css;
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(style, root);
  return root;
}

describe('unclipScrollers', () => {
  // `.term-body` really declares the `overflow: auto` shorthand; jsdom does not expand a shorthand
  // into its longhands for getComputedStyle, so the fixture spells out the longhand a real browser
  // would have computed from it.
  it('lifts the height cap off a block that scrolls its own content away', () => {
    const root = mount(
      `<div class="term"><div class="term-body"><span>line</span></div></div>`,
      `.term-body { max-height: 22rem; overflow-y: auto; }`,
    );
    const body = root.querySelector<HTMLElement>('.term-body')!;
    expect(getComputedStyle(body).overflowY).toBe('auto');

    unclipScrollers(root);

    // No cap ⇒ an `auto` box grows to its content and never scrolls: the rows exist on the page.
    expect(body.style.maxHeight).toBe('none');
    root.remove();
  });

  it('lets content spill when an explicit height still clips it — visible beats swallowed', () => {
    const root = mount(
      `<div class="log"><div class="log-body"><span>row</span></div></div>`,
      `.log-body { height: 100px; overflow-y: scroll; }`,
    );
    const body = root.querySelector<HTMLElement>('.log-body')!;
    withLayout(body, 900, 100); // still clipping after the cap is lifted

    unclipScrollers(root);

    expect(body.style.maxHeight).toBe('none');
    expect(body.style.overflow).toBe('visible');
    root.remove();
  });

  it('leaves an overflow:hidden containment net alone — it is not a scroller', () => {
    const root = mount(
      `<div class="card"><svg class="chart"></svg></div>`,
      `.card { overflow: hidden; max-height: 300px; }`,
    );
    const card = root.querySelector<HTMLElement>('.card')!;

    unclipScrollers(root);

    // Untouched: `overflow: hidden` is the design system's overflow-containment net, not a trapdoor
    // with rows behind it.
    expect(card.style.maxHeight).toBe('');
    expect(card.style.overflow).toBe('');
    root.remove();
  });

  it('is idempotent and safe on a subtree with nothing to unclip', () => {
    const root = mount(`<div class="plain"><p>prose</p></div>`, `.plain { color: red; }`);
    expect(() => {
      unclipScrollers(root);
      unclipScrollers(root);
    }).not.toThrow();
    root.remove();
  });
});

/* ── pagination — packing, splitting, balancing ────────────────────────────────────────────────────── */

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

// Split-to-fit: the packer no longer bounces a whole section to the next page when the section's
// own head could fill the space left on this one. The splitter keeps the typography judgment
// (orphan guards, sentence boundaries); the packer only asks. This is the fix for half-empty
// pages — especially page 1, whose masthead makes it the shortest.
describe('paginate — split-to-fit fills a page remainder instead of stranding it', () => {
  it('fills the rest of page 1 with the head of a splittable list', () => {
    // a=300 leaves 276px on page 1 — room for a heading and five ~44px rows of b. (b itself fits
    // a page, so the whole-page pre-split never fires; only split-to-fit is in play.)
    const pages = paginate([prose('a', 300), list('b', 12, 580)], OPTS);
    expect(pages[0].sections.map((s) => s.id)).toEqual(['a', 'b~0']);
    const head = pages[0].sections[1];
    // A meaningful head (no orphan), sized to the space that was actually left.
    expect(head.kind === 'rankedList' && head.data.items.length).toBeGreaterThanOrEqual(2);
    expect(head.measuredH ?? 0).toBeLessThanOrEqual(OPTS.contentH1 - 300 - SECTION_GAP);
    // The page is genuinely full now, not half empty.
    expect(pageHeight(pages[0].sections)).toBeGreaterThan(OPTS.contentH1 * 0.9);
    // Every row survives across the fragments and no page overflows.
    const totalRows = pages
      .flatMap((p) => p.sections)
      .reduce((n, s) => n + (s.kind === 'rankedList' ? s.data.items.length : 0), 0);
    expect(totalRows).toBe(12);
    pages.forEach((p, i) => {
      const cap = i === 0 ? OPTS.contentH1 : OPTS.contentHRest;
      expect(pageHeight(p.sections)).toBeLessThanOrEqual(cap + 1);
    });
  });

  it('still pushes whole when the remainder is below the minimum window', () => {
    // a=500 leaves 76px — a sliver not worth a "(cont.)" heading.
    const pages = paginate([prose('a', 500), list('b', 12, 580)], OPTS);
    expect(pages[0].sections.map((s) => s.id)).toEqual(['a']);
    expect(pages[1].sections.map((s) => s.id)).toEqual(['b']);
  });

  it('still pushes whole when the splitter declines (nothing meaningful fits)', () => {
    // prose with a one-character body cannot yield a worthwhile first fragment.
    const pages = paginate([prose('a', 300), prose('big', 500)], OPTS);
    expect(pages[0].sections.map((s) => s.id)).toEqual(['a']);
    expect(pages[1].sections.map((s) => s.id)).toEqual(['big']);
  });

  it('declines a one-row head — the orphan guard beats the fill', () => {
    // 196px remainder fits only one ~107px row under the 56px heading.
    const pages = paginate([prose('a', 380), list('b', 5, 590)], OPTS);
    expect(pages[0].sections.map((s) => s.id)).toEqual(['a']);
    expect(pages[1].sections.map((s) => s.id)).toEqual(['b']);
  });

  it('splits prose at a sentence boundary and conserves every character', () => {
    // Short enough that the prose section fits a page whole — only split-to-fit cuts it.
    const body = Array.from(
      { length: 14 },
      (_, i) => `Sentence number ${i} carries a modest amount of body text onward.`,
    ).join(' ');
    const p: Section = {
      kind: 'prose',
      id: 'p',
      source: 0,
      lead: false,
      measuredH: 56 + body.length * 0.5,
      data: { heading: 'Long', body },
    };
    const pages = paginate([prose('a', 300), p], OPTS);
    expect(pages[0].sections.map((s) => s.id)).toEqual(['a', 'p~0']);
    const rejoined = pages
      .flatMap((pg) => pg.sections)
      .filter((s) => s.kind === 'prose' && s.id.startsWith('p~'))
      .map((s) => (s.data as { body: string }).body)
      .join(' ');
    expect(rejoined).toBe(body);
    pages.forEach((pg, i) => {
      const cap = i === 0 ? OPTS.contentH1 : OPTS.contentHRest;
      expect(pageHeight(pg.sections)).toBeLessThanOrEqual(cap + 1);
    });
  });

  it('honors fill: false — the strict pass never splits, so no estimated height is placed', () => {
    const pages = paginate([prose('a', 300), list('b', 20, 1000)], { ...OPTS, fill: false });
    expect(pages[0].sections.map((s) => s.id)).toEqual(['a']);
    // The over-tall list lands atomically (the documented last resort), not as fragments whose
    // heights would be unverified arithmetic estimates.
    expect(pages[1].sections.map((s) => s.id)).toEqual(['b']);
    expect(
      pages[1].sections[0].kind === 'rankedList' && pages[1].sections[0].data.items.length,
    ).toBe(20);
  });

  it('splits rows taller than half a page one-per-page instead of refusing and clipping', () => {
    // Three 500px rows: only one fits any page. The orphan guard must not fire on a whole-page
    // window — refusing to split here places the 1556px section atomically and clips it.
    const pages = paginate([list('t', 3, 1556)], OPTS);
    expect(auditPages(pages, OPTS)).toEqual([]);
    const counts = pages
      .flatMap((p) => p.sections)
      .map((s) => (s.kind === 'rankedList' ? s.data.items.length : 0));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(Math.max(...counts)).toBe(1);
  });

  it('an oversized section starting mid-page leaves no seams — one fragment per page, one "(cont.)"', () => {
    // The exact target case: an intro, then a long table. One split scheme means the head fills
    // page 1's remainder and each continuation fills a whole page — never two fragments of the
    // same section stacked on one page, never a doubled "(cont.)".
    const pages = paginate([prose('a', 300), list('big', 40, 2000)], OPTS);
    expect(auditPages(pages, OPTS)).toEqual([]);
    const base = (id: string) => id.split('~')[0];
    for (const p of pages) {
      const bigs = p.sections.filter((s) => base(s.id) === 'big');
      expect(bigs.length).toBeLessThanOrEqual(1);
    }
    const headings = pages
      .flatMap((p) => p.sections)
      .map((s) => ('heading' in s.data ? (s.data.heading ?? '') : ''));
    expect(headings.some((h) => h.includes('(cont.) (cont.)'))).toBe(false);
    const totalRows = pages
      .flatMap((p) => p.sections)
      .reduce((n, s) => n + (s.kind === 'rankedList' ? s.data.items.length : 0), 0);
    expect(totalRows).toBe(40);
    // And the point of it all: page 1 is genuinely full.
    expect(pageHeight(pages[0].sections)).toBeGreaterThan(OPTS.contentH1 * 0.9);
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
