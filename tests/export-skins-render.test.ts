// What an export actually renders: the skin registry and its chrome, the "no-squish" label
// contract, the speaker-notes print handout, and the raster → PDF step that turns those pages into
// a file. The rasterizer's browser-only dependencies (modern-screenshot, jsPDF) and the text layer
// are faked here — see export-pdf-pipeline.test.ts for the real text layer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { printDeckWithNotes } from '../src/export/pipeline/exportDeck';
import { normalize } from '../src/export/model/normalize';
import { SKINS, SKIN_ORDER, suggestSkin, editorial, swiss } from '../src/export/skins/registry';
import { SHARED_SECTIONS } from '../src/export/skins/sections';
import {
  StandardFooter,
  StandardMasthead,
  StandardRunningHeader,
} from '../src/export/skins/chrome/standard';
import { EditorialMasthead, SwissMasthead } from '../src/export/skins/chrome/mastheads';
import { SectionHeading } from '../src/export/skins/sections/parts';
import { DistributionBars, MetricTiles } from '../src/export/skins/sections/data';
import { SLIDE_SKINS } from '../src/slides/skins/registry';
import type { Slide } from '../src/slides/model/Slide';
import type { SkinId } from '../src/export/skins/types';
import type { Block } from '../src/data/conversation';
import type {
  DistributionBarsData,
  ExportMeta,
  MetricTilesData,
  SectionKind,
} from '../src/export/model/ExportDoc';

/* ── the skin registry and its chrome ──────────────────────────────────────────────────────────────── */

const ALL_SKINS: SkinId[] = [
  'editorial',
  'swiss',
  'terminal',
  'executive',
  'luxury',
  'medical',
  'school',
  'financial',
  'research',
  'legal',
];

const ALL_KINDS: SectionKind[] = [
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
  'contents',
  'sourcesAppendix',
  'prose',
];

describe('skin registry', () => {
  it('defines all 10 skins, in order, each well-formed', () => {
    expect(new Set(SKIN_ORDER)).toEqual(new Set(ALL_SKINS));
    expect(SKIN_ORDER).toHaveLength(10);
    for (const id of ALL_SKINS) {
      const s = SKINS[id];
      expect(s.id).toBe(id);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.brand.name.length).toBeGreaterThan(0);
      // Full chrome — a bespoke or standard masthead, plus a running header and footer.
      expect(typeof s.chrome.masthead).toBe('function');
      expect(typeof s.chrome.runningHeader).toBe('function');
      expect(typeof s.chrome.footer).toBe('function');
      // Fonts are self-hosted (public/fonts/), not fetched from the Google Fonts CDN.
      expect(s.fonts.hrefs.length).toBeGreaterThan(0);
      for (const href of s.fonts.hrefs) {
        expect(href.startsWith('/fonts/')).toBe(true);
      }
      expect(s.fonts.faces.length).toBeGreaterThan(0);
      // Core token coverage so a section never reads `undefined` into a CSS value.
      for (const key of [
        'pageBg',
        'ink',
        'muted',
        'faint',
        'accent',
        'tint',
        'rule',
        'track',
        'padding',
      ] as const) {
        expect(s.tokens[key], `${id}.${key}`).toBeTruthy();
      }
    }
  });

  it('gives 9 templates a bespoke masthead and only Terminal the standard one', () => {
    // Editorial (accent-period headline) and Executive (CONFIDENTIAL banner) now ship bespoke
    // mastheads too; only Terminal keeps the standard header — its identity is the dark console body.
    const bespoke: SkinId[] = [
      'editorial',
      'swiss',
      'executive',
      'luxury',
      'medical',
      'school',
      'financial',
      'research',
      'legal',
    ];
    for (const id of bespoke) {
      expect(SKINS[id].chrome.masthead, `${id} should have a bespoke masthead`).not.toBe(
        StandardMasthead,
      );
    }
    expect(SKINS.terminal.chrome.masthead).toBe(StandardMasthead);
  });

  it('wires the per-skin section overrides (Financial/Swiss/Terminal ledgers & grids)', () => {
    expect(typeof SKINS.financial.sections.specTable).toBe('function');
    expect(typeof SKINS.swiss.sections.specTable).toBe('function');
    expect(typeof SKINS.terminal.sections.specTable).toBe('function');
    // Skins without an override keep an empty map (they inherit the shared renderers).
    expect(SKINS.editorial.sections.specTable).toBeUndefined();
    // Financial carries up/down colours for its signed-delta ledger.
    expect(SKINS.financial.tokens.pos).toBeTruthy();
    expect(SKINS.financial.tokens.neg).toBeTruthy();
  });

  it('has a shared renderer for every section archetype', () => {
    expect(new Set(Object.keys(SHARED_SECTIONS))).toEqual(new Set(ALL_KINDS));
    for (const kind of ALL_KINDS) expect(typeof SHARED_SECTIONS[kind]).toBe('function');
  });
});

