// The reel's render guarantee, torture-tested (modeled on slides-fit.test.ts).
//
// Budgets alone don't make long text render well — the finish has to reflow it. Every finish now
// pairs its display text with a fitText tier (templates/fitText.ts): length picks a {size, line,
// maxLines} step, so a long title re-sets smaller across more lines instead of towering one word
// per line, and the paired line-clamp ellipsizes only past the enforced ceiling. This suite pushes
// RAW director output PAST every coercion ceiling, checks the clamp actually enforces the maximum,
// and renders EVERY registered finish (plus the quote→concept bridge worst case) with that maxed
// content, asserting the fit machinery is wired: a tier stamp on long-text finishes, tier styles
// that carry a clamp or a deliberate single-line, and no `overflow-wrap: break-word` anywhere (the
// old one-word-per-line offender). jsdom has no layout, so the visual half lives in the #/reel
// gallery's "longest text" sample — this locks the structural contract that makes it hold.
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { FINISH, assignFinish, coerceSlots } from '../src/clip/reel/templates/registry';
import { SlideView } from '../src/clip/reel/templates/SlideView';
import type { ReelSlide, SlotKey, TemplateId } from '../src/clip/reel/reelScript';

afterEach(cleanup);

const ctx = { topic: 'Topic', question: 'Question?' };

// Word-shaped filler (spaces matter: solid x-runs would exercise emergency word-breaking, not the
// normal wrap path a real long answer takes).
const WORDS =
  'wavelength interference diffraction resonance amplitude spectrum harmonic oscillation'.split(
    ' ',
  );
function filler(n: number): string {
  let s = '';
  for (let i = 0; s.length < n; i++) s += (s ? ' ' : '') + WORDS[i % WORDS.length];
  return s.slice(0, n).trim();
}
const many = <T>(n: number, make: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => make(i));

// Raw director output pushed PAST every ceiling. Coercion must clamp each field to its enforced
// maximum; the render below is therefore the worst content a finish can legally receive.
const OVER: Record<SlotKey, Record<string, unknown>> = {
  title: { question: filler(200), kicker: filler(60) },
  outro: { tagline: filler(80), statline: filler(60) },
  stat: {
    value: '1234567890123456',
    unit: 'unitsxxx',
    label: filler(48),
    prior: filler(96),
    spark: [1, 2, 3, 4, 5],
  },
  metrics: { items: many(6, () => ({ label: filler(40), pct: 64 })), next: filler(120) },
  ranked: {
    title: filler(40),
    items: many(7, () => ({ label: filler(40), score: filler(20), pct: 50 })),
  },
  quote: { quote: filler(200), attribution: filler(60) },
  list: { title: filler(40), items: many(6, () => filler(96)) },
  concept: { title: filler(200), subtitle: filler(160), tag: filler(40) },
  conceptmap: { center: filler(30), nodes: many(7, () => ({ label: filler(30) })) },
  qa: { question: filler(130), answer: filler(200) },
  chat: {
    messages: many(6, (i) => ({ role: i % 2 ? 'user' : 'mavea', text: filler(150) })),
  },
  diagram: {
    label: filler(40),
    equation: filler(60),
    vectors: [{ label: 'vvvvvvvvvv' }, { label: 'w' }],
    note: filler(120),
  },
  steps: { stops: many(7, () => ({ label: filler(40), state: 'todo' })) },
  recap: { topic: filler(40), metrics: many(6, () => ({ label: filler(40), value: filler(20) })) },
  markup: {
    pageImage: 'data:image/png;base64,',
    imgW: 800,
    imgH: 1000,
    rects: [{ x: 10, y: 10, w: 100, h: 20 }],
    isFigure: false,
    seed: 'torture',
    color: '#dd4444',
    title: filler(120),
    explanation: filler(300),
  },
};

// Content types whose slots carry long free text: every finish wearing one MUST stamp at least one
// fitText tier. The remaining types (stats, maps, steps…) hold short budgeted labels where a tier
// is optional — they still get the render + break-word assertions.
const LONG_TEXT_TYPES = new Set<SlotKey>([
  'title',
  'quote',
  'concept',
  'qa',
  'chat',
  'list',
  'markup',
]);

function slideFor(template: TemplateId, content: SlotKey): ReelSlide {
  return {
    id: `torture-${template}`,
    content,
    template,
    slots: coerceSlots(content, OVER[content], ctx),
    voiceover: '',
    durationMs: 3000,
  } as ReelSlide;
}

