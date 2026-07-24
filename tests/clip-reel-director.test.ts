// The reel director's deterministic fallback (no model) and the registry's slot coercion. These guard
// the two promises that matter most: the reel is always real (text comes from the conversation, never
// invented) and always fits (every slot is clamped to its budget, so a finish can't overflow).
import { describe, expect, it } from 'vitest';
import type { TurnFrame } from '../src/live/history';
import type { ConversationSpec } from '../src/data/conversation';
import { buildReelFallback, reseedFinishes } from '../src/clip/reel/director';
import {
  assignFinish,
  coerceSlots,
  FINISHES_BY_CONTENT,
} from '../src/clip/reel/templates/registry';
import { SlideView } from '../src/clip/reel/templates/SlideView';
import { SLOT_BUDGET, type ReelSlide } from '../src/clip/reel/reelScript';

// Defaults to 'augment' — a continuation of the SAME topic — since the very first frame always opens
// its own section regardless of its own mode, and every other test here describes one coherent
// conversation, not a topic-shift. Pass 'replace' explicitly to build a genuinely multi-topic fixture.
function frame(
  question: string,
  narration: string,
  notes: string[],
  mode: TurnFrame['mode'] = 'augment',
): TurnFrame {
  const spec = {
    title: question,
    blocks: notes.map((note, i) => ({ type: 'insight', col: 12, id: `b${i}`, note, props: {} })),
  } as unknown as ConversationSpec;
  return { question, narration, mode, tour: [], spec, at: 0 } as unknown as TurnFrame;
}

describe('reel director — deterministic fallback', () => {
  const frames = [
    frame(
      'What are eigenvalues?',
      'Eigenvalues measure how much a transformation stretches a vector. They are the core of linear algebra.',
      [
        'Vectors keep their direction.',
        'The scale factor is the eigenvalue.',
        'Used in PCA and SVD.',
      ],
    ),
  ];

  it('bookends the reel with an intro question and an outro', () => {
    const reel = buildReelFallback(frames);
    expect(reel.slides[0].template).toBe('title');
    expect(reel.slides[reel.slides.length - 1].template).toBe('outro');
    expect(reel.slides.length).toBeGreaterThanOrEqual(3);
    expect(reel.durationMs).toBeGreaterThan(0);
    expect(reel.palette).toBe('aurora');
  });

  it('uses only real conversation text — the quote is drawn from the narration', () => {
    const reel = buildReelFallback(frames);
    const quote = reel.slides.find((s) => s.content === 'quote');
    expect(quote).toBeTruthy();
    const text = (quote!.slots as { quote: string }).quote;
    expect(frames[0].narration).toContain(text.replace(/…$/, ''));
  });

  it('turns the card captions into takeaways', () => {
    const reel = buildReelFallback(frames);
    const takeaways = reel.slides.find((s) => s.content === 'list');
    expect(takeaways).toBeTruthy();
    const items = (takeaways!.slots as { items: string[] }).items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0]).toContain('Vectors keep their direction');
  });

  it('keeps normal text on the card and uses the saved pronunciation twin for narration', () => {
    const native = frame('What is Omakase?', 'Omakase leaves the menu to the chef.', []);
    native.spoken = 'oh-mah-kah-seh leaves the menu to the chef.';
    const reel = buildReelFallback([native]);
    const quote = reel.slides.find((slide) => slide.content === 'quote');
    expect((quote?.slots as { quote?: string }).quote).toContain('Omakase');
    expect(quote?.voiceover).toContain('oh-mah-kah-seh');
  });

  it('never produces an empty reel, even with no usable content', () => {
    const reel = buildReelFallback([frame('A bare question?', '', [])]);
    expect(reel.slides.length).toBeGreaterThanOrEqual(3);
    expect(reel.slides.some((s) => s.content === 'quote')).toBe(true);
  });

  it('respects a slide budget ceiling', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      frame(`Q${i}`, `Answer number ${i} here.`, []),
    );
    const reel = buildReelFallback(many, { maxSlides: 5 });
    expect(reel.slides.length).toBeLessThanOrEqual(5);
  });
});

