// morph-axes.test.ts — the two time representations' axes, and the chart's value bands.
//
// Four defects live here, and each one was a case where the layout was arithmetically fine and
// unreadable anyway:
//   · a single dated observation padded its own domain by half its magnitude and drew a five-century
//     axis for one afternoon;
//   · a span of weeks rounded every tick to a year and collapsed to ONE label, so an hour-by-hour
//     bank run read as "2019";
//   · a domain niced on one step and ticked on another left the last observation past the last tick,
//     which is the one figure a reader most wants to date;
//   · series in incommensurable units shared one linear y, and everything but the biggest flattened
//     onto the axis — while the marks that ARE the hit targets stacked on one pixel, leaving the
//     lower node with no way in at all.
//
// So these are properties, swept over the whole corpus, not geometry numbers: ticks bracket their
// data, an axis labels at the granularity its span actually has, every series draws with a height in
// a band of its OWN unit, and no two marks land inside the legibility floor.
import { describe, expect, it } from 'vitest';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { layoutChart } from '../src/canvas/spatial/morph/layouts/chartLayout';
import { timeAxis, yearOf } from '../src/canvas/spatial/morph/layouts/lanes';
import { layoutTimeline } from '../src/canvas/spatial/morph/layouts/timelineLayout';
import type { MorphLayout, WorldData } from '../src/canvas/spatial/morph/types';
import { ALL_WORLD_SCENARIOS } from '../src/live/world/scenarios/index';

/** What useMorphStage hands a layout on a laptop stage. */
const LAYOUT_HINT = { w: 1088, h: 648 };
/** The codebase's rendered-text legibility floor (scripts/ui-audit.mts), which a hit target must
 *  also clear — a mark closer than this to its neighbour cannot be aimed at. */
const LEGIBILITY_PX = 9;
/** Below this a series is a flat rule: its whole history reads as one value. */
const FLAT_PX = 4;

const at = (iso: string): number => Date.parse(iso);

function expectNoViolations(violations: readonly string[]): void {
  expect(violations, `${violations.length} violation(s):\n  ${violations.join('\n  ')}`).toEqual(
    [],
  );
}

/* ── the shared time axis ────────────────────────────────────────────────── */