function assertFitMachinery(container: HTMLElement, template: string, requireTier: boolean): void {
  const all = Array.from(container.querySelectorAll<HTMLElement>('*'));
  // The one-word-per-line offender: emergency mid-word breaking as a PLAN instead of a last resort.
  const breakers = all.filter((el) => el.style.overflowWrap === 'break-word');
  expect(breakers, `${template}: break-word must not come back`).toEqual([]);

  const tiered = all.filter((el) => el.dataset.fitTier !== undefined);
  if (requireTier) {
    expect(tiered.length, `${template}: long-text finish renders no fitText tier`).toBeGreaterThan(
      0,
    );
  }
  for (const el of tiered) {
    // A tier always carries its ru-based size and either a line clamp or a deliberate single line.
    expect(el.style.fontSize, `${template}: tier without ru font-size`).toContain('var(--ru)');
    const clamped = el.style.webkitLineClamp !== '' || el.style.whiteSpace === 'nowrap';
    expect(clamped, `${template}: tier without clamp or nowrap`).toBe(true);
  }
}

describe('coercion enforces the ceilings (the max-characters guarantee)', () => {
  it('clamps over-long director output to each slot ceiling', () => {
    const concept = coerceSlots('concept', OVER.concept, ctx);
    expect(concept.title.length).toBeLessThanOrEqual(141); // ceiling + the ellipsis char
    expect((concept.subtitle ?? '').length).toBeLessThanOrEqual(121);
    const qa = coerceSlots('qa', OVER.qa, ctx);
    expect(qa.answer.length).toBeLessThanOrEqual(151);
    const markup = coerceSlots('markup', OVER.markup, ctx);
    expect(markup.explanation.length).toBeLessThanOrEqual(241);
    // Nothing anywhere may sail past the loosest ceiling in the model (markup explanations, 240).
    for (const [type, raw] of Object.entries(OVER)) {
      const coerced = coerceSlots(type as SlotKey, raw, ctx);
      const walk = (v: unknown): void => {
        if (typeof v === 'string' && !v.startsWith('data:'))
          expect(v.length, `${type}: unclamped string`).toBeLessThanOrEqual(241);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(coerced);
    }
  });
});

describe('every finish renders its ceiling-length content with the fit machinery wired', () => {
  for (const [template, def] of Object.entries(FINISH)) {
    if (!def) continue;
    it(`${template} (${def.content})`, async () => {
      const { container } = render(
        createElement(SlideView, { slide: slideFor(template as TemplateId, def.content) }),
      );
      await waitFor(
        () => assertFitMachinery(container, template, LONG_TEXT_TYPES.has(def.content)),
        { timeout: 10_000 },
      );
    });
  }
});

describe('assignFinish keeps narrow finishes away from long headlines (heroCap)', () => {
  const capped = Object.entries(FINISH)
    .filter(([, d]) => d && (d as { heroCap?: number }).heroCap)
    .map(([id]) => id);

  it('the narrow frames are registered with caps', () => {
    expect(capped.length).toBeGreaterThan(0);
  });

  it('a ceiling-length concept title never draws a capped finish', () => {
    for (let seed = 1; seed <= 80; seed++)
      for (let i = 0; i < 6; i++)
        expect(capped).not.toContain(assignFinish('concept', seed, i, 140));
  });

  it('short titles still reach the capped finishes (they stay remixable)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++)
      for (let i = 0; i < 6; i++) seen.add(assignFinish('concept', seed, i, 40));
    for (const id of capped) expect([...seen]).toContain(id);
  });
});

describe('the quote→concept bridge worst case (a 140-char quote worn as a headline)', () => {
  // Bridge finishes re-coerce a full-length quote into concept slots at render time — the exact
  // path that used to pour 140 chars into layouts drawn for a two-word term.
  const BRIDGED: TemplateId[] = [
    'spotlightStage',
    'magazine',
    'sunsetTape',
    'lockScreen',
    'auroraGlass',
    'whiteboard',
    'chalkboard',
    'markerDoodle',
  ];
  for (const template of BRIDGED) {
    it(`${template} wearing a maxed quote`, async () => {
      const { container } = render(
        createElement(SlideView, { slide: slideFor(template, 'quote') }),
      );
      await waitFor(() => assertFitMachinery(container, template, true), { timeout: 10_000 });
    });
  }
});
