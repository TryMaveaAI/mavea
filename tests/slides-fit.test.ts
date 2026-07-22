import { cleanup, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExportMeta, Section } from '../src/export/model/ExportDoc';
import { composeSlides } from '../src/slides/model/compose';
import type { Slide } from '../src/slides/model/Slide';
import { SlideCanvas } from '../src/slides/SlideStage';
import { computeStageFit } from '../src/slides/stageFit';
import {
  AGENDA_ITEM_TIERS,
  clampStyle,
  CLOSING_TIERS,
  COVER_TIERS,
  DIVIDER_TIERS,
  FULLBLEED_TIERS,
  KEYFIG_BODY_TIERS,
  KEYFIG_VALUE_TIERS,
  type Ladder,
  NOIR_QUOTE_TIERS,
  NORTH_STATEMENT_TIERS,
  pickTier,
  PRESS_BODY_TIERS,
  PRESS_HEADING_TIERS,
  PROSE_BODY_TIERS,
  PROSE_HEADING_TIERS,
  QUOTE_TIERS,
  tierIndex,
  TITLE_TIERS,
  useAutoFit,
} from '../src/slides/skins/layouts/fit';
import { SLIDE_SKIN_ORDER, SLIDE_SKINS } from '../src/slides/skins/registry';

afterEach(cleanup);

const ALL_LADDERS: Record<string, Ladder> = {
  COVER_TIERS,
  CLOSING_TIERS,
  DIVIDER_TIERS,
  QUOTE_TIERS,
  NOIR_QUOTE_TIERS,
  NORTH_STATEMENT_TIERS,
  PROSE_HEADING_TIERS,
  PROSE_BODY_TIERS,
  PRESS_HEADING_TIERS,
  PRESS_BODY_TIERS,
  KEYFIG_VALUE_TIERS,
  KEYFIG_BODY_TIERS,
  FULLBLEED_TIERS,
  TITLE_TIERS,
  AGENDA_ITEM_TIERS,
};

describe('computeStageFit — Present/preview never upscales past the design canvas', () => {
  it('shrinks to fit a container smaller than the 1920×1080 design canvas', () => {
    expect(computeStageFit(960, 540)).toBeCloseTo(0.5);
    expect(computeStageFit(320, 240)).toBeCloseTo(320 / 1920); // height is the looser axis
  });

  it(
    'never scales past 1 on a container roomier than the design canvas — the regression this ' +
      'guards: an ultrawide/4K Present display used to stretch real text past its authored ' +
      'resolution, which is exactly what reads as blurry',
    () => {
      expect(computeStageFit(2560, 1440)).toBe(1);
      expect(computeStageFit(3440, 1934)).toBe(1);
    },
  );

  it('is exactly 1 at the design canvas size', () => {
    expect(computeStageFit(1920, 1080)).toBe(1);
  });

  it('falls back to width-only fit when no height is available (h <= 0)', () => {
    expect(computeStageFit(960, 0)).toBeCloseTo(0.5);
  });

  it('stays at 1 for a degenerate (unmeasured) width', () => {
    expect(computeStageFit(0, 500)).toBe(1);
    expect(computeStageFit(-10, 500)).toBe(1);
  });
});

describe('fit engine', () => {
  it('pickTier selects by the inclusive character budget and clamps to the last tier', () => {
    expect(pickTier(60, COVER_TIERS).size).toBe(132);
    expect(pickTier(61, COVER_TIERS).size).toBe(108);
    expect(pickTier(10_000, COVER_TIERS).size).toBe(64);
    expect(tierIndex(0, COVER_TIERS)).toBe(0);
    expect(tierIndex(10_000, COVER_TIERS)).toBe(COVER_TIERS.length - 1);
  });

  it('ladders are ordered big→small and every tier has a positive line cap', () => {
    for (const [name, ladder] of Object.entries(ALL_LADDERS)) {
      for (let i = 1; i < ladder.length; i += 1) {
        expect(ladder[i].size, `${name}[${i}] size`).toBeLessThanOrEqual(ladder[i - 1].size);
        expect(ladder[i].upTo, `${name}[${i}] upTo`).toBeGreaterThanOrEqual(ladder[i - 1].upTo);
      }
      for (const tier of ladder) expect(tier.maxLines, name).toBeGreaterThanOrEqual(1);
    }
  });

  it('no single tier exceeds the slide content budget (size × line × maxLines)', () => {
    // A SlideFrame leaves ~760–820px; full-frame layouts a little more. 560px per text block keeps
    // headroom for the kicker, footer, and sibling blocks that stack with it.
    for (const [name, ladder] of Object.entries(ALL_LADDERS)) {
      for (const tier of ladder) {
        expect(
          tier.size * tier.line * tier.maxLines,
          `${name} @ ${tier.size}px`,
        ).toBeLessThanOrEqual(560);
      }
    }
  });

  it('clampStyle emits a finite -webkit line clamp', () => {
    const s = clampStyle(3);
    expect(s.WebkitLineClamp).toBe(3);
    expect(s.display).toBe('-webkit-box');
    expect(s.overflow).toBe('hidden');
  });

  it('useAutoFit is a no-op without a layout box (jsdom): it returns the deterministic start', () => {
    const { result } = renderHook(() => useAutoFit(COVER_TIERS.length, 2));
    expect(result.current.idx).toBe(2);
    expect(result.current.ref.current).toBeNull();
  });
});