describe('suggestSkin', () => {
  it('routes a domain to a fitting template, defaulting to editorial', () => {
    expect(suggestSkin('Finance')).toBe('financial');
    expect(suggestSkin('Personal finance & investing')).toBe('financial');
    expect(suggestSkin('Health')).toBe('medical');
    expect(suggestSkin('Legal')).toBe('legal');
    expect(suggestSkin('Research')).toBe('research');
    expect(suggestSkin('Education')).toBe('school');
    expect(suggestSkin('Software engineering')).toBe('terminal');
    expect(suggestSkin('Travel')).toBe('editorial');
    expect(suggestSkin(undefined)).toBe('editorial');
  });
});

function meta(overrides: Partial<ExportMeta> = {}): ExportMeta {
  return { title: 'Quarterly review', sources: [], generatedAt: Date.now(), ...overrides };
}

describe('masthead issue numbering', () => {
  it('falls back to "No. 01" when a single-answer export never sets an ordinal', () => {
    const html = renderToStaticMarkup(
      createElement(StandardMasthead, { meta: meta(), skin: SKINS.terminal }),
    );
    expect(html).toContain('No. 01');
  });

  it("shows the primary answer's real session position for a multi-answer export", () => {
    const html = renderToStaticMarkup(
      createElement(StandardMasthead, { meta: meta({ num: 3 }), skin: SKINS.terminal }),
    );
    expect(html).toContain('No. 03');
    expect(html).not.toContain('No. 01');
  });

  it('a bespoke masthead (Editorial) also honours meta.num, still defaulting to 01', () => {
    const bare = renderToStaticMarkup(
      createElement(EditorialMasthead, { meta: meta(), skin: SKINS.editorial }),
    );
    expect(bare).toContain('No. 01');

    const numbered = renderToStaticMarkup(
      createElement(EditorialMasthead, { meta: meta({ num: 5 }), skin: SKINS.editorial }),
    );
    expect(numbered).toContain('No. 05');
  });
});

describe('SourcesAppendix — link safety', () => {
  const render = (items: { name: string; url?: string }[]) =>
    renderToStaticMarkup(
      createElement(SHARED_SECTIONS.sourcesAppendix, {
        data: { items },
        skin: SKINS.editorial,
      }),
    );

  it('renders a genuine http(s) source url as a real, safely-attributed <a href>', () => {
    const html = render([
      { name: 'Wikipedia: Chicago', url: 'https://en.wikipedia.org/wiki/Chicago' },
    ]);
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Chicago"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it('never turns a javascript:/data: scheme into a clickable href — model output is not trusted', () => {
    const html = render([
      { name: 'Malicious', url: 'javascript:alert(1)' },
      { name: 'Also bad', url: 'data:text/html,<script>alert(1)</script>' },
    ]);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Malicious');
    expect(html).toContain('Also bad');
  });

  it('renders a source with no url as plain text, no link implied', () => {
    const html = render([{ name: 'Field notes' }]);
    expect(html).not.toContain('<a ');
    expect(html).toContain('Field notes');
  });
});

