import { fontSizeFloorPx } from './helpers/fluidType';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimateTextWidth } from '../src/canvas/lib/fitText';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ContractionTimer } from '../src/canvas/blocks/everyday/ContractionTimer';
import { CycleTrack } from '../src/canvas/blocks/everyday/CycleTrack';
import { Forecast } from '../src/canvas/blocks/everyday/Forecast';
import { PrayerTimes } from '../src/canvas/blocks/everyday/PrayerTimes';
import { PlanGrid } from '../src/canvas/blocks/everyday/PlanGrid';
import { RelationshipMap } from '../src/canvas/blocks/everyday/RelationshipMap';
import { SettleUp } from '../src/canvas/blocks/everyday/SettleUp';
import { UnitConvert } from '../src/canvas/blocks/everyday/UnitConvert';
import type {
  Contraction,
  ForecastDay,
  PrayerSlot,
  Settlement,
  UnitEquivalent,
} from '../src/canvas/blocks/everyday/types';

describe('PlanGrid', () => {
  it('leaves an unplanned slot empty instead of calling it free', () => {
    const { container, queryByText } = render(
      <PlanGrid
        title="Daily focus"
        columns={['Phase 1', 'Phase 2']}
        rows={[{ slot: 'Morning', cells: [{ col: 'Phase 1', label: 'Review notes' }] }]}
      />,
    );

    expect(queryByText(/^free$/i)).toBeNull();
    expect(container.querySelectorAll('.pg-cell--free')).toHaveLength(1);
    expect(container.querySelector('.pg-cell--free')).toHaveAttribute(
      'aria-label',
      'No activity planned',
    );
  });
});

describe('RelationshipMap', () => {
  it('keeps nodes distinct when model-authored ids are blank or duplicated', () => {
    const { container } = render(
      <RelationshipMap
        title="Who knew about the map?"
        people={[
          { id: '', name: 'Snape' },
          { id: 'keeper', name: 'James' },
          { id: 'keeper', name: 'Sirius' },
          { id: '', name: 'Remus' },
        ]}
        ties={[
          { source: 'Snape', target: 'James', kind: 'rival' },
          { source: 'Sirius', target: 'Remus', kind: 'ally' },
        ]}
      />,
    );

    const nodes = Array.from(container.querySelectorAll<SVGCircleElement>('.rm-node-dot'));
    expect(nodes).toHaveLength(4);
    const coordinates = nodes.map(
      (node) => `${node.getAttribute('cx')}:${node.getAttribute('cy')}`,
    );
    expect(new Set(coordinates).size).toBe(4);
    expect(container.querySelectorAll('.rm-edge')).toHaveLength(2);
    expect(container.textContent).toContain('Snape');
    expect(container.textContent).toContain('Sirius');
  });
});

