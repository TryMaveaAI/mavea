import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { gestureOf, relativeRect, strokeFor } from '../src/live/annotate/gesture';
import { AnnotationLayer } from '../src/live/annotate/AnnotationLayer';
import { BarChart } from '../src/canvas/BarChart';
import { KpiGrid } from '../src/canvas/KpiGrid';
import { InsightCard } from '../src/canvas/InsightCard';
import { PieDonut } from '../src/canvas/blocks/charts1/PieDonut';
import { Sunburst } from '../src/canvas/blocks/charts1/Sunburst';

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
});

/** A full DOMRect-shaped object (jsdom's own layout is always zero-sized, so tests that need a
 *  real geometry stub build one of these directly). */
function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    ...rect(left, top, width, height),
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => '',
  } as DOMRect;
}

/** jsdom's Range never lays out (`getClientRects` is always empty, `getBoundingClientRect` is
 *  always zero-sized), so `saidRect` — which measures a matched word via a Range — can't resolve
 *  real geometry without help. Stubs both to return the rect for whichever label the range's own
 *  text contains, so a said-target test can assert on genuine text-based resolution rather than
 *  accidentally exercising some OTHER fallback path. Returns a restore function (call in a
 *  `finally`, mirroring the pattern already used by the cross-card "connect" tests below). */
function mockRangeRects(labels: Record<string, DOMRect>): () => void {
  const origRects = Range.prototype.getClientRects;
  const origBCR = Range.prototype.getBoundingClientRect;
  Range.prototype.getClientRects = function () {
    return [] as unknown as DOMRectList;
  };
  Range.prototype.getBoundingClientRect = function (this: Range) {
    const text = this.toString();
    for (const [needle, r] of Object.entries(labels)) if (text.includes(needle)) return r;
    return domRect(0, 0, 0, 0);
  };
  return () => {
    Range.prototype.getClientRects = origRects;
    Range.prototype.getBoundingClientRect = origBCR;
  };
}

/** All coordinate pairs in a path string, for behavioral assertions. */
function coords(d: string): { x: number; y: number }[] {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
}