/* ── the no-squish label contract ──────────────────────────────────────────────────────────────────── */

// Regression coverage for the export "no-squish" contract. A handful of labels are short,
// fixed-format strings by construction (the brand wordmark, "FIG. N", "SCALE 1–N", the footer
// page count) — these keep a hard `white-space: nowrap` (+ `flexShrink: 0` where they share a row
// with content that can shrink) because they must never wrap, under any circumstance. Everything
// else that must render as a single line but ISN'T bounded by construction (a real section
// heading, a computed stat, a metric tile value) instead renders through `FitLine`, which measures
// its own natural width after mount and shrinks it visually via `transform: scale()` rather than
// ever wrapping or overflowing its box. Genuinely long, data-bearing content (a distributionBars
// label) gets neither treatment — it wraps normally at word boundaries, like ordinary text.
//
// jsdom has no text layout engine, so these tests confirm the MECHANISM — which elements carry a
// permanent nowrap, which route through FitLine's own forced-nowrap inner span, and which are left
// free to wrap — rather than an actual pixel measurement. See the raster → PDF section below and
// the FitLine unit coverage alongside export-document-layout.test.ts for the numeric scale math.
function mount(el: ReturnType<typeof createElement>): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(el));
  return host;
}

/** Every span the host contains, for a coarse "none of these ever wrap" sweep. */
function spanTexts(host: HTMLDivElement): { el: HTMLElement; nowrap: boolean }[] {
  return Array.from(host.querySelectorAll('span')).map((el) => ({
    el: el as HTMLElement,
    nowrap: (el as HTMLElement).style.whiteSpace === 'nowrap',
  }));
}

/** The single deepest (childless) element whose own text is exactly `text` — the actual
 *  text-bearing leaf, as opposed to an ancestor wrapper (e.g. FitLine's outer box) that merely
 *  contains the same text via its descendant. */
function leafFor(host: HTMLElement, text: string): HTMLElement {
  const matches = Array.from(host.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.children.length === 0 && el.textContent?.trim() === text,
  );
  expect(matches, `exactly one leaf for "${text}"`).toHaveLength(1);
  return matches[0];
}

const META: ExportMeta = {
  title: 'The State of Urban Mobility',
  sub: 'A field study',
  topic: 'Strategy',
  sources: [],
  generatedAt: Date.now(),
};

describe('SectionHeading — fig/trailing are bounded (permanent nowrap); label is not (FitLine)', () => {
  it('fig and trailing carry nowrap + flexShrink:0, so the row shrink never touches them', () => {
    const host = mount(
      createElement(SectionHeading, {
        skin: editorial,
        label: 'Rollout',
        fig: '3',
        trailing: 'Scale 1–3',
      }),
    );
    for (const text of ['FIG. 3', 'Scale 1–3']) {
      const leaf = leafFor(host, text);
      expect(leaf.style.whiteSpace, text).toBe('nowrap');
      expect(leaf.style.flexShrink, text).toBe('0');
    }
  });

  it('label routes through FitLine: its text-bearing leaf forces nowrap, but the box around it does not — that box is what absorbs the row squeeze', () => {
    const host = mount(createElement(SectionHeading, { skin: editorial, label: 'Rollout' }));
    const leaf = leafFor(host, 'Rollout');
    expect(leaf.style.whiteSpace).toBe('nowrap');
    const outer = leaf.parentElement as HTMLElement;
    expect(outer.style.whiteSpace).not.toBe('nowrap');
    expect(outer.style.overflow).toBe('hidden');
  });

  it('a long real heading still renders as a single FitLine leaf, never split across multiple nowrap spans', () => {
    const longHeading = 'A Comprehensive Multi-Stakeholder Governance Framework Review';
    const host = mount(createElement(SectionHeading, { skin: editorial, label: longHeading }));
    expect(() => leafFor(host, longHeading)).not.toThrow();
  });
});