describe("reel director — derived heading (the title slide's kicker)", () => {
  it("uses the conversation's own (short) title as the heading, not the generic placeholder", () => {
    const withTitle: TurnFrame = {
      question: 'What are eigenvalues and eigenvectors, and why do they matter for PCA?',
      narration: 'Eigenvalues are the core of linear algebra.',
      mode: 'replace',
      tour: [],
      at: 0,
      spec: { title: 'Eigenvalues', blocks: [] } as unknown as ConversationSpec,
    } as unknown as TurnFrame;
    const reel = buildReelFallback([withTitle]);
    const title = reel.slides[0].slots as { kicker?: string; question: string };
    expect(title.kicker).toBe('Eigenvalues');
    expect(title.kicker).not.toBe('Prompt');
    // The literal question still shows verbatim, quoted, beneath the heading.
    expect(title.question).toBe(withTitle.question);
  });

  it('falls back to the first clause of the question when the conversation gave no title', () => {
    const noTitle: TurnFrame = {
      question: 'How does gradient descent work, and why does the learning rate matter?',
      narration: '',
      mode: 'replace',
      tour: [],
      at: 0,
      spec: { title: '', blocks: [] } as unknown as ConversationSpec,
    } as unknown as TurnFrame;
    const reel = buildReelFallback([noTitle]);
    const title = reel.slides[0].slots as { kicker?: string };
    expect(title.kicker).toBeTruthy();
    expect(title.kicker!.length).toBeLessThanOrEqual(SLOT_BUDGET.heading);
    // A leading question word is scaffolding once promoted to a headline — it's stripped.
    expect(title.kicker!.toLowerCase()).not.toMatch(/^how does\b/);
  });

  it('degrades gracefully to the generic placeholder when there is truly nothing to derive from', () => {
    const bare: TurnFrame = {
      question: '',
      narration: '',
      mode: 'replace',
      tour: [],
      at: 0,
      spec: { title: '', blocks: [] } as unknown as ConversationSpec,
    } as unknown as TurnFrame;
    const reel = buildReelFallback([bare]);
    const title = reel.slides[0].slots as { kicker?: string };
    expect(title.kicker).toBeUndefined();
  });
});

describe('reel director — topic sectioning', () => {
  it('a single-topic conversation stays exactly as it was: one title, no part chip', () => {
    const frames = [
      frame('What are eigenvalues?', 'Eigenvalues scale a vector without turning it.', [
        'Vectors keep their direction.',
        'Used in PCA and SVD.',
      ]),
      frame('Why do they matter for PCA?', 'They reveal the axes a transform stretches.', []),
      frame('Can you go deeper on SVD?', 'SVD factors any matrix into rotate-scale-rotate.', []),
    ];
    const reel = buildReelFallback(frames);
    const titles = reel.slides.filter((s) => s.template === 'title');
    expect(titles).toHaveLength(1);
    expect((titles[0].slots as { part?: unknown }).part).toBeUndefined();
    expect(reel.slides[0].template).toBe('title');
    expect(reel.slides[reel.slides.length - 1].template).toBe('outro');
  });

  it('a genuinely multi-topic conversation (a real subject change) sections into its own titles', () => {
    const frames = [
      frame(
        'What are eigenvalues?',
        'Eigenvalues scale a vector without turning it.',
        ['Vectors keep their direction.', 'Used in PCA and SVD.'],
        'replace',
      ),
      frame(
        'How do I make a good espresso?',
        'Grind fine, tamp evenly, pull an 25-to-30-second shot.',
        ['Water temperature matters as much as grind size.'],
        'replace',
      ),
    ];
    const reel = buildReelFallback(frames);
    const titles = reel.slides.filter((s) => s.template === 'title');
    expect(titles).toHaveLength(2);
    for (const [i, t] of titles.entries()) {
      const part = (t.slots as { part?: { index: number; count: number } }).part;
      expect(part).toEqual({ index: i + 1, count: 2 });
    }
    // Each section's title quotes THAT section's own question, not the other one's.
    expect((titles[0].slots as { question: string }).question).toContain('eigenvalues');
    expect((titles[1].slots as { question: string }).question).toContain('espresso');
    // Still exactly one outro, at the very end.
    expect(reel.slides.filter((s) => s.template === 'outro')).toHaveLength(1);
    expect(reel.slides[reel.slides.length - 1].template).toBe('outro');
  });
});