describe('gesture geometry — hand strokes, not machine arcs', () => {
  const HOST = rect(0, 0, 400, 300);
  const MARK = rect(150, 140, 40, 80);

  it('parses only the known gesture vocabulary', () => {
    expect(gestureOf('circle')).toBe('circle');
    expect(gestureOf('underline')).toBe('underline');
    expect(gestureOf('point')).toBe('point');
    expect(gestureOf('highlight')).toBe('highlight');
    expect(gestureOf('squiggle')).toBeNull();
    expect(gestureOf(null)).toBeNull();
  });

  it('computes host-relative boxes', () => {
    expect(relativeRect(rect(150, 240, 40, 80), rect(100, 200, 400, 300))).toEqual(
      rect(50, 40, 40, 80),
    );
  });

  it('strokes are deterministic per card and vary across cards', () => {
    const a = strokeFor('circle', MARK, HOST, 'block-a')!;
    const b = strokeFor('circle', MARK, HOST, 'block-a')!;
    const c = strokeFor('circle', MARK, HOST, 'block-b')!;
    expect(a.d).toBe(b.d);
    expect(a.d).not.toBe(c.d);
  });

  it('a tight lasso hugs its target instead of grazing the neighbours', () => {
    // A small caps label with content pressing against it (a step number beside it, a title
    // right under) — the measure step flags that `tight`, and the loop must shrink its
    // breathing room while still fully encircling the words.
    const label = rect(60, 40, 38, 13);
    const loose = strokeFor('circle', label, HOST, 'seed')!;
    const tight = strokeFor('circle', label, HOST, 'seed', { tight: true })!;
    expect(tight.kind).toBe('circle');
    const span = (d: string, axis: 'x' | 'y') => {
      const vs = coords(d).map((p) => p[axis]);
      return Math.max(...vs) - Math.min(...vs);
    };
    expect(span(tight.d, 'x')).toBeLessThan(span(loose.d, 'x'));
    expect(span(tight.d, 'y')).toBeLessThan(span(loose.d, 'y'));
    const xs = coords(tight.d).map((p) => p.x);
    const ys = coords(tight.d).map((p) => p.y);
    expect(Math.min(...xs)).toBeLessThanOrEqual(label.left);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(label.left + label.width);
    expect(Math.min(...ys)).toBeLessThanOrEqual(label.top);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(label.top + label.height);
  });

  it('strokes are pen lines (cubic splines), never perfect arcs', () => {
    for (const kind of ['circle', 'underline', 'point'] as const) {
      const s = strokeFor(kind, MARK, HOST, 'seed')!;
      expect(s.d).toContain(' C ');
      expect(s.d).not.toContain(' A ');
    }
  });

  it('the lasso actually encircles the mark', () => {
    const s = strokeFor('circle', MARK, HOST, 'seed')!;
    const pts = coords(s.d);
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThan(MARK.left);
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(MARK.left + MARK.width);
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(MARK.top);
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(MARK.top + MARK.height);
    expect(s.head).toBeUndefined();
  });

  it('the underline sits beneath the mark and spans its width', () => {
    const m = rect(150, 140, 60, 20);
    const s = strokeFor('underline', m, HOST, 'seed')!;
    const pts = coords(s.d);
    for (const p of pts) expect(p.y).toBeGreaterThan(m.top + m.height - 1);
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThanOrEqual(m.left);
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThanOrEqual(m.left + m.width);
  });

  it('the arrow head opens from the exact tip the curve arrives at', () => {
    const s = strokeFor('point', rect(200, 100, 8, 8), HOST, 'seed')!;
    expect(s.head).toBeTruthy();
    const tail = coords(s.d);
    const head = coords(s.head!);
    const tip = tail[tail.length - 1];
    // head is "M wing L tip L wing" — its middle point must be the curve's endpoint
    expect(head[1].x).toBeCloseTo(tip.x, 0);
    expect(head[1].y).toBeCloseTo(tip.y, 0);
  });

  it('every stroke stays inside its card (with pen margin)', () => {
    for (const kind of ['circle', 'underline', 'point', 'highlight'] as const) {
      const s = strokeFor(kind, rect(40, 30, 60, 30), rect(0, 0, 320, 200), 'seed')!;
      for (const p of coords(s.d)) {
        expect(p.x).toBeGreaterThan(-30);
        expect(p.x).toBeLessThan(350);
        expect(p.y).toBeGreaterThan(-30);
        expect(p.y).toBeLessThan(230);
      }
    }
  });

  it('highlight is a filled closed polygon, not a spline', () => {
    const s = strokeFor('highlight', rect(60, 40, 100, 24), rect(0, 0, 400, 200), 'seed')!;
    expect(s.fill).toBe(true);
    expect(s.d).toContain('Z');
    expect(s.d).not.toContain(' C ');
    expect(s.head).toBeUndefined();
  });

  it('draws nothing for an unlaid-out element', () => {
    expect(strokeFor('circle', rect(0, 0, 0, 0), rect(0, 0, 400, 300))).toBeNull();
  });

  it('a lasso around a wide flat strip degrades to an underline — never a giant ellipse', () => {
    // a full-width row: circling it would draw a squashed card-wide loop
    const s = strokeFor('circle', rect(10, 100, 360, 24), rect(0, 0, 400, 300), 'seed')!;
    expect(s.kind).toBe('underline');
    const pts = coords(s.d);
    for (const p of pts) expect(p.y).toBeGreaterThan(100 + 24 - 1);
  });

  it('a long label keeps its lasso — flatness alone must not demote a circle', () => {
    // The regression the `&&` exists for: a mark resolves to its text's CHARACTER RANGE, one line
    // box tall, so a name like "Bixby Creek Bridge" is ~100x18 — aspect 5.6. Under the old `||`
    // that tripped the flatness half and silently underlined it, while "Medicare" kept its loop.
    // It occupies a quarter of the card, so it is not a row and must still be encircled.
    const host = rect(0, 0, 400, 300);
    const m = rect(30, 100, 100, 18);
    const s = strokeFor('circle', m, host, 'seed')!;
    expect(s.kind).toBe('circle');
    const pts = coords(s.d);
    // A lasso surrounds; an underline would sit entirely below the target.
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(m.top);
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(m.top + m.height);
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThan(m.left);
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(m.left + m.width);
  });

  it('a long line of text is a row and still underlines, even in a roomy card', () => {
    // The other side of the recalibration, caught in the browser: a 36-character heading at aspect
    // 20 takes only a third of a wide card, so a width-share test alone would lasso a whole line of
    // prose. Flat AND long is a row wherever it sits.
    const s = strokeFor('circle', rect(20, 100, 300, 15), rect(0, 0, 900, 300), 'seed')!;
    expect(s.kind).toBe('underline');
  });

  it('a wide-but-tall target keeps its lasso — width alone must not demote a circle either', () => {
    // The other half of the `&&`: a chart/figure spanning most of the card but 120px tall is a
    // graphic to loop, not a row to underline.
    const s = strokeFor('circle', rect(20, 40, 300, 120), rect(0, 0, 400, 300), 'seed')!;
    expect(s.kind).toBe('circle');
  });

  it('a lasso on a target hard against the card edge still encircles it (overflow clip keeps it on-card)', () => {
    // A datum pinned to the right edge: the loop must still SURROUND it (accuracy), only extending
    // a hair past the card edge — the .ink-layer overflow:hidden trims that sliver so it never
    // loops onto the neighbouring card. So: encircles, and never balloons far past the edge.
    const host = rect(0, 0, 320, 200);
    const m = rect(296, 92, 18, 16);
    const s = strokeFor('circle', m, host, 'seed')!;
    expect(s.kind).toBe('circle');
    const xs = coords(s.d).map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(m.left);
    expect(Math.max(...xs)).toBeGreaterThan(m.left + m.width);
    expect(Math.max(...xs)).toBeLessThan(host.width + 14); // a sliver past the edge, not a balloon
  });

  it('a lasso around a tall narrow target still fully encloses it, even past the ballooning cap', () => {
    // A target taller than the cap (host.height * 0.42) but not wide/flat enough to trip the
    // underline degrade above — the loop's cap on padding must never shrink the loop below the
    // target's own extent.
    const host = rect(0, 0, 300, 200);
    const m = rect(140, 10, 20, 180);
    const s = strokeFor('circle', m, host, 'seed')!;
    expect(s.kind).toBe('circle');
    const ys = coords(s.d).map((p) => p.y);
    expect(Math.min(...ys)).toBeLessThan(m.top);
    expect(Math.max(...ys)).toBeGreaterThan(m.top + m.height);
  });

  it('a highlight hugs its text box — only a hair of overhang, never a fat band over neighbours', () => {
    const m = rect(60, 40, 100, 24);
    const s = strokeFor('highlight', m, rect(0, 0, 400, 200), 'seed')!;
    const xs = coords(s.d).map((p) => p.x);
    const ys = coords(s.d).map((p) => p.y);
    // overhang past each edge stays within a few px (pad + corner wobble), not the old 5–7px band
    expect(Math.min(...xs)).toBeGreaterThan(m.left - 5);
    expect(Math.max(...xs)).toBeLessThan(m.left + m.width + 5);
    expect(Math.min(...ys)).toBeGreaterThan(m.top - 4);
    expect(Math.max(...ys)).toBeLessThan(m.top + m.height + 4);
  });

  it('connect spans two rects with NO host clamping — unlike every other gesture', () => {
    // A shared "card-grid" frame far larger than either card, and two targets much farther
    // apart than circle's 0.42×host cap would ever allow — connect must not shrink to fit.
    const grid = rect(0, 0, 1600, 3000);
    const near = rect(80, 60, 60, 20);
    const far = rect(1400, 2400, 60, 20);
    const s = strokeFor('connect', near, grid, 'seed', { to: far })!;
    expect(s.kind).toBe('connect');
    const pts = coords(s.d);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    // The stroke actually reaches toward the far card, not just a few px off `near`.
    expect(Math.max(...xs)).toBeGreaterThan(1000);
    expect(Math.max(...ys)).toBeGreaterThan(2000);
    expect(s.head).toBeTruthy();
  });

  it("connect pulls back from both boxes' edges — it points at them, never covers them", () => {
    const grid = rect(0, 0, 800, 800);
    const a = rect(100, 100, 80, 30);
    const b = rect(500, 100, 80, 30);
    const s = strokeFor('connect', a, grid, 'seed', { to: b })!;
    const pts = coords(s.d);
    const first = pts[0];
    const last = pts[pts.length - 1];
    // Tail starts at/past a's right edge (a.left+a.width=180), never inside the box.
    expect(first.x).toBeGreaterThanOrEqual(a.left + a.width - 1);
    // Tip stops short of b's left edge (b.left=500), never reaching its center.
    expect(last.x).toBeLessThanOrEqual(b.left + 1);
  });

  it('connect returns null without a resolved far end — never a lone circle standing in for it', () => {
    const grid = rect(0, 0, 800, 800);
    expect(strokeFor('connect', rect(100, 100, 40, 20), grid, 'seed')).toBeNull();
  });
});

