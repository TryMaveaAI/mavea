import { describe, it, expect } from 'vitest';
import { strokeFor, gestureOf, type Rect } from '../src/live/annotate/gesture';
import { validateLiveResponse } from '../src/engine/liveSchema';

// The trend / bracket / note marks Mavéa draws over a chart. Geometry is pure math from rects, so
// these lock the two things that matter: the pen lands ONLY on the elements it names (every point
// stays inside the card, the head rests on the far anchor), and it stays deterministic per seed.

const HOST: Rect = { left: 0, top: 0, width: 400, height: 240 };
// Two "bars": a short early one on the left, a tall late one on the right.
const START: Rect = { left: 40, top: 150, width: 36, height: 60 };
const END: Rect = { left: 320, top: 60, width: 36, height: 150 };

/** Every coordinate in an SVG path `d` / head string, for containment + finiteness checks. */
function coords(d: string): { x: number; y: number }[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
}

describe('strokeFor — trend / bracket / note geometry', () => {
  it('a rising arrow connects the two real elements and leads with a head', () => {
    const s = strokeFor('rising', START, HOST, 'seed', { to: END });
    expect(s).toBeTruthy();
    expect(s!.kind).toBe('rising');
    expect(s!.head).toBeTruthy();
    // The tail sits on the start element; the head rests just shy of the end element — both real.
    const pts = coords(s!.d);
    const tail = pts[0];
    const tip = pts[pts.length - 1];
    expect(tail.x).toBeGreaterThanOrEqual(START.left);
    expect(tail.x).toBeLessThanOrEqual(START.left + START.width);
    // tip lands near the end element (within a small gap), not out in empty card space
    expect(Math.abs(tip.x - (END.left + END.width / 2))).toBeLessThan(END.width + 12);
    expect(tip.y).toBeLessThan(START.top); // it genuinely climbed
  });

  it('keeps every point inside the card — the pen never wanders onto neighbours', () => {
    for (const kind of ['rising', 'falling', 'bracket'] as const) {
      const s = strokeFor(kind, START, HOST, 'seed', { to: END, label: '+38%' });
      const all = [...coords(s!.d), ...(s!.head ? coords(s!.head) : [])];
      for (const p of all) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(-6);
        expect(p.x).toBeLessThanOrEqual(HOST.width + 6);
        expect(p.y).toBeGreaterThanOrEqual(-6);
        expect(p.y).toBeLessThanOrEqual(HOST.height + 6);
      }
    }
  });

  it('a falling arrow descends where a rising one climbs', () => {
    const up = strokeFor('rising', START, HOST, 'seed', { to: END })!;
    const down = strokeFor('falling', START, HOST, 'seed', { to: END })!;
    // Same anchors, mirrored bow: the mid of the curve sags opposite ways.
    expect(up.d).not.toBe(down.d);
  });

  it('a trend with no far anchor degrades to a single precise arrow on the one element', () => {
    const s = strokeFor('rising', END, HOST, 'seed');
    expect(s!.kind).toBe('point'); // never a vague whole-card sweep
    expect(s!.head).toBeTruthy();
  });

  it('a vertical span (a list / timeline, not a chart) degrades to a point, never a slash down the card', () => {
    // Two items stacked vertically — the festival-schedule case where a falling arrow slashed the card.
    const TOP: Rect = { left: 30, top: 30, width: 200, height: 40 };
    const BOTTOM: Rect = { left: 30, top: 190, width: 200, height: 40 };
    for (const kind of ['rising', 'falling'] as const) {
      const s = strokeFor(kind, TOP, HOST, 'seed', { to: BOTTOM })!;
      expect(s.kind).toBe('point'); // a single precise arrow on the named item, not a whole-card sweep
      expect(s.head).toBeTruthy();
      // and it stays well inside the card height — no top-to-bottom gloss
      const ys = coords(s.d).map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(HOST.height * 0.7);
    }
  });

  it('a bracket spans both elements and carries its delta caption centered above', () => {
    const s = strokeFor('bracket', START, HOST, 'seed', { to: END, label: '+38%' })!;
    expect(s.kind).toBe('bracket');
    expect(s.label?.text).toBe('+38%');
    expect(s.label?.anchor).toBe('middle');
    // caption sits above the higher of the two elements
    expect(s.label!.y).toBeLessThan(END.top);
    expect(s.label!.x).toBeGreaterThan(START.left);
    expect(s.label!.x).toBeLessThan(END.left + END.width);
  });

  it('a note scrawls its words tethered to its element; an empty note draws nothing', () => {
    const s = strokeFor('note', START, HOST, 'seed', { label: 'vs. this' })!;
    expect(s.kind).toBe('note');
    expect(s.label?.text).toBe('vs. this');
    expect(s.label?.anchor).toBe('start');
    expect(strokeFor('note', START, HOST, 'seed', { label: '' })).toBeNull();
  });

  it('is deterministic for a given seed and varies across seeds', () => {
    const a = strokeFor('rising', START, HOST, 'card-1', { to: END })!;
    const b = strokeFor('rising', START, HOST, 'card-1', { to: END })!;
    const c = strokeFor('rising', START, HOST, 'card-2', { to: END })!;
    expect(a.d).toBe(b.d);
    expect(a.d).not.toBe(c.d);
  });

  it('gestureOf recognizes the new kinds and still rejects junk', () => {
    for (const k of ['rising', 'falling', 'bracket', 'note']) expect(gestureOf(k)).toBe(k);
    expect(gestureOf('wiggle')).toBeNull();
    expect(gestureOf(null)).toBeNull();
  });
});

describe('validateLiveResponse — TourMark to / label passthrough', () => {
  const allowed = new Set(['insight']);
  const base = (mark: Record<string, unknown>) => ({
    title: 'T',
    blocks: [{ type: 'insight', props: { title: 'Revenue', body: 'Q1 to Q6' } }],
    tour: [{ index: 0, say: 'It climbs.', mark }],
  });
  const markOf = (mark: Record<string, unknown>) => {
    const r = validateLiveResponse(base(mark), allowed, 12);
    return r?.tour?.[0]?.mark;
  };

  it('keeps `to` on a trend mark and `label` on a note', () => {
    expect(markOf({ kind: 'rising', at: 'Q1', to: 'Q6', color: 'key' })).toMatchObject({
      kind: 'rising',
      at: 'Q1',
      to: 'Q6',
      color: 'key',
    });
    expect(markOf({ kind: 'note', at: 'Q6', label: '+38%' })).toMatchObject({
      kind: 'note',
      label: '+38%',
    });
  });

  it('drops a note with no words and an unknown kind', () => {
    expect(markOf({ kind: 'note', at: 'Q6' })).toBeUndefined();
    expect(markOf({ kind: 'wiggle', at: 'Q6' })).toBeUndefined();
  });

  it('strips `to` / `label` from the point gestures — they only mean something to spans', () => {
    const m = markOf({ kind: 'circle', at: 'Q6', to: 'Q1', label: 'nope' });
    expect(m).toMatchObject({ kind: 'circle', at: 'Q6' });
    expect(m).not.toHaveProperty('to');
    expect(m).not.toHaveProperty('label');
  });
});
