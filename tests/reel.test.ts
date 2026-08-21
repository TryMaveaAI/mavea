// The reel suite: budgets, coercion ceilings, the token-tower guard, fit/scale wiring, finish
// surfaces, keyboard + player controls, reduced motion, SVG label math, and the aspect-stable unit
// system. Each top-level describe below carries the header of the file it came from — the bug it
// locks down — and keeps its own fixtures/helpers scoped, since sibling suites reuse the same names
// (ctx, slideFor, filler, InertResizeObserver) for deliberately different shapes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  CHAR_BUDGET,
  clampToken,
  type ReelScript,
  type ReelSlide,
  type SlotKey,
  type TemplateId,
} from '../src/clip/reel/reelScript';
import { FINISH, assignFinish, coerceSlots } from '../src/clip/reel/templates/registry';
import { SlideView } from '../src/clip/reel/templates/SlideView';
import { FitScale } from '../src/clip/reel/FitScale';
import { ReelUnitsVersion } from '../src/clip/reel/reelUnits';
import {
  estWidth,
  splitTwoLines,
  middleEllipsis,
  fitLabel,
  centeredLabelWidth,
  edgeLabelWidth,
  LABEL_SIZE_LADDER,
  GLYPH_WIDTH_RATIO,
} from '../src/clip/reel/templates/svgLabel';
import { ConstellationSlide } from '../src/clip/reel/templates/finishes/constellation';
import { KnowledgeGraphSlide } from '../src/clip/reel/templates/conceptSlides';
import { GraphPlotSlide } from '../src/clip/reel/templates/finishes/graphPlot';

// A hand-rolled fake AudioContext — same shape/spirit as the sharedAudioContext mock in
// tests/voice-output-mute.test.ts. audioTrack.ts never calls it except from inside makePreviewAudio,
// so mocking it here has no bearing on the ReelPlayer tests below.
type FakeSource = {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};
let fakeNow = 0;
let fakeState: 'running' | 'suspended' = 'running';
const fakeSources: FakeSource[] = [];
const fakeResume = vi.fn(async () => {
  fakeState = 'running';
});

/** Handed back by every leased playback path — a test can assert the context is released. */
const releaseSpy = vi.fn();

// Playback paths LEASE the context (so the idle timer can park it again once the reel stops);
// the offline render only needs the rate. Both are served from the same fake below.
vi.mock('../src/voice/voiceEnergy', () => ({
  sharedSampleRate: () => 48_000,
  leaseAudioContext: () => ({ ctx: fakeCtx(), release: releaseSpy }),
  sharedAudioContext: () => fakeCtx(),
}));

function fakeCtx() {
  return {
    get currentTime() {
      return fakeNow;
    },
    get state() {
      return fakeState;
    },
    resume: fakeResume,
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
    createBufferSource: () => {
      const node: FakeSource = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      fakeSources.push(node);
      return node;
    },
  };
}

import { ReelPlayer } from '../src/clip/reel/ReelPlayer';
import { elapsedOffset, clampResumeOffset, makePreviewAudio } from '../src/clip/reel/audioPlayback';

// Guards the reel's "one call, every slide fits" guarantee. The director prompt tells the model a max
// CHARACTER budget per field (CHAR_BUDGET) — the most that reads well on the tightest finish of each
// type. For that to mean "no truncation, no overflow", content written exactly to budget must survive
// coercion UNTOUCHED: nothing clamped (no ellipsis) and no items dropped. This fails if a budget is
// ever set above its coercion hard-clamp (SLOT_BUDGET / inline), or an array budget above its slice.
describe('reel CHAR_BUDGET fits coercion (one call → every slide fits)', () => {
  const ctx = { topic: 'Topic', question: 'Question?' };
  // Word-shaped, not a solid run: a single n-char token is exactly what the token guard (clampToken,
  // reelScript.ts) now clamps regardless of the field's own budget, so a solid `x.repeat(n)` no longer
  // stands in for "a real answer written to budget" — every WORDS entry is well under the guard's
  // maxRun, so this fills a field to exactly n chars without ever tripping it (same reasoning as the
  // filler() in the fit suite below).
  const WORDS = 'wavelength interference diffraction resonance amplitude spectrum harmonic'.split(
    ' ',
  );
  const x = (n: number): string => {
    let s = '';
    for (let i = 0; s.length < n; i++) s += (s ? ' ' : '') + WORDS[i % WORDS.length];
    return s.slice(0, n);
  };
  const arr = <T>(n: number, make: () => T): T[] => Array.from({ length: n }, make);
  const B = CHAR_BUDGET;

  // One raw slot object per content type, every field filled to EXACTLY its budget.
  const MAXED: Partial<Record<SlotKey, Record<string, unknown>>> = {
    stat: {
      value: x(B.stat.value),
      unit: x(B.stat.unit),
      label: x(B.stat.label),
      prior: x(B.stat.prior),
    },
    metrics: {
      items: arr(B.metrics.items, () => ({ label: x(B.metrics.label), pct: 50 })),
      next: x(B.metrics.next),
    },
    ranked: {
      title: x(B.ranked.title),
      items: arr(B.ranked.items, () => ({
        label: x(B.ranked.label),
        score: x(B.ranked.score),
        pct: 50,
      })),
    },
    quote: { quote: x(B.quote.quote), attribution: x(B.quote.attribution) },
    list: { items: arr(B.list.items, () => x(B.list.item)) },
    concept: { title: x(B.concept.title), subtitle: x(B.concept.subtitle), tag: x(B.concept.tag) },
    conceptmap: {
      center: x(B.conceptmap.center),
      nodes: arr(B.conceptmap.nodes, () => ({ label: x(B.conceptmap.node) })),
    },
    qa: { question: x(B.qa.question), answer: x(B.qa.answer) },
    chat: { messages: arr(B.chat.messages, () => ({ role: 'user', text: x(B.chat.message) })) },
    diagram: {
      label: x(B.diagram.label),
      equation: x(B.diagram.equation),
      note: x(B.diagram.note),
    },
    steps: { stops: arr(B.steps.stops, () => ({ label: x(B.steps.label), state: 'todo' })) },
    recap: {
      topic: x(B.recap.topic),
      metrics: arr(B.recap.metrics, () => ({ label: x(B.recap.label), value: x(B.recap.value) })),
    },
  };

  /** Deep-collect every string in a coerced slot object. */
  function strings(v: unknown, out: string[] = []): string[] {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach((e) => strings(e, out));
    else if (v && typeof v === 'object') Object.values(v).forEach((e) => strings(e, out));
    return out;
  }
  function arrays(v: unknown, out: unknown[][] = []): unknown[][] {
    if (Array.isArray(v)) {
      out.push(v);
      v.forEach((e) => arrays(e, out));
    } else if (v && typeof v === 'object') Object.values(v).forEach((e) => arrays(e, out));
    return out;
  }

  for (const [type, raw] of Object.entries(MAXED)) {
    it(`${type}: content written to budget is never truncated or dropped`, () => {
      const coerced = coerceSlots(type as SlotKey, raw!, ctx);
      // No field was clamped (clampText adds a trailing … only when it actually trims).
      const truncated = strings(coerced).filter((s) => s.includes('…'));
      expect(truncated, `truncated fields: ${JSON.stringify(truncated)}`).toEqual([]);
      // No array (items/nodes/messages/stops/metrics) lost an element to a slice cap.
      for (const a of arrays(raw)) {
        const match = arrays(coerced).find((c) => c.length >= a.length);
        expect(match, `an array of length ${a.length} was sliced shorter`).toBeTruthy();
      }
    });
  }
});

