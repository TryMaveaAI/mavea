// The compose-time text budgets: every slot on every slide kind carries a hard character ceiling
// (BUDGET in slides/model/compose.ts), applied once at composeSlides' exit. This is what lets a
// deck promise "never a jumble" on every surface at once — Present, the PDF rasterizer, and the
// PPTX raster all render the same composed model, so a cap enforced here is enforced everywhere.
// The render-side fit ladders stay a backstop that should never actually truncate.
//
// The torture inputs are deliberately absurd (multi-hundred-character titles, labels, and cells)
// because real LLM output does produce them; the assertions pin the ceilings, the word-boundary
// ellipsis, and — just as important — that data values (hero figures, stat/bar values) are NEVER
// trimmed, since truncating "2,600,000" would falsify the number.
import { describe, expect, it } from 'vitest';
import type {
  ExportMeta,
  Section,
  SectionDataMap,
  SectionKind,
} from '../src/export/model/ExportDoc';
import { composeSlides } from '../src/slides/model/compose';
import type { Slide, SlideKind } from '../src/slides/model/Slide';

let n = 0;
function sec<K extends SectionKind>(kind: K, data: SectionDataMap[K]): Section {
  return { kind, id: `s${n++}`, source: 0, data } as Section;
}

const meta = (over: Partial<ExportMeta> = {}): ExportMeta => ({
  title: 'Chicago Trip',
  topic: 'Travel',
  sources: [],
  generatedAt: 1_700_000_000_000,
  ...over,
});

/** Realistic word soup of at least `len` characters — words, so boundary trims have boundaries. */
const words = (len: number): string => {
  let out = '';
  const pool = ['downtown', 'Milwaukee', 'lakefront', 'itinerary', 'reservations', 'afternoon'];
  for (let i = 0; out.length < len; i += 1) out += `${pool[i % pool.length]} `;
  return out.trim();
};

const only = <K extends SlideKind>(slides: Slide[], kind: K): Extract<Slide, { kind: K }>[] =>
  slides.filter((s) => s.kind === kind) as Extract<Slide, { kind: K }>[];

/** Trimmed slots end on the ellipsis, never on a stranded space or comma. */
const wellTrimmed = (s: string): boolean => !/[\s,;:.!?]…$/.test(s) && s.endsWith('…');

describe('compose-time text budgets — no slot can exceed what its layout seats', () => {
  it('caps the cover and closing headlines/standfirsts', () => {
    const out = composeSlides(
      [],
      meta({ title: words(500), sub: words(500), sources: [{ name: words(200) }] }),
    );
    const cover = only(out, 'cover')[0];
    expect(cover.data.title.length).toBeLessThanOrEqual(180);
    expect(wellTrimmed(cover.data.title)).toBe(true);
    expect((cover.data.subtitle ?? '').length).toBeLessThanOrEqual(180);
    const closing = only(out, 'closing')[0];
    expect(closing.data.title.length).toBeLessThanOrEqual(80);
    for (const src of closing.data.sources) expect(src.length).toBeLessThanOrEqual(60);
  });

  it('caps table titles, column headers, cells, and notes — the wordy-spec-table jumble', () => {
    const out = composeSlides(
      [
        sec('specTable', {
          heading: words(400),
          columns: [words(120), words(120), words(120)],
          rows: [[words(300), words(300), words(300)]],
          note: words(600),
        }),
      ],
      meta(),
    );
    const table = only(out, 'dataTable')[0];
    expect((table.data.title ?? '').length).toBeLessThanOrEqual(90);
    for (const col of table.data.columns) expect(col.length).toBeLessThanOrEqual(28);
    for (const cell of table.data.rows.flat()) {
      expect(cell.length).toBeLessThanOrEqual(80);
      expect(wellTrimmed(cell)).toBe(true);
    }
    expect((table.data.note ?? '').length).toBeLessThanOrEqual(180);
  });

  it('caps keyFigure stat labels and body but NEVER touches the hero value or stat values', () => {
    const heroValue = '2,600,000';
    const out = composeSlides(
      [
        sec('metricTiles', {
          heading: words(200),
          tiles: [
            { value: heroValue, label: words(300) },
            { value: '1,234,567', label: words(300) },
            { value: '89%', label: words(300) },
          ],
        }),
      ],
      meta(),
    );
    const fig = only(out, 'keyFigure')[0];
    expect(fig.data.value).toBe(heroValue); // data value survives verbatim
    for (const st of fig.data.stats) {
      expect(st.value).toMatch(/^[\d,.%]+$/); // untrimmed formatted figures
      expect(st.label.length).toBeLessThanOrEqual(44);
    }
  });

  it('caps chart bar labels without touching bar values', () => {
    const out = composeSlides(
      [
        sec('distributionBars', {
          heading: words(200),
          total: '2,600',
          bars: [{ label: words(200), pct: 0.7, value: '1,820' }],
          note: words(400),
        }),
      ],
      meta(),
    );
    const chart = only(out, 'chart')[0];
    expect((chart.data.title ?? '').length).toBeLessThanOrEqual(90);
    expect(chart.data.total).toBe('2,600');
    for (const bar of chart.data.bars) {
      expect(bar.label.length).toBeLessThanOrEqual(44);
      expect(bar.value).toBe('1,820');
    }
  });

  it('caps process steps, roadmap phases, and agenda rows', () => {
    const out = composeSlides(
      [
        sec('numberedMilestones', {
          heading: words(200),
          items: [{ title: words(300), body: words(500) }],
        }),
        sec('verticalTimeline', {
          heading: words(200),
          events: [{ marker: 'W1', title: words(300), body: words(500) }],
        }),
        sec('rankedList', {
          heading: words(200),
          items: [{ name: words(300), meta: words(300) }],
        }),
      ],
      meta(),
    );
    for (const s of only(out, 'process')) {
      expect((s.data.title ?? '').length).toBeLessThanOrEqual(90);
      for (const st of s.data.steps) {
        expect(st.title.length).toBeLessThanOrEqual(72);
        expect((st.body ?? '').length).toBeLessThanOrEqual(160);
      }
    }
    for (const s of only(out, 'roadmap'))
      for (const p of s.data.phases) {
        expect(p.title.length).toBeLessThanOrEqual(72);
        expect((p.body ?? '').length).toBeLessThanOrEqual(160);
      }
    for (const s of only(out, 'agenda'))
      for (const it of s.data.items) {
        expect(it.title.length).toBeLessThanOrEqual(72);
        expect((it.sub ?? '').length).toBeLessThanOrEqual(160);
      }
  });

  it('caps quote bodies and every kicker across the deck', () => {
    const out = composeSlides(
      [sec('spotlightCard', { label: words(120), title: words(600), body: words(600) })],
      meta({ topic: words(120) }),
    );
    for (const q of only(out, 'quote')) expect(q.data.body.length).toBeLessThanOrEqual(240);
    for (const s of out) expect((s.kicker ?? '').length).toBeLessThanOrEqual(36);
  });

  it('a short deck passes through byte-identical — the budget pass is a ceiling, not a rewrite', () => {
    const out = composeSlides(
      [sec('prose', { heading: 'Day one', body: 'Start at the lakefront.' })],
      meta(),
    );
    const prose = only(out, 'prose')[0];
    expect(prose.data.heading).toBe('Day one');
    expect(prose.data.body).toBe('Start at the lakefront.');
    expect(only(out, 'cover')[0].data.title).toBe('Chicago Trip');
  });
});