describe('DistributionBars — the total is unbounded (FitLine), labels wrap, values stay bounded', () => {
  const data: DistributionBarsData = {
    heading: 'Where the budget goes',
    total: '$1.2 B',
    bars: [
      { label: 'Operations', pct: 0.46, value: '46%' },
      { label: 'Capital', pct: 0.31, value: '31%' },
    ],
  };

  it('the big total figure renders through FitLine, not a hardcoded nowrap span', () => {
    const host = mount(createElement(DistributionBars, { skin: editorial, data }));
    const leaf = leafFor(host, '$1.2 B');
    expect(leaf.style.whiteSpace).toBe('nowrap');
    expect((leaf.parentElement as HTMLElement).style.whiteSpace).not.toBe('nowrap');
  });

  it('bar labels are real content: no nowrap, free to wrap, and claim the row (flex-grow) so a wrapped line stops short of the value', () => {
    const host = mount(createElement(DistributionBars, { skin: editorial, data }));
    const label = leafFor(host, 'Operations');
    expect(label.style.whiteSpace).not.toBe('nowrap');
    expect(label.style.flexGrow).toBe('1');
    expect(label.style.flexShrink).toBe('1');
  });

  it('bar values stay bounded: nowrap + flexShrink:0, so they never wrap or get squeezed by a wrapped label', () => {
    const host = mount(createElement(DistributionBars, { skin: editorial, data }));
    const value = leafFor(host, '46%');
    expect(value.style.whiteSpace).toBe('nowrap');
    expect(value.style.flexShrink).toBe('0');
  });

  it('a genuinely long bar label no longer forces a hardcoded nowrap anywhere in the row', () => {
    const longLabel: DistributionBarsData = {
      bars: [{ label: 'Field operations across every regional distribution center', pct: 0.5 }],
    };
    const host = mount(createElement(DistributionBars, { skin: editorial, data: longLabel }));
    const spans = spanTexts(host).filter((s) => s.el.textContent?.trim());
    expect(spans.some((s) => !s.nowrap)).toBe(true);
  });
});

describe('MetricTiles — tile values are unbounded (FitLine)', () => {
  const data: MetricTilesData = {
    heading: 'Key metrics',
    tiles: [{ value: '$482,910,004', label: 'Revenue' }],
  };

  it('a tile value renders through FitLine, not a plain unscaled div', () => {
    const host = mount(createElement(MetricTiles, { skin: editorial, data }));
    const leaf = leafFor(host, '$482,910,004');
    expect(leaf.style.whiteSpace).toBe('nowrap');
    expect((leaf.parentElement as HTMLElement).style.whiteSpace).not.toBe('nowrap');
  });
});

describe('Masthead/footer chrome — brand, tagline, and kicker are bounded; still never wrap', () => {
  it('StandardMasthead protects the wordmark, tagline, and topic kicker', () => {
    const host = mount(createElement(StandardMasthead, { meta: META, skin: editorial }));
    const spans = spanTexts(host);
    expect(spans.length).toBeGreaterThanOrEqual(3);
    expect(spans.every((s) => s.nowrap)).toBe(true);
  });

  it('EditorialMasthead protects the same three labels', () => {
    const host = mount(createElement(EditorialMasthead, { meta: META, skin: editorial }));
    // Excludes the standalone accent-period span after the headline — a single "." never wraps,
    // nowrap or not, so it isn't part of this contract.
    const spans = spanTexts(host).filter((s) => (s.el.textContent?.trim().length ?? 0) > 1);
    expect(spans.length).toBeGreaterThanOrEqual(3);
    expect(spans.every((s) => s.nowrap)).toBe(true);
  });

  it('SwissMasthead protects its wordmark, tagline, and topic kicker', () => {
    const host = mount(createElement(SwissMasthead, { meta: META, skin: swiss }));
    const spans = spanTexts(host).filter((s) => s.el.textContent?.trim());
    expect(spans.length).toBeGreaterThanOrEqual(3);
    expect(spans.every((s) => s.nowrap)).toBe(true);
  });

  it('StandardRunningHeader protects the wordmark (the topic/title fallback ellipsizes instead)', () => {
    const host = mount(createElement(StandardRunningHeader, { meta: META, skin: editorial }));
    const [wordmark] = spanTexts(host);
    expect(wordmark.nowrap).toBe(true);
  });

  it('StandardFooter protects the brand line and the page counter', () => {
    const host = mount(
      createElement(StandardFooter, { meta: META, skin: editorial, page: 1, total: 8 }),
    );
    const spans = spanTexts(host);
    expect(spans).toHaveLength(2);
    expect(spans.every((s) => s.nowrap)).toBe(true);
  });
});