// Guards the reel finish surface/card contract.
//
// A finish tagged `surface:'dark'` makes the player lay a dark wash behind it and flip --reel-ink
// near-white (reel.css). That only reads correctly when the finish OWNS the frame (`bleed`) and draws
// on the dark wash. A NON-bleed finish renders the LIGHT card primitive, so a dark surface would put
// near-white ink on a white card → invisible text (the levelUp/streak regression). The FinishDef
// contract states it directly: "Card-based finishes leave this off." This test fails if any finish
// ever pairs surface:'dark' with a non-bleed (card) layout again.
describe('reel finish surface contract', () => {
  it('no card-based (non-bleed) finish uses a dark surface', () => {
    const offenders = Object.entries(FINISH)
      .filter(([, def]) => def && def.surface === 'dark' && !def.bleed)
      .map(([id]) => id);
    expect(offenders).toEqual([]);
  });
});

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
describe('reel fit (the render guarantee, torture-tested)', () => {
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
    recap: {
      topic: filler(40),
      metrics: many(6, () => ({ label: filler(40), value: filler(20) })),
    },
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

  function assertFitMachinery(
    container: HTMLElement,
    template: string,
    requireTier: boolean,
  ): void {
    const all = Array.from(container.querySelectorAll<HTMLElement>('*'));
    // The one-word-per-line offender: emergency mid-word breaking as a PLAN instead of a last resort.
    const breakers = all.filter((el) => el.style.overflowWrap === 'break-word');
    expect(breakers, `${template}: break-word must not come back`).toEqual([]);

    const tiered = all.filter((el) => el.dataset.fitTier !== undefined);
    if (requireTier) {
      expect(
        tiered.length,
        `${template}: long-text finish renders no fitText tier`,
      ).toBeGreaterThan(0);
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
          {
            timeout: 10_000,
          },
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
});

// FitScale's re-measure trigger, the deterministic replacement for the old settle loop (a bounded
// rAF loop plus two setTimeout catch-ups). jsdom has no real layout, so this can't validate actual
// pixel fitting the way the #/reel gallery's overflow audit does — it validates the WIRING: that
// bumping ReelUnitsVersion (what ReelPlayer does the instant it upgrades --ru/--rw) makes FitScale
// re-run its measurement synchronously, with nothing else — no resize, no children change — needed
// to trigger it.
describe('FitScale re-measures the instant ReelUnitsVersion changes', () => {
  afterEach(cleanup);

  // jsdom lays out nothing, so FitScale's measure() sees all-zero boxes unless a test hand-supplies
  // them — the same reason the keyboard suite stubs ResizeObserver rather than trusting jsdom's.
  function stubBox(el: HTMLElement, w: number, h: number): void {
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: w });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: h });
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: w });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: h });
  }

  class InertResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  let RealResizeObserver: typeof ResizeObserver | undefined;
  beforeEach(() => {
    RealResizeObserver = globalThis.ResizeObserver;
    vi.stubGlobal('ResizeObserver', InertResizeObserver as unknown as typeof ResizeObserver);
  });
  afterEach(() => {
    vi.stubGlobal('ResizeObserver', RealResizeObserver);
  });

  function scaleOf(inner: HTMLElement): number {
    return Number(inner.style.transform.match(/scale\(([\d.]+)\)/)?.[1]);
  }

  function translateXOf(inner: HTMLElement): number {
    return Number(inner.style.transform.match(/translate\(([\d.]+)px/)?.[1]);
  }

  it('shrinks once a version bump reveals content that no longer fits — with no resize or children change', () => {
    // A single stable element reference reused across both renders below, so React sees the exact
    // same `children`: only the context value differs, isolating the version signal as the one
    // thing that can explain a re-fit.
    const content = createElement('div');

    const { container, rerender } = render(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 0 },
        createElement(FitScale, null, content),
      ),
    );

    const wrap = container.firstElementChild as HTMLElement;
    const inner = wrap.firstElementChild as HTMLElement;
    stubBox(wrap, 200, 200);
    stubBox(inner, 100, 100); // fits inside the band as-is

    // Nothing has re-measured against these stubbed boxes yet (no resize, no state change) — the
    // scale is still whatever the pre-stub mount pass computed.
    expect(inner.style.transform).toContain('scale(1)');

    // The player upgrading --ru/--rw is exactly this: content that used to fit now needs more room
    // than the band has. Grow it, then bump the version the way ReelPlayer's applyBoardMetrics does.
    stubBox(inner, 300, 300);
    rerender(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 1 },
        createElement(FitScale, null, content),
      ),
    );

    const scale = scaleOf(inner);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(1);
  });

  it('does not re-fit on a render that leaves the version unchanged', () => {
    const content = createElement('div');
    const { container, rerender } = render(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 5 },
        createElement(FitScale, null, content),
      ),
    );
    const wrap = container.firstElementChild as HTMLElement;
    const inner = wrap.firstElementChild as HTMLElement;
    stubBox(wrap, 200, 200);
    stubBox(inner, 100, 100);

    // Content silently grows past the band, same as above, but the version this time stays put.
    stubBox(inner, 300, 300);
    rerender(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 5 },
        createElement(FitScale, null, content),
      ),
    );

    // No signal fired (same version, same children, ResizeObserver is inert here), so the stale
    // scale from the pre-growth measurement is left standing — proving the version, not React's
    // ordinary re-render, is what drives the re-fit.
    expect(inner.style.transform).toContain('scale(1)');
  });

  it('centers the visible finish instead of invisible descendant overflow', () => {
    const content = createElement('div');
    const { container, rerender } = render(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 0 },
        createElement(FitScale, null, content),
      ),
    );
    const wrap = container.firstElementChild as HTMLElement;
    const inner = wrap.firstElementChild as HTMLElement;
    const root = inner.firstElementChild as HTMLElement;

    stubBox(wrap, 200, 200);
    // The safety extent is 140px because a clipped/decorative descendant reaches farther right,
    // while the visible card itself is 100px wide. The card belongs at x=50, not x=30.
    stubBox(inner, 140, 100);
    Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 100 });
    Object.defineProperty(root, 'offsetLeft', { configurable: true, value: 0 });

    rerender(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 1 },
        createElement(FitScale, null, content),
      ),
    );

    expect(scaleOf(inner)).toBe(1);
    expect(translateXOf(inner)).toBe(50);
  });
});

