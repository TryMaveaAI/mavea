import { describe, it, expect } from 'vitest';
import { revealInkPlan, type RevealStop } from '../src/live/mutedReveal';
import { strokeFor, type Rect } from '../src/live/annotate/gesture';
import type { TourMark } from '../src/engine/liveSchema';

// A muted turn skips the walk entirely: everything it would have said and drawn lands in one
// pass instead. These lock the pure pieces that remain: the delivery plan (which stops get
// margin notes, how marks stagger) and multi-line note-mark geometry staying inside its card.

const CIRCLE: TourMark = { kind: 'circle', at: 'x' };

describe('revealInkPlan — a muted turn delivers every stop at once', () => {
  const stops: RevealStop[] = [
    { spot: 'a', line: 'Opening line.' },
    { spot: 'b', line: 'Second stop, worth a note.' },
    { spot: 'c', line: 'Third stop.' },
  ];

  it('never notes stop 0 — it is the opener, already in the answer hero', () => {
    const plan = revealInkPlan({
      stops,
      spokenWalk: true,
      withNotes: true,
      teach: false,
      marksById: new Map(),
    });
    expect(plan.some((c) => c.spot === 'a' && c.noteText)).toBe(false);
    expect(plan.some((c) => c.spot === 'b' && c.noteText)).toBe(true);
  });

  it('writes no notes when withNotes is false (a mid-walk mute flush)', () => {
    const plan = revealInkPlan({
      stops,
      spokenWalk: true,
      withNotes: false,
      teach: false,
      marksById: new Map(),
    });
    expect(plan.some((c) => c.noteText)).toBe(false);
  });

  it('writes no notes for the silent derived walk (spokenWalk false)', () => {
    const plan = revealInkPlan({
      stops,
      spokenWalk: false,
      withNotes: true,
      teach: false,
      marksById: new Map(),
    });
    expect(plan.some((c) => c.noteText)).toBe(false);
  });

  it('from skips already-walked stops', () => {
    const plan = revealInkPlan({
      stops,
      from: 2,
      spokenWalk: true,
      withNotes: true,
      teach: false,
      marksById: new Map(),
    });
    expect(plan.every((c) => c.spot === 'c')).toBe(true);
  });

  it('stages every mark across every stop with a bounded, increasing delay', () => {
    const marksById = new Map<string, TourMark[]>([
      ['a', [CIRCLE]],
      ['b', [CIRCLE, { kind: 'underline', at: 'y' }]],
      ['c', [CIRCLE]],
    ]);
    const plan = revealInkPlan({
      stops,
      spokenWalk: true,
      withNotes: false,
      teach: false,
      marksById,
    });
    const marks = plan.filter((c) => c.mark);
    expect(marks).toHaveLength(4);
    const delays = marks.map((c) => c.delayMs ?? 0);
    expect(delays).toEqual([...delays].sort((x, y) => x - y));
    expect(new Set(delays).size).toBe(delays.length);
    expect(Math.max(...delays)).toBeLessThan(1500);
    // A lone mark carries no step number; a stop with 2+ marks numbers them in order.
    expect(marks.find((c) => c.spot === 'a')?.stepNumber).toBeUndefined();
    expect(marks.filter((c) => c.spot === 'b').map((c) => c.stepNumber)).toEqual([1, 2]);
  });

  it('falls back to a generous stroke on a mark-less stop only in teach mode', () => {
    const plan = revealInkPlan({
      stops: [{ spot: 'a', line: 'x' }],
      spokenWalk: false,
      withNotes: false,
      teach: true,
      marksById: new Map(),
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].generous).toBe(true);
    expect(plan[0].mark).toBeUndefined();
  });
});

describe('note geometry — a wrapped multi-line aside stays inside its card', () => {
  const HOST: Rect = { left: 0, top: 0, width: 400, height: 240 };
  const TARGET: Rect = { left: 60, top: 190, width: 80, height: 30 };

  it('clamps a tall note up so its last line is still on-card', () => {
    const text = ['Rent eats a big share', 'of the take-home pay', 'in this scenario.'].join('\n');
    const s = strokeFor('note', TARGET, HOST, 'seed', { label: text });
    expect(s).toBeTruthy();
    expect(s!.label).toBeTruthy();
    const lines = s!.label!.text.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    // The whole wrapped block fits vertically: first line's baseline plus the rows below.
    const lastBaseline = s!.label!.y + (lines.length - 1) * 17;
    expect(lastBaseline).toBeLessThanOrEqual(HOST.height - 8);
    expect(s!.label!.y).toBeGreaterThanOrEqual(14);
  });

  it('sizes placement off the longest wrapped line, not the total text', () => {
    // Near the right edge: a wrapped note must still park fully on-card.
    const nearRight: Rect = { left: 330, top: 100, width: 50, height: 20 };
    const text = ['short', 'a considerably longer row'].join('\n');
    const s = strokeFor('note', nearRight, HOST, 'seed', { label: text });
    expect(s).toBeTruthy();
    const longest = 'a considerably longer row'.length * 7.2 + 10;
    expect(s!.label!.x + longest).toBeLessThanOrEqual(HOST.width);
  });
});