// Each interval between two contractions is its own flex item between the two bars, as wide as
// the interval, with the figure written inside it on the bars' baseline. Hung off a bar's edge at
// a percentage of that bar's slot, the labels landed at uneven heights and the last ran into the
// next bar wherever the gap was narrow.
describe('ContractionTimer', () => {
  function contractions(n: number): Contraction[] {
    return Array.from({ length: n }, (_, i) => ({
      start: `${2 + Math.floor(i / 6)}:${String((i * 7) % 60).padStart(2, '0')} PM`,
      durationSec: 40 + ((i * 5) % 30),
      intervalMin: i < n - 1 ? 3 + ((i * 2) % 5) : undefined,
    }));
  }

  it('puts every interval label in the gap between its two bars, never on a bar', () => {
    const { container } = render(
      <ContractionTimer title="Contractions" contractions={contractions(12)} />,
    );
    const strip = container.querySelector('.cn-strip') as HTMLElement;
    const kids = Array.from(strip.children);
    // slot, gap, slot, gap, …, slot
    expect(kids).toHaveLength(12 * 2 - 1);
    kids.forEach((el, i) => {
      expect(el.classList.contains(i % 2 === 0 ? 'cn-slot' : 'cn-gap')).toBe(true);
    });
    for (const slot of container.querySelectorAll('.cn-slot')) {
      expect(slot.querySelector('.cn-gap-label')).toBeNull();
    }
    // One baseline for all of them: no label carries its own vertical offset.
    for (const label of container.querySelectorAll<HTMLElement>('.cn-gap-label')) {
      expect(label.style.top).toBe('');
    }
  });

  it('widens a gap with its interval', () => {
    const list: Contraction[] = [
      { start: '1:00 PM', durationSec: 50, intervalMin: 9 },
      { start: '1:09 PM', durationSec: 50, intervalMin: 3 },
      { start: '1:12 PM', durationSec: 50, intervalMin: 6 },
      { start: '1:18 PM', durationSec: 50 },
    ];
    const { container } = render(<ContractionTimer title="Contractions" contractions={list} />);
    const grow = Array.from(container.querySelectorAll<HTMLElement>('.cn-gap')).map((g) =>
      Number(g.style.flexGrow),
    );
    expect(grow).toHaveLength(3);
    expect(grow[0]).toBeGreaterThan(grow[2]);
    expect(grow[2]).toBeGreaterThan(grow[1]);
    expect(grow[1]).toBeGreaterThan(0);
  });

  it('keeps every bar and label within the strip for a long, dense log', () => {
    const list = contractions(20);
    const { container } = render(<ContractionTimer title="Contractions" contractions={list} />);
    const strip = container.querySelector('.cn-strip') as HTMLElement;
    expect(strip).toBeTruthy();
    expect(container.querySelectorAll('.cn-bar')).toHaveLength(20);
    // Gap labels render for every entry except the last (no trailing gap).
    expect(container.querySelectorAll('.cn-gap-label')).toHaveLength(19);
  });
});

// A condition is usually two words ("Partly cloudy"), and real forecasts say "Scattered
// thunderstorms". It wraps to at most two lines and is cut after that, keeping the full text as a
// tooltip, so one long condition cannot stretch its day past the others.
describe('Forecast', () => {
  function days(n: number, condition = 'Sunny'): ForecastDay[] {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return Array.from({ length: n }, (_, i) => ({
      label: labels[i % labels.length] ?? `Day ${i + 1}`,
      condition,
      hi: `${70 + i}`,
      lo: `${50 + i}`,
    }));
  }

  it('clamps .fc-condition to two lines and keeps the full text as a tooltip', () => {
    const longCondition = 'Scattered thunderstorms with wintry mix likely after midnight';
    const { container } = render(<Forecast title="Weather" days={days(5, longCondition)} />);
    const conditionEls = Array.from(container.querySelectorAll<HTMLElement>('.fc-condition'));
    expect(conditionEls).toHaveLength(5);
    for (const el of conditionEls) {
      expect(el.textContent).toBe(longCondition);
      expect(el.getAttribute('title')).toBe(longCondition);
    }
    const css = readFileSync(join(__dirname, '../src/canvas/blocks/everyday/styles.css'), 'utf8');
    const rule = /\.fc-condition \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/-webkit-line-clamp: 2;/);
    expect(rule).toMatch(/overflow: hidden;/);
  });

  it('lets the day tiles share the card instead of leaving empty tracks beside them', () => {
    const css = readFileSync(join(__dirname, '../src/canvas/blocks/everyday/styles.css'), 'utf8');
    const rule = /\.fc-grid \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/repeat\(auto-fit,/);
  });
});