// Keyboard navigation for the reel preview: ← → step beats (reusing the same content-beat seek the
// progress-bar tap targets already use), ↑ ↓ jump between topic sections, and space pauses — freezing
// the active progress segment's fill animation, not just halting the JS advance. All of it is gated by
// `interactive`, the same flag that already disables the progress bar's tap-to-jump while a clip is
// being recorded — so nothing here can fire mid-export.
describe('ReelPlayer — keyboard navigation', () => {
  // jsdom ships no ResizeObserver (the board-metrics + FitScale effects both use one); an inert stub
  // is enough here since none of these tests depend on real layout measurement.
  class InertResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  let RealResizeObserver: typeof ResizeObserver | undefined;
  beforeEach(() => {
    RealResizeObserver = globalThis.ResizeObserver;
    vi.stubGlobal('ResizeObserver', InertResizeObserver as unknown as typeof ResizeObserver);
  });
  afterEach(() => {
    vi.stubGlobal('ResizeObserver', RealResizeObserver);
  });

  function slide(
    id: string,
    template: ReelSlide['template'],
    content: ReelSlide['content'],
  ): ReelSlide {
    const slots =
      content === 'title'
        ? { question: `Question for ${id}` }
        : content === 'outro'
          ? {}
          : { quote: id };
    return {
      id,
      content,
      template,
      slots,
      caption: id,
      voiceover: id,
      durationMs: 4000,
    } as ReelSlide;
  }

  // Two sections: [title1, a1, a2] and [title2, b1], closed by one outro.
  function sectionedScript(): ReelScript {
    const slides: ReelSlide[] = [
      slide('t1', 'title', 'title'),
      slide('a1', 'spotlightQuote', 'quote'),
      slide('a2', 'spotlightQuote', 'quote'),
      slide('t2', 'title', 'title'),
      slide('b1', 'spotlightQuote', 'quote'),
      slide('outro', 'outro', 'outro'),
    ];
    return {
      topic: 'Topic',
      question: 'Q?',
      palette: 'aurora',
      vibe: 'clean',
      seed: 0,
      slides,
      durationMs: slides.reduce((a, s) => a + s.durationMs, 0),
    };
  }

  it('is focusable and carries a shortcut label only when interactive', () => {
    const script = sectionedScript();
    const { container, rerender } = render(
      createElement(ReelPlayer, { script, loop: true, interactive: true, playing: false }),
    );
    const reel = container.querySelector('.reel')!;
    expect(reel.getAttribute('tabindex')).toBe('0');
    expect(reel.getAttribute('aria-label')).toMatch(/arrows/i);

    rerender(createElement(ReelPlayer, { script, loop: true, interactive: false, playing: false }));
    expect(reel.getAttribute('tabindex')).toBeNull();
    expect(reel.getAttribute('aria-label')).toBeNull();
  });

  it('→ steps forward to the next content beat, skipping straight past a section title', () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        initialIndex: 1, // a1
      }),
    );
    const reel = container.querySelector('.reel')!;
    expect(container.textContent).toContain('a1');
    fireEvent.keyDown(reel, { key: 'ArrowRight' });
    expect(container.textContent).toContain('a2');
    // a2 is the last beat of section 1 — → goes straight to section 2's first beat, not its title.
    fireEvent.keyDown(reel, { key: 'ArrowRight' });
    expect(container.textContent).toContain('b1');
  });

  it('← steps back to the previous beat', () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        initialIndex: 2, // a2
      }),
    );
    const reel = container.querySelector('.reel')!;
    fireEvent.keyDown(reel, { key: 'ArrowLeft' });
    expect(container.textContent).toContain('a1');
  });

  it("↓ jumps to the next section's title; ↑ jumps back", () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        initialIndex: 1, // a1, inside section 1
      }),
    );
    const reel = container.querySelector('.reel')!;
    fireEvent.keyDown(reel, { key: 'ArrowDown' });
    expect(container.textContent).toContain('Question for t2');
    fireEvent.keyDown(reel, { key: 'ArrowUp' });
    expect(container.textContent).toContain('Question for t1');
  });

  it("space pauses and freezes the active progress segment's fill animation", () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: true,
        playing: false,
        initialIndex: 1, // a1 — an active content beat
      }),
    );
    const reel = container.querySelector('.reel')!;
    const bars = Array.from(container.querySelectorAll<HTMLElement>('.reel-seg > i'));
    const active = bars.find((el) => el.style.animation.includes('reel-seg-fill'));
    expect(active).toBeTruthy();
    expect(active!.style.animationPlayState).toBe('running');

    fireEvent.keyDown(reel, { key: ' ' });
    expect(active!.style.animationPlayState).toBe('paused');

    fireEvent.keyDown(reel, { key: ' ' });
    expect(active!.style.animationPlayState).toBe('running');
  });

  it('never engages while non-interactive (e.g. mid-recording) — no focus, no key handling', () => {
    const script = sectionedScript();
    const { container } = render(
      createElement(ReelPlayer, {
        script,
        loop: true,
        interactive: false,
        playing: false,
        initialIndex: 1, // a1
      }),
    );
    const reel = container.querySelector('.reel')!;
    expect(reel.getAttribute('tabindex')).toBeNull();
    fireEvent.keyDown(reel, { key: 'ArrowRight' });
    // No onKeyDown is wired up when non-interactive, so the beat never advances.
    expect(container.textContent).toContain('a1');
    expect(container.textContent).not.toContain('a2');
  });
});