/* ── the speaker-notes print handout ───────────────────────────────────────────────────────────────── */

// The "Print with notes" vector path (printDeckWithNotes). Exercises
// the real portal DOM (no rasterizer involved — this is the selectable-text print path, same as
// printDeck), asserting each slide's speaker-notes text actually lands in the printed structure and
// that a slide with no composed `notes` falls back to the same content-derived label the pptx/PDF
// paths use. window.print is stubbed since jsdom doesn't implement it.
const skin = SLIDE_SKINS.folio;

const slides: Slide[] = [
  {
    kind: 'cover',
    id: 'cover',
    source: -1,
    data: { title: 'The State of Urban Mobility', subtitle: 'A field study across twelve cities' },
    // no notes — exercises the content-derived fallback
  },
  {
    kind: 'quote',
    id: 'q1',
    source: 0,
    data: { body: 'Density drives ridership.', attribution: 'City Atlas' },
    notes: 'Emphasize the density stat before moving to frequency.',
  },
];

/** Finish the print portal's lifecycle the same way a real `afterprint` event would, so the host
 *  and its 120s safety timer never leak into the next test. */
function finishPrint() {
  window.dispatchEvent(new Event('afterprint'));
}

describe('printDeckWithNotes — the speaker-notes print handout', () => {
  // Scoped to this describe so the teardown (and its vi.restoreAllMocks) only ever runs for the
  // print-handout tests, exactly as it did when this suite had a file to itself.
  afterEach(() => {
    finishPrint();
    document.body.classList.remove('mavea-printing');
    document.querySelectorAll('.mavea-export-slides-notes').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  it('prints one notes block per slide, each carrying that slide’s real notes text', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});

    await printDeckWithNotes(slides, skin);

    const pages = document.querySelectorAll('.mavea-export-slides-notes .slide-page-notes');
    expect(pages.length).toBe(slides.length);

    const notesText = Array.from(
      document.querySelectorAll('.mavea-export-slides-notes .slide-notes-text'),
    ).map((el) => el.textContent);
    // Cover has no composed `notes` → falls back to its own title (slideText's cover case), the
    // same fallback the pptx export and Present's presenter overlay use. The quote's real composed
    // notes line passes through unchanged.
    expect(notesText).toEqual([
      'The State of Urban Mobility',
      'Emphasize the density stat before moving to frequency.',
    ]);
  });

  it('triggers a real window.print() and marks the body for the print-only CSS scope', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    const done = printDeckWithNotes(slides, skin);
    await done;

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('mavea-printing')).toBe(true);
  });

  it('uses its own host class so its page rules can never leak onto the plain (no-notes) print', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});

    await printDeckWithNotes(slides, skin);

    const host = document.querySelector('.mavea-export-doc.mavea-export-slides-notes');
    expect(host).not.toBeNull();
    expect(host?.classList.contains('mavea-export-slides')).toBe(false);
  });

  it('tears the portal down once printing finishes (afterprint), leaving no leaked DOM', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});

    await printDeckWithNotes(slides, skin);
    expect(document.querySelector('.mavea-export-slides-notes')).not.toBeNull();

    finishPrint();

    expect(document.querySelector('.mavea-export-slides-notes')).toBeNull();
    expect(document.body.classList.contains('mavea-printing')).toBe(false);
  });
});

/* ── raster → PDF, and the extractor fixes behind it ───────────────────────────────────────────────── */