describe('timeAxis — one step for the domain and its ticks', () => {
  it('brackets its data and lands every tick inside the domain it publishes', () => {
    const spans: Array<[string, number, number]> = [
      ['one afternoon', at('2024-03-05T13:00:00Z'), at('2024-03-05T18:30:00Z')],
      ['a bank run', at('2019-06-09T09:00:00Z'), at('2019-06-13T16:00:00Z')],
      ['a blackout', at('2024-01-08T00:00:00Z'), at('2024-03-08T00:00:00Z')],
      ['two seasons', at('2023-04-01T00:00:00Z'), at('2024-02-01T00:00:00Z')],
      ['a decade', at('2001-01-01T00:00:00Z'), at('2010-01-01T00:00:00Z')],
      ['two millennia', at('0100-01-01T00:00:00Z'), at('2040-01-01T00:00:00Z')],
    ];
    const bad: string[] = [];
    for (const [name, from, to] of spans) {
      const lo = yearOf(from);
      const hi = yearOf(to);
      const axis = timeAxis(lo, hi);
      const first = axis.ticks[0];
      const last = axis.ticks[axis.ticks.length - 1];
      if (axis.ticks.length < 2) bad.push(`${name}: ${axis.ticks.length} tick(s)`);
      if (axis.domain[0] > lo || axis.domain[1] < hi) bad.push(`${name}: domain misses the data`);
      // The whole point of nicing here: the domain IS the tick run, so neither end of the data can
      // fall past the last label.
      if (Math.abs(first.year - axis.domain[0]) > 1e-6) bad.push(`${name}: first tick off domain`);
      if (Math.abs(last.year - axis.domain[1]) > 1e-6) bad.push(`${name}: last tick off domain`);
      if (new Set(axis.ticks.map((t) => t.text)).size < 2) {
        bad.push(`${name}: collapsed to ${JSON.stringify(first.text)}`);
      }
      // Rounding out is allowed; inventing a period nothing was measured in is not.
      const slack = hi - lo + 1;
      if (axis.domain[0] < lo - slack || axis.domain[1] > hi + slack) {
        bad.push(`${name}: domain ${axis.domain.join('–')} is far outside ${lo}–${hi}`);
      }
    }
    expectNoViolations(bad);
  });

  it('labels at the granularity the span actually has', () => {
    const label = (from: string, to: string): string[] =>
      timeAxis(yearOf(at(from)), yearOf(at(to))).ticks.map((t) => t.text);
    // Years for a long span…
    expect(label('1974-01-01T00:00:00Z', '1983-01-01T00:00:00Z')).toContain('1983');
    // …months for a span of seasons, days for a span of weeks…
    expect(label('2023-04-01T00:00:00Z', '2024-02-01T00:00:00Z').join()).toMatch(/^\w{3} 202/);
    expect(label('2024-01-08T00:00:00Z', '2024-03-08T00:00:00Z').join()).toMatch(/\d+ \w{3} 2024/);
    // …and the clock for a run of hours, re-dated at every midnight so no time is ambiguous.
    const intraday = label('2019-06-09T09:00:00Z', '2019-06-11T16:00:00Z');
    expect(intraday.some((t) => /^\d{2}:\d{2}$/.test(t))).toBe(true);
    expect(intraday.some((t) => /^\d+ \w{3} \d{4}$/.test(t))).toBe(true);
  });

  it('opens a window around a single instant instead of padding by its own magnitude', () => {
    // The bug this pins: niceDomain pads a zero-width domain by |min| × 0.5, which on a year scale
    // is five centuries either side of one afternoon in 2024.
    const only = yearOf(at('2024-10-01T00:00:00Z'));
    const axis = timeAxis(only, only);
    expect(axis.domain[0]).toBeGreaterThan(only - 1);
    expect(axis.domain[1]).toBeLessThan(only + 1);
    for (const tick of axis.ticks) {
      expect(Number(tick.text), `${tick.text} parses as a year`).toBeNaN();
    }
  });

  it('is deterministic and finite, whatever it is handed', () => {
    const cases: Array<[number, number]> = [
      [2000, 2000],
      [2000, 2000.000001],
      [-3000, 2000],
      [1970, 1970.5],
      [1969.9, 1970.1],
    ];
    for (const [lo, hi] of cases) {
      const axis = timeAxis(lo, hi);
      expect(timeAxis(lo, hi)).toEqual(axis);
      expect(axis.ticks.length).toBeGreaterThan(0);
      for (const tick of axis.ticks) {
        expect(Number.isFinite(tick.year), `${lo}–${hi}`).toBe(true);
        expect(tick.text).not.toMatch(/NaN|Invalid|undefined/);
      }
    }
  });
});

/* ── the corpus, through both time representations ───────────────────────── */

interface Pass {
  id: string;
  world: WorldData;
  chart: MorphLayout;
  timeline: MorphLayout;
}

const PASSES: readonly Pass[] = ALL_WORLD_SCENARIOS.map((scenario) => {
  const world = worldToMorph(scenario.spec);
  return {
    id: scenario.id,
    world,
    chart: layoutChart(world, { viewport: LAYOUT_HINT }),
    timeline: layoutTimeline(world, { viewport: LAYOUT_HINT }),
  };
});

/** Every unit band's value→px map, read back out of the gridlines the layout emitted — so this
 *  measures the plot that was drawn rather than a second copy of chartLayout's arithmetic. */