// Play/pause + replay controls for the reel preview:
// - ReelPlayer's controlled `paused` prop (ShareModal drives it; the gallery still doesn't pass one,
//   so uncontrolled behavior — covered by the keyboard suite above — must stay untouched).
// - `togglePause` funnels the space-bar shortcut through the SAME path a future button uses, so the
//   two can never drift out of sync — verified from both the controlled and uncontrolled side.
// - audioTrack's pause/resume offset bookkeeping. A real AudioContext can't run in jsdom, so the
//   elapsed/clamp math is pulled out as pure functions and unit-tested directly; makePreviewAudio's
//   wiring is then exercised against a hand-rolled fake context, the same shape/spirit as the
//   sharedAudioContext mock in tests/voice-output-mute.test.ts.
describe('reel player controls', () => {
  class InertResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  let RealResizeObserver: typeof ResizeObserver | undefined;
  beforeEach(() => {
    RealResizeObserver = globalThis.ResizeObserver;
    vi.stubGlobal('ResizeObserver', InertResizeObserver as unknown as typeof ResizeObserver);
  });
  afterEach(() => {
    vi.stubGlobal('ResizeObserver', RealResizeObserver);
  });

  function oneBeatScript(): ReelScript {
    const slides: ReelSlide[] = [
      {
        id: 'a1',
        content: 'quote',
        template: 'spotlightQuote',
        slots: { quote: 'a1' },
        caption: 'a1',
        voiceover: 'a1',
        durationMs: 4000,
      } as ReelSlide,
    ];
    return {
      topic: 'Topic',
      question: 'Q?',
      palette: 'aurora',
      vibe: 'clean',
      seed: 0,
      slides,
      durationMs: slides.reduce((a, s) => a + s.durationMs, 0),
    };
  }

  /** The active progress segment's fill bar, whose `animationPlayState` is the real freeze mechanism
   *  (the pause badge is purely decorative). */
  function activeFill(container: HTMLElement): HTMLElement {
    const bars = Array.from(container.querySelectorAll<HTMLElement>('.reel-seg > i'));
    const active = bars.find((el) => el.style.animation.includes('reel-seg-fill'));
    if (!active) throw new Error('no active segment found');
    return active;
  }

  describe('ReelPlayer — controlled paused prop', () => {
    it('reflects a controlled paused=true through to the visual freeze, with no internal drift', () => {
      const script = oneBeatScript();
      const { container, rerender } = render(
        createElement(ReelPlayer, {
          script,
          loop: true,
          interactive: true,
          playing: false,
          paused: false,
        }),
      );
      expect(activeFill(container).style.animationPlayState).toBe('running');

      rerender(
        createElement(ReelPlayer, {
          script,
          loop: true,
          interactive: true,
          playing: false,
          paused: true,
        }),
      );
      expect(activeFill(container).style.animationPlayState).toBe('paused');
      expect(container.querySelector('.reel-pause-badge')?.getAttribute('data-show')).toBe('true');

      rerender(
        createElement(ReelPlayer, {
          script,
          loop: true,
          interactive: true,
          playing: false,
          paused: false,
        }),
      );
      expect(activeFill(container).style.animationPlayState).toBe('running');
    });

    it('space bar calls onPausedChange with the flipped value instead of pausing itself', () => {
      const script = oneBeatScript();
      const onPausedChange = vi.fn();
      const { container } = render(
        createElement(ReelPlayer, {
          script,
          loop: true,
          interactive: true,
          playing: false,
          paused: false,
          onPausedChange,
        }),
      );
      const reel = container.querySelector('.reel')!;
      fireEvent.keyDown(reel, { key: ' ' });
      expect(onPausedChange).toHaveBeenCalledTimes(1);
      expect(onPausedChange).toHaveBeenCalledWith(true);
      // Controlled: the parent never fed the new value back (as ShareModal always would via its own
      // state setter), so the visual must NOT flip on its own — that would mean keyboard and the prop
      // could disagree about the reel's pause state.
      expect(activeFill(container).style.animationPlayState).toBe('running');
    });

    it('without a paused prop, space bar still pauses itself and never calls onPausedChange', () => {
      const script = oneBeatScript();
      const onPausedChange = vi.fn();
      const { container } = render(
        createElement(ReelPlayer, {
          script,
          loop: true,
          interactive: true,
          playing: false,
          onPausedChange, // present but inert — paused is undefined, so uncontrolled mode wins
        }),
      );
      const reel = container.querySelector('.reel')!;
      expect(activeFill(container).style.animationPlayState).toBe('running');
      fireEvent.keyDown(reel, { key: ' ' });
      expect(activeFill(container).style.animationPlayState).toBe('paused');
      expect(onPausedChange).not.toHaveBeenCalled();
    });
  });

  describe('ReelPlayer — keyboard focus on mount', () => {
    // The ← → ↑ ↓ / space shortcuts live on the `.reel` node, so they only fire while it (or a child)
    // holds focus. An interactive player must take that focus itself on mount — it remounts (via the
    // caller's React key) on every format switch, Remix, and timing sync, so this is also what keeps
    // the shortcuts alive after those without a stray click. Regression guard for "you have to click
    // the reel to move."
    it('an interactive player focuses its own root on mount', () => {
      const { container } = render(
        createElement(ReelPlayer, { script: oneBeatScript(), loop: true, interactive: true }),
      );
      expect(document.activeElement).toBe(container.querySelector('.reel'));
    });

    it('a non-interactive player (gallery tile) never steals focus', () => {
      // Focus a sentinel first so "didn't move" is a real assertion, not just "body by default".
      const sentinel = document.createElement('button');
      document.body.appendChild(sentinel);
      sentinel.focus();
      render(
        createElement(ReelPlayer, { script: oneBeatScript(), loop: true, interactive: false }),
      );
      expect(document.activeElement).toBe(sentinel);
      sentinel.remove();
    });

    it('each fresh mount re-grabs focus — the remount path a format switch / Remix takes', () => {
      const first = render(
        createElement(ReelPlayer, { script: oneBeatScript(), loop: true, interactive: true }),
      );
      expect(document.activeElement).toBe(first.container.querySelector('.reel'));
      first.unmount();
      // A keyed remount is a brand-new instance; a second mount must focus again.
      const second = render(
        createElement(ReelPlayer, { script: oneBeatScript(), loop: true, interactive: true }),
      );
      expect(document.activeElement).toBe(second.container.querySelector('.reel'));
    });
  });

  describe('audioTrack — elapsedOffset / clampResumeOffset (pure bookkeeping)', () => {
    it('elapsedOffset adds however much context-clock time has passed since the source started', () => {
      expect(elapsedOffset(10, 0, 12.5)).toBeCloseTo(2.5, 5);
      expect(elapsedOffset(10, 3, 12.5)).toBeCloseTo(5.5, 5); // resumed mid-buffer, then more time passed
    });

    it('elapsedOffset never goes backward even if `now` is stale/equal (clock jitter)', () => {
      expect(elapsedOffset(10, 1, 10)).toBe(1);
      expect(elapsedOffset(10, 1, 9)).toBe(1);
    });

    it('clampResumeOffset passes through an offset still inside the buffer', () => {
      expect(clampResumeOffset(2, 5)).toBe(2);
      expect(clampResumeOffset(0, 5)).toBe(0);
    });

    it('clampResumeOffset returns null at/past the end, or for a degenerate duration', () => {
      expect(clampResumeOffset(5, 5)).toBeNull();
      expect(clampResumeOffset(6, 5)).toBeNull();
      expect(clampResumeOffset(0, 0)).toBeNull();
      expect(clampResumeOffset(1, NaN)).toBeNull();
    });
  });

  describe('audioTrack — makePreviewAudio pause/resume', () => {
    afterEach(() => {
      fakeNow = 0;
      fakeState = 'running';
      fakeSources.length = 0;
      fakeResume.mockClear();
    });

    it('pause() stops the live source; resume() starts a fresh one at the elapsed offset', () => {
      const buffer = { duration: 5 } as unknown as AudioBuffer;
      const audio = makePreviewAudio(buffer);
      expect(audio).not.toBeNull();

      audio!.play();
      expect(fakeSources).toHaveLength(1);
      expect(fakeSources[0].start).toHaveBeenCalledWith(0, 0);

      fakeNow = 2; // 2s of narration has played
      audio!.pause();
      expect(fakeSources[0].stop).toHaveBeenCalledTimes(1);

      fakeNow = 2.4; // more time passes while paused — must NOT count toward the resumed offset
      audio!.resume();
      expect(fakeSources).toHaveLength(2);
      expect(fakeSources[1].start).toHaveBeenCalledWith(0, 2);
    });

    it('resume() past the buffer end is a safe no-op — no new source, no throw', () => {
      const buffer = { duration: 3 } as unknown as AudioBuffer;
      const audio = makePreviewAudio(buffer);
      audio!.play();
      fakeNow = 5; // already past the 3s buffer when paused
      audio!.pause();
      expect(() => audio!.resume()).not.toThrow();
      expect(fakeSources).toHaveLength(1); // only the original play() source — resume declined
    });

    it('pausing twice in a row is a no-op the second time (no extra stop calls)', () => {
      const buffer = { duration: 5 } as unknown as AudioBuffer;
      const audio = makePreviewAudio(buffer);
      audio!.play();
      fakeNow = 1;
      audio!.pause();
      audio!.pause();
      expect(fakeSources[0].stop).toHaveBeenCalledTimes(1);
    });

    it('play() always restarts fresh from 0, even mid-pause (replay-from-start semantics)', () => {
      const buffer = { duration: 5 } as unknown as AudioBuffer;
      const audio = makePreviewAudio(buffer);
      audio!.play();
      fakeNow = 2;
      audio!.pause();
      audio!.play();
      expect(fakeSources).toHaveLength(2);
      expect(fakeSources[1].start).toHaveBeenCalledWith(0, 0);
    });
  });
});