describe('data-mark stamps — components call out their own salient datum', () => {
  it('BarChart marks the hot bar, else the tallest', () => {
    const hot = render(
      <BarChart
        title="t"
        bars={[
          { label: 'a', value: 9 },
          { label: 'b', value: 2, hot: true },
        ]}
      />,
    );
    const marked = hot.container.querySelector('[data-mark="circle"]') as HTMLElement;
    expect(marked.textContent).toContain('2');

    const tallest = render(
      <BarChart
        title="t"
        bars={[
          { label: 'a', value: 9 },
          { label: 'b', value: 2 },
        ]}
      />,
    );
    expect(tallest.container.querySelector('[data-mark="circle"]')?.textContent).toContain('9');
  });

  it('KpiGrid underlines its lead stat only', () => {
    const { container } = render(
      <KpiGrid
        title="t"
        kpis={[
          { val: '42%', label: 'lead' },
          { val: '7', label: 'second' },
        ]}
      />,
    );
    const marks = container.querySelectorAll('[data-mark="underline"]');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('42%');
  });

  it('InsightCard underlines its headline stat', () => {
    const { container } = render(<InsightCard num="1" title="t" stat="$1.2M" summary="s" />);
    expect(container.querySelector('[data-mark="underline"]')?.textContent).toBe('$1.2M');
  });

  it('PieDonut circles its salient slice by its legend row, never the wedge path', () => {
    const { container } = render(
      <PieDonut
        title="t"
        slices={[
          { label: 'Gasoline', value: 45 },
          { label: 'Distillate Fuel', value: 29 },
          { label: 'Jet Fuel', value: 10 },
          { label: 'Other', value: 16 },
        ]}
      />,
    );
    // A wide wedge's own SVG path has a bounding box spanning most of the donut — circling that
    // loops the hole and neighbouring slices instead of the slice itself, so the mark must never
    // land on the arc.
    expect(container.querySelector('svg path[data-mark]')).toBeNull();
    const marked = container.querySelector('[data-mark="circle"]');
    expect(marked?.tagName).toBe('BUTTON');
    expect(marked?.textContent).toContain('Gasoline');
  });

  it('Sunburst circles its salient ring-1 arc by its legend row, never the wedge path', () => {
    const { container } = render(
      <Sunburst
        title="t"
        root={{
          label: 'Root',
          value: 100,
          children: [
            { label: 'Reading', value: 52 },
            { label: 'Verifying', value: 30 },
            { label: 'Writing', value: 18 },
          ],
        }}
      />,
    );
    expect(container.querySelector('svg path[data-mark]')).toBeNull();
    const marked = container.querySelector('[data-mark="circle"]');
    expect(marked?.tagName).toBe('BUTTON');
    expect(marked?.textContent).toContain('Reading');
  });
});