function bandScales(layout: MorphLayout): Map<string, (v: number) => number> {
  const rows = new Map<string, Array<{ v: number; y: number }>>();
  for (const path of layout.chrome.paths) {
    const id = /grid:(\d+):(-?[\d.e+-]+)$/.exec(path.id);
    const start = /^M \S+ (\S+) /.exec(path.d);
    if (!id || !start) continue;
    const list = rows.get(id[1]) ?? [];
    list.push({ v: Number(id[2]), y: Number(start[1]) });
    rows.set(id[1], list);
  }
  const scales = new Map<string, (v: number) => number>();
  for (const [band, list] of rows) {
    const [a, b] = [list[0], list[list.length - 1]];
    if (list.length < 2 || a.v === b.v) continue;
    const k = (b.y - a.y) / (b.v - a.v);
    scales.set(band, (v) => a.y + (v - a.v) * k);
  }
  return scales;
}

/** Each band's value domain, read back off the gridlines it drew — the domain is rounded out to
 *  whole steps, so its first and last gridline ARE its bounds. */
function bandDomains(layout: MorphLayout): Map<string, [number, number]> {
  const domains = new Map<string, [number, number]>();
  for (const path of layout.chrome.paths) {
    const id = /grid:(\d+):(-?[\d.e+-]+)$/.exec(path.id);
    if (!id) continue;
    const v = Number(id[2]);
    const seen = domains.get(id[1]);
    domains.set(id[1], seen ? [Math.min(seen[0], v), Math.max(seen[1], v)] : [v, v]);
  }
  return domains;
}

/** The bands a chart drew, in stacking order, keyed by the unit each one carries. A single-unit
 *  chart draws no unit caption — its y labels ARE the unit — so it is band 0 by construction. */
function unitOrder(world: WorldData): string[] {
  const units: string[] = [];
  for (const n of world.nodes) {
    if (!n.series?.length) continue;
    const unit = n.unit ?? '';
    if (!units.includes(unit)) units.push(unit);
  }
  return units;
}

describe('chart — a scale per unit, never one shared across them', () => {
  it('scales every band off its OWN unit and nothing else', () => {
    // The invariant that closes the defect, stated where it cannot go vacuous: a band's domain is a
    // rounding of the data in its own unit — it contains that data and is at most a few times as
    // wide. Pooling every unit into one linear y is exactly what this forbids; it made the %
    // band five hundred times taller than the numbers in it, which is how a real series ends up
    // drawn as a rule on the axis.
    const bad: string[] = [];
    for (const p of PASSES) {
      const units = unitOrder(p.world);
      const domains = bandDomains(p.chart);
      for (const [i, unit] of units.entries()) {
        const domain = domains.get(String(i));
        if (!domain) continue;
        const vs = p.world.nodes
          .filter((n) => n.series?.length && (n.unit ?? '') === unit)
          .flatMap((n) => n.series?.map((s) => s.v) ?? []);
        const lo = Math.min(...vs);
        const hi = Math.max(...vs);
        const where = `${p.id}: band ${i} (${unit || 'no unit'}, data ${lo}–${hi}, domain ${domain[0]}–${domain[1]})`;
        if (domain[0] > lo || domain[1] < hi) bad.push(`${where} does not contain its data`);
        // A constant unit has no span to round out, so it is judged on containment alone.
        if (hi > lo && domain[1] - domain[0] > (hi - lo) * 3) {
          bad.push(`${where} is ${((domain[1] - domain[0]) / (hi - lo)).toFixed(0)}× its own data`);
        }
      }
    }
    expectNoViolations(bad);
  });

  it('gives both series a real height when their units are incommensurable', () => {
    // The defect in miniature: a fraction and a tonnage on one chart. Under a single pooled linear
    // y the fraction is 0.00004 of the plot and disappears onto the axis.
    const mixed: WorldData = {
      nodes: [
        {
          id: 'share',
          label: 'Share',
          unit: '%',
          series: [
            { t: Date.UTC(2000, 0, 1), v: 0.1 },
            { t: Date.UTC(2010, 0, 1), v: 0.5 },
          ],
        },
        {
          id: 'tonnage',
          label: 'Tonnage',
          unit: 'kt',
          series: [
            { t: Date.UTC(2000, 0, 1), v: 1_000_000 },
            { t: Date.UTC(2010, 0, 1), v: 5_000_000 },
          ],
        },
      ],
      edges: [],
    };
    const layout = layoutChart(mixed, { viewport: LAYOUT_HINT });
    const scales = bandScales(layout);
    expect(scales.size, 'one band per unit').toBe(2);
    expect(scales.get('0')!(0.5) - scales.get('0')!(0.1)).toBeLessThanOrEqual(-FLAT_PX);
    expect(scales.get('1')!(5e6) - scales.get('1')!(1e6)).toBeLessThanOrEqual(-FLAT_PX);
    // …and the bands really are stacked, not drawn over each other.
    expect(Math.abs(scales.get('0')!(0.5) - scales.get('1')!(5e6))).toBeGreaterThan(FLAT_PX);
  });

  it('stacks the unit bands without overlap and names every one of them', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      const units = unitOrder(p.world);
      const captions = p.chart.chrome.labels.filter((l) => l.id.startsWith('unit:'));
      if (units.length < 2) {
        if (captions.length > 0) bad.push(`${p.id}: a single-unit chart captioned its band`);
        continue;
      }
      if (captions.length !== units.length) {
        bad.push(`${p.id}: ${captions.length} captions for ${units.length} units`);
      }
      // Every mark sits inside the band its unit was given, and the bands do not interleave.
      const rows = new Map<string, { top: number; bottom: number }>();
      for (const n of p.world.nodes) {
        if (!n.series?.length) continue;
        const placed = p.chart.positions.get(n.id);
        if (!placed) continue;
        const key = String(units.indexOf(n.unit ?? ''));
        const row = rows.get(key) ?? { top: Infinity, bottom: -Infinity };
        rows.set(key, {
          top: Math.min(row.top, placed.y),
          bottom: Math.max(row.bottom, placed.y + placed.h),
        });
      }
      const ordered = [...rows.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
      for (let i = 1; i < ordered.length; i++) {
        if (ordered[i][1].top < ordered[i - 1][1].bottom) {
          bad.push(`${p.id}: unit bands ${ordered[i - 1][0]} and ${ordered[i][0]} interleave`);
        }
      }
    }
    expectNoViolations(bad);
  });
});