// Guards the reel's reduced-motion contract.
//
// The ~40 full-bleed finishes render directly in `.reel-stage > .reel-trans` — NOT inside
// `.reel-card` — so an earlier `prefers-reduced-motion` rule that only tamed `.reel-card *`
// left every bleed finish's marquee/sheen/looping draw moving for users who asked the OS to
// reduce motion. The fix neutralizes animations stage-wide (`.reel-stage *`). This source scan
// fails if that stage-wide neutralizer is ever narrowed back to card-only, which would silently
// re-break the bleed finishes (jsdom has no layout/media engine, so this can't be caught at render).
describe('reel reduced-motion', () => {
  const css = readFileSync(join(__dirname, '../src/clip/reel/reel.css'), 'utf8');

  function reducedMotionBlock(): string {
    const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(start).toBeGreaterThan(-1);
    // Walk braces from the media query's opening brace to find its matching close.
    const open = css.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) return css.slice(open, i + 1);
    }
    throw new Error('unterminated reduced-motion media block');
  }

  it('neutralizes every in-stage animation (covers bleed finishes, not just .reel-card)', () => {
    const block = reducedMotionBlock();
    // The stage-wide selector is what reaches the bleed finishes' internal animations.
    expect(block).toMatch(/\.reel-stage\s+\*/);
    // And it must actually cut the animation down, not merely list the selector.
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });

  it('still stops the ambient brand loops (jelly, glow, dot)', () => {
    const block = reducedMotionBlock();
    expect(block).toMatch(/\.reel-jelly/);
    expect(block).toMatch(/animation:\s*none\s*!important/);
  });
});