// ── Torture matrix — every slide kind, rendered in every skin, with worst-case content ───────────
const rep = (s: string, t: number): string => Array.from({ length: t }, () => s).join(' ');
const LONG = 'an intentionally and uncomfortably long string used to stress the layout under test';

let n = 0;
const sec = <K extends Section['kind']>(
  kind: K,
  data: Extract<Section, { kind: K }>['data'],
  source = 0,
  lead = false,
): Section => ({ kind, id: `fit-${n++}`, source, lead, data }) as Section;

const META: ExportMeta = {
  title: rep('A deliberately overlong deck title', 6),
  sub: rep('A long supporting subtitle', 6),
  topic: 'Strategy',
  sources: [{ name: 'City Atlas' }, { name: 'OECD' }, { name: 'Bureau' }, { name: 'Council' }],
  generatedAt: 1_700_000_000_000,
};

const SECTIONS: Section[] = [
  sec('findingCallout', {
    num: '01',
    conf: 'Inferred',
    title: rep('Finding', 8),
    summary: rep(LONG, 6),
  }),
  sec('spotlightCard', { label: rep('Label', 6), title: rep(LONG, 4), body: 'Source, 2026' }),
  sec('metricTiles', {
    heading: rep('Metrics', 4),
    tiles: [
      { value: '$1,284,000,000', label: rep('long metric label', 4) },
      { value: '99.9%', label: rep('another', 5) },
      { value: '40 yr', label: rep('third', 5) },
      { value: '12,500', label: rep('fourth', 5) },
    ],
  }),
  sec('metricTiles', {
    heading: rep('Many metrics', 4),
    tiles: Array.from({ length: 7 }, (_, i) => ({ value: `$${i}00M`, label: rep('label', 4) })),
  }),
  sec('figureGrid', {
    heading: rep('Corridors', 4),
    caption: rep(LONG, 3),
    cells: Array.from({ length: 8 }, (_, i) => ({
      title: rep('Corridor', 5),
      pct: 1 - i * 0.1,
      value: `${i}%`,
    })),
  }),
  sec('rankedList', {
    heading: rep('Stations', 4),
    items: Array.from({ length: 6 }, () => ({ name: rep('Station', 6), meta: '112k / day' })),
  }),
  sec('ratingMatrix', {
    heading: rep('Build vs expand', 3),
    columns: [rep('Build', 4), rep('Expand', 4)],
    rows: Array.from({ length: 7 }, () => ({
      label: rep('criterion', 4),
      values: [rep('a', 3), rep('b', 3)],
    })),
  }),
  sec('specTable', {
    heading: rep('Wide table', 3),
    columns: ['Zone', 'Peak', 'Off', 'Wknd', 'Month', 'Year', 'Conc'],
    rows: Array.from({ length: 7 }, (_, i) => [`Zone ${i}`, '$1', '$2', '$3', '$4', '$5', '$6']),
  }),
  sec('checklist', {
    heading: rep('Readiness', 4),
    items: Array.from({ length: 5 }, (_, i) => ({
      title: rep('Step', 5),
      body: rep(LONG, 2),
      status: (i === 0 ? 'done' : 'todo') as 'done' | 'doing' | 'todo',
    })),
  }),
  sec('verticalTimeline', {
    heading: rep('Rollout', 4),
    events: Array.from({ length: 5 }, () => ({
      marker: 'Quarter',
      title: rep('Phase', 4),
      body: rep(LONG, 2),
    })),
  }),
  sec('prose', { heading: rep('Why frequency wins', 4), body: rep(LONG, 18) }),
  sec('prose', { body: 'A city moves at the speed of its slowest necessary trip.' }),
  sec(
    'prose',
    { heading: rep('Funding the plan', 4), body: rep('How the region pays for it', 4) },
    1,
    true,
  ),
];