describe('chart — every mark stays reachable', () => {
  it('never puts two marks inside the legibility floor of each other', () => {
    const bad: string[] = [];
    for (const p of PASSES) {
      const marks = [...p.chart.positions.entries()].filter(([, n]) => n.face === 'mark');
      for (let i = 0; i < marks.length; i++) {
        for (let j = i + 1; j < marks.length; j++) {
          const [aId, a] = marks[i];
          const [bId, b] = marks[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LEGIBILITY_PX) {
            bad.push(`${p.id}: ${aId} and ${bId} are ${d.toFixed(2)}px apart`);
          }
        }
      }
    }
    expectNoViolations(bad);
  });

  it('leaves an uncrowded mark exactly on its datum and gives a moved one a leader', () => {
    const apart: WorldData = {
      nodes: [
        {
          id: 'a',
          label: 'A',
          series: [
            { t: Date.UTC(1990, 0, 1), v: 1 },
            { t: Date.UTC(2000, 0, 1), v: 2 },
          ],
        },
        {
          id: 'b',
          label: 'B',
          series: [
            { t: Date.UTC(1990, 0, 1), v: 9 },
            { t: Date.UTC(2000, 0, 1), v: 8 },
          ],
        },
      ],
      edges: [],
    };
    const clear = layoutChart(apart);
    expect(clear.chrome.paths.filter((c) => c.id.startsWith('leader:'))).toHaveLength(0);
    // The mark is the end of the line: it sits on the last point of its own series path.
    for (const id of ['a', 'b']) {
      const mark = clear.positions.get(id)!;
      const d = clear.chrome.paths.find((c) => c.id === `series:${id}`)!.d;
      const [, lx, ly] = /L ([\d.-]+) ([\d.-]+)$/.exec(d)!;
      expect(mark.x + mark.w / 2).toBeCloseTo(Number(lx), 1);
      expect(mark.y + mark.h / 2).toBeCloseTo(Number(ly), 1);
    }

    // Three series ending on the same value in the same unit: the marks fan apart, and each moved
    // one keeps a leader back to the point it belongs to.
    const stacked: WorldData = {
      nodes: ['a', 'b', 'c'].map((id) => ({
        id,
        label: id.toUpperCase(),
        unit: 'kt',
        series: [
          { t: Date.UTC(1990, 0, 1), v: Number(id.charCodeAt(0)) },
          { t: Date.UTC(2000, 0, 1), v: 50 },
        ],
      })),
      edges: [],
    };
    const fanned = layoutChart(stacked);
    const ys = ['a', 'b', 'c'].map((id) => fanned.positions.get(id)!.y).sort((x, y) => x - y);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(LEGIBILITY_PX);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(LEGIBILITY_PX);
    const leaders = fanned.chrome.paths.filter((c) => c.id.startsWith('leader:'));
    expect(leaders.length).toBeGreaterThanOrEqual(2);
    for (const leader of leaders) {
      const id = leader.id.slice('leader:'.length);
      const series = fanned.chrome.paths.find((c) => c.id === `series:${id}`)!;
      const [, lx, ly] = /L ([\d.-]+) ([\d.-]+)$/.exec(series.d)!;
      const [, mx, my] = /^M ([\d.-]+) ([\d.-]+) /.exec(leader.d)!;
      expect(Number(mx), `${id} leader starts at the datum`).toBeCloseTo(Number(lx), 1);
      expect(Number(my)).toBeCloseTo(Number(ly), 1);
      const mark = fanned.positions.get(id)!;
      const [, ex, ey] = /L ([\d.-]+) ([\d.-]+)$/.exec(leader.d)!;
      expect(Number(ex), `${id} leader ends at the mark`).toBeCloseTo(mark.x + mark.w / 2, 1);
      expect(Number(ey)).toBeCloseTo(mark.y + mark.h / 2, 1);
    }
  });
});

