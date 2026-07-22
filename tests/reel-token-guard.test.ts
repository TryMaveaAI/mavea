// The token-tower guard: a single unbroken run (a URL, a hash, a hyphen-less compound) must never
// survive coercion longer than clampToken's maxRun, however generous its slot's overall character
// budget is — that's the one shape per-slot budgeting (SLOT_BUDGET/CHAR_BUDGET) can't stop, since a
// spaceless run can sit well under budget and still be far too long to seat on one line at the
// tightest fitText tier. Modeled on reel-fit.test.ts's OVER/torture pattern and finish-render loop.
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { FINISH, coerceSlots } from '../src/clip/reel/templates/registry';
import { SlideView } from '../src/clip/reel/templates/SlideView';
import {
  clampToken,
  type ReelSlide,
  type SlotKey,
  type TemplateId,
} from '../src/clip/reel/reelScript';

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
        render(createElement(SlideView, { slide: slideFor(template as TemplateId, def.content) })),
      ).not.toThrow();
    });
  }
});
