// The judgment-ink vocabulary: strike / question / star / check / frame / brace geometry, the
// multi-line highlight, and the clear-space guard that keeps written words off the card's own
// content. Geometry is pure math (stubbed rects); the AnnotationLayer cases stub Range layout
// the same way live-annotate.test.tsx does, since jsdom never lays anything out itself.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  gestureOf,
  labelPlacements,
  strokeFor,
  tetherStroke,
  type Rect,
} from '../src/live/annotate/gesture';
import { firstClearPlace, intersects } from '../src/live/annotate/clearSpace';
import { AnnotationLayer } from '../src/live/annotate/AnnotationLayer';

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
});

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

/** All coordinate pairs in a path string, for behavioral assertions. */
function coords(d: string): { x: number; y: number }[] {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
}

const HOST = rect(0, 0, 400, 300);

describe('strike — the hand rejects', () => {
  it('scrubs back and forth through the middle of a text run, spanning its width', () => {
    const m = rect(150, 140, 90, 20);
    const s = strokeFor('strike', m, HOST, 'seed')!;
    expect(s.kind).toBe('strike');
    expect(s.head).toBeUndefined();
    const pts = coords(s.d);
    const yMid = m.top + m.height / 2;
    // Every point rides the middle band — never the underline zone, never above the words.
    for (const p of pts) {
      expect(p.y).toBeGreaterThan(yMid - 9);
      expect(p.y).toBeLessThan(yMid + 11);
    }
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThanOrEqual(m.left);
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThanOrEqual(m.left + m.width);
    // The double pass: x runs out, then back.
    const xs = pts.map((p) => p.x);
    const turn = xs.indexOf(Math.max(...xs));
    expect(turn).toBeGreaterThan(0);
    expect(turn).toBeLessThan(xs.length - 1);
  });

  it('a tall block target gets an X — two diagonals, the second on the head timing', () => {
    const m = rect(150, 100, 30, 120);
    const s = strokeFor('strike', m, HOST, 'seed')!;
    expect(s.head).toBeTruthy();
    const main = coords(s.d);
    const cross = coords(s.head!);
    // Main runs TL→BR, cross runs TR→BL.
    expect(main[0].x).toBeLessThan(main[main.length - 1].x);
    expect(main[0].y).toBeLessThan(main[main.length - 1].y);
    expect(cross[0].x).toBeGreaterThan(cross[cross.length - 1].x);
    expect(cross[0].y).toBeLessThan(cross[cross.length - 1].y);
  });
});

describe('check / star / frame — confirmation, the takeaway, the box', () => {
  it('the check ticks in the left margin when there is one, tip flicking above the valley', () => {
    const m = rect(150, 140, 60, 20);
    const s = strokeFor('check', m, HOST, 'seed')!;
    const pts = coords(s.d);
    expect(Math.max(...pts.map((p) => p.x))).toBeLessThan(m.left);
    const valley = pts.reduce((a, b) => (a.y > b.y ? a : b));
    const tip = pts[pts.length - 1];
    expect(tip.y).toBeLessThan(valley.y);
  });

  it('a check against the card edge moves to the right of the item instead', () => {
    const m = rect(8, 140, 60, 20);
    const s = strokeFor('check', m, HOST, 'seed')!;
    const pts = coords(s.d);
    expect(Math.min(...pts.map((p) => p.x))).toBeGreaterThan(m.left + m.width);
  });

  it('the star is straight strokes in pentagram order, parked up-left, never a spline flower', () => {
    const m = rect(150, 140, 60, 20);
    const s = strokeFor('star', m, HOST, 'seed')!;
    expect(s.d).not.toContain(' C ');
    const pts = coords(s.d);
    expect(pts.length).toBeGreaterThanOrEqual(7); // 6 vertices + the overshoot
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    expect(cx).toBeLessThan(m.left);
    expect(cy).toBeLessThan(m.top);
    // Deterministic per seed, distinct across seeds.
    expect(strokeFor('star', m, HOST, 'seed')!.d).toBe(s.d);
    expect(strokeFor('star', m, HOST, 'other')!.d).not.toBe(s.d);
  });

  it('the frame boxes the target with straight wobbled segments — corners stay corners', () => {
    const m = rect(150, 140, 90, 26);
    const s = strokeFor('frame', m, HOST, 'seed')!;
    expect(s.d).not.toContain(' C ');
    expect(s.fill).toBeUndefined();
    const pts = coords(s.d);
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThan(m.left);
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(m.left + m.width);
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(m.top);
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(m.top + m.height);
  });
});

describe('brace — grouping adjacent rows', () => {
  it('spans from the first row to the last with a cusp, label hanging off it', () => {
    const first = rect(60, 100, 200, 18);
    const last = rect(60, 160, 200, 18);
    const s = strokeFor('brace', first, HOST, 'seed', { to: last, label: 'fixed costs' })!;
    expect(s.kind).toBe('brace');
    const pts = coords(s.d);
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThanOrEqual(first.top);
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThanOrEqual(last.top + last.height);
    // Sits in the left margin of the rows, cusp pointing away from them.
    expect(Math.max(...pts.map((p) => p.x))).toBeLessThan(first.left);
    expect(s.label?.text).toBe('fixed costs');
  });

  it('returns null without a far row, and for a span too short to read as a group', () => {
    const one = rect(60, 100, 200, 18);
    expect(strokeFor('brace', one, HOST, 'seed')).toBeNull();
    expect(strokeFor('brace', one, HOST, 'seed', { to: rect(60, 104, 200, 10) })).toBeNull();
  });
});

