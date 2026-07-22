import { describe, it, expect } from 'vitest';
import { penStrokes, type PenRect } from '../src/live/annotate/penStrokes';
import { claimExplain, inkForKind, INK_KEY } from '../src/live/prism/annotation/pen';
import type { Claim, ClaimKind, ClaimRole } from '../src/live/prism/types';

// The pen-gesture selection that Prism's live page and the reel finish BOTH run, so the exported clip
// draws the exact mark the reader saw. Pure geometry → these lock the gesture choice per located
// shape, finiteness/containment, and determinism per seed.

const W = 1000;
const H = 1400;

/** Every coordinate in an SVG path `d`, for finiteness + containment checks. */
function coords(d: string): { x: number; y: number }[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
}

const short: PenRect = { x: 120, y: 200, w: 80, h: 18 }; // a value: circled
const wide: PenRect = { x: 50, y: 400, w: 720, h: 16 }; // a full prose line: degrades to underline
const figure: PenRect = { x: 120, y: 600, w: 300, h: 200 };

describe('penStrokes', () => {
  it('lassoes a figure when the claim is a figure', () => {
    const s = penStrokes([], figure, true, W, H, 'd0c0');
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe('circle');
  });

  it('circles a single short value', () => {
    const s = penStrokes([short], undefined, false, W, H, 'd0c1');
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe('circle');
  });

  it('degrades a single wide line to an underline (strokeFor)', () => {
    const s = penStrokes([wide], undefined, false, W, H, 'd0c2');
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe('underline');
  });

  it('underlines a two-line quote in reading order', () => {
    const lines: PenRect[] = [
      { x: 60, y: 300, w: 400, h: 16 },
      { x: 60, y: 322, w: 380, h: 16 },
    ];
    const s = penStrokes(lines, undefined, false, W, H, 'd0c3');
    expect(s).toHaveLength(2);
    expect(s.every((k) => k.kind === 'underline')).toBe(true);
    // reading order: the second underline sits lower than the first.
    const ys = s.map((k) => Math.min(...coords(k.d).map((p) => p.y)));
    expect(ys[0]).toBeLessThan(ys[1]);
  });

  it('braces a passage of three or more lines — a reader groups, never piles underlines', () => {
    const lines: PenRect[] = [
      { x: 60, y: 300, w: 400, h: 16 },
      { x: 60, y: 322, w: 380, h: 16 },
      { x: 60, y: 344, w: 220, h: 16 },
    ];
    const s = penStrokes(lines, undefined, false, W, H, 'd0c3');
    expect(s).toHaveLength(1);
    expect(s[0].kind).toBe('brace');
    // The brace spans the whole passage vertically, in the left margin of the lines.
    const ys = coords(s[0].d).map((p) => p.y);
    expect(Math.min(...ys)).toBeLessThanOrEqual(300);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(360);
    expect(Math.max(...coords(s[0].d).map((p) => p.x))).toBeLessThan(60);
  });

  it('draws nothing when nothing is located (caption-only)', () => {
    expect(penStrokes([], undefined, false, W, H, 'd0c4')).toEqual([]);
  });

  it('keeps every coordinate finite and inside the page', () => {
    for (const s of penStrokes([wide, short], undefined, false, W, H, 'seed')) {
      for (const p of coords(s.d)) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(-2);
        expect(p.x).toBeLessThanOrEqual(W + 2);
        expect(p.y).toBeGreaterThanOrEqual(-2);
        expect(p.y).toBeLessThanOrEqual(H + 2);
      }
    }
  });

  it('is deterministic per seed', () => {
    const a = penStrokes([short], figure, false, W, H, 'same');
    const b = penStrokes([short], figure, false, W, H, 'same');
    const c = penStrokes([short], figure, false, W, H, 'other');
    expect(a.map((s) => s.d)).toEqual(b.map((s) => s.d));
    expect(a[0].d).not.toBe(c[0].d);
  });
});

function claim(role: ClaimRole, kind: ClaimKind): Claim {
  return {
    id: 'd0c0',
    kind,
    title: 'Net revenue rose 12%',
    ask: '?',
    role,
    region: 'Results',
    source: 0,
    quote: 'Revenue rose 12% to $4.2B',
    page: 3,
  };
}

describe('claimExplain', () => {
  it('reads the role and title into one line (no page reference — reel shows location visually)', () => {
    expect(claimExplain(claim('load-bearing', 'stat'))).toBe(
      'The document leans on this — Net revenue rose 12%',
    );
    expect(claimExplain(claim('supporting', 'finding'))).toBe(
      'Supporting evidence — Net revenue rose 12%',
    );
    expect(claimExplain(claim('context', 'definition'))).toBe('Context — Net revenue rose 12%');
  });

  it('contains no page reference', () => {
    expect(claimExplain(claim('load-bearing', 'stat'))).not.toMatch(/p\.\d|page \d/i);
  });
});

describe('ink colors', () => {
  it('is a concrete hex per kind (never a var(--…) token)', () => {
    const kinds: ClaimKind[] = [
      'forecast',
      'stat',
      'finding',
      'risk',
      'definition',
      'method',
      'diagram',
    ];
    for (const k of kinds) expect(inkForKind(k)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(INK_KEY).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
