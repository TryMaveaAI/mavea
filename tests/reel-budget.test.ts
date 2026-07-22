// Guards the reel's "one call, every slide fits" guarantee. The director prompt tells the model a max
// CHARACTER budget per field (CHAR_BUDGET) — the most that reads well on the tightest finish of each
// type. For that to mean "no truncation, no overflow", content written exactly to budget must survive
// coercion UNTOUCHED: nothing clamped (no ellipsis) and no items dropped. This fails if a budget is
// ever set above its coercion hard-clamp (SLOT_BUDGET / inline), or an array budget above its slice.
import { describe, it, expect } from 'vitest';
import { CHAR_BUDGET, type SlotKey } from '../src/clip/reel/reelScript';
import { coerceSlots } from '../src/clip/reel/templates/registry';

const ctx = { topic: 'Topic', question: 'Question?' };
// Word-shaped, not a solid run: a single n-char token is exactly what the token guard (clampToken,
// reelScript.ts) now clamps regardless of the field's own budget, so a solid `x.repeat(n)` no longer
// stands in for "a real answer written to budget" — every WORDS entry is well under the guard's
// maxRun, so this fills a field to exactly n chars without ever tripping it (same reasoning as the
// filler() in reel-fit.test.ts).
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
  diagram: { label: x(B.diagram.label), equation: x(B.diagram.equation), note: x(B.diagram.note) },
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

describe('reel CHAR_BUDGET fits coercion (one call → every slide fits)', () => {
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