describe('reel director — what survives the slide budget', () => {
  it('gives every turn a beat before giving any turn a second one', () => {
    // Two turns, room for two beats. The cut used to fill in beat order — the first turn's quote, then
    // the first turn's takeaways — and say nothing whatsoever about the second turn.
    const frames = [
      frame('What are eigenvalues?', 'Eigenvalues scale a vector without turning it.', [
        'Vectors keep their direction.',
        'The scale factor is the eigenvalue.',
      ]),
      frame('Why do they matter for PCA?', 'They reveal the axes a transform stretches.', []),
    ];
    const reel = buildReelFallback(frames, { maxSlides: 4 });
    const quotes = reel.slides
      .filter((s) => s.content === 'quote')
      .map((s) => (s.slots as { quote: string }).quote);
    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toContain('Eigenvalues scale a vector');
    expect(quotes[1]).toContain('axes a transform stretches');
    expect(reel.slides).toHaveLength(4); // title + both turns + outro
  });

  it('keeps a many-topic session inside the reel ceiling, covering the freshest topics', () => {
    // Eight genuinely DISTINCT subjects — real pivots use different vocabulary, and the section
    // boundary now reads meaning-bearing words ("Topic 0…Topic 7" fixtures share their only
    // content token, which honestly reads as one subject).
    const TOPICS: [string, string][] = [
      ['Eigenvalues', 'They scale the axes a transformation stretches.'],
      ['Espresso', 'Grind finer until the shot runs thirty seconds.'],
      ['Kyoto', 'Temples cluster along the eastern Higashiyama hills.'],
      ['Marathons', 'Negative splits beat even pacing for most runners.'],
      ['Sourdough', 'A lively starter doubles within six hours of feeding.'],
      ['Chess', 'Control the center before developing the flank pieces.'],
      ['Auroras', 'Solar wind electrons excite oxygen into green light.'],
      ['Tidepools', 'Barnacles zone themselves by tolerance for drying out.'],
    ];
    const frames = TOPICS.map(([t, a]) => frame(`${t} question?`, a, [], 'replace'));
    const reel = buildReelFallback(frames);
    // Eight topics used to recut into a 25-slide, multi-minute "reel"; the ceiling is the ceiling.
    expect(reel.slides.length).toBeLessThanOrEqual(6);
    const titles = reel.slides.filter((s) => s.template === 'title');
    expect(titles.length).toBeGreaterThanOrEqual(1);
    // The topics it carries are the ones the user just explored — and the part chips count only those.
    const questions = titles.map((t) => (t.slots as { question: string }).question);
    expect(questions[questions.length - 1]).toContain('Tidepools');
    for (const t of titles) {
      const part = (t.slots as { part?: { count: number } }).part;
      if (part) expect(part.count).toBe(titles.length);
    }
    // And the reel is ABOUT what's in it — its question comes from a covered turn, not a dropped one.
    expect(reel.question).not.toContain('Eigenvalues');
  });
});

describe('registry — slot coercion clamps everything to fit', () => {
  const ctx = { topic: 'Topic', question: 'Q?' };

  it('caps takeaways count and trims each to the budget', () => {
    const long = 'x'.repeat(200);
    const slots = coerceSlots('list', { items: [long, long, long, long, long, long] }, ctx);
    expect(slots.items.length).toBeLessThanOrEqual(4);
    for (const it of slots.items) expect(it.length).toBeLessThanOrEqual(SLOT_BUDGET.takeaway + 1);
  });

  it('clamps percentages into 0–100 and caps the ring count', () => {
    const slots = coerceSlots(
      'metrics',
      {
        items: [
          { label: 'A', pct: 150 },
          { label: 'B', pct: -20 },
          { label: 'C', pct: 50 },
          { label: 'D', pct: 1 },
          { label: 'E', pct: 9 },
        ],
      },
      ctx,
    );
    expect(slots.items.length).toBeLessThanOrEqual(4);
    expect(slots.items[0].pct).toBe(100);
    expect(slots.items[1].pct).toBe(0);
  });

  it('falls back to context when required text is missing, and tolerates junk', () => {
    const slots = coerceSlots('quote', {}, ctx);
    expect(slots.quote).toBe('Q?');
    const messy = coerceSlots('stat', { value: 42, label: undefined, spark: 'nope' }, ctx);
    expect(messy.value).toBe('42');
    expect(messy.label).toBe('Stat');
    expect(messy.spark).toBeUndefined();
  });

  it('only keeps a quote highlight when it actually appears in the quote', () => {
    const ok = coerceSlots('quote', { quote: 'the stretch factor', highlight: 'stretch' }, ctx);
    expect(ok.highlight).toBe('stretch');
    const bad = coerceSlots('quote', { quote: 'the stretch factor', highlight: 'rotation' }, ctx);
    expect(bad.highlight).toBeUndefined();
  });
});