// rasterToPdf lazy-loads modern-screenshot + jsPDF (real browser canvas / PDF encoding, neither
// available in jsdom) — stand in fakes so the pipeline's own logic (progress ticks, the
// placeholder noun, the properties dictionary) can be exercised directly, with no real rasterizer.
const mockDomToCanvas = vi.fn();
vi.mock('modern-screenshot', () => ({
  domToCanvas: (...args: unknown[]) => mockDomToCanvas(...args),
}));

const pdf = {
  addPage: vi.fn(),
  addImage: vi.fn(),
  setFillColor: vi.fn(),
  rect: vi.fn(),
  setTextColor: vi.fn(),
  setFontSize: vi.fn(),
  getTextWidth: vi.fn(() => 10),
  text: vi.fn(),
  setProperties: vi.fn(),
  output: vi.fn(() => new Blob(['pdf'])),
};
// A vi.fn() wrapper around a real function (not an arrow — arrows can never be `new`ed) so tests
// can assert on the constructor's own args, e.g. the px_scaling hotfix. `new FakeJsPdf(...)` still
// returns `pdf`: a constructor that explicitly returns an object makes `new` use that object
// instead of `this`.
const FakeJsPdf = vi.fn(function FakeJsPdfImpl() {
  return pdf;
});
vi.mock('jspdf', () => ({ jsPDF: FakeJsPdf }));

// The real text layer needs actual browser layout (Range.getClientRects, absent in jsdom — see
// textLayer.ts's own tests for that); here it's just a boundary to assert raster.ts calls (or
// doesn't call) per the `documentMode` flag, same spirit as the modern-screenshot/jsPDF fakes above.
const mockApplyTextLayer = vi.fn();
vi.mock('../src/export/pipeline/textLayer', () => ({
  applyTextLayer: (...args: unknown[]) => mockApplyTextLayer(...args),
}));

function fakeCanvas(): {
  toDataURL: (type?: string, quality?: number) => string;
  width: number;
  height: number;
} {
  return {
    toDataURL: (type = 'image/jpeg') =>
      type === 'image/png' ? 'data:image/png;base64,AAAA' : 'data:image/jpeg;base64,AAAA',
    width: 0,
    height: 0,
  };
}

function pageContainer(count: number): HTMLElement {
  const container = document.createElement('div');
  for (let i = 0; i < count; i += 1) {
    const page = document.createElement('div');
    page.className = 'ex-page';
    container.appendChild(page);
  }
  return container;
}

/** Minimal ConversationSpec scaffold; blocks overridden per case. */
function spec(blocks: Block[]) {
  return {
    id: 'test' as unknown as import('../src/types/mavea').TopicId,
    workspace: 't',
    title: 'T',
    sub: 'S',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home' as const,
    suggests: [],
    keywords: [],
  };
}