function tortureDeck(): Slide[] {
  const base = composeSlides(SECTIONS, META);
  const media: Slide[] = [
    {
      kind: 'teamGrid',
      id: 'fit-team',
      source: 0,
      kicker: 'Team',
      data: {
        title: rep('The study team', 4),
        members: Array.from({ length: 4 }, () => ({
          name: rep('Researcher', 3),
          role: rep('Role', 3),
          bio: rep(LONG, 2),
        })),
      },
    },
    {
      kind: 'fullBleed',
      id: 'fit-full',
      source: 0,
      kicker: 'Field',
      data: { img: '#', title: rep('One question', 4) },
    },
  ];
  return [...base.slice(0, -1), ...media, base[base.length - 1]];
}

describe('every slide kind × every skin renders with the fit machinery wired', () => {
  const deck = tortureDeck();

  it('covers all thirteen slide kinds in the torture deck', () => {
    const kinds = new Set(deck.map((s) => s.kind));
    for (const k of [
      'cover',
      'sectionDivider',
      'agenda',
      'keyFigure',
      'comparison',
      'dataTable',
      'roadmap',
      'process',
      'chart',
      'quote',
      'teamGrid',
      'fullBleed',
      'prose',
      'closing',
    ]) {
      expect(kinds.has(k as Slide['kind']), `missing kind: ${k}`).toBe(true);
    }
  });

  for (const skinId of SLIDE_SKIN_ORDER) {
    it(`renders the full torture deck in ${skinId} with clamps/tiers applied`, () => {
      const skin = SLIDE_SKINS[skinId];
      deck.forEach((slide, i) => {
        const { container, unmount } = render(
          createElement(SlideCanvas, { slide, skin, ctx: { index: i, total: deck.length } }),
        );
        const page = container.querySelector('.slide-page');
        expect(page, `${skinId} ${slide.kind}`).not.toBeNull();
        // Every content slide wires the fit machinery: a sized tier and/or a clamp/ellipsis.
        const html = (page as HTMLElement).outerHTML;
        const wired =
          html.includes('data-fit-tier') ||
          html.includes('line-clamp') ||
          html.includes('ellipsis');
        expect(wired, `${skinId} ${slide.kind} has no fit guard`).toBe(true);
        unmount();
      });
    });
  }

  it('applies the cover title tier deterministically from its length', () => {
    const skin = SLIDE_SKINS.folio;
    const cover = deck.find((s) => s.kind === 'cover')!;
    const titleLen = (cover.data as { title: string }).title.length;
    const { container } = render(
      createElement(SlideCanvas, { slide: cover, skin, ctx: { index: 0, total: deck.length } }),
    );
    const tiered = container.querySelector('[data-fit-tier]') as HTMLElement;
    expect(tiered).not.toBeNull();
    expect(Number(tiered.dataset.fitTier)).toBe(pickTier(titleLen, COVER_TIERS).size);
  });

  // Regression: the cover/closing kicker and the shared Footer's wordmark rely on
  // overflow: hidden + text-overflow: ellipsis inside a flex row, which a flex item's default
  // content-based minimum size quietly defeats — the box never actually shrinks, so a long real
  // topic just overflows instead of truncating. minWidth: 0 is what makes the ellipsis real.
  it('gives the cover kicker and the footer wordmark room to actually shrink (minWidth: 0)', () => {
    const skin = SLIDE_SKINS.folio;
    const cover = deck.find((s) => s.kind === 'cover')!;
    const content = deck.find((s) => s.kind !== 'cover' && s.kind !== 'closing')!;

    const coverRender = render(
      createElement(SlideCanvas, { slide: cover, skin, ctx: { index: 0, total: deck.length } }),
    );
    const kicker = coverRender.container.querySelector(
      '[style*="text-overflow"]',
    ) as HTMLElement | null;
    expect(kicker, 'cover kicker span').not.toBeNull();
    expect(kicker!.style.minWidth).toBe('0px');
    coverRender.unmount();

    const footerRender = render(
      createElement(SlideCanvas, {
        slide: content,
        skin,
        ctx: { index: 1, total: deck.length },
      }),
    );
    const wordmark = footerRender.container.querySelector(
      '[style*="text-overflow"]',
    ) as HTMLElement | null;
    expect(wordmark, 'footer wordmark span').not.toBeNull();
    expect(wordmark!.style.minWidth).toBe('0px');
    footerRender.unmount();
  });
});