describe('registry — Remix variety via cross-content bridges', () => {
  it('seed 0 always wears the clean canonical finish for its content type', () => {
    expect(assignFinish('quote', 0, 1)).toBe('spotlightQuote');
    expect(assignFinish('concept', 0, 2)).toBe('conceptCard');
    expect(assignFinish('list', 0, 3)).toBe('takeaways');
  });

  it('Remix reaches finishes beyond a content type’s own family (the bridges)', () => {
    const own = new Set<string>(FINISHES_BY_CONTENT.quote ?? []);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) seen.add(assignFinish('quote', seed, 1));
    // A quote-heavy reel should reach more than its 4 native quote finishes…
    expect(seen.size).toBeGreaterThan(own.size);
    // …including at least one finish bridged in from another content family.
    expect([...seen].some((t) => !own.has(t))).toBe(true);
  });

  it('never re-picks the current finish when told to exclude it (Remix is never a no-op)', () => {
    // Regression: a +1 seed step maps back onto the same pool index whenever the pool size divides
    // the step evenly, so Remix could silently return the SAME finish — reading as "Remix is slow /
    // doesn't work" until you clicked it several times. With the current finish excluded it must
    // always move.
    for (const content of ['quote', 'concept', 'list', 'stat', 'ranked'] as const) {
      const pool = FINISHES_BY_CONTENT[content] ?? [];
      if (pool.length < 2) continue; // a one-finish family genuinely can't change; not this bug
      for (let seed = 1; seed <= 40; seed++) {
        const current = assignFinish(content, seed, 0);
        const next = assignFinish(content, seed + 1, 0, 0, current);
        expect(next).not.toBe(current);
      }
    }
  });

  it('reseedFinishes changes every multi-option content beat on a single seed bump', () => {
    // The whole-script path Remix actually takes. Build a reel, bump the seed once, and assert each
    // content beat with more than one available finish actually wore a different one.
    const base = buildReelFallback([
      frame('What are eigenvalues?', 'They scale a vector.', ['a', 'b', 'c']),
      frame('Why do they matter?', 'They reveal the axes.', ['d', 'e']),
    ]);
    const remixed = reseedFinishes(base, base.seed + 1);
    let comparedAContentBeat = false;
    base.slides.forEach((s, i) => {
      if (s.content === 'title' || s.content === 'outro') return;
      const pool = FINISHES_BY_CONTENT[s.content] ?? [];
      if (pool.length < 2) return;
      comparedAContentBeat = true;
      expect(remixed.slides[i].template).not.toBe(s.template);
    });
    expect(comparedAContentBeat).toBe(true); // the fixture really did exercise the guarantee
  });

  it('adapts a beat’s slots to the content shape its bridged finish expects', () => {
    const quoteInConceptFinish = {
      id: 's',
      content: 'quote',
      template: 'spotlightStage', // a concept finish, reachable from a quote only via the bridge
      slots: { quote: 'A strong, memorable sentence.', attribution: 'Revenue review' },
      voiceover: '',
      durationMs: 1,
    } as unknown as ReelSlide;
    const el = SlideView({ slide: quoteInConceptFinish }) as {
      props: { slots: Record<string, unknown> };
    };
    // The quote was reshaped into the concept finish's slots (a headline title), never passed raw.
    expect(el.props.slots).toHaveProperty('title');
    expect(String(el.props.slots.title)).toContain('memorable sentence');
  });
});