describe('AnnotationLayer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function host(spot: string, mark: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-spot-id', spot);
    const el = document.createElement('span');
    el.setAttribute('data-mark', mark);
    wrap.appendChild(el);
    document.body.appendChild(wrap);
    wrap.getBoundingClientRect = () => ({
      ...rect(0, 0, 400, 200),
      right: 400,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => '',
    });
    el.getBoundingClientRect = () => ({
      ...rect(40, 60, 80, 30),
      right: 120,
      bottom: 90,
      x: 40,
      y: 60,
      toJSON: () => '',
    });
    return wrap;
  }

  it('portals a stroke into the inked card after the settle delay', () => {
    const wrap = host('b1', 'circle');
    render(<AnnotationLayer spots={[{ spot: 'b1', generous: true }]} />);
    expect(wrap.querySelector('.ink-layer')).toBeNull();
    act(() => vi.advanceTimersByTime(700));
    const path = wrap.querySelector('.ink-stroke');
    expect(path).toBeTruthy();
    expect(path?.getAttribute('pathLength')).toBe('1');
  });

  // Placement re-runs on every measurement, and a measurement happens whenever the card moves —
  // which, mid-stream, is constantly. So the generous path's three passes (the line's figures, then
  // its names, then the labels the card itself renders) have to come off ONE read of the card's
  // text; they used to be a TreeWalker each, plus one more per echoed candidate.
  it('resolves a generous target with a single read of the card text per measurement', () => {
    const restore = mockRangeRects({ 'Order Book': domRect(20, 30, 60, 16) });
    const walker = vi.spyOn(document, 'createTreeWalker');
    // Only OUR walks: jsdom's own selector engine builds element walkers for `querySelector`.
    const textWalks = (): number =>
      walker.mock.calls.filter((c) => c[1] === NodeFilter.SHOW_TEXT).length;
    try {
      const wrap = document.createElement('div');
      wrap.setAttribute('data-spot-id', 'walks');
      const label = document.createElement('span');
      label.textContent = 'Order Book';
      wrap.appendChild(label);
      document.body.appendChild(wrap);
      wrap.getBoundingClientRect = () => domRect(0, 0, 400, 200);
      render(
        <AnnotationLayer
          spots={[
            {
              spot: 'walks',
              generous: true,
              // The figure ("42%") and the name ("Order Flow") are both absent from the card, so
              // all three passes run before the echoed label finally answers. No stamped
              // [data-mark] here either — that would short-circuit before the last two.
              line: 'The 42% share sits under Order Flow in the order book.',
            },
          ]}
        />,
      );
      // Two text walks per measurement, and only two: one read of the card's words for all three
      // said-target passes, one gather of its content boxes for clear space (a different question).
      act(() => vi.advanceTimersByTime(100)); // the first measurement
      expect(textWalks()).toBe(2);
      expect(wrap.querySelector('.ink-stroke')).toBeTruthy(); // it really did resolve the target
      act(() => vi.advanceTimersByTime(100)); // the read that confirms the geometry
      expect(textWalks()).toBe(4);
    } finally {
      walker.mockRestore();
      restore();
    }
  });

  it('a gesture needs a reason: without a model mark or generous mode, no ink', () => {
    const wrap = host('quiet', 'circle');
    render(<AnnotationLayer spots={[{ spot: 'quiet' }]} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(wrap.querySelector('.ink-layer')).toBeNull();
  });

  it("a model-marked stop draws on the named text — and drops the mark rather than guessing when it's missing", () => {
    const restore = mockRangeRects({ Seattle: domRect(20, 30, 60, 16) });
    try {
      // Named text present: the mark lands on it, resolved through the real said-text path
      // (findSaidMatch + saidRect), not any fallback.
      const wrap = host('m1', 'circle');
      const label = document.createElement('span');
      label.textContent = 'Seattle';
      wrap.appendChild(label);
      render(
        <AnnotationLayer spots={[{ spot: 'm1', mark: { kind: 'underline', at: 'Seattle' } }]} />,
      );
      act(() => vi.advanceTimersByTime(700));
      expect(wrap.querySelector('.ink-stroke')).toBeTruthy();

      // Named text missing (re-worded, split by streaming, or simply wrong): a mark only ever
      // attaches to text the model explicitly pointed at — it must drop rather than land on the
      // block's generic stamped node, which would draw on something the model never named.
      const wrap2 = host('m2', 'circle');
      render(
        <AnnotationLayer spots={[{ spot: 'm2', mark: { kind: 'circle', at: 'not on screen' } }]} />,
      );
      act(() => vi.advanceTimersByTime(700));
      expect(wrap2.querySelector('.ink-stroke')).toBeNull();
    } finally {
      restore();
    }
  });

  it('draws nothing on a card without a mark, and cleans up on unmount', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-spot-id', 'plain');
    document.body.appendChild(wrap);
    const a = render(<AnnotationLayer spots={[{ spot: 'plain', generous: true }]} />);
    act(() => vi.advanceTimersByTime(700));
    expect(wrap.querySelector('.ink-layer')).toBeNull();

    const marked = host('b2', 'underline');
    const b = render(<AnnotationLayer spots={[{ spot: 'b2', generous: true }]} />);
    act(() => vi.advanceTimersByTime(700));
    expect(marked.querySelector('.ink-layer')).toBeTruthy();
    b.unmount();
    expect(marked.querySelector('.ink-layer')).toBeNull();
    a.unmount();
  });

  it('a multi-step stop draws a numbered chip per mark, in order — a single mark draws none', () => {
    // Mark #2 resolves through the real said-text path (findSaidMatch + saidRect), same as
    // above — jsdom's Range never lays out on its own, so it needs the same Range stub.
    const restore = mockRangeRects({ Seattle: domRect(20, 30, 60, 16) });
    const wrap = host('seq', 'circle');
    const label = document.createElement('span');
    label.textContent = 'Seattle';
    wrap.appendChild(label);
    try {
      render(
        <AnnotationLayer
          spots={[
            { spot: 'seq', generous: true, stepNumber: 1 },
            { spot: 'seq', mark: { kind: 'underline', at: 'Seattle' }, stepNumber: 2 },
          ]}
        />,
      );
      act(() => vi.advanceTimersByTime(700));
      const nums = Array.from(wrap.querySelectorAll('.ink-step-num')).map((n) => n.textContent);
      expect(nums.sort()).toEqual(['1', '2']);

      const lone = host('solo', 'circle');
      render(<AnnotationLayer spots={[{ spot: 'solo', generous: true }]} />);
      act(() => vi.advanceTimersByTime(700));
      expect(lone.querySelector('.ink-step-num')).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('cross-card "connect" gesture', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function gridWith(
    spotA: string,
    spotB: string,
  ): { grid: HTMLElement; a: HTMLElement; b: HTMLElement } {
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    grid.getBoundingClientRect = () =>
      ({
        ...rect(0, 0, 1000, 2000),
        right: 1000,
        bottom: 2000,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;
    document.body.appendChild(grid);
    const a = document.createElement('div');
    a.setAttribute('data-spot-id', spotA);
    a.textContent = 'Seattle';
    grid.appendChild(a);
    const b = document.createElement('div');
    b.setAttribute('data-spot-id', spotB);
    b.textContent = 'Austin';
    grid.appendChild(b);
    return { grid, a, b };
  }

  it('resolves nothing without a .card-grid ancestor (e.g. Focus mode)', () => {
    const a = document.createElement('div');
    a.setAttribute('data-spot-id', 'a');
    a.textContent = 'Seattle';
    document.body.appendChild(a);
    const b = document.createElement('div');
    b.setAttribute('data-spot-id', 'b');
    b.textContent = 'Austin';
    document.body.appendChild(b);
    render(
      <AnnotationLayer
        spots={[{ spot: 'a', toSpot: 'b', mark: { kind: 'connect', at: 'Seattle', to: 'Austin' } }]}
      />,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(document.querySelector('.ink-connect-layer')).toBeNull();
  });

  it('resolves nothing when the target block is missing (merged away, or never rendered)', () => {
    const { grid } = gridWith('a', 'b');
    render(
      <AnnotationLayer
        spots={[
          { spot: 'a', toSpot: 'ghost', mark: { kind: 'connect', at: 'Seattle', to: 'Austin' } },
        ]}
      />,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(grid.querySelector('.ink-connect-layer')).toBeNull();
  });

  it('resolves nothing when the named text is missing from either card', () => {
    const { grid } = gridWith('a', 'b');
    render(
      <AnnotationLayer
        spots={[
          { spot: 'a', toSpot: 'b', mark: { kind: 'connect', at: 'not on screen', to: 'Austin' } },
        ]}
      />,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(grid.querySelector('.ink-connect-layer')).toBeNull();
  });

  it('draws a stroke into the shared .card-grid — not either card — once both ends resolve', () => {
    // jsdom's Range never lays out real geometry (see saidRect's own comment on this), so the
    // real DOM-measurement path is exercised here by giving Range a controlled measurement,
    // exactly the way a real browser would report each card's own text.
    const origBCR = Range.prototype.getBoundingClientRect;
    const origRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function () {
      return [] as unknown as DOMRectList;
    };
    Range.prototype.getBoundingClientRect = function (this: Range) {
      const text = this.startContainer.textContent ?? '';
      if (text.includes('Seattle'))
        return {
          ...rect(50, 50, 60, 16),
          right: 110,
          bottom: 66,
          x: 50,
          y: 50,
          toJSON: () => '',
        } as DOMRect;
      if (text.includes('Austin'))
        return {
          ...rect(700, 900, 60, 16),
          right: 760,
          bottom: 916,
          x: 700,
          y: 900,
          toJSON: () => '',
        } as DOMRect;
      return { ...rect(0, 0, 0, 0), right: 0, bottom: 0, x: 0, y: 0, toJSON: () => '' } as DOMRect;
    };
    try {
      const { grid, a, b } = gridWith('a', 'b');
      render(
        <AnnotationLayer
          spots={[
            { spot: 'a', toSpot: 'b', mark: { kind: 'connect', at: 'Seattle', to: 'Austin' } },
          ]}
        />,
      );
      act(() => vi.advanceTimersByTime(700));
      const svg = grid.querySelector('.ink-connect-layer');
      expect(svg).toBeTruthy();
      // Portals into the shared grid, not either individual card.
      expect(a.querySelector('.ink-connect-layer')).toBeNull();
      expect(b.querySelector('.ink-connect-layer')).toBeNull();
      expect(svg?.querySelector('.ink-stroke')).toBeTruthy();
      expect(svg?.querySelector('.ink-stroke.ink-head')).toBeTruthy();
    } finally {
      Range.prototype.getBoundingClientRect = origBCR;
      Range.prototype.getClientRects = origRects;
    }
  });
});

// The gesture track is a record of what Mavéa DREW. A request whose target never resolves draws
// nothing, so it must never be advertised as a mark the reader can go and look at.
describe('AnnotationLayer — reporting what actually landed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function markedHost(spot: string, mark: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-spot-id', spot);
    const el = document.createElement('span');
    el.setAttribute('data-mark', mark);
    wrap.appendChild(el);
    document.body.appendChild(wrap);
    wrap.getBoundingClientRect = () => domRect(0, 0, 400, 200);
    el.getBoundingClientRect = () => domRect(40, 60, 80, 30);
    return wrap;
  }

  function bareHost(spot: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-spot-id', spot);
    wrap.textContent = 'nothing the line names';
    document.body.appendChild(wrap);
    wrap.getBoundingClientRect = () => domRect(0, 0, 400, 200);
    return wrap;
  }

  it('reports a mark that lands and stays silent for one that resolves to nothing', () => {
    const drew = markedHost('drew', 'circle');
    const missed = bareHost('missed');
    const placed: string[] = [];

    render(
      <AnnotationLayer
        spots={[
          { spot: 'drew', generous: true },
          { spot: 'missed', line: 'This loop settles overnight.', generous: true },
        ]}
        onPlaced={(request) => placed.push(request.spot)}
      />,
    );
    act(() => vi.advanceTimersByTime(2000));

    expect(drew.querySelector('.ink-stroke')).toBeTruthy();
    expect(missed.querySelector('.ink-layer')).toBeNull();
    expect(placed).toEqual(['drew']);
  });

  it('reports each landing only once, however often it re-renders', () => {
    markedHost('drew', 'circle');
    const placed: string[] = [];
    const view = render(
      <AnnotationLayer
        spots={[{ spot: 'drew', generous: true }]}
        onPlaced={(request) => placed.push(request.spot)}
      />,
    );
    act(() => vi.advanceTimersByTime(2000));
    view.rerender(
      <AnnotationLayer
        spots={[{ spot: 'drew', generous: true }]}
        onPlaced={(request) => placed.push(request.spot)}
      />,
    );
    act(() => vi.advanceTimersByTime(2000));

    expect(placed).toEqual(['drew']);
  });
});