describe('both time representations label the span they actually cover', () => {
  it('never collapses either axis to one label when the data spans more than an instant', () => {
    // The defect: a span of weeks rounded every tick to a year, and the consecutive-duplicate skip
    // then left ONE label behind. Swept over both reps, since they share the formatter.
    const bad: string[] = [];
    for (const p of PASSES) {
      for (const [rep, layout, prefix] of [
        ['chart', p.chart, 'xtick:'],
        ['timeline', p.timeline, 'tick-label:'],
      ] as const) {
        const ticks = layout.chrome.labels.filter((l) => l.id.startsWith(prefix));
        if (ticks.length === 0) continue;
        if (new Set(ticks.map((l) => l.text)).size < 2) {
          bad.push(`${p.id}/${rep}: ${ticks.length} tick(s), all reading ${ticks[0].text}`);
        }
      }
    }
    expectNoViolations(bad);
  });

  it('brackets every observation between the first tick and the last', () => {
    // The defect in pixels: a chart mark IS its series' last point, so a mark to the right of the
    // last tick is the most recent figure on the chart with nothing under it to date it. Measured in
    // x rather than in the label's text, because a clock label carries no year to compare.
    const bad: string[] = [];
    for (const p of PASSES) {
      const ticks = p.chart.chrome.labels.filter((l) => l.id.startsWith('xtick:')).map((l) => l.x);
      const marks = [...p.chart.positions.values()]
        .filter((n) => n.face === 'mark')
        .map((n) => n.x + n.w / 2);
      if (ticks.length === 0 || marks.length === 0) continue;
      if (Math.max(...marks) > Math.max(...ticks) + 0.5) {
        bad.push(
          `${p.id}: last mark at ${Math.max(...marks).toFixed(1)}, last tick at ${Math.max(...ticks).toFixed(1)}`,
        );
      }
      if (Math.min(...marks) < Math.min(...ticks) - 0.5) {
        bad.push(`${p.id}: a mark sits left of the first tick`);
      }
    }
    expectNoViolations(bad);
  });
});