// SVG node/center labels have no DOM flow to wrap them and no bounding box FitScale can measure, so
// overflow is invisible until it silently clips against the padded viewBox. svgLabel.ts makes that
// clip unreachable in practice with precomputed char-width math (no getComputedTextLength — untestable
// in jsdom, timing-dependent on font load). This suite checks the math holds for every legal length up
// to each field's real coercion ceiling, then renders the three affected finishes with worst-case
// labels (modeled on the fit suite's OVER fixture + the token-guard suite's render loop).
describe('reel SVG labels', () => {
  afterEach(cleanup);

  const ctx = { topic: 'Topic', question: 'Question?' };

  describe('estWidth', () => {
    it('is character count × size × the measured glyph ratio', () => {
      expect(estWidth('abcd', 10)).toBeCloseTo(4 * 10 * GLYPH_WIDTH_RATIO, 5);
      expect(estWidth('', 12)).toBe(0);
    });
  });

  describe('splitTwoLines', () => {
    it('leaves labels at or under the threshold on one line', () => {
      expect(splitTwoLines('short')).toEqual(['short']);
      expect(splitTwoLines('exactlyten')).toEqual(['exactlyten']); // 10 chars, the threshold itself
    });

    it('splits at the whitespace nearest the midpoint, dropping the space', () => {
      expect(splitTwoLines('quantum mechanics')).toEqual(['quantum', 'mechanics']);
    });

    it('picks whichever of several spaces sits closest to the midpoint', () => {
      const text = 'a bb ccccccccccccc'; // spaces at 1 and 4; midpoint ~9.5 favors neither literally,
      const lines = splitTwoLines(text); // but the break must still land on a real space, not mid-word
      expect(lines.join(' ')).toBe(text);
      expect(text[text.indexOf(lines[0]) + lines[0].length]).toBe(' ');
    });

    it('falls back to a hard midpoint cut when there is no whitespace at all', () => {
      // Rare on purpose: clampToken (reelScript.ts) already caps any unbroken run at ~24 chars before
      // it can reach here — this is the belt-and-suspenders path for that guard's own ceiling.
      const run = 'x'.repeat(20);
      expect(splitTwoLines(run)).toEqual(['x'.repeat(10), 'x'.repeat(10)]);
    });
  });

  describe('middleEllipsis', () => {
    it('leaves text at or under the budget untouched', () => {
      expect(middleEllipsis('short', 10)).toBe('short');
    });

    it('collapses the middle to exactly maxChars, keeping head and tail', () => {
      const out = middleEllipsis('a'.repeat(40), 12);
      expect(out.length).toBe(12);
      expect(out).toContain('…');
      expect(out.startsWith('a')).toBe(true);
      expect(out.endsWith('a')).toBe(true);
    });
  });

  describe('centeredLabelWidth / edgeLabelWidth', () => {
    it('centered width is the doubled shorter clearance to either edge, less the margin', () => {
      expect(centeredLabelWidth(150, -46, 346)).toBe(2 * 196 - 12);
      expect(centeredLabelWidth(34, -46, 346)).toBe(2 * 80 - 12);
    });

    it('edge width is one-sided, toward whichever edge the anchor grows into', () => {
      expect(edgeLabelWidth(170, 0, 200, 'end')).toBe(170 - 6);
      expect(edgeLabelWidth(36, 0, 200, 'start')).toBe(200 - 36 - 6);
    });
  });

  describe('fitLabel keeps every legal label inside the shape it actually renders into', () => {
    // The real geometry each finish computes for its tightest label position — constellation.tsx's
    // amplitude-116 ring, conceptSlides.tsx's radius-108 ring (both share its -46..346 viewBox), and
    // graphPlot.tsx's 0..200 viewBox. cx - amplitude / cx - radius is the true worst-case x any node can
    // ever land on, not a guess: it's the geometric extreme the file's own cos() math is bounded by.
    const SHAPES: { name: string; ceiling: number; availableWidth: number }[] = [
      {
        name: 'constellation node (leftmost star, cx=150 - 116)',
        ceiling: CHAR_BUDGET.conceptmap.node,
        availableWidth: centeredLabelWidth(34, -46, 346),
      },
      {
        name: 'center label (constellation + knowledge-graph share this viewBox)',
        ceiling: CHAR_BUDGET.conceptmap.center,
        availableWidth: centeredLabelWidth(150, -46, 346),
      },
      {
        name: 'knowledge-graph node (leftmost, cx=150 - 108)',
        ceiling: CHAR_BUDGET.conceptmap.node,
        availableWidth: centeredLabelWidth(42, -46, 346),
      },
      {
        name: "graph-plot vector, anchor 'end' at x=170",
        // registry.tsx's diagram coercer clamps vector labels to 8 chars inline (S(..., 8, 'v')) — no
        // named CHAR_BUDGET entry, since diagram.label is a different field (the kicker, budget 24).
        ceiling: 8,
        availableWidth: edgeLabelWidth(170, 0, 200, 'end'),
      },
      {
        name: "graph-plot vector, anchor 'start' at x=36",
        ceiling: 8,
        availableWidth: edgeLabelWidth(36, 0, 200, 'start'),
      },
    ];

    const SOURCE = 'wavelength interference diffraction resonance amplitude spectrum';

    for (const shape of SHAPES) {
      it(`${shape.name}: every length 1..${shape.ceiling} paints inside ${shape.availableWidth.toFixed(0)}`, () => {
        for (let len = 1; len <= shape.ceiling; len += 1) {
          const text = SOURCE.slice(0, len);
          const { lines, size } = fitLabel(text, shape.availableWidth);
          for (const line of lines) {
            expect(
              estWidth(line, size),
              `${shape.name} len ${len}: "${line}" at ${size}px overflows ${shape.availableWidth}`,
            ).toBeLessThanOrEqual(shape.availableWidth);
          }
        }
      });
    }
  });

  describe('fitLabel degrades gracefully under real pressure', () => {
    it('stays at the top ladder size when there is plenty of room', () => {
      const { size } = fitLabel('wavelength interference', 400);
      expect(size).toBe(LABEL_SIZE_LADDER[0]);
    });

    it('steps down the ladder as available width tightens', () => {
      const { size, lines } = fitLabel('wavelength interference', 75);
      expect(size).toBe(LABEL_SIZE_LADDER[1]); // too tight for the top size, roomy enough for the next
      for (const line of lines) expect(estWidth(line, size)).toBeLessThanOrEqual(75);
    });

    it('falls back to middleEllipsis when even the floor ladder size cannot fit', () => {
      const { size, lines } = fitLabel('wavelengthinterference', 20);
      expect(size).toBe(LABEL_SIZE_LADDER[LABEL_SIZE_LADDER.length - 1]);
      expect(lines.some((l) => l.includes('…'))).toBe(true);
      for (const line of lines) expect(estWidth(line, size)).toBeLessThanOrEqual(20);
    });
  });

  describe('the three affected finishes render worst-case labels without throwing', () => {
    // Past every real ceiling (conceptmap.node=18, conceptmap.center=16), the shape coerceSlots actually
    // hands a finish once clampText/clampToken have run — the LONGEST_RAW pattern from the fit suite.
    const conceptmapRaw = {
      center: 'wavelength interference diffraction resonance',
      nodes: Array.from({ length: 5 }, (_, i) => ({
        label: `node ${i} wavelength interference diffraction resonance`,
      })),
    };
    const diagramRaw = {
      label: 'Diagram',
      vectors: [{ label: 'wavelength interference' }, { label: 'x' }],
    };

    it('ConstellationSlide', () => {
      const slots = coerceSlots('conceptmap', conceptmapRaw, ctx);
      expect(() => render(createElement(ConstellationSlide, { slots }))).not.toThrow();
    });

    it('KnowledgeGraphSlide', () => {
      const slots = coerceSlots('conceptmap', conceptmapRaw, ctx);
      expect(() => render(createElement(KnowledgeGraphSlide, { slots }))).not.toThrow();
    });

    it('GraphPlotSlide', () => {
      const slots = coerceSlots('diagram', diagramRaw, ctx);
      expect(() => render(createElement(GraphPlotSlide, { slots }))).not.toThrow();
    });
  });
});