describe('question — the pen doubts its own number', () => {
  it('is a hand-font "?" glyph with a tether, never drawn spline geometry', () => {
    const m = rect(150, 140, 60, 20);
    const s = strokeFor('question', m, HOST, 'seed')!;
    expect(s.kind).toBe('question');
    expect(s.label?.text).toBe('?');
    expect(s.d).toBeTruthy(); // the tether
  });

  it('honors a pre-cleared placement from the clear-space check', () => {
    const m = rect(150, 140, 60, 20);
    const right = strokeFor('question', m, HOST, 'seed', { place: 'right' })!;
    const left = strokeFor('question', m, HOST, 'seed', { place: 'left' })!;
    expect(right.label!.x).toBeGreaterThan(m.left + m.width);
    expect(left.label!.x).toBeLessThan(m.left);
  });
});

describe('multi-line highlight — the marker re-touches each wrapped line', () => {
  it('paints one closed band per line box', () => {
    const rows = [rect(60, 40, 200, 18), rect(20, 60, 140, 18)];
    const s = strokeFor('highlight', rows[0], HOST, 'seed', { rects: rows })!;
    expect(s.fill).toBe(true);
    expect((s.d.match(/Z/g) ?? []).length).toBe(2);
  });
});

describe('the stamped-fallback vocabulary never judges', () => {
  it('gestureOf rejects every judgment kind — components may point, never claim', () => {
    for (const kind of ['strike', 'question', 'star', 'check', 'frame', 'brace']) {
      expect(gestureOf(kind)).toBeNull();
    }
  });
});

describe('clear space — written words find empty card space or stay unwritten', () => {
  it('intersects respects the pad that keeps labels from kissing text', () => {
    const a = rect(0, 0, 10, 10);
    const b = rect(12, 0, 10, 10);
    expect(intersects(a, b, 0)).toBe(false);
    expect(intersects(a, b, 3)).toBe(true);
  });

  it('firstClearPlace picks the first clean candidate and null when everything collides', () => {
    const cands = [
      { place: 'right' as const, box: rect(100, 0, 40, 20) },
      { place: 'below' as const, box: rect(0, 100, 40, 20) },
    ];
    expect(firstClearPlace(cands, [rect(90, 0, 60, 20)])).toBe('below');
    expect(firstClearPlace(cands, [])).toBe('right');
    expect(firstClearPlace(cands, [rect(90, 0, 60, 20), rect(0, 95, 200, 40)])).toBeNull();
  });

  it('labelPlacements orders note candidates right → below → above and sizes off the words', () => {
    const m = rect(150, 140, 60, 20);
    const cands = labelPlacements('note', m, HOST, 'vs. last year');
    expect(cands.map((c) => c.place)).toEqual(['right', 'below', 'above']);
    for (const c of cands) expect(c.box.width).toBeGreaterThan('vs. last year'.length * 6);
  });

  it('a bracket label has exactly one candidate — above its own bar — or none near the top edge', () => {
    const m = rect(150, 140, 60, 20);
    expect(labelPlacements('bracket', m, HOST, '+38%').map((c) => c.place)).toEqual(['above']);
    expect(labelPlacements('bracket', rect(150, 4, 60, 20), HOST, '+38%')).toHaveLength(0);
  });
});

describe('tether — the margin note connector shares the pen hand', () => {
  it('is deterministic per seed with an arrowhead at the far end', () => {
    const a = tetherStroke({ x: 0, y: 0 }, { x: 100, y: 50 }, 'card-1');
    const b = tetherStroke({ x: 0, y: 0 }, { x: 100, y: 50 }, 'card-1');
    const c = tetherStroke({ x: 0, y: 0 }, { x: 100, y: 50 }, 'card-2');
    expect(a.d).toBe(b.d);
    expect(a.d).not.toBe(c.d);
    const head = coords(a.head);
    expect(head[1].x).toBeCloseTo(100, 0);
    expect(head[1].y).toBeCloseTo(50, 0);
  });
});