describe('prose fallback never leaves a placeholder stub', () => {
  it('drops a block with no real heading and no real body (not a bare type-name heading)', () => {
    const empty = { type: 'mysteryblock', col: 6, props: {} } as unknown as Block;
    expect(normalize([spec([empty])])).toEqual([]);
  });

  it('keeps a prose block only with real content, never an empty body paired with a type name', () => {
    const withText = {
      type: 'mysteryblock',
      col: 6,
      props: { title: 'Real heading' },
    } as unknown as Block;
    const out = normalize([spec([withText])]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('prose');
    if (out[0].kind === 'prose') expect(out[0].data.heading).toBe('Real heading');
  });
});

describe('donut handles percent and fraction conventions identically', () => {
  const donut = (pct: number) =>
    ({
      type: 'donut',
      col: 6,
      props: { title: 'Mix', rows: [{ label: 'A', pct, color: '#000' }] },
    }) as unknown as Block;

  it('reads 40 (percent) and 0.4 (fraction) both as 40%', () => {
    const asPct = normalize([spec([donut(40)])])[0];
    const asFrac = normalize([spec([donut(0.4)])])[0];
    for (const s of [asPct, asFrac]) {
      expect(s.kind).toBe('distributionBars');
      if (s.kind === 'distributionBars') {
        expect(s.data.bars[0].value).toBe('40%');
        expect(s.data.bars[0].pct).toBeCloseTo(0.4, 5);
      }
    }
  });
});

describe('pipeline never prints the literal "undefined"', () => {
  it('omits the value when a stage has no numeric v', () => {
    const block = {
      type: 'pipeline',
      col: 6,
      props: { title: 'Funnel', stages: [{ k: 'Leads', v: 100 }, { k: 'Unknown' }] },
    } as unknown as Block;
    const s = normalize([spec([block])])[0];
    expect(s.kind).toBe('figureGrid');
    if (s.kind === 'figureGrid') {
      const vals = s.data.cells.map((c) => c.value);
      expect(vals.some((v) => /undefined/.test(v ?? ''))).toBe(false);
      expect(s.data.cells.find((c) => c.title === 'Unknown')?.value).toBeUndefined();
    }
  });
});

describe('heat clamps the dot scale and column count', () => {
  it('caps a runaway level to a sane dot scale', () => {
    const block = {
      type: 'heat',
      col: 12,
      props: { title: 'H', cols: ['a', 'b'], rows: [{ label: 'r', cells: [50, 2] }] },
    } as unknown as Block;
    const s = normalize([spec([block])])[0];
    expect(s.kind).toBe('ratingMatrix');
    if (s.kind === 'ratingMatrix') expect(s.data.scale).toBeLessThanOrEqual(6);
  });
});

describe('suggestSkin does not misroute on substrings', () => {
  it('keeps medical/financial topics off the terminal skin', () => {
    expect(suggestSkin('Physical therapy plan')).not.toBe('terminal'); // "therapy" must not match \bapi\b
    expect(suggestSkin('Medical device safety')).toBe('medical'); // "device" must not match \bdev\b
    expect(suggestSkin('REST API design')).toBe('terminal'); // a real api token still routes
  });
});

describe('rasterToPdf', () => {
  beforeEach(() => {
    mockDomToCanvas.mockReset();
    FakeJsPdf.mockClear();
    mockApplyTextLayer.mockClear();
    for (const fn of Object.values(pdf)) fn.mockClear();
  });

  it('drives onProgress across every page of a multi-page document, start to finish', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    const ticks: Array<[number, number]> = [];

    await rasterToPdf(pageContainer(3), {
      background: '#ffffff',
      onProgress: (done, total) => ticks.push([done, total]),
    });

    expect(ticks).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('labels a failed page "Page N" by default, and "Slide N" when the deck pipeline asks for it', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');

    mockDomToCanvas.mockRejectedValueOnce(new Error('rasterize failed'));
    await rasterToPdf(pageContainer(1), { background: '#ffffff' });
    expect(pdf.text).toHaveBeenCalledWith(
      'Page 1 could not be rendered',
      expect.any(Number),
      expect.any(Number),
      { align: 'center' },
    );

    pdf.text.mockClear();
    mockDomToCanvas.mockRejectedValueOnce(new Error('rasterize failed'));
    await rasterToPdf(pageContainer(1), { background: '#ffffff', pageNoun: 'Slide' });
    expect(pdf.text).toHaveBeenCalledWith(
      'Slide 1 could not be rendered',
      expect.any(Number),
      expect.any(Number),
      { align: 'center' },
    );
  });

  it('writes the real title/subject/author/keywords into the PDF via setProperties', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());

    await rasterToPdf(pageContainer(1), {
      background: '#ffffff',
      properties: {
        title: 'Q3 board review',
        subject: 'Finance',
        author: 'Mavea',
        keywords: 'a.pdf, b.pdf',
        creator: 'Mavea',
      },
    });

    expect(pdf.setProperties).toHaveBeenCalledWith({
      title: 'Q3 board review',
      subject: 'Finance',
      author: 'Mavea',
      keywords: 'a.pdf, b.pdf',
      creator: 'Mavea',
    });
  });

  it('never calls setProperties when the caller supplies no properties', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(1), { background: '#ffffff' });
    expect(pdf.setProperties).not.toHaveBeenCalled();
  });

  it('constructs jsPDF with the px_scaling hotfix, so px coordinates map to true page points', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(1), { background: '#ffffff' });
    expect(FakeJsPdf).toHaveBeenCalledWith(
      expect.objectContaining({ unit: 'px', hotfixes: ['px_scaling'] }),
    );
  });

  it('lays an invisible text layer over every successfully-rastered page in documentMode', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(2), { background: '#ffffff', documentMode: true });
    expect(mockApplyTextLayer).toHaveBeenCalledTimes(2);
    expect(mockApplyTextLayer).toHaveBeenNthCalledWith(1, pdf, expect.any(HTMLElement), 816, 1056);
  });

  it('never touches the text layer when documentMode is unset (the deck pipeline)', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(2), { background: '#ffffff' });
    expect(mockApplyTextLayer).not.toHaveBeenCalled();
  });

  it('skips the text layer for a page that fell back to a placeholder', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockRejectedValue(new Error('rasterize failed'));
    await rasterToPdf(pageContainer(1), { background: '#ffffff', documentMode: true });
    expect(mockApplyTextLayer).not.toHaveBeenCalled();
  });

  it('prefers PNG per document page unless it more than doubles the JPEG estimate', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    // Small PNG, well under 2x the JPEG estimate — a typical flat-colour-plus-text page.
    mockDomToCanvas.mockResolvedValueOnce({
      toDataURL: (type = 'image/jpeg') =>
        type === 'image/png'
          ? `data:image/png;base64,${'A'.repeat(100)}`
          : `data:image/jpeg;base64,${'A'.repeat(60)}`,
      width: 0,
      height: 0,
    });
    // A photo-heavy page: PNG balloons past 2x the JPEG estimate, so JPEG should win instead.
    mockDomToCanvas.mockResolvedValueOnce({
      toDataURL: (type = 'image/jpeg') =>
        type === 'image/png'
          ? `data:image/png;base64,${'A'.repeat(2000)}`
          : `data:image/jpeg;base64,${'A'.repeat(60)}`,
      width: 0,
      height: 0,
    });

    await rasterToPdf(pageContainer(2), { background: '#ffffff', documentMode: true });

    expect(pdf.addImage).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('image/png'),
      'PNG',
      0,
      0,
      816,
      1056,
    );
    expect(pdf.addImage).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('image/jpeg'),
      'JPEG',
      0,
      0,
      816,
      1056,
    );
  });

  it('never tries PNG for the (JPEG-only) slide-deck pipeline', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(1), { background: '#ffffff' });
    expect(pdf.addImage).toHaveBeenCalledWith(
      expect.stringContaining('image/jpeg'),
      'JPEG',
      0,
      0,
      816,
      1056,
    );
  });

  it('retries a failed page capture once with cross-origin images filtered out', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockRejectedValueOnce(new Error('tainted canvas'));
    mockDomToCanvas.mockResolvedValueOnce(fakeCanvas());

    await rasterToPdf(pageContainer(1), { background: '#ffffff' });

    expect(mockDomToCanvas).toHaveBeenCalledTimes(2);
    expect(mockDomToCanvas.mock.calls[0][1]).not.toHaveProperty('filter');
    expect(mockDomToCanvas.mock.calls[1][1]).toEqual(
      expect.objectContaining({ filter: expect.any(Function) }),
    );
    // The retry succeeded, so the page renders normally — no placeholder text drawn.
    expect(pdf.text).not.toHaveBeenCalled();
  });

  it('falls back to the placeholder only once BOTH the capture and its retry fail', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockRejectedValue(new Error('tainted canvas'));

    await rasterToPdf(pageContainer(1), { background: '#ffffff' });

    expect(mockDomToCanvas).toHaveBeenCalledTimes(2);
    expect(pdf.text).toHaveBeenCalledWith(
      'Page 1 could not be rendered',
      expect.any(Number),
      expect.any(Number),
      { align: 'center' },
    );
  });
});