// The token-tower guard: a single unbroken run (a URL, a hash, a hyphen-less compound) must never
// survive coercion longer than clampToken's maxRun, however generous its slot's overall character
// budget is — that's the one shape per-slot budgeting (SLOT_BUDGET/CHAR_BUDGET) can't stop, since a
// spaceless run can sit well under budget and still be far too long to seat on one line at the
// tightest fitText tier. Modeled on the fit suite's OVER/torture pattern and finish-render loop.
describe('reel token-tower guard', () => {
  afterEach(cleanup);

  const ctx = { topic: 'Topic', question: 'Question?' };
  const MAX_RUN = 24;

  // A fake URL, exactly 60 chars, with zero internal whitespace — the shape a model can paste verbatim
  // from a citation or a source link.
  const RUN = `https://example.com/${'x'.repeat(60)}`.slice(0, 60);

  // Raw director output where every free-text slot carries the unbroken run. Non-text fields are filled
  // with the minimum valid shape so coercion doesn't fall back to a placeholder instead.
  const TOKEN_RAW: Record<SlotKey, Record<string, unknown>> = {
    title: { question: RUN, kicker: RUN },
    outro: { wordmark: RUN, tagline: RUN, statline: RUN },
    stat: { value: RUN, unit: RUN, label: RUN, prior: RUN, spark: [1, 2] },
    metrics: { items: [{ label: RUN, pct: 50 }], next: RUN },
    ranked: { title: RUN, items: [{ label: RUN, score: RUN, pct: 50 }] },
    quote: { quote: RUN, highlight: RUN, attribution: RUN },
    list: { title: RUN, items: [RUN, RUN] },
    concept: { title: RUN, subtitle: RUN, tag: RUN },
    conceptmap: { center: RUN, nodes: [{ label: RUN, kind: RUN }] },
    qa: { question: RUN, answer: RUN },
    chat: { messages: [{ role: 'mavea', text: RUN }] },
    diagram: { label: RUN, equation: RUN, vectors: [{ label: RUN }], note: RUN },
    steps: { stops: [{ label: RUN, state: 'todo' }] },
    recap: { topic: RUN, metrics: [{ label: RUN, value: RUN }] },
    markup: {
      pageImage: 'data:image/png;base64,',
      imgW: 800,
      imgH: 1000,
      rects: [{ x: 10, y: 10, w: 100, h: 20 }],
      isFigure: false,
      seed: 'token-guard',
      color: '#dd4444',
      title: RUN,
      explanation: RUN,
    },
  };

  function slideFor(template: TemplateId, content: SlotKey): ReelSlide {
    return {
      id: `token-${template}`,
      content,
      template,
      slots: coerceSlots(content, TOKEN_RAW[content], ctx),
      voiceover: '',
      durationMs: 3000,
    } as ReelSlide;
  }

  describe('clampToken', () => {
    it('leaves ordinary words untouched', () => {
      expect(clampToken('a normal sentence with short words')).toBe(
        'a normal sentence with short words',
      );
    });

    it('collapses a run past maxRun to exactly maxRun chars, ellipsis in the middle', () => {
      const out = clampToken('a'.repeat(60), MAX_RUN);
      expect(out.length).toBe(MAX_RUN);
      expect(out).toContain('…');
      expect(out.startsWith('a')).toBe(true);
      expect(out.endsWith('a')).toBe(true);
    });

    it('only clamps the offending run, leaving short neighbors alone', () => {
      const out = clampToken(`see ${'b'.repeat(60)} now`, MAX_RUN);
      const [first, mid, last] = out.split(' ');
      expect(first).toBe('see');
      expect(last).toBe('now');
      expect(mid.length).toBe(MAX_RUN);
    });
  });

  describe('coercion never lets an unbroken run past maxRun (the tower guard)', () => {
    it('caps the run in every content type slot, however generous its own budget', () => {
      for (const type of Object.keys(TOKEN_RAW) as SlotKey[]) {
        const coerced = coerceSlots(type, TOKEN_RAW[type], ctx);
        const walk = (v: unknown): void => {
          if (typeof v === 'string' && !v.startsWith('data:')) {
            for (const tok of v.split(/\s+/).filter(Boolean))
              expect(tok.length, `${type}: token "${tok}" exceeds maxRun`).toBeLessThanOrEqual(
                MAX_RUN,
              );
          } else if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object') Object.values(v).forEach(walk);
        };
        walk(coerced);
      }
    });
  });

  describe('every finish renders the unbroken-run worst case without crashing', () => {
    for (const [template, def] of Object.entries(FINISH)) {
      if (!def) continue;
      it(`${template} (${def.content})`, () => {
        expect(() =>
          render(
            createElement(SlideView, { slide: slideFor(template as TemplateId, def.content) }),
          ),
        ).not.toThrow();
      });
    }
  });
});