describe('AnnotationLayer — the guard in the real measurement path', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  /** A laid-out card whose text 'Seattle' measures at a fixed spot. `denseRows` adds text
   *  nodes whose (stubbed) line boxes blanket every label candidate around the target. */
  function cardWith(spot: string, denseRows: boolean): HTMLElement {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-spot-id', spot);
    const label = document.createElement('span');
    label.textContent = 'Seattle';
    wrap.appendChild(label);
    if (denseRows) {
      const filler = document.createElement('p');
      filler.textContent = 'occupied-everywhere';
      wrap.appendChild(filler);
    }
    document.body.appendChild(wrap);
    wrap.getBoundingClientRect = () => domRect(0, 0, 400, 200);
    Object.defineProperty(wrap, 'offsetWidth', { value: 400 });
    Object.defineProperty(wrap, 'offsetHeight', { value: 200 });
    return wrap;
  }

  /** Range layout stub: the measured target ('Seattle') reports a fixed box via the
   *  getBoundingClientRect fallback; the dense filler reports client rects that blanket the
   *  card, so every label candidate collides. */
  function stubRanges(): () => void {
    const origRects = Range.prototype.getClientRects;
    const origBCR = Range.prototype.getBoundingClientRect;
    Range.prototype.getClientRects = function (this: Range) {
      const text = this.toString();
      const rows = text.includes('occupied-everywhere')
        ? [domRect(0, 0, 400, 90), domRect(0, 90, 400, 110)]
        : [];
      return rows as unknown as DOMRectList;
    };
    Range.prototype.getBoundingClientRect = function (this: Range) {
      return this.toString().includes('Seattle') ? domRect(150, 100, 60, 16) : domRect(0, 0, 0, 0);
    };
    return () => {
      Range.prototype.getClientRects = origRects;
      Range.prototype.getBoundingClientRect = origBCR;
    };
  }

  it('a note writes its words when the card has clear space', () => {
    const restore = stubRanges();
    try {
      const wrap = cardWith('n1', false);
      render(
        <AnnotationLayer
          spots={[{ spot: 'n1', mark: { kind: 'note', at: 'Seattle', label: 'the leader' } }]}
        />,
      );
      act(() => vi.advanceTimersByTime(700));
      expect(wrap.querySelector('.ink-note')?.textContent).toBe('the leader');
    } finally {
      restore();
    }
  });

  it('a note on a card dense everywhere draws NOTHING — no space, no words, no orphan tether', () => {
    const restore = stubRanges();
    try {
      const wrap = cardWith('n2', true);
      render(
        <AnnotationLayer
          spots={[{ spot: 'n2', mark: { kind: 'note', at: 'Seattle', label: 'the leader' } }]}
        />,
      );
      act(() => vi.advanceTimersByTime(2000));
      expect(wrap.querySelector('.ink-layer')).toBeNull();
    } finally {
      restore();
    }
  });

  it('a bracket in the same squeeze keeps its stroke and drops only the words', () => {
    const restore = stubRanges();
    try {
      const wrap = cardWith('n3', true);
      render(
        <AnnotationLayer
          spots={[{ spot: 'n3', mark: { kind: 'bracket', at: 'Seattle', label: '+38%' } }]}
        />,
      );
      act(() => vi.advanceTimersByTime(700));
      expect(wrap.querySelector('.ink-stroke')).toBeTruthy();
      expect(wrap.querySelector('.ink-note')).toBeNull();
    } finally {
      restore();
    }
  });

  it('a step chip lands in clear space — and stays undrawn on a card dense everywhere', () => {
    const restore = stubRanges();
    try {
      // Clear card: the chip renders beside the target.
      const wrap = cardWith('c1', false);
      render(
        <AnnotationLayer
          spots={[{ spot: 'c1', mark: { kind: 'underline', at: 'Seattle' }, stepNumber: 1 }]}
        />,
      );
      act(() => vi.advanceTimersByTime(700));
      expect(wrap.querySelector('.ink-step-num')?.textContent).toBe('1');

      // Dense card: the stroke still draws, but no chip may park on the words.
      const dense = cardWith('c2', true);
      render(
        <AnnotationLayer
          spots={[{ spot: 'c2', mark: { kind: 'underline', at: 'Seattle' }, stepNumber: 2 }]}
        />,
      );
      act(() => vi.advanceTimersByTime(700));
      expect(dense.querySelector('.ink-stroke')).toBeTruthy();
      expect(dense.querySelector('.ink-step-num')).toBeNull();
    } finally {
      restore();
    }
  });

  it('an underline tucks tight when text sits directly beneath the target', () => {
    const m = rect(150, 140, 90, 20);
    const loose = strokeFor('underline', m, HOST, 'seed')!;
    const tight = strokeFor('underline', m, HOST, 'seed', { tight: true })!;
    const maxY = (d: string): number => Math.max(...coords(d).map((p) => p.y));
    // The tucked stroke hugs the target's own baseline instead of sagging into the row below.
    expect(maxY(tight.d)).toBeLessThan(maxY(loose.d) - 2);
    expect(maxY(tight.d)).toBeLessThanOrEqual(m.top + m.height + 3.2);
  });

  it("the question's ? renders as a glyph through the same guard", () => {
    const restore = stubRanges();
    try {
      const wrap = cardWith('q1', false);
      render(
        <AnnotationLayer spots={[{ spot: 'q1', mark: { kind: 'question', at: 'Seattle' } }]} />,
      );
      act(() => vi.advanceTimersByTime(700));
      const glyph = wrap.querySelector('.ink-note.ink-glyph');
      expect(glyph?.textContent).toBe('?');
    } finally {
      restore();
    }
  });
});