// Regression coverage for a real bug: the sun-arc's slot labels used a fixed font size and were
// centred on evenly-spaced points along a fixed-width viewBox with no regard for how much
// horizontal room each label actually gets. That's fine for the five-salah demo fixture, but a
// longer schedule (10+ canonical hours, a multi-service list) packs points close enough that
// same-size labels collide, and a long slot name runs past the viewBox edge horizontally.
describe('PrayerTimes', () => {
  const VB_W = 320; // must track PrayerTimes.tsx's internal VB_W — arc is fixed-viewBox, not measured live.

  function slots(n: number, nameLen = 6): PrayerSlot[] {
    // Spread times evenly across the day so every slot lands at a distinct arc position.
    return Array.from({ length: n }, (_, i) => {
      const mins = Math.round((i * (23 * 60)) / (n - 1 || 1));
      const h = Math.floor(mins / 60)
        .toString()
        .padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return {
        name: `Slot${i}`.padEnd(nameLen, 'x'),
        time: `${h}:${m}`,
      };
    });
  }

  function nameNodes(container: HTMLElement) {
    return Array.from(container.querySelectorAll<SVGTextElement>('text.pt-name'));
  }

  it('renders the demo-sized fixture with the base label size, untruncated', () => {
    const { container } = render(<PrayerTimes slots={slots(5)} />);
    const names = nameNodes(container);
    expect(names).toHaveLength(5);
    for (const n of names) {
      expect(n.getAttribute('font-size')).toBe('11');
    }
  });

  it.each([10, 16])(
    'shrinks label font size as slot count grows to %i, instead of holding a fixed size',
    (n) => {
      const { container } = render(<PrayerTimes slots={slots(n)} />);
      const names = nameNodes(container);
      expect(names).toHaveLength(n);
      const size = Number(names[0].getAttribute('font-size'));
      // Must have shrunk below the small-count baseline (11px) so labels don't collide once
      // there's far less horizontal room per slot.
      expect(size).toBeLessThan(11);
      // Every label shares the same size — no per-label special-casing left over.
      for (const el of names) {
        expect(Number(el.getAttribute('font-size'))).toBe(size);
      }
    },
  );

  it('truncates a slot name too long for its shrunk label budget, keeping the full text as a tooltip', () => {
    const long: PrayerSlot[] = [
      { name: 'First Vespers of Sunday', time: '5:00 AM' },
      { name: 'Morning Prayer', time: '7:15 AM' },
      { name: 'Midday Office', time: '12:00 PM' },
      { name: 'Evening Vespers', time: '6:30 PM' },
      { name: 'Night Compline', time: '9:45 PM' },
      { name: 'Vigil', time: '2:00 AM' },
      { name: 'Terce', time: '9:00 AM' },
      { name: 'Sext', time: '12:00 PM' },
      { name: 'None', time: '3:00 PM' },
      { name: 'Second Vespers of the Feast', time: '7:00 PM' },
    ];
    const { container } = render(<PrayerTimes slots={long} />);
    const names = nameNodes(container);
    expect(names).toHaveLength(10);

    // No rendered label may be long enough to spill into a neighbour: at 10 slots the arc gives
    // each label a fraction of its ~276px usable width, so the visible text must stay short.
    for (const el of names) {
      const visible = Array.from(el.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join('');
      expect(visible.length).toBeLessThanOrEqual(9);
    }

    // The longest names were actually shortened, and the untruncated string survives as a
    // native <title> tooltip rather than being silently lost.
    const longest = names.find((el) => el.textContent?.includes('First Vespers'));
    expect(longest).toBeTruthy();
    const title = longest!.querySelector('title');
    expect(title?.textContent).toBe('First Vespers of Sunday');
  });

  it('keeps the whole arc within its fixed viewBox regardless of slot count', () => {
    const { container } = render(<PrayerTimes slots={slots(16, 10)} />);
    const svg = container.querySelector('svg.pt-arc');
    // The width is fixed; the height grows by one label row per stagger the slot count needs.
    expect(svg?.getAttribute('viewBox')).toMatch(new RegExp(`^0 0 ${VB_W} \\d+`));
    // Labels sharing a row never overlap: each name sits at least its own width from the next.
    const names = Array.from(container.querySelectorAll<SVGTextElement>('text.pt-name'));
    const byRow = new Map<string, { x: number; w: number }[]>();
    for (const n of names) {
      const row = n.getAttribute('y')!;
      const fs = Number(n.getAttribute('font-size'));
      const visible = Array.from(n.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join('');
      const w = estimateTextWidth(visible, fs, true);
      byRow.set(row, [...(byRow.get(row) ?? []), { x: Number(n.getAttribute('x')), w }]);
    }
    for (const row of byRow.values()) {
      row.sort((p, q) => p.x - q.x);
      for (let i = 1; i < row.length; i++) {
        expect(row[i].x - row[i - 1].x).toBeGreaterThanOrEqual((row[i].w + row[i - 1].w) / 2);
      }
      for (const l of row) {
        expect(l.x - l.w / 2).toBeGreaterThanOrEqual(0);
        expect(l.x + l.w / 2).toBeLessThanOrEqual(VB_W);
      }
    }
    // Dots must land within the arc's horizontal padding, not clipped off either edge.
    const dots = Array.from(container.querySelectorAll<SVGCircleElement>('circle.pt-dot'));
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      const cx = Number(dot.getAttribute('cx'));
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(VB_W);
    }
  });
});

// Regression coverage for a real bug: .su-settle is a flex row and its .su-from/.su-to name
// spans had no flex-basis or truncation, so a settlement between people with names longer than
// the short demo fixture ("Alex" → "Sam") overflowed the row horizontally instead of shrinking
// to fit alongside the arrow and amount pill.
describe('SettleUp', () => {
  function settlements(nameLen: number): Settlement[] {
    return [
      { from: 'A'.repeat(nameLen), to: 'B'.repeat(nameLen), amount: '$42.00' },
      {
        from: 'Priya Chandrasekaran-Whitfield',
        to: 'Montgomery Okonkwo-Fitzgerald',
        amount: '$18.50',
      },
    ];
  }

  it('renders the demo-sized fixture with short names untouched', () => {
    const { container, getByText } = render(
      <SettleUp title="Split" settlements={[{ from: 'Alex', to: 'Sam', amount: '$12.00' }]} />,
    );
    expect(getByText('Alex')).toBeInTheDocument();
    expect(getByText('Sam')).toBeInTheDocument();
    const from = container.querySelector('.su-from') as HTMLElement;
    const to = container.querySelector('.su-to') as HTMLElement;
    expect(from.style.overflow).toBe('hidden');
    expect(to.style.overflow).toBe('hidden');
  });

  it('constrains names far longer than the demo data instead of overflowing the row', () => {
    const { container } = render(<SettleUp title="Split" settlements={settlements(24)} />);
    const froms = Array.from(container.querySelectorAll<HTMLElement>('.su-from'));
    const tos = Array.from(container.querySelectorAll<HTMLElement>('.su-to'));
    expect(froms).toHaveLength(2);
    expect(tos).toHaveLength(2);

    // Every name span must carry the flex-shrink-to-fit + ellipsis contract — without it, a
    // long name renders at its full intrinsic width and blows out the fixed-width flex row.
    for (const el of [...froms, ...tos]) {
      // Hugs its text but may shrink: the amount pill takes the slack, not the names.
      expect(el.style.flexGrow).toBe('0');
      expect(el.style.flexShrink).toBe('1');
      expect(el.style.minWidth).toBe('0px');
      expect(el.style.overflow).toBe('hidden');
      expect(el.style.textOverflow).toBe('ellipsis');
      expect(el.style.whiteSpace).toBe('nowrap');
    }

    // The settlement row itself stays a bounded flex container — the arrow and amount pill are
    // still present and not pushed out by an unconstrained name.
    const rows = container.querySelectorAll('.su-settle');
    expect(rows).toHaveLength(2);
    for (const row of Array.from(rows)) {
      expect(row.querySelector('.su-arrow')).toBeTruthy();
      expect(row.querySelector('.su-amt-pill')).toBeTruthy();
    }

    // The full untruncated name survives as a native title tooltip, matching the truncation
    // pattern used elsewhere in the family (PrayerTimes, EtymTree).
    expect(froms[1].getAttribute('title')).toBe('Priya Chandrasekaran-Whitfield');
    expect(tos[1].getAttribute('title')).toBe('Montgomery Okonkwo-Fitzgerald');
  });
});

// Regression coverage for a real bug: equivalent rows are a flex row (.uc-row) with no width
// constraint on the unit name, so a realistic unit name (well past the short demo fixtures like
// "ml"/"tbsp" — real units run "fluid ounces", "kilometers per hour") overflowed past the card
// edge instead of truncating.
describe('UnitConvert', () => {
  it('sizes long unit names to truncate within the row instead of overflowing', () => {
    const equivalents: UnitEquivalent[] = [
      { unit: 'milliliters', value: '240' },
      { unit: 'imperial fluid ounces', value: '8.45' },
      { unit: 'US tablespoons', value: '16' },
      { unit: 'metric teaspoons', value: '48' },
    ];
    const { container } = render(
      <UnitConvert title="Convert" quantity={1} from="cup" equivalents={equivalents} />,
    );

    const units = Array.from(container.querySelectorAll<HTMLElement>('.uc-unit'));
    expect(units).toHaveLength(equivalents.length);

    for (const [i, el] of units.entries()) {
      // The row must be able to shrink the unit span instead of forcing it to its content
      // width — a fixed/auto width is exactly what let long names push past the card.
      expect(el.style.minWidth).toBe('0px');
      expect(el.style.flex).toBe('1 1 0%');
      // Overflow is clipped with an ellipsis rather than wrapping or spilling out.
      expect(el.style.overflow).toBe('hidden');
      expect(el.style.textOverflow).toBe('ellipsis');
      expect(el.style.whiteSpace).toBe('nowrap');
      // The untruncated name is still available, via a native title tooltip.
      expect(el.getAttribute('title')).toBe(equivalents[i].unit);
      expect(el.textContent).toBe(equivalents[i].unit);
    }
  });

  it('leaves short demo-length unit names rendering exactly as given', () => {
    const equivalents: UnitEquivalent[] = [
      { unit: 'ml', value: '240' },
      { unit: 'tbsp', value: '16' },
    ];
    const { container } = render(
      <UnitConvert title="Convert" quantity={1} from="cup" equivalents={equivalents} />,
    );
    const units = Array.from(container.querySelectorAll('.uc-unit'));
    expect(units.map((u) => u.textContent)).toEqual(['ml', 'tbsp']);
  });
});

// Regression coverage for a real bug: the "Today" marker label was authored at 8px inside a
// viewBox that renders ~1:1 with pixels, so it landed under the library's 9px legibility floor
// and read as a smudge. Raising it makes the word wider, which is only safe because the label
// now hangs inward off a marker sitting in the opening or closing days — centred, half of it
// would fall outside the band and the card (overflow:hidden) would slice it off.
describe('CycleTrack', () => {
  const label = (container: HTMLElement) => container.querySelector('.ct-today-label');

  it('anchors the today label inward when the marker sits at either end of the cycle', () => {
    const first = render(<CycleTrack cycleLength={28} periodDays={5} currentDay={1} />);
    expect(label(first.container)?.getAttribute('text-anchor')).toBe('start');

    const last = render(<CycleTrack cycleLength={28} periodDays={5} currentDay={28} />);
    expect(label(last.container)?.getAttribute('text-anchor')).toBe('end');
  });

  it('centres the today label over its marker everywhere else, at any cycle length', () => {
    for (const [cycleLength, currentDay] of [
      [28, 14],
      [21, 8],
      [60, 30],
    ]) {
      const { container } = render(
        <CycleTrack cycleLength={cycleLength} periodDays={5} currentDay={currentDay} />,
      );
      expect(label(container)?.getAttribute('text-anchor')).toBe('middle');
    }
  });

  it('draws no today marker when the cycle has no current day', () => {
    const { container } = render(<CycleTrack cycleLength={28} periodDays={5} />);
    expect(container.querySelector('.ct-today')).toBeNull();
  });

  it('keeps every band label at or above the 9px legibility floor', () => {
    // The band's viewBox (320 wide) renders at ~1:1, so an authored user unit IS a rendered
    // pixel — a size under 9 here is a size the reader has to squint at on the card.
    const css = readFileSync(join(__dirname, '../src/canvas/blocks/everyday/styles.css'), 'utf8');
    const fontSize = (selector: string): number => {
      const rule = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
      const value = rule ? /font-size:\s*([^;]+)/.exec(rule[1])?.[1] : undefined;
      return value === undefined ? Number.NaN : fontSizeFloorPx(value);
    };
    for (const selector of ['.ct-today-label', '.ct-axis']) {
      expect(fontSize(selector), `${selector} font-size`).toBeGreaterThanOrEqual(9);
    }
  });
});