// Guards the reel's aspect-stable unit system — the thing that makes every finish fit in all three
// share formats (Story 9:16, Square 1:1, Landscape 16:9).
//
// Finishes MUST size in the design units `var(--ru)` / `var(--rw)` (px values the player sets from the
// board's smaller edge), NOT in raw container units `cqh` / `cqw`. Raw `cqh` keys off board HEIGHT, so
// on a short landscape board type collapses to illegible and content runs off-frame — the exact bug
// this system fixed. If a new finish (or an edit) reintroduces a raw container unit, this fails.
describe('reel aspect-stable units', () => {
  const reelDir = join(__dirname, '../src/clip/reel');

  function files(dir: string, ext: string[]): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return files(p, ext);
      return ext.some((x) => e.name.endsWith(x)) ? [p] : [];
    });
  }

  // A raw container unit is a number directly followed by cqh/cqw/cqi/cqb/cqmin/cqmax. We allow them only
  // inside reel.css's fallback declarations (`--ru: 1cqh; --rw: 1cqw;`).
  const RAW_CQ = /\d(?:\.\d+)?cq(?:h|w|i|b|min|max)\b/g;

  /** Strip block and line comments so we don't flag prose (e.g. this file's own notes) as offenders. */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  const finishFiles = [
    ...files(join(reelDir, 'templates'), ['.tsx', '.ts']),
    join(reelDir, 'reel.css'),
  ];

  it('no finish or shared CSS uses a raw container unit (must use var(--ru)/var(--rw))', () => {
    const offenders: string[] = [];
    for (const f of finishFiles) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const line of src.split('\n')) {
        if (!RAW_CQ.test(line)) continue;
        RAW_CQ.lastIndex = 0;
        // The two intentional fallbacks declare the custom properties themselves.
        if (/--ru:\s*1cqh/.test(line) || /--rw:\s*1cqw/.test(line)) continue;
        offenders.push(`${f.replace(reelDir + '/', '')}: ${line.trim().slice(0, 80)}`);
      }
    }
    expect(offenders, `raw container units found:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('scrolling-marquee finishes carry data-reel-marquee so FitScale excludes their scroll track', () => {
    // A continuous scroll track = `width: max-content` + a `linear infinite` animation. It must be
    // marked, or FitScale would shrink the whole finish to fit the (deliberately huge) track.
    const need: string[] = [];
    for (const f of files(join(reelDir, 'templates/finishes'), ['.tsx'])) {
      const src = readFileSync(f, 'utf8');
      const scrolls = /max-content/.test(src) && /linear infinite/.test(src);
      if (scrolls && !/data-reel-marquee/.test(src)) need.push(f.replace(reelDir + '/', ''));
    }
    expect(need, `scroll tracks missing data-reel-marquee:\n${need.join('\n')}`).toEqual([]);
  });
});
